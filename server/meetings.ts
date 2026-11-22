import express, { Request, Response } from 'express';
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

// Helper to strip sensitive database fields before returning meeting object
function toPublicMeeting(m: Meeting) {
  const { passwordHash, ...rest } = m;
  return rest;
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

interface MeetingRuntimeState {
  muteAllAt: number;
  kickedIdentities: Set<string>;
  raisedHands: Map<string, RaisedHandEntry>;
  announcement: RoomAnnouncement | null;
  chatDisabled: boolean;
}

const roomSubscribers = new Map<string, Set<RoomSubscriber>>();
const meetingRuntimeState = new Map<string, MeetingRuntimeState>();

function getRuntimeState(meetingId: string): MeetingRuntimeState {
  let state = meetingRuntimeState.get(meetingId);
  if (!state) {
    state = {
      muteAllAt: 0,
      kickedIdentities: new Set(),
      raisedHands: new Map(),
      announcement: null,
      chatDisabled: false
    };
    meetingRuntimeState.set(meetingId, state);
  }
  return state;
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
    maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : 50,
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

  const updated = db.updateMeeting(meeting.id, req.body);
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
      screenShareEnabled: updated.screenShareEnabled !== false
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

  // Participant limit check
  const activeParticipants = db.getMeetingParticipants(meeting.id).filter(p => p.connectionStatus === 'connected');
  if (!isHost && meeting.maxParticipants && activeParticipants.length >= meeting.maxParticipants) {
    return res.status(403).json({ error: `Meeting has reached maximum participant limit (${meeting.maxParticipants}).` });
  }

  const finalDisplayName = (dbUser?.name || user?.name || displayName || 'Guest Participant').trim();
  const finalEmail = (dbUser?.email || email || '').trim();
  const identity = user?.userId || participantId || `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const existingParticipant = db.getMeetingParticipants(meeting.id).find(
    p => p.identity === identity || (user?.userId && p.userId === user.userId)
  );
  const runtimeState = getRuntimeState(meeting.id);
  if (
    !isHost &&
    (existingParticipant?.admissionStatus === 'rejected' || runtimeState.kickedIdentities.has(identity))
  ) {
    return res.status(403).json({ error: 'You were removed or declined from this meeting by the host.' });
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

  if (admitAll) {
    const waiting = db.getMeetingParticipants(meeting.id).filter(p => p.admissionStatus === 'waiting');
    waiting.forEach(p => {
      db.updateParticipantAdmission(meeting.id, p.id, 'admitted');
    });
    broadcastRoomEvent(meeting.id, {
      type: 'admission_updated',
      admitAll: true,
      admissionStatus: 'admitted'
    });
    broadcastRoomEvent(meeting.id, { type: 'waiting_updated' });
    broadcastRoomEvent(meeting.id, { type: 'participants_updated' });
    return res.json({ message: `Admitted ${waiting.length} participants` });
  }

  if (!participantId) {
    return res.status(400).json({ error: 'Participant ID is required' });
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
  if (updatedP?.id) {
    runtimeState.kickedIdentities.add(updatedP.id);
    runtimeState.raisedHands.delete(updatedP.id);
  }
  if (updatedP?.identity) {
    runtimeState.kickedIdentities.add(updatedP.identity);
    runtimeState.raisedHands.delete(updatedP.identity);
  }

  broadcastRoomEvent(meeting.id, {
    type: 'participant_kicked',
    targetIdentity: updatedP?.identity || String(participantIdentity),
    targetParticipantId: updatedP?.id || String(participantIdentity),
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
  const user = (req as any).user;
  const key = user?.userId || identity || participantId;
  if (key) {
    db.markParticipantLeft(meeting.id, String(key));
    const state = getRuntimeState(meeting.id);
    state.raisedHands.delete(String(key));
    broadcastRoomEvent(meeting.id, {
      type: 'hand_updated',
      raisedHands: getSortedRaisedHands(state)
    });
    broadcastRoomEvent(meeting.id, { type: 'participants_updated' });
  }
  res.json({ ok: true });
});

// 14c. GET /api/meetings/:id/events - Real-time SSE stream for instant meeting controls & sync
meetingsRouter.get('/meetings/:id/events', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const identity = typeof req.query.identity === 'string' ? req.query.identity : '';
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
      raisedHands: getSortedRaisedHands(runtime),
      announcement: runtime.announcement,
      chatDisabled: runtime.chatDisabled,
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
  });
});

// 14d. GET /api/meetings/:id/live-state - Authoritative backup live-state sync
meetingsRouter.get('/meetings/:id/live-state', (req: Request, res: Response) => {
  const meeting = db.getMeetingById(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const identity = typeof req.query.identity === 'string' ? req.query.identity : '';
  const { authorized } = isRoomHostOrCoHost(req, meeting);
  const participants = db.getMeetingParticipants(meeting.id);
  const activeParticipants = participants.filter(
    p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected'
  );
  const waiting = authorized ? participants.filter(p => p.admissionStatus === 'waiting') : [];
  const runtime = getRuntimeState(meeting.id);
  const selfRecord = identity
    ? participants.find(p => p.identity === identity || p.id === identity)
    : undefined;
  const isKicked = Boolean(
    identity &&
      !isMeetingModerator((req as any).user, meeting) &&
      (runtime.kickedIdentities.has(identity) || selfRecord?.admissionStatus === 'rejected')
  );

  res.json({
    meeting: toPublicMeeting(meeting),
    participants: activeParticipants,
    waiting,
    muteAllAt: runtime.muteAllAt,
    raisedHands: getSortedRaisedHands(runtime),
    announcement: runtime.announcement,
    chatDisabled: runtime.chatDisabled,
    selfRole: selfRecord?.role || (isMeetingModerator((req as any).user, meeting) ? 'host' : 'participant'),
    isKicked
  });
});

// 15. GET /api/meetings/:id/participants - Get active meeting attendance & participants
meetingsRouter.get('/meetings/:id/participants', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const includeAll = req.query.all === 'true';
  const all = db.getMeetingParticipants(meeting.id);
  const participants = includeAll
    ? all
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
