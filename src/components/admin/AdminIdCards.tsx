import React, { useState, useEffect, useCallback } from 'react';
import { useApp, normalizeUserRole } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { IdCardRecord } from '../../types.ts';
import { VolunteerIdCardModal } from './VolunteerIdCardModal.tsx';
import {
  Search,
  Download,
  CreditCard,
  Lock,
  Unlock,
  Eye,
  Trash2,
  RefreshCw,
  Image as ImageIcon,
  X,
  Phone,
  MapPin,
  Mail,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const AdminIdCards: React.FC = () => {
  const { addToast, currentUser } = useApp();
  const [records, setRecords] = useState<IdCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lockFilter, setLockFilter] = useState<'all' | 'locked' | 'unlocked'>('all');

  const [viewingCardRecord, setViewingCardRecord] = useState<IdCardRecord | null>(null);
  const [photoPreviewRecord, setPhotoPreviewRecord] = useState<IdCardRecord | null>(null);
  const [unlockCandidate, setUnlockCandidate] = useState<IdCardRecord | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<IdCardRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const normalizedRole = normalizeUserRole(currentUser?.role);
  const canManage = normalizedRole === 'SUPER_ADMIN' || normalizedRole === 'ADMIN' || normalizedRole === 'VOLUNTEER_MANAGER';

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/id-card-records');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load ID card records');
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (err: any) {
      addToast(err.message || 'Could not load Official ID Card records', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleExportCsv = async () => {
    try {
      const res = await authFetch('/api/id-card-records/export/csv');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to export CSV');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'nexgen-official-id-card-records.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast('Official ID Card registry exported as CSV.', 'success');
    } catch (err: any) {
      addToast(err.message || 'CSV export failed', 'error');
    }
  };

  const confirmUnlockReissue = async () => {
    if (!unlockCandidate) return;
    setBusyId(unlockCandidate.id);
    try {
      const res = await authFetch(`/api/id-card-records/${unlockCandidate.id}/reset-lock`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlock re-issuance');

      setRecords(prev => prev.map(r => (r.id === unlockCandidate.id ? data : r)));
      addToast(`One-time claim unlocked for ${unlockCandidate.fullName} (${unlockCandidate.referenceCode}).`, 'success');
      setUnlockCandidate(null);
    } catch (err: any) {
      addToast(err.message || 'Error unlocking ID card re-issuance', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteRecord = async () => {
    if (!deleteCandidate) return;
    setBusyId(deleteCandidate.id);
    try {
      const res = await authFetch(`/api/id-card-records/${deleteCandidate.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete ID card record');
      }
      setRecords(prev => prev.filter(r => r.id !== deleteCandidate.id));
      addToast(`ID Card record for ${deleteCandidate.fullName} removed.`, 'info');
      setDeleteCandidate(null);
    } catch (err: any) {
      addToast(err.message || 'Error deleting record', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = records.filter(r => {
    const matchesLock =
      lockFilter === 'all' ||
      (lockFilter === 'locked' && r.locked) ||
      (lockFilter === 'unlocked' && !r.locked);
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.referenceCode.toLowerCase().includes(q) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.city && r.city.toLowerCase().includes(q)) ||
      (r.assignedRole && r.assignedRole.toLowerCase().includes(q));
    return matchesLock && matchesSearch;
  });

  const lockedCount = records.filter(r => r.locked).length;
  const unlockedCount = records.filter(r => !r.locked).length;
  const uniqueChapters = new Set(records.map(r => (r.city || '').trim()).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Official Member ID Card Registry
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Official archive of member portrait photos, contact records, and one-time public ID card issuances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchRecords}
            className="px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Registry</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Total Issued Records
          </span>
          <strong className="text-2xl font-serif font-bold text-slate-900 tabular-nums mt-1 block">
            {records.length}
          </strong>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            One-Time Locked Claims
          </span>
          <strong className="text-2xl font-serif font-bold text-emerald-700 tabular-nums mt-1 block">
            {lockedCount}
          </strong>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Unlocked for Re-issue
          </span>
          <strong className="text-2xl font-serif font-bold text-amber-700 tabular-nums mt-1 block">
            {unlockedCount}
          </strong>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Chapters Represented
          </span>
          <strong className="text-2xl font-serif font-bold text-indigo-950 tabular-nums mt-1 block">
            {uniqueChapters}
          </strong>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, reference code, city, phone, email..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 w-full sm:w-auto justify-end">
          <span>Claim State:</span>
          <select
            value={lockFilter}
            onChange={e => setLockFilter(e.target.value as 'all' | 'locked' | 'unlocked')}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white"
          >
            <option value="all">All Records ({records.length})</option>
            <option value="locked">Issued &amp; Locked ({lockedCount})</option>
            <option value="unlocked">Re-issue Unlocked ({unlockedCount})</option>
          </select>
        </div>
      </div>

      {/* Registry Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 font-semibold">Saved Portrait &amp; Member</th>
                <th className="py-3 px-4 font-semibold">Reference Code</th>
                <th className="py-3 px-4 font-semibold">Chapter &amp; Contact</th>
                <th className="py-3 px-4 font-semibold">Issuance Record</th>
                <th className="py-3 px-4 font-semibold">Claim Lock</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading Official ID Card records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400 space-y-1">
                    <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">No ID Card issuance records found</p>
                    <p className="text-[11px] text-slate-400">
                      When approved members upload their portrait photo and claim their ID card from Track Application, their official record and saved portrait appear here automatically.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPhotoPreviewRecord(rec)}
                          title="Inspect saved portrait photo"
                          className="w-12 h-12 rounded-full bg-slate-100 border-2 border-indigo-950/20 overflow-hidden shrink-0 hover:ring-2 hover:ring-amber-400 transition-all cursor-pointer"
                        >
                          {rec.photoUrl ? (
                            <img
                              src={rec.photoUrl}
                              alt={rec.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="w-full h-full flex items-center justify-center text-slate-400 font-bold">
                              {rec.fullName.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </button>
                        <div className="min-w-0">
                          <strong className="text-slate-900 block text-xs truncate">{rec.fullName}</strong>
                          <span className="text-[11px] text-indigo-900 font-medium block truncate">
                            {rec.assignedRole}
                          </span>
                          {rec.membershipTier && (
                            <span className="text-[10px] text-slate-500 block">{rec.membershipTier}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-indigo-950 whitespace-nowrap">
                      {rec.referenceCode}
                    </td>

                    <td className="py-3.5 px-4 space-y-0.5">
                      <span className="text-slate-800 font-medium flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{rec.city || 'National Chapter'}</span>
                      </span>
                      {rec.phone && (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono tabular-nums">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{rec.phone}</span>
                        </span>
                      )}
                      {rec.email && (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 truncate max-w-[200px]">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{rec.email}</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 space-y-0.5 whitespace-nowrap">
                      <span className="text-slate-900 font-medium block tabular-nums">
                        {new Date(rec.issuedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}{' '}
                        ·{' '}
                        {new Date(rec.issuedAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span className="text-[11px] text-slate-500 block tabular-nums">
                        Format: <strong className="text-slate-700">{(rec.issuedFormat || 'pdf').toUpperCase()}</strong> · Claims:{' '}
                        <strong className="text-slate-700">{rec.downloadCount}</strong>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {rec.locked ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px]">
                          <Lock className="w-3 h-3 text-emerald-600" />
                          <span>Issued &amp; Locked</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[11px]">
                          <Unlock className="w-3 h-3 text-amber-700" />
                          <span>Re-issue Allowed</span>
                        </span>
                      )}
                      {rec.resetByAdminName && (
                        <span className="block text-[10px] text-slate-400 mt-1">
                          Reset by {rec.resetByAdminName}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingCardRecord(rec)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-amber-300 text-[11px] font-semibold cursor-pointer transition-colors"
                          title="Open Official Member ID Card"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Card</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPhotoPreviewRecord(rec)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold cursor-pointer transition-colors"
                          title="Inspect uploaded portrait image"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-slate-600" />
                          <span>Photo</span>
                        </button>

                        {canManage && rec.locked && (
                          <button
                            type="button"
                            onClick={() => setUnlockCandidate(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-semibold cursor-pointer transition-colors"
                            title="Allow one-time re-issuance on Track portal"
                          >
                            <Unlock className="w-3.5 h-3.5 text-amber-700" />
                            <span>Unlock</span>
                          </button>
                        )}

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(rec)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors"
                            title="Delete Official Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Uploaded Portrait Lightbox Modal */}
      {photoPreviewRecord && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPhotoPreviewRecord(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-serif font-bold text-lg text-slate-900">{photoPreviewRecord.fullName}</h3>
                <p className="text-xs font-mono text-indigo-900">{photoPreviewRecord.referenceCode}</p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoPreviewRecord(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center py-2">
              <div className="w-60 h-60 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                <img
                  src={photoPreviewRecord.photoUrl}
                  alt={photoPreviewRecord.fullName}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3.5 text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Chapter / City</span>
                <span className="font-semibold text-slate-900">{photoPreviewRecord.city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone</span>
                <span className="font-mono font-semibold text-slate-900">{photoPreviewRecord.phone || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Saved Image Path</span>
                <span className="font-mono text-[11px] text-indigo-900 truncate max-w-[200px]">
                  {photoPreviewRecord.photoUrl}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <a
                href={photoPreviewRecord.photoUrl}
                download={`${photoPreviewRecord.referenceCode}_portrait.jpg`}
                className="px-4 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Saved Photo</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Official Card Inspection / Reprint Modal (Admin unrestricted mode) */}
      {viewingCardRecord && (
        <VolunteerIdCardModal
          volunteer={{
            id: viewingCardRecord.volunteerId || viewingCardRecord.applicationId || viewingCardRecord.id,
            fullName: viewingCardRecord.fullName,
            email: viewingCardRecord.email,
            phone: viewingCardRecord.phone,
            city: viewingCardRecord.city,
            assignedRole: viewingCardRecord.assignedRole,
            assignedProgram: viewingCardRecord.assignedProgram,
            membershipTier: viewingCardRecord.membershipTier,
            referenceCode: viewingCardRecord.referenceCode,
            joinedDate: viewingCardRecord.issuedAt,
            avatar: viewingCardRecord.photoUrl
          }}
          isAdmin={true}
          onClose={() => setViewingCardRecord(null)}
        />
      )}

      {/* Unlock Re-issuance Confirmation Modal */}
      {unlockCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Unlock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-slate-900">Allow One-Time Re-Issuance?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Unlocking <strong>{unlockCandidate.fullName}</strong> ({unlockCandidate.referenceCode}) will permit them to upload a new portrait and download their Official ID Card once more from the Track Application portal.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUnlockCandidate(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === unlockCandidate.id}
                onClick={confirmUnlockReissue}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{busyId === unlockCandidate.id ? 'Unlocking...' : 'Confirm Unlock'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Record Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-slate-900">Delete ID Card Record?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Are you sure you want to remove the official ID card issuance record for <strong>{deleteCandidate.fullName}</strong> ({deleteCandidate.referenceCode})?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === deleteCandidate.id}
                onClick={confirmDeleteRecord}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {busyId === deleteCandidate.id ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
