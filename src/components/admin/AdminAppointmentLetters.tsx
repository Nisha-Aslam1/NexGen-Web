import React, { useCallback, useEffect, useState } from 'react';
import {
  FileCheck2,
  Search,
  Download,
  Mail,
  Plus,
  ShieldCheck,
  Stamp,
  PenTool,
  Trash2,
  RotateCcw,
  Ban,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Sparkles,
  Upload,
  RefreshCw,
  Calendar,
  Printer
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { AppointmentLetter, SignatoryProfile } from '../../types.ts';
import { AppointmentApplicantSeed, AppointmentLetterModal } from './AppointmentLetterModal.tsx';

interface EligibleApplicantItem {
  applicationId: string;
  volunteerId?: string;
  referenceCode: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  preferredRole: string;
  photoUrl?: string;
  approvedAt: string;
  hasActiveLetter: boolean;
  latestLetterId?: string;
  latestLetterNumber?: string;
  latestLetterStatus?: string;
}

const SignatoryPngThumbnail: React.FC<{
  signatoryId: string;
  kind: 'signature' | 'stamp';
  exists?: boolean;
  versionKey?: string;
}> = ({ signatoryId, kind, exists, versionKey }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!exists) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objUrl: string | null = null;
    authFetch(`/api/admin/signatories/${encodeURIComponent(signatoryId)}/asset/${kind}`)
      .then(res => (res.ok ? res.blob() : null))
      .then(blob => {
        if (!cancelled && blob) {
          objUrl = URL.createObjectURL(blob);
          setSrc(objUrl);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [signatoryId, kind, exists, versionKey]);

  if (!exists || !src) {
    return (
      <div className="h-14 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 px-3">
        No PNG uploaded
      </div>
    );
  }

  return (
    <div className="h-14 rounded-xl border border-slate-200 bg-white flex items-center justify-center p-1.5">
      <img src={src} alt={`${kind} PNG`} className="max-h-full max-w-full object-contain" />
    </div>
  );
};

export const AdminAppointmentLetters: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [subTab, setSubTab] = useState<'registry' | 'eligible' | 'signatories'>('registry');

  const [letters, setLetters] = useState<AppointmentLetter[]>([]);
  const [eligibleApps, setEligibleApps] = useState<EligibleApplicantItem[]>([]);
  const [signatories, setSignatories] = useState<SignatoryProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'ACTIVE' | 'REVOKED' | 'EXPIRED'>('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLetter, setEditingLetter] = useState<AppointmentLetter | null>(null);
  const [applicantSeed, setApplicantSeed] = useState<AppointmentApplicantSeed | null>(null);
  const [previewPdfLetter, setPreviewPdfLetter] = useState<AppointmentLetter | null>(null);
  const [selectedEligibleIds, setSelectedEligibleIds] = useState<string[]>([]);
  const [batchIssuing, setBatchIssuing] = useState(false);

  const handleBatchIssue = async () => {
    if (selectedEligibleIds.length === 0) return;
    setBatchIssuing(true);
    try {
      const res = await authFetch('/api/admin/appointment-letters/batch-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationIds: selectedEligibleIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch issuance failed');

      const successCount = (data.results || []).filter((r: any) => r.success).length;
      const skippedCount = (data.results || []).filter((r: any) => !r.success).length;
      addToast(
        `Batch Complete: ${successCount} official letters generated & emailed (3-day valid link). ${skippedCount} skipped (duplicates).`,
        'success'
      );
      setSelectedEligibleIds([]);
      loadAllData();
    } catch (err: any) {
      addToast(err.message || 'Batch issue failed', 'error');
    } finally {
      setBatchIssuing(false);
    }
  };

  // Revoke confirmation modal
  const [revokeTarget, setRevokeTarget] = useState<AppointmentLetter | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Signatory Editor Modal
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [editingSignatory, setEditingSignatory] = useState<SignatoryProfile | null>(null);
  const [sigForm, setSigForm] = useState({
    name: '',
    title: '',
    roleType: 'Executive Director' as SignatoryProfile['roleType'],
    department: 'Council Secretariat',
    active: true,
    isDefault: false,
    allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'VOLUNTEER_MANAGER'] as string[],
    signatureAssetFilename: '',
    stampAssetFilename: ''
  });
  const [savingSig, setSavingSig] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<'signature' | 'stamp' | null>(null);

  const canManageSignatories =
    currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN';
  const canIssueOrRevoke =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'VOLUNTEER_MANAGER';

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, eRes, sRes] = await Promise.all([
        authFetch('/api/admin/appointment-letters'),
        authFetch('/api/admin/appointment-letters/eligible'),
        authFetch('/api/admin/signatories')
      ]);
      const [lData, eData, sData] = await Promise.all([
        lRes.json().catch(() => []),
        eRes.json().catch(() => []),
        sRes.json().catch(() => [])
      ]);
      if (Array.isArray(lData)) setLetters(lData);
      if (Array.isArray(eData)) setEligibleApps(eData);
      if (Array.isArray(sData)) setSignatories(sData);
    } catch {
      addToast('Failed to load appointment letters registry', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const totalIssued = letters.length;
  const activeCount = letters.filter(l => l.effectiveStatus === 'ACTIVE').length;
  const revokedCount = letters.filter(l => l.effectiveStatus === 'REVOKED').length;
  const expiredCount = letters.filter(l => l.effectiveStatus === 'EXPIRED').length;
  const pendingEligibleCount = eligibleApps.filter(a => !a.hasActiveLetter).length;

  const filteredLetters = letters.filter(l => {
    if (statusFilter !== 'All' && l.effectiveStatus !== statusFilter) return false;
    if (fromDate) {
      const fromTs = new Date(fromDate).getTime();
      if (!Number.isNaN(fromTs) && new Date(l.issuedAt).getTime() < fromTs) return false;
    }
    if (toDate) {
      const toTs = new Date(`${toDate}T23:59:59Z`).getTime();
      if (!Number.isNaN(toTs) && new Date(l.issuedAt).getTime() > toTs) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        l.letterNumber.toLowerCase().includes(q) ||
        l.referenceCode.toLowerCase().includes(q) ||
        l.appointeeName.toLowerCase().includes(q) ||
        l.designation.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q) ||
        l.signatoryName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenGenerateForApplicant = (app: EligibleApplicantItem) => {
    const existingForApp = app.latestLetterId
      ? letters.find(l => l.id === app.latestLetterId) || null
      : null;

    if (existingForApp && existingForApp.effectiveStatus === 'ACTIVE') {
      setEditingLetter(existingForApp);
      setApplicantSeed(null);
    } else {
      setEditingLetter(null);
      setApplicantSeed({
        applicationId: app.applicationId,
        volunteerId: app.volunteerId,
        referenceCode: app.referenceCode,
        fullName: app.fullName,
        email: app.email,
        phone: app.phone,
        city: app.city,
        preferredRole: app.preferredRole,
        photoUrl: app.photoUrl
      });
    }
    setModalOpen(true);
  };

  const handleOpenLetterEditor = (letter: AppointmentLetter) => {
    setApplicantSeed(null);
    setEditingLetter(letter);
    setModalOpen(true);
  };

  const handleDownloadPdf = async (letter: AppointmentLetter) => {
    try {
      const res = await authFetch(`/api/appointment-letters/${encodeURIComponent(letter.id)}/pdf`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'PDF download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NexGen-Appointment-${letter.letterNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      loadAllData();
      addToast(`Downloaded ${letter.letterNumber}.pdf`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Could not download PDF', 'error');
    }
  };

  const handleSendEmail = async (letter: AppointmentLetter) => {
    try {
      const res = await authFetch(`/api/admin/appointment-letters/${encodeURIComponent(letter.id)}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Email dispatch failed');
      addToast(`Appointment letter email sent to ${letter.appointeeEmail}.`, 'success');
      loadAllData();
    } catch (err: any) {
      addToast(err.message || 'Failed to email appointee', 'error');
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setUpdatingStatus(true);
    try {
      const res = await authFetch(`/api/admin/appointment-letters/${encodeURIComponent(revokeTarget.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Revoked',
          reason: revokeReason.trim() || 'Revoked by authorized Secretariat administrator.'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Revocation failed');
      addToast(`Appointment Letter ${revokeTarget.letterNumber} has been REVOKED.`, 'info');
      setRevokeTarget(null);
      setRevokeReason('');
      loadAllData();
    } catch (err: any) {
      addToast(err.message || 'Could not revoke appointment letter', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleReissueLetter = async (letter: AppointmentLetter) => {
    setUpdatingStatus(true);
    try {
      const res = await authFetch(`/api/admin/appointment-letters/${encodeURIComponent(letter.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Active' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reissue failed');
      addToast(`Appointment Letter ${letter.letterNumber} is now ACTIVE again.`, 'success');
      loadAllData();
    } catch (err: any) {
      addToast(err.message || 'Could not reissue appointment letter', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openSignatoryModal = (sig?: SignatoryProfile) => {
    if (sig) {
      setEditingSignatory(sig);
      setSigForm({
        name: sig.name,
        title: sig.title,
        roleType: sig.roleType,
        department: sig.department || 'Council Secretariat',
        active: sig.active,
        isDefault: sig.isDefault,
        allowedRoles: Array.isArray(sig.allowedRoles) ? sig.allowedRoles : ['SUPER_ADMIN', 'ADMIN'],
        signatureAssetFilename: sig.signatureAssetFilename || '',
        stampAssetFilename: sig.stampAssetFilename || ''
      });
    } else {
      setEditingSignatory(null);
      setSigForm({
        name: '',
        title: '',
        roleType: 'Director',
        department: 'Council Secretariat',
        active: true,
        isDefault: false,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'VOLUNTEER_MANAGER'],
        signatureAssetFilename: '',
        stampAssetFilename: ''
      });
    }
    setSigModalOpen(true);
  };

  const handleUploadPngAsset = async (
    file: File,
    kind: 'signature' | 'stamp',
    signatoryId?: string
  ) => {
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      addToast('Please select a transparent PNG (.png) file.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('PNG file must be 2MB or smaller.', 'error');
      return;
    }
    setUploadingKind(kind);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read PNG file'));
        reader.readAsDataURL(file);
      });

      const res = await authFetch('/api/admin/appointment-letters/upload-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, kind, signatoryId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (kind === 'signature') {
        setSigForm(prev => ({ ...prev, signatureAssetFilename: data.filename }));
      } else {
        setSigForm(prev => ({ ...prev, stampAssetFilename: data.filename }));
      }

      if (data.signatory) {
        setSignatories(prev => prev.map(s => (s.id === data.signatory.id ? data.signatory : s)));
      }
      addToast(`Protected ${kind} PNG uploaded successfully.`, 'success');
    } catch (err: any) {
      addToast(err.message || `Failed to upload ${kind} PNG`, 'error');
    } finally {
      setUploadingKind(null);
    }
  };

  const handleSaveSignatory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sigForm.name.trim() || !sigForm.title.trim()) {
      addToast('Signatory name and official designation title are required.', 'error');
      return;
    }
    setSavingSig(true);
    try {
      const url = editingSignatory
        ? `/api/admin/signatories/${encodeURIComponent(editingSignatory.id)}`
        : '/api/admin/signatories';
      const res = await authFetch(url, {
        method: editingSignatory ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sigForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save signatory');
      addToast(
        editingSignatory ? 'Signatory configuration updated.' : 'New authorized signatory added.',
        'success'
      );
      setSigModalOpen(false);
      loadAllData();
    } catch (err: any) {
      addToast(err.message || 'Could not save signatory', 'error');
    } finally {
      setSavingSig(false);
    }
  };

  const handleDeleteSignatory = async (sig: SignatoryProfile) => {
    try {
      const res = await authFetch(`/api/admin/signatories/${encodeURIComponent(sig.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      addToast(`Removed signatory ${sig.name}.`, 'info');
      loadAllData();
    } catch (err: any) {
      addToast(err.message || 'Cannot delete signatory', 'error');
    }
  };

  const toggleAllowedRole = (role: string) => {
    if (role === 'SUPER_ADMIN') return;
    setSigForm(prev => {
      const exists = prev.allowedRoles.includes(role);
      return {
        ...prev,
        allowedRoles: exists
          ? prev.allowedRoles.filter(r => r !== role)
          : [...prev.allowedRoles, role]
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Official Appointment Letters &amp; Digital Signatories
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Issue verified A4 Secretariat appointment letters, manage authorized executive PNG signatures &amp; seals, and audit QR verification records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAllData}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          {canIssueOrRevoke && (
            <button
              type="button"
              onClick={() => setSubTab('eligible')}
              className="px-4 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-amber-300" />
              <span>Generate Appointment Letter</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Issued</div>
          <div className="text-2xl font-serif font-bold text-slate-900 mt-1">{totalIssued}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Official A4 Records</div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Active Letters</div>
          <div className="text-2xl font-serif font-bold text-emerald-800 mt-1">{activeCount}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Verified &amp; Valid</div>
        </div>

        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Revoked</div>
          <div className="text-2xl font-serif font-bold text-rose-800 mt-1">{revokedCount}</div>
          <div className="text-[11px] text-rose-600 mt-0.5">PDF Access Blocked</div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Expired</div>
          <div className="text-2xl font-serif font-bold text-amber-800 mt-1">{expiredCount}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Term Completed</div>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Pending Eligible</div>
          <div className="text-2xl font-serif font-bold text-indigo-950 mt-1">{pendingEligibleCount}</div>
          <div className="text-[11px] text-indigo-600 mt-0.5">Approved Without Letter</div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setSubTab('registry')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
            subTab === 'registry'
              ? 'bg-indigo-950 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileCheck2 className="w-4 h-4 text-amber-400" />
          <span>Appointment Registry ({letters.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('eligible')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
            subTab === 'eligible'
              ? 'bg-indigo-950 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-400" />
          <span>Eligible Approved Applicants ({eligibleApps.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('signatories')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors ${
            subTab === 'signatories'
              ? 'bg-indigo-950 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>Signatories &amp; Official Seals ({signatories.length})</span>
        </button>
      </div>

      {/* TAB 1: APPOINTMENT REGISTRY */}
      {subTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by letter number, appointee, designation, department, signatory..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
              >
                <option value="All">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="REVOKED">Revoked Only</option>
                <option value="EXPIRED">Expired Only</option>
              </select>

              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white"
                  title="Issued From Date"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white"
                  title="Issued To Date"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10.5px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Letter &amp; Ref No.</th>
                    <th className="py-3 px-4 font-semibold">Appointee</th>
                    <th className="py-3 px-4 font-semibold">Designation &amp; Division</th>
                    <th className="py-3 px-4 font-semibold">Issue / Effective</th>
                    <th className="py-3 px-4 font-semibold">Signatory</th>
                    <th className="py-3 px-4 font-semibold">Status &amp; Downloads</th>
                    <th className="py-3 px-4 font-semibold text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Loading official appointment records...
                      </td>
                    </tr>
                  ) : filteredLetters.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No appointment letters match your current filters. Use "Generate Appointment Letter" to issue one from an approved application.
                      </td>
                    </tr>
                  ) : (
                    filteredLetters.map(letter => (
                      <tr key={letter.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-indigo-950 block">
                            {letter.letterNumber}
                          </span>
                          <span className="font-mono text-[10.5px] text-slate-500">
                            {letter.referenceCode}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <strong className="text-slate-900 block">{letter.appointeeName}</strong>
                          <span className="text-[10.5px] text-slate-500 block">
                            {letter.chapter} Chapter
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <strong className="text-slate-800 block">{letter.designation}</strong>
                          <span className="text-[10.5px] text-slate-500 block">
                            {letter.department} · {letter.appointmentType}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="block text-slate-800">
                            Issued: {new Date(letter.issuedAt).toLocaleDateString()}
                          </span>
                          <span className="text-[10.5px] text-slate-500 block">
                            Eff: {letter.effectiveDate}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-800 block">{letter.signatoryName}</span>
                          <span className="text-[10.5px] text-slate-400 block truncate max-w-[160px]">
                            {letter.signatoryTitle}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              letter.effectiveStatus === 'REVOKED'
                                ? 'bg-rose-100 text-rose-800'
                                : letter.effectiveStatus === 'EXPIRED'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {letter.effectiveStatus === 'ACTIVE' && <CheckCircle2 className="w-3 h-3" />}
                            {letter.effectiveStatus === 'REVOKED' && <Ban className="w-3 h-3" />}
                            {letter.effectiveStatus === 'EXPIRED' && <Clock className="w-3 h-3" />}
                            <span>{letter.effectiveStatus || 'ACTIVE'}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            {letter.downloadCount || 0} PDF download{letter.downloadCount === 1 ? '' : 's'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewPdfLetter(letter)}
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 cursor-pointer"
                              title="Print-Ready A4 PDF Previewer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenLetterEditor(letter)}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 cursor-pointer"
                              title="Preview & Edit Appointment Letter"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(letter)}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                              title="Download Verified A4 PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {canIssueOrRevoke && letter.effectiveStatus !== 'REVOKED' && (
                              <button
                                type="button"
                                onClick={() => handleSendEmail(letter)}
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 cursor-pointer"
                                title="Send Official Appointment Email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            )}
                            {canIssueOrRevoke &&
                              (letter.effectiveStatus === 'REVOKED' ? (
                                <button
                                  type="button"
                                  disabled={updatingStatus}
                                  onClick={() => handleReissueLetter(letter)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  title="Reissue Revoked Appointment"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reissue</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevokeTarget(letter);
                                    setRevokeReason('');
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                  title="Revoke Appointment Letter"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ELIGIBLE APPROVED APPLICANTS */}
      {subTab === 'eligible' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-serif font-bold text-base text-slate-900">
                Approved Applications Eligible for Appointment Letters
              </h2>
              <p className="text-xs text-slate-500">
                Only committee-approved applicants appear here. Select multiple members to batch generate &amp; email official appointment letters (3-day valid link).
              </p>
            </div>
          </div>

          {eligibleApps.length > 0 && canIssueOrRevoke && (
            <div className="px-5 py-3 bg-indigo-950 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span>Selected: <strong>{selectedEligibleIds.length}</strong> applicant(s)</span>
                {selectedEligibleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedEligibleIds([])}
                    className="text-amber-300 underline cursor-pointer text-[11px]"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={batchIssuing || selectedEligibleIds.length === 0}
                onClick={handleBatchIssue}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>{batchIssuing ? 'Batch Generating & Sending...' : 'Batch Generate & Send Official Letters (3-Day Link)'}</span>
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectedEligibleIds.length > 0 &&
                        selectedEligibleIds.length === eligibleApps.filter(a => !a.hasActiveLetter).length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEligibleIds(eligibleApps.filter(a => !a.hasActiveLetter).map(a => a.applicationId));
                        } else {
                          setSelectedEligibleIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold">Reference Code</th>
                  <th className="py-3 px-4 font-semibold">Approved Candidate</th>
                  <th className="py-3 px-4 font-semibold">Track / Chapter</th>
                  <th className="py-3 px-4 font-semibold">Letter Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eligibleApps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No Approved applications found yet. Approve an application in the Applications tab first.
                    </td>
                  </tr>
                ) : (
                  eligibleApps.map(app => (
                    <tr key={app.applicationId} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 w-10">
                        {!app.hasActiveLetter ? (
                          <input
                            type="checkbox"
                            checked={selectedEligibleIds.includes(app.applicationId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEligibleIds(prev => [...prev, app.applicationId]);
                              } else {
                                setSelectedEligibleIds(prev => prev.filter(id => id !== app.applicationId));
                              }
                            }}
                          />
                        ) : (
                          <span className="text-slate-400 text-[10px] font-medium" title="Active letter already issued">Issued</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-950">
                        {app.referenceCode}
                      </td>
                      <td className="py-3.5 px-4">
                        <strong className="text-slate-900 block">{app.fullName}</strong>
                        <span className="text-[11px] text-slate-500">{app.email}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800 block">{app.preferredRole}</span>
                        <span className="text-[10.5px] text-slate-500">{app.city} Chapter</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {app.latestLetterNumber ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              app.latestLetterStatus === 'REVOKED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {app.latestLetterNumber} ({app.latestLetterStatus})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                            Awaiting Appointment Letter
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {canIssueOrRevoke && (
                          <button
                            type="button"
                            onClick={() => handleOpenGenerateForApplicant(app)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-[11px] font-bold cursor-pointer shadow-xs"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                            <span>
                              {app.hasActiveLetter ? 'View / Edit Letter' : 'GENERATE APPOINTMENT LETTER'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SIGNATORIES & OFFICIAL STAMPS */}
      {subTab === 'signatories' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Protected Digital Signatory &amp; Institutional Seal Governance</strong>
                <span className="text-[11px] text-amber-900/90">
                  Signature and stamp transparent PNG assets are stored in a protected server directory (never served publicly without admin authentication) and embedded directly into generated A4 PDFs.
                </span>
              </div>
            </div>
            {canManageSignatories && (
              <button
                type="button"
                onClick={() => openSignatoryModal()}
                className="px-4 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-amber-300" />
                <span>Add Authorized Signatory</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {signatories.map(sig => (
              <div
                key={sig.id}
                className={`bg-white rounded-3xl border p-5 space-y-4 shadow-xs ${
                  sig.isDefault ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-100">
                        {sig.roleType}
                      </span>
                      {sig.isDefault && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                          Default Signatory
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          sig.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {sig.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h3 className="font-serif font-bold text-base text-slate-900 mt-1.5">{sig.name}</h3>
                    <p className="text-xs text-slate-600">{sig.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Allowed Roles: {(sig.allowedRoles || []).join(', ')}
                    </p>
                  </div>

                  {canManageSignatories && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openSignatoryModal(sig)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        Configure
                      </button>
                      {signatories.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSignatory(sig)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete signatory"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                      <PenTool className="w-3 h-3" />
                      <span>Signature PNG</span>
                    </span>
                    <SignatoryPngThumbnail
                      signatoryId={sig.id}
                      kind="signature"
                      exists={sig.hasSignatureImage}
                      versionKey={sig.updatedAt}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                      <Stamp className="w-3 h-3" />
                      <span>Circular Seal PNG</span>
                    </span>
                    <SignatoryPngThumbnail
                      signatoryId={sig.id}
                      kind="stamp"
                      exists={sig.hasStampImage}
                      versionKey={sig.updatedAt}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-serif font-bold text-base text-slate-900">
                  Revoke Appointment Letter?
                </h4>
                <p className="text-xs text-slate-500">
                  {revokeTarget.letterNumber} — {revokeTarget.appointeeName}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Revoking immediately updates public QR verification to <strong>REVOKED</strong> and disables public PDF downloads. Authorized administrators may reissue later if cleared.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Revocation Reason (Displayed on Audit &amp; Verification)
              </label>
              <textarea
                rows={2}
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                placeholder="e.g. Role transitioned or superseded by updated appointment."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={handleRevokeConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {updatingStatus ? 'Revoking...' : 'Confirm Revocation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signatory Create / Configure Modal */}
      {sigModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-lg text-slate-900">
                {editingSignatory ? 'Configure Authorized Signatory' : 'New Authorized Signatory'}
              </h3>
              <button
                type="button"
                onClick={() => setSigModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSignatory} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={sigForm.name}
                    onChange={e => setSigForm({ ...sigForm, name: e.target.value })}
                    placeholder="e.g. Dr. Nisha Aslam"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Authority Role Type</label>
                  <select
                    value={sigForm.roleType}
                    onChange={e => setSigForm({ ...sigForm, roleType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Executive Director">Executive Director</option>
                    <option value="President">President</option>
                    <option value="Director">Director</option>
                    <option value="Authorized Signatory">Authorized Signatory</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Official Designation Title *</label>
                  <input
                    type="text"
                    required
                    value={sigForm.title}
                    onChange={e => setSigForm({ ...sigForm, title: e.target.value })}
                    placeholder="e.g. Executive Director — Council Secretariat"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={sigForm.department}
                    onChange={e => setSigForm({ ...sigForm, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* Transparent PNG Uploads */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Signature PNG (Transparent)</label>
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer font-semibold">
                    <Upload className="w-3.5 h-3.5 text-indigo-700" />
                    <span>{uploadingKind === 'signature' ? 'Uploading...' : 'Upload Signature PNG'}</span>
                    <input
                      type="file"
                      accept="image/png"
                      className="hidden"
                      disabled={uploadingKind !== null}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPngAsset(f, 'signature', editingSignatory?.id);
                      }}
                    />
                  </label>
                  {sigForm.signatureAssetFilename && (
                    <span className="text-[10px] text-emerald-700 font-semibold block truncate">
                      ✓ {sigForm.signatureAssetFilename}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Official Stamp PNG (Transparent)</label>
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer font-semibold">
                    <Upload className="w-3.5 h-3.5 text-amber-600" />
                    <span>{uploadingKind === 'stamp' ? 'Uploading...' : 'Upload Stamp PNG'}</span>
                    <input
                      type="file"
                      accept="image/png"
                      className="hidden"
                      disabled={uploadingKind !== null}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadPngAsset(f, 'stamp', editingSignatory?.id);
                      }}
                    />
                  </label>
                  {sigForm.stampAssetFilename && (
                    <span className="text-[10px] text-emerald-700 font-semibold block truncate">
                      ✓ {sigForm.stampAssetFilename}
                    </span>
                  )}
                </div>
              </div>

              {/* Status & Role Permissions */}
              <div className="space-y-2 pt-1">
                <span className="block font-bold text-slate-700">Roles Permitted to Issue Under This Signatory:</span>
                <div className="flex flex-wrap gap-2">
                  {['SUPER_ADMIN', 'ADMIN', 'VOLUNTEER_MANAGER'].map(role => (
                    <label
                      key={role}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={sigForm.allowedRoles.includes(role)}
                        disabled={role === 'SUPER_ADMIN'}
                        onChange={() => toggleAllowedRole(role)}
                      />
                      <span className="font-semibold">{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={sigForm.active}
                    onChange={e => setSigForm({ ...sigForm, active: e.target.checked })}
                  />
                  <span>Signatory Active</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={sigForm.isDefault}
                    onChange={e => setSigForm({ ...sigForm, isDefault: e.target.checked })}
                  />
                  <span>Set as Default Authorized Signatory</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSigModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSig}
                  className="px-5 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingSig ? 'Saving...' : 'Save Signatory Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit / Preview Appointment Letter Studio Modal */}
      <AppointmentLetterModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existingLetter={editingLetter}
        applicantSeed={applicantSeed}
        onSaved={() => loadAllData()}
      />

      {/* Print-Ready A4 PDF Previewer Modal */}
      {previewPdfLetter && (
        <AppointmentPdfPreviewModal
          letter={previewPdfLetter}
          onClose={() => setPreviewPdfLetter(null)}
        />
      )}
    </div>
  );
};

const AppointmentPdfPreviewModal: React.FC<{
  letter: AppointmentLetter | null;
  onClose: () => void;
}> = ({ letter, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!letter) return;
    let cancelled = false;
    let url: string | null = null;
    setLoading(true);
    setError(null);
    authFetch(`/api/appointment-letters/${encodeURIComponent(letter.id)}/pdf?token=${encodeURIComponent(letter.verificationToken)}&disposition=inline`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load A4 print preview.');
        return res.blob();
      })
      .then(blob => {
        if (!cancelled) {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Could not render PDF preview.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [letter]);

  if (!letter) return null;

  const handlePrint = () => {
    const iframe = document.getElementById('a4-pdf-preview-iframe') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  const handleDownload = async () => {
    try {
      const res = await authFetch(`/api/appointment-letters/${encodeURIComponent(letter.id)}/pdf`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NexGen-Appointment-${letter.letterNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
        <div className="px-6 py-4 bg-slate-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="text-[10px] text-amber-300 font-bold uppercase tracking-widest">
              Print-Ready A4 Document Previewer (Exact Dimensions &amp; Fonts)
            </div>
            <h3 className="font-serif font-bold text-base mt-0.5">
              Appointment Letter: {letter.letterNumber} — {letter.appointeeName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print A4 Document</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden p-2 sm:p-4">
          {loading ? (
            <div className="text-xs text-slate-600 font-medium">Rendering A4 print-ready PDF preview...</div>
          ) : error ? (
            <div className="p-6 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Preview Error</p>
              <p className="text-xs text-slate-600">{error}</p>
            </div>
          ) : blobUrl ? (
            <iframe
              id="a4-pdf-preview-iframe"
              src={blobUrl}
              title="A4 Print Preview"
              className="w-full h-full rounded-2xl border border-slate-300 shadow-lg bg-white"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
