import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { MeetingJoinPage } from './MeetingJoinPage.tsx';
import { MeetingWaitingRoomPage } from './MeetingWaitingRoomPage.tsx';
import { LiveMeetingRoom } from './LiveMeetingRoom.tsx';
import { MeetingEndedPage } from './MeetingEndedPage.tsx';

interface MeetingRoomWrapperProps {
  meetingCode?: string;
}

export const MeetingRoomWrapper: React.FC<MeetingRoomWrapperProps> = ({ meetingCode: propCode }) => {
  const { selectedMeetingCode, currentUser, isLoadingAuth, authToken } = useApp();
  const code = propCode || selectedMeetingCode || 'nex-demo';

  const [step, setStep] = useState<'join' | 'waiting' | 'room' | 'ended'>('join');
  const [autoJoining, setAutoJoining] = useState<boolean>(false);
  const autoJoinAttemptedRef = useRef<string | null>(null);

  // Self-hosted Jitsi Session State
  const [meeting, setMeeting] = useState<any>(null);
  const [role, setRole] = useState<string>('participant');
  const [participantId, setParticipantId] = useState<string>('');
  const [identity, setIdentity] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  const [jitsiDomain, setJitsiDomain] = useState<string>('meet.nexgencouncil.bond');
  const [jitsiRoomName, setJitsiRoomName] = useState<string>('');
  const [initialAudioMuted, setInitialAudioMuted] = useState<boolean | undefined>(undefined);
  const [initialVideoMuted, setInitialVideoMuted] = useState<boolean | undefined>(undefined);
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);

  // Automatically launch meeting when user/admin is already logged in
  useEffect(() => {
    if (isLoadingAuth) return;
    if (!currentUser) return;
    if (autoJoinAttemptedRef.current === code) return;

    autoJoinAttemptedRef.current = code;
    let cancelled = false;

    const autoJoinLoggedInUser = async () => {
      setAutoJoining(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = authToken || localStorage.getItem('ng_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/join`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            displayName: currentUser.name || currentUser.username,
            email: currentUser.email || ''
          })
        });

        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          // Fall back to pre-join card if room unavailable / ended / password needed
          setAutoJoining(false);
          return;
        }

        if (data.waitingRoom) {
          setMeeting(data.meeting);
          setParticipantId(data.participantId);
          setIdentity(data.identity);
          setDisplayName(data.displayName || currentUser.name);
          setUserEmail(data.email || currentUser.email || '');
          setStep('waiting');
        } else {
          setMeeting(data.meeting);
          setRole(data.role || 'host');
          setIdentity(data.identity || currentUser.id);
          setDisplayName(data.displayName || currentUser.name);
          setUserEmail(data.email || currentUser.email || '');
          if (data.jitsiDomain) setJitsiDomain(data.jitsiDomain);
          if (data.jitsiRoomName) setJitsiRoomName(data.jitsiRoomName);
          setInitialAudioMuted(Boolean(data.startWithAudioMuted));
          setInitialVideoMuted(Boolean(data.startWithVideoMuted));
          setStep('room');
        }
      } catch {
        // Fallback to pre-join screen
      } finally {
        if (!cancelled) setAutoJoining(false);
      }
    };

    autoJoinLoggedInUser();
    return () => {
      cancelled = true;
    };
  }, [code, currentUser, isLoadingAuth, authToken]);

  const handleWaiting = (data: {
    meeting: any;
    participantId: string;
    identity: string;
    displayName: string;
    email?: string;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
  }) => {
    setMeeting(data.meeting);
    setParticipantId(data.participantId);
    setIdentity(data.identity);
    setDisplayName(data.displayName);
    if (data.email) setUserEmail(data.email);
    if (data.startWithAudioMuted !== undefined) setInitialAudioMuted(data.startWithAudioMuted);
    if (data.startWithVideoMuted !== undefined) setInitialVideoMuted(data.startWithVideoMuted);
    setStep('waiting');
  };

  const handleAdmitted = (data: {
    meeting: any;
    role: string;
    identity: string;
    displayName: string;
    email?: string;
    jitsiDomain?: string;
    jitsiRoomName?: string;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
  }) => {
    setMeeting(data.meeting);
    setRole(data.role);
    setIdentity(data.identity);
    setDisplayName(data.displayName);
    if (data.email !== undefined) setUserEmail(data.email);
    if (data.jitsiDomain) setJitsiDomain(data.jitsiDomain);
    if (data.jitsiRoomName) setJitsiRoomName(data.jitsiRoomName);
    if (data.startWithAudioMuted !== undefined) setInitialAudioMuted(data.startWithAudioMuted);
    if (data.startWithVideoMuted !== undefined) setInitialVideoMuted(data.startWithVideoMuted);
    setStep('room');
  };

  const handleLeave = (durationSeconds?: number) => {
    if (typeof durationSeconds === 'number') {
      setSessionDurationSeconds(durationSeconds);
    }
    setStep('ended');
  };

  const handleRejoin = () => {
    autoJoinAttemptedRef.current = null;
    setStep('join');
  };

  if ((isLoadingAuth || autoJoining) && step === 'join') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-11 h-11 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-serif font-bold">Launching NexGen Video Room...</h2>
        <p className="text-xs text-slate-400 mt-1">
          Preparing your session on <span className="font-mono text-slate-300">meet.nexgencouncil.bond</span>
        </p>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <MeetingWaitingRoomPage
        meeting={meeting}
        participantId={participantId}
        identity={identity}
        displayName={displayName}
        email={userEmail}
        onAdmitted={handleAdmitted}
        onLeave={() => handleLeave(0)}
      />
    );
  }

  if (step === 'room') {
    return (
      <LiveMeetingRoom
        jitsiDomain={jitsiDomain}
        jitsiRoomName={jitsiRoomName}
        initialAudioMuted={initialAudioMuted}
        initialVideoMuted={initialVideoMuted}
        meeting={meeting}
        role={role}
        identity={identity}
        displayName={displayName}
        userEmail={userEmail || currentUser?.email}
        onLeave={handleLeave}
      />
    );
  }

  if (step === 'ended') {
    return (
      <MeetingEndedPage
        meetingTitle={meeting?.title}
        roomSlug={meeting?.meetingCode || code}
        durationSeconds={sessionDurationSeconds}
        onRejoin={handleRejoin}
      />
    );
  }

  return (
    <MeetingJoinPage
      meetingCode={code}
      onWaiting={handleWaiting}
      onAdmitted={handleAdmitted}
    />
  );
};
