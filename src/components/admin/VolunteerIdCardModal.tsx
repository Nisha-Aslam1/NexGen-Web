import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Award,
  ShieldCheck,
  QrCode,
  Calendar,
  MapPin,
  CheckCircle2,
  Share2,
  Printer,
  Sparkles,
  RotateCw,
  Phone,
  Mail,
  Globe,
  Lock
} from 'lucide-react';
import { Volunteer } from '../../types.ts';

export interface MemberIdCardData {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  city?: string;
  assignedRole: string;
  membershipTier?: string;
  joinedDate?: string;
  status?: string;
  avatar?: string;
  hoursContributed?: number;
  referenceCode?: string;
}

interface VolunteerIdCardModalProps {
  volunteer: Volunteer | MemberIdCardData;
  onClose: () => void;
}

export const VolunteerIdCardModal: React.FC<VolunteerIdCardModalProps> = ({ volunteer, onClose }) => {
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const idCode =
    (volunteer as any).referenceCode ||
    (volunteer.id?.startsWith('vol_')
      ? `NG-VOL-${volunteer.id.slice(-6).toUpperCase()}`
      : `NG-MEM-${(volunteer.id || '2026').slice(-6).toUpperCase()}`);

  const joinDateObj = volunteer.joinedDate ? new Date(volunteer.joinedDate) : new Date();
  const validFromStr = joinDateObj.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  });
  const expiryYear = joinDateObj.getFullYear() + 2;
  const validThruStr = `Dec ${expiryYear}`;

  const tier =
    volunteer.membershipTier ||
    ((volunteer.assignedRole || '').toLowerCase().includes('director') ||
    (volunteer.assignedRole || '').toLowerCase().includes('lead') ||
    (volunteer.assignedRole || '').toLowerCase().includes('admin')
      ? 'Executive Council Member'
      : (volunteer.hoursContributed || 0) >= 50
      ? 'Distinguished Fellow'
      : 'Active Volunteer Scholar');

  const verificationUrl = `https://nexgencouncil.bond/track?code=${encodeURIComponent(idCode)}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPng = async () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = 2; // High-res retina
      const width = 400 * scale;
      const height = 620 * scale;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Card Background Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#020617'); // slate-950
      bgGrad.addColorStop(0.5, '#0f172a'); // slate-900
      bgGrad.addColorStop(1, '#1e1b4b'); // indigo-950
      ctx.fillStyle = bgGrad;
      ctx.roundRect(0, 0, width, height, 36 * scale);
      ctx.fill();

      // Outer Gold Border
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3 * scale;
      ctx.roundRect(4 * scale, 4 * scale, width - 8 * scale, height - 8 * scale, 34 * scale);
      ctx.stroke();

      // Top Gold Ribbon
      const ribbonGrad = ctx.createLinearGradient(0, 0, width, 0);
      ribbonGrad.addColorStop(0, '#f59e0b');
      ribbonGrad.addColorStop(0.5, '#fef08a');
      ribbonGrad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = ribbonGrad;
      ctx.fillRect(0, 0, width, 12 * scale);

      // Header Texts
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${16 * scale}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('NEXGEN COUNCIL', width / 2, 45 * scale);

      ctx.fillStyle = '#f59e0b';
      ctx.font = `600 ${9 * scale}px sans-serif`;
      ctx.letterSpacing = '1px';
      ctx.fillText('WOMEN EMPOWERMENT & YOUTH LEADERSHIP', width / 2, 60 * scale);

      // Tier Badge Pill
      ctx.fillStyle = '#312e81';
      ctx.roundRect((width - 240 * scale) / 2, 74 * scale, 240 * scale, 24 * scale, 12 * scale);
      ctx.fill();
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1 * scale;
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.font = `bold ${10 * scale}px sans-serif`;
      ctx.fillText(tier.toUpperCase(), width / 2, 90 * scale);

      // Member Avatar Circle / Initials
      const avatarX = width / 2;
      const avatarY = 175 * scale;
      const avatarR = 52 * scale;

      // Gold Halo
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR + 4 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

      // Inner Dark
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Initials
      ctx.fillStyle = '#fbbf24';
      ctx.font = `bold ${36 * scale}px serif`;
      ctx.fillText((volunteer.fullName || 'NC').slice(0, 2).toUpperCase(), avatarX, avatarY + 12 * scale);

      // Full Name
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${22 * scale}px serif`;
      ctx.fillText(volunteer.fullName || 'Council Member', width / 2, 260 * scale);

      // Role
      ctx.fillStyle = '#38bdf8';
      ctx.font = `600 ${13 * scale}px sans-serif`;
      ctx.fillText(volunteer.assignedRole || 'Active Member', width / 2, 282 * scale);

      // Chapter City
      ctx.fillStyle = '#94a3b8';
      ctx.font = `500 ${11 * scale}px sans-serif`;
      ctx.fillText(`Chapter: ${volunteer.city || 'National Directorate'}`, width / 2, 302 * scale);

      // Info Box (Member ID & Validity)
      const boxW = 340 * scale;
      const boxH = 90 * scale;
      const boxX = (width - boxW) / 2;
      const boxY = 325 * scale;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect(boxX, boxY, boxW, boxH, 14 * scale);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1 * scale;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.font = `500 ${10 * scale}px sans-serif`;
      ctx.fillText('OFFICIAL CREDENTIAL ID', boxX + 16 * scale, boxY + 28 * scale);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${14 * scale}px monospace`;
      ctx.fillText(idCode, boxX + 16 * scale, boxY + 48 * scale);

      ctx.fillStyle = '#94a3b8';
      ctx.font = `500 ${10 * scale}px sans-serif`;
      ctx.fillText('VALIDITY PERIOD', boxX + 16 * scale, boxY + 68 * scale);
      ctx.fillStyle = '#4ade80';
      ctx.font = `600 ${11 * scale}px sans-serif`;
      ctx.fillText(`${validFromStr} — ${validThruStr}`, boxX + 16 * scale, boxY + 82 * scale);

      // QR Code Simulated Pattern
      const qrBoxX = boxX + boxW - 80 * scale;
      const qrBoxY = boxY + 12 * scale;
      const qrSize = 66 * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrBoxX, qrBoxY, qrSize, qrSize);
      ctx.fillStyle = '#0f172a';
      // Finder corners
      ctx.fillRect(qrBoxX + 4 * scale, qrBoxY + 4 * scale, 18 * scale, 18 * scale);
      ctx.fillRect(qrBoxX + qrSize - 22 * scale, qrBoxY + 4 * scale, 18 * scale, 18 * scale);
      ctx.fillRect(qrBoxX + 4 * scale, qrBoxY + qrSize - 22 * scale, 18 * scale, 18 * scale);
      // Small dots
      ctx.fillRect(qrBoxX + qrSize / 2 - 4 * scale, qrBoxY + qrSize / 2 - 4 * scale, 8 * scale, 8 * scale);
      ctx.fillRect(qrBoxX + 26 * scale, qrBoxY + 10 * scale, 6 * scale, 6 * scale);
      ctx.fillRect(qrBoxX + 10 * scale, qrBoxY + 26 * scale, 6 * scale, 6 * scale);
      ctx.fillRect(qrBoxX + qrSize - 16 * scale, qrBoxY + qrSize - 16 * scale, 8 * scale, 8 * scale);

      // Security Seal & Director Signature Section
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold ${10 * scale}px sans-serif`;
      ctx.fillText('VERIFIED ACCREDITED COUNCIL CREDENTIAL', width / 2, 432 * scale);

      // Director's Cursive Calligraphic Signature
      ctx.fillStyle = '#fbbf24';
      ctx.font = `italic bold ${15 * scale}px serif`;
      ctx.fillText('Minahil Imran Awan', width / 2, 456 * scale);

      // Signature Flourish Underline
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 85 * scale, 462 * scale);
      ctx.quadraticCurveTo(width / 2, 467 * scale, width / 2 + 85 * scale, 463 * scale);
      ctx.stroke();

      // Signatory Name & Official Designation
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${10 * scale}px sans-serif`;
      ctx.fillText('Minahil Imran Awan', width / 2, 477 * scale);

      ctx.fillStyle = '#fde047';
      ctx.font = `600 ${8.5 * scale}px sans-serif`;
      ctx.fillText('Founder & Director, NexGen Women Empowerment', width / 2, 491 * scale);

      ctx.fillStyle = '#94a3b8';
      ctx.font = `400 ${8 * scale}px sans-serif`;
      ctx.fillText('Official Directorate Seal • nexgencouncil.bond', width / 2, 505 * scale);

      // Simulated Barcode
      const barY = 522 * scale;
      const barH = 22 * scale;
      ctx.fillStyle = '#e2e8f0';
      let curX = 30 * scale;
      const widths = [2, 4, 1, 3, 5, 2, 1, 4, 2, 3, 1, 5, 2, 4, 1, 3, 2, 4, 1, 2, 5, 3, 1, 4, 2];
      while (curX < width - 30 * scale) {
        for (const w of widths) {
          if (curX >= width - 30 * scale) break;
          ctx.fillRect(curX, barY, w * scale, barH);
          curX += (w + 2) * scale;
        }
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 ${9 * scale}px monospace`;
      ctx.fillText(`* ${idCode} *`, width / 2, 555 * scale);

      // Bottom Gold Ribbon
      ctx.fillStyle = ribbonGrad;
      ctx.fillRect(0, height - 10 * scale, width, 10 * scale);

      // Trigger Download
      const link = document.createElement('a');
      link.download = `NexGen_ID_Card_${volunteer.fullName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-7 space-y-5 shadow-2xl my-auto">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center border border-amber-400/30">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-white">Official Digital ID Card</h3>
              <p className="text-[11px] text-slate-400">NexGen Women Empowerment & Youth Leadership Council</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Side Switcher (Front / Back) */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 max-w-xs mx-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSide('front')}
            className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeSide === 'front'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Front View
          </button>
          <button
            type="button"
            onClick={() => setActiveSide('back')}
            className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeSide === 'back'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Back &amp; Terms
          </button>
        </div>

        {/* Professional ID Card Presentation Box */}
        <div className="flex justify-center py-1">
          {activeSide === 'front' ? (
            /* FRONT CARD */
            <div
              ref={cardRef}
              className="w-full max-w-[370px] rounded-3xl overflow-hidden shadow-2xl relative border-2 border-amber-500/40 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white select-none transition-all"
              style={{ aspectRatio: '1 / 1.58' }}
            >
              {/* Metallic Gold Header Ribbon */}
              <div className="h-2 w-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500" />

              {/* Watermark Crest */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.06] pointer-events-none">
                <img src="/logo.png" alt="" className="w-64 h-64 object-contain" />
              </div>

              <div className="p-5 flex flex-col h-full justify-between relative z-10">
                {/* Header Brand */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="NexGen Council" className="w-9 h-9 object-contain" />
                    <div>
                      <h4 className="font-serif font-bold text-xs tracking-wider text-white">NEXGEN COUNCIL</h4>
                      <p className="text-[9px] text-amber-300 font-medium tracking-wide">
                        WOMEN EMPOWERMENT &amp; YOUTH
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold inline-flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {volunteer.status || 'Active'}
                  </span>
                </div>

                {/* Membership Tier Pill */}
                <div className="text-center pt-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-900/70 border border-indigo-700/80 text-amber-300 text-[10px] font-bold uppercase tracking-wider shadow-xs">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>{tier}</span>
                  </span>
                </div>

                {/* Member Photo & Core Profile */}
                <div className="flex flex-col items-center text-center space-y-2.5 my-auto py-1">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-2xl p-0.5 bg-gradient-to-b from-amber-400 via-yellow-200 to-amber-600 shadow-xl overflow-hidden">
                      <div className="w-full h-full rounded-[14px] bg-slate-950 overflow-hidden flex items-center justify-center text-amber-300 font-serif font-bold text-2xl">
                        {volunteer.avatar ? (
                          <img
                            src={volunteer.avatar}
                            alt={volunteer.fullName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          volunteer.fullName.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    </div>
                    <div
                      className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 p-1 rounded-full shadow-md"
                      title="Verified Council Member"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <h3 className="font-serif font-bold text-lg text-white tracking-tight">
                      {volunteer.fullName}
                    </h3>
                    <p className="text-xs font-semibold text-sky-300">{volunteer.assignedRole}</p>
                    <p className="text-[11px] text-slate-400">{volunteer.city} Chapter</p>
                  </div>

                  {/* Badges Box */}
                  <div className="grid grid-cols-2 gap-2 w-full pt-1 text-[10px] text-slate-300">
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 text-left">
                      <span className="text-[9px] text-slate-400 block uppercase font-mono">Issued</span>
                      <strong className="text-white font-medium truncate block">{validFromStr}</strong>
                    </div>
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 text-left">
                      <span className="text-[9px] text-slate-400 block uppercase font-mono">Valid Thru</span>
                      <strong className="text-emerald-400 font-semibold block">{validThruStr}</strong>
                    </div>
                  </div>
                </div>

                {/* Card Footer with QR Code & Credential Number */}
                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <div className="space-y-0.5 text-left">
                    <span className="text-slate-400 text-[9px] block uppercase font-mono tracking-wider">
                      Member Credential
                    </span>
                    <strong className="font-mono text-xs text-amber-300 block">{idCode}</strong>
                    <div className="pt-0.5 flex items-center gap-1 text-[9px] text-slate-400">
                      <span className="text-slate-500 font-mono text-[8px] uppercase">Dir. Signature:</span>
                      <span className="font-serif italic font-bold text-amber-300 text-[10px]">Minahil Imran Awan</span>
                    </div>
                  </div>

                  <div className="w-12 h-12 bg-white p-1 rounded-xl shadow-md flex items-center justify-center text-slate-950 shrink-0">
                    <QrCode className="w-full h-full" />
                  </div>
                </div>
              </div>

              {/* Bottom Gold Foil Ribbon */}
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500" />
            </div>
          ) : (
            /* BACK CARD */
            <div
              className="w-full max-w-[370px] rounded-3xl overflow-hidden shadow-2xl relative border-2 border-slate-700 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white select-none transition-all p-5 flex flex-col justify-between"
              style={{ aspectRatio: '1 / 1.58' }}
            >
              {/* Top Ribbon */}
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 absolute top-0 left-0" />

              <div className="space-y-3 pt-2">
                <div className="text-center space-y-1">
                  <h4 className="font-serif font-bold text-xs text-amber-300 uppercase tracking-widest">
                    Council Credential Terms
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    This official digital ID certifies accredited standing with the NexGen Women Empowerment &amp;
                    Youth Leadership Council.
                  </p>
                </div>

                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5 text-[10px] text-slate-300 text-left">
                  <p className="flex items-center gap-1.5 font-semibold text-white">
                    <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Official Authorization</span>
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Authorized to represent the council in approved civic empowerment workshops, community drives,
                    and regional forums.
                  </p>
                </div>

                <div className="space-y-1 text-left text-[10px] text-slate-300 pt-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Portal: nexgencouncil.bond/track</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Secretariat: info@nexgencouncil.bond</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Headquarters: Sialkot, Pakistan</span>
                  </div>
                </div>
              </div>

              {/* Director Digital Signature Box */}
              <div className="p-3 bg-gradient-to-r from-amber-950/30 via-slate-900 to-indigo-950/30 border border-amber-500/30 rounded-2xl relative overflow-hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-left space-y-1">
                    <span className="text-[9px] text-amber-400 font-mono uppercase tracking-wider block font-semibold flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                      <span>Authorized Executive Signature</span>
                    </span>

                    {/* Stylized Digital Calligraphic Signature */}
                    <div className="relative py-0.5">
                      <p className="font-serif italic font-bold text-amber-200 text-sm tracking-wide select-none filter drop-shadow">
                        Minahil Imran Awan
                      </p>
                      {/* Signature underline flourish SVG */}
                      <svg className="w-36 h-2 text-amber-400/80 -mt-0.5" viewBox="0 0 144 8" fill="none">
                        <path d="M2 5C35 1 90 7 142 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-[10px] text-white font-bold tracking-tight">Minahil Imran Awan</p>
                      <p className="text-[9px] text-amber-300 font-medium leading-tight">Founder &amp; Director, NexGen Women Empowerment</p>
                    </div>
                  </div>

                  {/* Director Seal Stamp */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-11 h-11 rounded-full border-2 border-amber-400/60 bg-amber-400/10 flex flex-col items-center justify-center text-amber-300 shadow-inner relative">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                      <span className="text-[6px] font-mono font-bold text-amber-300 tracking-tighter uppercase mt-0.5">SEAL</span>
                    </div>
                    <span className="text-[7px] text-emerald-400 font-mono font-semibold mt-1 flex items-center gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                      VERIFIED
                    </span>
                  </div>
                </div>
              </div>

              {/* Simulated Barcode */}
              <div className="pt-2 text-center">
                <div className="h-6 w-full flex items-center justify-center gap-0.5 opacity-70">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-slate-300 h-full"
                      style={{ width: `${(i % 3) + 1}px` }}
                    />
                  ))}
                </div>
                <span className="text-[8px] font-mono text-slate-500 mt-1 block">*{idCode}*</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={downloading}
            className="py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Generating...' : 'Download Card'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Print ID Card</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(verificationUrl);
              alert('Verification URL copied to clipboard: ' + verificationUrl);
            }}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Share2 className="w-4 h-4 text-slate-300" />
            <span>Share Link</span>
          </button>
        </div>
      </div>
    </div>
  );
};
