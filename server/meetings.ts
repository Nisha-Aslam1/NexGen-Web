import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from './db.ts';
import { Meeting } from '../src/types.ts';

export const meetingsRouter = express.Router();

// Self-hosted Jitsi Meet server domain
const JITSI_DOMAIN = (process.env.JITSI_DOMAIN || 'meet.nexgencouncil.bond')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

// Strictly prevent caching or search engine indexing on all private meeting API endpoints
meetingsRouter.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, private');
  next();
});

// Helper to clamp room participant capacity safely (2 to 1000, default 50)
function clampMaxParticipants(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(1000, Math.round(parsed)));
}

// Helper to strip sensitive database fields and attach live counts before returning meeting object
function toPublicMeeting(m: Meeting) {
  const { passwordHash, ...rest } = m;
  const participants = db.getMeetingParticipants(m.id);
  const isEnded = m.status === 'Ended' || m.status === 'Cancelled';
  const admittedParticipants = isEnded
    ? []
    : participants.filter(
        p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected'
      );
  const activeParticipantCount = admittedParticipants.length;
  return {
    ...rest,
    activeParticipantCount,
    totalParticipantCount: admittedParticipants.length
  };
}

// Helper to build clean Jitsi room configuration payload for a meeting
function buildJitsiSessionConfig(meeting: Meeting) {
  const roomSlug = meeting.meetingCode;
  const jitsiRoomName = meeting.roomName || `nexgencouncil-${roomSlug}`;
  return {
    jitsiDomain: JITSI_DOMAIN,
    jitsiRoomName,
    startWithAudioMuted: Boolean(meeting.startWithAudioMuted),
    startWithVideoMuted: Boolean(meeting.startWithVideoMuted),
    waitingRoomEnabled: Boolean(meeting.waitingRoomEnabled),
    screenShareEnabled: meeting.screenShareEnabled !== false
  };
}

interface RaisedHandEntry {
  identity: string;
  displayName: string;
  raisedAt: number;
}

interface RoomAnnouncement {
  id: string;
  text: string;
  senderName: string;
  createdAt: number;
}

interface RoomSubscriber {
  res: Response;
  identity: string;
  isHost: boolean;
}

interface ParticipantMediaState {
  audioMuted: boolean;
  videoMuted: boolean;
  updatedAt: number;
}

export interface WhiteboardElement {
  id: string;
  type: 'stroke' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'sticky' | 'image';
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  points?: number[];
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  opacity?: number;
  text?: string;
  fontSize?: number;
  tool?: 'pen' | 'highlighter' | 'eraser';
  src?: string;
  locked?: boolean;
  zLayer?: 'image' | 'draw';
}

export interface WhiteboardState {
  elements: WhiteboardElement[];
  background: 'light' | 'grid' | 'dark';
  lockDrawingToHost: boolean;
  presentedByHost: boolean;
  updatedAt: number;
}

interface MeetingRuntimeState {
  muteAllAt: number;
  stopAllVideoAt: number;
  kickedIdentities: Set<string>;
  raisedHands: Map<string, RaisedHandEntry>;
  announcement: RoomAnnouncement | null;
  chatDisabled: boolean;
  micsLocked: boolean;
  participantMediaState: Map<string, ParticipantMediaState>;
  disconnectGraceTimers: Map<string, ReturnType<typeof setTimeout>>;
  whiteboard: WhiteboardState;
}

const roomSubscribers = new Map<string, Set<RoomSubscriber>>();
const meetingRuntimeState = new Map<string, MeetingRuntimeState>();

function getRuntimeState(meetingId: string): MeetingRuntimeState {
  let state = meetingRuntimeState.get(meetingId);
  if (!state) {
    state = {
      muteAllAt: 0,
      stopAllVideoAt: 0,
      kickedIdentities: new Set(),
      raisedHands: new Map(),
      announcement: null,
      chatDisabled: false,
      micsLocked: false,
      participantMediaState: new Map(),
      disconnectGraceTimers: new Map(),
      whiteboard: {
        elements: [],
        background: 'light',
        lockDrawingToHost: false,
        presentedByHost: false,
        updatedAt: Date.now()
      }
    };
    meetingRuntimeState.set(meetingId, state);
  }
  return state;
}

function serializeMediaStates(state: MeetingRuntimeState): Record<string, ParticipantMediaState> {
  return Object.fromEntries(state.participantMediaState.entries());
}

const MAX_WHITEBOARD_ELEMENTS = 1500;
const MAX_WHITEBOARD_IMAGE_CHARS = 3_200_000; // ~2.4MB binary image safety cap

function isValidWhiteboardImageSrc(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed.length > MAX_WHITEBOARD_IMAGE_CHARS) return false;
  // Block SVG/scripted data URLs
  if (/^data:image\/svg/i.test(trimmed)) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/uploads/') && !trimmed.includes('..') && !/\.svg($|\?)/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' && !/\.svg($|\?)/i.test(parsed.pathname)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function sanitizeWhiteboardElement(raw: any, fallbackAuthorId: string, fallbackAuthorName: string): WhiteboardElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const allowedTypes = ['stroke', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'image'];
  if (!allowedTypes.includes(raw.type)) return null;

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : '';
  if (!id) return null;

  const now = Date.now();
  const base: WhiteboardElement = {
    id,
    type: raw.type,
    authorId: String(raw.authorId || fallbackAuthorId || 'participant').slice(0, 80),
    authorName: String(raw.authorName || fallbackAuthorName || 'Participant').slice(0, 80),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now
  };

  if (typeof raw.x === 'number' && Number.isFinite(raw.x)) base.x = raw.x;
  if (typeof raw.y === 'number' && Number.isFinite(raw.y)) base.y = raw.y;
  if (typeof raw.width === 'number' && Number.isFinite(raw.width)) base.width = Math.max(-4000, Math.min(4000, raw.width));
  if (typeof raw.height === 'number' && Number.isFinite(raw.height)) base.height = Math.max(-4000, Math.min(4000, raw.height));
  if (typeof raw.rotation === 'number' && Number.isFinite(raw.rotation)) base.rotation = raw.rotation;
  if (typeof raw.stroke === 'string') base.stroke = raw.stroke.slice(0, 32);
  if (typeof raw.strokeWidth === 'number' && Number.isFinite(raw.strokeWidth)) {
    base.strokeWidth = Math.max(1, Math.min(80, raw.strokeWidth));
  }
  if (typeof raw.fill === 'string') base.fill = raw.fill.slice(0, 32);
  if (typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)) {
    base.opacity = Math.max(0.05, Math.min(1, raw.opacity));
  }
  if (raw.zLayer === 'image' || raw.zLayer === 'draw') base.zLayer = raw.zLayer;
  if (typeof raw.locked === 'boolean') base.locked = raw.locked;

  if (raw.type === 'stroke' || raw.type === 'line' || raw.type === 'arrow') {
    if (!Array.isArray(raw.points) || raw.points.length < 2) return null;
    base.points = raw.points
      .slice(0, 8000)
      .filter((n: unknown) => typeof n === 'number' && Number.isFinite(n))
      .map((n: number) => Math.round(n * 100) / 100);
    if (base.points.length < 2) return null;
    if (raw.tool && ['pen', 'highlighter', 'eraser'].includes(raw.tool)) {
      base.tool = raw.tool;
    }
  }

  if (raw.type === 'text' || raw.type === 'sticky') {
    const textStr = typeof raw.text === 'string' ? raw.text.slice(0, 1000) : '';
    if (!textStr.trim()) return null;
    base.text = textStr;
    if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) {
      base.fontSize = Math.max(10, Math.min(96, raw.fontSize));
    }
  }

  if (raw.type === 'image') {
    if (!isValidWhiteboardImageSrc(raw.src)) return null;
    base.src = raw.src.trim();
    base.zLayer = raw.zLayer || 'image';
    base.width = Math.max(24, Math.min(3000, Number(raw.width) || 480));
    base.height = Math.max(24, Math.min(3000, Number(raw.height) || 320));
    base.x = Number.isFinite(Number(raw.x)) ? Number(raw.x) : 120;
    base.y = Number.isFinite(Number(raw.y)) ? Number(raw.y) : 80;
  }

  return base;
}

function clearDisconnectGraceTimer(state: MeetingRuntimeState, ...keys: (string | undefined)[]) {
  for (const k of keys) {
    if (!k) continue;
    const existing = state.disconnectGraceTimers.get(k);
    if (existing) {
      clearTimeout(existing);
      state.disconnectGraceTimers.delete(k);
    }
  }
}

function getSortedRaisedHands(state: MeetingRuntimeState): RaisedHandEntry[] {
  return Array.from(state.raisedHands.values()).sort((a, b) => a.raisedAt - b.raisedAt);
}

function sendSseEvent(res: Response, payload: Record<string, any>) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // Ignore closed socket writes
  }
}

function broadcastRoomEvent(meetingId: string, event: { type: string; [key: string]: any }) {
  const subs = roomSubscribers.get(meetingId);
  if (!subs || subs.size === 0) return;

  const payload = {
    ...event,
    meetingId,
    timestamp: Date.now()
  };

  for (const sub of Array.from(subs)) {
    sendSseEvent(sub.res, payload);
  }
}

function isMeetingModerator(user: any, meeting: Meeting): boolean {
  if (!user) return false;
  return (
    user.userId === meeting.hostId ||
    ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'VOLUNTEER_MANAGER', 'MEETING_HOST', 'EVENT_COORDINATOR'].includes(
      user.role
    )
  );
}

function getActorIdentity(req: Request): string {
  const headerId = req.headers['x-meeting-identity'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();
  if (typeof req.body?.actorIdentity === 'string' && req.body.actorIdentity.trim()) {
    return req.body.actorIdentity.trim();
  }
  if (typeof req.query?.identity === 'string' && req.query.identity.trim()) {
    return req.query.identity.trim();
  }
  return '';
}

function isRoomHostOrCoHost(req: Request, meeting: Meeting): { authorized: boolean; actorName: string } {
  const user = (req as any).user;
  if (isMeetingModerator(user, meeting)) {
    return { authorized: true, actorName: user.name || user.username || 'Host' };
  }
  const actorIdentity = getActorIdentity(req);
  if (!actorIdentity) return { authorized: false, actorName: '' };

  const record = db
    .getMeetingParticipants(meeting.id)
    .find(
      p =>
        (p.identity === actorIdentity || p.id === actorIdentity || p.userId === actorIdentity) &&
        p.admissionStatus === 'admitted' &&
        p.connectionStatus !== 'disconnected'
    );

  if (record && (record.role === 'host' || record.role === 'co-host')) {
    return { authorized: true, actorName: record.displayName || 'Co-Host' };
  }
  return { authorized: false, actorName: '' };
}

// Periodic keepalive ping so reverse proxies (Nginx/Cloudflare) never idle-close SSE streams
setInterval(() => {
  for (const subs of roomSubscribers.values()) {
    for (const sub of subs) {
      try {
        sub.res.write(': ping\n\n');
      } catch {
        // Closed socket will be cleaned up on close event
      }
    }
  }
}, 15000).unref();

// 1. GET /api/meetings - Admin/Staff list private meetings (Strictly Authenticated)
meetingsRouter.get('/meetings', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const status = typeof req.query.status === 'string' ? req.query.status : 'All';
  const search = typeof req.query.search === 'string' ? req.query.search : '';

  const meetings = db.getMeetings(status, search).map(toPublicMeeting);

  const activeCount = meetings.filter(m => m.status === 'Active').length;
  const scheduledCount = meetings.filter(m => m.status === 'Scheduled').length;
  const completedCount = meetings.filter(m => m.status === 'Ended').length;

  res.json({
    meetings,
    jitsiDomain: JITSI_DOMAIN,
    stats: {
      total: meetings.length,
      active: activeCount,
      scheduled: scheduledCount,
      completed: completedCount
    }
  });
});

// 2. POST /api/meetings - Admin/Host create private invite-only meeting
meetingsRouter.post('/meetings', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role === 'VIEWER') {
    return res.status(403).json({ error: 'Viewer role has read-only access and cannot create meetings.' });
  }

  const {
    title,
    roomSlug,
    meetingCode,
    description,
    scheduledStart,
    scheduledEnd,
    password,
    waitingRoomEnabled,
    screenShareEnabled,
    startWithAudioMuted,
    startWithVideoMuted,
    maxParticipants
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Meeting title is required' });
  }

  const meeting = db.createMeeting({
    title,
    roomSlug: roomSlug || meetingCode,
    description,
    hostId: user.userId,
    hostName: user.name || user.username,
    scheduledStart,
    scheduledEnd,
    password,
    waitingRoomEnabled: waitingRoomEnabled !== undefined ? Boolean(waitingRoomEnabled) : false,
    screenShareEnabled: screenShareEnabled !== undefined ? Boolean(screenShareEnabled) : true,
    startWithAudioMuted: Boolean(startWithAudioMuted),
    startWithVideoMuted: Boolean(startWithVideoMuted),
    maxParticipants: clampMaxParticipants(maxParticipants, 50),
    status: 'Scheduled'
  });

  res.status(201).json({
    message: 'Private meeting room created successfully',
    meeting: toPublicMeeting(meeting),
    joinUrl: `/meeting/${meeting.meetingCode}`
  });
});

// 3. GET /api/meetings/:code - Direct invite-link room lookup (never lists rooms)
meetingsRouter.get('/meetings/:code', (req: Request, res: Response) => {
  const code = req.params.code;
  const meeting = db.getMeetingByCode(code);

  if (!meeting) {
    return res.status(404).json({ error: 'Private meeting not found. Please verify your invitation link.' });
  }

  res.json({
    meeting: toPublicMeeting(meeting),
    jitsiDomain: JITSI_DOMAIN
  });
});

// 4. PATCH /api/meetings/:id - Host or Admin update meeting settings live
meetingsRouter.patch('/meetings/:id', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const isHost = isMeetingModerator(user, meeting);
  if (!isHost) {
    return res.status(403).json({ error: 'Only the meeting host or administrator can modify meeting details.' });
  }

  const patchUpdates = { ...(req.body || {}) };
  if (patchUpdates.maxParticipants !== undefined) {
    patchUpdates.maxParticipants = clampMaxParticipants(
      patchUpdates.maxParticipants,
      meeting.maxParticipants || 50
    );
  }

  const updated = db.updateMeeting(meeting.id, patchUpdates);
  if (!updated) {
    return res.status(400).json({ error: 'Failed to update meeting' });
  }

  if (updated.status === 'Ended' || updated.status === 'Cancelled') {
    db.markAllMeetingParticipantsDisconnected(meeting.id);
    broadcastRoomEvent(meeting.id, {
      type: 'meeting_ended',
      reason: 'The host has ended this meeting for everyone.'
    });
  } else {
    broadcastRoomEvent(meeting.id, {
      type: 'room_updated',
      meeting: toPublicMeeting(updated),
      isLocked: updated.isLocked,
      waitingRoomEnabled: updated.waitingRoomEnabled,
      screenShareEnabled: updated.screenShareEnabled !== false,
      maxParticipants: updated.maxParticipants
    });
  }

  res.json({
    message: 'Meeting updated successfully',
    meeting: toPublicMeeting(updated)
  });
});

// 5. DELETE /api/meetings/:id - Host or Admin cancel or delete meeting
meetingsRouter.delete('/meetings/:id', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const isHost = isMeetingModerator(user, meeting);
  if (!isHost) {
    return res.status(403).json({ error: 'Only the meeting host or administrator can delete meetings.' });
  }

  broadcastRoomEvent(meeting.id, {
    type: 'meeting_ended',
    reason: 'This meeting room was closed by the host.'
  });

  const ok = db.deleteMeeting(meeting.id);
  res.json({
    success: ok,
    message: ok ? 'Meeting removed' : 'Could not delete meeting'
  });
});

// 6. POST /api/meetings/:code/join - Join private meeting verification & Jitsi room config
meetingsRouter.post('/meetings/:code/join', (req: Request, res: Response) => {
  const code = req.params.code;
  const meeting = db.getMeetingByCode(code);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found. Invalid private invitation link.' });
  }

  if (meeting.status === 'Ended' || meeting.status === 'Cancelled') {
    return res.status(410).json({ error: 'This meeting has ended or was cancelled.', meeting: toPublicMeeting(meeting) });
  }

  const user = (req as any).user;
  const dbUser = user?.userId ? db.getUserById(user.userId) : null;
  const isHost = !!user && isMeetingModerator(user, meeting);

  // Scheduled time check: if meeting is Scheduled and scheduledStart is in the future, non-hosts must wait
  if (!isHost && meeting.status === 'Scheduled' && meeting.scheduledStart) {
    const startTimeMs = new Date(meeting.scheduledStart).getTime();
    const nowMs = Date.now();
    // Allow joining up to 15 minutes before scheduled start time
    if (!Number.isNaN(startTimeMs) && startTimeMs > nowMs + 15 * 60 * 1000) {
      return res.status(425).json({
        error: `This meeting is scheduled to start on ${new Date(meeting.scheduledStart).toLocaleString()}. You can join when the room opens shortly before the scheduled time.`,
        scheduledStart: meeting.scheduledStart,
        isFutureMeeting: true,
        meeting: toPublicMeeting(meeting)
      });
    }
  }

  const { password, displayName, email, participantId } = req.body || {};

  // Verify Password / PIN for guests if required (authenticated hosts/admins bypass)
  if (meeting.hasPassword && !isHost) {
    if (!password || !db.verifyMeetingPassword(meeting, String(password))) {
      return res.status(401).json({ error: 'Incorrect room password / PIN.', requiresPassword: true });
    }
  }

  // Lock Check
  if (meeting.isLocked && !isHost) {
    return res.status(403).json({ error: 'Meeting is locked by host. No new participants can join.' });
  }

  const finalDisplayName = (dbUser?.name || user?.name || displayName || 'Guest Participant').trim();
  const finalEmail = (dbUser?.email || email || '').trim();
  const identity = user?.userId || participantId || `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const allParticipants = db.getMeetingParticipants(meeting.id);
  const existingParticipant = allParticipants.find(
    p => p.identity === identity || (user?.userId && p.userId === user.userId)
  );
  const runtimeState = getRuntimeState(meeting.id);
  if (
    !isHost &&
    (existingParticipant?.admissionStatus === 'rejected' || runtimeState.kickedIdentities.has(identity))
  ) {
    return res.status(403).json({ error: 'You were removed or declined from this meeting by the host.' });
  }

  // Participant limit check (skip if rejoining an already admitted session or joining as host)
  const alreadyAdmitted =
    existingParticipant?.admissionStatus === 'admitted' &&
    existingParticipant?.connectionStatus !== 'disconnected';
  const activeParticipants = allParticipants.filter(
    p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected'
  );
  const maxCap = meeting.maxParticipants || 50;
  if (!isHost && !alreadyAdmitted && activeParticipants.length >= maxCap) {
    return res.status(403).json({ error: `Meeting has reached maximum participant limit (${maxCap}).` });
  }

  // Automatically mark meeting as Active if starting
  if (meeting.status === 'Scheduled') {
    db.updateMeeting(meeting.id, { status: 'Active', actualStart: new Date().toISOString() });
    broadcastRoomEvent(meeting.id, { type: 'room_updated', status: 'Active' });
  }

  // Waiting Room / Lobby Logic for unauthenticated guests if enabled
  if (meeting.waitingRoomEnabled && !isHost) {
    if (!existingParticipant || existingParticipant.admissionStatus === 'waiting') {
      const pRecord = db.upsertMeetingParticipant(meeting.id, {
        userId: user?.userId,
        displayName: finalDisplayName,
        role: 'participant',
        admissionStatus: 'waiting',
        connectionStatus: 'waiting',
        identity
      });

      broadcastRoomEvent(meeting.id, { type: 'waiting_updated' });

      return res.json({
        waitingRoom: true,
        participantId: pRecord.id,
        identity,
        displayName: finalDisplayName,
        email: finalEmail,
        meeting: toPublicMeeting(meeting)
      });
    }
  }

  const resolvedRole = isHost
    ? 'host'
    : existingParticipant?.role === 'co-host'
    ? 'co-host'
    : 'participant';

  // Admitted / Host / Direct Entry -> Upsert Admitted Record
  clearDisconnectGraceTimer(runtimeState, identity, user?.userId);
  const pRecord = db.upsertMeetingParticipant(meeting.id, {
    userId: user?.userId,
    displayName: finalDisplayName,
    role: resolvedRole,
    admissionStatus: 'admitted',
    connectionStatus: 'connected',
    identity
  });

  broadcastRoomEvent(meeting.id, { type: 'participants_updated' });

  const jitsiConfig = buildJitsiSessionConfig(meeting);

  res.json({
    meeting: toPublicMeeting(meeting),
    role: resolvedRole,
    participantId: pRecord.id,
    identity,
    displayName: finalDisplayName,
    email: finalEmail,
    ...jitsiConfig
  });
});

// 7. GET /api/meetings/:id/waiting-room - Host / Co-Host view waiting list
meetingsRouter.get('/meetings/:id/waiting-room', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can view the waiting room list.' });
  }

  const waiting = db.getMeetingParticipants(meeting.id).filter(p => p.admissionStatus === 'waiting');
  res.json({ waiting });
});

// 8. POST /api/meetings/:id/admit - Host / Co-Host admit waiting participant(s)
meetingsRouter.post('/meetings/:id/admit', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can admit participants.' });
  }

  const { participantId, admitAll } = req.body;
  const allParticipants = db.getMeetingParticipants(meeting.id);
  const activeCount = allParticipants.filter(
    p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected'
  ).length;
  const maxCap = meeting.maxParticipants || 50;
  const remainingSlots = Math.max(0, maxCap - activeCount);

  if (admitAll) {
    const waiting = allParticipants.filter(p => p.admissionStatus === 'waiting');
    if (waiting.length > 0 && remainingSlots <= 0) {
      return res.status(409).json({
        error: `Room is at max capacity (${activeCount}/${maxCap}). Increase Max Participants in Host Controls to admit waiting guests.`
      });
    }
    const toAdmit = waiting.slice(0, remainingSlots);
    toAdmit.forEach(p => {
      db.updateParticipantAdmission(meeting.id, p.id, 'admitted');
    });
    broadcastRoomEvent(meeting.id, {
      type: 'admission_updated',
      admitAll: toAdmit.length === waiting.length,
      admittedIds: toAdmit.map(p => p.id),
      admissionStatus: 'admitted'
    });
    broadcastRoomEvent(meeting.id, { type: 'waiting_updated' });
    broadcastRoomEvent(meeting.id, { type: 'participants_updated' });
    const partialNote =
      toAdmit.length < waiting.length
        ? ` (${waiting.length - toAdmit.length} still waiting — room cap ${maxCap} reached)`
        : '';
    return res.json({
      message: `Admitted ${toAdmit.length} participant${toAdmit.length === 1 ? '' : 's'}${partialNote}`
    });
  }

  if (!participantId) {
    return res.status(400).json({ error: 'Participant ID is required' });
  }

  if (remainingSlots <= 0) {
    return res.status(409).json({
      error: `Room is at max capacity (${activeCount}/${maxCap}). Increase Max Participants in Host Controls to admit.`
    });
  }

  const updatedP = db.updateParticipantAdmission(meeting.id, participantId, 'admitted');
  if (!updatedP) {
    return res.status(404).json({ error: 'Participant not found in waiting room' });
  }

  broadcastRoomEvent(meeting.id, {
    type: 'admission_updated',
    participantId: updatedP.id,
    identity: updatedP.identity,
    admissionStatus: 'admitted'
  });
  broadcastRoomEvent(meeting.id, { type: 'waiting_updated' });
  broadcastRoomEvent(meeting.id, { type: 'participants_updated' });

  res.json({ message: 'Participant admitted successfully', participant: updatedP });
});

// 9. POST /api/meetings/:id/reject - Host / Co-Host reject waiting participant
meetingsRouter.post('/meetings/:id/reject', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can reject participants.' });
  }

  const { participantId } = req.body;
  if (!participantId) {
    return res.status(400).json({ error: 'Participant ID is required' });
  }

  const updatedP = db.updateParticipantAdmission(meeting.id, participantId, 'rejected');
  if (updatedP?.identity) {
    getRuntimeState(meeting.id).kickedIdentities.add(updatedP.identity);
  }
  broadcastRoomEvent(meeting.id, {
    type: 'admission_updated',
    participantId: updatedP?.id || participantId,
    identity: updatedP?.identity,
    admissionStatus: 'rejected'
  });
  broadcastRoomEvent(meeting.id, { type: 'waiting_updated' });

  res.json({ message: 'Participant rejected', participant: updatedP });
});

// 10. GET /api/meetings/:id/admission-status - Participant waiting room status check
meetingsRouter.get('/meetings/:id/admission-status', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  if (meeting.status === 'Ended' || meeting.status === 'Cancelled') {
    return res.json({ admissionStatus: 'ended', meeting: toPublicMeeting(meeting) });
  }

  const participantId = typeof req.query.participantId === 'string' ? req.query.participantId : '';
  const identity = typeof req.query.identity === 'string' ? req.query.identity : '';

  const p = db.getMeetingParticipants(meeting.id).find(
    item => item.id === participantId || item.identity === identity
  );

  if (!p) {
    return res.json({ admissionStatus: 'waiting' });
  }

  if (p.admissionStatus === 'admitted') {
    const jitsiConfig = buildJitsiSessionConfig(meeting);
    return res.json({
      admissionStatus: 'admitted',
      meeting: toPublicMeeting(meeting),
      role: p.role,
      displayName: p.displayName,
      identity: p.identity || p.id,
      ...jitsiConfig
    });
  }

  res.json({ admissionStatus: p.admissionStatus });
});

// 11. POST /api/meetings/:id/lock - Host / Co-Host lock meeting
meetingsRouter.post('/meetings/:id/lock', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can lock meetings.' });
  }

  const updated = db.updateMeeting(meeting.id, { isLocked: true });
  broadcastRoomEvent(meeting.id, {
    type: 'room_updated',
    meeting: updated ? toPublicMeeting(updated) : undefined,
    isLocked: true,
    waitingRoomEnabled: meeting.waitingRoomEnabled,
    screenShareEnabled: meeting.screenShareEnabled !== false
  });
  res.json({ message: 'Meeting locked', isLocked: true });
});

// 12. POST /api/meetings/:id/unlock - Host / Co-Host unlock meeting
meetingsRouter.post('/meetings/:id/unlock', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can unlock meetings.' });
  }

  const updated = db.updateMeeting(meeting.id, { isLocked: false });
  broadcastRoomEvent(meeting.id, {
    type: 'room_updated',
    meeting: updated ? toPublicMeeting(updated) : undefined,
    isLocked: false,
    waitingRoomEnabled: meeting.waitingRoomEnabled,
    screenShareEnabled: meeting.screenShareEnabled !== false
  });
  res.json({ message: 'Meeting unlocked', isLocked: false });
});

// 12b. POST /api/meetings/:id/mute-all - Real-time mute everyone broadcast
meetingsRouter.post('/meetings/:id/mute-all', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized, actorName } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can mute everyone.' });
  }

  const state = getRuntimeState(meeting.id);
  state.muteAllAt = Date.now();

  broadcastRoomEvent(meeting.id, {
    type: 'mute_all',
    at: state.muteAllAt,
    triggeredBy: actorName
  });

  res.json({ message: 'All participants muted in real time', muteAllAt: state.muteAllAt });
});

// 12c. POST /api/meetings/:id/mute-participant - Mute individual participant in real time
meetingsRouter.post('/meetings/:id/mute-participant', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized, actorName } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can mute individual participants.' });
  }

  const { targetIdentity } = req.body || {};
  if (!targetIdentity) {
    return res.status(400).json({ error: 'Target participant identity is required' });
  }

  broadcastRoomEvent(meeting.id, {
    type: 'mute_participant',
    targetIdentity: String(targetIdentity),
    triggeredBy: actorName
  });

  res.json({ message: 'Mute command dispatched to participant', targetIdentity });
});

// 12d. POST /api/meetings/:id/hand - Real-time Raise Hand / Lower Hand / Lower All Hands
meetingsRouter.post('/meetings/:id/hand', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { identity, displayName, raised, lowerAll } = req.body || {};
  const state = getRuntimeState(meeting.id);

  if (lowerAll) {
    const { authorized } = isRoomHostOrCoHost(req, meeting);
    if (!authorized) {
      return res.status(403).json({ error: 'Only hosts or co-hosts can lower all raised hands.' });
    }
    state.raisedHands.clear();
  } else {
    const key = String(identity || '').trim();
    if (!key) {
      return res.status(400).json({ error: 'Participant identity is required' });
    }
    if (raised) {
      state.raisedHands.set(key, {
        identity: key,
        displayName: String(displayName || 'Participant').trim(),
        raisedAt: Date.now()
      });
    } else {
      state.raisedHands.delete(key);
    }
  }

  const raisedHands = getSortedRaisedHands(state);
  broadcastRoomEvent(meeting.id, {
    type: 'hand_updated',
    raisedHands
  });

  res.json({ raisedHands });
});

// 12e. POST /api/meetings/:id/announcement - Host live room announcement banner
meetingsRouter.post('/meetings/:id/announcement', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized, actorName } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can broadcast room announcements.' });
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 300) : '';
  const state = getRuntimeState(meeting.id);

  state.announcement = text
    ? {
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        senderName: actorName,
        createdAt: Date.now()
      }
    : null;

  broadcastRoomEvent(meeting.id, {
    type: 'room_announcement',
    announcement: state.announcement
  });

  res.json({ announcement: state.announcement });
});

// 12f. POST /api/meetings/:id/participant-role - Host promote/demote Co-Host in real time
meetingsRouter.post('/meetings/:id/participant-role', (req: Request, res: Response) => {
  const user = (req as any).user;
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  if (!isMeetingModerator(user, meeting)) {
    return res.status(403).json({ error: 'Only the primary host or admin can promote or demote co-hosts.' });
  }

  const { targetIdentity, role } = req.body || {};
  if (!targetIdentity || !['co-host', 'participant'].includes(role)) {
    return res.status(400).json({ error: 'Valid targetIdentity and role (co-host or participant) are required.' });
  }

  const updated = db.updateParticipantRole(meeting.id, String(targetIdentity), role);
  if (!updated) {
    return res.status(404).json({ error: 'Participant not found in this meeting.' });
  }

  broadcastRoomEvent(meeting.id, {
    type: 'role_updated',
    targetIdentity: updated.identity || updated.id,
    targetParticipantId: updated.id,
    role
  });
  broadcastRoomEvent(meeting.id, { type: 'participants_updated' });

  res.json({ message: `Participant role updated to ${role}`, participant: updated });
});

// 12g. POST /api/meetings/:id/chat-lock - Host / Co-Host lock or unlock room chat
meetingsRouter.post('/meetings/:id/chat-lock', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can lock or unlock room chat.' });
  }

  const state = getRuntimeState(meeting.id);
  state.chatDisabled = Boolean(req.body?.chatDisabled);

  broadcastRoomEvent(meeting.id, {
    type: 'room_updated',
    chatDisabled: state.chatDisabled
  });

  res.json({ chatDisabled: state.chatDisabled });
});

// 12h. POST /api/meetings/:id/max-participants - Host / Co-Host adjust max participant capacity live
meetingsRouter.post('/meetings/:id/max-participants', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can adjust room participant capacity.' });
  }

  const currentMax = meeting.maxParticipants || 50;
  const { maxParticipants: rawMax, delta } = req.body || {};

  let targetMax: number;
  if (rawMax !== undefined && rawMax !== null && rawMax !== '') {
    targetMax = clampMaxParticipants(rawMax, currentMax);
  } else if (delta !== undefined && Number.isFinite(Number(delta))) {
    targetMax = clampMaxParticipants(currentMax + Number(delta), currentMax);
  } else {
    return res.status(400).json({ error: 'Provide a valid maxParticipants limit (2 to 1000) or delta.' });
  }

  const updated = db.updateMeeting(meeting.id, { maxParticipants: targetMax });
  if (!updated) {
    return res.status(400).json({ error: 'Failed to update room capacity.' });
  }

  broadcastRoomEvent(meeting.id, {
    type: 'room_updated',
    meeting: toPublicMeeting(updated),
    isLocked: updated.isLocked,
    waitingRoomEnabled: updated.waitingRoomEnabled,
    screenShareEnabled: updated.screenShareEnabled !== false,
    maxParticipants: updated.maxParticipants
  });

  res.json({
    message: `Room capacity updated to ${updated.maxParticipants} participants`,
    maxParticipants: updated.maxParticipants,
    meeting: toPublicMeeting(updated)
  });
});

// 12i. POST /api/meetings/:id/media-state - Participant live mic/camera state sync
meetingsRouter.post('/meetings/:id/media-state', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { identity, audioMuted, videoMuted } = req.body || {};
  const key = String(identity || getActorIdentity(req) || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'Participant identity is required' });
  }

  const state = getRuntimeState(meeting.id);
  const existing = state.participantMediaState.get(key);
  const nextState: ParticipantMediaState = {
    audioMuted: typeof audioMuted === 'boolean' ? audioMuted : existing?.audioMuted ?? false,
    videoMuted: typeof videoMuted === 'boolean' ? videoMuted : existing?.videoMuted ?? false,
    updatedAt: Date.now()
  };
  state.participantMediaState.set(key, nextState);

  broadcastRoomEvent(meeting.id, {
    type: 'media_state_updated',
    targetIdentity: key,
    mediaState: nextState,
    mediaStates: serializeMediaStates(state)
  });

  res.json({ ok: true, mediaState: nextState });
});

// 12j. POST /api/meetings/:id/mics-lock - Host / Co-Host lock or unlock participant self-unmute
meetingsRouter.post('/meetings/:id/mics-lock', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized, actorName } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can lock participant microphones.' });
  }

  const state = getRuntimeState(meeting.id);
  state.micsLocked = Boolean(req.body?.micsLocked);
  if (state.micsLocked) {
    state.muteAllAt = Date.now();
    broadcastRoomEvent(meeting.id, {
      type: 'mute_all',
      at: state.muteAllAt,
      triggeredBy: actorName
    });
  }

  broadcastRoomEvent(meeting.id, {
    type: 'room_updated',
    micsLocked: state.micsLocked
  });

  res.json({ micsLocked: state.micsLocked });
});

// 12k. POST /api/meetings/:id/stop-all-video - Host / Co-Host turn off all participant cameras
meetingsRouter.post('/meetings/:id/stop-all-video', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized, actorName } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can turn off all cameras.' });
  }

  const state = getRuntimeState(meeting.id);
  state.stopAllVideoAt = Date.now();

  broadcastRoomEvent(meeting.id, {
    type: 'stop_all_video',
    at: state.stopAllVideoAt,
    triggeredBy: actorName
  });

  res.json({ message: 'All participant cameras turned off', stopAllVideoAt: state.stopAllVideoAt });
});

// 12l. POST /api/meetings/:id/participant-action - Real-time per-participant host actions
meetingsRouter.post('/meetings/:id/participant-action', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized, actorName } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can control participants.' });
  }

  const { targetIdentity, action } = req.body || {};
  const allowedActions = ['mute_audio', 'unmute_audio', 'mute_video', 'lower_hand', 'move_to_lobby', 'kick'];
  if (!targetIdentity || !allowedActions.includes(action)) {
    return res.status(400).json({ error: 'Valid targetIdentity and action are required.' });
  }

  const targetKey = String(targetIdentity).trim();
  const state = getRuntimeState(meeting.id);
  const participant = db
    .getMeetingParticipants(meeting.id)
    .find(p => p.identity === targetKey || p.id === targetKey || p.userId === targetKey);

  const canonicalIdentity = participant?.identity || targetKey;
  const canonicalId = participant?.id || targetKey;
  const canonicalUserId = participant?.userId;

  if (action === 'mute_audio' || action === 'unmute_audio' || action === 'mute_video') {
    const existing = state.participantMediaState.get(canonicalIdentity) || {
      audioMuted: false,
      videoMuted: false,
      updatedAt: Date.now()
    };
    if (action === 'mute_audio') {
      state.participantMediaState.set(canonicalIdentity, {
        ...existing,
        audioMuted: true,
        updatedAt: Date.now()
      });
    } else if (action === 'mute_video') {
      state.participantMediaState.set(canonicalIdentity, {
        ...existing,
        videoMuted: true,
        updatedAt: Date.now()
      });
    }

    broadcastRoomEvent(meeting.id, {
      type: 'media_action',
      action,
      targetIdentity: canonicalIdentity,
      targetParticipantId: canonicalId,
      targetUserId: canonicalUserId,
      triggeredBy: actorName
    });
    broadcastRoomEvent(meeting.id, {
      type: 'media_state_updated',
      targetIdentity: canonicalIdentity,
      mediaStates: serializeMediaStates(state)
    });

    return res.json({
      ok: true,
      action,
      targetIdentity: canonicalIdentity,
      mediaStates: serializeMediaStates(state)
    });
  }

  if (action === 'lower_hand') {
    state.raisedHands.delete(targetKey);
    if (canonicalIdentity) state.raisedHands.delete(canonicalIdentity);
    if (canonicalId) state.raisedHands.delete(canonicalId);
    const raisedHands = getSortedRaisedHands(state);
    broadcastRoomEvent(meeting.id, {
      type: 'hand_updated',
      raisedHands
    });
    return res.json({ ok: true, raisedHands });
  }

  if (action === 'move_to_lobby') {
    const updatedP = db.updateParticipantAdmission(meeting.id, targetKey, 'waiting');
    state.raisedHands.delete(targetKey);
    state.raisedHands.delete(canonicalIdentity);
    state.raisedHands.delete(canonicalId);
    state.participantMediaState.delete(canonicalIdentity);

    broadcastRoomEvent(meeting.id, {
      type: 'moved_to_waiting',
      targetIdentity: updatedP?.identity || canonicalIdentity,
      targetParticipantId: updatedP?.id || canonicalId,
      targetUserId: updatedP?.userId || canonicalUserId,
      reason: 'The host moved you to the Waiting Lobby.'
    });
    broadcastRoomEvent(meeting.id, {
      type: 'hand_updated',
      raisedHands: getSortedRaisedHands(state)
    });
    broadcastRoomEvent(meeting.id, { type: 'waiting_updated' });
    broadcastRoomEvent(meeting.id, { type: 'participants_updated' });

    return res.json({ ok: true, message: 'Participant moved to waiting lobby' });
  }

  // kick
  const updatedP = db.updateParticipantAdmission(meeting.id, targetKey, 'rejected');
  state.kickedIdentities.add(targetKey);
  state.kickedIdentities.add(canonicalIdentity);
  state.kickedIdentities.add(canonicalId);
  if (canonicalUserId) state.kickedIdentities.add(canonicalUserId);
  state.raisedHands.delete(targetKey);
  state.raisedHands.delete(canonicalIdentity);
  state.raisedHands.delete(canonicalId);
  state.participantMediaState.delete(canonicalIdentity);

  broadcastRoomEvent(meeting.id, {
    type: 'participant_kicked',
    targetIdentity: updatedP?.identity || canonicalIdentity,
    targetParticipantId: updatedP?.id || canonicalId,
    targetUserId: updatedP?.userId || canonicalUserId,
    reason: 'You were removed from the meeting by the host.'
  });
  broadcastRoomEvent(meeting.id, {
    type: 'hand_updated',
    raisedHands: getSortedRaisedHands(state)
  });
  broadcastRoomEvent(meeting.id, { type: 'participants_updated' });

  return res.json({ ok: true, message: 'Participant removed from room' });
});

// 13. POST /api/meetings/:id/end - Host end meeting for all
meetingsRouter.post('/meetings/:id/end', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const isHost = isMeetingModerator(user, meeting);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can end meetings.' });
  }

  db.markAllMeetingParticipantsDisconnected(meeting.id);
  db.updateMeeting(meeting.id, { status: 'Ended', actualEnd: new Date().toISOString() });
  const state = getRuntimeState(meeting.id);
  state.raisedHands.clear();
  state.participantMediaState.clear();
  state.announcement = null;

  broadcastRoomEvent(meeting.id, {
    type: 'meeting_ended',
    reason: 'The host has ended this meeting for everyone.',
    endedBy: user.name || user.username
  });

  res.json({ message: 'Meeting ended for everyone' });
});

// 14. POST /api/meetings/:id/kick - Host / Co-Host remove participant
meetingsRouter.post('/meetings/:id/kick', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (!authorized) {
    return res.status(403).json({ error: 'Only meeting hosts or co-hosts can remove participants.' });
  }

  const { participantIdentity } = req.body;
  if (!participantIdentity) {
    return res.status(400).json({ error: 'Participant identity is required' });
  }

  const updatedP = db.updateParticipantAdmission(meeting.id, participantIdentity, 'rejected');
  const runtimeState = getRuntimeState(meeting.id);
  runtimeState.kickedIdentities.add(String(participantIdentity));
  runtimeState.raisedHands.delete(String(participantIdentity));
  runtimeState.participantMediaState.delete(String(participantIdentity));
  if (updatedP?.id) {
    runtimeState.kickedIdentities.add(updatedP.id);
    runtimeState.raisedHands.delete(updatedP.id);
    runtimeState.participantMediaState.delete(updatedP.id);
  }
  if (updatedP?.identity) {
    runtimeState.kickedIdentities.add(updatedP.identity);
    runtimeState.raisedHands.delete(updatedP.identity);
    runtimeState.participantMediaState.delete(updatedP.identity);
  }
  if (updatedP?.userId) {
    runtimeState.kickedIdentities.add(updatedP.userId);
  }

  broadcastRoomEvent(meeting.id, {
    type: 'participant_kicked',
    targetIdentity: updatedP?.identity || String(participantIdentity),
    targetParticipantId: updatedP?.id || String(participantIdentity),
    targetUserId: updatedP?.userId,
    reason: 'You were removed from the meeting by the host.'
  });
  broadcastRoomEvent(meeting.id, {
    type: 'hand_updated',
    raisedHands: getSortedRaisedHands(runtimeState)
  });
  broadcastRoomEvent(meeting.id, { type: 'participants_updated' });

  res.json({ message: 'Participant removed from room' });
});

// 14b. POST /api/meetings/:id/leave - Participant voluntary exit notification
meetingsRouter.post('/meetings/:id/leave', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { identity, participantId } = req.body || {};
  const headerIdentity =
    typeof req.headers['x-meeting-identity'] === 'string' ? req.headers['x-meeting-identity'].trim() : '';
  const user = (req as any).user;
  const keys = Array.from(
    new Set(
      [user?.userId, identity, headerIdentity, participantId]
        .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
        .map(k => k.trim())
    )
  );

  if (keys.length > 0) {
    const state = getRuntimeState(meeting.id);
    clearDisconnectGraceTimer(state, ...keys);
    let anyMarked = false;
    for (const key of keys) {
      if (db.markParticipantLeft(meeting.id, key)) {
        anyMarked = true;
      }
      state.raisedHands.delete(key);
    }
    if (anyMarked) {
      broadcastRoomEvent(meeting.id, {
        type: 'hand_updated',
        raisedHands: getSortedRaisedHands(state)
      });
      broadcastRoomEvent(meeting.id, { type: 'participants_updated' });
    }
  }
  res.json({ ok: true });
});

// 14c. GET /api/meetings/:id/events - Real-time SSE stream for instant meeting controls & sync
meetingsRouter.get('/meetings/:id/events', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const identity = typeof req.query.identity === 'string' ? req.query.identity.trim() : '';
  const user = (req as any).user;
  const isHost = isMeetingModerator(user, meeting);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const subscriber: RoomSubscriber = { res, identity, isHost };
  let subs = roomSubscribers.get(meeting.id);
  if (!subs) {
    subs = new Set();
    roomSubscribers.set(meeting.id, subs);
  }
  subs.add(subscriber);

  const runtime = getRuntimeState(meeting.id);
  if (identity) {
    clearDisconnectGraceTimer(runtime, identity);
  }

  const participantRecord = identity
    ? db.getMeetingParticipants(meeting.id).find(p => p.identity === identity || p.id === identity)
    : undefined;

  if (meeting.status === 'Ended' || meeting.status === 'Cancelled') {
    sendSseEvent(res, {
      type: 'meeting_ended',
      meetingId: meeting.id,
      reason: 'The host has ended this meeting for everyone.',
      timestamp: Date.now()
    });
  } else if (
    identity &&
    !isHost &&
    (runtime.kickedIdentities.has(identity) || participantRecord?.admissionStatus === 'rejected')
  ) {
    sendSseEvent(res, {
      type: 'participant_kicked',
      meetingId: meeting.id,
      targetIdentity: identity,
      targetParticipantId: participantRecord?.id || identity,
      reason: 'You were removed from the meeting by the host.',
      timestamp: Date.now()
    });
  } else {
    sendSseEvent(res, {
      type: 'snapshot',
      meetingId: meeting.id,
      meeting: toPublicMeeting(meeting),
      muteAllAt: runtime.muteAllAt,
      stopAllVideoAt: runtime.stopAllVideoAt,
      raisedHands: getSortedRaisedHands(runtime),
      announcement: runtime.announcement,
      chatDisabled: runtime.chatDisabled,
      micsLocked: runtime.micsLocked,
      mediaStates: serializeMediaStates(runtime),
      whiteboard: runtime.whiteboard,
      selfRole: participantRecord?.role || (isHost ? 'host' : 'participant'),
      admissionStatus: participantRecord?.admissionStatus,
      timestamp: Date.now()
    });
  }

  req.on('close', () => {
    const currentSubs = roomSubscribers.get(meeting.id);
    if (currentSubs) {
      currentSubs.delete(subscriber);
      if (currentSubs.size === 0) {
        roomSubscribers.delete(meeting.id);
      }
    }

    if (identity) {
      const stillConnectedElsewhere = Array.from(roomSubscribers.get(meeting.id) || []).some(
        s => s.identity === identity
      );
      if (!stillConnectedElsewhere) {
        clearDisconnectGraceTimer(runtime, identity);
        const timer = setTimeout(() => {
          runtime.disconnectGraceTimers.delete(identity);
          const reconnected = Array.from(roomSubscribers.get(meeting.id) || []).some(
            s => s.identity === identity
          );
          if (!reconnected) {
            const marked = db.markParticipantLeft(meeting.id, identity);
            if (marked) {
              runtime.raisedHands.delete(identity);
              runtime.participantMediaState.delete(identity);
              broadcastRoomEvent(meeting.id, {
                type: 'hand_updated',
                raisedHands: getSortedRaisedHands(runtime)
              });
              broadcastRoomEvent(meeting.id, { type: 'participants_updated' });
            }
          }
        }, 6000);
        timer.unref?.();
        runtime.disconnectGraceTimers.set(identity, timer);
      }
    }
  });
});

// 14d. GET /api/meetings/:id/live-state - Authoritative backup live-state sync
meetingsRouter.get('/meetings/:id/live-state', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const identity = typeof req.query.identity === 'string' ? req.query.identity : '';
  const { authorized } = isRoomHostOrCoHost(req, meeting);
  const participants = db.getMeetingParticipants(meeting.id);
  const isEnded = meeting.status === 'Ended' || meeting.status === 'Cancelled';
  const activeParticipants = isEnded
    ? []
    : participants.filter(p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected');
  const waiting = authorized && !isEnded ? participants.filter(p => p.admissionStatus === 'waiting') : [];
  const runtime = getRuntimeState(meeting.id);
  const selfRecord = identity
    ? participants.find(p => p.identity === identity || p.id === identity)
    : undefined;
  const isKicked = Boolean(
    identity &&
      !isMeetingModerator((req as any).user, meeting) &&
      (runtime.kickedIdentities.has(identity) || selfRecord?.admissionStatus === 'rejected')
  );
  const isMovedToWaiting = Boolean(
    identity &&
      !isMeetingModerator((req as any).user, meeting) &&
      selfRecord?.admissionStatus === 'waiting'
  );

  res.json({
    meeting: toPublicMeeting(meeting),
    participants: activeParticipants,
    waiting,
    muteAllAt: runtime.muteAllAt,
    stopAllVideoAt: runtime.stopAllVideoAt,
    raisedHands: getSortedRaisedHands(runtime),
    announcement: runtime.announcement,
    chatDisabled: runtime.chatDisabled,
    micsLocked: runtime.micsLocked,
    mediaStates: serializeMediaStates(runtime),
    whiteboardUpdatedAt: runtime.whiteboard.updatedAt,
    whiteboardLockDrawingToHost: runtime.whiteboard.lockDrawingToHost,
    whiteboardPresentedByHost: runtime.whiteboard.presentedByHost,
    whiteboardElementCount: runtime.whiteboard.elements.length,
    selfRole: selfRecord?.role || (isMeetingModerator((req as any).user, meeting) ? 'host' : 'participant'),
    isKicked,
    isMovedToWaiting
  });
});

// 15. GET /api/meetings/:id/participants - Get active meeting attendance & participants
meetingsRouter.get('/meetings/:id/participants', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const includeAll = req.query.all === 'true';
  const all = db.getMeetingParticipants(meeting.id);
  const isEnded = meeting.status === 'Ended' || meeting.status === 'Cancelled';
  const participants = includeAll
    ? all
    : isEnded
    ? []
    : all.filter(p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected');
  res.json({ participants });
});

// 16. GET /api/meetings/:id/messages - Get meeting chat messages
meetingsRouter.get('/meetings/:id/messages', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const messages = db.getMeetingMessages(meeting.id);
  res.json({ messages });
});

// 17. POST /api/meetings/:id/messages - Save chat message and broadcast live
meetingsRouter.post('/meetings/:id/messages', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const runtime = getRuntimeState(meeting.id);
  const { authorized } = isRoomHostOrCoHost(req, meeting);
  if (runtime.chatDisabled && !authorized) {
    return res.status(403).json({ error: 'Room chat is currently restricted by the host.' });
  }

  const { message, senderName, senderId } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: 'Message exceeds 1000 characters limit' });
  }

  const user = (req as any).user;
  const finalSenderId = user?.userId || senderId || `guest_${Date.now()}`;
  const finalSenderName = user?.name || senderName || 'Guest';

  const newMsg = db.addMeetingMessage(meeting.id, finalSenderId, finalSenderName, message);
  broadcastRoomEvent(meeting.id, {
    type: 'chat_message',
    message: newMsg
  });
  res.status(201).json({ message: newMsg });
});

// 18. GET /api/meetings/:id/whiteboard - Fetch authoritative meeting whiteboard snapshot
meetingsRouter.get('/meetings/:id/whiteboard', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const runtime = getRuntimeState(meeting.id);
  res.json({ whiteboard: runtime.whiteboard });
});

// 19. POST /api/meetings/:id/whiteboard/op - Idempotent real-time whiteboard mutations
meetingsRouter.post('/meetings/:id/whiteboard/op', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const runtime = getRuntimeState(meeting.id);
  const { authorized: isModerator, actorName } = isRoomHostOrCoHost(req, meeting);
  const actorIdentity = getActorIdentity(req) || (req as any).user?.userId || 'guest';
  const senderName = String(req.body?.authorName || actorName || 'Participant').trim().slice(0, 60);

  const { action } = req.body || {};
  const allowedActions = ['add', 'update', 'delete', 'restore', 'clear', 'settings', 'present'];
  if (!allowedActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid whiteboard operation.' });
  }

  if (
    runtime.whiteboard.lockDrawingToHost &&
    !isModerator &&
    ['add', 'update', 'delete', 'restore', 'clear'].includes(action)
  ) {
    return res.status(403).json({ error: 'Whiteboard editing is currently restricted to hosts.' });
  }

  if (action === 'add') {
    const cleanEl = sanitizeWhiteboardElement(req.body?.element, actorIdentity, senderName);
    if (!cleanEl) {
      return res.status(400).json({ error: 'Invalid whiteboard element or unsupported image format/size.' });
    }
    const existingIdx = runtime.whiteboard.elements.findIndex(el => el.id === cleanEl.id);
    if (existingIdx === -1) {
      if (runtime.whiteboard.elements.length >= MAX_WHITEBOARD_ELEMENTS) {
        // Trim oldest drawing stroke first so board remains usable
        const oldestStrokeIdx = runtime.whiteboard.elements.findIndex(el => el.type === 'stroke');
        if (oldestStrokeIdx !== -1) {
          runtime.whiteboard.elements.splice(oldestStrokeIdx, 1);
        } else {
          runtime.whiteboard.elements.shift();
        }
      }
      runtime.whiteboard.elements.push(cleanEl);
    } else {
      runtime.whiteboard.elements[existingIdx] = cleanEl;
    }
    runtime.whiteboard.updatedAt = Date.now();

    broadcastRoomEvent(meeting.id, {
      type: 'whiteboard_op',
      action: 'add',
      element: cleanEl,
      actorIdentity,
      updatedAt: runtime.whiteboard.updatedAt
    });

    return res.status(201).json({ ok: true, element: cleanEl, updatedAt: runtime.whiteboard.updatedAt });
  }

  if (action === 'update') {
    const targetId = typeof req.body?.elementId === 'string' ? req.body.elementId.trim() : '';
    const patch = req.body?.patch;
    if (!targetId || !patch || typeof patch !== 'object') {
      return res.status(400).json({ error: 'elementId and patch are required.' });
    }

    const idx = runtime.whiteboard.elements.findIndex(el => el.id === targetId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Whiteboard element not found.' });
    }

    const existing = runtime.whiteboard.elements[idx];
    const updated: WhiteboardElement = {
      ...existing,
      ...(typeof patch.x === 'number' && Number.isFinite(patch.x) ? { x: patch.x } : {}),
      ...(typeof patch.y === 'number' && Number.isFinite(patch.y) ? { y: patch.y } : {}),
      ...(typeof patch.width === 'number' && Number.isFinite(patch.width)
        ? { width: Math.max(-4000, Math.min(4000, patch.width)) }
        : {}),
      ...(typeof patch.height === 'number' && Number.isFinite(patch.height)
        ? { height: Math.max(-4000, Math.min(4000, patch.height)) }
        : {}),
      ...(typeof patch.rotation === 'number' && Number.isFinite(patch.rotation) ? { rotation: patch.rotation } : {}),
      ...(typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)
        ? { opacity: Math.max(0.05, Math.min(1, patch.opacity)) }
        : {}),
      ...(typeof patch.text === 'string' ? { text: patch.text.slice(0, 1000) } : {}),
      ...(typeof patch.stroke === 'string' ? { stroke: patch.stroke.slice(0, 32) } : {}),
      ...(typeof patch.fill === 'string' ? { fill: patch.fill.slice(0, 32) } : {}),
      ...(typeof patch.locked === 'boolean' ? { locked: patch.locked } : {}),
      ...(patch.zLayer === 'image' || patch.zLayer === 'draw' ? { zLayer: patch.zLayer } : {}),
      updatedAt: Date.now()
    };
    runtime.whiteboard.elements[idx] = updated;
    runtime.whiteboard.updatedAt = Date.now();

    // Support explicit z-order reordering if requested
    if (patch.order === 'front') {
      runtime.whiteboard.elements.splice(idx, 1);
      runtime.whiteboard.elements.push(updated);
    } else if (patch.order === 'back') {
      runtime.whiteboard.elements.splice(idx, 1);
      runtime.whiteboard.elements.unshift(updated);
    }

    broadcastRoomEvent(meeting.id, {
      type: 'whiteboard_op',
      action: 'update',
      elementId: targetId,
      element: updated,
      order: patch.order,
      actorIdentity,
      updatedAt: runtime.whiteboard.updatedAt
    });

    return res.json({ ok: true, element: updated, updatedAt: runtime.whiteboard.updatedAt });
  }

  if (action === 'delete') {
    const rawIds = Array.isArray(req.body?.elementIds) ? req.body.elementIds : [];
    const idsToDelete = new Set(
      rawIds.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
    );
    if (idsToDelete.size === 0) {
      return res.json({ ok: true, updatedAt: runtime.whiteboard.updatedAt });
    }

    runtime.whiteboard.elements = runtime.whiteboard.elements.filter(el => !idsToDelete.has(el.id));
    runtime.whiteboard.updatedAt = Date.now();

    broadcastRoomEvent(meeting.id, {
      type: 'whiteboard_op',
      action: 'delete',
      elementIds: Array.from(idsToDelete),
      actorIdentity,
      updatedAt: runtime.whiteboard.updatedAt
    });

    return res.json({ ok: true, updatedAt: runtime.whiteboard.updatedAt });
  }

  if (action === 'restore') {
    const rawElements = Array.isArray(req.body?.elements) ? req.body.elements : [];
    const restored: WhiteboardElement[] = [];
    for (const raw of rawElements.slice(0, MAX_WHITEBOARD_ELEMENTS)) {
      const cleanEl = sanitizeWhiteboardElement(raw, actorIdentity, senderName);
      if (!cleanEl) continue;
      const existingIdx = runtime.whiteboard.elements.findIndex(el => el.id === cleanEl.id);
      if (existingIdx === -1) {
        if (runtime.whiteboard.elements.length >= MAX_WHITEBOARD_ELEMENTS) {
          const oldestStrokeIdx = runtime.whiteboard.elements.findIndex(el => el.type === 'stroke');
          if (oldestStrokeIdx !== -1) {
            runtime.whiteboard.elements.splice(oldestStrokeIdx, 1);
          } else {
            runtime.whiteboard.elements.shift();
          }
        }
        runtime.whiteboard.elements.push(cleanEl);
      } else {
        runtime.whiteboard.elements[existingIdx] = cleanEl;
      }
      restored.push(cleanEl);
    }

    if (restored.length > 0) {
      runtime.whiteboard.updatedAt = Date.now();
      broadcastRoomEvent(meeting.id, {
        type: 'whiteboard_op',
        action: 'restore',
        elements: restored,
        actorIdentity,
        updatedAt: runtime.whiteboard.updatedAt
      });
    }

    return res.json({ ok: true, elements: restored, updatedAt: runtime.whiteboard.updatedAt });
  }

  if (action === 'clear') {
    const target = req.body?.target === 'drawings' ? 'drawings' : 'all';
    if (runtime.whiteboard.elements.some(e => e.type === 'image') && target === 'all' && !isModerator) {
      // Non-hosts clearing without permission only clear their own or if unlocked; allow full clear when drawing is open
    }
    if (target === 'drawings') {
      runtime.whiteboard.elements = runtime.whiteboard.elements.filter(el => el.type === 'image');
    } else {
      runtime.whiteboard.elements = [];
    }
    runtime.whiteboard.updatedAt = Date.now();

    broadcastRoomEvent(meeting.id, {
      type: 'whiteboard_op',
      action: 'clear',
      target,
      actorIdentity,
      triggeredBy: senderName,
      updatedAt: runtime.whiteboard.updatedAt
    });

    return res.json({ ok: true, updatedAt: runtime.whiteboard.updatedAt });
  }

  if (action === 'settings') {
    const { background, lockDrawingToHost } = req.body || {};
    if (background && ['light', 'grid', 'dark'].includes(background)) {
      runtime.whiteboard.background = background;
    }
    if (typeof lockDrawingToHost === 'boolean') {
      if (!isModerator) {
        return res.status(403).json({ error: 'Only hosts can change whiteboard drawing permissions.' });
      }
      runtime.whiteboard.lockDrawingToHost = lockDrawingToHost;
    }
    runtime.whiteboard.updatedAt = Date.now();

    broadcastRoomEvent(meeting.id, {
      type: 'whiteboard_op',
      action: 'settings',
      background: runtime.whiteboard.background,
      lockDrawingToHost: runtime.whiteboard.lockDrawingToHost,
      actorIdentity,
      updatedAt: runtime.whiteboard.updatedAt
    });

    return res.json({
      ok: true,
      background: runtime.whiteboard.background,
      lockDrawingToHost: runtime.whiteboard.lockDrawingToHost,
      updatedAt: runtime.whiteboard.updatedAt
    });
  }

  // present
  if (!isModerator) {
    return res.status(403).json({ error: 'Only hosts can open or close the whiteboard for everyone.' });
  }
  const presented = Boolean(req.body?.presented);
  runtime.whiteboard.presentedByHost = presented;
  runtime.whiteboard.updatedAt = Date.now();

  broadcastRoomEvent(meeting.id, {
    type: 'whiteboard_present',
    presented,
    triggeredBy: senderName,
    updatedAt: runtime.whiteboard.updatedAt
  });

  return res.json({ ok: true, presented, updatedAt: runtime.whiteboard.updatedAt });
});

// 20. POST /api/meetings/:id/whiteboard/live - Ephemeral in-progress stroke & cursor broadcast
meetingsRouter.post('/meetings/:id/whiteboard/live', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const runtime = getRuntimeState(meeting.id);
  const { authorized: isModerator } = isRoomHostOrCoHost(req, meeting);
  if (runtime.whiteboard.lockDrawingToHost && !isModerator && req.body?.stroke) {
    return res.status(403).json({ error: 'Whiteboard editing is locked to hosts.' });
  }

  const actorIdentity = getActorIdentity(req) || 'guest';
  const authorName = String(req.body?.authorName || 'Participant').slice(0, 50);

  broadcastRoomEvent(meeting.id, {
    type: 'whiteboard_live',
    actorIdentity,
    authorName,
    cursor: req.body?.cursor || null,
    stroke: req.body?.stroke || null
  });

  res.json({ ok: true });
});

function saveMeetingCaptureBuffer(params: {
  meeting: Meeting;
  buffer: Buffer;
  kind: 'recording' | 'screenshot';
  filename?: string;
  mimeType: string;
  durationSeconds?: number;
  capturedBy: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
}) {
  const { meeting, buffer, kind, filename, mimeType, durationSeconds, capturedBy, hasAudio, hasVideo } = params;
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty capture file received.');
  }
  if (buffer.length > 200 * 1024 * 1024) {
    const err = new Error('Capture size exceeds 200MB maximum limit.');
    (err as any).statusCode = 413;
    throw err;
  }

  const publicCapturesDir = path.join(process.cwd(), 'public', 'uploads', 'meetings');
  const backupCapturesDir = path.join(process.cwd(), 'data', 'uploads', 'meetings');
  if (!fs.existsSync(publicCapturesDir)) {
    fs.mkdirSync(publicCapturesDir, { recursive: true });
  }
  if (!fs.existsSync(backupCapturesDir)) {
    fs.mkdirSync(backupCapturesDir, { recursive: true });
  }

  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  let ext = 'webm';
  if (cleanMime.includes('video/mp4')) ext = 'mp4';
  else if (cleanMime.includes('video/x-matroska') || cleanMime.includes('mkv')) ext = 'mkv';
  else if (cleanMime.includes('image/png')) ext = 'png';
  else if (cleanMime.includes('image/jpeg') || cleanMime.includes('image/jpg')) ext = 'jpg';
  else if (cleanMime.includes('image/webp')) ext = 'webp';
  else if (cleanMime.includes('audio/webm') || cleanMime.includes('video/webm')) ext = 'webm';
  else if (kind === 'screenshot') ext = 'png';

  const rawBaseName = String(filename || (kind === 'recording' ? 'meeting_recording' : 'meeting_screenshot')).replace(/\.[a-z0-9]+$/i, '');
  const safeName = rawBaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalName = `${Date.now()}_${safeName.slice(0, 40)}.${ext}`;

  fs.writeFileSync(path.join(publicCapturesDir, finalName), buffer);
  try {
    fs.writeFileSync(path.join(backupCapturesDir, finalName), buffer);
  } catch (backupErr) {
    console.warn('[Meetings] Could not write capture backup:', backupErr);
  }

  return db.addMeetingCapture({
    meetingId: meeting.id,
    meetingCode: meeting.meetingCode,
    meetingTitle: meeting.title,
    kind,
    filename: `/uploads/meetings/${finalName}`,
    originalName: filename || finalName,
    mimeType: cleanMime || (kind === 'recording' ? 'video/webm' : 'image/png'),
    sizeBytes: buffer.length,
    durationSeconds: typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds)) : undefined,
    capturedBy,
    hasAudio: Boolean(hasAudio),
    hasVideo: Boolean(hasVideo)
  });
}

// 21a. POST /api/meetings/:id/captures/upload - Direct raw binary upload for large recordings (up to 200MB)
meetingsRouter.post(
  '/meetings/:id/captures/upload',
  express.raw({ type: '*/*', limit: '200mb' }),
  (req: Request, res: Response) => {
    const meeting = db.getMeetingById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Empty binary capture payload.' });
    }

    try {
      const kind = req.query.kind === 'screenshot' ? 'screenshot' : 'recording';
      const filename = typeof req.query.filename === 'string' ? req.query.filename : undefined;
      const headerContentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
      const mimeType = typeof req.query.mimeType === 'string' && req.query.mimeType
        ? req.query.mimeType
        : (headerContentType && !headerContentType.includes('octet-stream') ? headerContentType : (kind === 'recording' ? 'video/webm' : 'image/png'));
      const durationRaw = Number(req.query.durationSeconds);
      const durationSeconds = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined;
      const hasAudio = req.query.hasAudio === 'true' || req.query.hasAudio === '1';
      const hasVideo = req.query.hasVideo !== 'false' && req.query.hasVideo !== '0';
      const actorIdentity = getActorIdentity(req) || 'participant';

      const captureRecord = saveMeetingCaptureBuffer({
        meeting,
        buffer,
        kind,
        filename,
        mimeType,
        durationSeconds,
        capturedBy: actorIdentity,
        hasAudio,
        hasVideo
      });

      res.status(201).json({ ok: true, capture: captureRecord });
    } catch (err: any) {
      console.error('Error saving raw meeting capture:', err);
      const status = err?.statusCode || 500;
      res.status(status).json({ error: err?.message || 'Failed to save meeting capture.' });
    }
  }
);

// 21b. POST /api/meetings/:id/captures - Save recording or screenshot via JSON dataUrl (3-day auto-purge)
meetingsRouter.post('/meetings/:id/captures', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const { kind, dataUrl, filename, mimeType, durationSeconds, hasAudio, hasVideo } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'No capture data provided.' });
  }

  try {
    const matches = dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+)(?:;[^;,=]+=[^;,]+)*;base64,([\s\S]+)$/i);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid capture data format.' });
    }

    const resolvedMime = mimeType || matches[1];
    const base64Data = matches[2].replace(/\s+/g, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const actorIdentity = getActorIdentity(req) || 'participant';

    const captureRecord = saveMeetingCaptureBuffer({
      meeting,
      buffer,
      kind: kind === 'recording' ? 'recording' : 'screenshot',
      filename,
      mimeType: resolvedMime,
      durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : undefined,
      capturedBy: actorIdentity,
      hasAudio: Boolean(hasAudio),
      hasVideo: Boolean(hasVideo)
    });

    res.status(201).json({ ok: true, capture: captureRecord });
  } catch (err: any) {
    console.error('Error saving meeting capture:', err);
    const status = err?.statusCode || 500;
    res.status(status).json({ error: err?.message || 'Failed to save meeting capture.' });
  }
});

// 22. GET /api/meetings/:id/captures - List captures for a meeting
meetingsRouter.get('/meetings/:id/captures', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  const captures = db.getMeetingCaptures(meeting.id);
  res.json({ captures });
});

// 23. GET /api/meetings-captures/all - List all meeting captures across rooms (Admin)
meetingsRouter.get('/meetings-captures/all', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const captures = db.getMeetingCaptures();
  res.json({ captures });
});

// 24. DELETE /api/meetings/captures/:captureId - Delete capture manually
meetingsRouter.delete('/meetings/captures/:captureId', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const captureId = req.params.captureId;
  const ok = db.deleteMeetingCapture(captureId);
  if (!ok) {
    return res.status(404).json({ error: 'Capture not found.' });
  }
  res.json({ ok: true });
});
