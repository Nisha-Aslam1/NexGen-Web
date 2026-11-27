import React, { useEffect, useState } from 'react';
import {
  X,
  FileCheck2,
  Printer,
  Download,
  Mail,
  Eye,
  FileText,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Send
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  AppointmentLetter,
  AppointmentType,
  SignatoryProfile
} from '../../types.ts';
import { AppointmentLetterPreview, AppointmentPreviewData } from './AppointmentLetterPreview.tsx';

export interface AppointmentApplicantSeed {
  applicationId?: string;
  volunteerId?: string;
  referenceCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  city?: string;
  preferredRole?: string;
  membershipTier?: string;
  photoUrl?: string;
}

interface AppointmentLetterModalProps {
  open: boolean;
  onClose: () => void;
  existingLetter?: AppointmentLetter | null;
  applicantSeed?: AppointmentApplicantSeed | null;
  onSaved?: (letter: AppointmentLetter) => void;
}

const APPOINTMENT_TYPES: AppointmentType[] = [
  'Volunteer',
  'Coordinator',
  'Ambassador',
  'Leadership',
  'Management',
  'Executive'
];

const MEMBERSHIP_TIERS = [
  'Active Volunteer Scholar',
  'Youth Ambassador',
  'Senior Coordinator',
  'Distinguished Fellow',
  'Department Head',
  'Executive Member'
];

export const AppointmentLetterModal: React.FC<AppointmentLetterModalProps> = ({
  open,
  onClose,
  existingLetter,
  applicantSeed,
  onSaved
}) => {
  const { currentUser, settings, addToast } = useApp();
  const [signatories, setSignatories] = useState<SignatoryProfile[]>([]);
  const [loadingSignatories, setLoadingSignatories] = useState(false);

  const [appointeeName, setAppointeeName] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('Community Leadership & Outreach');
  const [chapter, setChapter] = useState('Sialkot');
  const [country, setCountry] = useState('Pakistan');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('Volunteer');
  const [membershipTier, setMembershipTier] = useState('Active Volunteer Scholar');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [tenure, setTenure] = useState('12 Months (Renewable)');
  const [renewalEligibility, setRenewalEligibility] = useState(
    'Eligible for renewal upon satisfactory performance review'
  );
  const [reportingAuthority, setReportingAuthority] = useState(
    'Director of Operations & Council Secretariat'
  );
  const [customNotes, setCustomNotes] = useState('');
  const [signatoryId, setSignatoryId] = useState('');

  const [savedLetter, setSavedLetter] = useState<AppointmentLetter | null>(null);
  const [previewMode, setPreviewMode] = useState<'html' | 'pdf'>('html');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingSignatories(true);
    authFetch('/api/admin/signatories?activeOnly=true&forIssuance=true')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setSignatories(list);
        if (!existingLetter?.signatoryId && list.length > 0) {
          const def = list.find((s: SignatoryProfile) => s.isDefault) || list[0];
          setSignatoryId(def.id);
        }
      })
      .catch(() => {
        if (active) setSignatories([]);
      })
      .finally(() => {
        if (active) setLoadingSignatories(false);
      });

    return () => {
      active = false;
    };
  }, [open, existingLetter?.signatoryId]);

  useEffect(() => {
    if (!open) return;
    setPreviewMode('html');
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }

    if (existingLetter) {
      setSavedLetter(existingLetter);
      setAppointeeName(existingLetter.appointeeName || '');
      setReferenceCode(existingLetter.referenceCode || '');
      setDesignation(existingLetter.designation || '');
      setDepartment(existingLetter.department || 'Council Operations');
      setChapter(existingLetter.chapter || 'Sialkot');
      setCountry(existingLetter.country || 'Pakistan');
      setAppointmentType(existingLetter.appointmentType || 'Volunteer');
      setMembershipTier(existingLetter.membershipTier || 'Active Volunteer Scholar');
      setEffectiveDate(existingLetter.effectiveDate || new Date().toISOString().split('T')[0]);
      setExpiryDate(existingLetter.expiryDate || '');
      setTenure(existingLetter.tenure || '12 Months (Renewable)');
      setRenewalEligibility(
        existingLetter.renewalEligibility || 'Eligible for renewal upon satisfactory performance review'
      );
      setReportingAuthority(
        existingLetter.reportingAuthority || 'Director of Operations & Council Secretariat'
      );
      setCustomNotes(existingLetter.customNotes || '');
      setSignatoryId(existingLetter.signatoryId || '');
    } else if (applicantSeed) {
      setSavedLetter(null);
      setAppointeeName(applicantSeed.fullName || '');
      setReferenceCode(applicantSeed.referenceCode || '');
      setDesignation(applicantSeed.preferredRole || 'Council Volunteer');
      setDepartment('Community Leadership & Outreach');
      setChapter(applicantSeed.city || 'Sialkot');
      setCountry('Pakistan');
      setAppointmentType('Volunteer');
      setMembershipTier(applicantSeed.membershipTier || 'Active Volunteer Scholar');
      setEffectiveDate(new Date().toISOString().split('T')[0]);
      setExpiryDate('');
      setTenure('12 Months (Renewable)');
      setRenewalEligibility('Eligible for renewal upon satisfactory performance review');
      setReportingAuthority('Director of Operations & Council Secretariat');
      setCustomNotes('');
    }
  }, [open, existingLetter, applicantSeed]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        try {
          URL.revokeObjectURL(pdfBlobUrl);
        } catch {}
      }
    };
  }, [pdfBlobUrl]);

  if (!open) return null;

  const activeSignatory =
    signatories.find(s => s.id === signatoryId) ||
    signatories.find(s => s.isDefault) ||
    signatories[0] ||
    null;

  const currentLetter = savedLetter || existingLetter || null;

  const previewData: AppointmentPreviewData = {
    id: currentLetter?.id,
    letterNumber: currentLetter?.letterNumber,
    referenceCode: referenceCode || currentLetter?.referenceCode || '',
    verificationToken: currentLetter?.verificationToken,
    appointeeName: appointeeName || applicantSeed?.fullName || '',
    appointeeEmail: currentLetter?.appointeeEmail || applicantSeed?.email,
    appointeePhone: currentLetter?.appointeePhone || applicantSeed?.phone,
    appointeePhotoUrl: currentLetter?.appointeePhotoUrl || applicantSeed?.photoUrl,
    country,
    designation,
    department,
    chapter,
    appointmentType,
    membershipTier,
    effectiveDate,
    expiryDate: expiryDate || undefined,
    tenure,
    renewalEligibility,
    reportingAuthority,
    customNotes,
    signatoryId: activeSignatory?.id || currentLetter?.signatoryId,
    signatoryName: activeSignatory?.name || currentLetter?.signatoryName || 'Executive Director',
    signatoryTitle:
      activeSignatory?.title || currentLetter?.signatoryTitle || 'Executive Director — Council Secretariat',
    issuedByName: currentLetter?.issuedByName || currentUser?.name || 'Authorized Administrator',
    issuedAt: currentLetter?.issuedAt,
    effectiveStatus: currentLetter?.effectiveStatus || 'ACTIVE'
  };

  const handleSaveOrIssue = async (): Promise<AppointmentLetter | null> => {
    if (!designation.trim() || !department.trim()) {
      addToast('Please enter both Designation and Department.', 'error');
      return null;
    }

    setSaving(true);
    try {
      const isEditing = Boolean(currentLetter?.id);
      const endpoint = isEditing
        ? `/api/admin/appointment-letters/${encodeURIComponent(currentLetter!.id)}`
        : '/api/admin/appointment-letters';

      const res = await authFetch(endpoint, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: applicantSeed?.applicationId,
          volunteerId: applicantSeed?.volunteerId,
          referenceCode: referenceCode.trim(),
          appointeeName: appointeeName.trim(),
          country: country.trim(),
          designation: designation.trim(),
          department: department.trim(),
          chapter: chapter.trim(),
          appointmentType,
          membershipTier,
          effectiveDate,
          expiryDate: expiryDate.trim() || undefined,
          tenure: tenure.trim(),
          renewalEligibility: renewalEligibility.trim(),
          reportingAuthority: reportingAuthority.trim(),
          customNotes: customNotes.trim(),
          signatoryId: activeSignatory?.id || signatoryId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not save appointment letter.');
      }

      setSavedLetter(data);
      addToast(
        isEditing
          ? `Appointment Letter ${data.letterNumber} updated successfully.`
          : `Official Appointment Letter ${data.letterNumber} issued!`,
        'success'
      );
      if (onSaved) onSaved(data);
      return data;
    } catch (err: any) {
      addToast(err.message || 'Failed to save appointment letter', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleLoadPdfPreview = async () => {
    let target = currentLetter;
    if (!target) {
      target = await handleSaveOrIssue();
      if (!target) return;
    }

    setDownloadingPdf(true);
    try {
      const res = await authFetch(`/api/appointment-letters/${encodeURIComponent(target.id)}/pdf?disposition=inline`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate A4 PDF');
      }
      const blob = await res.blob();
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      const nextUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(nextUrl);
      setPreviewMode('pdf');
    } catch (err: any) {
      addToast(err.message || 'Failed to render PDF preview', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    let target = currentLetter;
    if (!target) {
      target = await handleSaveOrIssue();
      if (!target) return;
    }

    setDownloadingPdf(true);
    try {
      const res = await authFetch(`/api/appointment-letters/${encodeURIComponent(target.id)}/pdf`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to download PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NexGen-Appointment-${target.letterNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      addToast(`Downloaded verified A4 PDF (${target.letterNumber}).`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Could not download PDF', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrintA4 = () => {
    window.print();
  };

  const handleSendNotificationEmail = async () => {
    let target = currentLetter;
    if (!target) {
      target = await handleSaveOrIssue();
      if (!target) return;
    }

    setSendingEmail(true);
    try {
      const res = await authFetch(
        `/api/admin/appointment-letters/${encodeURIComponent(target.id)}/notify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not send appointment email');
      }
      if (data.letter) {
        setSavedLetter(data.letter);
        if (onSaved) onSaved(data.letter);
      }
      addToast(
        `Official Appointment Letter email sent to ${target.appointeeEmail || 'appointee'}.`,
        'success'
      );
    } catch (err: any) {
      addToast(err.message || 'Email dispatch failed', 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:bg-white print:p-0 print:static print:overflow-visible">
      <div className="bg-white rounded-3xl w-full max-w-7xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:rounded-none">
        {/* Modal Top Toolbar (Hidden on Print) */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base leading-tight">
                {currentLetter
                  ? `Official Appointment Letter — ${currentLetter.letterNumber}`
                  : 'Create & Issue Official Appointment Letter'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Appointee: <span className="text-amber-300 font-semibold">{appointeeName}</span> ({referenceCode})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-800 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setPreviewMode('html')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
                  previewMode === 'html' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live A4 Preview</span>
              </button>
              <button
                type="button"
                onClick={handleLoadPdfPreview}
                disabled={downloadingPdf}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
                  previewMode === 'pdf' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingPdf ? 'Rendering...' : 'PDF Output View'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrintA4}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print A4</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Generating...' : 'Download A4 PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendNotificationEmail}
              disabled={sendingEmail || currentLetter?.effectiveStatus === 'REVOKED'}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingEmail ? 'Sending...' : 'Email Appointee'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              aria-label="Close appointment letter studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Two-Pane Studio: Form Controls Left + Live A4 Document Right */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 print:block print:overflow-visible">
          {/* Left Configuration Form (Hidden on Print) */}
          <div className="lg:col-span-4 border-r border-slate-200 bg-slate-50 p-5 overflow-y-auto space-y-4 text-xs print:hidden">
            {currentLetter && (
              <div
                className={`p-3 rounded-2xl border flex items-start gap-2.5 ${
                  currentLetter.effectiveStatus === 'REVOKED'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                {currentLetter.effectiveStatus === 'REVOKED' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold">
                    {currentLetter.letterNumber} — {currentLetter.effectiveStatus}
                  </div>
                  <div className="text-[11px] opacity-85">
                    Issued {new Date(currentLetter.issuedAt).toLocaleDateString()} by {currentLetter.issuedByName}
                    {currentLetter.lastEmailSentAt
                      ? ` · Emailed ${new Date(currentLetter.lastEmailSentAt).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1">Appointee Full Legal Name *</label>
              <input
                type="text"
                value={appointeeName}
                onChange={e => setAppointeeName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Designation *</label>
                <input
                  type="text"
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                  placeholder="e.g. Chapter Coordinator"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department / Division *</label>
                <input
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Women Empowerment"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Appointment Category</label>
                <select
                  value={appointmentType}
                  onChange={e => setAppointmentType(e.target.value as AppointmentType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  {APPOINTMENT_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Membership Tier</label>
                <select
                  value={membershipTier}
                  onChange={e => setMembershipTier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  {MEMBERSHIP_TIERS.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Chapter / City</label>
                <input
                  type="text"
                  value={chapter}
                  onChange={e => setChapter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Effective Date *</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={e => setEffectiveDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Appointment Duration</label>
                <input
                  type="text"
                  value={tenure}
                  onChange={e => setTenure(e.target.value)}
                  placeholder="12 Months (Renewable)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reporting Authority</label>
                <input
                  type="text"
                  value={reportingAuthority}
                  onChange={e => setReportingAuthority(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Renewal Eligibility</label>
              <input
                type="text"
                value={renewalEligibility}
                onChange={e => setRenewalEligibility(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Authorized Signatory *
              </label>
              <select
                value={signatoryId}
                onChange={e => setSignatoryId(e.target.value)}
                disabled={loadingSignatories}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
              >
                {signatories.length === 0 ? (
                  <option value="">No authorized signatory available for your role</option>
                ) : (
                  signatories.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.title} {s.hasSignatureImage ? '✓ PNG' : '(No PNG)'}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Special Terms / Notes (Optional)</label>
              <textarea
                rows={3}
                value={customNotes}
                onChange={e => setCustomNotes(e.target.value)}
                placeholder="Any specific chapter mandate, committee assignment, or reporting conditions..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
              />
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveOrIssue}
                disabled={saving || signatories.length === 0}
                className="w-full py-3 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>
                  {saving
                    ? 'Saving Official Record...'
                    : currentLetter
                    ? 'Save Updated Appointment Details'
                    : 'Issue Official Appointment Letter'}
                </span>
              </button>
              {applicantSeed?.email && (
                <p className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
                  <Mail className="w-3 h-3" />
                  <span>Recipient email on file: {applicantSeed.email}</span>
                </p>
              )}
            </div>
          </div>

          {/* Right Live A4 Preview / PDF Viewer Pane */}
          <div className="lg:col-span-8 bg-slate-200/80 p-4 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:overflow-visible">
            {previewMode === 'pdf' && pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title="Official Appointment Letter PDF Preview"
                className="w-full h-[82vh] rounded-xl border border-slate-300 bg-white shadow-lg"
              />
            ) : (
              <AppointmentLetterPreview
                data={previewData}
                signatory={activeSignatory}
                siteUrl={settings.siteUrl}
                isAdminPreview={true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
