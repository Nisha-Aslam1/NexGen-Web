import express, { Request, Response } from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { db } from './db.ts';
import { Meeting } from '../src/types.ts';

export const meetingsRouter = express.Router();

// Helper to strip sensitive database fields before returning public meeting object
function toPublicMeeting(m: Meeting) {
  const { passwordHash, ...rest } = m;
  return rest;
}

// Helper: Securely load JaaS Private Key PEM
function getJaasPrivateKey(): string | null {
  if (process.env.JAAS_PRIVATE_KEY) {
    return process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  const keyPath = process.env.JAAS_PRIVATE_KEY_PATH;
  if (keyPath && fs.existsSync(keyPath)) {
    try {
      return fs.readFileSync(keyPath, 'utf8');
    } catch (err) {
      console.error('[JaaS] Failed to read private key file:', (err as Error).message);
    }
  }
  return null;
}

// Helper: Generate Official 8x8 JaaS JWT Token (RS256)
function generateJaasToken(params: {
  meetingCode: string;
  userId: string;
  userName: string;
  isModerator: boolean;
  userEmail?: string;
}): { token: string | null; appId: string; roomName: string; domain: string; error?: string } {
  const appId = process.env.JAAS_APP_ID || '';
  const apiKeyId = process.env.JAAS_API_KEY_ID || '';
  const privateKey = getJaasPrivateKey();

  // Full room name format for JaaS on 8x8.vc
  const jaasRoomName = appId ? `${appId}/${params.meetingCode}` : params.meetingCode;

  if (!appId || !apiKeyId || !privateKey) {
    return {
      token: null,
      appId,
      roomName: jaasRoomName,
      domain: '8x8.vc',
      error: 'JaaS credentials incomplete. Please configure JAAS_APP_ID, JAAS_API_KEY_ID, and JAAS_PRIVATE_KEY_PATH in .env.'
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 2 * 3600; // Token valid for 2 hours

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: appId,
    room: '*',
    exp,
    nbf: now - 10,
    context: {
      user: {
        id: params.userId,
        name: params.userName,
        email: params.userEmail || `${params.userId}@nexgencouncil.bond`,
        avatar: '',
        moderator: params.isModerator ? 'true' : 'false'
      },
      features: {
        livestreaming: params.isModerator ? 'true' : 'false',
        recording: params.isModerator ? 'true' : 'false',
        transcription: 'true',
        'outbound-call': 'false'
      }
    }
  };

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        typ: 'JWT',
        kid: apiKeyId
      }
    });

    return {
      token,
      appId,
      roomName: jaasRoomName,
      domain: '8x8.vc'
    };
  } catch (err: any) {
    console.error('[JaaS] JWT Signing Error:', err.message);
    return {
      token: null,
      appId,
      roomName: jaasRoomName,
      domain: '8x8.vc',
      error: `JWT Signing Failed: ${err.message}`
    };
  }
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

  const {
    title,
    description,
    scheduledStart,
    scheduledEnd,
    password,
    waitingRoomEnabled,
    screenShareEnabled,
    maxParticipants
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Meeting title is required' });
  }

  const meeting = db.createMeeting({
    title,
    description,
    hostId: user.userId,
    hostName: user.name || user.username,
    scheduledStart,
    scheduledEnd,
    password,
    waitingRoomEnabled,
    screenShareEnabled,
    maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : 50,
    status: 'Scheduled'
  });

  res.status(201).json({
    message: 'Meeting created successfully',
    meeting: toPublicMeeting(meeting),
    joinUrl: `/room/${meeting.meetingCode}`
  });
});

// 3. GET /api/meetings/:code - Public meeting info lookup
meetingsRouter.get('/meetings/:code', (req: Request, res: Response) => {
  const code = req.params.code;
  const meeting = db.getMeetingByCode(code);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found. Please verify meeting code.' });
  }

  res.json({
    meeting: toPublicMeeting(meeting)
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

// 6. POST /api/meetings/:code/join - Join meeting request & JaaS Token generation
meetingsRouter.post('/meetings/:code/join', (req: Request, res: Response) => {
  const code = req.params.code;
  const meeting = db.getMeetingByCode(code);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found. Invalid meeting code.' });
  }

  if (meeting.status === 'Ended' || meeting.status === 'Cancelled') {
    return res.status(410).json({ error: 'This meeting has ended or was cancelled.', meeting: toPublicMeeting(meeting) });
  }

  const { password, displayName, participantId } = req.body;

  // Verify Password if required
  if (meeting.hasPassword) {
    if (!password || !db.verifyMeetingPassword(meeting, password)) {
      return res.status(401).json({ error: 'Invalid meeting password', requiresPassword: true });
    }
  }

  // Authenticated user check for Host privilege
  const user = (req as any).user;
  const isHost = !!user && (user.userId === meeting.hostId || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN');

  // Lock Check
  if (meeting.isLocked && !isHost) {
    return res.status(403).json({ error: 'Meeting is locked by host. No new participants can join.' });
  }

  // Participant limit check
  const activeParticipants = db.getMeetingParticipants(meeting.id).filter(p => p.connectionStatus === 'connected');
  if (!isHost && meeting.maxParticipants && activeParticipants.length >= meeting.maxParticipants) {
    return res.status(403).json({ error: `Meeting has reached maximum participant limit (${meeting.maxParticipants}).` });
  }

  const finalDisplayName = (user?.name || displayName || 'Guest Participant').trim();
  const identity = user?.userId || participantId || `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Automatically mark meeting as Active if starting
  if (meeting.status === 'Scheduled') {
    db.updateMeeting(meeting.id, { status: 'Active', actualStart: new Date().toISOString() });
  }

  // Waiting Room Logic
  if (meeting.waitingRoomEnabled && !isHost) {
    const existingP = db.getMeetingParticipants(meeting.id).find(p => p.identity === identity || (user?.userId && p.userId === user.userId));
    
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
        meeting: toPublicMeeting(meeting)
      });
    }

    if (existingP.admissionStatus === 'rejected') {
      return res.status(403).json({ error: 'Your admission request was rejected by the meeting host.' });
    }
  }

  // Admitted / Host / No Waiting Room -> Upsert Admitted Record
  const pRecord = db.upsertMeetingParticipant(meeting.id, {
    userId: user?.userId,
    displayName: finalDisplayName,
    role: isHost ? 'host' : 'participant',
    admissionStatus: 'admitted',
    connectionStatus: 'connected',
    identity
  });

  // Generate JaaS JWT for admitted user
  const jaasRes = generateJaasToken({
    meetingCode: meeting.meetingCode,
    userId: identity,
    userName: finalDisplayName,
    isModerator: isHost,
    userEmail: user?.email
  });

  res.json({
    meeting: toPublicMeeting(meeting),
    role: isHost ? 'host' : 'participant',
    participantId: pRecord.id,
    identity,
    displayName: finalDisplayName,
    jaasToken: jaasRes.token,
    jaasAppId: jaasRes.appId,
    jaasRoomName: jaasRes.roomName,
    jaasDomain: jaasRes.domain,
    jaasError: jaasRes.error
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

  // Issue JaaS JWT ONLY if participant status is confirmed 'admitted'
  if (p.admissionStatus === 'admitted') {
    const user = (req as any).user;
    const isHost = !!user && (user.userId === meeting.hostId || user.role === 'SUPER_ADMIN' || user.role === 'ADMIN');

    const jaasRes = generateJaasToken({
      meetingCode: meeting.meetingCode,
      userId: p.identity || p.id,
      userName: p.displayName,
      isModerator: isHost,
      userEmail: user?.email
    });

    return res.json({
      admissionStatus: 'admitted',
      meeting: toPublicMeeting(meeting),
      role: p.role,
      displayName: p.displayName,
      identity: p.identity || p.id,
      jaasToken: jaasRes.token,
      jaasAppId: jaasRes.appId,
      jaasRoomName: jaasRes.roomName,
      jaasDomain: jaasRes.domain,
      jaasError: jaasRes.error
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
