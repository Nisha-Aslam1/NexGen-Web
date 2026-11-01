import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { MeetingJoinPage } from './MeetingJoinPage.tsx';
import { MeetingWaitingRoomPage } from './MeetingWaitingRoomPage.tsx';
import { LiveMeetingRoom } from './LiveMeetingRoom.tsx';
import { MeetingEndedPage } from './MeetingEndedPage.tsx';

interface MeetingRoomWrapperProps {
  meetingCode?: string;
}

export const MeetingRoomWrapper: React.FC<MeetingRoomWrapperProps> = ({ meetingCode: propCode }) => {
  const { selectedMeetingCode, setActivePage } = useApp();
  const code = propCode || selectedMeetingCode || 'nex-demo';

  const [step, setStep] = useState<'join' | 'waiting' | 'room' | 'ended'>('join');

  // Meeting Session State
  const [meeting, setMeeting] = useState<any>(null);
  const [livekitToken, setLivekitToken] = useState<string>('');
  const [livekitUrl, setLivekitUrl] = useState<string>('');
  const [role, setRole] = useState<string>('participant');
  const [participantId, setParticipantId] = useState<string>('');
  const [identity, setIdentity] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');

  const handleWaiting = (data: { meeting: any; participantId: string; identity: string; displayName: string }) => {
    setMeeting(data.meeting);
    setParticipantId(data.participantId);
    setIdentity(data.identity);
    setDisplayName(data.displayName);
    setStep('waiting');
  };

  const handleAdmitted = (data: { token: string; livekitUrl: string; meeting: any; role: string; identity: string; displayName: string }) => {
    setLivekitToken(data.token);
    setLivekitUrl(data.livekitUrl);
    setMeeting(data.meeting);
    setRole(data.role);
    setIdentity(data.identity);
    setDisplayName(data.displayName);
    setStep('room');
  };

  const handleLeave = () => {
    setStep('ended');
  };

  const handleRejoin = () => {
    setStep('join');
  };

  if (step === 'waiting') {
    return (
      <MeetingWaitingRoomPage
        meeting={meeting}
        participantId={participantId}
        identity={identity}
        displayName={displayName}
        onAdmitted={handleAdmitted}
        onLeave={() => setStep('ended')}
      />
    );
  }

  if (step === 'room') {
    return (
      <LiveMeetingRoom
        token={livekitToken}
        livekitUrl={livekitUrl}
        meeting={meeting}
        role={role}
        identity={identity}
        displayName={displayName}
        onLeave={handleLeave}
      />
    );
  }

  if (step === 'ended') {
    return (
      <MeetingEndedPage
        meetingTitle={meeting?.title}
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
