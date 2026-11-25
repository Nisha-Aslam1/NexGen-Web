import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  X,
  Download,
  FileDown,
  Award,
  ShieldCheck,
  Share2,
  Printer,
  Camera,
  Check,
  Globe,
  Mail,
  MapPin,
  Phone,
  Upload,
  Sparkles,
  ArrowRight,
  CreditCard,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { Volunteer } from '../../types.ts';

export interface MemberIdCardData {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  city?: string;
  assignedRole: string;
  assignedProgram?: string;
  membershipTier?: string;
  joinedDate?: string;
  status?: string;
  avatar?: string;
  hoursContributed?: number;
  hoursLogged?: number;
  skills?: string[];
  referenceCode?: string;
}

interface VolunteerIdCardModalProps {
  volunteer: Volunteer | MemberIdCardData;
  onClose: () => void;
  onAvatarChange?: (newAvatarUrl: string) => void;
}

type ModalStep = 'photo' | 'preview';
type CardViewMode = 'dual' | 'front' | 'back';

const NAVY = '#162A4D';
const NAVY_DEEP = '#0F1F3D';
const GOLD = '#C89B2B';

function loadImage(src?: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Crops only the upper circular emblem from /logo.png (excluding the lower text lines)
 * so Page 1 and Page 2 match the exact PDF emblem lockup.
 */
async function createCircularEmblemDataUrl(logoSrc: string): Promise<string | null> {
  const img = await loadImage(logoSrc);
  if (!img) return null;

  const w = img.naturalWidth || 512;
  const h = img.naturalHeight || 512;
  // Upper circular crest occupies roughly y: 3%..74% and x: 13%..87%
  const sx = w * 0.132;
  const sy = h * 0.028;
  const sw = w * 0.736;
  const sh = h * 0.715;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, sw, sh, 6, 6, size - 12, size - 12);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

function drawCoverImageRounded(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();

  const imgRatio = img.naturalWidth / (img.naturalHeight || 1);
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (imgRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.naturalWidth / (img.naturalHeight || 1);
  const boxRatio = w / h;
  let dw = w;
  let dh = h;
  if (imgRatio > boxRatio) {
    dh = w / imgRatio;
  } else {
    dw = h * imgRatio;
  }
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawDirectorSignature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleX, scaleY);

  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(4, 34);
  ctx.bezierCurveTo(10, 8, 16, 4, 18, 28);
  ctx.bezierCurveTo(21, 10, 29, 4, 31, 27);
  ctx.bezierCurveTo(33, 30, 38, 19, 44, 23);
  ctx.bezierCurveTo(49, 27, 52, 17, 57, 22);
  ctx.bezierCurveTo(61, 26, 67, 13, 72, 16);
  ctx.bezierCurveTo(75, 18, 71, 27, 81, 23);
  ctx.bezierCurveTo(89, 19, 97, 7, 102, 14);
  ctx.bezierCurveTo(106, 20, 99, 28, 111, 22);
  ctx.bezierCurveTo(120, 17, 128, 14, 135, 22);
  ctx.bezierCurveTo(142, 28, 152, 17, 165, 21);
  ctx.bezierCurveTo(175, 24, 188, 17, 204, 19);
  ctx.stroke();

  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.arc(46, 13, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(6, 40);
  ctx.bezierCurveTo(62, 34, 142, 43, 210, 33);
  ctx.stroke();

  ctx.restore();
}

function drawSocialIconOnCanvas(
  ctx: CanvasRenderingContext2D,
  type: 'tiktok' | 'facebook' | 'instagram' | 'email',
  cx: number,
  cy: number,
  size: number
) {
  ctx.save();
  const r = size / 2;

  if (type === 'tiktok') {
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = size * 0.12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(cx - size * 0.08, cy + size * 0.12, size * 0.15, 0.2 * Math.PI, 1.85 * Math.PI);
    ctx.moveTo(cx + size * 0.07, cy + size * 0.12);
    ctx.lineTo(cx + size * 0.07, cy - size * 0.24);
    ctx.quadraticCurveTo(cx + size * 0.14, cy - size * 0.1, cx + size * 0.26, cy - size * 0.1);
    ctx.stroke();
  } else if (type === 'facebook') {
    ctx.fillStyle = '#1877F2';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(size * 0.72)}px sans-serif`;
    ctx.fillText('f', cx + size * 0.03, cy + size * 0.26);
  } else if (type === 'instagram') {
    const grad = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
    grad.addColorStop(0, '#F58529');
    grad.addColorStop(0.45, '#DD2A7B');
    grad.addColorStop(0.8, '#8134AF');
    grad.addColorStop(1, '#515BD4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(cx - r, cy - r, size, size, size * 0.28);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = size * 0.09;
    ctx.beginPath();
    ctx.roundRect(cx - size * 0.28, cy - size * 0.28, size * 0.56, size * 0.56, size * 0.16);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx + size * 0.16, cy - size * 0.16, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'email') {
    const w = size * 1.05;
    const h = size * 0.76;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, size * 0.1);
    ctx.fill();
    ctx.strokeStyle = '#EA4335';
    ctx.lineWidth = size * 0.08;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + size * 0.06, cy - h / 2 + size * 0.08);
    ctx.lineTo(cx, cy + size * 0.04);
    ctx.lineTo(cx + w / 2 - size * 0.06, cy - h / 2 + size * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNavyContactTile(
  ctx: CanvasRenderingContext2D,
  type: 'pin' | 'globe' | 'phone',
  x: number,
  y: number,
  size: number
) {
  ctx.save();
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.24);
  ctx.fill();

  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineWidth = size * 0.075;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'pin') {
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.07, size * 0.18, Math.PI, 0);
    ctx.lineTo(cx, cy + size * 0.27);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.07, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'globe') {
    const r = size * 0.27;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.48, r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
  } else if (type === 'phone') {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.16, cy - size * 0.18);
    ctx.quadraticCurveTo(cx - size * 0.22, cy + size * 0.16, cx + size * 0.18, cy + size * 0.2);
    ctx.lineWidth = size * 0.12;
    ctx.stroke();
  }
  ctx.restore();
}

const CalligraphicSignatureSvg: React.FC<{ className?: string }> = ({ className = 'w-36 h-8' }) => (
  <svg viewBox="0 0 216 46" fill="none" className={className} aria-label="Digital Signature of Minahil Imran Awan">
    <path
      d="M4 34 C10 8, 16 4, 18 28 C21 10, 29 4, 31 27 C33 30, 38 19, 44 23 C49 27, 52 17, 57 22 C61 26, 67 13, 72 16 C75 18, 71 27, 81 23 C89 19, 97 7, 102 14 C106 20, 99 28, 111 22 C120 17, 128 14, 135 22 C142 28, 152 17, 165 21 C175 24, 188 17, 204 19"
      stroke="#162A4D"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="46" cy="13" r="1.8" fill="#162A4D" />
    <path d="M6 40 C62 34, 142 43, 210 33" stroke="#C89B2B" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const VolunteerIdCardModal: React.FC<VolunteerIdCardModalProps> = ({
  volunteer,
  onClose,
  onAvatarChange
}) => {
  const [step, setStep] = useState<ModalStep>('photo');
  const [viewMode, setViewMode] = useState<CardViewMode>('dual');
  const [downloadingType, setDownloadingType] = useState<'pdf' | 'dual' | 'front' | 'back' | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [emblemUrl, setEmblemUrl] = useState<string>('/logo.png');
  const [customAvatar, setCustomAvatar] = useState<string>(volunteer.avatar || '');
  const [customPhone, setCustomPhone] = useState<string>(volunteer.phone || '');
  const [customCity, setCustomCity] = useState<string>(volunteer.city || 'Sialkot, Punjab Pakistan');
  const [customRole, setCustomRole] = useState<string>(volunteer.assignedRole || 'MEMBER NEXGEN COUNCIL');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCustomAvatar(volunteer.avatar || '');
    setCustomPhone(volunteer.phone || '');
    setCustomCity(volunteer.city || 'Sialkot, Punjab Pakistan');
    setCustomRole(volunteer.assignedRole || 'MEMBER NEXGEN COUNCIL');
  }, [volunteer]);

  useEffect(() => {
    let active = true;
    createCircularEmblemDataUrl('/logo.png').then(cropped => {
      if (active && cropped) setEmblemUrl(cropped);
    });
    return () => {
      active = false;
    };
  }, []);

  const idCode =
    ('referenceCode' in volunteer && volunteer.referenceCode) ||
    (volunteer.id?.startsWith('vol_')
      ? `NXG-${new Date().getFullYear()}-${volunteer.id.slice(-4).toUpperCase()}`
      : `NXG-${new Date().getFullYear()}-${(volunteer.id || '3104').slice(-4).toUpperCase()}`);

  const roleLabel = (customRole || 'MEMBER NEXGEN COUNCIL').toUpperCase();
  const verificationUrl = `https://nexgencouncil.bond/track?code=${encodeURIComponent(idCode)}`;
  const displayAvatar = customAvatar || '';
  const initials = (volunteer.fullName || 'NC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(verificationUrl, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: NAVY,
        light: '#FFFFFF'
      }
    })
      .then(url => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [verificationUrl]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      // Center-crop cleanly to match the exact portrait box ratio (552 x 610)
      const loaded = await loadImage(dataUrl);
      let finalImage = dataUrl;
      if (loaded) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = 640;
        cropCanvas.height = 708;
        const cctx = cropCanvas.getContext('2d');
        if (cctx) {
          drawCoverImageRounded(cctx, loaded, 0, 0, 640, 708, 0);
          finalImage = cropCanvas.toDataURL('image/jpeg', 0.94);
        }
      }

      setCustomAvatar(finalImage);
      if (onAvatarChange) {
        onAvatarChange(finalImage);
      }
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * Page 1 (Front) — Exact layout & geometry matching Eman_Aqeel_Member_NexGen_Card PDF (1000 x 1620)
   */
  const paintFrontCard = (
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    cw: number,
    ch: number,
    emblemImg: HTMLImageElement | null,
    avatarImg: HTMLImageElement | null
  ) => {
    const s = cw / 1000;
    ctx.save();
    ctx.translate(ox, oy);

    // Pure White Canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    // Left Deep Navy Architectural Band (0 .. 154*s) with clean diagonal cut at bottom
    const leftW = 154 * s;
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leftW, 0);
    ctx.lineTo(leftW, 1140 * s);
    ctx.lineTo(0, 1295 * s);
    ctx.closePath();
    ctx.fill();

    // Centered White Vertical Line inside Left Navy Band
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(79 * s, 495 * s, 10 * s, 118 * s);

    // Parallel Diagonal Navy Stripe underneath white diagonal gap
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(0, 1340 * s);
    ctx.lineTo(leftW, 1185 * s);
    ctx.lineTo(leftW, 1260 * s);
    ctx.lineTo(0, 1415 * s);
    ctx.closePath();
    ctx.fill();

    // Bottom-Left 4x4 Navy Dot Matrix
    ctx.fillStyle = NAVY;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.beginPath();
        ctx.arc((44 + col * 36) * s, (1462 + row * 37) * s, 4.5 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Top-Right Diagonal Navy Accent Bar
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(892 * s, 260 * s);
    ctx.lineTo(cw, 165 * s);
    ctx.lineTo(cw, 212 * s);
    ctx.lineTo(892 * s, 307 * s);
    ctx.closePath();
    ctx.fill();

    // Bottom-Right Navy Corner Triangle
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(785 * s, ch);
    ctx.lineTo(cw, 1412 * s);
    ctx.lineTo(cw, ch);
    ctx.closePath();
    ctx.fill();

    // Top Header Lockup: Circular Emblem + Vertical Gold Rule + NexGen Title
    const headerX = 296 * s;
    const headerY = 74 * s;
    if (emblemImg) {
      drawContainImage(ctx, emblemImg, headerX, headerY, 178 * s, 178 * s);
    }

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(headerX + 190 * s, headerY + 34 * s);
    ctx.lineTo(headerX + 190 * s, headerY + 148 * s);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `800 ${60 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('NexGen', headerX + 202 * s, headerY + 86 * s);

    ctx.font = `700 ${24 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Women Empowerment', headerX + 204 * s, headerY + 120 * s);
    ctx.fillText('And Youth Leadership Council', headerX + 204 * s, headerY + 148 * s);

    // Large Rounded-Square Portrait Photo
    const photoX = 274 * s;
    const photoY = 328 * s;
    const photoW = 552 * s;
    const photoH = 610 * s;
    const photoR = 54 * s;

    if (avatarImg) {
      drawCoverImageRounded(ctx, avatarImg, photoX, photoY, photoW, photoH, photoR);
    } else {
      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoW, photoH, photoR);
      ctx.fill();
      ctx.fillStyle = NAVY;
      ctx.textAlign = 'center';
      ctx.font = `800 ${150 * s}px "Playfair Display", Georgia, serif`;
      ctx.fillText(initials, photoX + photoW / 2, photoY + photoH * 0.56);
    }

    // Member Full Name (Bold Uppercase Navy)
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `800 ${52 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText((volunteer.fullName || 'COUNCIL MEMBER').toUpperCase(), photoX, 1020 * s, cw - photoX - 42 * s);

    // Short Thick Navy Accent Bar
    ctx.fillStyle = NAVY;
    ctx.fillRect(photoX, 1054 * s, 154 * s, 10 * s);

    // Letter-Spaced Uppercase Role
    ctx.fillStyle = '#1E293B';
    ctx.font = `500 ${30 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(roleLabel, photoX, 1126 * s, cw - photoX - 42 * s);

    // Clean Aligned Metadata Block (ID, City, Phone)
    const labelX = 352 * s;
    const colonX = 456 * s;
    const valX = 478 * s;
    const rows: [string, string][] = [
      ['ID', idCode],
      ['City', customCity || 'National Chapter'],
      ['Phone', customPhone || 'Verified Member']
    ];

    rows.forEach(([label, val], idx) => {
      const y = (1238 + idx * 62) * s;
      ctx.fillStyle = '#1E293B';
      ctx.font = `500 ${28 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(label, labelX, y);
      ctx.fillText(':', colonX, y);
      ctx.fillText(val, valX, y, cw - valX - 42 * s);
    });

    ctx.restore();
  };

  /**
   * Page 2 (Back) — Exact layout matching Eman_Aqeel_Member_NexGen_Card PDF + Clean Director Signature
   */
  const paintBackCard = (
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    cw: number,
    ch: number,
    emblemImg: HTMLImageElement | null,
    qrImg: HTMLImageElement | null
  ) => {
    const s = cw / 1000;
    ctx.save();
    ctx.translate(ox, oy);

    // Pure White Canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    // Centered Circular Emblem at Top
    if (emblemImg) {
      drawContainImage(ctx, emblemImg, cw / 2 - 175 * s, 68 * s, 350 * s, 350 * s);
    }

    // Organization Name Centered Under Emblem
    ctx.textAlign = 'center';
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${32 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('NexGen Women Empowerment', cw / 2, 444 * s);
    ctx.fillText('And Youth Leadership Council', cw / 2, 482 * s);

    // Subtle Gold Hairline Rule right under title (visible in PDF)
    ctx.strokeStyle = 'rgba(200, 155, 43, 0.55)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cw / 2 - 110 * s, 496 * s);
    ctx.lineTo(cw / 2 + 110 * s, 496 * s);
    ctx.stroke();

    // Short Centered Navy Divider Bar
    ctx.fillStyle = NAVY;
    ctx.fillRect(cw / 2 - 64 * s, 616 * s, 128 * s, 10 * s);

    // Social Media Channels List
    const socialItems: Array<{ type: 'tiktok' | 'facebook' | 'instagram' | 'email'; text: string[] }> = [
      { type: 'tiktok', text: ['@nextgen.womenempowerment'] },
      { type: 'facebook', text: ['Nex Gen Council'] },
      { type: 'instagram', text: ['nexgen.womenleadership.council'] },
      { type: 'email', text: ['nexgenwomenempowermentand', 'youth@gmail.com'] }
    ];

    const socialIconX = 204 * s;
    const socialTextX = 264 * s;
    socialItems.forEach((item, idx) => {
      const y = 688 * s + idx * 70 * s;
      drawSocialIconOnCanvas(ctx, item.type, socialIconX, y, 42 * s);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1E293B';
      ctx.font = `400 ${26 * s}px "Plus Jakarta Sans", sans-serif`;
      if (item.text.length === 1) {
        ctx.fillText(item.text[0], socialTextX, y + 8 * s);
      } else {
        ctx.fillText(item.text[0], socialTextX, y - 6 * s);
        ctx.fillText(item.text[1], socialTextX, y + 26 * s);
      }
    });

    // Horizontal Grey Divider with Centered Navy Accent Bar
    ctx.fillStyle = '#B8B2A6';
    ctx.fillRect(102 * s, 976 * s, cw - 204 * s, 5 * s);
    ctx.fillStyle = NAVY;
    ctx.fillRect(cw / 2 - 78 * s, 972 * s, 156 * s, 13 * s);

    // Contact Details with Navy Rounded-Square Icon Tiles
    const contacts: Array<{ type: 'pin' | 'globe' | 'phone'; label: string; value: string; bold?: boolean }> = [
      { type: 'pin', label: 'Address', value: 'Sialkot,Punjab Pakistan' },
      { type: 'globe', label: 'Website', value: 'Nexgencouncil.bond', bold: true },
      { type: 'phone', label: 'Phone', value: '+923454001714', bold: true }
    ];

    contacts.forEach((c, idx) => {
      const y = 1042 * s + idx * 92 * s;
      drawNavyContactTile(ctx, c.type, 158 * s, y, 62 * s);

      ctx.textAlign = 'left';
      ctx.fillStyle = NAVY;
      ctx.font = `700 ${26 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(c.label, 256 * s, y + 40 * s);

      ctx.fillStyle = '#1E293B';
      ctx.font = c.bold
        ? `700 ${26 * s}px "Plus Jakarta Sans", sans-serif`
        : `400 ${26 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(c.value, 444 * s, y + 40 * s);
    });

    // Clean, Unboxed Director Signature & Verification QR right above the footer wave
    if (qrImg) {
      drawContainImage(ctx, qrImg, 158 * s, 1316 * s, 68 * s, 68 * s);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = `600 ${14 * s}px monospace`;
      ctx.fillText(idCode, 236 * s, 1356 * s);
    }

    drawDirectorSignature(ctx, 566 * s, 1298 * s, 1.05 * s, 0.9 * s);
    ctx.textAlign = 'right';
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${19 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Minahil Imran Awan', 842 * s, 1356 * s);
    ctx.fillStyle = '#64748B';
    ctx.font = `500 ${14 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Founder & Director, NexGen Women Empowerment', 842 * s, 1376 * s);

    // Bottom Angled Deep Navy Footer Banner ("SHAPING TODAY LEADING TOMORROW")
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(0, 1400 * s);
    ctx.lineTo(cw * 0.56, 1400 * s);
    ctx.quadraticCurveTo(cw * 0.62, 1400 * s, cw * 0.68, 1440 * s);
    ctx.lineTo(cw, 1595 * s);
    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fill();

    // Accent deep-navy step on far bottom-right (matching PDF Page 2)
    ctx.fillStyle = NAVY_DEEP;
    ctx.beginPath();
    ctx.moveTo(cw * 0.77, 1510 * s);
    ctx.lineTo(cw, 1510 * s);
    ctx.lineTo(cw, ch);
    ctx.lineTo(cw * 0.89, ch);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `500 ${30 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('SHAPING', 100 * s, 1498 * s);
    ctx.fillText('TODAY LEADING TOMORROW', 100 * s, 1546 * s);

    ctx.restore();
  };

  const renderCardCanvasImages = async () => {
    const freshQrDataUrl =
      qrDataUrl ||
      (await QRCode.toDataURL(verificationUrl, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: NAVY, light: '#FFFFFF' }
      }));

    const freshEmblem = emblemUrl || (await createCircularEmblemDataUrl('/logo.png')) || '/logo.png';

    return Promise.all([
      loadImage(freshEmblem),
      loadImage(displayAvatar),
      loadImage(freshQrDataUrl)
    ]);
  };

  const handleDownloadPdf = async () => {
    setDownloadingType('pdf');
    try {
      const [emblemImg, avatarImg, qrImg] = await renderCardCanvasImages();
      const cardW = 1000;
      const cardH = 1620;

      const frontCanvas = document.createElement('canvas');
      frontCanvas.width = cardW;
      frontCanvas.height = cardH;
      const fctx = frontCanvas.getContext('2d');
      if (fctx) {
        paintFrontCard(fctx, 0, 0, cardW, cardH, emblemImg, avatarImg);
      }

      const backCanvas = document.createElement('canvas');
      backCanvas.width = cardW;
      backCanvas.height = cardH;
      const bctx = backCanvas.getContext('2d');
      if (bctx) {
        paintBackCard(bctx, 0, 0, cardW, cardH, emblemImg, qrImg);
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 162]
      });

      pdf.addImage(frontCanvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, 100, 162, undefined, 'FAST');
      pdf.addPage([100, 162], 'portrait');
      pdf.addImage(backCanvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, 100, 162, undefined, 'FAST');

      const safeName = (volunteer.fullName || 'Member').replace(/[^a-z0-9]+/gi, '_');
      pdf.save(`${safeName}_Member_NexGen_Card.pdf`);
    } catch {
      window.print();
    } finally {
      setDownloadingType(null);
    }
  };

  const handleDownloadPng = async (mode: 'dual' | 'front' | 'back') => {
    setDownloadingType(mode);
    try {
      const [emblemImg, avatarImg, qrImg] = await renderCardCanvasImages();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cardW = 1000;
      const cardH = 1620;

      if (mode === 'dual') {
        const marginX = 90;
        const gap = 80;
        const headerH = 130;
        const footerH = 75;
        canvas.width = marginX * 2 + cardW * 2 + gap;
        canvas.height = headerH + cardH + footerH;

        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FDE68A';
        ctx.font = '700 22px monospace';
        ctx.fillText('NEXGEN WOMEN EMPOWERMENT & YOUTH LEADERSHIP COUNCIL', canvas.width / 2, 56);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`Official Member Credential · ${volunteer.fullName}`, canvas.width / 2, 98);

        paintFrontCard(ctx, marginX, headerH, cardW, cardH, emblemImg, avatarImg);
        paintBackCard(ctx, marginX + cardW + gap, headerH, cardW, cardH, emblemImg, qrImg);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(
          `Credential ID: ${idCode} · Verify at nexgencouncil.bond/track`,
          canvas.width / 2,
          canvas.height - 28
        );
      } else {
        canvas.width = cardW;
        canvas.height = cardH;
        if (mode === 'front') {
          paintFrontCard(ctx, 0, 0, cardW, cardH, emblemImg, avatarImg);
        } else {
          paintBackCard(ctx, 0, 0, cardW, cardH, emblemImg, qrImg);
        }
      }

      const safeName = (volunteer.fullName || 'Member').replace(/[^a-z0-9]+/gi, '_');
      const suffix = mode === 'dual' ? 'Full_Card' : mode === 'front' ? 'Front_Card' : 'Back_Card';
      const link = document.createElement('a');
      link.download = `${safeName}_NexGen_${suffix}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch {
      window.print();
    } finally {
      setDownloadingType(null);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2400);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const renderFrontCard = () => (
    <div
      className="w-full max-w-[355px] bg-white text-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-200 relative select-none flex flex-col"
      style={{ aspectRatio: '1000 / 1620' }}
    >
      {/* Left Deep Navy Architectural Strip */}
      <div
        className="absolute left-0 top-0 h-[80%] w-[15.4%] bg-[#162A4D] flex items-center justify-center"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 88%, 0 100%)' }}
      >
        <div className="w-1 h-11 bg-white mt-4" />
      </div>

      {/* Parallel Left Diagonal Navy Ribbon */}
      <div
        className="absolute left-0 top-[73.1%] w-[15.4%] h-[14.2%] bg-[#162A4D]"
        style={{ clipPath: 'polygon(0 68%, 100% 0, 100% 33%, 0 100%)' }}
      />

      {/* Bottom-left 4x4 Navy Dot Grid */}
      <div className="absolute left-3.5 bottom-3.5 grid grid-cols-4 gap-2 pointer-events-none">
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className="w-1 h-1 rounded-full bg-[#162A4D]" />
        ))}
      </div>

      {/* Top-right diagonal navy bar */}
      <div
        className="absolute right-0 top-[10.2%] w-10 h-14 bg-[#162A4D]"
        style={{ clipPath: 'polygon(0 60%, 100% 0, 100% 34%, 0 94%)' }}
      />

      {/* Bottom-right navy corner triangle */}
      <div
        className="absolute right-0 bottom-0 w-20 h-16 bg-[#162A4D]"
        style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}
      />

      {/* Main Content Area */}
      <div className="pl-[26%] pr-4 pt-5 pb-6 flex-1 flex flex-col justify-between relative z-10">
        {/* Top Brand Header */}
        <div className="flex items-center gap-2">
          <img
            src={emblemUrl}
            alt="NexGen Council"
            className="w-16 h-16 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="border-l border-amber-500/80 pl-2 min-w-0">
            <h4 className="font-extrabold text-[22px] leading-none tracking-tight text-[#162A4D]">NexGen</h4>
            <p className="text-[8.5px] font-bold text-[#162A4D] leading-tight mt-0.5">
              Women Empowerment
              <br />
              And Youth Leadership Council
            </p>
          </div>
        </div>

        {/* Large Rounded-Square Portrait Photo */}
        <div className="my-2 flex justify-center">
          <div className="w-full max-w-[196px] aspect-[552/610] rounded-[20px] overflow-hidden bg-slate-100 flex items-center justify-center">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt={volunteer.fullName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="font-serif font-bold text-5xl text-[#162A4D]">{initials}</span>
            )}
          </div>
        </div>

        {/* Member Name, Navy Bar & Role */}
        <div className="space-y-2 text-left">
          <h3 className="font-extrabold text-[18px] leading-tight tracking-tight text-[#162A4D] uppercase break-words">
            {volunteer.fullName}
          </h3>
          <div className="w-14 h-1 bg-[#162A4D]" />
          <p className="text-[11px] font-medium tracking-[0.08em] text-slate-800 uppercase pt-0.5">{roleLabel}</p>
        </div>

        {/* Clean Aligned Metadata Table (ID, City, Phone) */}
        <div className="text-[10.5px] text-slate-800 space-y-1.5 pl-6 pb-2">
          <div className="grid grid-cols-[40px_8px_1fr] items-baseline">
            <span className="font-medium">ID</span>
            <span>:</span>
            <span className="font-semibold text-slate-900 truncate">{idCode}</span>
          </div>
          <div className="grid grid-cols-[40px_8px_1fr] items-baseline">
            <span className="font-medium">City</span>
            <span>:</span>
            <span className="truncate">{customCity || 'National Chapter'}</span>
          </div>
          <div className="grid grid-cols-[40px_8px_1fr] items-baseline">
            <span className="font-medium">Phone</span>
            <span>:</span>
            <span className="truncate">{customPhone || 'Verified Member'}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBackCard = () => (
    <div
      className="w-full max-w-[355px] bg-white text-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-200 relative select-none flex flex-col justify-between"
      style={{ aspectRatio: '1000 / 1620' }}
    >
      {/* Top Center Emblem & Title */}
      <div className="pt-5 px-5 flex flex-col items-center text-center">
        <img
          src={emblemUrl}
          alt="NexGen Council"
          className="w-28 h-28 object-contain"
          referrerPolicy="no-referrer"
        />
        <h4 className="font-bold text-[11.5px] text-[#162A4D] leading-tight mt-1">
          NexGen Women Empowerment
          <br />
          And Youth Leadership Council
        </h4>
        <div className="w-24 h-[1px] bg-amber-600/50 mt-1" />
        <div className="w-12 h-1 bg-[#162A4D] mt-6" />
      </div>

      {/* Social Media Channels */}
      <div className="px-9 space-y-2.5 text-[10px] text-slate-800">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full bg-slate-950 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
            ♪
          </span>
          <span className="truncate">@nextgen.womenempowerment</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full bg-[#1877F2] text-white flex items-center justify-center text-[11px] font-extrabold shrink-0">
            f
          </span>
          <span className="truncate">Nex Gen Council</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-md bg-gradient-to-tr from-amber-500 via-pink-600 to-indigo-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
            ◎
          </span>
          <span className="truncate">nexgen.womenleadership.council</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded border border-rose-500 text-rose-600 flex items-center justify-center shrink-0">
            <Mail className="w-3 h-3" />
          </span>
          <span className="leading-tight break-all text-[9.5px]">nexgenwomenempowermentandyouth@gmail.com</span>
        </div>
      </div>

      {/* Horizontal Divider */}
      <div className="px-7 relative flex items-center justify-center">
        <div className="w-full h-[2px] bg-stone-300" />
        <div className="absolute w-14 h-1.5 bg-[#162A4D]" />
      </div>

      {/* Contact Block */}
      <div className="px-8 space-y-2.5 text-[10px] text-slate-800">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-md bg-[#162A4D] text-white flex items-center justify-center shrink-0">
            <MapPin className="w-3.5 h-3.5" />
          </span>
          <div className="grid grid-cols-[58px_1fr] flex-1 items-center">
            <strong className="text-[#162A4D]">Address</strong>
            <span>Sialkot,Punjab Pakistan</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-md bg-[#162A4D] text-white flex items-center justify-center shrink-0">
            <Globe className="w-3.5 h-3.5" />
          </span>
          <div className="grid grid-cols-[58px_1fr] flex-1 items-center">
            <strong className="text-[#162A4D]">Website</strong>
            <strong className="text-slate-900">Nexgencouncil.bond</strong>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-md bg-[#162A4D] text-white flex items-center justify-center shrink-0">
            <Phone className="w-3.5 h-3.5" />
          </span>
          <div className="grid grid-cols-[58px_1fr] flex-1 items-center">
            <strong className="text-[#162A4D]">Phone</strong>
            <strong className="text-slate-900">+923454001714</strong>
          </div>
        </div>
      </div>

      {/* Clean Unboxed Signature & Compact Verification QR */}
      <div className="px-8 flex items-end justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5 shrink-0">
          {qrDataUrl && <img src={qrDataUrl} alt="QR" className="w-8 h-8 object-contain" />}
          <span className="text-[7px] font-mono text-slate-500">{idCode}</span>
        </div>
        <div className="text-right min-w-0">
          <CalligraphicSignatureSvg className="w-28 h-6 ml-auto" />
          <p className="font-bold text-[8.5px] text-[#162A4D] leading-tight">Minahil Imran Awan</p>
          <p className="text-[7px] text-slate-500 leading-tight">Founder &amp; Director, NexGen</p>
        </div>
      </div>

      {/* Bottom Angled Deep Navy Footer */}
      <div className="relative bg-[#162A4D] text-white px-7 py-4 pt-5 mt-1">
        <div
          className="absolute -top-4 right-0 w-[44%] h-5 bg-white"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
        />
        <p className="text-[11px] font-medium tracking-wider uppercase leading-snug">
          SHAPING
          <br />
          TODAY LEADING TOMORROW
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in print:bg-white print:p-0 print:static">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-7 space-y-5 shadow-2xl my-auto print:border-0 print:shadow-none print:bg-white print:max-w-none print:p-2">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center border border-amber-400/30 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-base sm:text-lg text-white truncate">
                Official NexGen Member ID Card
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {volunteer.fullName} · {idCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ID Card modal"
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'photo' ? (
          /* STEP 1: Mandatory Portrait Photo Request & Quick Card Info Check */
          <div className="py-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Portrait Upload Preview Box */}
              <div className="md:col-span-5 flex flex-col items-center space-y-3">
                <div className="w-52 h-56 rounded-3xl bg-slate-950 border-2 border-dashed border-amber-400/50 overflow-hidden flex flex-col items-center justify-center relative shadow-xl group">
                  {displayAvatar ? (
                    <>
                      <img
                        src={displayAvatar}
                        alt={volunteer.fullName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <label className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-semibold gap-1.5 cursor-pointer">
                        <Camera className="w-6 h-6 text-amber-300" />
                        <span>Replace Photo</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handlePhotoUpload}
                          disabled={uploadingPhoto}
                          className="hidden"
                        />
                      </label>
                    </>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center p-5 text-center cursor-pointer hover:bg-slate-900/80 transition-colors space-y-2.5">
                      <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white">Upload Member Portrait</p>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          PNG, JPG or WebP portrait photo for the front ID card
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <label className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>
                    {uploadingPhoto
                      ? 'Optimizing Photo...'
                      : displayAvatar
                      ? 'Choose Another Portrait Photo'
                      : 'Select Portrait Photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Card Details Confirmation */}
              <div className="md:col-span-7 space-y-4 text-left">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <ImageIcon className="w-4 h-4" />
                    <span>Step 1 of 2 · Portrait Photo &amp; Details</span>
                  </div>
                  <h4 className="text-xl font-serif font-bold text-white">
                    {displayAvatar
                      ? 'Portrait Ready for Official NexGen ID Card'
                      : 'Add Member Portrait Photo to Continue'}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Attach a clear portrait photo for <strong className="text-slate-200">{volunteer.fullName}</strong>.
                    It will be placed cleanly into the official 2-page PDF member credential.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 font-medium mb-1">Designation / Role on Card</label>
                    <input
                      type="text"
                      value={customRole}
                      onChange={e => setCustomRole(e.target.value)}
                      placeholder="MEMBER NEXGEN COUNCIL"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">City / Chapter</label>
                    <input
                      type="text"
                      value={customCity}
                      onChange={e => setCustomCity(e.target.value)}
                      placeholder="e.g. Karachi, Sindh Pakistan"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={customPhone}
                      onChange={e => setCustomPhone(e.target.value)}
                      placeholder="e.g. 0334-3152080"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  {displayAvatar ? (
                    <button
                      type="button"
                      onClick={() => setStep('preview')}
                      className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Official ID Card</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <>
                      <label className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg transition-colors">
                        <Upload className="w-4 h-4" />
                        <span>Upload Photo &amp; Generate Card</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={async e => {
                            await handlePhotoUpload(e);
                            setStep('preview');
                          }}
                          disabled={uploadingPhoto}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setStep('preview')}
                        className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
                      >
                        Continue without Photo
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: 2-Page Official PDF Card Preview & Download Controls */
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('dual')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    viewMode === 'dual' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Both Pages</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('front')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    viewMode === 'front' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Page 1 (Front)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('back')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    viewMode === 'back' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Page 2 (Back)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStep('photo')}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5 text-amber-400" />
                <span>{displayAvatar ? 'Change Photo / Details' : 'Add Portrait Photo'}</span>
              </button>
            </div>

            <div className="py-2 flex flex-col lg:flex-row items-center justify-center gap-6 print:flex-row print:gap-6">
              {(viewMode === 'front' || viewMode === 'dual') && renderFrontCard()}
              {(viewMode === 'back' || viewMode === 'dual') && renderBackCard()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-slate-800 print:hidden">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingType !== null}
                className="py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <FileDown className="w-4 h-4" />
                <span>{downloadingType === 'pdf' ? 'Creating PDF...' : 'Download Official PDF'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPng('dual')}
                  disabled={downloadingType !== null}
                  className="py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>{downloadingType === 'dual' ? '...' : 'Dual PNG'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPng('front')}
                  disabled={downloadingType !== null}
                  className="py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>{downloadingType === 'front' ? '...' : 'Front PNG'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Printer className="w-4 h-4 text-slate-300" />
                <span>Print Card</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Verify Link Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-slate-300" />
                    <span>Copy Verify Link</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
