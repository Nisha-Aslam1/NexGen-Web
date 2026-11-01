import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
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

const app = express();
const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'nexgen_council_secure_session_secret_2026';

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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

function signToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyToken<T = any>(token?: string): T | null {
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload as T;
  } catch {
    return null;
  }
}

interface AuthSession {
  userId: string;
  username: string;
  role: Role;
  name: string;
  exp: number;
}

function getSession(req: Request): AuthSession | null {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'] as string;
  } else if (typeof req.query?.auth_token === 'string') {
    token = req.query.auth_token;
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['ng_session'];
  }
  return verifyToken<AuthSession>(token);
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
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    const sessionRole = normalizeRole(session.role);
    if (allowedRoles && allowedRoles.length > 0) {
      const normalizedAllowed = allowedRoles.map(r => normalizeRole(r));
      if (sessionRole !== 'SUPER_ADMIN' && !normalizedAllowed.includes(sessionRole)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action.' });
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

// 2. Authentication
app.post('/api/auth/login', (req, res) => {
  const username = (req.body.username || req.body.usernameOrEmail || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. Please verify username and password.' });
  }

  const tokenPayload: AuthSession = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };

  const token = signToken(tokenPayload);

  // Set HTTP cookie
  res.setHeader(
    'Set-Cookie',
    `ng_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );

  db.logActivity({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
    details: `User ${user.username} logged in successfully.`,
    ipAddress: req.ip || 'unknown'
  });

  return res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ng_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
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
  const isManager = session && ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'].includes(session.role);
  const programs = db.getPrograms(!isManager);
  res.json(programs);
});

app.get('/api/programs/:id', (req, res) => {
  const program = db.getProgramBySlugOrId(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found' });
  res.json(program);
});

app.post('/api/programs', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
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

app.put('/api/programs/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const updated = db.updateProgram(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Program not found' });
  res.json(updated);
});

app.delete('/api/programs/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  db.deleteProgram(req.params.id);
  res.json({ ok: true });
});

// 6. Events
app.get('/api/events', (req, res) => {
  const filter = req.query.filter as 'Upcoming' | 'Past' | 'All' | undefined;
  const events = db.getEvents(filter);
  res.json(events);
});

app.post('/api/events', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
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

app.put('/api/events/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const updated = db.updateEvent(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Event not found' });
  res.json(updated);
});

app.delete('/api/events/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  db.deleteEvent(req.params.id);
  res.json({ ok: true });
});

// 7. News
app.get('/api/news', (req, res) => {
  const session = getSession(req);
  const isManager = session && ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER'].includes(session.role);
  const news = db.getNews(!isManager);
  res.json(news);
});

app.post('/api/news', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
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

app.put('/api/news/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const updated = db.updateNews(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Article not found' });
  res.json(updated);
});

app.delete('/api/news/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
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

app.post('/api/gallery', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
  const item = db.createGalleryItem(req.body);
  res.status(201).json(item);
});

app.delete('/api/gallery/:id', requireAuth(['ADMIN', 'CONTENT_MANAGER']), (req, res) => {
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

app.get(['/api/contact', '/api/contacts'], requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'VIEWER']), (req, res) => {
  res.json(db.getContacts());
});

app.patch(['/api/contact/:id', '/api/contacts/:id', '/api/contacts/:id/status'], requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER']), (req, res) => {
  const updated = db.updateContactStatus(req.params.id, req.body.status);
  if (!updated) return res.status(404).json({ error: 'Message not found' });
  res.json(updated);
});

app.delete(['/api/contact/:id', '/api/contacts/:id'], requireAuth(['ADMIN']), (req, res) => {
  db.deleteContact(req.params.id);
  res.json({ ok: true });
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
app.get('/api/users', requireAuth(['SUPER_ADMIN']), (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/users', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const { username, name, email, role, password } = req.body;
  if (!username || !name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  const user = db.createUser({ username, name, email, role, password });
  const currentUser = (req as any).user;
  db.logActivity({
    userId: currentUser.userId,
    userName: currentUser.name,
    userRole: currentUser.role,
    action: 'STAFF_CREATED',
    entityType: 'User',
    entityId: user.id,
    details: `Created new staff account for ${user.name} (@${user.username}) with assigned role "${user.role}".`,
    ipAddress: req.ip || 'unknown'
  });
  res.status(201).json(user);
});

app.put('/api/users/:id', requireAuth(['SUPER_ADMIN']), (req, res) => {
  const { id } = req.params;
  const { username, name, email, role, password } = req.body;
  const updated = db.updateUser(id, { username, name, email, role, password });
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
    ipAddress: req.ip || 'unknown'
  });

  res.json(updated);
});

app.delete('/api/users/:id', requireAuth(['SUPER_ADMIN']), (req, res) => {
  db.deleteUser(req.params.id);
  const currentUser = (req as any).user;
  db.logActivity({
    userId: currentUser.userId,
    userName: currentUser.name,
    userRole: currentUser.role,
    action: 'STAFF_DELETED',
    entityType: 'User',
    entityId: req.params.id,
    details: `Revoked access credentials for staff ID ${req.params.id}.`,
    ipAddress: req.ip || 'unknown'
  });
  res.json({ ok: true });
});

// 13. Dashboard Analytics & Activity Logs
app.get('/api/analytics', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'VIEWER']), (req, res) => {
  res.json(db.getDashboardStats());
});

app.get('/api/activity-logs', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'VIEWER']), (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(db.getActivityLogs(limit));
});

// 14. Real-time Image & Visual Asset Uploader (Multi-tier persistence: public/uploads, data/uploads, and MongoDB media collection)
app.post('/api/upload', requireAuth(['ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER']), async (req, res) => {
  const { dataUrl, filename, image } = req.body;
  const payload = dataUrl || image;
  if (!payload) {
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

    // Check if base64 data URL
    if (typeof payload === 'string' && payload.startsWith('data:image/')) {
      const matches = payload.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1].replace('jpeg', 'jpg').replace('+xml', '');
        const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const base64Data = matches[2];
        const rawName = (filename || 'upload').replace(/[^a-zA-Z0-9_-]/g, '_');
        const finalName = `${Date.now()}_${rawName.slice(0, 30)}.${ext}`;
        const publicFilePath = path.join(publicUploadsDir, finalName);
        const persistentFilePath = path.join(persistentUploadsDir, finalName);
        const buffer = Buffer.from(base64Data, 'base64');

        // 1. Write to public/uploads for direct instant static web serving
        fs.writeFileSync(publicFilePath, buffer);

        // 2. Write to data/uploads for local disk persistence
        try {
          fs.writeFileSync(persistentFilePath, buffer);
        } catch (e) {
          console.warn('[Storage] Could not write to data/uploads backup:', e);
        }

        // 3. Persist to MongoDB media collection (permanent database storage surviving any git pull/wipe)
        mongoSaveMedia(finalName, payload, mimeType, buffer.length).catch(mErr => {
          console.warn('[MongoDB] Background media persistence notice:', mErr?.message);
        });

        const publicUrl = `/uploads/${finalName}`;

        return res.json({
          ok: true,
          url: publicUrl,
          filename: finalName
        });
      }
    }

    // Fallback: return payload as url directly if it's already a URL
    res.json({
      ok: true,
      url: payload,
      filename: filename || 'image.png'
    });
  } catch (err: any) {
    console.error('Error saving uploaded image:', err);
    // Graceful fallback to data URL
    res.json({
      ok: true,
      url: payload,
      filename: filename || 'image.png'
    });
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

app.get('/api/analytics/realtime', requireAuth(['ADMIN', 'VOLUNTEER_MANAGER', 'CONTENT_MANAGER', 'VIEWER']), async (req, res) => {
  try {
    const appsCount = db.getApplications({ perPage: 1000 }).total;
    const volsCount = db.getVolunteers().length;
    const insights = await getRealtimeInsights(appsCount, volsCount);
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. MongoDB & Oracle Cloud VM System Status & Test Endpoints
app.get('/api/system/database-status', async (req, res) => {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexGen Council Server running on http://0.0.0.0:${PORT}`);

    // Asynchronously initialize and synchronize MongoDB in the background
    initMongo().then(async (mongoConnected) => {
      if (mongoConnected) {
        await db.initFromMongo();
        console.log('[MongoDB] Schema verified and hydrated from live MongoDB.');
        // Restore all uploaded media from MongoDB to local disk cache
        const restored = await mongoRestoreAllMediaToDisk([publicUploadsDir, persistentUploadsDir]);
        if (restored > 0) {
          console.log(`[Storage] Successfully restored ${restored} media assets from MongoDB to local storage.`);
        }
      }
    }).catch((mErr) => {
      console.warn('[MongoDB] Init warning:', mErr?.message || mErr);
    });
  });
}

startServer();
