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
  onLeave: (reason?: string) => void;
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
    let eventSource: EventSource | null = null;
    let disposed = false;

    const checkAdmission = async () => {
      try {
        const res = await fetch(
          `/api/meetings/${meeting.id}/admission-status?participantId=${encodeURIComponent(participantId)}&identity=${encodeURIComponent(identity)}`
        );
        if (res.ok && !disposed) {
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
          } else if (data.admissionStatus === 'ended') {
            if (interval) clearInterval(interval);
            onLeave('The host has ended this meeting for everyone.');
          }
        }
      } catch (err) {
        console.warn('Admission status poll error:', err);
      }
    };

    if (typeof EventSource !== 'undefined' && meeting?.id) {
      try {
        eventSource = new EventSource(
          `/api/meetings/${meeting.id}/events?identity=${encodeURIComponent(identity)}`
        );
        eventSource.onmessage = (event) => {
          if (disposed) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'meeting_ended') {
              onLeave(payload.reason || 'The host has ended this meeting for everyone.');
            } else if (
              payload.type === 'admission_updated' &&
              (payload.admitAll ||
                payload.participantId === participantId ||
                payload.identity === identity)
            ) {
              if (payload.admissionStatus === 'rejected') {
                setStatus('rejected');
              } else {
                checkAdmission();
              }
            }
          } catch {}
        };
      } catch {}
    }

    checkAdmission();
    interval = setInterval(checkAdmission, 2500);

    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }
    };
  }, [meeting, participantId, identity, displayName, email, onAdmitted, onLeave]);

  if (status === 'rejected') {
    return (
      <div className="min-h-dvh bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <XCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">Entry Declined</h2>
          <p className="text-slate-400 text-sm">
            The meeting host did not approve your request to join <span className="text-white font-semibold">{meeting.title}</span>.
          </p>
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="w-full min-h-[44px] py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Return to NexGen Council
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col justify-between items-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-4xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/logo.png" alt="NexGen Council" className="h-8 w-8 sm:h-9 sm:w-9 object-contain shrink-0" />
          <span className="font-serif font-bold text-white text-sm sm:text-base truncate">
            NexGen Council Meet
          </span>
        </div>

        <button
          type="button"
          onClick={() => onLeave()}
          className="min-h-[40px] text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave Lobby</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl my-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/30">
          <Shield className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Lobby Active</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">Please wait, the host will admit you soon</h2>
          <p className="text-slate-400 text-xs">
            Requested entry as <span className="text-amber-300 font-semibold">{displayName}</span> for{' '}
            <span className="text-white font-semibold">{meeting.title}</span>.
          </p>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left space-y-2 text-xs">
          <div className="flex justify-between gap-3 text-slate-400">
            <span>Host</span>
            <span className="text-slate-200 font-semibold text-right">{meeting.hostName}</span>
          </div>
          <div className="flex justify-between gap-3 text-slate-400">
            <span>Room Slug</span>
            <span className="font-mono text-amber-300 font-semibold text-right">{meeting.meetingCode}</span>
          </div>
        </div>

        <div className="pt-1 flex items-center justify-center gap-2 text-xs text-slate-400">
          <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Checking admission automatically...</span>
        </div>
      </div>

      <footer className="text-xs text-slate-500">
        NexGen Council Video Platform
      </footer>
    </div>
  );
};
