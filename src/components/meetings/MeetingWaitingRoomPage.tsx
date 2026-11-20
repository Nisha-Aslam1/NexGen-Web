import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Shield, Clock, XCircle, LogOut } from 'lucide-react';

interface WaitingRoomProps {
  meeting: any;
  participantId: string;
  identity: string;
  displayName: string;
  email?: string;
  onAdmitted: (data: {
    meeting: any;
    role: string;
    identity: string;
    displayName: string;
    email?: string;
    jitsiDomain?: string;
    jitsiRoomName?: string;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
  }) => void;
  onLeave: () => void;
}

export const MeetingWaitingRoomPage: React.FC<WaitingRoomProps> = ({
  meeting,
  participantId,
  identity,
  displayName,
  email,
  onAdmitted,
  onLeave
}) => {
  const { setActivePage } = useApp();
  const [status, setStatus] = useState<'waiting' | 'admitted' | 'rejected'>('waiting');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const checkAdmission = async () => {
      try {
        const res = await fetch(
          `/api/meetings/${meeting.id}/admission-status?participantId=${encodeURIComponent(participantId)}&identity=${encodeURIComponent(identity)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.admissionStatus === 'admitted') {
            setStatus('admitted');
            if (interval) clearInterval(interval);
            onAdmitted({
              meeting: data.meeting || meeting,
              role: data.role || 'participant',
              identity: data.identity || identity,
              displayName: data.displayName || displayName,
              email,
              jitsiDomain: data.jitsiDomain,
              jitsiRoomName: data.jitsiRoomName,
              startWithAudioMuted: data.startWithAudioMuted,
              startWithVideoMuted: data.startWithVideoMuted
            });
          } else if (data.admissionStatus === 'rejected') {
            setStatus('rejected');
            if (interval) clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn('Admission status poll error:', err);
      }
    };

    checkAdmission();
    interval = setInterval(checkAdmission, 2000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [meeting, participantId, identity, displayName, email, onAdmitted]);

  if (status === 'rejected') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <XCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-white">Entry Declined</h2>
          <p className="text-slate-400 text-sm">
            The meeting host did not approve your request to join <span className="text-white font-semibold">{meeting.title}</span>.
          </p>
          <button
            onClick={() => setActivePage('home')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Return to NexGen Council
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between items-center p-6 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-4xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="NexGen Council" className="h-9 w-9 object-contain" />
          <span className="font-serif font-bold text-white text-base">NexGen Council Conferencing</span>
        </div>

        <button
          onClick={onLeave}
          className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave Lobby</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/30">
          <Shield className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Lobby Active</span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-white">Please wait, the host will admit you soon</h2>
          <p className="text-slate-400 text-xs">
            Requested entry as <span className="text-amber-300 font-semibold">{displayName}</span> for{' '}
            <span className="text-white font-semibold">{meeting.title}</span>.
          </p>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Host</span>
            <span className="text-slate-200 font-semibold">{meeting.hostName}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Room Slug</span>
            <span className="font-mono text-amber-300 font-semibold">{meeting.meetingCode}</span>
          </div>
        </div>

        <div className="pt-1 text-xs text-slate-500">
          Waiting for host admission...
        </div>
      </div>

      <footer className="text-xs text-slate-500">
        NexGen Council Video Platform
      </footer>
    </div>
  );
};
