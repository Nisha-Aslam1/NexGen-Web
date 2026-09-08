import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  AlertCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export const TrackApplication: React.FC = () => {
  const { setActivePage } = useApp();
  const [refCode, setRefCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationData, setApplicationData] = useState<any | null>(null);

  useDocumentSEO({
    title: 'Track Application Status | NexGen Council',
    description: 'Verify your volunteer enrollment application status using your official reference registration code.',
    canonicalPath: '/track',
    ogType: 'website',
    ogImage: '/banner.png',
    noindex: true
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = refCode.trim();
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
                <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
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
                <span className="text-slate-400 block mb-1">Target Volunteer Track</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {applicationData.preferredRole || 'General Council Volunteer'}
                </span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-400 block mb-1">Submission Date</span>
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
                <p>Congratulations! Your volunteer profile has been endorsed. Check your email for orientation links and badge details.</p>
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
