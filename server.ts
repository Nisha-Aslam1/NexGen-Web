import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.ts';
import { Role } from './src/types.ts';
import {
  initMongo,
  getMongoStatus,
  testMongoConnection,
  isMongoConnected,
  reconnectMongo,
  getCurrentMongoUri,
  recordAnalyticsEvent,
  recordVisitorHeartbeat,
  getRealtimeInsights,
  AnalyticsRange,
  mongoSaveMedia,
  mongoGetMedia,
  mongoRestoreAllMediaToDisk
} from './server/mongo.ts';
import {
  getSiteBaseUrl,
  getRouteMetadata,
  generateSitemapXml,
  generateRobotsTxt,
  injectSeoIntoHtml
} from './server/seo.ts';

import { meetingsRouter } from './server/meetings.ts';
import {
  sendCouncilEmail,
  buildVolunteerApprovalEmail,
  sanitizeSenderName,
  isValidEmailAddress,
  isValidImageUrl
} from './server/email.ts';
import { handleSupportAiChat, SUPPORT_AI_MODEL } from './server/supportAi.ts';
// android download zip packaging handled dynamically or via prebuilt assets

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (
      req.headers['x-no-compression'] ||
      req.path.startsWith('/uploads/meetings/') ||
      req.path.includes('/captures/upload')
    ) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

function resolveSessionSecret(): string {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret && envSecret.length >= 24 && !envSecret.includes('nexgen_council_secure_session_secret')) {
    return envSecret;
  }
  const secretDir = path.join(process.cwd(), 'data');
  const secretFile = path.join(secretDir, '.session_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, 'utf-8').trim();
      if (saved.length >= 32) return saved;
    }
    if (!fs.existsSync(secretDir)) {
      fs.mkdirSync(secretDir, { recursive: true });
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(64).toString('hex');
  }
}

const SESSION_SECRET = resolveSessionSecret();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// In-memory revoked token JTIs (for instant logout invalidation)
const revokedTokenJtis = new Map<string, number>();

// Cleanup expired revoked JTIs periodically
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of revokedTokenJtis.entries()) {
    if (exp < now) revokedTokenJtis.delete(jti);
  }
}, 30 * 60 * 1000).unref();

// Helper: Extract client IP accurately behind Nginx / Cloudflare
function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isHttpsRequest(req: Request): boolean {
  const proto = (req.headers['x-forwarded-proto'] as string || '').split(',')[0].trim().toLowerCase();
  return req.secure || proto === 'https';
}

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  const reqHost = (req.headers['x-forwarded-host'] as string || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const isAiStudioOrLocal =
    !reqHost ||
    reqHost.includes('localhost') ||
    reqHost.includes('127.0.0.1') ||
    reqHost.endsWith('.run.app') ||
    process.env.NODE_ENV !== 'production';

  if (isAiStudioOrLocal) {
    // Permit AI Studio preview iframe while blocking arbitrary third-party framing
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.usercontent.goog"
    );
  } else {
    // Strict clickjacking protection on live custom production domain
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://nexgencouncil.bond https://www.nexgencouncil.bond"
    );
  }

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(self "https://meet.nexgencouncil.bond"), microphone=(self "https://meet.nexgencouncil.bond"), display-capture=(self "https://meet.nexgencouncil.bond"), geolocation=(), payment=()'
  );
  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith('/api/') || req.path === '/admin' || req.path.startsWith('/admin/') || req.path === '/admin-login') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

// General Sliding-Window API Rate Limiter
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const apiRateMap = new Map<string, RateLimitBucket>();

function rateLimit(maxRequests: number, windowMs: number, keyPrefix = 'api') {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = apiRateMap.get(key);

    if (!bucket || bucket.resetAt <= now) {
      apiRateMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
        retryAfterSeconds
      });
    }
    next();
  };
}

// Clean up stale rate-limit buckets every 10 mins
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of apiRateMap.entries()) {
    if (b.resetAt <= now) apiRateMap.delete(k);
  }
}, 10 * 60 * 1000).unref();

// Login Brute-Force Shield
interface BruteForceRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}
const loginAttempts = new Map<string, BruteForceRecord>();
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
let blockedAttemptsCount = 0;

function getBruteForceKeys(req: Request, username: string): string[] {
  const ip = getClientIp(req);
  const normUser = username.toLowerCase().trim();
  return [`ip:${ip}`, ...(normUser ? [`acct:${ip}:${normUser}`] : [])];
}

function checkLoginLockout(req: Request, username: string): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let maxLockedUntil = 0;
  for (const key of getBruteForceKeys(req, username)) {
    const rec = loginAttempts.get(key);
    if (rec && rec.lockedUntil > now) {
      maxLockedUntil = Math.max(maxLockedUntil, rec.lockedUntil);
    }
  }
  if (maxLockedUntil > now) {
    return { locked: true, retryAfterSeconds: Math.ceil((maxLockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

function recordLoginFailure(req: Request, username: string): { locked: boolean; attemptsRemaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  let lockedNow = false;
  let minRemaining = MAX_LOGIN_FAILURES;
  let retryAfter = 0;

  for (const key of getBruteForceKeys(req, username)) {
    const existing = loginAttempts.get(key);
    if (!existing || (now - existing.firstFailureAt > LOGIN_WINDOW_MS && existing.lockedUntil <= now)) {
      loginAttempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
      minRemaining = Math.min(minRemaining, MAX_LOGIN_FAILURES - 1);
    } else {
      existing.failures += 1;
      const limit = key.startsWith('ip:') ? MAX_LOGIN_FAILURES * 2 : MAX_LOGIN_FAILURES;
      if (existing.failures >= limit) {
        existing.lockedUntil = now + LOGIN_LOCKOUT_MS;
        lockedNow = true;
        retryAfter = Math.ceil(LOGIN_LOCKOUT_MS / 1000);
        minRemaining = 0;
      } else {
        minRemaining = Math.min(minRemaining, Math.max(0, limit - existing.failures));
      }
    }
  }

  return { locked: lockedNow, attemptsRemaining: minRemaining, retryAfterSeconds: retryAfter };
}

function clearLoginFailures(req: Request, username: string) {
  for (const key of getBruteForceKeys(req, username)) {
    loginAttempts.delete(key);
  }
}

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
const generalApiLimiter = rateLimit(240, 60 * 1000, 'global_api');
const meetingRealtimeLimiter = rateLimit(2400, 60 * 1000, 'meetings_live_api');
const authLoginLimiter = rateLimit(20, 15 * 60 * 1000, 'auth_login');
const auth2faLimiter = rateLimit(25, 15 * 60 * 1000, 'auth_2fa');
const passwordChangeLimiter = rateLimit(15, 15 * 60 * 1000, 'pwd_change');

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/meetings')) {
    return meetingRealtimeLimiter(req, res, next);
  }
  return generalApiLimiter(req, res, next);
});

const PRIVILEGED_CSRF_PREFIXES = [
  '/users',
  '/system',
  '/settings',
  '/auth/change-password',
  '/auth/2fa/setup',
  '/auth/2fa/verify-setup',
  '/auth/2fa/disable',
  '/auth/revoke-all',
  '/volunteers',
  '/programs',
  '/events',
  '/news',
  '/team',
  '/gallery',
  '/faqs',
  '/upload',
  '/send-email',
  '/email',
  '/support-live/conversations',
  '/support-ai/conversations'
];

// Origin / Referer / Custom-Header CSRF guard for cookie-authenticated state-changing requests
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  // Skip check for explicit Bearer header API clients (including mobile APK & in-memory web header)
  if (req.headers.authorization?.startsWith('Bearer ')) return next();

  const host = (req.headers['x-forwarded-host'] as string || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin && host) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost !== host) {
        return res.status(403).json({ error: 'Cross-site request blocked for security.' });
      }
      return next();
    } catch {
      return res.status(403).json({ error: 'Invalid request origin.' });
    }
  }

  if (referer && host) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (refererHost !== host) {
        return res.status(403).json({ error: 'Cross-site referer blocked for security.' });
      }
      return next();
    } catch {
      return res.status(403).json({ error: 'Invalid request referer.' });
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  const isPrivilegedRoute =
    PRIVILEGED_CSRF_PREFIXES.some(prefix => req.path.startsWith(prefix)) ||
    (req.path.startsWith('/applications') && req.method !== 'POST');

  if (cookies['ng_session'] && isPrivilegedRoute) {
    const xrw = String(req.headers['x-requested-with'] || '').toLowerCase();
    if (xrw !== 'xmlhttprequest') {
      return res.status(403).json({ error: 'Missing same-origin verification header.' });
    }
  }

  next();
});

// Populate optional auth session on req.user for all API routes
app.use((req, res, next) => {
  (req as any).user = getSession(req);
  next();
});

app.use('/api', meetingsRouter);

// Helper: Simple Cookie and Auth Token Parser
function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

interface AuthSession {
  userId: string;
  username: string;
  role: Role;
  name: string;
  jti: string;
  iat: number;
  tv: number;
  exp: number;
}

function signToken(payload: AuthSession): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyToken(token?: string): AuthSession | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  if (!data || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as AuthSession;
    if (!payload.userId || !payload.exp || payload.exp < Date.now()) return null;
    if (payload.jti && revokedTokenJtis.has(payload.jti)) return null;
    if (payload.iat && payload.iat < db.getMinValidTokenIssuedAt()) return null;

    // Live DB user & tokenVersion validation (prevents deleted/demoted user reuse)
    const liveUser = db.getUserById(payload.userId);
    if (!liveUser) return null;
    const liveVersion = db.getUserTokenVersion(payload.userId);
    if (payload.tv && payload.tv !== liveVersion) return null;

    return {
      ...payload,
      role: liveUser.role,
      name: liveUser.name,
      username: liveUser.username
    };
  } catch {
    return null;
  }
}

function extractRawToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (typeof req.headers['x-auth-token'] === 'string') {
    return req.headers['x-auth-token'].trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies['ng_session'];
}

function getSession(req: Request): AuthSession | null {
  return verifyToken(extractRawToken(req));
}

function buildSessionCookie(req: Request, token: string, maxAgeSeconds: number): string {
  const encoded = encodeURIComponent(token);
  if (isHttpsRequest(req)) {
    return `ng_session=${encoded}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=${maxAgeSeconds}`;
  }
  return `ng_session=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 200) {
    return 'Password exceeds maximum allowed length.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[\d\W_]/.test(password)) {
    return 'Password must include letters and at least one number or symbol.';
  }
  if (/^(admin123|password|12345678|qwerty123)$/i.test(password)) {
    return 'Please choose a stronger, non-trivial password.';
  }
  return null;
}

function normalizeRole(r?: string): string {
  if (!r) return '';
  const s = r.toUpperCase().replace(/[\s-]+/g, '_');
  if (s === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (s === 'EDITOR') return 'CONTENT_MANAGER';
  return s;
}

function requireAuth(allowedRoles?: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required. Please log in again.' });
    }
    const sessionRole = normalizeRole(session.role);
    if (allowedRoles && allowedRoles.length > 0) {
      const normalizedAllowed = allowedRoles.map(r => normalizeRole(r));
      if (sessionRole !== 'SUPER_ADMIN' && !normalizedAllowed.includes(sessionRole)) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to perform this action.' });
      }
    }
    (req as any).user = session;
    next();
  };
}

// Live Human Support WebSocket Registry (real-time bidirectional chat + agent alerts)
const SUPPORT_AGENT_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'VOLUNTEER_MANAGER',
  'CONTENT_MANAGER',
  'COMMUNICATIONS_OFFICER'
];
const visitorSupportSockets = new Map<string, Set<WebSocket>>();
const agentSupportSockets = new Set<WebSocket>();

function safeWsSend(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {}
  }
}

function broadcastToSupportAgents(payload: unknown) {
  for (const ws of agentSupportSockets) {
    safeWsSend(ws, payload);
  }
}

function broadcastToSupportVisitor(sessionId: string, payload: unknown) {
  const set = visitorSupportSockets.get(sessionId);
  if (!set) return;
  for (const ws of set) {
    safeWsSend(ws, payload);
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Authentication (Protected by Brute-Force Lockout Shield + Route Rate Limiter)
app.post('/api/auth/login', authLoginLimiter, async (req, res) => {
  const username = String(req.body?.username || req.body?.usernameOrEmail || '').trim();
  const password = String(req.body?.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.length > 150 || password.length > 200) {
    return res.status(400).json({ error: 'Invalid credential input length.' });
  }

  const lockStatus = checkLoginLockout(req, username);
  if (lockStatus.locked) {
    blockedAttemptsCount += 1;
    res.setHeader('Retry-After', String(lockStatus.retryAfterSeconds));
    return res.status(429).json({
      error: `Account temporarily locked due to repeated failed attempts. Try again in ${Math.ceil(lockStatus.retryAfterSeconds / 60)} minute(s).`,
      retryAfterSeconds: lockStatus.retryAfterSeconds
    });
  }

  const user = db.authenticate(username, password);
  if (!user) {
    const failState = recordLoginFailure(req, username);
    // Artificial delay on failed attempt to hinder automated credential stuffing
    await new Promise(r => setTimeout(r, 350));

    const clientIp = getClientIp(req);
    if (failState.locked) {
      blockedAttemptsCount += 1;
      db.logActivity({
        userId: 'security_shield',
        userName: 'Security Shield',
        userRole: 'SYSTEM',
        action: 'LOGIN_BRUTEFORCE_BLOCKED',
        entityType: 'Auth',
        details: `Blocked brute-force login attempts for identifier "${username.slice(0, 40)}" from IP ${clientIp} (15m lockout).`,
        ipAddress: clientIp
      });
      res.setHeader('Retry-After', String(failState.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many failed login attempts. Access temporarily locked for 15 minutes.',
        retryAfterSeconds: failState.retryAfterSeconds
      });
    }

    db.logActivity({
      userId: 'security_shield',
      userName: 'Security Shield',
      userRole: 'SYSTEM',
      action: 'LOGIN_FAILED',
      entityType: 'Auth',
      details: `Failed admin login attempt for "${username.slice(0, 40)}" from IP ${clientIp} (${failState.attemptsRemaining} attempts left before lockout).`,
      ipAddress: clientIp
    });

    return res.status(401).json({
      error: failState.attemptsRemaining <= 2
        ? `Invalid credentials. ${failState.attemptsRemaining} attempt(s) remaining before temporary lockout.`
        : 'Invalid credentials. Please verify username and password.',
      attemptsRemaining: failState.attemptsRemaining
    });
  }

  clearLoginFailures(req, username);

  // Check if Two-Factor Authentication (Google Authenticator) is active on this user
  const user2fa = db.getUser2faInternal(user.id);
  if (user2fa?.twoFactorEnabled && user2fa.twoFactorSecret) {
    const temp2faToken = signTemp2faToken(user.id, db.getUserTokenVersion(user.id));
    db.logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN_2FA_CHALLENGE',
      entityType: 'Auth',
      entityId: user.id,
      details: `Password verified for ${user.username}; awaiting Google Authenticator 2FA code.`,
      ipAddress: getClientIp(req)
    });
    return res.json({
      ok: true,
      requires2FA: true,
      temp2faToken,
      userPreview: {
        name: user.name,
        email: user.email
      }
    });
  }

  return issueFullSessionResponse(req, res, user, 'User authenticated cleanly.');
});

// 2FA Temp Token Helpers & Brute-Force Tracking
const TEMP_2FA_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_2FA_ATTEMPTS = 5;
const consumedTemp2faJtis = new Map<string, number>();
const temp2faAttempts = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of consumedTemp2faJtis.entries()) {
    if (exp < now) {
      consumedTemp2faJtis.delete(jti);
      temp2faAttempts.delete(jti);
    }
  }
}, 5 * 60 * 1000).unref();

interface Temp2faPayload {
  typ: 'temp_2fa';
  userId: string;
  jti: string;
  tv: number;
  iat: number;
  exp: number;
}

function signTemp2faToken(userId: string, tv: number): string {
  const now = Date.now();
  const payload: Temp2faPayload = {
    typ: 'temp_2fa',
    userId,
    jti: crypto.randomBytes(16).toString('hex'),
    tv,
    iat: now,
    exp: now + TEMP_2FA_TTL_MS
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', `${SESSION_SECRET}:2fa`).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyTemp2faToken(token?: string): Temp2faPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  if (!data || !signature) return null;

  const expected = crypto.createHmac('sha256', `${SESSION_SECRET}:2fa`).update(data).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as Temp2faPayload;
    if (payload.typ !== 'temp_2fa' || !payload.userId || !payload.jti) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (consumedTemp2faJtis.has(payload.jti)) return null;
    if (payload.iat && payload.iat < db.getMinValidTokenIssuedAt()) return null;

    const liveVersion = db.getUserTokenVersion(payload.userId);
    if (payload.tv !== liveVersion) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashBackupCode(userId: string, code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(`${userId}:${normalized}`).digest('hex');
}

function generateBackupCodes(count = 6): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += alphabet[bytes[j] % alphabet.length];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

function issueFullSessionResponse(
  req: Request,
  res: Response,
  user: ReturnType<typeof db.getUserById> & object,
  activityDetails: string,
  extraPayload: Record<string, unknown> = {}
) {
  const now = Date.now();
  const tokenPayload: AuthSession = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    jti: crypto.randomBytes(16).toString('hex'),
    iat: now,
    tv: db.getUserTokenVersion(user.id),
    exp: now + SESSION_TTL_MS
  };

  const token = signToken(tokenPayload);

  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(req, token, Math.floor(SESSION_TTL_MS / 1000))
  );

  db.logActivity({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
    details: activityDetails,
    ipAddress: getClientIp(req)
  });

  return res.json({
    ok: true,
    token,
    user,
    ...extraPayload
  });
}

// Per-user brute-force tracking for authenticated 2FA setup / disable actions
const twoFactorActionFailures = new Map<string, { count: number; lockedUntil: number }>();

function check2faActionLock(userId: string): number {
  const rec = twoFactorActionFailures.get(userId);
  if (rec && rec.lockedUntil > Date.now()) {
    return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
  }
  return 0;
}

function record2faActionFailure(userId: string): { locked: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = twoFactorActionFailures.get(userId);
  const nextCount = (!existing || existing.lockedUntil <= now - LOGIN_WINDOW_MS) ? 1 : existing.count + 1;
  if (nextCount >= MAX_2FA_ATTEMPTS) {
    const lockedUntil = now + LOGIN_LOCKOUT_MS;
    twoFactorActionFailures.set(userId, { count: nextCount, lockedUntil });
    return { locked: true, remaining: 0, retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000) };
  }
  twoFactorActionFailures.set(userId, { count: nextCount, lockedUntil: 0 });
  return { locked: false, remaining: MAX_2FA_ATTEMPTS - nextCount, retryAfterSeconds: 0 };
}

// 2FA Step 2: Verify TOTP or single-use Backup Code
app.post('/api/auth/2fa/verify-login', auth2faLimiter, async (req, res) => {
  const temp2faToken = String(req.body?.temp2faToken || '').trim();
  const rawCode = String(req.body?.code || '').trim();

  if (!temp2faToken || !rawCode) {
    return res.status(400).json({ error: 'Verification token and 2FA code are required.' });
  }

  const payload = verifyTemp2faToken(temp2faToken);
  if (!payload) {
    return res.status(401).json({
      error: 'Your 2FA verification session expired or is invalid. Please sign in with your password again.',
      expired: true
    });
  }

  const currentFails = temp2faAttempts.get(payload.jti) || 0;
  if (currentFails >= MAX_2FA_ATTEMPTS) {
    consumedTemp2faJtis.set(payload.jti, payload.exp);
    return res.status(429).json({
      error: 'Too many invalid 2FA attempts. Please restart login with your username and password.',
      expired: true
    });
  }

  const user2fa = db.getUser2faInternal(payload.userId);
  const liveUser = db.getUserById(payload.userId);
  if (!user2fa || !liveUser || !user2fa.twoFactorEnabled || !user2fa.twoFactorSecret) {
    return res.status(401).json({ error: '2FA configuration is unavailable for this account.' });
  }

  const normalizedDigits = rawCode.replace(/\s+/g, '');
  let verifiedViaTotp = false;
  let usedBackupCode = false;

  if (/^\d{6}$/.test(normalizedDigits)) {
    try {
      const check = verifySync({
        token: normalizedDigits,
        secret: user2fa.twoFactorSecret,
        epochTolerance: 30
      });
      verifiedViaTotp = check.valid;
    } catch {
      verifiedViaTotp = false;
    }
  }

  if (!verifiedViaTotp) {
    const cleanAlphaNum = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanAlphaNum.length >= 6) {
      const candidateHash = hashBackupCode(user2fa.id, cleanAlphaNum);
      const result = db.consumeUserBackupCode(user2fa.id, candidateHash);
      if (result.consumed) {
        usedBackupCode = true;
      }
    }
  }

  if (!verifiedViaTotp && !usedBackupCode) {
    const nextFails = currentFails + 1;
    temp2faAttempts.set(payload.jti, nextFails);
    await new Promise(r => setTimeout(r, 350));

    const clientIp = getClientIp(req);
    const remaining = Math.max(0, MAX_2FA_ATTEMPTS - nextFails);

    if (nextFails >= MAX_2FA_ATTEMPTS) {
      consumedTemp2faJtis.set(payload.jti, payload.exp);
      blockedAttemptsCount += 1;
      db.logActivity({
        userId: user2fa.id,
        userName: user2fa.name,
        userRole: user2fa.role,
        action: 'LOGIN_2FA_BLOCKED',
        entityType: 'Auth',
        entityId: user2fa.id,
        details: `Blocked 2FA login challenge for ${user2fa.username} after ${MAX_2FA_ATTEMPTS} invalid codes from IP ${clientIp}.`,
        ipAddress: clientIp
      });
      return res.status(429).json({
        error: 'Too many invalid 2FA codes. Temporary challenge invalidated — please sign in again.',
        expired: true,
        attemptsRemaining: 0
      });
    }

    db.logActivity({
      userId: user2fa.id,
      userName: user2fa.name,
      userRole: user2fa.role,
      action: 'LOGIN_2FA_FAILED',
      entityType: 'Auth',
      entityId: user2fa.id,
      details: `Invalid 2FA verification code entered for ${user2fa.username} from IP ${clientIp} (${remaining} attempt(s) left).`,
      ipAddress: clientIp
    });

    return res.status(401).json({
      error: `Invalid authenticator or backup code. ${remaining} attempt(s) remaining.`,
      attemptsRemaining: remaining
    });
  }

  // Consume temp token single-use so it cannot be replayed
  consumedTemp2faJtis.set(payload.jti, payload.exp);
  temp2faAttempts.delete(payload.jti);

  const refreshedUser = db.getUserById(user2fa.id) || liveUser;
  const note = usedBackupCode
    ? `User ${refreshedUser.username} authenticated via one-time 2FA backup code (${refreshedUser.twoFactorBackupCodesRemaining ?? 0} remaining).`
    : `User ${refreshedUser.username} authenticated cleanly with Google Authenticator 2FA.`;

  return issueFullSessionResponse(req, res, refreshedUser, note, {
    usedBackupCode,
    backupCodesRemaining: refreshedUser.twoFactorBackupCodesRemaining ?? 0
  });
});

// 2FA Setup: Generate unique secret & QR Code for authenticated user
app.post('/api/auth/2fa/setup', auth2faLimiter, requireAuth(), async (req, res) => {
  const session = (req as any).user as AuthSession;
  const liveUser = db.getUserById(session.userId);
  if (!liveUser) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  try {
    const secret = generateSecret();
    const accountLabel = liveUser.email || liveUser.username;
    const otpauthUrl = generateURI({
      issuer: 'NextGen Council Admin',
      label: accountLabel,
      secret
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    db.setUserPending2faSecret(liveUser.id, secret);

    res.json({
      qrCodeDataUrl,
      secret,
      otpauthUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate 2FA setup QR code.' });
  }
});

// 2FA Verify Setup: Confirm 6-digit code, activate 2FA, and issue 6 one-time backup codes
app.post('/api/auth/2fa/verify-setup', auth2faLimiter, requireAuth(), (req, res) => {
  const session = (req as any).user as AuthSession;
  const lockRetry = check2faActionLock(session.userId);
  if (lockRetry > 0) {
    res.setHeader('Retry-After', String(lockRetry));
    return res.status(429).json({
      error: `Too many invalid 2FA verification attempts. Please try again in ${Math.ceil(lockRetry / 60)} minute(s).`
    });
  }

  const token = String(req.body?.token || req.body?.code || '').replace(/\s+/g, '');

  if (!/^\d{6}$/.test(token)) {
    return res.status(400).json({ error: 'Please enter the 6-digit code shown in Google Authenticator.' });
  }

  const user2fa = db.getUser2faInternal(session.userId);
  if (!user2fa || !user2fa.twoFactorSecret) {
    return res.status(400).json({ error: 'No pending 2FA setup found. Please click Enable Google Authenticator first.' });
  }

  let isValid = false;
  try {
    const check = verifySync({
      token,
      secret: user2fa.twoFactorSecret,
      epochTolerance: 30
    });
    isValid = check.valid;
  } catch {
    isValid = false;
  }

  if (!isValid) {
    const fail = record2faActionFailure(session.userId);
    if (fail.locked) {
      blockedAttemptsCount += 1;
      db.logActivity({
        userId: session.userId,
        userName: session.name,
        userRole: session.role,
        action: 'TWO_FACTOR_ACTION_LOCKED',
        entityType: 'Security',
        entityId: session.userId,
        details: `Locked 2FA setup verification for ${session.username} after ${MAX_2FA_ATTEMPTS} invalid codes.`,
        ipAddress: getClientIp(req)
      });
      res.setHeader('Retry-After', String(fail.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many invalid 2FA attempts. Temporarily locked for 15 minutes.'
      });
    }
    return res.status(400).json({
      error: `Invalid 6-digit code. Make sure your device clock is synced and try the latest code (${fail.remaining} attempt(s) left).`
    });
  }

  twoFactorActionFailures.delete(session.userId);
  const backupCodes = generateBackupCodes(6);
  const hashedCodes = backupCodes.map(c => hashBackupCode(session.userId, c));
  const updatedUser = db.enableUser2fa(session.userId, hashedCodes);

  db.logActivity({
    userId: session.userId,
    userName: session.name,
    userRole: session.role,
    action: 'TWO_FACTOR_ENABLED',
    entityType: 'Security',
    entityId: session.userId,
    details: `${session.username} enabled Google Authenticator (TOTP 2FA) with 6 recovery backup codes.`,
    ipAddress: getClientIp(req)
  });

  res.json({
    success: true,
    backupCodes,
    user: updatedUser
  });
});

// 2FA Disable: Requires valid current password OR valid 6-digit TOTP code
app.post('/api/auth/2fa/disable', auth2faLimiter, requireAuth(), (req, res) => {
  const session = (req as any).user as AuthSession;
  const lockRetry = check2faActionLock(session.userId);
  if (lockRetry > 0) {
    res.setHeader('Retry-After', String(lockRetry));
    return res.status(429).json({
      error: `Too many invalid verification attempts. Please try again in ${Math.ceil(lockRetry / 60)} minute(s).`
    });
  }

  const password = String(req.body?.password || '').trim();
  const code = String(req.body?.code || req.body?.token || '').replace(/\s+/g, '');

  const user2fa = db.getUser2faInternal(session.userId);
  if (!user2fa || !user2fa.twoFactorEnabled) {
    return res.status(400).json({ error: 'Two-Factor Authentication is not currently enabled on your account.' });
  }

  let authorized = false;
  if (password && db.verifyUserPassword(session.userId, password)) {
    authorized = true;
  } else if (/^\d{6}$/.test(code) && user2fa.twoFactorSecret) {
    try {
      const check = verifySync({
        token: code,
        secret: user2fa.twoFactorSecret,
        epochTolerance: 30
      });
      authorized = check.valid;
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    const fail = record2faActionFailure(session.userId);
    if (fail.locked) {
      blockedAttemptsCount += 1;
      db.logActivity({
        userId: session.userId,
        userName: session.name,
        userRole: session.role,
        action: 'TWO_FACTOR_ACTION_LOCKED',
        entityType: 'Security',
        entityId: session.userId,
        details: `Locked 2FA disable verification for ${session.username} after repeated failed checks.`,
        ipAddress: getClientIp(req)
      });
      res.setHeader('Retry-After', String(fail.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many invalid verification attempts. Temporarily locked for 15 minutes.'
      });
    }
    return res.status(401).json({
      error: `Verification failed. Enter your current password or a valid 6-digit Google Authenticator code (${fail.remaining} attempt(s) left).`
    });
  }

  twoFactorActionFailures.delete(session.userId);
  const updatedUser = db.disableUser2fa(session.userId);
  db.logActivity({
    userId: session.userId,
    userName: session.name,
    userRole: session.role,
    action: 'TWO_FACTOR_DISABLED',
    entityType: 'Security',
    entityId: session.userId,
    details: `${session.username} disabled Google Authenticator 2FA on their account.`,
    ipAddress: getClientIp(req)
  });

  res.json({
    success: true,
    user: updatedUser
  });
});

app.post('/api/auth/logout', (req, res) => {
  const session = getSession(req);
  if (session?.jti) {
    revokedTokenJtis.set(session.jti, session.exp);
  }
  res.setHeader('Set-Cookie', buildSessionCookie(req, '', 0));
  res.json({ ok: true });
});

app.post('/api/auth/revoke-all', passwordChangeLimiter, requireAuth(['SUPER_ADMIN']), (req, res) => {
  const cutoff = db.revokeAllSessions();
  const user = (req as any).user as AuthSession;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'REVOKE_ALL_SESSIONS',
    entityType: 'Security',
    details: 'Super Admin invalidated all active authentication sessions across all devices.',
    ipAddress: getClientIp(req)
  });
  res.setHeader('Set-Cookie', buildSessionCookie(req, '', 0));
  res.json({ ok: true, revokedAt: cutoff, message: 'All active admin sessions have been signed out immediately.' });
});

app.put('/api/auth/change-password', passwordChangeLimiter, requireAuth(), (req, res) => {
  const session = (req as any).user as AuthSession;
  const currentPassword = String(req.body?.currentPassword || '').trim();
  const newPassword = String(req.body?.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    return res.status(400).json({ error: strengthErr });
  }
  if (!db.verifyUserPassword(session.userId, currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  try {
    const updatedUser = db.updateUser(session.userId, { password: newPassword });
    if (session.jti) {
      revokedTokenJtis.set(session.jti, session.exp);
    }

    const now = Date.now();
    const refreshedPayload: AuthSession = {
      userId: session.userId,
      username: updatedUser?.username || session.username,
      name: updatedUser?.name || session.name,
      role: updatedUser?.role || session.role,
      jti: crypto.randomBytes(16).toString('hex'),
      iat: now,
      tv: db.getUserTokenVersion(session.userId),
      exp: now + SESSION_TTL_MS
    };
    const freshToken = signToken(refreshedPayload);
    res.setHeader('Set-Cookie', buildSessionCookie(req, freshToken, Math.floor(SESSION_TTL_MS / 1000)));

    db.logActivity({
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: session.userId,
      details: `${session.username} updated their own account password.`,
      ipAddress: getClientIp(req)
    });
    res.json({
      ok: true,
      token: freshToken,
      user: updatedUser,
      message: 'Password updated cleanly. Other active sessions were invalidated.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/system/security-status', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const now = Date.now();
  let activeLockouts = 0;
  for (const [k, v] of loginAttempts.entries()) {
    if (k.startsWith('acct:') && v.lockedUntil > now) activeLockouts++;
  }
  res.json({
    pbkdf2Iterations: 120000,
    sessionTtlHours: 12,
    bruteForceShieldActive: true,
    maxLoginAttempts: MAX_LOGIN_FAILURES,
    activeLockouts,
    blockedAttemptsCount,
    csrfOriginProtection: true,
    httpsSecureCookies: isHttpsRequest(req),
    httpOnlyPartitionedCookies: isHttpsRequest(req),
    inMemoryWebTokens: true,
    passwordPolicyMinLength: 8,
    twoFactorBruteForceProtection: true,
    svgUploadBlocked: true
  });
});

app.get('/api/auth/session', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(200).json({ authenticated: false, user: null });
  }
  const user = db.getUserById(session.userId);
  if (!user) {
    return res.status(200).json({ authenticated: false, user: null });
  }
  res.json({
    authenticated: true,
    user
  });
});

// 3. Public Volunteer Application Submission
app.post('/api/applications', (req, res) => {
  const body = req.body || {};

  // Server-side validations
  if (!body.fullName || body.fullName.trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required (at least 2 characters).' });
  }
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!body.phone || body.phone.replace(/[^0-9]/g, '').length < 7) {
    return res.status(400).json({ error: 'A valid phone number is required.' });
  }
  if (!body.city || body.city.trim().length < 2) {
    return res.status(400).json({ error: 'City is required.' });
  }
  if (!body.whyJoin || body.whyJoin.trim().length < 15) {
    return res.status(400).json({ error: 'Please explain in at least 15 characters why you wish to join.' });
  }
  if (!body.agreedToTerms) {
    return res.status(400).json({ error: 'You must agree to the organizational terms and code of conduct.' });
  }
  if (!body.confirmedAccurate) {
    return res.status(400).json({ error: 'Please confirm that the submitted information is accurate.' });
  }

  const application = db.createApplication({
    fullName: body.fullName.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone.trim(),
    dateOfBirth: body.dateOfBirth || '',
    gender: body.gender || 'Prefer not to say',
    city: body.city.trim(),
    address: body.address || '',
    educationLevel: body.educationLevel || '',
    profession: body.profession || '',
    skills: Array.isArray(body.skills) ? body.skills : (body.skills ? [body.skills] : []),
    previousVolunteerExperience: body.previousVolunteerExperience || '',
    whyJoin: body.whyJoin.trim(),
    interestAreas: Array.isArray(body.interestAreas) ? body.interestAreas : [],
    availableDays: Array.isArray(body.availableDays) ? body.availableDays : [],
    availableHours: body.availableHours || '',
    preferredRole: body.preferredRole || '',
    previousOrganization: body.previousOrganization || '',
    emergencyContactName: body.emergencyContactName || '',
    emergencyContactPhone: body.emergencyContactPhone || '',
    additionalMessage: body.additionalMessage || '',
    agreedToTerms: true,
    confirmedAccurate: true
  });

  db.logActivity({
    userId: 'public_applicant',
    userName: application.fullName,
    userRole: 'APPLICANT',
    action: 'APPLICATION_SUBMITTED',
    entityType: 'VolunteerApplication',
    entityId: application.id,
    details: `New volunteer application submitted by ${application.fullName} (${application.referenceCode}) from ${application.city}.`,
    ipAddress: req.ip || 'unknown'
  });

  res.status(201).json({
    ok: true,
    referenceCode: application.referenceCode,
    applicationId: application.id,
    message: 'Your volunteer application has been successfully submitted!'
  });
});

// Applicant & Credential public status lookup
app.get('/api/applications/verify/:refCode', (req, res) => {
  const refCode = req.params.refCode.trim();
  const normalizedCode = refCode.toUpperCase();
  const appItem = db.getApplicationById(refCode);

  if (appItem) {
    const matchedVol = db.getVolunteers().find(
      v => v.applicationId === appItem.id || (v.email && appItem.email && v.email.toLowerCase() === appItem.email.toLowerCase())
    );
    return res.json({
      referenceCode: appItem.referenceCode,
      fullName: matchedVol?.fullName || appItem.fullName,
      city: matchedVol?.city || appItem.city,
      phone: matchedVol?.phone || appItem.phone,
      status: appItem.status,
      submittedAt: appItem.createdAt,
      preferredRole: appItem.preferredRole,
      assignedRole: matchedVol?.assignedRole || appItem.preferredRole,
      assignedProgram: matchedVol?.assignedProgram,
      membershipTier: matchedVol?.membershipTier,
      hoursContributed: matchedVol?.hoursContributed ?? matchedVol?.hoursLogged ?? 0,
      avatar: matchedVol?.avatar || appItem.avatar
    });
  }

  // Also check active volunteer credential codes (e.g. NG-VOL-XXXXXX)
  const volMatch = db.getVolunteers().find(v => {
    const volCode = `NG-VOL-${v.id.slice(-6).toUpperCase()}`;
    return v.id.toUpperCase() === normalizedCode || volCode === normalizedCode;
  });

  if (volMatch) {
    return res.json({
      referenceCode: `NG-VOL-${volMatch.id.slice(-6).toUpperCase()}`,
      fullName: volMatch.fullName,
      city: volMatch.city,
      phone: volMatch.phone,
      status: 'Approved',
      volunteerStatus: volMatch.status,
      submittedAt: volMatch.joinedDate,
      preferredRole: volMatch.assignedRole,
      assignedRole: volMatch.assignedRole,
      assignedProgram: volMatch.assignedProgram,
      membershipTier: volMatch.membershipTier,
      hoursContributed: volMatch.hoursContributed ?? volMatch.hoursLogged ?? 0,
      avatar: volMatch.avatar
    });
  }

  return res.status(404).json({ error: 'Application or credential reference code not found.' });
});

// Admin Applications endpoints
app.get('/api/applications', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'VIEWER']), (req, res) => {
  const { search, status, city, fromDate, toDate, sort, page, perPage } = req.query as Record<string, string>;
  const result = db.getApplications({
    search,
    status,
    city,
    fromDate,
    toDate,
    sort: sort === 'oldest' ? 'oldest' : 'newest',
    page: page ? parseInt(page, 10) : 1,
    perPage: perPage ? parseInt(perPage, 10) : 10
  });
  res.json(result);
});

app.get('/api/applications/export/csv', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const result = db.getApplications({ perPage: 1000 });
  const headers = ['Reference Code', 'Full Name', 'Email', 'Phone', 'City', 'Status', 'Preferred Role', 'Created At'];
  const rows = result.data.map(a => [
    `"${a.referenceCode}"`,
    `"${a.fullName.replace(/"/g, '""')}"`,
    `"${a.email}"`,
    `"${a.phone}"`,
    `"${a.city}"`,
    `"${a.status}"`,
    `"${(a.preferredRole || '').replace(/"/g, '""')}"`,
    `"${a.createdAt}"`
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="nexgen-volunteer-applications.csv"');
  res.send(csv);
});

app.get('/api/applications/:id', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'VIEWER']), (req, res) => {
  const appItem = db.getApplicationById(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });
  res.json(appItem);
});

app.patch('/api/applications/:id/status', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), async (req, res) => {
  const {
    status,
    internalNotes,
    reviewNotes,
    sendApprovalEmail,
    includeWhatsappInvite,
    whatsappGroupLink,
    whatsappGroupTarget,
    saveWhatsappAsDefault,
    customEmailNote
  } = req.body || {};

  if (!['Pending', 'Under Review', 'Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid application status.' });
  }

  const effectiveNotes = internalNotes !== undefined ? internalNotes : reviewNotes;
  const user = (req as any).user;
  const updated = db.updateApplicationStatus(req.params.id, status, effectiveNotes, {
    name: user.name,
    id: user.userId
  });

  if (!updated) return res.status(404).json({ error: 'Application not found' });

  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'APPLICATION_STATUS_UPDATE',
    entityType: 'VolunteerApplication',
    entityId: updated.id,
    details: `Application ${updated.referenceCode} (${updated.fullName}) marked as ${status}. ${effectiveNotes ? `Notes: ${effectiveNotes}` : ''}`,
    ipAddress: req.ip || 'unknown'
  });

  let emailDispatch: {
    attempted: boolean;
    success: boolean;
    error?: string;
    resendId?: string;
    includedWhatsappButton: boolean;
    fromEmail: string;
  } | null = null;

  if (status === 'Approved' && sendApprovalEmail === true) {
    const settings = db.getSettings();
    const emailConfig = db.getEmailSenderConfig();

    const inferredGender = String(updated.gender || '').trim().toLowerCase();
    const normalizedTarget: 'male' | 'female' | 'general' =
      whatsappGroupTarget === 'male' || whatsappGroupTarget === 'female'
        ? whatsappGroupTarget
        : inferredGender === 'male'
        ? 'male'
        : inferredGender === 'female'
        ? 'female'
        : 'general';

    const settingLinkForTarget =
      normalizedTarget === 'male'
        ? (settings.volunteerWhatsappGroupLinkMale || '').trim()
        : normalizedTarget === 'female'
        ? (settings.volunteerWhatsappGroupLinkFemale || '').trim()
        : (settings.volunteerWhatsappGroupLink || '').trim();

    const chosenWhatsappLink =
      typeof whatsappGroupLink === 'string' && whatsappGroupLink.trim()
        ? whatsappGroupLink.trim()
        : settingLinkForTarget;

    if (saveWhatsappAsDefault === true && typeof whatsappGroupLink === 'string' && whatsappGroupLink.trim()) {
      const cleanSave = whatsappGroupLink.trim();
      if (normalizedTarget === 'male') {
        db.updateSettings({ volunteerWhatsappGroupLinkMale: cleanSave });
      } else if (normalizedTarget === 'female') {
        db.updateSettings({ volunteerWhatsappGroupLinkFemale: cleanSave });
      } else {
        db.updateSettings({ volunteerWhatsappGroupLink: cleanSave });
      }
    }

    const whatsappGroupLabel =
      normalizedTarget === 'male'
        ? '💬 Join Official Male Volunteers WhatsApp Group →'
        : normalizedTarget === 'female'
        ? '💬 Join Official Female Volunteers WhatsApp Group →'
        : '💬 Join Official WhatsApp Group →';

    const template = buildVolunteerApprovalEmail({
      volunteerName: updated.fullName,
      referenceCode: updated.referenceCode,
      preferredRole: updated.preferredRole,
      city: updated.city,
      customNote: typeof customEmailNote === 'string' ? customEmailNote : undefined,
      includeWhatsappInvite: Boolean(includeWhatsappInvite && chosenWhatsappLink),
      whatsappGroupLink: chosenWhatsappLink,
      whatsappGroupLabel,
      siteUrl: settings.siteUrl || 'https://nexgencouncil.bond'
    });

    const senderEmail = 'admin@nexgencouncil.bond';
    const senderName = emailConfig.senderName || 'NexGen Council';

    const result = await sendCouncilEmail({
      to: updated.email,
      fromName: senderName,
      fromEmail: senderEmail,
      replyTo: emailConfig.replyTo || settings.contactEmail || undefined,
      subject: template.subject,
      html: template.html,
      message: template.message,
      buttons: template.buttons,
      logoUrl: emailConfig.logoUrl || undefined,
      siteUrl: settings.siteUrl || 'https://nexgencouncil.bond'
    });

    if (result.attemptedDispatch && result.resolvedMeta) {
      db.addEmailLog({
        resendId: result.data?.id,
        fromName: result.resolvedMeta.fromName,
        fromEmail: result.resolvedMeta.fromEmail,
        to: result.resolvedMeta.recipients,
        replyTo: result.resolvedMeta.replyTo,
        subject: result.resolvedMeta.subject,
        message: result.resolvedMeta.message,
        html: result.resolvedMeta.html,
        logoUrl: result.resolvedMeta.logoUrl,
        buttons: result.resolvedMeta.buttons,
        status: result.success ? 'Sent' : 'Failed',
        error: result.success ? undefined : result.error || 'Failed to send volunteer approval email.',
        sentByUserId: user.userId,
        sentByName: user.name,
        sentAt: result.data?.sentAt
      });
    }

    db.logActivity({
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      action: 'VOLUNTEER_APPROVAL_EMAIL',
      entityType: 'Email',
      entityId: result.data?.id || updated.id,
      details: result.success
        ? `Sent approval congratulations email from ${senderEmail} to ${updated.email}${template.buttons.length > 0 ? ' (with WhatsApp Group Invite button)' : ' (without invite button)'}.`
        : `Failed approval congratulations email to ${updated.email}: ${result.error || 'Unknown error'}`,
      ipAddress: req.ip || 'unknown'
    });

    emailDispatch = {
      attempted: true,
      success: result.success,
      error: result.error,
      resendId: result.data?.id,
      includedWhatsappButton: template.buttons.length > 0,
      fromEmail: senderEmail
    };
  }

  res.json({
    ...updated,
    ...(emailDispatch ? { emailDispatch } : {})
  });
});

app.patch('/api/applications/:id', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const updated = db.updateApplication(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Application not found' });
  res.json(updated);
});

app.delete('/api/applications/:id', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const appItem = db.getApplicationById(req.params.id);
  const success = db.deleteApplication(req.params.id);
  if (!success) return res.status(404).json({ error: 'Application not found' });

  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'APPLICATION_DELETED',
    entityType: 'VolunteerApplication',
    entityId: req.params.id,
    details: `Application ${appItem?.referenceCode || req.params.id} deleted.`,
    ipAddress: req.ip || 'unknown'
  });

  res.json({ ok: true });
});

// 4. Volunteers Directory
app.get('/api/volunteers', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'VIEWER']), (req, res) => {
  const { search, status } = req.query as Record<string, string>;
  const volunteers = db.getVolunteers(search, status);
  res.json(volunteers);
});

app.post('/api/volunteers', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email) {
    return res.status(400).json({ error: 'Full name and email are required to register a volunteer.' });
  }
  const created = db.createVolunteer(req.body);
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'VOLUNTEER_CREATED',
    entityType: 'Volunteer',
    entityId: created.id,
    details: `Added new volunteer: ${created.fullName} (${created.assignedRole}).`,
    ipAddress: req.ip || 'unknown'
  });
  res.status(201).json(created);
});

app.patch('/api/volunteers/:id', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const updated = db.updateVolunteer(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Volunteer not found' });
  res.json(updated);
});

app.put('/api/volunteers/:id', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const updated = db.updateVolunteer(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Volunteer not found' });
  res.json(updated);
});

app.delete('/api/volunteers/:id', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const vol = db.getVolunteers().find(v => v.id === req.params.id);
  const success = db.deleteVolunteer(req.params.id);
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'VOLUNTEER_DELETED',
    entityType: 'Volunteer',
    entityId: req.params.id,
    details: `Removed volunteer ${vol?.fullName || req.params.id} (${vol?.assignedRole || 'Active Member'}) from active directory.`,
    ipAddress: req.ip || 'unknown'
  });
  res.json({ ok: true, id: req.params.id, deleted: success });
});

// 5. Programs
app.get('/api/programs', (req, res) => {
  const session = getSession(req);
  const isManager = session && ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR'].includes(session.role);
  const programs = db.getPrograms(!isManager);
  res.json(programs);
});

app.get('/api/programs/:id', (req, res) => {
  const program = db.getProgramBySlugOrId(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  res.json(program);
});

app.post('/api/programs', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  const body = req.body;
  if (!body.title || !body.shortDescription) {
    return res.status(400).json({ error: 'Title and short description are required.' });
  }
  const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const program = db.createProgram({
    title: body.title,
    slug,
    category: body.category || 'General',
    shortDescription: body.shortDescription,
    fullDescription: body.fullDescription || body.shortDescription,
    coverImage: body.coverImage || 'https://images.unsplash.com/photo-1573497491768-dccce02ce85f?w=900&auto=format&fit=crop&q=80',
    imageAlt: typeof body.imageAlt === 'string' && body.imageAlt.trim() ? body.imageAlt.trim().slice(0, 220) : undefined,
    startDate: body.startDate,
    endDate: body.endDate,
    featured: Boolean(body.featured),
    status: body.status || 'Published',
    targetAudience: body.targetAudience,
    curriculumHighlights: Array.isArray(body.curriculumHighlights) ? body.curriculumHighlights : []
  });

  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'PROGRAM_CREATED',
    entityType: 'Program',
    entityId: program.id,
    details: `Created program: "${program.title}"`,
    ipAddress: req.ip || 'unknown'
  });

  res.status(201).json(program);
});

app.put('/api/programs/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  const updated = db.updateProgram(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Program not found' });
  res.json(updated);
});

app.delete('/api/programs/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  db.deleteProgram(req.params.id);
  res.json({ ok: true });
});

// 6. Events
app.get('/api/events', (req, res) => {
  const filter = req.query.filter as 'Upcoming' | 'Past' | 'All' | undefined;
  const events = db.getEvents(filter);
  res.json(events);
});

const eventRsvpLimiter = rateLimit(30, 15 * 60 * 1000, 'event_rsvp');

app.post('/api/events/:id/rsvp', eventRsvpLimiter, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (name.length < 2 || !isValidEmailAddress(email)) {
    return res.status(400).json({ error: 'Please provide your full name and a valid email address.' });
  }

  const outcome = db.registerEventRsvp(req.params.id);
  if (outcome.status === 'not_found' || !outcome.event) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  if (outcome.status === 'full') {
    return res.status(409).json({
      error: 'This event has reached maximum delegate capacity.',
      event: outcome.event
    });
  }

  db.logActivity({
    userId: 'public_visitor',
    userName: name.slice(0, 80),
    userRole: 'DELEGATE',
    action: outcome.status === 'waitlisted' ? 'EVENT_WAITLISTED' : 'EVENT_RSVP',
    entityType: 'Event',
    entityId: outcome.event.id,
    details: `${name.slice(0, 80)} (${email}) ${outcome.status === 'waitlisted' ? 'joined waitlist' : 'reserved seat'} for "${outcome.event.title}" (${outcome.event.registeredCount || 0}/${outcome.event.capacity || '∞'}).`,
    ipAddress: getClientIp(req)
  });

  res.status(201).json({
    ok: true,
    status: outcome.status,
    event: outcome.event,
    message:
      outcome.status === 'waitlisted'
        ? 'Event capacity is currently full — your seat request has been placed on the priority waitlist.'
        : 'Your delegate seat has been reserved successfully.'
  });
});

app.post('/api/events', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  const body = req.body || {};
  if (!body.title || !body.date) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }
  const parsedCapacity =
    body.capacity !== undefined && body.capacity !== '' && body.capacity !== null
      ? Math.max(0, Math.floor(Number(body.capacity) || 0))
      : 100;
  const parsedRegistered =
    body.registeredCount !== undefined && body.registeredCount !== '' && body.registeredCount !== null
      ? Math.max(0, Math.floor(Number(body.registeredCount) || 0))
      : 0;

  const rawEventImg = typeof body.coverImage === 'string' && body.coverImage.trim()
    ? body.coverImage.trim()
    : typeof body.image === 'string'
    ? body.image.trim()
    : '';
  const resolvedEventImg = rawEventImg.startsWith('uploads/') ? `/${rawEventImg}` : rawEventImg;

  const eventItem = db.createEvent({
    title: String(body.title).trim(),
    slug: body.slug ? String(body.slug).trim() : undefined,
    category: body.category || 'General',
    description: body.description || '',
    image: resolvedEventImg,
    coverImage: resolvedEventImg,
    imageAlt: typeof body.imageAlt === 'string' && body.imageAlt.trim() ? body.imageAlt.trim().slice(0, 220) : undefined,
    date: body.date,
    time: body.time || '10:00 AM',
    location: body.location || 'Online / Regional Center',
    isVirtual: Boolean(body.isVirtual),
    registrationUrl: body.registrationUrl || '#volunteer',
    status: body.status || 'Upcoming',
    capacity: parsedCapacity,
    registeredCount: parsedRegistered,
    showCapacity: body.showCapacity !== undefined ? Boolean(body.showCapacity) : true,
    waitlistEnabled: Boolean(body.waitlistEnabled)
  });

  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'EVENT_CREATED',
    entityType: 'Event',
    entityId: eventItem.id,
    details: `Created event: "${eventItem.title}" on ${eventItem.date} (Capacity: ${eventItem.capacity || 'Unlimited'})`,
    ipAddress: getClientIp(req)
  });

  res.status(201).json(eventItem);
});

app.put('/api/events/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  const updated = db.updateEvent(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Event not found' });
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'EVENT_UPDATED',
    entityType: 'Event',
    entityId: updated.id,
    details: `Updated event "${updated.title}" (Registered: ${updated.registeredCount || 0}/${updated.capacity || 'Unlimited'})`,
    ipAddress: getClientIp(req)
  });
  res.json(updated);
});

app.delete('/api/events/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  db.deleteEvent(req.params.id);
  res.json({ ok: true });
});

// 7. News
app.get('/api/news', (req, res) => {
  const session = getSession(req);
  const isManager = session && ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER'].includes(session.role);
  const news = db.getNews(!isManager);
  res.json(news);
});

app.post('/api/news', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const body = req.body || {};
  if (!body.title || (!body.content && !body.summary)) {
    return res.status(400).json({ error: 'Title and article content or summary are required.' });
  }
  const slug = (body.slug || body.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const user = (req as any).user;
  const articleBody = String(body.content || body.summary || '').trim();
  const rawCover = typeof body.coverImage === 'string'
    ? body.coverImage.trim()
    : typeof body.image === 'string'
      ? body.image.trim()
      : '';
  const coverImage = rawCover.startsWith('uploads/') ? `/${rawCover}` : rawCover;
  const newsItem = db.createNews({
    title: String(body.title).trim(),
    slug,
    category: body.category || 'Announcement',
    author: body.author || user.name,
    authorRole: body.authorRole || 'Editorial Board',
    coverImage,
    imageAlt: typeof body.imageAlt === 'string' && body.imageAlt.trim() ? body.imageAlt.trim().slice(0, 220) : undefined,
    summary: body.summary || articleBody.slice(0, 160),
    content: articleBody,
    publishedAt: body.publishedAt || new Date().toISOString(),
    status: body.status || 'Published',
    featured: Boolean(body.featured),
    tags: body.tags,
    readTimeMinutes: body.readTimeMinutes,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeywords: body.seoKeywords,
    canonicalUrl: body.canonicalUrl
  });

  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'NEWS_POSTED',
    entityType: 'News',
    entityId: newsItem.id,
    details: `Published news article: "${newsItem.title}"`,
    ipAddress: getClientIp(req)
  });

  res.status(201).json(newsItem);
});

app.put('/api/news/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.coverImage === undefined && typeof body.image === 'string') {
    body.coverImage = body.image;
  }
  const updated = db.updateNews(req.params.id, body);
  if (!updated) return res.status(404).json({ error: 'Article not found' });
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'NEWS_UPDATED',
    entityType: 'News',
    entityId: updated.id,
    details: `Updated news article & SEO metadata: "${updated.title}"`,
    ipAddress: getClientIp(req)
  });
  res.json(updated);
});

app.delete('/api/news/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  db.deleteNews(req.params.id);
  res.json({ ok: true });
});

// 8. Team
app.get('/api/team', (req, res) => {
  const session = getSession(req);
  const isManager = session && ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'].includes(session.role);
  const team = db.getTeam(!isManager);
  res.json(team);
});

app.post('/api/team', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const member = db.createTeamMember(req.body);
  res.status(201).json(member);
});

app.put('/api/team/reorder', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return res.status(400).json({ error: 'orderedIds array is required.' });
  }
  const updatedTeam = db.reorderTeamMembers(orderedIds);
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'TEAM_REORDERED',
    entityType: 'TeamMember',
    details: `Updated leadership display sequence (${orderedIds.length} members ordered).`,
    ipAddress: req.ip || 'unknown'
  });
  res.json(updatedTeam);
});

app.put('/api/team/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const updated = db.updateTeamMember(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Team member not found' });
  res.json(updated);
});

app.delete('/api/team/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  db.deleteTeamMember(req.params.id);
  res.json({ ok: true });
});

// 9. Gallery
app.get('/api/gallery', (req, res) => {
  res.json(db.getGallery());
});

app.post('/api/gallery', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR']), (req, res) => {
  const item = db.createGalleryItem(req.body);
  res.status(201).json(item);
});

app.put('/api/gallery/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR']), (req, res) => {
  const updated = db.updateGalleryItem(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Gallery item not found' });
  }
  const currentUser = (req as any).user;
  db.logActivity({
    userId: currentUser.userId,
    userName: currentUser.name,
    userRole: currentUser.role,
    action: 'GALLERY_UPDATED',
    entityType: 'Gallery',
    entityId: req.params.id,
    details: `Updated gallery item "${updated.title}" (${updated.category}).`,
    ipAddress: getClientIp(req)
  });
  res.json(updated);
});

app.delete('/api/gallery/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR']), (req, res) => {
  db.deleteGalleryItem(req.params.id);
  res.json({ ok: true });
});

// 9b. FAQs
app.get('/api/faqs', (req, res) => {
  const session = getSession(req);
  const isManager =
    session &&
    ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER'].includes(session.role);
  res.json(db.getFaqs(!isManager));
});

app.post('/api/faqs', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const body = req.body || {};
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  const category = typeof body.category === 'string' && body.category.trim()
    ? body.category.trim().slice(0, 80)
    : 'About NexGen Council';

  if (question.length < 3 || answer.length < 5) {
    return res.status(400).json({ error: 'Please provide both a valid FAQ question and answer.' });
  }

  const user = (req as any).user;
  const created = db.createFaq({
    category,
    question: question.slice(0, 400),
    answer: answer.slice(0, 4000),
    displayOrder: typeof body.displayOrder === 'number' ? body.displayOrder : Number(body.displayOrder) || 0,
    active: body.active !== undefined ? Boolean(body.active) : true
  });

  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'FAQ_CREATED',
    entityType: 'FAQ',
    entityId: created.id,
    details: `Created FAQ in "${created.category}": "${created.question.slice(0, 80)}"`,
    ipAddress: getClientIp(req)
  });

  res.status(201).json(created);
});

app.put('/api/faqs/reorder', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return res.status(400).json({ error: 'orderedIds array is required.' });
  }
  const cleanIds = orderedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  const reordered = db.reorderFaqs(cleanIds);
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'FAQ_REORDERED',
    entityType: 'FAQ',
    details: `Updated FAQ display order (${cleanIds.length} entries).`,
    ipAddress: getClientIp(req)
  });
  res.json(reordered);
});

app.put('/api/faqs/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const body = req.body || {};
  if (body.question !== undefined && (typeof body.question !== 'string' || body.question.trim().length < 3)) {
    return res.status(400).json({ error: 'FAQ question must be at least 3 characters.' });
  }
  if (body.answer !== undefined && (typeof body.answer !== 'string' || body.answer.trim().length < 5)) {
    return res.status(400).json({ error: 'FAQ answer must be at least 5 characters.' });
  }

  const updates: Record<string, any> = {};
  if (typeof body.category === 'string' && body.category.trim()) updates.category = body.category.trim().slice(0, 80);
  if (typeof body.question === 'string') updates.question = body.question.trim().slice(0, 400);
  if (typeof body.answer === 'string') updates.answer = body.answer.trim().slice(0, 4000);
  if (body.displayOrder !== undefined && Number.isFinite(Number(body.displayOrder))) {
    updates.displayOrder = Number(body.displayOrder);
  }
  if (typeof body.active === 'boolean') updates.active = body.active;

  const updated = db.updateFaq(req.params.id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'FAQ not found' });
  }

  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'FAQ_UPDATED',
    entityType: 'FAQ',
    entityId: updated.id,
    details: `Updated FAQ "${updated.question.slice(0, 80)}" (${updated.active ? 'Published' : 'Hidden'}).`,
    ipAddress: getClientIp(req)
  });

  res.json(updated);
});

app.delete('/api/faqs/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const existing = db.getFaqs(false).find(f => f.id === req.params.id);
  const removed = db.deleteFaq(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'FAQ not found' });
  }
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'FAQ_DELETED',
    entityType: 'FAQ',
    entityId: req.params.id,
    details: `Deleted FAQ "${existing?.question?.slice(0, 80) || req.params.id}".`,
    ipAddress: getClientIp(req)
  });
  res.json({ ok: true });
});

// 10. Contact & Support Widget Inquiries
app.post(['/api/contact', '/api/contacts', '/api/support-widget'], (req, res) => {
  const { name, email, phone, whatsapp, source, channel, subject, message } = req.body || {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanSubject = (typeof subject === 'string' && subject.trim()) ? subject.trim() : 'General Inquiry';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const explicitWhatsapp = typeof whatsapp === 'string' ? whatsapp.trim() : '';

  const querySource = typeof req.query?.source === 'string' ? req.query.source.trim().toLowerCase() : '';
  const bodySource = typeof source === 'string' ? source.trim().toLowerCase() : '';
  const bodyChannel = typeof channel === 'string' ? channel.trim().toLowerCase() : '';
  const rawOriginHint = bodySource || bodyChannel || querySource;

  const widgetOnlySubjects = [
    'Certificate / Cohort Verification',
    'Volunteer / Fellowship Application',
    'Event / Meeting Access Issue',
    'Website / Portal Bug Report'
  ];

  let normalizedSource: 'Support Widget' | 'Contact Page' = 'Contact Page';
  if (req.path === '/api/support-widget' || rawOriginHint.includes('widget')) {
    normalizedSource = 'Support Widget';
  } else if (rawOriginHint.includes('contact')) {
    normalizedSource = 'Contact Page';
  } else if (explicitWhatsapp.length > 0 || widgetOnlySubjects.includes(cleanSubject)) {
    normalizedSource = 'Support Widget';
  }

  const cleanWhatsapp =
    normalizedSource === 'Support Widget'
      ? (explicitWhatsapp || cleanPhone)
      : explicitWhatsapp;

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (normalizedSource === 'Support Widget' && cleanWhatsapp.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'A valid WhatsApp number is required for Support Widget inquiries.' });
  }

  const contact = db.createContact({
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone || cleanWhatsapp || undefined,
    whatsapp: cleanWhatsapp || undefined,
    source: normalizedSource,
    subject: cleanSubject,
    message: cleanMessage
  });
  db.logActivity({
    userId: 'public_visitor',
    userName: cleanName,
    userRole: 'VISITOR',
    action: 'CONTACT_SUBMITTED',
    entityType: 'ContactMessage',
    entityId: contact.id,
    details: `Inquiry received via ${normalizedSource} from ${cleanName} (${cleanEmail}${cleanWhatsapp ? `, WhatsApp: ${cleanWhatsapp}` : ''}): "${contact.subject}"`,
    ipAddress: req.ip || 'unknown'
  });
  broadcastToSupportAgents({
    type: 'support:new_ticket',
    contact
  });
  res.status(201).json({
    ok: true,
    id: contact.id,
    source: contact.source,
    message: 'Message sent successfully. Our team will contact you shortly.'
  });
});

app.get(['/api/contact', '/api/contacts'], requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER', 'VIEWER']), (req, res) => {
  res.json(db.getContacts());
});

app.patch(['/api/contact/:id', '/api/contacts/:id', '/api/contacts/:id/status'], requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const updated = db.updateContactStatus(req.params.id, req.body.status);
  if (!updated) return res.status(404).json({ error: 'Message not found' });
  res.json(updated);
});

app.delete(['/api/contact/:id', '/api/contacts/:id'], requireAuth(['ADMIN']), (req, res) => {
  db.deleteContact(req.params.id);
  res.json({ ok: true });
});

// 10a. Support Widget Gemini 3.1 Flash Lite AI Concierge, 7-Day Chat Memory & Live Human Support
app.get('/api/support-ai/history', (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
  if (!sessionId || sessionId.length > 100) {
    return res.json({ messages: [], conversationId: null, mode: 'ai', status: 'open', model: SUPPORT_AI_MODEL });
  }
  const conv = db.getSupportConversationBySession(sessionId);
  return res.json({
    conversationId: conv?.id || null,
    mode: conv?.mode || 'ai',
    status: conv?.status || 'open',
    assignedAgentName: conv?.assignedAgentName || null,
    visitorName: conv?.visitorName || '',
    visitorEmail: conv?.visitorEmail || '',
    visitorWhatsapp: conv?.visitorWhatsapp || '',
    unreadByAgent: conv?.unreadByAgent || 0,
    escalatedToHuman: Boolean(conv?.escalatedToHuman),
    linkedContactId: conv?.linkedContactId || null,
    expiresAt: conv?.expiresAt || null,
    messages: conv?.messages || [],
    model: SUPPORT_AI_MODEL
  });
});

app.post('/api/support-ai/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};
    const cleanSession = typeof sessionId === 'string' ? sessionId.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';

    if (!cleanSession || !cleanMessage) {
      return res.status(400).json({ error: 'Session ID and message are required.' });
    }
    if (cleanMessage.length > 2000) {
      return res.status(400).json({ error: 'Message exceeds 2,000 character limit.' });
    }

    const result = await handleSupportAiChat({
      sessionId: cleanSession,
      message: cleanMessage,
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown',
      onLiveHandoff: ({ conversation, message }) => {
        broadcastToSupportAgents({
          type: 'support:handoff',
          conversation,
          message
        });
        broadcastToSupportVisitor(cleanSession, {
          type: 'support:conversation_updated',
          conversation
        });
      }
    });

    const conv = db.getSupportConversationBySession(cleanSession);
    if (conv) {
      broadcastToSupportAgents({
        type: 'support:conversation_updated',
        conversation: conv,
        escalatedTicket: result.escalatedTicket || null
      });
    }

    res.json(result);
  } catch (err: any) {
    const rawMsg = String(err?.message || 'AI Assistant could not respond right now.');
    const lower = rawMsg.toLowerCase();
    const statusCode = lower.includes('not configured')
      ? 503
      : lower.includes('api_key_invalid') || lower.includes('permission_denied')
      ? 403
      : lower.includes('resource_exhausted') || lower.includes('429')
      ? 429
      : 500;
    res.status(statusCode).json({ error: rawMsg });
  }
});

// Public Visitor: Request Live Human Coordinator Handoff (requires name before starting)
app.post('/api/support-live/handoff', (req, res) => {
  const { sessionId, name, email, whatsapp, message } = req.body || {};
  const cleanSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!cleanSession || cleanSession.length > 100 || !/^[a-zA-Z0-9_-]{6,100}$/.test(cleanSession)) {
    return res.status(400).json({ error: 'Valid support session ID is required.' });
  }
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: 'Please enter your full name before starting live human chat.' });
  }
  const cleanMsg = typeof message === 'string' ? message.trim() : '';
  if (cleanMsg.length > 2000) {
    return res.status(400).json({ error: 'Message exceeds 2,000 character limit.' });
  }

  const { conversation, message: savedMsg } = db.requestHumanSupportHandoff({
    sessionId: cleanSession,
    visitorName: cleanName.slice(0, 80),
    visitorEmail: typeof email === 'string' ? email.slice(0, 120) : undefined,
    visitorWhatsapp: typeof whatsapp === 'string' ? whatsapp.slice(0, 40) : undefined,
    initialMessage: cleanMsg || undefined
  });

  broadcastToSupportAgents({
    type: 'support:handoff',
    conversation,
    message: savedMsg
  });
  broadcastToSupportVisitor(cleanSession, {
    type: 'support:conversation_updated',
    conversation
  });

  res.status(201).json({
    ok: true,
    conversation
  });
});

// Public Visitor: Send Live Message to Human Coordinator (server-side name enforced)
app.post('/api/support-live/visitor-message', (req, res) => {
  const { sessionId, text, name, email, whatsapp } = req.body || {};
  const cleanSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  const cleanText = typeof text === 'string' ? text.trim() : '';

  if (!cleanSession || cleanSession.length > 100 || !/^[a-zA-Z0-9_-]{6,100}$/.test(cleanSession)) {
    return res.status(400).json({ error: 'Valid support session ID is required.' });
  }
  if (!cleanText || cleanText.length > 2000) {
    return res.status(400).json({ error: 'Message must be between 1 and 2,000 characters.' });
  }

  const existing = db.getSupportConversationBySession(cleanSession);
  const effectiveName =
    (typeof name === 'string' && name.trim()) || existing?.visitorName?.trim() || '';
  if (effectiveName.length < 2) {
    return res.status(400).json({ error: 'Please enter your full name before chatting with a live coordinator.' });
  }

  const { conversation, message } = db.addVisitorLiveMessage({
    sessionId: cleanSession,
    text: cleanText,
    visitorName: effectiveName.slice(0, 80),
    visitorEmail: typeof email === 'string' ? email.slice(0, 120) : undefined,
    visitorWhatsapp: typeof whatsapp === 'string' ? whatsapp.slice(0, 40) : undefined
  });

  broadcastToSupportAgents({
    type: 'support:new_message',
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
    message,
    conversation
  });
  broadcastToSupportVisitor(cleanSession, {
    type: 'support:conversation_updated',
    conversation
  });

  res.status(201).json({ ok: true, message, conversation });
});

// Public Visitor & Agent: Broadcast visitor typing indicator
app.post('/api/support-live/typing', (req, res) => {
  const { sessionId, isTyping, visitorName } = req.body || {};
  const cleanSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (cleanSession) {
    broadcastToSupportAgents({
      type: 'support:visitor_typing',
      sessionId: cleanSession,
      isTyping: Boolean(isTyping),
      visitorName: typeof visitorName === 'string' ? visitorName.slice(0, 80) : undefined
    });
  }
  res.json({ ok: true });
});

// Public Visitor: Submit CSAT Rating & Feedback
app.post('/api/support-live/rate', (req, res) => {
  const { sessionId, rating, feedback } = req.body || {};
  const cleanSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  const numRating = Number(rating);
  if (!cleanSession || isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Valid session ID and rating (1-5) are required.' });
  }

  const updated = db.rateSupportConversation(cleanSession, numRating, typeof feedback === 'string' ? feedback : undefined);
  if (updated) {
    broadcastToSupportAgents({ type: 'support:conversation_updated', conversation: updated });
    broadcastToSupportVisitor(cleanSession, { type: 'support:conversation_updated', conversation: updated });
  }
  res.json({ ok: true, conversation: updated });
});

// Public Visitor: Switch chat mode between AI and Live Human
app.post('/api/support-live/switch-mode', (req, res) => {
  const { sessionId, mode } = req.body || {};
  const cleanSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  const targetMode = mode === 'human' ? 'human' : 'ai';
  if (!cleanSession || cleanSession.length > 100) {
    return res.status(400).json({ error: 'Valid session ID is required.' });
  }
  const updated = db.switchSupportConversationMode(cleanSession, targetMode);
  if (updated) {
    broadcastToSupportAgents({ type: 'support:conversation_updated', conversation: updated });
    broadcastToSupportVisitor(cleanSession, { type: 'support:conversation_updated', conversation: updated });
  }
  res.json({ ok: true, mode: targetMode, conversation: updated });
});

// Authenticated Agents: Fetch all live conversations (prioritizing live human & unread chats)
app.get('/api/support-live/conversations', requireAuth(SUPPORT_AGENT_ROLES), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const all = db.getSupportConversations(search);
  const sorted = [...all].sort((a, b) => {
    const aHumanUnread = (a.unreadByAgent || 0) > 0 ? 2 : a.mode === 'human' || a.escalatedToHuman ? 1 : 0;
    const bHumanUnread = (b.unreadByAgent || 0) > 0 ? 2 : b.mode === 'human' || b.escalatedToHuman ? 1 : 0;
    if (bHumanUnread !== aHumanUnread) return bHumanUnread - aHumanUnread;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const totalUnread = sorted.reduce((acc, c) => acc + (c.unreadByAgent || 0), 0);
  res.json({
    conversations: sorted,
    totalUnread
  });
});

// Authenticated Agents: Send live reply to visitor (first coordinator to reply auto-claims the chat)
app.post('/api/support-live/conversations/:id/reply', requireAuth(SUPPORT_AGENT_ROLES), (req, res) => {
  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!rawText || rawText.length > 4000) {
    return res.status(400).json({ error: 'Reply message must be between 1 and 4,000 characters.' });
  }

  const actor = (req as any).user as AuthSession;
  const agentName = actor?.name || 'Council Coordinator';

  const before = db.getSupportConversationById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  const wasUnassigned = !before.assignedAgentName;

  const result = db.addAgentLiveReply({
    conversationId: req.params.id,
    text: rawText,
    agentName
  });

  if (!result) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  // First coordinator to reply claims the chat (sync code = no race between two admins)
  let conversation = result.conversation;
  let claimed = false;
  if (wasUnassigned) {
    const assigned = db.assignSupportConversation(conversation.id, agentName);
    if (assigned) {
      conversation = assigned;
      claimed = true;
    }
  }

  const eventPayload = {
    type: 'support:agent_reply',
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
    message: result.message,
    conversation
  };

  broadcastToSupportVisitor(conversation.sessionId, eventPayload);
  broadcastToSupportAgents(eventPayload);

  if (claimed) {
    broadcastToSupportAgents({
      type: 'support:conversation_updated',
      conversation,
      claimedBy: agentName
    });
  }

  res.status(201).json({
    ok: true,
    message: result.message,
    conversation,
    claimed
  });
});

// Authenticated Agents: Mark conversation unread messages as read (and broadcast read receipts to visitor)
app.patch('/api/support-live/conversations/:id/read', requireAuth(SUPPORT_AGENT_ROLES), (req, res) => {
  const updated = db.markSupportConversationRead(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  broadcastToSupportAgents({
    type: 'support:conversation_updated',
    conversation: updated
  });
  broadcastToSupportVisitor(updated.sessionId, {
    type: 'support:conversation_updated',
    conversation: updated
  });
  res.json({ ok: true, conversation: updated });
});

// Authenticated Agents: Assign support conversation to an admin/coordinator
app.patch('/api/support-live/conversations/:id/assign', requireAuth(SUPPORT_AGENT_ROLES), (req, res) => {
  const agentName = typeof req.body?.agentName === 'string' ? req.body.agentName.trim() : '';
  const updated = db.assignSupportConversation(req.params.id, agentName);
  if (!updated) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  broadcastToSupportAgents({
    type: 'support:conversation_updated',
    conversation: updated
  });
  broadcastToSupportVisitor(updated.sessionId, {
    type: 'support:conversation_updated',
    conversation: updated
  });
  res.json({ ok: true, conversation: updated });
});

// Authenticated Agents: Mark conversation resolved or reopened
app.patch('/api/support-live/conversations/:id/status', requireAuth(SUPPORT_AGENT_ROLES), (req, res) => {
  const status = req.body?.status === 'resolved' ? 'resolved' : 'open';
  const mode = req.body?.mode === 'ai' || req.body?.mode === 'human' ? req.body.mode : undefined;
  const updated = db.updateSupportConversationStatus(req.params.id, status, mode);
  if (!updated) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  broadcastToSupportAgents({
    type: 'support:conversation_updated',
    conversation: updated
  });
  broadcastToSupportVisitor(updated.sessionId, {
    type: 'support:conversation_updated',
    conversation: updated
  });
  res.json({ ok: true, conversation: updated });
});

app.get(
  '/api/support-ai/conversations',
  requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER', 'VIEWER']),
  (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const conversations = db.getSupportConversations(search);
    res.json({
      retentionDays: 7,
      model: SUPPORT_AI_MODEL,
      conversations
    });
  }
);

app.delete(
  '/api/support-ai/conversations/:id',
  requireAuth(['ADMIN', 'COMMUNICATIONS_OFFICER']),
  (req, res) => {
    const existing = db.getSupportConversationById(req.params.id);
    const deleted = db.deleteSupportConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const actor = (req as any).user;
    db.logActivity({
      userId: actor?.id || 'admin',
      userName: actor?.name || 'Administrator',
      userRole: actor?.role || 'ADMIN',
      action: 'AI_CONVERSATION_DELETED',
      entityType: 'SupportConversation',
      entityId: req.params.id,
      details: `Deleted AI support conversation ${req.params.id}${existing?.visitorName ? ` (${existing.visitorName})` : ''}`,
      ipAddress: req.ip || 'unknown'
    });
    res.json({ ok: true });
  }
);

// 10b. Admin Resend Email Dispatch, Sender Identity & Sent History
app.get('/api/email/settings', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER', 'VIEWER']), (req, res) => {
  res.json(db.getEmailSenderConfig());
});

app.put('/api/email/settings', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const { senderName, senderEmail, replyTo, logoUrl } = req.body || {};
  const cleanName = sanitizeSenderName(senderName);
  const cleanEmail = String(senderEmail || '').trim().toLowerCase();
  const cleanReplyTo = typeof replyTo === 'string' ? replyTo.trim() : '';
  const cleanLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : undefined;

  if (!cleanName) {
    return res.status(400).json({ success: false, error: 'Sender display name is required.' });
  }
  if (!isValidEmailAddress(cleanEmail)) {
    return res.status(400).json({ success: false, error: 'Sender email must be a valid email address.' });
  }
  if (cleanReplyTo && !isValidEmailAddress(cleanReplyTo)) {
    return res.status(400).json({ success: false, error: 'Default Reply-To must be a valid email address.' });
  }
  if (cleanLogoUrl && !isValidImageUrl(cleanLogoUrl)) {
    return res.status(400).json({ success: false, error: 'Header Logo URL must be a valid http(s) URL or uploaded image path.' });
  }

  const config = db.updateEmailSenderConfig({
    senderName: cleanName,
    senderEmail: cleanEmail,
    replyTo: cleanReplyTo,
    ...(cleanLogoUrl !== undefined ? { logoUrl: cleanLogoUrl } : {})
  });

  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'EMAIL_SENDER_UPDATED',
    entityType: 'WebsiteSettings',
    details: `Updated default email sender identity to "${config.senderName} <${config.senderEmail}>".`,
    ipAddress: req.ip || 'unknown'
  });

  return res.json({ success: true, config });
});

app.get('/api/email/history', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER', 'VIEWER']), (req, res) => {
  const { search, status } = req.query as Record<string, string>;
  let logs = db.getEmailLogs(300);

  if (status && status !== 'All') {
    logs = logs.filter(l => l.status === status);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    logs = logs.filter(l =>
      l.subject.toLowerCase().includes(q) ||
      l.fromEmail.toLowerCase().includes(q) ||
      l.fromName.toLowerCase().includes(q) ||
      l.to.some(r => r.toLowerCase().includes(q)) ||
      (Array.isArray(l.cc) && l.cc.some(r => r.toLowerCase().includes(q))) ||
      (Array.isArray(l.bcc) && l.bcc.some(r => r.toLowerCase().includes(q))) ||
      (l.resendId && l.resendId.toLowerCase().includes(q))
    );
  }

  res.json({ logs, total: logs.length });
});

app.delete('/api/email/history/:id', requireAuth(['ADMIN']), (req, res) => {
  const deleted = db.deleteEmailLog(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Email history record not found.' });
  }
  res.json({ success: true });
});

app.post('/api/send-email', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER']), async (req, res) => {
  try {
    const { to, cc, bcc, subject, html, message, replyTo, fromName, fromEmail, logoUrl, images, buttons } = req.body || {};
    const savedConfig = db.getEmailSenderConfig();
    const siteSettings = db.getSettings();
    const effectiveFromName = (typeof fromName === 'string' && fromName.trim()) ? fromName.trim() : savedConfig.senderName;
    const effectiveFromEmail = (typeof fromEmail === 'string' && fromEmail.trim()) ? fromEmail.trim().toLowerCase() : savedConfig.senderEmail;
    const effectiveReplyTo = typeof replyTo === 'string' ? replyTo.trim() : savedConfig.replyTo;
    const effectiveLogoUrl = logoUrl !== undefined ? (typeof logoUrl === 'string' ? logoUrl.trim() : '') : savedConfig.logoUrl;

    const result = await sendCouncilEmail({
      to,
      cc,
      bcc,
      subject,
      html,
      message,
      replyTo: effectiveReplyTo || undefined,
      fromName: effectiveFromName,
      fromEmail: effectiveFromEmail,
      logoUrl: effectiveLogoUrl || undefined,
      images: Array.isArray(images) ? images : undefined,
      buttons: Array.isArray(buttons) ? buttons : undefined,
      siteUrl: siteSettings.siteUrl || 'https://nexgencouncil.bond'
    });

    const user = (req as any).user;

    if (!result.success) {
      let failedLog = null;
      if (result.attemptedDispatch && result.resolvedMeta) {
        failedLog = db.addEmailLog({
          fromName: result.resolvedMeta.fromName,
          fromEmail: result.resolvedMeta.fromEmail,
          to: result.resolvedMeta.recipients,
          cc: result.resolvedMeta.cc.length > 0 ? result.resolvedMeta.cc : undefined,
          bcc: result.resolvedMeta.bcc.length > 0 ? result.resolvedMeta.bcc : undefined,
          replyTo: result.resolvedMeta.replyTo,
          subject: result.resolvedMeta.subject,
          message: result.resolvedMeta.message,
          html: result.resolvedMeta.html,
          logoUrl: result.resolvedMeta.logoUrl,
          images: result.resolvedMeta.images,
          buttons: result.resolvedMeta.buttons,
          status: 'Failed',
          error: result.error || 'Failed to send email.',
          sentByUserId: user.userId,
          sentByName: user.name
        });
      }

      return res.status(result.statusCode || 400).json({
        success: false,
        error: result.error || 'Failed to send email.',
        log: failedLog
      });
    }

    const savedLog = db.addEmailLog({
      resendId: result.data?.id,
      fromName: result.data?.fromName || effectiveFromName,
      fromEmail: result.data?.fromEmail || effectiveFromEmail,
      to: result.data?.recipients || [],
      cc: result.data?.cc && result.data.cc.length > 0 ? result.data.cc : undefined,
      bcc: result.data?.bcc && result.data.bcc.length > 0 ? result.data.bcc : undefined,
      replyTo: effectiveReplyTo || undefined,
      subject: result.data?.subject || String(subject || '').trim(),
      message: result.resolvedMeta?.message || String(message || '').trim() || '[Formatted Content]',
      html: result.resolvedMeta?.html,
      logoUrl: result.resolvedMeta?.logoUrl,
      images: result.resolvedMeta?.images,
      buttons: result.resolvedMeta?.buttons,
      status: 'Sent',
      sentByUserId: user.userId,
      sentByName: user.name,
      sentAt: result.data?.sentAt
    });

    const totalRecipientsCount =
      (result.data?.recipients.length || 0) +
      (result.data?.cc.length || 0) +
      (result.data?.bcc.length || 0);

    db.logActivity({
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      action: 'EMAIL_SENT',
      entityType: 'Email',
      entityId: result.data?.id,
      details: `Sent email "${result.data?.subject}" from "${savedLog.fromName} <${savedLog.fromEmail}>" to ${totalRecipientsCount} recipient(s) (To: ${result.data?.recipients.length || 0}, CC: ${result.data?.cc.length || 0}, BCC: ${result.data?.bcc.length || 0}).`,
      ipAddress: req.ip || 'unknown'
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      log: savedLog
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error while sending email.'
    });
  }
});

// 11. Website Settings & Content Management
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const updated = db.updateSettings(req.body);
  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'SETTINGS_UPDATED',
    entityType: 'WebsiteSettings',
    details: 'Website configuration and content text were updated.',
    ipAddress: getClientIp(req)
  });
  res.json(updated);
});

// 12. User & Roles Management
const ALLOWED_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'VOLUNTEER_MANAGER',
  'CONTENT_MANAGER',
  'COMMUNICATIONS_OFFICER',
  'EVENT_COORDINATOR',
  'MEETING_HOST',
  'VIEWER'
];

app.get('/api/users', requireAuth(['SUPER_ADMIN']), (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/users', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const { username, name, email, role, password, avatar } = req.body || {};
  if (!username || !name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!ALLOWED_ROLES.includes(String(role))) {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }
  const strengthErr = validatePasswordStrength(String(password).trim());
  if (strengthErr) {
    return res.status(400).json({ error: strengthErr });
  }
  const cleanAvatar = typeof avatar === 'string' ? avatar.trim() : undefined;
  if (cleanAvatar && !/^(\/|https?:\/\/)/i.test(cleanAvatar)) {
    return res.status(400).json({ error: 'Invalid avatar URL. Use a relative /uploads/ path or https:// URL.' });
  }

  try {
    const user = db.createUser({ username, name, email, role, password: String(password).trim(), avatar: cleanAvatar });
    const currentUser = (req as any).user;
    db.logActivity({
      userId: currentUser.userId,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'STAFF_CREATED',
      entityType: 'User',
      entityId: user.id,
      details: `Created new staff account for ${user.name} (@${user.username}) with assigned role "${user.role}".`,
      ipAddress: getClientIp(req)
    });
    res.status(201).json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create user.' });
  }
});

app.put('/api/users/:id', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const { id } = req.params;
  const { username, name, email, role, password, avatar } = req.body || {};
  if (role && !ALLOWED_ROLES.includes(String(role))) {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }
  if (password) {
    const strengthErr = validatePasswordStrength(String(password).trim());
    if (strengthErr) {
      return res.status(400).json({ error: strengthErr });
    }
  }
  const cleanAvatar = typeof avatar === 'string' ? avatar.trim() : undefined;
  if (cleanAvatar && !/^(\/|https?:\/\/)/i.test(cleanAvatar)) {
    return res.status(400).json({ error: 'Invalid avatar URL. Use a relative /uploads/ path or https:// URL.' });
  }

  try {
    const updated = db.updateUser(id, { username, name, email, role, password, avatar: cleanAvatar });
    if (!updated) {
      return res.status(404).json({ error: 'Staff account not found' });
    }

    const currentUser = (req as any).user;
    db.logActivity({
      userId: currentUser.userId,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'STAFF_ROLE_ASSIGNED',
      entityType: 'User',
      entityId: id,
      details: `Updated staff permissions and access for ${updated.name} (@${updated.username}) with assigned role: "${updated.role}".`,
      ipAddress: getClientIp(req)
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update staff account.' });
  }
});

app.delete('/api/users/:id', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const currentUser = (req as any).user;
  if (req.params.id === currentUser.userId) {
    return res.status(400).json({ error: 'You cannot delete your own active session account.' });
  }
  try {
    const ok = db.deleteUser(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Staff account not found' });
    }
    db.logActivity({
      userId: currentUser.userId,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'STAFF_DELETED',
      entityType: 'User',
      entityId: req.params.id,
      details: `Revoked access credentials for staff ID ${req.params.id}.`,
      ipAddress: getClientIp(req)
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete user.' });
  }
});

// 13. Dashboard Analytics & Activity Logs
app.get('/api/analytics', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR', 'MEETING_HOST', 'VIEWER']), (req, res) => {
  res.json(db.getDashboardStats());
});

app.get('/api/activity-logs', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR', 'MEETING_HOST', 'VIEWER']), (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(db.getActivityLogs(limit));
});

// 14. Real-time Image & Visual Asset Uploader (Hardened against SVG XSS & oversized payloads)
app.post('/api/upload', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR']), async (req, res) => {
  const { dataUrl, filename, image } = req.body || {};
  const payload = dataUrl || image;
  if (!payload || typeof payload !== 'string') {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  try {
    const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const persistentUploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(publicUploadsDir)) {
      fs.mkdirSync(publicUploadsDir, { recursive: true });
    }
    if (!fs.existsSync(persistentUploadsDir)) {
      fs.mkdirSync(persistentUploadsDir, { recursive: true });
    }

    if (payload.startsWith('data:image/')) {
      // Strictly whitelist safe raster formats only (blocks SVG XSS scripts)
      const matches = payload.match(/^data:image\/(png|jpeg|jpg|webp|gif)(?:;[^;,=]+=[^;,]+)*;base64,([\s\S]+)$/i);
      if (!matches) {
        return res.status(400).json({ error: 'Only PNG, JPG, WEBP, and GIF raster images are permitted.' });
      }
      const rawExt = matches[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const base64Data = matches[2].replace(/\s+/g, '');
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image size exceeds 5MB maximum limit.' });
      }

      const rawName = String(filename || 'upload').replace(/[^a-zA-Z0-9_-]/g, '_');
      const finalName = `${Date.now()}_${rawName.slice(0, 30)}.${ext}`;
      const publicFilePath = path.join(publicUploadsDir, finalName);
      const persistentFilePath = path.join(persistentUploadsDir, finalName);

      fs.writeFileSync(publicFilePath, buffer);

      try {
        fs.writeFileSync(persistentFilePath, buffer);
      } catch (e) {
        console.warn('[Storage] Could not write to data/uploads backup:', e);
      }

      mongoSaveMedia(finalName, payload, mimeType, buffer.length).catch(mErr => {
        console.warn('[MongoDB] Background media persistence notice:', mErr?.message);
      });

      return res.json({
        ok: true,
        url: `/uploads/${finalName}`,
        filename: finalName
      });
    }

    // Only allow safe http/https or relative /uploads URLs as pass-through
    if (!/^https?:\/\//i.test(payload) && !payload.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Invalid image URL protocol.' });
    }

    res.json({
      ok: true,
      url: payload,
      filename: filename || 'image.png'
    });
  } catch (err: any) {
    console.error('Error saving uploaded image:', err);
    res.status(500).json({ error: 'Failed to process uploaded image.' });
  }
});

// 15. Real-time Analytics & Visitor Tracking (MongoDB + Persistent Fallback)
const sanitizeTelemetryStr = (val: unknown, maxLen = 120): string | undefined => {
  if (typeof val !== 'string') return undefined;
  const cleaned = val.replace(/[\r\n\t<>]/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLen) : undefined;
};

const VALID_ANALYTICS_RANGES: AnalyticsRange[] = ['1h', '24h', '7d', '30d', 'all'];

function parseAnalyticsQuery(req: Request): { range: AnalyticsRange; includeAdmin: boolean } {
  const rawRange = String(req.query.range || '24h').toLowerCase() as AnalyticsRange;
  const range: AnalyticsRange = VALID_ANALYTICS_RANGES.includes(rawRange) ? rawRange : '24h';
  const includeAdmin = String(req.query.includeAdmin || '').toLowerCase() === 'true';
  return { range, includeAdmin };
}

app.post('/api/analytics/track', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = sanitizeTelemetryStr(body.sessionId, 80);
    if (sessionId) {
      await recordAnalyticsEvent({
        sessionId,
        visitorId: sanitizeTelemetryStr(body.visitorId, 80),
        isReturning: Boolean(body.isReturning),
        isAdmin: typeof body.isAdmin === 'boolean' ? body.isAdmin : undefined,
        path: sanitizeTelemetryStr(body.path, 160) || '/',
        referrer: sanitizeTelemetryStr(body.referrer, 300),
        referrerDomain: sanitizeTelemetryStr(body.referrerDomain, 120),
        trafficSource: sanitizeTelemetryStr(body.trafficSource, 60),
        utmSource: sanitizeTelemetryStr(body.utmSource, 80),
        utmMedium: sanitizeTelemetryStr(body.utmMedium, 80),
        utmCampaign: sanitizeTelemetryStr(body.utmCampaign, 100),
        device: sanitizeTelemetryStr(body.device, 40),
        browser: sanitizeTelemetryStr(body.browser, 50),
        os: sanitizeTelemetryStr(body.os, 50),
        screenWidth: Number(body.screenWidth) || undefined,
        screenResolution: sanitizeTelemetryStr(body.screenResolution, 30),
        viewport: sanitizeTelemetryStr(body.viewport, 30),
        timezone: sanitizeTelemetryStr(body.timezone, 80),
        language: sanitizeTelemetryStr(body.language, 30),
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress,
        timestamp: new Date().toISOString()
      });
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.post('/api/analytics/heartbeat', async (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = sanitizeTelemetryStr(body.sessionId, 80);
    if (sessionId) {
      await recordVisitorHeartbeat(
        sessionId,
        sanitizeTelemetryStr(body.path, 160) || '/',
        Number(body.durationDeltaSec) || 0
      );
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.get('/api/analytics/realtime', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR', 'MEETING_HOST', 'VIEWER']), async (req, res) => {
  try {
    const { range, includeAdmin } = parseAnalyticsQuery(req);
    const orgContext = db.getAnalyticsOrgContext();
    const insights = await getRealtimeInsights(orgContext.totalApplications, orgContext.totalVolunteers, {
      range,
      includeAdmin,
      orgContext
    });
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/export', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR', 'MEETING_HOST', 'VIEWER']), async (req, res) => {
  try {
    const { range, includeAdmin } = parseAnalyticsQuery(req);
    const format = String(req.query.format || 'csv').toLowerCase();
    const orgContext = db.getAnalyticsOrgContext();
    const insights = await getRealtimeInsights(orgContext.totalApplications, orgContext.totalVolunteers, {
      range,
      includeAdmin,
      orgContext
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="nexgen-analytics-${range}.json"`);
      return res.send(JSON.stringify(insights, null, 2));
    }

    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      // Guard CSV formula injection & wrap commas/quotes cleanly
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [];
    lines.push('SECTION,METRIC,VALUE,EXTRA');
    lines.push(['Summary', 'Timeframe', insights.rangeMeta?.range, insights.rangeMeta?.generatedAt].map(csvEscape).join(','));
    lines.push(['Summary', 'Scope', includeAdmin ? 'All Traffic (incl. Admin)' : 'Public Website Only', insights.rangeMeta?.storageMode].map(csvEscape).join(','));
    lines.push(['Summary', 'Live Active Visitors', insights.activeVisitors, `Public: ${insights.activePublicVisitors} | Admin: ${insights.activeAdminVisitors}`].map(csvEscape).join(','));
    lines.push(['Summary', 'Impressions (Selected Range)', insights.rangePageViews, `All-time: ${insights.totalPageViews}`].map(csvEscape).join(','));
    lines.push(['Summary', 'Unique Sessions (Selected Range)', insights.engagement?.rangeUniqueSessions, `Unique Visitors: ${insights.engagement?.rangeUniqueVisitors}`].map(csvEscape).join(','));
    lines.push(['Summary', 'Avg Session Duration (sec)', insights.engagement?.avgSessionDurationSec, `Pages/Session: ${insights.engagement?.avgPagesPerSession}`].map(csvEscape).join(','));
    lines.push(['Summary', 'Bounce Rate (%)', insights.engagement?.bounceRate, `Returning Rate: ${insights.engagement?.returningRate}%`].map(csvEscape).join(','));
    lines.push(['Summary', 'Intake Conversion Rate (%)', insights.conversionRate, `Apps: ${orgContext.totalApplications} | Approved: ${orgContext.approvedApplications}`].map(csvEscape).join(','));

    lines.push('');
    lines.push('TOP PAGES,PATH,VIEWS,UNIQUE SESSIONS / AVG DWELL SEC');
    for (const p of insights.topPages || []) {
      lines.push(['Top Page', p.page, p.views, `Sessions: ${p.uniqueVisitors} | Share: ${p.percentage}% | Avg Dwell: ${p.avgDwellSec}s`].map(csvEscape).join(','));
    }

    lines.push('');
    lines.push('ACQUISITION CHANNELS,CHANNEL,IMPRESSIONS,SESSIONS / SHARE');
    for (const ch of insights.acquisition?.channels || []) {
      lines.push(['Channel', ch.name, ch.count, `Sessions: ${ch.sessions} | Share: ${ch.percentage}%`].map(csvEscape).join(','));
    }

    lines.push('');
    lines.push('RECENT TELEMETRY EVENTS,TIMESTAMP,ROUTE,DETAILS');
    for (const ev of insights.recentActivity || []) {
      lines.push(['Event', ev.timestamp, ev.path, `${ev.device} | ${ev.browser} | ${ev.os} | ${ev.trafficSource || 'Direct'} | ${ev.timezone || ''}`].map(csvEscape).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexgen-analytics-${range}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. MongoDB & System Status (Strictly Super Admin Authenticated)
app.get('/api/system/database-status', requireAuth(['SUPER_ADMIN']), async (req, res) => {
  const mongoStatus = await getMongoStatus();
  const summary = {
    ...mongoStatus,
    serverUptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    recordCounts: {
      users: db.getUsers().length,
      applications: db.getApplications().total,
      volunteers: db.getVolunteers().length,
      programs: db.getPrograms().length,
      events: db.getEvents().length,
      news: db.getNews().length,
      contacts: db.getContacts().length
    },
    oracleVmReady: true
  };
  res.json(summary);
});

app.post('/api/system/database-test', requireAuth(['SUPER_ADMIN']), async (req, res) => {
  const { uri } = req.body;
  if (!uri) {
    return res.status(400).json({ success: false, message: 'Please provide a MongoDB connection URI.' });
  }
  const result = await testMongoConnection(uri);
  res.json(result);
});

app.post('/api/system/database-connect', requireAuth(['SUPER_ADMIN']), async (req, res) => {
  const { uri } = req.body;
  if (!uri || !uri.trim()) {
    return res.status(400).json({ success: false, message: 'Please provide a valid MongoDB connection URI.' });
  }
  try {
    const result = await reconnectMongo(uri.trim());
    if (result.success) {
      await db.initFromMongo();
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/system/database-sync', requireAuth(['SUPER_ADMIN']), async (req, res) => {
  try {
    await db.syncAllToMongo();
    res.json({ success: true, message: 'Data synchronization to MongoDB triggered successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/system/database-purge-mock', requireAuth(['SUPER_ADMIN']), async (req, res) => {
  try {
    const result = await db.purgeMockData();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/system/admin-credentials', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const creds = db.getActiveSuperAdminInfo();
  res.json(creds);
});

app.post('/api/system/admin-credentials', passwordChangeLimiter, requireAuth(['SUPER_ADMIN']), (req, res) => {
  const session = (req as any).user as AuthSession;
  const username = String(req.body?.username || '').trim();
  const currentPassword = String(req.body?.currentPassword || '').trim();
  const password = String(req.body?.password || '').trim();
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and new password are required.' });
  }
  if (!currentPassword) {
    return res.status(400).json({ success: false, message: 'Current admin password is required to confirm this change.' });
  }
  if (!db.verifyUserPassword(session.userId, currentPassword)) {
    return res.status(401).json({ success: false, message: 'Current admin password is incorrect.' });
  }
  const strengthErr = validatePasswordStrength(password);
  if (strengthErr) {
    return res.status(400).json({ success: false, message: strengthErr });
  }

  try {
    const updatedUser = db.updateSuperAdminCredentials(username, password, email);
    if (session.jti) {
      revokedTokenJtis.set(session.jti, session.exp);
    }

    const now = Date.now();
    const refreshedPayload: AuthSession = {
      userId: updatedUser.id,
      username: updatedUser.username,
      name: updatedUser.name,
      role: updatedUser.role,
      jti: crypto.randomBytes(16).toString('hex'),
      iat: now,
      tv: db.getUserTokenVersion(updatedUser.id),
      exp: now + SESSION_TTL_MS
    };
    const freshToken = signToken(refreshedPayload);
    res.setHeader('Set-Cookie', buildSessionCookie(req, freshToken, Math.floor(SESSION_TTL_MS / 1000)));

    db.logActivity({
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: 'SUPER_ADMIN_CREDENTIALS_UPDATED',
      entityType: 'Security',
      entityId: updatedUser.id,
      details: `Updated Super Admin credentials for @${updatedUser.username} and rotated active session tokens.`,
      ipAddress: getClientIp(req)
    });

    res.json({
      ok: true,
      success: true,
      token: freshToken,
      message: 'Super Admin credentials securely updated. Other active sessions were invalidated.',
      user: updatedUser
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// VITE MIDDLEWARE & STATIC SERVING
// ----------------------------------------------------

async function startServer() {
  // Ensure public/uploads, data/uploads, and meeting capture directories exist
  const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const persistentUploadsDir = path.join(process.cwd(), 'data', 'uploads');
  const publicMeetingsDir = path.join(publicUploadsDir, 'meetings');
  const persistentMeetingsDir = path.join(persistentUploadsDir, 'meetings');
  for (const dirPath of [publicUploadsDir, persistentUploadsDir, publicMeetingsDir, persistentMeetingsDir]) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Restore any persisted images & meeting captures from data/uploads to public/uploads on startup
  try {
    const backupFiles = fs.readdirSync(persistentUploadsDir);
    for (const file of backupFiles) {
      const srcPath = path.join(persistentUploadsDir, file);
      const destPath = path.join(publicUploadsDir, file);
      if (!fs.existsSync(destPath) && fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    const backupMeetingFiles = fs.readdirSync(persistentMeetingsDir);
    for (const file of backupMeetingFiles) {
      const srcPath = path.join(persistentMeetingsDir, file);
      const destPath = path.join(publicMeetingsDir, file);
      if (!fs.existsSync(destPath) && fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch (syncErr) {
    console.warn('[Storage] Uploads sync error on startup:', syncErr);
  }

  // Dedicated /uploads/meetings/:filename serving handler with Range playback & backup restore
  app.get('/uploads/meetings/:filename', (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const publicPath = path.join(publicMeetingsDir, safeFilename);
    const backupPath = path.join(persistentMeetingsDir, safeFilename);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=259200');

    if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
      return res.sendFile(publicPath);
    }

    if (fs.existsSync(backupPath) && fs.statSync(backupPath).isFile()) {
      try {
        fs.copyFileSync(backupPath, publicPath);
        return res.sendFile(publicPath);
      } catch {
        return res.sendFile(backupPath);
      }
    }

    return res.status(404).send('Meeting capture not found');
  });

  // Resilient /uploads/:filename serving handler with auto-restoration from data/uploads and MongoDB
  app.get('/uploads/:filename', async (req, res, next) => {
    const rawFilename = req.params.filename;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(rawFilename);
    const publicPath = path.join(publicUploadsDir, safeFilename);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('X-Robots-Tag', 'index, follow');

    // 1. Direct file on disk
    if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
      return res.sendFile(publicPath);
    }

    // 2. Check local data/uploads backup
    const backupPath = path.join(persistentUploadsDir, safeFilename);
    if (fs.existsSync(backupPath) && fs.statSync(backupPath).isFile()) {
      try {
        fs.copyFileSync(backupPath, publicPath);
        return res.sendFile(publicPath);
      } catch {
        return res.sendFile(backupPath);
      }
    }

    // 3. Check MongoDB 'media' collection if file was lost due to git pull/wipe
    try {
      const mediaDoc = await mongoGetMedia(safeFilename);
      if (mediaDoc && mediaDoc.dataUrl) {
        const matches = String(mediaDoc.dataUrl).match(/^data:image\/([a-zA-Z0-9.+-]+)(?:;[^;,=]+=[^;,]+)*;base64,([\s\S]+)$/i);
        if (matches) {
          const buffer = Buffer.from(matches[2].replace(/\s+/g, ''), 'base64');
          // Cache restored file to disk so future requests are instant
          try {
            fs.writeFileSync(publicPath, buffer);
            fs.writeFileSync(backupPath, buffer);
          } catch {}
          res.setHeader('Content-Type', mediaDoc.mimeType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.send(buffer);
        }
      }
    } catch (mErr: any) {
      console.warn('[Storage] MongoDB media retrieval error:', mErr?.message);
    }

    return res.status(404).send('Image not found');
  });

  app.use('/uploads', express.static(publicUploadsDir, {
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    }
  }));

  // Canonical URL normalization & 301 redirects for search engine crawlers
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || (req.path.includes('.') && !req.path.endsWith('.html'))) {
      return next();
    }

    const hostHeader = ((req.headers['x-forwarded-host'] as string) || req.headers.host || '').split(',')[0].trim();
    const hostname = hostHeader.split(':')[0].toLowerCase();
    const proto = ((req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http')).split(',')[0].trim().toLowerCase();
    const queryIdx = req.originalUrl.indexOf('?');
    const querySuffix = queryIdx !== -1 ? req.originalUrl.slice(queryIdx) : '';

    // 1. Redirect www.nexgencouncil.bond (or http on production domain) -> https://nexgencouncil.bond
    if (hostname === 'www.nexgencouncil.bond' || (hostname === 'nexgencouncil.bond' && proto === 'http')) {
      const cleanPath = req.path.length > 1 ? req.path.replace(/\/+$/, '') : '/';
      return res.redirect(301, `https://nexgencouncil.bond${cleanPath}${querySuffix}`);
    }

    // 2. Strip trailing slash on non-root page URLs (e.g., /programs/foo/ -> /programs/foo)
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const stripped = req.path.replace(/\/+$/, '');
      return res.redirect(301, `${stripped}${querySuffix}`);
    }

    // 3. 301 Redirect legacy alias URLs to their single canonical route
    const aliasRedirects: Record<string, string> = {
      '/home': '/',
      '/about-us': '/about',
      '/upcoming-events': '/events',
      '/news-and-updates': '/news',
      '/leadership': '/team',
      '/volunteer-with-us': '/volunteer',
      '/volunteer-apply': '/volunteer',
      '/track-application': '/track',
      '/contact-us': '/contact'
    };
    const lowerPath = req.path.toLowerCase();
    if (aliasRedirects[lowerPath]) {
      return res.redirect(301, `${aliasRedirects[lowerPath]}${querySuffix}`);
    }

    next();
  });

  // 1. Robots.txt Route
  app.get('/robots.txt', (req, res) => {
    const siteUrl = getSiteBaseUrl(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(generateRobotsTxt(siteUrl));
  });

  // 2. Sitemap.xml Route
  app.get('/sitemap.xml', (req, res) => {
    const siteUrl = getSiteBaseUrl(req);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(generateSitemapXml(siteUrl));
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      // Don't intercept files with extensions (e.g. .js, .css, .png, etc.)
      if (req.path.includes('.') && !req.path.endsWith('.html')) {
        return next();
      }

      try {
        const url = req.originalUrl;
        const requestedPath = (req.originalUrl || req.url || req.path).split('?')[0];
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        const siteUrl = getSiteBaseUrl(req);
        const metadata = getRouteMetadata(requestedPath, siteUrl);
        const settings = db.getSettings();
        const gsc = process.env.GOOGLE_SITE_VERIFICATION || settings.googleSiteVerification;
        const ga = process.env.GA_TRACKING_ID || settings.googleAnalyticsId;
        const html = injectSeoIntoHtml(
          template,
          metadata,
          siteUrl,
          gsc,
          ga,
          typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
        );
        const statusCode = metadata.title.includes('404') ? 404 : 200;
        res.status(statusCode).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Keep server-only packaged assets private behind authenticated API routes
    app.use('/server-assets', (_req, res) => res.status(404).end());
    // Long-term immutable caching for Vite hashed production assets (/assets/*)
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }));
    // Static assets (images, webp, png, fonts, robots.txt, sitemap)
    app.use(express.static(distPath, {
      index: false,
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        if (/\.(png|jpe?g|webp|svg|ico|gif)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        } else if (/\.(woff2?|ttf|eot)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res) => {
      try {
        const indexPath = path.join(distPath, 'index.html');
        if (!fs.existsSync(indexPath)) {
          return res.status(404).send('Production build not found. Please run npm run build.');
        }
        const requestedPath = (req.originalUrl || req.url || req.path).split('?')[0];
        const template = fs.readFileSync(indexPath, 'utf-8');
        const siteUrl = getSiteBaseUrl(req);
        const metadata = getRouteMetadata(requestedPath, siteUrl);
        const settings = db.getSettings();
        const gsc = process.env.GOOGLE_SITE_VERIFICATION || settings.googleSiteVerification;
        const ga = process.env.GA_TRACKING_ID || settings.googleAnalyticsId;
        const html = injectSeoIntoHtml(
          template,
          metadata,
          siteUrl,
          gsc,
          ga,
          typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
        );
        const statusCode = metadata.title.includes('404') ? 404 : 200;
        res.status(statusCode).set({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }).send(html);
      } catch (err: any) {
        res.status(500).send('Internal Server Error: ' + err.message);
      }
    });
  }

  // Hydrate MongoDB before accepting SSR/API traffic (bounded wait so server always boots cleanly)
  try {
    const mongoConnected = await Promise.race([
      initMongo(),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 6000))
    ]);
    if (mongoConnected) {
      await db.initFromMongo();
      console.log('[MongoDB] Schema verified and hydrated from live MongoDB.');
      const restored = await mongoRestoreAllMediaToDisk([publicUploadsDir, persistentUploadsDir]);
      if (restored > 0) {
        console.log(`[Storage] Successfully restored ${restored} media assets from MongoDB to local storage.`);
      }
    }
  } catch (mErr: any) {
    console.warn('[MongoDB] Init warning:', mErr?.message || mErr);
  }

  // Purge any AI support conversations (7 days) and meeting captures (3 days) and schedule hourly cleanup
  try {
    const purged = db.purgeExpiredSupportConversations();
    if (purged > 0) {
      console.log(`[Support AI] Purged ${purged} expired conversation(s) older than 7 days.`);
    }
    const purgedCaps = db.purgeExpiredMeetingCaptures();
    if (purgedCaps > 0) {
      console.log(`[Meetings] Purged ${purgedCaps} expired meeting capture(s) older than 3 days.`);
    }
  } catch {}
  setInterval(() => {
    try {
      db.purgeExpiredSupportConversations();
      db.purgeExpiredMeetingCaptures();
    } catch {}
  }, 60 * 60 * 1000);

  const supportWss = new WebSocketServer({ noServer: true });

  const wsAliveMap = new WeakMap<WebSocket, boolean>();

  supportWss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    wsAliveMap.set(ws, true);
    ws.on('pong', () => {
      wsAliveMap.set(ws, true);
    });

    const parsedUrl = new URL(req.url || '/ws/support', 'http://localhost');
    const role = parsedUrl.searchParams.get('role');

    if (role === 'agent') {
      agentSupportSockets.add(ws);
      safeWsSend(ws, { type: 'support:connected', role: 'agent' });
      ws.on('close', () => {
        agentSupportSockets.delete(ws);
      });
      ws.on('error', () => {
        agentSupportSockets.delete(ws);
      });
    } else {
      const sessionId = (parsedUrl.searchParams.get('sessionId') || '').trim();
      if (!sessionId || !/^[a-zA-Z0-9_-]{6,100}$/.test(sessionId)) {
        ws.close(1008, 'Invalid sessionId');
        return;
      }
      if (!visitorSupportSockets.has(sessionId)) {
        visitorSupportSockets.set(sessionId, new Set());
      }
      visitorSupportSockets.get(sessionId)!.add(ws);
      safeWsSend(ws, { type: 'support:connected', role: 'visitor', sessionId });

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          if (data?.type === 'support:visitor_typing') {
            broadcastToSupportAgents({
              type: 'support:visitor_typing',
              sessionId,
              isTyping: Boolean(data.isTyping),
              visitorName: typeof data.visitorName === 'string' ? data.visitorName.slice(0, 80) : undefined
            });
          }
        } catch {}
      });

      const cleanup = () => {
        const set = visitorSupportSockets.get(sessionId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            visitorSupportSockets.delete(sessionId);
          }
        }
      };
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    }
  });

  const wsHeartbeatTimer = setInterval(() => {
    for (const ws of supportWss.clients) {
      if (wsAliveMap.get(ws) === false) {
        try {
          ws.terminate();
        } catch {}
        continue;
      }
      wsAliveMap.set(ws, false);
      try {
        ws.ping();
      } catch {}
    }
  }, 25000).unref();

  supportWss.on('close', () => clearInterval(wsHeartbeatTimer));

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url || '/', 'http://localhost');
      if (parsedUrl.pathname !== '/ws/support') {
        const wsProto = String(request.headers['sec-websocket-protocol'] || '').toLowerCase();
        if (process.env.NODE_ENV !== 'production' && (wsProto.includes('vite') || parsedUrl.pathname === '/')) {
          return;
        }
        socket.destroy();
        return;
      }

      const role = parsedUrl.searchParams.get('role') || 'visitor';
      if (role === 'agent') {
        const cookies = parseCookies(request.headers.cookie);
        const queryToken = parsedUrl.searchParams.get('token') || undefined;
        const authHeader = typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ')
          ? request.headers.authorization.slice(7).trim()
          : undefined;
        const session = verifyToken(queryToken) || verifyToken(authHeader) || verifyToken(cookies['ng_session']);
        const roleNorm = normalizeRole(session?.role);
        const allowed = SUPPORT_AGENT_ROLES.map(r => normalizeRole(r));
        if (!session || (roleNorm !== 'SUPER_ADMIN' && !allowed.includes(roleNorm))) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      } else {
        const sessionId = (parsedUrl.searchParams.get('sessionId') || '').trim();
        if (!sessionId || !/^[a-zA-Z0-9_-]{6,100}$/.test(sessionId)) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      supportWss.handleUpgrade(request, socket, head, (ws) => {
        supportWss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NexGen Council Server + WebSocket Support running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
