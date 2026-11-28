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
  MapPin,
  Phone,
  Upload,
  Sparkles,
  ArrowRight,
  CreditCard,
  Layers,
  Image as ImageIcon,
  RotateCw,
  Lock,
  CheckCircle2,
  AlertCircle
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

export interface IssueOfficialCardPayload {
  photoDataUrl: string;
  city: string;
  phone: string;
  format: 'pdf' | 'dual' | 'front' | 'print';
}

export interface IssueOfficialCardResult {
  ok: boolean;
  photoUrl?: string;
  issuedAt?: string;
  error?: string;
}

interface VolunteerIdCardModalProps {
  volunteer: Volunteer | MemberIdCardData;
  onClose: () => void;
  onAvatarChange?: (newAvatarUrl: string) => void;
  isAdmin?: boolean;
  oneTimeIssuance?: boolean;
  isAlreadyIssued?: boolean;
  isPhotoLocked?: boolean;
  issuedAt?: string;
  onUploadSinglePhoto?: (photoDataUrl: string) => Promise<{ ok: boolean; photoUrl?: string; error?: string }>;
  onIssueOfficialCard?: (payload: IssueOfficialCardPayload) => Promise<IssueOfficialCardResult>;
}

type ModalStep = 'photo' | 'preview';
type CardViewMode = 'dual' | 'front' | 'back';

const NAVY = '#162A4D';
const NAVY_DEEP = '#0F1F3D';
const GOLD = '#C89B2B';
const DEFAULT_CARD_ROLE = 'MEMBER NEXGEN COUNCIL';

/**
 * Formats names cleanly in Title Case so first letter of every name part is capitalized
 * e.g. "eman aqeel tamemi" or "EMAN AQEEL TAMEMI" -> "Eman Aqeel Tamemi"
 */
function toTitleCaseName(name?: string): string {
  if (!name || !name.trim()) return 'Council Member';
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

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

function drawCoverImageCircle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number
) {
  const x = cx - radius;
  const y = cy - radius;
  const d = radius * 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const imgRatio = img.naturalWidth / (img.naturalHeight || 1);
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (imgRatio > 1) {
    sw = img.naturalHeight;
    sx = (img.naturalWidth - sw) / 2;
  } else if (imgRatio < 1) {
    sh = img.naturalWidth;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, d, d);
  ctx.restore();
}

function drawSquareCenterCropDataUrl(
  img: HTMLImageElement,
  rotationDeg = 0,
  size = 640
): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return img.src;

  const isRotatedQuarter = Math.abs(rotationDeg % 180) === 90;
  const effW = isRotatedQuarter ? img.naturalHeight : img.naturalWidth;
  const effH = isRotatedQuarter ? img.naturalWidth : img.naturalHeight;

  const scale = Math.max(size / (effW || size), size / (effH || size));
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.94);
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

/**
 * Generates a high-contrast NexGen-branded QR code with Level-H (30%) error correction
 * and the official circular NexGen emblem cleanly framed in the center.
 */
async function generateBrandedQrDataUrl(data: string, size = 560): Promise<string> {
  const qrCanvas = document.createElement('canvas');
  qrCanvas.width = size;
  qrCanvas.height = size;

  await QRCode.toCanvas(qrCanvas, data, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: NAVY,
      light: '#FFFFFF'
    }
  });

  const ctx = qrCanvas.getContext('2d');
  const logoImg = await loadImage('/logo.png');

  if (ctx && logoImg) {
    const cx = size / 2;
    const cy = size / 2;
    // ~23% diameter stays safely inside Level-H 30% recovery budget without touching finder patterns
    const badgeRadius = size * 0.115;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle crisp outer navy ring around white center shield
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = Math.max(2, size * 0.0075);
    ctx.beginPath();
    ctx.arc(cx, cy, badgeRadius - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Inner logo fit cleanly inside circular shield
    const innerRadius = badgeRadius * 0.84;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.clip();
    drawContainImage(
      ctx,
      logoImg,
      cx - innerRadius,
      cy - innerRadius,
      innerRadius * 2,
      innerRadius * 2
    );
    ctx.restore();
  }

  return qrCanvas.toDataURL('image/png', 1.0);
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
    // Black circular badge with official layered cyan + magenta + white TikTok glyph
    ctx.fillStyle = '#010101';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const drawTikTokGlyph = (ox: number, oy: number, color: string) => {
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      const u = size / 24;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(2.4 * u, -6.4 * u);
      ctx.lineTo(5.0 * u, -6.4 * u);
      ctx.bezierCurveTo(5.3 * u, -4.3 * u, 6.7 * u, -2.9 * u, 8.6 * u, -2.7 * u);
      ctx.lineTo(8.6 * u, -0.1 * u);
      ctx.bezierCurveTo(6.9 * u, -0.1 * u, 5.4 * u, -0.7 * u, 4.3 * u, -1.6 * u);
      ctx.lineTo(4.3 * u, 3.6 * u);
      ctx.bezierCurveTo(4.3 * u, 6.5 * u, 2.0 * u, 8.6 * u, -0.8 * u, 8.6 * u);
      ctx.bezierCurveTo(-3.6 * u, 8.6 * u, -5.8 * u, 6.4 * u, -5.8 * u, 3.6 * u);
      ctx.bezierCurveTo(-5.8 * u, 0.7 * u, -3.5 * u, -1.5 * u, -0.4 * u, -1.4 * u);
      ctx.lineTo(-0.4 * u, 1.3 * u);
      ctx.bezierCurveTo(-1.8 * u, 1.2 * u, -3.0 * u, 2.2 * u, -3.0 * u, 3.6 * u);
      ctx.bezierCurveTo(-3.0 * u, 5.0 * u, -1.9 * u, 6.0 * u, -0.6 * u, 6.0 * u);
      ctx.bezierCurveTo(0.8 * u, 6.0 * u, 1.7 * u, 5.0 * u, 1.7 * u, 3.6 * u);
      ctx.lineTo(1.7 * u, -6.4 * u);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    drawTikTokGlyph(-size * 0.032, -size * 0.025, '#25F4EE');
    drawTikTokGlyph(size * 0.032, size * 0.025, '#FE2C55');
    drawTikTokGlyph(0, 0, '#FFFFFF');
  } else if (type === 'facebook') {
    // Official Facebook #1877F2 circle + crisp bottom-aligned white 'f' path
    ctx.fillStyle = '#1877F2';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(cx, cy);
    const u = size / 24;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(4.6 * u, 3.2 * u);
    ctx.lineTo(5.2 * u, -0.5 * u);
    ctx.lineTo(1.6 * u, -0.5 * u);
    ctx.lineTo(1.6 * u, -2.9 * u);
    ctx.bezierCurveTo(1.6 * u, -3.9 * u, 2.1 * u, -4.9 * u, 3.7 * u, -4.9 * u);
    ctx.lineTo(5.4 * u, -4.9 * u);
    ctx.lineTo(5.4 * u, -8.1 * u);
    ctx.bezierCurveTo(4.5 * u, -8.3 * u, 3.4 * u, -8.4 * u, 2.4 * u, -8.4 * u);
    ctx.bezierCurveTo(-0.8 * u, -8.4 * u, -2.7 * u, -6.5 * u, -2.7 * u, -3.1 * u);
    ctx.lineTo(-2.7 * u, -0.5 * u);
    ctx.lineTo(-5.8 * u, -0.5 * u);
    ctx.lineTo(-5.8 * u, 3.2 * u);
    ctx.lineTo(-2.7 * u, 3.2 * u);
    ctx.lineTo(-2.7 * u, 12.2 * u);
    ctx.lineTo(1.6 * u, 12.2 * u);
    ctx.lineTo(1.6 * u, 3.2 * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (type === 'instagram') {
    // Official Instagram multi-stop radial gradient + crisp white camera glyph
    const grad = ctx.createRadialGradient(
      cx - size * 0.25,
      cy + size * 0.35,
      size * 0.08,
      cx,
      cy,
      size * 0.85
    );
    grad.addColorStop(0, '#FDF497');
    grad.addColorStop(0.15, '#FDF497');
    grad.addColorStop(0.42, '#FD5949');
    grad.addColorStop(0.7, '#D6249F');
    grad.addColorStop(1, '#285AEB');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(cx - r, cy - r, size, size, size * 0.27);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = size * 0.085;
    ctx.beginPath();
    ctx.roundRect(cx - size * 0.31, cy - size * 0.31, size * 0.62, size * 0.62, size * 0.18);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.145, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx + size * 0.175, cy - size * 0.175, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'email') {
    // Official Gmail multi-color 'M' envelope badge
    const w = size * 1.06;
    const h = size * 0.78;
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    const u = w / 24;
    const v = h / 18;

    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(x0 - 1, y0 - 1, w + 2, h + 2, size * 0.12);
    ctx.fill();

    // Left blue bar
    ctx.fillStyle = '#4285F4';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 5.5 * v);
    ctx.lineTo(x0, y0 + 16.5 * v);
    ctx.quadraticCurveTo(x0, y0 + h, x0 + 2 * u, y0 + h);
    ctx.lineTo(x0 + 5.5 * u, y0 + h);
    ctx.lineTo(x0 + 5.5 * u, y0 + 9.2 * v);
    ctx.closePath();
    ctx.fill();

    // Right green bar
    ctx.fillStyle = '#34A853';
    ctx.beginPath();
    ctx.moveTo(x0 + w, y0 + 5.5 * v);
    ctx.lineTo(x0 + w, y0 + 16.5 * v);
    ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - 2 * u, y0 + h);
    ctx.lineTo(x0 + w - 5.5 * u, y0 + h);
    ctx.lineTo(x0 + w - 5.5 * u, y0 + 9.2 * v);
    ctx.closePath();
    ctx.fill();

    // Top-left dark red shoulder
    ctx.fillStyle = '#C5221F';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 3 * v);
    ctx.lineTo(x0, y0 + 6.2 * v);
    ctx.lineTo(x0 + 5.5 * u, y0 + 10 * v);
    ctx.lineTo(x0 + 5.5 * u, y0 + 4.4 * v);
    ctx.lineTo(x0 + 3.2 * u, y0 + 2.5 * v);
    ctx.quadraticCurveTo(x0, y0, x0, y0 + 3 * v);
    ctx.closePath();
    ctx.fill();

    // Top-right amber shoulder
    ctx.fillStyle = '#FBBC04';
    ctx.beginPath();
    ctx.moveTo(x0 + w, y0 + 3 * v);
    ctx.lineTo(x0 + w, y0 + 6.2 * v);
    ctx.lineTo(x0 + w - 5.5 * u, y0 + 10 * v);
    ctx.lineTo(x0 + w - 5.5 * u, y0 + 4.4 * v);
    ctx.lineTo(x0 + w - 3.2 * u, y0 + 2.5 * v);
    ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + 3 * v);
    ctx.closePath();
    ctx.fill();

    // Center red 'M' V-fold
    ctx.fillStyle = '#EA4335';
    ctx.beginPath();
    ctx.moveTo(x0 + 5.5 * u, y0 + 4.4 * v);
    ctx.lineTo(cx, y0 + 8.9 * v);
    ctx.lineTo(x0 + w - 5.5 * u, y0 + 4.4 * v);
    ctx.lineTo(x0 + w - 5.5 * u, y0 + 10 * v);
    ctx.lineTo(cx, y0 + 14.3 * v);
    ctx.lineTo(x0 + 5.5 * u, y0 + 10 * v);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
  onAvatarChange,
  isAdmin = false,
  oneTimeIssuance = false,
  isAlreadyIssued = false,
  isPhotoLocked = false,
  issuedAt,
  onUploadSinglePhoto,
  onIssueOfficialCard
}) => {
  const [step, setStep] = useState<ModalStep>(oneTimeIssuance && isAlreadyIssued ? 'preview' : 'photo');
  const [viewMode, setViewMode] = useState<CardViewMode>('dual');
  const [downloadingType, setDownloadingType] = useState<'pdf' | 'dual' | 'front' | 'back' | 'print' | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [customAvatar, setCustomAvatar] = useState<string>(volunteer.avatar || '');
  const [customPhone, setCustomPhone] = useState<string>(volunteer.phone || '');
  const [customCity, setCustomCity] = useState<string>(volunteer.city || 'Sialkot, Punjab Pakistan');
  // Default EVERY card's Designation / Role to "MEMBER NEXGEN COUNCIL"; only Admin side can edit it
  const [customRole, setCustomRole] = useState<string>(DEFAULT_CARD_ROLE);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoLocked, setLocalPhotoLocked] = useState<boolean>(false);
  const [localIssuedDone, setLocalIssuedDone] = useState<boolean>(false);
  const [localIssuedAt, setLocalIssuedAt] = useState<string | undefined>(issuedAt);
  const [issueError, setIssueError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isLockedPublicClaim = oneTimeIssuance && (isAlreadyIssued || localIssuedDone);
  const isSingleUploadLocked = oneTimeIssuance && (isPhotoLocked || localPhotoLocked || isLockedPublicClaim);

  useEffect(() => {
    setCustomAvatar(volunteer.avatar || '');
    setCustomPhone(volunteer.phone || '');
    setCustomCity(volunteer.city || 'Sialkot, Punjab Pakistan');
    setCustomRole(DEFAULT_CARD_ROLE);
    setLocalIssuedAt(issuedAt);
    setLocalPhotoLocked(Boolean(isPhotoLocked));
    if (oneTimeIssuance && isAlreadyIssued) {
      setStep('preview');
    }
  }, [volunteer, oneTimeIssuance, isAlreadyIssued, isPhotoLocked, issuedAt]);

  const idCode =
    ('referenceCode' in volunteer && volunteer.referenceCode) ||
    (volunteer.id?.startsWith('vol_')
      ? `NG-VOL-${volunteer.id.slice(-6).toUpperCase()}`
      : `NXG-${new Date().getFullYear()}-${(volunteer.id || '3104').slice(-4).toUpperCase()}`);

  const formattedName = toTitleCaseName(volunteer.fullName);
  const roleLabel = (isAdmin ? customRole || DEFAULT_CARD_ROLE : DEFAULT_CARD_ROLE).toUpperCase();
  const verificationUrl = `https://nexgencouncil.bond/track?code=${encodeURIComponent(idCode)}`;
  const displayAvatar = customAvatar || '';
  const initials = formattedName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    let active = true;
    generateBrandedQrDataUrl(verificationUrl, 560)
      .then(url => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        QRCode.toDataURL(verificationUrl, {
          width: 560,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: NAVY, light: '#FFFFFF' }
        })
          .then(fallbackUrl => {
            if (active) setQrDataUrl(fallbackUrl);
          })
          .catch(() => {});
      });
    return () => {
      active = false;
    };
  }, [verificationUrl]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<boolean> => {
    const file = e.target.files?.[0];
    if (!file) return false;
    if (oneTimeIssuance && isSingleUploadLocked) {
      setIssueError('Only a single portrait photograph upload is allowed per member.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return false;
    }

    setUploadingPhoto(true);
    setIssueError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      // Center-crop to crisp 1:1 square so circular frame fits cleanly regardless of uploaded aspect ratio
      const loaded = await loadImage(dataUrl);
      const finalImage = loaded ? drawSquareCenterCropDataUrl(loaded, 0, 680) : dataUrl;

      if (oneTimeIssuance && onUploadSinglePhoto) {
        const uploadRes = await onUploadSinglePhoto(finalImage);
        if (!uploadRes.ok) {
          setIssueError(uploadRes.error || 'Unable to lock uploaded portrait photograph.');
          return false;
        }
        const resolvedUrl = uploadRes.photoUrl || finalImage;
        setCustomAvatar(resolvedUrl);
        setLocalPhotoLocked(true);
        if (onAvatarChange) {
          onAvatarChange(resolvedUrl);
        }
        return true;
      }

      setCustomAvatar(finalImage);
      if (onAvatarChange) {
        onAvatarChange(finalImage);
      }
      return true;
    } catch {
      setIssueError('Unable to read the selected image file. Please try a PNG, JPG, or WEBP photo.');
      return false;
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRotatePhoto = async () => {
    if (!displayAvatar || (oneTimeIssuance && isSingleUploadLocked)) return;
    setUploadingPhoto(true);
    try {
      const loaded = await loadImage(displayAvatar);
      if (loaded) {
        const rotated = drawSquareCenterCropDataUrl(loaded, 90, 680);
        setCustomAvatar(rotated);
        if (onAvatarChange) {
          onAvatarChange(rotated);
        }
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  /**
   * Page 1 (Front) — Exact matching PDF geometry with Circular Portrait, Full Uncropped Logo, and Title Case Name
   */
  const paintFrontCard = (
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    cw: number,
    ch: number,
    logoImg: HTMLImageElement | null,
    avatarImg: HTMLImageElement | null
  ) => {
    const s = cw / 1000;
    ctx.save();
    ctx.translate(ox, oy);

    // Crisp White Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    // Left Deep Navy Architectural Band (0 .. 154*s) with diagonal cut
    const leftW = 154 * s;
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leftW, 0);
    ctx.lineTo(leftW, 1140 * s);
    ctx.lineTo(0, 1295 * s);
    ctx.closePath();
    ctx.fill();

    // Thin White Vertical Line inside Left Navy Band
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(79 * s, 495 * s, 10 * s, 118 * s);

    // Parallel Diagonal Navy Stripe underneath white cut
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.moveTo(0, 1340 * s);
    ctx.lineTo(leftW, 1185 * s);
    ctx.lineTo(leftW, 1260 * s);
    ctx.lineTo(0, 1415 * s);
    ctx.closePath();
    ctx.fill();

    // Bottom-Left 4x4 Navy Dot Grid
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

    // Top Brand Header: FULL Uncropped Logo + Vertical Gold Rule + NexGen Title
    const headerX = 278 * s;
    const headerY = 66 * s;
    if (logoImg) {
      drawContainImage(ctx, logoImg, headerX, headerY, 186 * s, 186 * s);
    }

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(headerX + 196 * s, headerY + 34 * s);
    ctx.lineTo(headerX + 196 * s, headerY + 150 * s);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `800 ${60 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('NexGen', headerX + 208 * s, headerY + 86 * s);

    ctx.font = `700 ${24 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Women Empowerment', headerX + 210 * s, headerY + 120 * s);
    ctx.fillText('And Youth Leadership Council', headerX + 210 * s, headerY + 148 * s);

    // Centered Circular Portrait Photo (550px diameter)
    const circleRadius = 272 * s;
    const circleCx = 562 * s;
    const circleCy = 626 * s;

    // Subtle soft drop shadow + crisp circular frame
    ctx.save();
    ctx.shadowColor = 'rgba(22, 42, 77, 0.14)';
    ctx.shadowBlur = 24 * s;
    ctx.shadowOffsetY = 8 * s;
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (avatarImg) {
      drawCoverImageCircle(ctx, avatarImg, circleCx, circleCy, circleRadius);
    } else {
      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = NAVY;
      ctx.textAlign = 'center';
      ctx.font = `800 ${150 * s}px "Playfair Display", Georgia, serif`;
      ctx.fillText(initials, circleCx, circleCy + 52 * s);
    }

    // Crisp outer ring around circle photo
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleRadius + 8 * s, 0, Math.PI * 2);
    ctx.stroke();

    // Member Full Name (Title Case: First letter of every word capitalized)
    const contentLeftX = 274 * s;
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `800 ${54 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(formattedName, contentLeftX, 1018 * s, cw - contentLeftX - 42 * s);

    // Short Thick Navy Accent Bar
    ctx.fillStyle = NAVY;
    ctx.fillRect(contentLeftX, 1052 * s, 154 * s, 10 * s);

    // Role / Designation (Default: MEMBER NEXGEN COUNCIL)
    ctx.fillStyle = '#1E293B';
    ctx.font = `500 ${29 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(roleLabel, contentLeftX, 1124 * s, cw - contentLeftX - 42 * s);

    // Aligned Metadata Details (ID, City, Phone)
    const labelX = 342 * s;
    const colonX = 446 * s;
    const valX = 468 * s;
    const rows: [string, string][] = [
      ['ID', idCode],
      ['City', customCity || 'National Chapter'],
      ['Phone', customPhone || 'Verified Member']
    ];

    rows.forEach(([label, val], idx) => {
      const y = (1236 + idx * 64) * s;
      ctx.fillStyle = '#1E293B';
      ctx.font = `500 ${28 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(label, labelX, y);
      ctx.fillText(':', colonX, y);
      ctx.fillText(val, valX, y, cw - valX - 42 * s);
    });

    ctx.restore();
  };

  /**
   * Page 2 (Back) — Exact matching PDF geometry with FULL Uncropped Logo & Clean Signature
   */
  const paintBackCard = (
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    cw: number,
    ch: number,
    logoImg: HTMLImageElement | null,
    qrImg: HTMLImageElement | null,
    signatureImg: HTMLImageElement | null
  ) => {
    const s = cw / 1000;
    ctx.save();
    ctx.translate(ox, oy);

    // Pure White Canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    // Centered FULL Uncropped Logo at Top
    if (logoImg) {
      drawContainImage(ctx, logoImg, cw / 2 - 178 * s, 40 * s, 356 * s, 330 * s);
    }

    // Organization Full Name Centered Under Logo
    ctx.textAlign = 'center';
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${31 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('NexGen Women Empowerment', cw / 2, 400 * s);
    ctx.fillText('And Youth Leadership Council', cw / 2, 438 * s);

    // Short Centered Navy Divider Bar
    ctx.fillStyle = NAVY;
    ctx.fillRect(cw / 2 - 64 * s, 480 * s, 128 * s, 10 * s);

    // Social Media Channels List
    const socialItems: Array<{ type: 'tiktok' | 'facebook' | 'instagram' | 'email'; text: string[] }> = [
      { type: 'tiktok', text: ['@nextgen.womenempowerment'] },
      { type: 'facebook', text: ['Nex Gen Council'] },
      { type: 'instagram', text: ['nexgen.womenleadership.council'] },
      { type: 'email', text: ['nexgenwomenempowermentand', 'youth@gmail.com'] }
    ];

    const socialIconX = 198 * s;
    const socialTextX = 258 * s;
    socialItems.forEach((item, idx) => {
      const y = 546 * s + idx * 66 * s;
      drawSocialIconOnCanvas(ctx, item.type, socialIconX, y, 40 * s);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1E293B';
      ctx.font = `400 ${25 * s}px "Plus Jakarta Sans", sans-serif`;
      if (item.text.length === 1) {
        ctx.fillText(item.text[0], socialTextX, y + 8 * s);
      } else {
        ctx.fillText(item.text[0], socialTextX, y - 6 * s);
        ctx.fillText(item.text[1], socialTextX, y + 24 * s);
      }
    });

    // Horizontal Grey Divider with Centered Navy Accent Bar
    ctx.fillStyle = '#B8B2A6';
    ctx.fillRect(102 * s, 824 * s, cw - 204 * s, 5 * s);
    ctx.fillStyle = NAVY;
    ctx.fillRect(cw / 2 - 78 * s, 820 * s, 156 * s, 13 * s);

    // Contact Details with Navy Rounded-Square Icon Tiles
    const contacts: Array<{ type: 'pin' | 'globe' | 'phone'; label: string; value: string; bold?: boolean }> = [
      { type: 'pin', label: 'Address', value: 'Sialkot,Punjab Pakistan' },
      { type: 'globe', label: 'Website', value: 'Nexgencouncil.bond', bold: true },
      { type: 'phone', label: 'Phone', value: '+923454001714', bold: true }
    ];

    contacts.forEach((c, idx) => {
      const y = 876 * s + idx * 82 * s;
      drawNavyContactTile(ctx, c.type, 146 * s, y, 58 * s);

      ctx.textAlign = 'left';
      ctx.fillStyle = NAVY;
      ctx.font = `700 ${25 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(c.label, 240 * s, y + 38 * s);

      ctx.fillStyle = '#1E293B';
      ctx.font = c.bold
        ? `700 ${25 * s}px "Plus Jakarta Sans", sans-serif`
        : `400 ${25 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(c.value, 424 * s, y + 38 * s);
    });

    // Enlarged High-Contrast Verification QR Badge with NexGen Logo + Director Signature
    if (qrImg) {
      const qrBoxX = 104 * s;
      const qrBoxY = 1128 * s;
      const qrBoxW = 224 * s;
      const qrBoxH = 250 * s;

      ctx.save();
      ctx.shadowColor = 'rgba(22, 42, 77, 0.08)';
      ctx.shadowBlur = 14 * s;
      ctx.shadowOffsetY = 4 * s;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 18 * s);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 18 * s);
      ctx.stroke();

      drawContainImage(ctx, qrImg, qrBoxX + 15 * s, qrBoxY + 12 * s, 194 * s, 194 * s);

      ctx.textAlign = 'center';
      ctx.fillStyle = NAVY;
      ctx.font = `800 ${14.5 * s}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText('SCAN TO VERIFY', qrBoxX + qrBoxW / 2, qrBoxY + 230 * s);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748B';
    ctx.font = `700 ${14 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('OFFICIAL CREDENTIAL ID', 896 * s, 1148 * s);
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${23 * s}px monospace`;
    ctx.fillText(idCode, 896 * s, 1178 * s);
    ctx.fillStyle = '#64748B';
    ctx.font = `500 ${14.5 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Verify at nexgencouncil.bond/track', 896 * s, 1202 * s);

    if (signatureImg) {
      drawContainImage(ctx, signatureImg, 646 * s, 1226 * s, 250 * s, 48 * s);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${21 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Minahil Imran Awan', 896 * s, 1316 * s);
    ctx.fillStyle = '#64748B';
    ctx.font = `500 ${15 * s}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('Founder & Director, NexGen Women Empowerment', 896 * s, 1340 * s);

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

    // Accent deep-navy step on far bottom-right
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
    const freshQrDataUrl = await generateBrandedQrDataUrl(verificationUrl, 560);

    return Promise.all([
      loadImage('/logo.png'),
      loadImage(displayAvatar),
      loadImage(freshQrDataUrl)
    ]);
  };

  const commitPublicOneTimeClaim = async (
    format: 'pdf' | 'dual' | 'front' | 'print'
  ): Promise<boolean> => {
    if (!oneTimeIssuance) return true;
    if (isLockedPublicClaim) {
      setIssueError('Your Official Member ID Card has already been issued and locked. Only one download is permitted per member.');
      return false;
    }
    if (!displayAvatar) {
      setIssueError('Please upload a portrait photograph before generating and downloading your Official ID Card.');
      setStep('photo');
      return false;
    }
    if (!onIssueOfficialCard) return true;

    setIssueError(null);
    const result = await onIssueOfficialCard({
      photoDataUrl: displayAvatar,
      city: customCity,
      phone: customPhone,
      format
    });

    if (!result.ok) {
      setIssueError(result.error || 'Could not record ID card issuance. Please try again.');
      return false;
    }

    if (result.photoUrl) {
      setCustomAvatar(result.photoUrl);
    }
    setLocalIssuedDone(true);
    setLocalIssuedAt(result.issuedAt || new Date().toISOString());
    return true;
  };

  const handleDownloadPdf = async () => {
    if (isLockedPublicClaim) return;
    setDownloadingType('pdf');
    setIssueError(null);
    try {
      const canProceed = await commitPublicOneTimeClaim('pdf');
      if (!canProceed) return;

      const [logoImg, avatarImg, qrImg] = await renderCardCanvasImages();
      const signatureImg = await loadImage('/assets/minahil_signature.png');
      const cardW = 1000;
      const cardH = 1620;

      const frontCanvas = document.createElement('canvas');
      frontCanvas.width = cardW;
      frontCanvas.height = cardH;
      const fctx = frontCanvas.getContext('2d');
      if (fctx) {
        paintFrontCard(fctx, 0, 0, cardW, cardH, logoImg, avatarImg);
      }

      const backCanvas = document.createElement('canvas');
      backCanvas.width = cardW;
      backCanvas.height = cardH;
      const bctx = backCanvas.getContext('2d');
      if (bctx) {
        paintBackCard(bctx, 0, 0, cardW, cardH, logoImg, qrImg, signatureImg);
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 162]
      });

      pdf.setProperties({
        title: `${formattedName} - NexGen Official ID Card`,
        subject: idCode,
        creator: 'NexGen Council Official Issuance System',
        keywords: `NexGen Council, ${idCode}, ${verificationUrl}`
      });

      pdf.addImage(frontCanvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, 100, 162, undefined, 'FAST');
      pdf.addPage([100, 162], 'portrait');
      pdf.addImage(backCanvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, 100, 162, undefined, 'FAST');

      const safeName = formattedName.replace(/[^a-z0-9]+/gi, '_');
      pdf.save(`${safeName}_Member_NexGen_Card.pdf`);
    } catch {
      if (!oneTimeIssuance) {
        window.print();
      }
    } finally {
      setDownloadingType(null);
    }
  };

  const handleDownloadPng = async (mode: 'dual' | 'front' | 'back') => {
    if (isLockedPublicClaim) return;
    setDownloadingType(mode);
    setIssueError(null);
    try {
      if (mode === 'dual' || mode === 'front') {
        const canProceed = await commitPublicOneTimeClaim(mode);
        if (!canProceed) return;
      }

      const [logoImg, avatarImg, qrImg] = await renderCardCanvasImages();
      const signatureImg = await loadImage('/assets/minahil_signature.png');
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
        ctx.fillText(`Official Member Credential · ${formattedName}`, canvas.width / 2, 98);

        paintFrontCard(ctx, marginX, headerH, cardW, cardH, logoImg, avatarImg);
        paintBackCard(ctx, marginX + cardW + gap, headerH, cardW, cardH, logoImg, qrImg, signatureImg);

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
          paintFrontCard(ctx, 0, 0, cardW, cardH, logoImg, avatarImg);
        } else {
          paintBackCard(ctx, 0, 0, cardW, cardH, logoImg, qrImg, signatureImg);
        }
      }

      const safeName = formattedName.replace(/[^a-z0-9]+/gi, '_');
      const suffix = mode === 'dual' ? 'Full_Card' : mode === 'front' ? 'Front_Card' : 'Back_Card';
      const link = document.createElement('a');
      link.download = `${safeName}_NexGen_${suffix}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch {
      if (!oneTimeIssuance) {
        window.print();
      }
    } finally {
      setDownloadingType(null);
    }
  };

  const handlePrintCard = async () => {
    if (isLockedPublicClaim) return;
    setDownloadingType('print');
    setIssueError(null);
    try {
      const canProceed = await commitPublicOneTimeClaim('print');
      if (!canProceed) return;
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
      <div className="pl-[25%] pr-4 pt-5 pb-6 flex-1 flex flex-col justify-between relative z-10">
        {/* Top Brand Header with FULL Uncropped Logo */}
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="NexGen Council"
            className="w-16 h-16 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="border-l border-amber-500/80 pl-2 min-w-0">
            <h4 className="font-extrabold text-[21px] leading-none tracking-tight text-[#162A4D]">NexGen</h4>
            <p className="text-[8.5px] font-bold text-[#162A4D] leading-tight mt-0.5">
              Women Empowerment
              <br />
              And Youth Leadership Council
            </p>
          </div>
        </div>

        {/* Circular Cropped Member Portrait Photo */}
        <div className="my-2 flex justify-center">
          <div className="w-[192px] h-[192px] rounded-full p-1 bg-gradient-to-br from-[#C89B2B] via-amber-200 to-[#162A4D] shadow-lg shrink-0">
            <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 border-2 border-[#162A4D] flex items-center justify-center">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={formattedName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="font-serif font-bold text-5xl text-[#162A4D]">{initials}</span>
              )}
            </div>
          </div>
        </div>

        {/* Member Name (Title Case), Navy Bar & Role */}
        <div className="space-y-2 text-left">
          <h3 className="font-extrabold text-[19px] leading-tight tracking-tight text-[#162A4D] break-words">
            {formattedName}
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
      {/* Top Center FULL Uncropped Logo & Title */}
      <div className="pt-3 px-5 flex flex-col items-center text-center">
        <img
          src="/logo.png"
          alt="NexGen Council"
          className="w-24 h-24 object-contain"
          referrerPolicy="no-referrer"
        />
        <h4 className="font-bold text-[11.5px] text-[#162A4D] leading-tight mt-0.5">
          NexGen Women Empowerment
          <br />
          And Youth Leadership Council
        </h4>
        <div className="w-12 h-1 bg-[#162A4D] mt-2.5" />
      </div>

      {/* Social Media Channels */}
      <div className="px-8 space-y-2 text-[9.5px] text-slate-800">
        <div className="flex items-center gap-2.5">
          {/* Official TikTok Badge */}
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 shrink-0" aria-label="TikTok">
            <circle cx="12" cy="12" r="12" fill="#010101" />
            <path
              d="M14.1 6.2h2.2c.25 1.8 1.4 3 3.1 3.2v2.2c-1.4 0-2.7-.5-3.6-1.3v4.4c0 2.5-1.9 4.3-4.3 4.3-2.4 0-4.3-1.9-4.3-4.3 0-2.5 2-4.4 4.6-4.3v2.3c-1.2-.1-2.2.8-2.2 2s1 2 2.1 2c1.2 0 2-.8 2-2.1V6.2z"
              fill="#25F4EE"
              transform="translate(-0.7,-0.5)"
            />
            <path
              d="M14.1 6.2h2.2c.25 1.8 1.4 3 3.1 3.2v2.2c-1.4 0-2.7-.5-3.6-1.3v4.4c0 2.5-1.9 4.3-4.3 4.3-2.4 0-4.3-1.9-4.3-4.3 0-2.5 2-4.4 4.6-4.3v2.3c-1.2-.1-2.2.8-2.2 2s1 2 2.1 2c1.2 0 2-.8 2-2.1V6.2z"
              fill="#FE2C55"
              transform="translate(0.7,0.5)"
            />
            <path
              d="M14.1 6.2h2.2c.25 1.8 1.4 3 3.1 3.2v2.2c-1.4 0-2.7-.5-3.6-1.3v4.4c0 2.5-1.9 4.3-4.3 4.3-2.4 0-4.3-1.9-4.3-4.3 0-2.5 2-4.4 4.6-4.3v2.3c-1.2-.1-2.2.8-2.2 2s1 2 2.1 2c1.2 0 2-.8 2-2.1V6.2z"
              fill="#FFFFFF"
            />
          </svg>
          <span className="truncate">@nextgen.womenempowerment</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Official Facebook Badge */}
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 shrink-0" aria-label="Facebook">
            <circle cx="12" cy="12" r="12" fill="#1877F2" />
            <path
              d="M15.8 15.1l.55-3.5h-3.35V9.3c0-.96.47-1.9 1.98-1.9h1.53V4.42S15.12 4.18 13.8 4.18c-2.77 0-4.58 1.68-4.58 4.72v2.7H6.15v3.5h3.07V24h3.78v-8.9h2.8z"
              fill="#FFFFFF"
            />
          </svg>
          <span className="truncate">Nex Gen Council</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Official Instagram Badge */}
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 shrink-0" aria-label="Instagram">
            <defs>
              <radialGradient id="igGradCard" cx="30%" cy="107%" r="150%">
                <stop offset="0%" stopColor="#FDF497" />
                <stop offset="15%" stopColor="#FDF497" />
                <stop offset="45%" stopColor="#FD5949" />
                <stop offset="70%" stopColor="#D6249F" />
                <stop offset="100%" stopColor="#285AEB" />
              </radialGradient>
            </defs>
            <rect width="24" height="24" rx="6.5" fill="url(#igGradCard)" />
            <rect x="4.5" y="4.5" width="15" height="15" rx="4.2" stroke="#FFFFFF" strokeWidth="1.9" fill="none" />
            <circle cx="12" cy="12" r="3.4" stroke="#FFFFFF" strokeWidth="1.9" fill="none" />
            <circle cx="16.3" cy="7.7" r="1.05" fill="#FFFFFF" />
          </svg>
          <span className="truncate">nexgen.womenleadership.council</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Official Email Icon */}
          <svg
            viewBox="0 0 24 24"
            className="w-4.5 h-4.5 shrink-0"
            aria-label="Email"
            fill="none"
            stroke="#162A4D"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m4 7 8 6 8-6" />
          </svg>
          <span className="leading-tight break-all text-[9px]">info@nexgencouncil.bond</span>
        </div>
      </div>

      {/* Horizontal Divider */}
      <div className="px-7 relative flex items-center justify-center">
        <div className="w-full h-[2px] bg-stone-300" />
        <div className="absolute w-14 h-1.5 bg-[#162A4D]" />
      </div>

      {/* Contact Block */}
      <div className="px-7 space-y-2 text-[9.5px] text-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="w-5.5 h-5.5 rounded-md bg-[#162A4D] text-white flex items-center justify-center shrink-0">
            <MapPin className="w-3 h-3" />
          </span>
          <div className="grid grid-cols-[54px_1fr] flex-1 items-center">
            <strong className="text-[#162A4D]">Address</strong>
            <span>Sialkot,Punjab Pakistan</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-5.5 h-5.5 rounded-md bg-[#162A4D] text-white flex items-center justify-center shrink-0">
            <Globe className="w-3 h-3" />
          </span>
          <div className="grid grid-cols-[54px_1fr] flex-1 items-center">
            <strong className="text-[#162A4D]">Website</strong>
            <strong className="text-slate-900">Nexgencouncil.bond</strong>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-5.5 h-5.5 rounded-md bg-[#162A4D] text-white flex items-center justify-center shrink-0">
            <Phone className="w-3 h-3" />
          </span>
          <div className="grid grid-cols-[54px_1fr] flex-1 items-center">
            <strong className="text-[#162A4D]">Phone</strong>
            <strong className="text-slate-900">+923454001714</strong>
          </div>
        </div>
      </div>

      {/* Enlarged Branded Verification QR Card & Director Signature */}
      <div className="px-6 flex items-end justify-between gap-2 pt-1">
        <div className="flex flex-col items-center p-1.5 rounded-lg bg-white border border-slate-300 shadow-xs shrink-0">
          {qrDataUrl && <img src={qrDataUrl} alt="Credential Verification QR" className="w-[70px] h-[70px] object-contain" />}
          <span className="text-[6.5px] font-extrabold tracking-wider text-[#162A4D] mt-0.5 uppercase">
            Scan to Verify
          </span>
        </div>
        <div className="text-right min-w-0 flex-1">
          <p className="text-[6.5px] font-bold tracking-wider text-slate-400 uppercase leading-none">
            Credential ID
          </p>
          <p className="text-[9px] font-mono font-bold text-[#162A4D] truncate mt-0.5">
            {idCode}
          </p>
          <img
            src="/assets/minahil_signature.png"
            alt="Minahil Imran Awan signature"
            className="w-28 h-6 object-contain ml-auto mt-1"
          />
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
                {formattedName} · {idCode}
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

        {issueError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs flex items-start gap-2.5 print:hidden">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{issueError}</span>
          </div>
        )}

        {isLockedPublicClaim && (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white">
                  Official ID Card Issued &amp; Saved to Council Records
                </p>
                <p className="text-emerald-200/90 mt-0.5">
                  One-time issuance completed
                  {localIssuedAt
                    ? ` on ${new Date(localIssuedAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}`
                    : ''}
                  . Your uploaded portrait and membership details are permanently archived by the Secretariat.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-emerald-400/30 text-emerald-300 font-semibold whitespace-nowrap shrink-0">
              <Lock className="w-3.5 h-3.5" />
              <span>Claim Locked</span>
            </span>
          </div>
        )}

        {step === 'photo' && !isLockedPublicClaim ? (
          /* STEP 1: Mandatory Circular Portrait Photo Upload & Details Verification */
          <div className="py-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Circular Portrait Upload Preview Box */}
              <div className="md:col-span-5 flex flex-col items-center space-y-3">
                <div className="w-52 h-52 rounded-full bg-slate-950 border-2 border-dashed border-amber-400/60 overflow-hidden flex flex-col items-center justify-center relative shadow-xl group">
                  {displayAvatar ? (
                    <>
                      <img
                        src={displayAvatar}
                        alt={formattedName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {!isSingleUploadLocked && (
                        <label className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-semibold gap-1.5 cursor-pointer">
                          <Camera className="w-6 h-6 text-amber-300" />
                          <span>Replace Photo</span>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple={false}
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handlePhotoUpload}
                            disabled={uploadingPhoto}
                            className="hidden"
                          />
                        </label>
                      )}
                    </>
                  ) : !isSingleUploadLocked ? (
                    <label className="w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-slate-900/80 transition-colors space-y-2">
                      <div className="w-12 h-12 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white">Upload Portrait</p>
                        <p className="text-[10.5px] text-slate-400 leading-snug">
                          Single image upload · Auto-crops to circular ID portrait
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple={false}
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                    </label>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                      <Lock className="w-6 h-6 text-emerald-400" />
                      <p className="text-xs font-semibold text-slate-300">Photo Upload Locked</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isSingleUploadLocked ? (
                    <span className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Single Portrait Uploaded &amp; Locked</span>
                    </span>
                  ) : (
                    <>
                      <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                        <Camera className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {uploadingPhoto
                            ? 'Uploading...'
                            : displayAvatar
                            ? 'Change Photo'
                            : 'Select Photo'}
                        </span>
                        <input
                          type="file"
                          multiple={false}
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handlePhotoUpload}
                          disabled={uploadingPhoto}
                          className="hidden"
                        />
                      </label>

                      {displayAvatar && (
                        <button
                          type="button"
                          onClick={handleRotatePhoto}
                          disabled={uploadingPhoto}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                          title="Rotate portrait 90 degrees"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                          <span>Rotate</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Card Details Confirmation */}
              <div className="md:col-span-7 space-y-4 text-left">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <ImageIcon className="w-4 h-4" />
                    <span>Step 1 of 2 · Circular Portrait &amp; Details</span>
                  </div>
                  <h4 className="text-xl font-serif font-bold text-white">
                    {displayAvatar
                      ? 'Circular Portrait Ready for NexGen ID Card'
                      : 'Add Member Portrait Photo to Continue'}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Any image you upload for <strong className="text-slate-200">{formattedName}</strong> is automatically
                    centered and cropped into a clean circle for the official 2-page PDF card.
                  </p>
                  {oneTimeIssuance && (
                    <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3 py-2 leading-relaxed">
                      <strong>One-Time Single Photo &amp; Issuance:</strong> Only one portrait photograph may be uploaded per member. Once uploaded, your image is immediately locked and your Official ID Card can be downloaded once.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Designation / Role editable ONLY on Admin side */}
                  {isAdmin ? (
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 font-medium mb-1">
                        Designation / Role on Card (Admin Override)
                      </label>
                      <input
                        type="text"
                        value={customRole}
                        onChange={e => setCustomRole(e.target.value)}
                        placeholder={DEFAULT_CARD_ROLE}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  ) : (
                    <div className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Card Designation</span>
                      <span className="font-semibold text-amber-300 tracking-wide">{DEFAULT_CARD_ROLE}</span>
                    </div>
                  )}

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
                      <span>Preview Official ID Card</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : !isSingleUploadLocked ? (
                    <>
                      <label className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-lg transition-colors">
                        <Upload className="w-4 h-4" />
                        <span>{uploadingPhoto ? 'Uploading & Locking...' : 'Upload Photo & Continue'}</span>
                        <input
                          type="file"
                          multiple={false}
                          accept="image/png,image/jpeg,image/webp"
                          onChange={async e => {
                            const ok = await handlePhotoUpload(e);
                            if (ok) setStep('preview');
                          }}
                          disabled={uploadingPhoto}
                          className="hidden"
                        />
                      </label>
                      {!oneTimeIssuance && (
                        <button
                          type="button"
                          onClick={() => setStep('preview')}
                          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
                        >
                          Continue without Photo
                        </button>
                      )}
                    </>
                  ) : null}
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

              {!isLockedPublicClaim && (
                <button
                  type="button"
                  onClick={() => setStep('photo')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {isSingleUploadLocked ? (
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>
                    {isSingleUploadLocked
                      ? 'Edit City / Phone'
                      : displayAvatar
                      ? 'Change Photo / Details'
                      : 'Add Portrait Photo'}
                  </span>
                </button>
              )}
            </div>

            <div className="py-2 flex flex-col lg:flex-row items-center justify-center gap-6 print:flex-row print:gap-6">
              {(viewMode === 'front' || viewMode === 'dual') && renderFrontCard()}
              {(viewMode === 'back' || viewMode === 'dual') && renderBackCard()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-slate-800 print:hidden">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingType !== null || isLockedPublicClaim}
                className="py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isLockedPublicClaim ? <Lock className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                <span>
                  {isLockedPublicClaim
                    ? 'Issued Once (Locked)'
                    : downloadingType === 'pdf'
                    ? 'Saving & Creating PDF...'
                    : 'Download Official PDF'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPng('dual')}
                  disabled={downloadingType !== null || isLockedPublicClaim}
                  className="py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>{downloadingType === 'dual' ? '...' : 'Dual PNG'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPng('front')}
                  disabled={downloadingType !== null || isLockedPublicClaim}
                  className="py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>{downloadingType === 'front' ? '...' : 'Front PNG'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handlePrintCard}
                disabled={downloadingType !== null || isLockedPublicClaim}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Printer className="w-4 h-4 text-slate-300" />
                <span>{downloadingType === 'print' ? 'Saving...' : 'Print Card'}</span>
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
