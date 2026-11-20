import express, { Request, Response } from 'express';
import { db } from './db.ts';
import { Meeting } from '../src/types.ts';

export const meetingsRouter = express.Router();

// Self-hosted Jitsi Meet server domain
const JITSI_DOMAIN = (process.env.JITSI_DOMAIN || 'meet.nexgencouncil.bond')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

// Helper to strip sensitive database fields before returning public meeting object
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

// 1. GET /api/meetings - Admin list all meetings
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

// 2. POST /api/meetings - Admin create meeting
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
    message: 'Meeting created successfully',
    meeting: toPublicMeeting(meeting),
    joinUrl: `/meeting/${meeting.meetingCode}`
  });
});

// 3. GET /api/meetings/:code - Public meeting info lookup
meetingsRouter.get('/meetings/:code', (req: Request, res: Response) => {
  const code = req.params.code;
  const meeting = db.getMeetingByCode(code);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found. Please verify room link or slug.' });
  }

  res.json({
    meeting: toPublicMeeting(meeting),
    jitsiDomain: JITSI_DOMAIN
  });
});

// 4. PATCH /api/meetings/:id - Host or Admin update meeting
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

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only the meeting host or administrator can modify meeting details.' });
  }

  const updated = db.updateMeeting(meeting.id, req.body);
  if (!updated) {
    return res.status(400).json({ error: 'Failed to update meeting' });
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

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only the meeting host or administrator can delete meetings.' });
  }

  const ok = db.deleteMeeting(meeting.id);
  res.json({
    success: ok,
    message: ok ? 'Meeting removed' : 'Could not delete meeting'
  });
});

// 6. POST /api/meetings/:code/join - Join meeting verification & Jitsi room config
meetingsRouter.post('/meetings/:code/join', (req: Request, res: Response) => {
  const code = req.params.code;
  const meeting = db.getMeetingByCode(code);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found. Invalid room link or slug.' });
  }

  if (meeting.status === 'Ended' || meeting.status === 'Cancelled') {
    return res.status(410).json({ error: 'This meeting has ended or was cancelled.', meeting: toPublicMeeting(meeting) });
  }

  const user = (req as any).user;
  const dbUser = user?.userId ? db.getUserById(user.userId) : null;
  const isHost = !!user && (
    user.userId === meeting.hostId ||
    user.role === 'SUPER_ADMIN' ||
    user.role === 'ADMIN' ||
    user.role === 'CONTENT_MANAGER' ||
    user.role === 'VOLUNTEER_MANAGER' ||
    user.role === 'MEETING_HOST' ||
    user.role === 'EVENT_COORDINATOR'
  );

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

  // Automatically mark meeting as Active if starting
  if (meeting.status === 'Scheduled') {
    db.updateMeeting(meeting.id, { status: 'Active', actualStart: new Date().toISOString() });
  }

  // Waiting Room / Lobby Logic for unauthenticated guests if enabled
  if (meeting.waitingRoomEnabled && !isHost) {
    const existingP = db.getMeetingParticipants(meeting.id).find(
      p => p.identity === identity || (user?.userId && p.userId === user.userId)
    );

    if (!existingP || existingP.admissionStatus === 'waiting') {
      const pRecord = db.upsertMeetingParticipant(meeting.id, {
        userId: user?.userId,
        displayName: finalDisplayName,
        role: 'participant',
        admissionStatus: 'waiting',
        connectionStatus: 'waiting',
        identity
      });

      return res.json({
        waitingRoom: true,
        participantId: pRecord.id,
        identity,
        displayName: finalDisplayName,
        email: finalEmail,
        meeting: toPublicMeeting(meeting)
      });
    }

    if (existingP.admissionStatus === 'rejected') {
      return res.status(403).json({ error: 'Your admission request was declined by the meeting host.' });
    }
  }

  // Admitted / Host / Direct Entry -> Upsert Admitted Record
  const pRecord = db.upsertMeetingParticipant(meeting.id, {
    userId: user?.userId,
    displayName: finalDisplayName,
    role: isHost ? 'host' : 'participant',
    admissionStatus: 'admitted',
    connectionStatus: 'connected',
    identity
  });

  const jitsiConfig = buildJitsiSessionConfig(meeting);

  res.json({
    meeting: toPublicMeeting(meeting),
    role: isHost ? 'host' : 'participant',
    participantId: pRecord.id,
    identity,
    displayName: finalDisplayName,
    email: finalEmail,
    ...jitsiConfig
  });
});

// 7. GET /api/meetings/:id/waiting-room - Host view waiting list
meetingsRouter.get('/meetings/:id/waiting-room', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can view the waiting room list.' });
  }

  const waiting = db.getMeetingParticipants(meeting.id).filter(p => p.admissionStatus === 'waiting');
  res.json({ waiting });
});

// 8. POST /api/meetings/:id/admit - Host admit waiting participant(s)
meetingsRouter.post('/meetings/:id/admit', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can admit participants.' });
  }

  const { participantId, admitAll } = req.body;

  if (admitAll) {
    const waiting = db.getMeetingParticipants(meeting.id).filter(p => p.admissionStatus === 'waiting');
    waiting.forEach(p => {
      db.updateParticipantAdmission(meeting.id, p.id, 'admitted');
    });
    return res.json({ message: `Admitted ${waiting.length} participants` });
  }

  if (!participantId) {
    return res.status(400).json({ error: 'Participant ID is required' });
  }

  const updatedP = db.updateParticipantAdmission(meeting.id, participantId, 'admitted');
  if (!updatedP) {
    return res.status(404).json({ error: 'Participant not found in waiting room' });
  }

  res.json({ message: 'Participant admitted successfully', participant: updatedP });
});

// 9. POST /api/meetings/:id/reject - Host reject waiting participant
meetingsRouter.post('/meetings/:id/reject', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can reject participants.' });
  }

  const { participantId } = req.body;
  if (!participantId) {
    return res.status(400).json({ error: 'Participant ID is required' });
  }

  const updatedP = db.updateParticipantAdmission(meeting.id, participantId, 'rejected');
  res.json({ message: 'Participant rejected', participant: updatedP });
});

// 10. GET /api/meetings/:id/admission-status - Participant waiting room status polling
meetingsRouter.get('/meetings/:id/admission-status', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
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

// 11. POST /api/meetings/:id/lock - Host lock meeting
meetingsRouter.post('/meetings/:id/lock', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can lock meetings.' });
  }

  db.updateMeeting(meeting.id, { isLocked: true });
  res.json({ message: 'Meeting locked', isLocked: true });
});

// 12. POST /api/meetings/:id/unlock - Host unlock meeting
meetingsRouter.post('/meetings/:id/unlock', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can unlock meetings.' });
  }

  db.updateMeeting(meeting.id, { isLocked: false });
  res.json({ message: 'Meeting unlocked', isLocked: false });
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

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can end meetings.' });
  }

  db.updateMeeting(meeting.id, { status: 'Ended', actualEnd: new Date().toISOString() });
  res.json({ message: 'Meeting ended for everyone' });
});

// 14. POST /api/meetings/:id/kick - Host remove participant
meetingsRouter.post('/meetings/:id/kick', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const isHost = user.userId === meeting.hostId || ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  if (!isHost) {
    return res.status(403).json({ error: 'Only meeting hosts can remove participants.' });
  }

  const { participantIdentity } = req.body;
  if (!participantIdentity) {
    return res.status(400).json({ error: 'Participant identity is required' });
  }

  db.updateParticipantAdmission(meeting.id, participantIdentity, 'rejected');
  res.json({ message: 'Participant removed from room' });
});

// 15. GET /api/meetings/:id/participants - Get meeting attendance & participants
meetingsRouter.get('/meetings/:id/participants', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  const participants = db.getMeetingParticipants(meeting.id);
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

// 17. POST /api/meetings/:id/messages - Save chat message to MongoDB
meetingsRouter.post('/meetings/:id/messages', (req: Request, res: Response) => {
  const id = req.params.id;
  const meeting = db.getMeetingById(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

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
  res.status(201).json({ message: newMsg });
});
