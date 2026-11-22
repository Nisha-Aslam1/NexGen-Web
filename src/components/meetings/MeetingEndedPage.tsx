import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { CheckCircle2, Home, RotateCcw, LayoutDashboard } from 'lucide-react';

interface MeetingEndedProps {
  meetingTitle?: string;
  roomSlug?: string;
  durationSeconds?: number;
  reason?: string;
  onRejoin?: () => void;
}

function formatDuration(secs?: number): string {
  if (!secs || secs <= 0) return 'Under 1 min';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const MeetingEndedPage: React.FC<MeetingEndedProps> = ({
  meetingTitle,
  roomSlug,
  durationSeconds,
  reason,
  onRejoin
}) => {
  const { currentUser, setActivePage, setAdminTab } = useApp();

  const handleBackToDashboard = () => {
    setAdminTab('meetings');
    setActivePage('admin');
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">Meeting Ended</h2>
          {meetingTitle && <p className="text-slate-200 text-sm font-semibold">{meetingTitle}</p>}
          <p className="text-slate-400 text-xs">
            {reason || 'You have exited the video conference cleanly on NexGen Council.'}
          </p>
        </div>

        {(roomSlug || (durationSeconds !== undefined && durationSeconds > 0)) && (
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-xs space-y-2">
            {roomSlug && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Room Slug</span>
                <span className="font-mono text-slate-200">{roomSlug}</span>
              </div>
            )}
            {durationSeconds !== undefined && durationSeconds > 0 && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Session Time</span>
                <span className="font-mono text-amber-300 tabular-nums">{formatDuration(durationSeconds)}</span>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex flex-col gap-2.5">
          {currentUser && (
            <button
              type="button"
              onClick={handleBackToDashboard}
              className="w-full min-h-[44px] py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Return to Meetings Dashboard</span>
            </button>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {onRejoin && (
              <button
                type="button"
                onClick={onRejoin}
                className="w-full min-h-[44px] py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Rejoin</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActivePage('home')}
              className="w-full min-h-[44px] py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Website Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
