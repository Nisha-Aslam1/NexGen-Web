import React, { useEffect, useState } from 'react';
import { Shield, Clock, XCircle, LogOut } from 'lucide-react';

interface WaitingRoomProps {
  meeting: any;
  participantId: string;
  identity: string;
  displayName: string;
  onAdmitted: (data: { token: string; livekitUrl: string; meeting: any; role: string; identity: string; displayName: string }) => void;
  onLeave: () => void;
}

export const MeetingWaitingRoomPage: React.FC<WaitingRoomProps> = ({
  meeting,
  participantId,
  identity,
  displayName,
  onAdmitted,
  onLeave
}) => {
  const [status, setStatus] = useState<'waiting' | 'admitted' | 'rejected'>('waiting');

  useEffect(() => {
    let interval: any = null;

    const checkAdmission = async () => {
      try {
        const res = await fetch(
          `/api/meetings/${meeting.id}/admission-status?participantId=${participantId}&identity=${identity}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.admissionStatus === 'admitted' && data.token) {
            setStatus('admitted');
            clearInterval(interval);
            onAdmitted({
              token: data.token,
              livekitUrl: data.livekitUrl,
              meeting: data.meeting,
              role: data.role,
              identity: data.identity,
              displayName: data.displayName
            });
          } else if (data.admissionStatus === 'rejected') {
            setStatus('rejected');
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn('Admission status poll error:', err);
      }
    };

    checkAdmission();
    interval = setInterval(checkAdmission, 2000); // Poll every 2 seconds

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [meeting.id, participantId, identity, onAdmitted]);

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
            onClick={onLeave}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Return to Main Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between items-center p-6 selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="NexGen Council" className="h-9 w-9 object-contain" />
          <span className="font-serif font-bold text-white text-base">NexGen Council Meetings</span>
        </div>

        <button
          onClick={onLeave}
          className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Cancel &amp; Leave</span>
        </button>
      </div>

      {/* Waiting Room Body */}
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-ping"></div>
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Shield className="w-8 h-8" />
          </div>
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-bold border border-amber-500/20 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Waiting Room Active
          </span>
          <h2 className="text-2xl font-serif font-bold text-white">Please wait, the host will let you in soon</h2>
          <p className="text-slate-400 text-xs">
            You requested entry as <span className="text-amber-300 font-bold">{displayName}</span> for meeting <span className="text-white font-semibold">{meeting.title}</span>.
          </p>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Meeting Host:</span>
            <span className="text-slate-200 font-semibold">{meeting.hostName}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Meeting Code:</span>
            <span className="text-mono text-amber-300 font-bold">{meeting.meetingCode}</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
          <span>Waiting for host admission...</span>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-xs text-slate-500">
        NexGen Encrypted Waiting Room • Developed by Nisha Aslam
      </footer>
    </div>
  );
};
