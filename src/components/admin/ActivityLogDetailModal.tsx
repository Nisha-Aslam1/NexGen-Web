import React, { useState } from 'react';
import { ActivityLog } from '../../types.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Activity, Check, Clock, Copy, ShieldCheck, User, X } from 'lucide-react';

interface ActivityLogDetailModalProps {
  log: ActivityLog | null;
  onClose: () => void;
}

export const ActivityLogDetailModal: React.FC<ActivityLogDetailModalProps> = ({ log, onClose }) => {
  const { addToast } = useApp();
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const formattedTime = new Date(log.timestamp).toLocaleString();

  const handleCopyFullLog = () => {
    const summaryText = [
      `Log ID: ${log.id}`,
      `Timestamp: ${formattedTime} (${log.timestamp})`,
      `Staff User: ${log.userName} (${log.userRole || 'Staff'})`,
      `Action: ${log.action}`,
      `Entity: ${log.entityType || 'General'}${log.entityId ? ` / ${log.entityId}` : ''}`,
      log.ipAddress ? `IP Address: ${log.ipAddress}` : null,
      `Details:\n${log.details || '—'}`
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    addToast('Full activity log details copied to clipboard.', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="inline-block font-mono text-[11px] font-bold text-indigo-950 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase">
                {log.action}
              </span>
              <h3 className="text-lg font-serif font-bold text-slate-900 mt-1 break-words">
                Audit Log Full Record
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close log details"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Structured Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Timestamp
            </span>
            <p className="font-semibold text-slate-900">{formattedTime}</p>
            <p className="font-mono text-[10px] text-slate-500 break-all">{log.timestamp}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <User className="w-3 h-3" /> Staff Member
            </span>
            <p className="font-semibold text-slate-900 break-words">{log.userName}</p>
            <p className="font-mono text-[10px] text-indigo-700 font-semibold">
              {log.userRole || 'Staff'} {log.userId ? `• ${log.userId}` : ''}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Target Entity
            </span>
            <p className="font-semibold text-slate-900 capitalize break-words">
              {log.entityType || 'System'}
            </p>
            {log.entityId && (
              <p className="font-mono text-[11px] text-slate-600 break-all">ID: {log.entityId}</p>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Record Metadata
            </span>
            <p className="font-mono text-[11px] text-slate-700 break-all">Log ID: {log.id}</p>
            {log.ipAddress && (
              <p className="font-mono text-[11px] text-slate-500">IP: {log.ipAddress}</p>
            )}
          </div>
        </div>

        {/* Full Untruncated Details Box */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
            Complete Unabridged Details
          </span>
          <div className="p-4 rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 text-xs leading-relaxed font-mono whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
            {log.details || 'No additional details recorded.'}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleCopyFullLog}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied Full Log' : 'Copy Full Log'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
