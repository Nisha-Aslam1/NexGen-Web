import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { Search, RefreshCw, Eye } from 'lucide-react';
import { ActivityLog } from '../../types.ts';
import { ActivityLogDetailModal } from './ActivityLogDetailModal.tsx';

export const AdminActivityLogs: React.FC = () => {
  const { addToast } = useApp();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/activity-logs?limit=150');
      const data = await res.json();
      if (Array.isArray(data)) setLogs(data);
    } catch {
      addToast('Error loading activity logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(l => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.userName || '').toLowerCase().includes(q) ||
      (l.userRole || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.entityType || '').toLowerCase().includes(q) ||
      (l.entityId || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            System Activity &amp; Governance Audit Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable tracking record of staff logins, approvals, meetings, emails, and settings updates. Click any row to read full untruncated details.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Logs</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by staff name, action, entity, details..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <span className="text-xs text-slate-400">Showing {filtered.length} entries (click any log to inspect)</span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Staff Member</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Target Entity</th>
                <th className="py-3 px-4 font-semibold">Details</th>
                <th className="py-3 px-4 font-semibold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No activity logs recorded.
                  </td>
                </tr>
              ) : (
                filtered.map(l => (
                  <tr
                    key={l.id}
                    onClick={() => setSelectedLog(l)}
                    className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap align-top">
                      {new Date(l.timestamp).toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <span className="font-semibold text-slate-900 block">{l.userName}</span>
                      {l.userRole && (
                        <span className="text-[10px] font-mono text-slate-400">{l.userRole}</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-indigo-950 bg-indigo-50 px-2 py-0.5 rounded">
                        {l.action}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-700 align-top whitespace-nowrap">
                      <span className="capitalize">{l.entityType || 'System'}</span>
                      {l.entityId && (
                        <span className="block font-mono text-[10px] text-slate-400">
                          {l.entityId}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 min-w-[220px] max-w-md align-top">
                      <p className="line-clamp-2 break-words leading-relaxed">
                        {l.details || '—'}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 text-right align-top whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(l);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 group-hover:bg-indigo-950 text-slate-700 group-hover:text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Untruncated Activity Log Modal */}
      <ActivityLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};
