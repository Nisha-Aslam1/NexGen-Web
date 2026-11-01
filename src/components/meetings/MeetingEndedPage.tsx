import React from 'react';
import { Video, CheckCircle2, Home, RotateCcw } from 'lucide-react';

interface MeetingEndedProps {
  meetingTitle?: string;
  reason?: string;
  onRejoin?: () => void;
}

export const MeetingEndedPage: React.FC<MeetingEndedProps> = ({ meetingTitle, reason, onRejoin }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-serif font-bold text-white">You Left the Meeting</h2>
          {meetingTitle && <p className="text-slate-300 text-sm font-semibold">{meetingTitle}</p>}
          <p className="text-slate-400 text-xs">
            {reason || 'Thank you for participating in the NexGen Council video session.'}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          {onRejoin && (
            <button
              onClick={onRejoin}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Rejoin Meeting</span>
            </button>
          )}
          <button
            onClick={() => window.location.href = '/'}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Return to Portal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
