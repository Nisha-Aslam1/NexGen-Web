import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** A4 @ 96dpi. The letter is ALWAYS exactly one page of this size. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
const MIN_FIT_SCALE = 0.72;

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

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-[#1E3A8A] border-b border-[#C4942D]/50 pb-0.5 inline-block">
    {children}
  </h3>
);

const MetaRow: React.FC<{ label: string; children: React.ReactNode; strong?: boolean }> = ({
  label,
  children,
  strong
}) => (
  <div className="grid grid-cols-5 gap-1">
    <span className="col-span-2 text-slate-500 font-bold uppercase text-[9.5px]">{label}</span>
    <span className={`col-span-3 ${strong ? 'font-bold text-slate-900' : 'text-slate-800'} break-words`}>
      {children}
    </span>
  </div>
);

export const AppointmentLetterPreview: React.FC<AppointmentLetterPreviewProps> = ({
  data,
  signatory,
  siteUrl = 'https://nexgencouncil.bond',
  isAdminPreview = true
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [sigAssetUrl, setSigAssetUrl] = useState<string | null>(null);
  const [stampAssetUrl, setStampAssetUrl] = useState<string | null>(null);

  const bodyBoxRef = useRef<HTMLDivElement | null>(null);
  const bodyContentRef = useRef<HTMLDivElement | null>(null);

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

  // Signature + seal: ONLY the files uploaded for the selected signatory.
  useEffect(() => {
    if (!isAdminPreview || !signatory?.id) {
      setSigAssetUrl(null);
      setStampAssetUrl(null);
      return;
    }

    let cancelled = false;
    const urlsToRevoke: string[] = [];
    const version = encodeURIComponent(signatory.updatedAt || '');

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
        const res = await authFetch(
          `/api/admin/signatories/${encodeURIComponent(signatory.id)}/asset/${kind}?v=${version}`
        );
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
        } catch {
          /* ignore */
        }
      }
    };
  }, [isAdminPreview, signatory?.id, signatory?.hasSignatureImage, signatory?.hasStampImage, signatory?.updatedAt]);

  const content = buildAppointmentLetterContent(data);
  const status = data.effectiveStatus || 'ACTIVE';
  const letterNumber = data.letterNumber || 'NXG-APT-DRAFT';

  /**
   * Single-page guarantee: the letter body is shrunk (down to MIN_FIT_SCALE)
   * until it fits the space between the meta box and the signature block.
   * Runs after every render so edits in the form keep the page fitted.
   */
  useLayoutEffect(() => {
    const box = bodyBoxRef.current;
    const el = bodyContentRef.current;
    if (!box || !el) return;

    const available = box.clientHeight;
    let chosen = MIN_FIT_SCALE;
    for (let k = 1; k >= MIN_FIT_SCALE - 0.0001; k -= 0.02) {
      el.style.width = `${100 / k}%`;
      el.style.transform = `scale(${k})`;
      if (el.offsetHeight * k <= available) {
        chosen = k;
        break;
      }
      chosen = k;
    }
    el.style.width = `${100 / chosen}%`;
    el.style.transform = `scale(${chosen})`;
  });

  return (
    <div
      className="bg-white text-slate-900 relative overflow-hidden"
      style={{ width: A4_WIDTH_PX, height: A4_HEIGHT_PX }}
    >
      {/* Outer Navy & Inner Gold Institutional Frame */}
      <div className="absolute inset-[10px] border-[2.5px] border-[#0F2346] p-[3px]">
        <div className="border border-[#C4942D] h-full relative bg-white px-7 py-6 flex flex-col">
          {/* Subtle Watermark Logo */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center opacity-[0.045]"
          >
            <img src="/logo.png" alt="" className="w-80 h-80 object-contain" />
          </div>

          {/* ---------- TOP (fixed height) ---------- */}
          <div className="relative z-10 shrink-0 space-y-4">
            <header className="flex items-start justify-between gap-4 pb-3 border-b-2 border-[#0F2346]">
              <div className="flex items-center gap-3.5">
                <img
                  src="/logo.png"
                  alt="NexGen Council Official Logo"
                  className="w-14 h-14 object-contain shrink-0"
                />
                <div>
                  <h2 className="font-serif font-extrabold text-base tracking-tight text-[#0F2346] leading-tight">
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

              <div className="text-right shrink-0 space-y-1">
                <div className="inline-block bg-[#0F2346] text-white text-[9.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm">
                  Official Appointment Record
                </div>
                <div className="text-[11px] font-mono font-bold text-[#0F2346] pt-0.5">{letterNumber}</div>
                <div className="text-[10px] font-mono text-slate-600">Ref: {data.referenceCode || '—'}</div>
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

            <div className="text-center space-y-1.5">
              <h1 className="font-serif font-bold text-2xl tracking-[0.12em] text-[#0F2346] uppercase">
                Letter of Appointment
              </h1>
              <div className="w-28 h-[2px] bg-[#C4942D] mx-auto" />
            </div>

            <div className="bg-slate-50/90 border border-slate-300 rounded-md p-3.5 grid grid-cols-12 gap-3 text-[11px]">
              <div className="col-span-5 space-y-1.5 border-r border-slate-200 pr-3">
                <MetaRow label="Appointee:" strong>
                  {data.appointeeName || '—'}
                </MetaRow>
                <MetaRow label="Designation:">
                  <span className="font-bold text-[#0F2346]">{data.designation || '—'}</span>
                </MetaRow>
                <MetaRow label="Department:">{data.department || '—'}</MetaRow>
                <MetaRow label="Chapter:">
                  {data.chapter || 'Sialkot'}, {data.country || 'Pakistan'}
                </MetaRow>
                <MetaRow label="Email:">{data.appointeeEmail || 'On File'}</MetaRow>
                <MetaRow label="Contact:">{data.appointeePhone || 'On File'}</MetaRow>
              </div>

              <div className={`${data.appointeePhotoUrl ? 'col-span-5' : 'col-span-7'} space-y-1.5`}>
                <MetaRow label="Issue Date:">
                  {formatReadableDate(data.issuedAt || new Date().toISOString())}
                </MetaRow>
                <MetaRow label="Effective:">{formatReadableDate(data.effectiveDate)}</MetaRow>
                <MetaRow label="Validity:">
                  {data.expiryDate ? formatReadableDate(data.expiryDate) : 'Renewable Standing'}
                </MetaRow>
                <MetaRow label="Category:">{data.appointmentType}</MetaRow>
                <MetaRow label="Tier:">{data.membershipTier}</MetaRow>
                <MetaRow label="Reports To:">{data.reportingAuthority}</MetaRow>
              </div>

              {data.appointeePhotoUrl && (
                <div className="col-span-2 flex justify-end items-start">
                  <img
                    src={data.appointeePhotoUrl}
                    alt={data.appointeeName}
                    className="w-20 h-24 object-cover border-2 border-[#C4942D] bg-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ---------- BODY (takes all remaining space, auto-fitted) ---------- */}
          <div ref={bodyBoxRef} className="relative z-10 flex-1 min-h-0 overflow-hidden mt-4">
            <div
              ref={bodyContentRef}
              className="space-y-3 text-[12px] leading-relaxed text-slate-800 font-serif"
              style={{ transformOrigin: 'top left', width: '100%' }}
            >
              <p className="font-bold text-[#0F2346] text-[13px]">Dear {data.appointeeName || 'Appointee'},</p>

              <section className="space-y-1">
                <SectionTitle>1. Official Appointment Declaration</SectionTitle>
                <p>{content.declaration}</p>
              </section>

              <section className="space-y-1">
                <SectionTitle>2. Responsibilities &amp; Duties</SectionTitle>
                <p>{content.responsibilitiesIntro}</p>
                <ul className="list-disc pl-5 space-y-0.5 text-[11.5px]">
                  {content.responsibilitiesList.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="space-y-1">
                <SectionTitle>3. Code of Conduct</SectionTitle>
                <p>{content.codeOfConduct}</p>
              </section>

              <section className="space-y-1">
                <SectionTitle>4. Confidentiality &amp; Organizational Policies</SectionTitle>
                <p>{content.confidentiality}</p>
              </section>

              <section className="space-y-1">
                <SectionTitle>5. Appointment Terms &amp; Tenure</SectionTitle>
                <p>{content.terms}</p>
              </section>

              <section className="space-y-1">
                <SectionTitle>6. Organizational Recognition</SectionTitle>
                <p>{content.recognition}</p>
              </section>
            </div>
          </div>

          {/* ---------- BOTTOM: signature, seal, QR, footer (fixed height) ---------- */}
          <div className="relative z-10 shrink-0 mt-3 pt-3 border-t border-[#0F2346] space-y-3">
            <div className="grid grid-cols-12 gap-4 items-end">
              {/* Signature + seal (seal overlaps the signature area like a real stamped letter) */}
              <div className="col-span-8 relative h-[112px]">
                {/* Seal: only if uploaded */}
                {stampAssetUrl && (
                  <img
                    src={stampAssetUrl}
                    alt="Official Council Seal"
                    className="absolute left-[190px] bottom-1 w-[96px] h-[96px] object-contain -rotate-6"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}

                {/* Signature: only if uploaded */}
                <div className="absolute left-0 bottom-[44px] h-14 flex items-end">
                  {sigAssetUrl ? (
                    <img
                      src={sigAssetUrl}
                      alt={`${data.signatoryName} signature`}
                      className="max-h-14 max-w-[190px] object-contain"
                    />
                  ) : isAdminPreview && !signatory?.hasSignatureImage ? (
                    <div className="px-3 py-1.5 border border-dashed border-slate-300 rounded text-[9.5px] text-slate-400 italic">
                      No signature uploaded for this signatory
                    </div>
                  ) : null}
                </div>

                <div className="absolute left-0 bottom-0 border-t border-[#0F2346] pt-1.5 w-[230px]">
                  <p className="font-serif font-bold text-xs text-[#0F2346] leading-tight">
                    {data.signatoryName || 'Executive Director'}
                  </p>
                  <p className="text-[10px] font-semibold text-[#1E3A8A] leading-tight">
                    {data.signatoryTitle || 'Executive Director — Council Secretariat'}
                  </p>
                  <p className="text-[9.5px] text-slate-500">NexGen Council — Authorized Signatory</p>
                </div>
              </div>

              {/* QR verification */}
              <div className="col-span-4 bg-slate-50 border border-slate-300 rounded p-2.5 flex items-center gap-2.5">
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="Appointment Verification QR"
                    className="w-16 h-16 shrink-0 border border-slate-200 bg-white"
                  />
                ) : (
                  <div className="w-16 h-16 shrink-0 bg-slate-200 animate-pulse" />
                )}
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[9px] font-extrabold text-[#0F2346] tracking-wider uppercase">Scan to Verify</p>
                  <p className="text-[8.5px] text-slate-600 leading-tight">
                    Verify authenticity on nexgencouncil.bond/track
                  </p>
                  <p className="text-[8.5px] font-mono font-bold text-[#1E3A8A] truncate">{letterNumber}</p>
                </div>
              </div>
            </div>

            <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-2 text-[9px] text-slate-500">
              <span className="font-bold text-[#0F2346]">NEXGEN COUNCIL SECRETARIAT — SIALKOT, PAKISTAN</span>
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
