import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { authFetch } from '../../lib/api.ts';
import { buildAppointmentLetterContent } from '../../lib/appointmentContent.ts';
import {
  AppointmentType,
  EffectiveAppointmentStatus,
  SignatoryProfile
} from '../../types.ts';

export interface AppointmentPreviewData {
  id?: string;
  letterNumber?: string;
  referenceCode: string;
  verificationToken?: string;
  appointeeName: string;
  appointeeEmail?: string;
  appointeePhone?: string;
  appointeePhotoUrl?: string;
  country?: string;
  designation: string;
  department: string;
  chapter: string;
  appointmentType: AppointmentType;
  membershipTier: string;
  effectiveDate: string;
  expiryDate?: string;
  tenure: string;
  renewalEligibility: string;
  reportingAuthority: string;
  customNotes?: string;
  signatoryId?: string;
  signatoryName: string;
  signatoryTitle: string;
  issuedByName?: string;
  issuedAt?: string;
  effectiveStatus?: EffectiveAppointmentStatus;
}

interface AppointmentLetterPreviewProps {
  data: AppointmentPreviewData;
  signatory?: SignatoryProfile | null;
  siteUrl?: string;
  isAdminPreview?: boolean;
}

function formatReadableDate(raw?: string): string {
  if (!raw || !raw.trim()) return 'Open-Ended / Renewable';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export const AppointmentLetterPreview: React.FC<AppointmentLetterPreviewProps> = ({
  data,
  signatory,
  siteUrl = 'https://nexgencouncil.bond',
  isAdminPreview = true
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [sigAssetUrl, setSigAssetUrl] = useState<string | null>(null);
  const [stampAssetUrl, setStampAssetUrl] = useState<string | null>(null);

  const cleanBaseUrl = (siteUrl || 'https://nexgencouncil.bond').trim().replace(/\/+$/, '');
  const resolvedVerifyBase = /localhost|127\.0\.0\.1/i.test(cleanBaseUrl)
    ? 'https://nexgencouncil.bond'
    : cleanBaseUrl;

  const verifyDestination = data.verificationToken
    ? `${resolvedVerifyBase}/track?code=${encodeURIComponent(
        data.referenceCode || 'PENDING'
      )}&token=${encodeURIComponent(data.verificationToken)}`
    : `${resolvedVerifyBase}/track?code=${encodeURIComponent(data.referenceCode || 'PENDING')}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(verifyDestination, {
      width: 180,
      margin: 1,
      color: { dark: '#0F2346', light: '#FFFFFF' },
      errorCorrectionLevel: 'M'
    })
      .then(url => {
        if (active) setQrUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [verifyDestination]);

  useEffect(() => {
    if (!isAdminPreview || !signatory?.id) {
      setSigAssetUrl(null);
      setStampAssetUrl(null);
      return;
    }

    let cancelled = false;
    const urlsToRevoke: string[] = [];

    const loadAsset = async (
      kind: 'signature' | 'stamp',
      exists: boolean | undefined,
      setter: (v: string | null) => void
    ) => {
      if (!exists) {
        setter(null);
        return;
      }
      try {
        const res = await authFetch(`/api/admin/signatories/${encodeURIComponent(signatory.id)}/asset/${kind}`);
        if (!res.ok) {
          if (!cancelled) setter(null);
          return;
        }
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        urlsToRevoke.push(objUrl);
        if (!cancelled) setter(objUrl);
      } catch {
        if (!cancelled) setter(null);
      }
    };

    loadAsset('signature', signatory.hasSignatureImage, setSigAssetUrl);
    loadAsset('stamp', signatory.hasStampImage, setStampAssetUrl);

    return () => {
      cancelled = true;
      for (const u of urlsToRevoke) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
    };
  }, [isAdminPreview, signatory?.id, signatory?.hasSignatureImage, signatory?.hasStampImage, signatory?.updatedAt]);

  const content = buildAppointmentLetterContent(data);
  const status = data.effectiveStatus || 'ACTIVE';
  const letterNumber = data.letterNumber || 'NXG-APT-DRAFT';

  return (
    <div className="bg-white text-slate-900 w-full max-w-[794px] mx-auto shadow-xl border border-slate-300 relative overflow-hidden print:shadow-none print:border-0">
      {/* Outer Navy & Inner Gold Institutional Frame */}
      <div className="m-2.5 sm:m-3.5 border-[2.5px] border-[#0F2346] p-1">
        <div className="border border-[#C4942D] p-5 sm:p-8 relative bg-white min-h-[1040px] flex flex-col justify-between">
          {/* Subtle Watermark Logo */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center opacity-[0.045]"
          >
            <img src="/logo.png" alt="" className="w-80 h-80 object-contain" />
          </div>

          <div className="relative z-10 space-y-5">
            {/* Institutional Letterhead */}
            <header className="flex flex-col sm:flex-row items-start justify-between gap-4 pb-4 border-b-2 border-[#0F2346]">
              <div className="flex items-center gap-3.5">
                <img
                  src="/logo.png"
                  alt="NexGen Council Official Logo"
                  className="w-14 h-14 object-contain shrink-0"
                />
                <div>
                  <h2 className="font-serif font-extrabold text-sm sm:text-base tracking-tight text-[#0F2346] leading-tight">
                    NEXGEN WOMEN EMPOWERMENT &amp;
                    <br />
                    YOUTH LEADERSHIP COUNCIL
                  </h2>
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[#1E3A8A] uppercase mt-1">
                    COUNCIL SECRETARIAT — SIALKOT, PAKISTAN
                  </p>
                  <p className="text-[10px] font-bold italic tracking-[0.08em] text-[#C4942D] uppercase mt-0.5">
                    SHAPING TODAY, LEADING TOMORROW
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0 space-y-1">
                <div className="inline-block bg-[#0F2346] text-white text-[9.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm">
                  Official Appointment Record
                </div>
                <div className="text-[11px] font-mono font-bold text-[#0F2346] pt-0.5">
                  {letterNumber}
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  Ref: {data.referenceCode || '—'}
                </div>
                <div className="text-[10px] font-bold">
                  Status:{' '}
                  <span
                    className={
                      status === 'REVOKED'
                        ? 'text-rose-700'
                        : status === 'EXPIRED'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }
                  >
                    {status}
                  </span>
                </div>
              </div>
            </header>

            {/* Centered Document Title */}
            <div className="text-center space-y-1.5">
              <h1 className="font-serif font-bold text-xl sm:text-2xl tracking-[0.12em] text-[#0F2346] uppercase">
                Letter of Appointment
              </h1>
              <div className="w-28 h-[2px] bg-[#C4942D] mx-auto" />
            </div>

            {/* Structured Identification & Appointee Metadata Box */}
            <div className="bg-slate-50/90 border border-slate-300 rounded-md p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 text-[11px]">
              <div className="sm:col-span-5 space-y-1.5 sm:border-r sm:border-slate-200 sm:pr-3">
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Appointee:</span>
                  <span className="col-span-3 font-bold text-slate-900">{data.appointeeName || '—'}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Designation:</span>
                  <span className="col-span-3 font-bold text-[#0F2346]">{data.designation || '—'}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Department:</span>
                  <span className="col-span-3 font-semibold text-slate-800">{data.department || '—'}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Chapter:</span>
                  <span className="col-span-3 text-slate-800">
                    {data.chapter || 'Sialkot'}, {data.country || 'Pakistan'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Email:</span>
                  <span className="col-span-3 text-slate-700 truncate">{data.appointeeEmail || 'On File'}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Contact:</span>
                  <span className="col-span-3 text-slate-700">{data.appointeePhone || 'On File'}</span>
                </div>
              </div>

              <div className={`${data.appointeePhotoUrl ? 'sm:col-span-5' : 'sm:col-span-7'} space-y-1.5`}>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Issue Date:</span>
                  <span className="col-span-3 font-semibold text-slate-900">
                    {formatReadableDate(data.issuedAt || new Date().toISOString())}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Effective:</span>
                  <span className="col-span-3 font-semibold text-slate-900">
                    {formatReadableDate(data.effectiveDate)}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Validity:</span>
                  <span className="col-span-3 text-slate-800">
                    {data.expiryDate ? formatReadableDate(data.expiryDate) : 'Renewable Standing'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Category:</span>
                  <span className="col-span-3 font-semibold text-slate-800">{data.appointmentType}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Tier:</span>
                  <span className="col-span-3 text-slate-800">{data.membershipTier}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">Reports To:</span>
                  <span className="col-span-3 text-slate-800">{data.reportingAuthority}</span>
                </div>
              </div>

              {data.appointeePhotoUrl && (
                <div className="sm:col-span-2 flex justify-end items-start">
                  <img
                    src={data.appointeePhotoUrl}
                    alt={data.appointeeName}
                    className="w-20 h-24 object-cover border-2 border-[#C4942D] bg-white shadow-xs"
                  />
                </div>
              )}
            </div>

            {/* Formal Appointment Body */}
            <div className="space-y-3.5 text-[12px] leading-relaxed text-slate-800 font-serif">
              <p className="font-bold text-[#0F2346] text-[13px]">
                Dear {data.appointeeName || 'Appointee'},
              </p>

              <section className="space-y-1">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
                  1. Official Appointment Declaration
                </h3>
                <p>{content.declaration}</p>
              </section>

              <section className="space-y-1">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
                  2. Responsibilities &amp; Duties
                </h3>
                <p>{content.responsibilitiesIntro}</p>
                <ul className="list-disc pl-5 space-y-1 text-[11.5px]">
                  {content.responsibilitiesList.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-1">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
                  3. Code of Conduct
                </h3>
                <p>{content.codeOfConduct}</p>
              </section>

              <section className="space-y-1">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
                  4. Confidentiality &amp; Organizational Policies
                </h3>
                <p>{content.confidentiality}</p>
              </section>

              <section className="space-y-1">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
                  5. Appointment Terms &amp; Tenure
                </h3>
                <p>{content.terms}</p>
              </section>

              <section className="space-y-1">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
                  6. Organizational Recognition
                </h3>
                <p>{content.recognition}</p>
              </section>
            </div>
          </div>

          {/* Atomic Executive Signatory + Circular Stamp + QR Footer */}
          <div className="relative z-10 mt-6 pt-4 border-t border-[#0F2346] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              {/* Left: Authorized Signatory */}
              <div className="sm:col-span-5 space-y-1.5">
                <div className="h-14 flex items-end">
                  {sigAssetUrl ? (
                    <img
                      src={sigAssetUrl}
                      alt={`${data.signatoryName} signature`}
                      className="max-h-14 max-w-[180px] object-contain"
                    />
                  ) : (
                    <div className="px-3 py-1.5 border border-dashed border-slate-300 rounded text-[9.5px] text-slate-400 italic">
                      Authorized Digital Signatory (Upload PNG in Admin)
                    </div>
                  )}
                </div>
                <div className="border-t border-[#0F2346] pt-1.5 max-w-[220px]">
                  <p className="font-serif font-bold text-xs text-[#0F2346] leading-tight">
                    {data.signatoryName || 'Executive Director'}
                  </p>
                  <p className="text-[10px] font-semibold text-[#1E3A8A]">
                    {data.signatoryTitle || 'Executive Director — Council Secretariat'}
                  </p>
                  <p className="text-[9.5px] text-slate-500">
                    NexGen Council — Authorized Signatory
                  </p>
                </div>
              </div>

              {/* Center: Official Circular Stamp */}
              <div className="sm:col-span-3 flex flex-col items-center justify-end">
                {stampAssetUrl ? (
                  <img
                    src={stampAssetUrl}
                    alt="Official NexGen Council Stamp"
                    className="w-24 h-24 object-contain"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full border-2 border-[#0F2346] p-1 flex items-center justify-center">
                    <div className="w-full h-full rounded-full border border-[#C4942D] flex flex-col items-center justify-center text-center px-1">
                      <span className="text-[8px] font-extrabold tracking-wider text-[#0F2346] leading-tight">
                        NEXGEN COUNCIL
                      </span>
                      <span className="text-[6.5px] font-bold text-[#1E3A8A] leading-tight mt-0.5">
                        COUNCIL SECRETARIAT
                      </span>
                      <span className="text-[6.5px] font-bold text-[#C4942D] leading-tight mt-0.5">
                        SIALKOT, PAKISTAN
                      </span>
                    </div>
                  </div>
                )}
                <span className="text-[8.5px] font-bold tracking-wider uppercase text-slate-500 mt-1">
                  Official Document Seal
                </span>
              </div>

              {/* Right: Live QR Verification Block */}
              <div className="sm:col-span-4 bg-slate-50 border border-slate-300 rounded p-2.5 flex items-center gap-2.5">
                {qrUrl ? (
                  <img src={qrUrl} alt="Appointment Verification QR" className="w-16 h-16 shrink-0 border border-slate-200 bg-white" />
                ) : (
                  <div className="w-16 h-16 shrink-0 bg-slate-200 animate-pulse" />
                )}
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[9px] font-extrabold text-[#0F2346] tracking-wider uppercase">
                    Scan to Verify
                  </p>
                  <p className="text-[8.5px] text-slate-600 leading-tight">
                    Verify authenticity on nexgencouncil.bond/track
                  </p>
                  <p className="text-[8.5px] font-mono font-bold text-[#1E3A8A] truncate">
                    {letterNumber}
                  </p>
                </div>
              </div>
            </div>

            {/* Institutional Bottom Footer */}
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500">
              <span className="font-bold text-[#0F2346]">
                NEXGEN COUNCIL SECRETARIAT — SIALKOT, PAKISTAN
              </span>
              <span>
                Ref: {letterNumber} · Issued by {data.issuedByName || 'Authorized Admin'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
