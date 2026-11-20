import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { db, resolveAdminCredentials } from './server/db.ts';
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
import { sendCouncilEmail, sanitizeSenderName, isValidEmailAddress, isValidImageUrl } from './server/email.ts';

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);
app.disable('x-powered-by');

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
app.use('/api', rateLimit(240, 60 * 1000, 'global_api'));

// Origin / CSRF guard for cookie-authenticated state-changing requests
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  // Skip check for explicit Bearer header API clients or public analytics beacons
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string || req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (origin && host) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost !== host) {
        return res.status(403).json({ error: 'Cross-site request blocked for security.' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin.' });
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

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Authentication (Protected by Brute-Force Lockout Shield)
app.post('/api/auth/login', async (req, res) => {
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
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `ng_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureFlag}`
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

// 2FA Step 2: Verify TOTP or single-use Backup Code
app.post('/api/auth/2fa/verify-login', async (req, res) => {
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
app.post('/api/auth/2fa/setup', requireAuth(), async (req, res) => {
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
app.post('/api/auth/2fa/verify-setup', requireAuth(), (req, res) => {
  const session = (req as any).user as AuthSession;
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
    return res.status(400).json({ error: 'Invalid 6-digit code. Make sure your device clock is synced and try the latest code.' });
  }

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
app.post('/api/auth/2fa/disable', requireAuth(), (req, res) => {
  const session = (req as any).user as AuthSession;
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
    return res.status(401).json({
      error: 'Verification failed. Enter your current password or a valid 6-digit Google Authenticator code to disable 2FA.'
    });
  }

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
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ng_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);
  res.json({ ok: true });
});

app.post('/api/auth/revoke-all', requireAuth(['SUPER_ADMIN']), (req, res) => {
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
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ng_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);
  res.json({ ok: true, revokedAt: cutoff, message: 'All active admin sessions have been signed out immediately.' });
});

app.put('/api/auth/change-password', requireAuth(), (req, res) => {
  const session = (req as any).user as AuthSession;
  const currentPassword = String(req.body?.currentPassword || '').trim();
  const newPassword = String(req.body?.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }
  if (!db.verifyUserPassword(session.userId, currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  try {
    db.updateUser(session.userId, { password: newPassword });
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
    res.json({ ok: true, message: 'Password updated cleanly. Other active sessions were invalidated.' });
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
    svgUploadBlocked: true
  });
});

app.get('/api/auth/session', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ authenticated: false });
  }
  const user = db.getUserById(session.userId);
  if (!user) {
    return res.status(401).json({ authenticated: false });
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

// Applicant public status lookup
app.get('/api/applications/verify/:refCode', (req, res) => {
  const refCode = req.params.refCode.trim();
  const appItem = db.getApplicationById(refCode);
  if (!appItem) {
    return res.status(404).json({ error: 'Application reference code not found.' });
  }
  res.json({
    referenceCode: appItem.referenceCode,
    fullName: appItem.fullName,
    city: appItem.city,
    status: appItem.status,
    submittedAt: appItem.createdAt,
    preferredRole: appItem.preferredRole
  });
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

app.patch('/api/applications/:id/status', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER']), (req, res) => {
  const { status, internalNotes } = req.body;
  if (!['Pending', 'Under Review', 'Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid application status.' });
  }

  const user = (req as any).user;
  const updated = db.updateApplicationStatus(req.params.id, status, internalNotes, {
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
    details: `Application ${updated.referenceCode} (${updated.fullName}) marked as ${status}. ${internalNotes ? `Notes: ${internalNotes}` : ''}`,
    ipAddress: req.ip || 'unknown'
  });

  res.json(updated);
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

app.post('/api/events', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  const body = req.body;
  if (!body.title || !body.date) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }
  const eventItem = db.createEvent({
    title: body.title,
    category: body.category || 'General',
    description: body.description || '',
    image: body.image || 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=900&auto=format&fit=crop&q=80',
    date: body.date,
    time: body.time || '10:00 AM',
    location: body.location || 'Online / Regional Center',
    isVirtual: Boolean(body.isVirtual),
    registrationUrl: body.registrationUrl || '#volunteer',
    status: body.status || 'Upcoming',
    capacity: body.capacity ? Number(body.capacity) : 100,
    registeredCount: 0
  });

  const user = (req as any).user;
  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'EVENT_CREATED',
    entityType: 'Event',
    entityId: eventItem.id,
    details: `Created event: "${eventItem.title}" on ${eventItem.date}`,
    ipAddress: req.ip || 'unknown'
  });

  res.status(201).json(eventItem);
});

app.put('/api/events/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'EVENT_COORDINATOR']), (req, res) => {
  const updated = db.updateEvent(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Event not found' });
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
  const body = req.body;
  if (!body.title || !body.content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }
  const slug = body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const user = (req as any).user;
  const newsItem = db.createNews({
    title: body.title,
    slug,
    category: body.category || 'Announcement',
    author: body.author || user.name,
    authorRole: body.authorRole || 'Editorial Board',
    coverImage: body.coverImage || 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=900&auto=format&fit=crop&q=80',
    summary: body.summary || body.content.slice(0, 150) + '...',
    content: body.content,
    publishedAt: body.publishedAt || new Date().toISOString(),
    status: body.status || 'Published',
    featured: Boolean(body.featured)
  });

  db.logActivity({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'NEWS_POSTED',
    entityType: 'News',
    entityId: newsItem.id,
    details: `Published news article: "${newsItem.title}"`,
    ipAddress: req.ip || 'unknown'
  });

  res.status(201).json(newsItem);
});

app.put('/api/news/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER']), (req, res) => {
  const updated = db.updateNews(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Article not found' });
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

// 10. Contact
app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  const contact = db.createContact({ name, email, phone, subject: subject || 'General Inquiry', message });
  db.logActivity({
    userId: 'public_visitor',
    userName: name,
    userRole: 'VISITOR',
    action: 'CONTACT_SUBMITTED',
    entityType: 'ContactMessage',
    entityId: contact.id,
    details: `Contact message received from ${name} (${email}): "${subject}"`,
    ipAddress: req.ip || 'unknown'
  });
  res.status(201).json({ ok: true, message: 'Message sent successfully. Our team will contact you shortly.' });
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
    const { to, subject, html, message, replyTo, fromName, fromEmail, logoUrl, images } = req.body || {};
    const savedConfig = db.getEmailSenderConfig();
    const siteSettings = db.getSettings();
    const effectiveFromName = (typeof fromName === 'string' && fromName.trim()) ? fromName.trim() : savedConfig.senderName;
    const effectiveFromEmail = (typeof fromEmail === 'string' && fromEmail.trim()) ? fromEmail.trim().toLowerCase() : savedConfig.senderEmail;
    const effectiveReplyTo = typeof replyTo === 'string' ? replyTo.trim() : savedConfig.replyTo;
    const effectiveLogoUrl = logoUrl !== undefined ? (typeof logoUrl === 'string' ? logoUrl.trim() : '') : savedConfig.logoUrl;

    const result = await sendCouncilEmail({
      to,
      subject,
      html,
      message,
      replyTo: effectiveReplyTo || undefined,
      fromName: effectiveFromName,
      fromEmail: effectiveFromEmail,
      logoUrl: effectiveLogoUrl || undefined,
      images: Array.isArray(images) ? images : undefined,
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
          replyTo: result.resolvedMeta.replyTo,
          subject: result.resolvedMeta.subject,
          message: result.resolvedMeta.message,
          logoUrl: result.resolvedMeta.logoUrl,
          images: result.resolvedMeta.images,
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
      replyTo: effectiveReplyTo || undefined,
      subject: result.data?.subject || String(subject || '').trim(),
      message: String(message || '').trim() || '[HTML Content]',
      logoUrl: result.resolvedMeta?.logoUrl,
      images: result.resolvedMeta?.images,
      status: 'Sent',
      sentByUserId: user.userId,
      sentByName: user.name,
      sentAt: result.data?.sentAt
    });

    db.logActivity({
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      action: 'EMAIL_SENT',
      entityType: 'Email',
      entityId: result.data?.id,
      details: `Sent email "${result.data?.subject}" from "${savedLog.fromName} <${savedLog.fromEmail}>" to ${result.data?.recipients.length || 0} recipient(s).`,
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
    ipAddress: req.ip || 'unknown'
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
  if (String(password).trim().length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long for security.' });
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
  if (password && String(password).trim().length < 8) {
    return res.status(400).json({ error: 'Reset password must be at least 8 characters long.' });
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
      const matches = payload.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Only PNG, JPG, WEBP, and GIF raster images are permitted.' });
      }
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const base64Data = matches[2];
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

// 15. Real-time Analytics & Visitor Tracking (MongoDB-Backed)
app.post('/api/analytics/track', async (req, res) => {
  try {
    const { sessionId, path: reqPath, referrer, device, browser, os, screenWidth } = req.body;
    if (sessionId) {
      await recordAnalyticsEvent({
        sessionId,
        path: reqPath || '/',
        referrer,
        device,
        browser,
        os,
        screenWidth: Number(screenWidth) || undefined,
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
    const { sessionId, path: reqPath } = req.body;
    if (sessionId) {
      await recordVisitorHeartbeat(sessionId, reqPath || '/');
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.get('/api/analytics/realtime', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'COMMUNICATIONS_OFFICER', 'EVENT_COORDINATOR', 'MEETING_HOST', 'VIEWER']), async (req, res) => {
  try {
    const appsCount = db.getApplications({ perPage: 1000 }).total;
    const volsCount = db.getVolunteers().length;
    const insights = await getRealtimeInsights(appsCount, volsCount);
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. MongoDB & System Status (Strictly Super Admin Authenticated)
app.get('/api/system/database-status', requireAuth(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
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
  const creds = resolveAdminCredentials();
  res.json({
    username: creds.username,
    email: creds.email,
    source: creds.source,
    isCustomConfigured: creds.source !== 'default'
  });
});

app.post('/api/system/admin-credentials', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
  }
  try {
    const updatedUser = db.updateSuperAdminCredentials(username, password, email);
    res.json({
      success: true,
      message: 'Super Admin credentials successfully updated and synced across .env and persistent storage.',
      user: updatedUser
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// VITE MIDDLEWARE & STATIC SERVING
// ----------------------------------------------------

async function startServer() {
  // Ensure public/uploads and data/uploads directories exist
  const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const persistentUploadsDir = path.join(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(publicUploadsDir)) {
    fs.mkdirSync(publicUploadsDir, { recursive: true });
  }
  if (!fs.existsSync(persistentUploadsDir)) {
    fs.mkdirSync(persistentUploadsDir, { recursive: true });
  }

  // Restore any persisted images from data/uploads to public/uploads on startup
  try {
    const backupFiles = fs.readdirSync(persistentUploadsDir);
    for (const file of backupFiles) {
      const srcPath = path.join(persistentUploadsDir, file);
      const destPath = path.join(publicUploadsDir, file);
      if (!fs.existsSync(destPath) && fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch (syncErr) {
    console.warn('[Storage] Uploads sync error on startup:', syncErr);
  }

  // Resilient /uploads/:filename serving handler with auto-restoration from data/uploads and MongoDB
  app.get('/uploads/:filename', async (req, res, next) => {
    const rawFilename = req.params.filename;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(rawFilename);
    const publicPath = path.join(publicUploadsDir, safeFilename);

    // 1. Direct file on disk
    if (fs.existsSync(publicPath)) {
      return res.sendFile(publicPath);
    }

    // 2. Check local data/uploads backup
    const backupPath = path.join(persistentUploadsDir, safeFilename);
    if (fs.existsSync(backupPath)) {
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
        const matches = mediaDoc.dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
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

  app.use('/uploads', express.static(publicUploadsDir));

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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
        const html = injectSeoIntoHtml(template, metadata, siteUrl, gsc, ga);
        const statusCode = metadata.title.includes('404') ? 404 : 200;
        res.status(statusCode).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
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
        const html = injectSeoIntoHtml(template, metadata, siteUrl, gsc, ga);
        const statusCode = metadata.title.includes('404') ? 404 : 200;
        res.status(statusCode).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(html);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexGen Council Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
