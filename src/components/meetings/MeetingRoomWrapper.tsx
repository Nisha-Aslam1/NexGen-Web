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
  const { selectedMeetingCode } = useApp();
  const code = propCode || selectedMeetingCode || 'nex-demo';

  const [step, setStep] = useState<'join' | 'waiting' | 'room' | 'ended'>('join');

  // Meeting Session & JaaS State
  const [meeting, setMeeting] = useState<any>(null);
  const [role, setRole] = useState<string>('participant');
  const [participantId, setParticipantId] = useState<string>('');
  const [identity, setIdentity] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');

  const [jaasToken, setJaasToken] = useState<string | null>(null);
  const [jaasAppId, setJaasAppId] = useState<string>('');
  const [jaasRoomName, setJaasRoomName] = useState<string>('');
  const [jaasDomain, setJaasDomain] = useState<string>('8x8.vc');
  const [jaasError, setJaasError] = useState<string | undefined>(undefined);

  const handleWaiting = (data: { meeting: any; participantId: string; identity: string; displayName: string }) => {
    setMeeting(data.meeting);
    setParticipantId(data.participantId);
    setIdentity(data.identity);
    setDisplayName(data.displayName);
    setStep('waiting');
  };

  const handleAdmitted = (data: {
    meeting: any;
    role: string;
    identity: string;
    displayName: string;
    jaasToken?: string | null;
    jaasAppId?: string;
    jaasRoomName?: string;
    jaasDomain?: string;
    jaasError?: string;
  }) => {
    setMeeting(data.meeting);
    setRole(data.role);
    setIdentity(data.identity);
    setDisplayName(data.displayName);
    if (data.jaasToken !== undefined) setJaasToken(data.jaasToken);
    if (data.jaasAppId) setJaasAppId(data.jaasAppId);
    if (data.jaasRoomName) setJaasRoomName(data.jaasRoomName);
    if (data.jaasDomain) setJaasDomain(data.jaasDomain);
    if (data.jaasError) setJaasError(data.jaasError);
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
        jaasToken={jaasToken}
        jaasAppId={jaasAppId}
        jaasRoomName={jaasRoomName}
        jaasDomain={jaasDomain}
        jaasError={jaasError}
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
