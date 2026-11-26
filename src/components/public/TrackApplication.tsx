import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ArrowRight,
  Award,
  Sparkles,
  Lock,
  QrCode,
  Camera
} from 'lucide-react';
import { VolunteerIdCardModal, IssueOfficialCardPayload, IssueOfficialCardResult } from '../admin/VolunteerIdCardModal.tsx';
import { CardScannerModal } from './CardScannerModal.tsx';

export const TrackApplication: React.FC = () => {
  const { setActivePage } = useApp();
  const [refCode, setRefCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationData, setApplicationData] = useState<any | null>(null);
  const [showIdCard, setShowIdCard] = useState<boolean>(false);
  const [showScanner, setShowScanner] = useState<boolean>(false);

  useDocumentSEO({
    title: 'Track Application Status | NexGen Council',
    description: 'Check the real-time review status of your NexGen Council volunteer enrollment or fellowship application and download your Member ID card.',
    canonicalPath: '/track',
    ogType: 'website',
    ogImage: '/banner.png',
    ogImageAlt: 'NexGen Council Volunteer Application Tracker'
  });

  const lookupCode = useCallback(async (codeToLookup: string) => {
    const clean = codeToLookup.trim();
    if (!clean) return;

    setLoading(true);
    setError(null);
    setApplicationData(null);

    try {
      const res = await fetch(`/api/applications/verify/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Reference code not found.');
      }
      setApplicationData(data);
    } catch (err: any) {
      setError(err.message || 'Unable to locate application. Please check your reference code.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam.trim()) {
      const upper = codeParam.trim().toUpperCase();
      setRefCode(upper);
      lookupCode(upper);
    }
  }, [lookupCode]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookupCode(refCode);
  };

  const handleUploadSinglePhoto = async (
    photoDataUrl: string
  ): Promise<{ ok: boolean; photoUrl?: string; error?: string }> => {
    if (!applicationData?.referenceCode) {
      return { ok: false, error: 'Missing application reference code.' };
    }
    try {
      const res = await fetch(
        `/api/applications/verify/${encodeURIComponent(applicationData.referenceCode)}/upload-photo`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoDataUrl })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setApplicationData((prev: any) =>
            prev
              ? {
                  ...prev,
                  idCardPhotoLocked: true,
                  idCardIssued: Boolean(data.idCardIssued ?? prev.idCardIssued),
                  idCardPhotoUrl: data.photoUrl || prev.idCardPhotoUrl,
                  avatar: data.photoUrl || prev.avatar
                }
              : prev
          );
        }
        return { ok: false, error: data.error || 'Only one portrait image upload is permitted.' };
      }

      setApplicationData((prev: any) =>
        prev
          ? {
              ...prev,
              avatar: data.photoUrl || prev.avatar,
              idCardPhotoUrl: data.photoUrl || prev.idCardPhotoUrl,
              idCardPhotoLocked: true
            }
          : prev
      );

      return { ok: true, photoUrl: data.photoUrl };
    } catch {
      return { ok: false, error: 'Network error while saving portrait photograph.' };
    }
  };

  const handleIssueOfficialCard = async (
    payload: IssueOfficialCardPayload
  ): Promise<IssueOfficialCardResult> => {
    if (!applicationData?.referenceCode) {
      return { ok: false, error: 'Missing application reference code.' };
    }
    try {
      const res = await fetch(
        `/api/applications/verify/${encodeURIComponent(applicationData.referenceCode)}/issue-id-card`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setApplicationData((prev: any) =>
            prev
              ? {
                  ...prev,
                  idCardIssued: true,
                  idCardPhotoLocked: true,
                  idCardIssuedAt: data.issuedAt || prev.idCardIssuedAt,
                  idCardPhotoUrl: data.photoUrl || prev.idCardPhotoUrl,
                  avatar: data.photoUrl || prev.avatar
                }
              : prev
          );
        }
        return { ok: false, error: data.error || 'Unable to issue Official ID Card.' };
      }

      setApplicationData((prev: any) =>
        prev
          ? {
              ...prev,
              city: payload.city || prev.city,
              phone: payload.phone || prev.phone,
              avatar: data.photoUrl || prev.avatar,
              idCardPhotoUrl: data.photoUrl || prev.idCardPhotoUrl,
              idCardPhotoLocked: true,
              idCardIssued: true,
              idCardIssuedAt: data.issuedAt
            }
          : prev
      );

      return {
        ok: true,
        photoUrl: data.photoUrl,
        issuedAt: data.issuedAt
      };
    } catch {
      return { ok: false, error: 'Network error while saving your Official ID Card record.' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Application Approved
          </span>
        );
      case 'Under Review':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-700" /> In Committee Review
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5 text-rose-600" /> Application Declined
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-slate-600" /> Pending Initial Review
          </span>
        );
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="text-center space-y-3 mb-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-900 text-xs font-semibold uppercase tracking-wider border border-indigo-100">
          <Search className="w-3.5 h-3.5 text-indigo-700" /> Status Lookup
        </span>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight">
          Track Your Volunteer Application
        </h1>
        <p className="text-slate-600 max-w-lg mx-auto text-sm sm:text-base">
          Enter the unique reference code provided during your submission (e.g., <code className="bg-slate-100 px-2 py-0.5 rounded text-indigo-900 font-mono text-xs">NXG-2026-8812</code>).
        </p>
      </div>

      {/* QR Code Scanner & Verification Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-white">Scan ID Card QR Code or Verify PDF</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Use live camera scanner or upload card image / PDF for instant official council verification
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all shrink-0 whitespace-nowrap"
        >
          <Camera className="w-4 h-4" />
          <span>Open QR Scanner / Verifier</span>
        </button>
      </div>

      {/* Lookup Form */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={refCode}
                onChange={e => setRefCode(e.target.value.toUpperCase())}
                placeholder="Enter Reference Code (NXG-XXXX-XXXX)"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 text-sm font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !refCode.trim()}
              className="w-full sm:w-auto px-6 py-3.5 bg-indigo-900 hover:bg-indigo-800 text-white font-semibold text-sm rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Check Status'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>Example codes from directory:</span>
            <div className="flex gap-2 font-mono">
              <button
                type="button"
                onClick={() => setRefCode('NXG-2026-8812')}
                className="underline hover:text-indigo-900 cursor-pointer"
              >
                NXG-2026-8812
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setRefCode('NXG-2026-7241')}
                className="underline hover:text-indigo-900 cursor-pointer"
              >
                NXG-2026-7241
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Application Not Found</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {applicationData && (
          <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/70 space-y-6 animate-in fade-in zoom-in-95">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs text-slate-600 uppercase tracking-wider font-mono">
                  {applicationData.referenceCode}
                </span>
                <h3 className="text-xl font-serif font-bold text-slate-900">
                  {applicationData.fullName}
                </h3>
                <p className="text-xs text-slate-600">
                  Location: <strong>{applicationData.city}</strong>
                </p>
              </div>
              <div>{getStatusBadge(applicationData.status)}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-600 block mb-1">Target Volunteer Track</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {applicationData.preferredRole || 'General Council Volunteer'}
                </span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-600 block mb-1">Submission Date</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {new Date(applicationData.submittedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            </div>

            {/* Status Information Box */}
            <div className="p-4 rounded-xl bg-indigo-900/5 border border-indigo-900/10 text-xs text-slate-700 space-y-1.5">
              <p className="font-semibold text-indigo-950">Status Clarification</p>
              {applicationData.status === 'Approved' && (
                <div className="space-y-3 pt-1">
                  <p className="text-emerald-800 font-medium">
                    Congratulations! Your volunteer enrollment has been officially approved and endorsed by the Council Secretariat.
                  </p>
                  {applicationData.idCardIssued ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white border-2 border-emerald-500 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                          {(applicationData.idCardPhotoUrl || applicationData.avatar) ? (
                            <img
                              src={applicationData.idCardPhotoUrl || applicationData.avatar}
                              alt={applicationData.fullName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-sm text-slate-900 flex items-center gap-1.5">
                            <span>Official Digital Member ID Card Issued</span>
                            <Lock className="w-3.5 h-3.5 text-emerald-700" />
                          </h4>
                          <p className="text-[11px] text-slate-600">
                            Recorded on{' '}
                            {applicationData.idCardIssuedAt
                              ? new Date(applicationData.idCardIssuedAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : 'file'}{' '}
                            · One-time public issuance already completed
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowIdCard(true)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-emerald-300 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0"
                      >
                        <Award className="w-3.5 h-3.5 text-emerald-700" />
                        <span>View Issued Record</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-400/10 to-amber-500/15 border border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {applicationData.idCardPhotoLocked && (applicationData.idCardPhotoUrl || applicationData.avatar) ? (
                          <div className="w-11 h-11 rounded-full bg-white border-2 border-amber-500 overflow-hidden shrink-0 shadow-sm">
                            <img
                              src={applicationData.idCardPhotoUrl || applicationData.avatar}
                              alt={applicationData.fullName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                            <Award className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-serif font-bold text-sm text-slate-900">Official Digital Member ID Card</h4>
                          <p className="text-[11px] text-slate-600">
                            {applicationData.idCardPhotoLocked
                              ? 'Single portrait photo uploaded & locked — ready to download Official ID Card once'
                              : 'Upload your single portrait photo once to issue and save your verified ID card (one-time download)'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowIdCard(true)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          {applicationData.idCardPhotoLocked
                            ? 'Continue & Claim ID Card'
                            : 'Upload Photo & Claim ID Card'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {applicationData.status === 'Under Review' && (
                <p>Your application is currently being evaluated by our regional committee. Expect an update within 48 hours.</p>
              )}
              {applicationData.status === 'Pending' && (
                <p>Your application has been received into our incoming intake queue and will be processed shortly.</p>
              )}
              {applicationData.status === 'Rejected' && (
                <p>Unfortunately, our capacity for this cohort is filled. We encourage you to reapply in the upcoming quarterly session.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {showIdCard && applicationData && (
        <VolunteerIdCardModal
          volunteer={{
            id: applicationData.id || `app_${applicationData.referenceCode}`,
            fullName: applicationData.fullName,
            email: applicationData.email,
            phone: applicationData.phone,
            city: applicationData.city,
            assignedRole: applicationData.assignedRole || applicationData.preferredRole || 'Council Volunteer Scholar',
            assignedProgram: applicationData.assignedProgram,
            referenceCode: applicationData.referenceCode,
            joinedDate: applicationData.submittedAt || new Date().toISOString(),
            status: applicationData.volunteerStatus || 'Active',
            membershipTier: applicationData.membershipTier || 'Active Volunteer Scholar',
            avatar: applicationData.idCardPhotoUrl || applicationData.avatar,
            hoursContributed: applicationData.hoursContributed || 0
          }}
          oneTimeIssuance={true}
          isAlreadyIssued={Boolean(applicationData.idCardIssued)}
          isPhotoLocked={Boolean(applicationData.idCardPhotoLocked)}
          issuedAt={applicationData.idCardIssuedAt}
          onUploadSinglePhoto={handleUploadSinglePhoto}
          onIssueOfficialCard={handleIssueOfficialCard}
          onClose={() => setShowIdCard(false)}
        />
      )}

      {showScanner && (
        <CardScannerModal
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Step 1 • Locate Code</span>
          <h2 className="text-sm font-serif font-bold text-slate-900">Find Your Reference ID</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Every volunteer application generates a unique tracking ID (such as NXG-2026-XXXX) displayed at submission and sent to your registered email.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Step 2 • Live Review</span>
          <h2 className="text-sm font-serif font-bold text-slate-900">Committee Evaluation</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Applications move from Pending Initial Review to Under Review while regional coordinators match your track preferences and availability.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Step 3 • Member Card</span>
          <h2 className="text-sm font-serif font-bold text-slate-900">Download Official ID Card</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Once your status shows Approved, download your official NexGen Council Digital Member ID Card with QR verification directly from this portal.
          </p>
        </div>
      </div>

      <div className="text-center mt-8">
        <button
          onClick={() => setActivePage('volunteer')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-950 hover:text-indigo-800 cursor-pointer"
        >
          <span>Submit a new application</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
