import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { EmailImage, EmailButton, EmailLog } from '../../types.ts';
import {
  Send,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Edit3,
  FileText,
  Sparkles,
  Users,
  History,
  Save,
  Search,
  RefreshCw,
  Trash2,
  X,
  RotateCcw,
  AtSign,
  UserCheck,
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  ArrowUp,
  ArrowDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RemoveFormatting,
  Lock,
  ExternalLink,
  Plus
} from 'lucide-react';

interface EmailPreset {
  id: string;
  label: string;
  subject: string;
  message: string;
}

const DEFAULT_COUNCIL_LOGO_URL = 'https://i.postimg.cc/5yM8rqz0/logo-(1).png';

const EMAIL_PRESETS: EmailPreset[] = [
  {
    id: 'custom',
    label: 'Custom Message',
    subject: '',
    message: ''
  },
  {
    id: 'official_test',
    label: 'Official Verification Test (Logo Check)',
    subject: '[Verification Test] Official Email System Check — NexGen Council',
    message: `Respected Officials & Executive Committee Members,\n\nThis is an official test dispatch sent from the NexGen Council communication portal (https://nexgencouncil.bond) to verify domain authentication, inbox delivery, and branding quality.\n\nPlease confirm the following:\n1. This email arrived directly in your primary Inbox (not Spam/Junk).\n2. The official NexGen Council logo and sender identity appear properly.\n3. Replying to this message routes cleanly back to our secretariat.\n\nKindly reply with "Received & Verified" once you have reviewed this message.\n\nWarm regards,\nExecutive Secretariat\nNexGen Women Empowerment & Youth Leadership Council`
  },
  {
    id: 'announcement',
    label: 'Official Announcement',
    subject: 'Official Announcement from NexGen Council',
    message: `Dear Member,\n\nWe are pleased to share an important update from the Executive Secretariat of NexGen Women Empowerment & Youth Leadership Council.\n\n[Write your announcement details here]\n\nPlease visit our portal at https://nexgencouncil.bond for full schedules and program resources.\n\nWarm regards,\nExecutive Secretariat\nNexGen Council`
  },
  {
    id: 'welcome',
    label: 'Welcome Email',
    subject: 'Welcome to NexGen Council — Membership & Onboarding',
    message: `Dear Changemaker,\n\nWelcome to NexGen Women Empowerment & Youth Leadership Council! We are delighted to have you join our community of emerging leaders, mentors, and civic advocates.\n\nOver the coming weeks, our coordinators will share cohort details, orientation schedules, and community initiatives you can participate in right away.\n\nIf you have any questions, simply reply directly to this email.\n\nWarm regards,\nNexGen Council Team\nhttps://nexgencouncil.bond`
  },
  {
    id: 'meeting',
    label: 'Council Meeting Invitation',
    subject: 'Invitation: NexGen Council Strategy & Leadership Briefing',
    message: `Dear Colleague,\n\nYou are cordially invited to attend an upcoming online leadership briefing hosted by NexGen Council.\n\nDate & Time: [Insert Date & Time]\nMeeting Link: https://nexgencouncil.bond/room/[MEETING-CODE]\n\nPlease join 5 minutes ahead of schedule to verify your audio and video setup.\n\nBest regards,\nNexGen Council Secretariat`
  }
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFIED_DOMAIN = 'nexgencouncil.bond';

function isValidEmailImageInput(url: string): boolean {
  const clean = url.trim();
  if (!clean) return false;
  if (clean.startsWith('/') && !clean.startsWith('//')) return true;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidEmailButtonUrl(url: string): boolean {
  const clean = url.trim();
  if (!clean) return false;
  if (clean.startsWith('/')) return true;
  try {
    const parsed = new URL(clean);
    return (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    );
  } catch {
    return false;
  }
}

function resolveButtonPreviewUrl(url: string, siteUrl?: string): string {
  const clean = url.trim();
  if (clean.startsWith('/')) {
    const base = (siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://nexgencouncil.bond')).replace(/\/+$/, '');
    return `${base}${clean}`;
  }
  return clean;
}

const EMAIL_BUTTON_PRESETS: { label: string; url: string; style: 'amber' | 'primary' | 'outline' }[] = [
  { label: 'Visit NexGen Website', url: 'https://nexgencouncil.bond', style: 'amber' },
  { label: 'Apply as Volunteer', url: '/volunteer', style: 'amber' },
  { label: 'View Programs', url: '/programs', style: 'primary' },
  { label: 'Track Application', url: '/track', style: 'outline' },
  { label: 'Contact Secretariat', url: '/contact', style: 'outline' }
];

async function parseJsonResponse<T = any>(res: Response): Promise<T> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status} with an empty response.`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    if (res.status === 413 || trimmed.includes('413') || trimmed.toLowerCase().includes('entity too large')) {
      throw new Error('Image is too large for the server proxy (HTTP 413). Please try a smaller image.');
    }
    if (trimmed.startsWith('<')) {
      throw new Error(`Server proxy returned HTML instead of JSON (HTTP ${res.status || 502}). Please retry or check server logs.`);
    }
    throw new Error(`Unexpected server response (HTTP ${res.status}).`);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(
  file: File,
  options: { maxDimension: number; preferPng?: boolean; maxDataUrlLength?: number }
): Promise<{ dataUrl: string; filename: string }> {
  const maxDataUrlLength = options.maxDataUrlLength ?? 720_000; // ~540KB binary, safely under Nginx 1MB default limit
  const rawDataUrl = await readFileAsDataUrl(file);

  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const isDirectRaster =
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'image/gif';

  // Keep small GIFs or already-small PNG/JPG files untouched
  if (file.type === 'image/gif' && rawDataUrl.length <= maxDataUrlLength) {
    return { dataUrl: rawDataUrl, filename: file.name };
  }
  if (rawDataUrl.length <= 450_000 && isDirectRaster) {
    return { dataUrl: rawDataUrl, filename: file.name };
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image file.'));
    el.src = rawDataUrl;
  });

  let width = img.naturalWidth || img.width || 600;
  let height = img.naturalHeight || img.height || 600;
  const maxDim = options.maxDimension;

  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: rawDataUrl, filename: file.name };
  }

  const drawAtSize = (w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  };

  drawAtSize(width, height);

  // If logo/transparent PNG or SVG preferred, try PNG first
  if ((options.preferPng && file.type === 'image/png') || isSvg) {
    const pngUrl = canvas.toDataURL('image/png');
    if (pngUrl.length <= maxDataUrlLength) {
      return { dataUrl: pngUrl, filename: file.name.replace(/\.[^.]+$/, '') + '.png' };
    }
    // Try smaller logo dimensions in PNG to keep transparency
    for (const dim of [360, 260, 200]) {
      const s = Math.min(1, dim / Math.max(width, height));
      drawAtSize(Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)));
      const smallerPng = canvas.toDataURL('image/png');
      if (smallerPng.length <= maxDataUrlLength) {
        return { dataUrl: smallerPng, filename: file.name.replace(/\.[^.]+$/, '') + '.png' };
      }
    }
  }

  // Fallback / standard email photos: JPEG compression (universally supported by Gmail & Outlook)
  drawAtSize(width, height);
  for (const quality of [0.85, 0.75, 0.65, 0.55]) {
    const jpegUrl = canvas.toDataURL('image/jpeg', quality);
    if (jpegUrl.length <= maxDataUrlLength) {
      return { dataUrl: jpegUrl, filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
    }
  }

  // Final resize pass if dimensions were still dense
  const s = 0.65;
  drawAtSize(Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)));
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.65),
    filename: file.name.replace(/\.[^.]+$/, '') + '.jpg'
  };
}

function parseEmailAddresses(raw: string): { unique: string[]; valid: string[]; invalid: string[] } {
  const items = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const unique: string[] = Array.from<string>(new Set(items));
  const valid = unique.filter(e => EMAIL_REGEX.test(e));
  const invalid = unique.filter(e => !EMAIL_REGEX.test(e));

  return { unique, valid, invalid };
}

function escapeHtmlClient(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToEditorHtml(plain: string): string {
  const trimmed = plain.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtmlClient(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function extractPlainTextClient(html: string): string {
  if (!html) return '';
  const container = document.createElement('div');
  container.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|blockquote|li)>/gi, '\n');
  return (container.textContent || container.innerText || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SAFE_CLIENT_TAGS = new Set([
  'P',
  'BR',
  'DIV',
  'SPAN',
  'H1',
  'H2',
  'H3',
  'H4',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'A',
  'HR',
  'FONT'
]);

const SAFE_CLIENT_CSS = new Set([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'line-height'
]);

const CLIENT_FONT_SIZE_MAP: Record<string, string> = {
  '1': '11px',
  '2': '13px',
  '3': '15px',
  '4': '18px',
  '5': '22px',
  '6': '26px',
  '7': '32px'
};

function sanitizeClientEmailHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  const template = document.createElement('template');
  template.innerHTML = rawHtml;

  const walk = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'FORM'].includes(tag)) {
      return null;
    }

    if (!SAFE_CLIENT_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      el.childNodes.forEach(child => {
        const cleanChild = walk(child);
        if (cleanChild) frag.appendChild(cleanChild);
      });
      return frag;
    }

    const cleanEl = document.createElement(tag.toLowerCase());

    if (tag === 'A') {
      const href = (el.getAttribute('href') || '').trim();
      if (href && (href.startsWith('https://') || href.startsWith('http://') || href.startsWith('mailto:') || href.startsWith('/'))) {
        cleanEl.setAttribute('href', href);
        cleanEl.setAttribute('target', '_blank');
        cleanEl.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (tag === 'FONT') {
      const c = el.getAttribute('color');
      const f = el.getAttribute('face');
      const s = el.getAttribute('size');
      if (c && /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$|^rgb\([\d\s,]+\)$/i.test(c)) {
        cleanEl.style.color = c;
      }
      if (f) {
        cleanEl.style.fontFamily = f.replace(/[^a-zA-Z0-9,\s\-"]/g, '');
      }
      if (s && CLIENT_FONT_SIZE_MAP[s]) {
        cleanEl.style.fontSize = CLIENT_FONT_SIZE_MAP[s];
      }
    }

    const rawStyle = el.getAttribute('style') || '';
    if (rawStyle) {
      rawStyle.split(';').forEach(decl => {
        const idx = decl.indexOf(':');
        if (idx === -1) return;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (!SAFE_CLIENT_CSS.has(prop) || !val) return;
        const lv = val.toLowerCase();
        if (lv.includes('javascript:') || lv.includes('expression(') || lv.includes('url(')) return;
        cleanEl.style.setProperty(prop, val);
      });
    }

    const align = (el.getAttribute('align') || '').toLowerCase();
    if (['left', 'center', 'right', 'justify'].includes(align)) {
      cleanEl.style.textAlign = align;
    }

    el.childNodes.forEach(child => {
      const cleanChild = walk(child);
      if (cleanChild) cleanEl.appendChild(cleanChild);
    });

    return cleanEl;
  };

  const out = document.createElement('div');
  template.content.childNodes.forEach(child => {
    const cleanChild = walk(child);
    if (cleanChild) out.appendChild(cleanChild);
  });
  return out.innerHTML;
}

const RICH_CONTENT_LIGHT_CLASSES =
  'min-h-[220px] px-4 py-3.5 text-sm text-slate-900 leading-relaxed focus:outline-none [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-950 [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-indigo-950 [&_h3]:mt-2.5 [&_h3]:mb-1.5 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-500 [&_blockquote]:bg-amber-50/70 [&_blockquote]:px-3.5 [&_blockquote]:py-2 [&_blockquote]:italic [&_blockquote]:text-slate-800 [&_blockquote]:my-3 [&_a]:text-indigo-700 [&_a]:underline [&_hr]:border-slate-200 [&_hr]:my-4';

const RICH_CONTENT_DARK_CLASSES =
  'text-sm text-slate-200 leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-amber-400 [&_h3]:mt-2.5 [&_h3]:mb-1.5 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-500 [&_blockquote]:bg-slate-800/80 [&_blockquote]:px-3.5 [&_blockquote]:py-2 [&_blockquote]:italic [&_blockquote]:text-slate-100 [&_blockquote]:my-3 [&_a]:text-amber-400 [&_a]:underline [&_hr]:border-slate-700 [&_hr]:my-4';

const EMAIL_TEXT_COLORS = [
  { label: 'Amber Gold', hex: '#d97706' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Sky Blue', hex: '#0284c7' },
  { label: 'Rose Crimson', hex: '#e11d48' },
  { label: 'Violet', hex: '#7c3aed' },
  { label: 'Slate Gray', hex: '#64748b' }
];

export const AdminEmailComposer: React.FC = () => {
  const { addToast, settings, refreshData, currentUser } = useApp();

  const [activeView, setActiveView] = useState<'compose' | 'history'>('compose');

  // Sender Identity & Logo State
  const [senderName, setSenderName] = useState<string>(settings?.emailSenderName || 'NexGen Council');
  const [senderEmail, setSenderEmail] = useState<string>(
    settings?.emailSenderEmail || `admin@${VERIFIED_DOMAIN}`
  );
  const [logoUrl, setLogoUrl] = useState<string>(
    settings?.emailLogoUrl ?? DEFAULT_COUNCIL_LOGO_URL
  );
  const [useCustomDomainEmail, setUseCustomDomainEmail] = useState<boolean>(false);
  const [isSavingSender, setIsSavingSender] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Composer State
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [toInput, setToInput] = useState<string>('');
  const [ccInput, setCcInput] = useState<string>('');
  const [bccInput, setBccInput] = useState<string>('');
  const [replyTo, setReplyTo] = useState<string>(settings?.emailReplyTo || settings?.contactEmail || '');
  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [htmlBody, setHtmlBody] = useState<string>('');
  const htmlBodyRef = useRef<string>('');
  const editorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  // Rich Editor Popovers
  const [showLinkPopover, setShowLinkPopover] = useState<boolean>(false);
  const [linkUrlInput, setLinkUrlInput] = useState<string>('https://');
  const [linkTextInput, setLinkTextInput] = useState<string>('');

  const [emailImages, setEmailImages] = useState<EmailImage[]>([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState<string>('');
  const [newImagePlacement, setNewImagePlacement] = useState<'top' | 'bottom'>('bottom');
  const [uploadingBodyImage, setUploadingBodyImage] = useState<boolean>(false);
  const bodyImageFileInputRef = useRef<HTMLInputElement>(null);

  // Email CTA Buttons State
  const [emailButtons, setEmailButtons] = useState<EmailButton[]>([]);
  const [newButtonLabel, setNewButtonLabel] = useState<string>('');
  const [newButtonUrl, setNewButtonUrl] = useState<string>('');
  const [newButtonStyle, setNewButtonStyle] = useState<'amber' | 'primary' | 'outline'>('amber');
  const [newButtonAlign, setNewButtonAlign] = useState<'left' | 'center' | 'right'>('center');
  const [newButtonPlacement, setNewButtonPlacement] = useState<'top' | 'inline' | 'bottom'>('bottom');
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null);
  const buttonsSectionRef = useRef<HTMLDivElement>(null);

  const [showPreview, setShowPreview] = useState<boolean>(false);

  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    title: string;
    detail: string;
    messageId?: string;
  } | null>(null);

  // History State
  const [historyLogs, setHistoryLogs] = useState<EmailLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'All' | 'Sent' | 'Failed'>('All');
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isAdminUser =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'Super Admin';

  // Derive local-part handle when using @nexgencouncil.bond domain
  const senderPrefix = useMemo(() => {
    const atIndex = senderEmail.indexOf('@');
    if (atIndex === -1) return senderEmail;
    return senderEmail.slice(0, atIndex);
  }, [senderEmail]);

  const loadSenderSettings = useCallback(async () => {
    try {
      const res = await authFetch('/api/email/settings');
      if (!res.ok) return;
      const data = await parseJsonResponse<any>(res);
      if (data.senderName) setSenderName(data.senderName);
      if (data.senderEmail) {
        setSenderEmail(data.senderEmail);
        setUseCustomDomainEmail(!data.senderEmail.toLowerCase().endsWith(`@${VERIFIED_DOMAIN}`));
      }
      if (typeof data.replyTo === 'string' && data.replyTo.trim()) {
        setReplyTo(data.replyTo);
      }
      if (typeof data.logoUrl === 'string') {
        setLogoUrl(data.logoUrl);
      }
    } catch {
      // Keep fallback defaults
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch('/api/email/history');
      if (!res.ok) return;
      const data = await parseJsonResponse<any>(res);
      if (Array.isArray(data.logs)) {
        setHistoryLogs(data.logs);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadSenderSettings();
    loadHistory();
  }, [loadSenderSettings, loadHistory]);

  // Restore formatted HTML into the contentEditable element whenever editor mounts
  useEffect(() => {
    if (activeView === 'compose' && !showPreview && editorRef.current) {
      if (editorRef.current.innerHTML !== htmlBodyRef.current) {
        editorRef.current.innerHTML = htmlBodyRef.current;
      }
    }
  }, [activeView, showPreview]);

  const setEditorHtmlProgrammatically = useCallback((nextHtml: string, nextPlain?: string) => {
    const cleanHtml = sanitizeClientEmailHtml(nextHtml);
    htmlBodyRef.current = cleanHtml;
    setHtmlBody(cleanHtml);
    const derivedPlain = nextPlain !== undefined ? nextPlain : extractPlainTextClient(cleanHtml);
    setMessage(derivedPlain);
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanHtml;
    }
  }, []);

  const captureEditorSelection = useCallback(() => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  const syncEditorFromDom = useCallback(() => {
    if (!editorRef.current) return;
    const raw = editorRef.current.innerHTML;
    const plain = extractPlainTextClient(raw);
    const cleanHtml = plain ? sanitizeClientEmailHtml(raw) : '';
    htmlBodyRef.current = cleanHtml;
    setHtmlBody(cleanHtml);
    setMessage(plain);
    captureEditorSelection();
  }, [captureEditorSelection]);

  const execEditorCommand = (command: string, value?: string) => {
    if (isSending || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    syncEditorFromDom();
  };

  const handleApplyBlockFormat = (tag: string) => {
    if (isSending || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('formatBlock', false, tag);
    syncEditorFromDom();
  };

  const handleOpenLinkPopover = () => {
    if (isSending || !editorRef.current) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
      setLinkTextInput(selection.toString());
    } else {
      savedSelectionRef.current = null;
      setLinkTextInput('');
    }
    setLinkUrlInput('https://');
    setShowLinkPopover(prev => !prev);
  };

  const handleInsertLink = () => {
    const rawUrl = linkUrlInput.trim();
    if (!rawUrl || (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://') && !rawUrl.startsWith('mailto:'))) {
      addToast('Enter a valid https://, http://, or mailto: link URL.', 'error');
      return;
    }
    if (!editorRef.current) return;
    editorRef.current.focus();

    const selection = window.getSelection();
    if (savedSelectionRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedSelectionRef.current);
    }

    if (selection && !selection.isCollapsed) {
      document.execCommand('createLink', false, rawUrl);
    } else {
      const label = linkTextInput.trim() || rawUrl;
      const anchor = `<a href="${escapeHtmlClient(rawUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtmlClient(label)}</a>`;
      document.execCommand('insertHTML', false, anchor);
    }

    savedSelectionRef.current = null;
    setShowLinkPopover(false);
    syncEditorFromDom();
  };

  // Parse comma-separated To, CC, and BCC recipients live
  const parsedTo = useMemo(() => parseEmailAddresses(toInput), [toInput]);
  const parsedCc = useMemo(() => parseEmailAddresses(ccInput), [ccInput]);
  const parsedBcc = useMemo(() => parseEmailAddresses(bccInput), [bccInput]);
  const totalValidRecipients = parsedTo.valid.length + parsedCc.valid.length + parsedBcc.valid.length;

  const filteredHistory = useMemo(() => {
    return historyLogs.filter(log => {
      const matchesStatus = historyStatusFilter === 'All' || log.status === historyStatusFilter;
      const q = historySearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        log.subject.toLowerCase().includes(q) ||
        log.fromName.toLowerCase().includes(q) ||
        log.fromEmail.toLowerCase().includes(q) ||
        log.to.some(r => r.toLowerCase().includes(q)) ||
        (Array.isArray(log.cc) && log.cc.some(r => r.toLowerCase().includes(q))) ||
        (Array.isArray(log.bcc) && log.bcc.some(r => r.toLowerCase().includes(q))) ||
        (log.resendId && log.resendId.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [historyLogs, historySearch, historyStatusFilter]);

  const handlePrefixChange = (rawPrefix: string) => {
    const cleaned = rawPrefix.replace(/[@\s<>]/g, '').toLowerCase();
    setSenderEmail(`${cleaned}@${VERIFIED_DOMAIN}`);
  };

  const uploadImageFile = async (file: File, kind: 'logo' | 'body'): Promise<string> => {
    const isImageMime = file.type.startsWith('image/');
    const isImageExt = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(file.name);
    if (!isImageMime && !isImageExt) {
      throw new Error('Please choose a valid image file (PNG, JPG, WebP, GIF, SVG).');
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Image is too large. Please select an image under 15MB.');
    }

    const { dataUrl, filename } = await compressImageToDataUrl(file, {
      maxDimension: kind === 'logo' ? 480 : 1200,
      preferPng: kind === 'logo',
      maxDataUrlLength: 720_000
    });

    const res = await authFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename })
    });
    const data = await parseJsonResponse<any>(res);
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Image upload failed.');
    }
    return data.url as string;
  };

  const handleUploadLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingLogo(true);
    try {
      const uploadedUrl = await uploadImageFile(file, 'logo');
      setLogoUrl(uploadedUrl);
      addToast('Header logo uploaded! Click "Save as Default Sender" to keep it permanently.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Error uploading header logo.', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUploadBodyImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    if (emailImages.length + files.length > 10) {
      addToast('Maximum 10 images allowed per email.', 'error');
      return;
    }

    setUploadingBodyImage(true);
    try {
      const added: EmailImage[] = [];
      for (const file of files) {
        const uploadedUrl = await uploadImageFile(file, 'body');
        added.push({
          id: `eimg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          url: uploadedUrl,
          alt: file.name.replace(/\.[^.]+$/, ''),
          caption: '',
          placement: newImagePlacement
        });
      }
      setEmailImages(prev => [...prev, ...added]);
      addToast(`Added ${added.length} image${added.length > 1 ? 's' : ''} to email.`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Error uploading image.', 'error');
    } finally {
      setUploadingBodyImage(false);
    }
  };

  const handleAddBodyImageByUrl = () => {
    const cleanUrl = newImageUrlInput.trim();
    if (!cleanUrl) return;

    if (!isValidEmailImageInput(cleanUrl)) {
      addToast('Enter a valid https:// image URL or /uploads/... path.', 'error');
      return;
    }
    if (emailImages.length >= 10) {
      addToast('Maximum 10 images allowed per email.', 'error');
      return;
    }

    setEmailImages(prev => [
      ...prev,
      {
        id: `eimg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        url: cleanUrl,
        alt: '',
        caption: '',
        placement: newImagePlacement
      }
    ]);
    setNewImageUrlInput('');
  };

  const handleUpdateBodyImage = (id: string, patch: Partial<EmailImage>) => {
    setEmailImages(prev => prev.map(img => (img.id === id ? { ...img, ...patch } : img)));
  };

  const handleMoveBodyImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= emailImages.length) return;
    setEmailImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleRemoveBodyImage = (id: string) => {
    setEmailImages(prev => prev.filter(img => img.id !== id));
  };

  const stripButtonMarkerHtml = (rawHtml: string, buttonId: string): string => {
    const escaped = buttonId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return rawHtml
      .replace(
        new RegExp(`<(?:p|div)[^>]*>\\s*\\[\\[BUTTON:${escaped}\\]\\]\\s*(?:<br\\s*\\/?>\\s*)*<\\/(?:p|div)>`, 'gi'),
        ''
      )
      .replace(new RegExp(`\\[\\[BUTTON:${escaped}\\]\\]`, 'g'), '');
  };

  const removeButtonMarkerFromEditor = (buttonId: string) => {
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : htmlBodyRef.current;
    if (!currentHtml || !currentHtml.includes(`[[BUTTON:${buttonId}]]`)) return;
    const nextHtml = stripButtonMarkerHtml(currentHtml, buttonId);
    setEditorHtmlProgrammatically(nextHtml);
  };

  const insertButtonMarkerIntoEditor = (buttonId: string, forceMoveToCursor = false) => {
    const markerToken = `[[BUTTON:${buttonId}]]`;
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : htmlBodyRef.current;

    if (!forceMoveToCursor && currentHtml.includes(markerToken)) {
      return;
    }

    // Remove existing marker first if moving it
    if (currentHtml.includes(markerToken)) {
      const cleaned = stripButtonMarkerHtml(currentHtml, buttonId);
      setEditorHtmlProgrammatically(cleaned);
    }

    if (editorRef.current && savedSelectionRef.current && editorRef.current.contains(savedSelectionRef.current.startContainer)) {
      editorRef.current.focus();
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedSelectionRef.current);
      }
      document.execCommand('insertHTML', false, `<p>${markerToken}</p>`);
      savedSelectionRef.current = null;
      syncEditorFromDom();
      return;
    }

    const baseHtml = stripButtonMarkerHtml(
      editorRef.current ? editorRef.current.innerHTML : htmlBodyRef.current,
      buttonId
    ).trim();
    const nextHtml = baseHtml ? `${baseHtml}<p>${markerToken}</p>` : `<p>${markerToken}</p>`;
    setEditorHtmlProgrammatically(nextHtml);
  };

  const handleAddButton = () => {
    const cleanLabel = newButtonLabel.trim();
    const cleanUrl = newButtonUrl.trim();
    if (!cleanLabel) {
      addToast('Enter button text (e.g. Apply Now or Visit Website).', 'error');
      return;
    }
    if (!isValidEmailButtonUrl(cleanUrl)) {
      addToast('Enter a valid https://, http://, mailto:, tel:, or /path link URL.', 'error');
      return;
    }
    if (emailButtons.length >= 5) {
      addToast('Maximum 5 CTA buttons allowed per email.', 'error');
      return;
    }

    const newBtnId = `ebtn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newBtn: EmailButton = {
      id: newBtnId,
      label: cleanLabel.slice(0, 60),
      url: cleanUrl,
      style: newButtonStyle,
      align: newButtonAlign,
      placement: newButtonPlacement
    };

    setEmailButtons(prev => [...prev, newBtn]);
    if (newButtonPlacement === 'inline') {
      insertButtonMarkerIntoEditor(newBtnId, true);
      addToast(`Added "${cleanLabel}" inside the message body.`, 'success');
    }
    setNewButtonLabel('');
    setNewButtonUrl('');
  };

  const handleAddPresetButton = (preset: {
    label: string;
    url: string;
    style: 'amber' | 'primary' | 'outline';
  }) => {
    if (emailButtons.length >= 5) {
      addToast('Maximum 5 CTA buttons allowed per email.', 'error');
      return;
    }
    const newBtnId = `ebtn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setEmailButtons(prev => [
      ...prev,
      {
        id: newBtnId,
        label: preset.label,
        url: preset.url,
        style: preset.style,
        align: newButtonAlign,
        placement: newButtonPlacement
      }
    ]);
    if (newButtonPlacement === 'inline') {
      insertButtonMarkerIntoEditor(newBtnId, true);
    }
    addToast(`Added "${preset.label}" button.`, 'success');
  };

  const handleUpdateButton = (id: string, patch: Partial<EmailButton>) => {
    setEmailButtons(prev => prev.map(btn => (btn.id === id ? { ...btn, ...patch } : btn)));
  };

  const handleChangeButtonPlacement = (id: string, placement: 'top' | 'inline' | 'bottom') => {
    handleUpdateButton(id, { placement });
    if (placement === 'inline') {
      insertButtonMarkerIntoEditor(id, false);
      addToast('Button marker placed in message body. You can move [[BUTTON:...]] anywhere in your text!', 'info');
    } else {
      removeButtonMarkerFromEditor(id);
    }
  };

  const handleMoveButton = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= emailButtons.length) return;
    setEmailButtons(prev => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleRemoveButton = (id: string) => {
    removeButtonMarkerFromEditor(id);
    setEmailButtons(prev => prev.filter(btn => btn.id !== id));
    if (editingButtonId === id) setEditingButtonId(null);
  };

  const handlePlaceNewButtonAtCursor = () => {
    captureEditorSelection();
    setNewButtonPlacement('inline');
    buttonsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    addToast('Set placement to "Inside Message (At Cursor)" — add your button below to insert it there.', 'info');
  };

  const renderSinglePreviewButton = (btn: EmailButton) => {
    if (!btn.label.trim() || !isValidEmailButtonUrl(btn.url)) return null;
    const alignClass =
      btn.align === 'left'
        ? 'justify-start'
        : btn.align === 'right'
        ? 'justify-end'
        : 'justify-center';
    const styleClass =
      btn.style === 'primary'
        ? 'bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-500'
        : btn.style === 'outline'
        ? 'bg-transparent hover:bg-amber-400/10 text-amber-400 border-2 border-amber-400'
        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400';

    return (
      <div key={btn.id} className={`flex ${alignClass} my-3`}>
        <a
          href={resolveButtonPreviewUrl(btn.url, settings?.siteUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors ${styleClass}`}
        >
          <span>{btn.label}</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
        </a>
      </div>
    );
  };

  const renderPreviewButtons = (buttonsList: EmailButton[]) => {
    const validButtons = buttonsList.filter(
      b => b.label.trim() && isValidEmailButtonUrl(b.url)
    );
    if (validButtons.length === 0) return null;

    return <div className="space-y-1">{validButtons.map(renderSinglePreviewButton)}</div>;
  };

  const renderEmailBodyWithButtonPlacements = (
    rawHtml: string,
    fallbackPlain: string,
    buttonsList: EmailButton[],
    emptyHint?: string
  ) => {
    const validButtons = (buttonsList || []).filter(
      b => b.label.trim() && isValidEmailButtonUrl(b.url)
    );
    const cleanHtml = rawHtml.trim() ? sanitizeClientEmailHtml(rawHtml) : '';
    const sourceContent = cleanHtml || (fallbackPlain.trim() ? plainTextToEditorHtml(fallbackPlain) : '');

    const topButtons: EmailButton[] = [];
    const inlineButtonsMap = new Map<string, EmailButton>();
    const bottomButtons: EmailButton[] = [];

    for (const btn of validButtons) {
      const marker = `[[BUTTON:${btn.id}]]`;
      const hasMarker = sourceContent.includes(marker);
      if (btn.placement === 'inline' || hasMarker) {
        if (hasMarker) {
          inlineButtonsMap.set(btn.id, btn);
        } else {
          bottomButtons.push(btn);
        }
      } else if (btn.placement === 'top') {
        topButtons.push(btn);
      } else {
        bottomButtons.push(btn);
      }
    }

    // Split sanitized HTML cleanly around inline button markers
    const renderedSegments: React.ReactNode[] = [];
    if (sourceContent) {
      const parts = sourceContent.split(/(\[\[BUTTON:[a-zA-Z0-9_-]+\]\])/g);
      parts.forEach((part, idx) => {
        const markerMatch = part.match(/^\[\[BUTTON:([a-zA-Z0-9_-]+)\]\]$/);
        if (markerMatch) {
          const btn = inlineButtonsMap.get(markerMatch[1]);
          if (btn) {
            renderedSegments.push(
              <React.Fragment key={`ibtn_${btn.id}_${idx}`}>
                {renderSinglePreviewButton(btn)}
              </React.Fragment>
            );
          }
          return;
        }
        const strippedEmptyWrappers = part
          .replace(/<p[^>]*>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, '')
          .trim();
        if (strippedEmptyWrappers) {
          renderedSegments.push(
            <div
              key={`seg_${idx}`}
              className={RICH_CONTENT_DARK_CLASSES}
              dangerouslySetInnerHTML={{ __html: part }}
            />
          );
        }
      });
    }

    return (
      <div className="space-y-2">
        {topButtons.length > 0 && renderPreviewButtons(topButtons)}
        {renderedSegments.length > 0 ? (
          <div className="space-y-1">{renderedSegments}</div>
        ) : emptyHint ? (
          <div className="text-sm text-slate-400 leading-relaxed min-h-[120px]">{emptyHint}</div>
        ) : null}
        {bottomButtons.length > 0 && renderPreviewButtons(bottomButtons)}
      </div>
    );
  };

  const handleSaveSenderSettings = async () => {
    const cleanName = senderName.trim();
    const cleanEmail = senderEmail.trim().toLowerCase();
    const cleanReplyTo = replyTo.trim();
    const cleanLogoUrl = logoUrl.trim();

    if (!cleanName) {
      addToast('Sender display name cannot be empty.', 'error');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      addToast('Please enter a valid sender email address (e.g. info@nexgencouncil.bond).', 'error');
      return;
    }
    if (cleanReplyTo && !EMAIL_REGEX.test(cleanReplyTo)) {
      addToast('Reply-To must be a valid email address.', 'error');
      return;
    }
    if (cleanLogoUrl && !isValidEmailImageInput(cleanLogoUrl)) {
      addToast('Header Logo URL must be a valid https:// URL or uploaded image.', 'error');
      return;
    }

    setIsSavingSender(true);
    try {
      const res = await authFetch('/api/email/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: cleanName,
          senderEmail: cleanEmail,
          replyTo: cleanReplyTo,
          logoUrl: cleanLogoUrl
        })
      });
      const data = await parseJsonResponse<any>(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save sender identity.');
      }

      setSenderName(data.config.senderName);
      setSenderEmail(data.config.senderEmail);
      setLogoUrl(data.config.logoUrl ?? '');
      addToast(`Default sender saved: ${data.config.senderName} <${data.config.senderEmail}>`, 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err?.message || 'Error saving sender settings.', 'error');
    } finally {
      setIsSavingSender(false);
    }
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = EMAIL_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    if (preset.id !== 'custom') {
      setSubject(preset.subject);
      setEditorHtmlProgrammatically(plainTextToEditorHtml(preset.message), preset.message);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    const activeFromName = senderName.trim() || 'NexGen Council';
    const activeFromEmail = senderEmail.trim().toLowerCase();
    const activeLogoUrl = logoUrl.trim();

    if (!EMAIL_REGEX.test(activeFromEmail)) {
      const errMsg = 'Sender email address is invalid. Please fix Sender Identity first.';
      setStatusBanner({ type: 'error', title: 'Invalid Sender Email', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (activeLogoUrl && !isValidEmailImageInput(activeLogoUrl)) {
      const errMsg = 'Header logo URL is invalid. Use a valid https:// URL or uploaded image.';
      setStatusBanner({ type: 'error', title: 'Invalid Logo URL', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (parsedTo.invalid.length > 0) {
      const errMsg = `Invalid To email format detected: ${parsedTo.invalid.join(', ')}`;
      setStatusBanner({ type: 'error', title: 'Invalid To Recipient', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (parsedCc.invalid.length > 0) {
      const errMsg = `Invalid CC email format detected: ${parsedCc.invalid.join(', ')}`;
      setStatusBanner({ type: 'error', title: 'Invalid CC Recipient', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (parsedBcc.invalid.length > 0) {
      const errMsg = `Invalid BCC email format detected: ${parsedBcc.invalid.join(', ')}`;
      setStatusBanner({ type: 'error', title: 'Invalid BCC Recipient', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (totalValidRecipients === 0) {
      const errMsg = 'Please enter at least one valid email address in To, CC, or BCC.';
      setStatusBanner({ type: 'error', title: 'Validation Error', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (totalValidRecipients > 50) {
      const errMsg = `Total recipients (${totalValidRecipients}) exceed the 50-recipient limit per send.`;
      setStatusBanner({ type: 'error', title: 'Recipient Limit Exceeded', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (!subject.trim()) {
      const errMsg = 'Email subject is required.';
      setStatusBanner({ type: 'error', title: 'Missing Subject', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    const latestRawHtml = editorRef.current ? editorRef.current.innerHTML : htmlBodyRef.current;
    const finalSanitizedHtml = sanitizeClientEmailHtml(latestRawHtml);
    const finalPlainMessage = extractPlainTextClient(finalSanitizedHtml) || message.trim();

    const invalidButtons = emailButtons.filter(
      b => !b.label.trim() || !isValidEmailButtonUrl(b.url)
    );
    if (invalidButtons.length > 0) {
      const errMsg = 'Each CTA button must have both a label and a valid link URL (https://, http://, mailto:, tel:, or /path).';
      setStatusBanner({ type: 'error', title: 'Invalid Button Link', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (!finalPlainMessage && !finalSanitizedHtml && emailImages.length === 0 && emailButtons.length === 0) {
      const errMsg = 'Please enter a message body, button, or image before sending.';
      setStatusBanner({ type: 'error', title: 'Missing Content', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    setIsSending(true);
    try {
      const res = await authFetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: parsedTo.valid,
          cc: parsedCc.valid,
          bcc: parsedBcc.valid,
          subject: subject.trim(),
          message: finalPlainMessage,
          html: finalSanitizedHtml || undefined,
          replyTo: replyTo.trim() || undefined,
          fromName: activeFromName,
          fromEmail: activeFromEmail,
          logoUrl: activeLogoUrl,
          images: emailImages,
          buttons: emailButtons
        })
      });

      const payload = await parseJsonResponse<any>(res);

      if (payload.log) {
        setHistoryLogs(prev => [payload.log, ...prev]);
      } else {
        loadHistory();
      }

      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to dispatch email.');
      }

      const msgId = payload.data?.id;
      const recipientCount =
        (payload.data?.recipients?.length || 0) +
        (payload.data?.cc?.length || 0) +
        (payload.data?.bcc?.length || 0) || totalValidRecipients;

      setStatusBanner({
        type: 'success',
        title: `Email Sent Successfully to ${recipientCount} Recipient${recipientCount > 1 ? 's' : ''}`,
        detail: `Dispatched from ${activeFromName} <${activeFromEmail}>${
          parsedBcc.valid.length > 0 ? ` • ${parsedBcc.valid.length} BCC` : ''
        }${parsedCc.valid.length > 0 ? ` • ${parsedCc.valid.length} CC` : ''}.`,
        messageId: msgId
      });

      addToast(`Email delivered! ID: ${msgId}`, 'success');

      // Reset composer fields
      setToInput('');
      setCcInput('');
      setBccInput('');
      setSubject('');
      setEditorHtmlProgrammatically('', '');
      setEmailImages([]);
      setEmailButtons([]);
      setNewButtonLabel('');
      setNewButtonUrl('');
      setNewButtonPlacement('bottom');
      setEditingButtonId(null);
      setSelectedPreset('custom');
      setShowPreview(false);
    } catch (err: any) {
      const errorMsg = err?.message || 'Unable to send email. Please check server configuration.';
      setStatusBanner({
        type: 'error',
        title: 'Delivery Failed',
        detail: errorMsg
      });
      addToast(errorMsg, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleReuseLog = (log: EmailLog) => {
    setSenderName(log.fromName || 'NexGen Council');
    setSenderEmail(log.fromEmail || `admin@${VERIFIED_DOMAIN}`);
    setUseCustomDomainEmail(!(log.fromEmail || '').toLowerCase().endsWith(`@${VERIFIED_DOMAIN}`));
    if (log.logoUrl !== undefined) setLogoUrl(log.logoUrl || '');
    setEmailImages(Array.isArray(log.images) ? log.images : []);
    setEmailButtons(Array.isArray(log.buttons) ? log.buttons : []);
    setEditingButtonId(null);
    setToInput((log.to || []).join(', '));
    setCcInput(Array.isArray(log.cc) ? log.cc.join(', ') : '');
    setBccInput(Array.isArray(log.bcc) ? log.bcc.join(', ') : '');
    setSubject(log.subject);

    const restoredPlain = log.message === '[HTML Content]' || log.message === '[Formatted Content]' ? '' : log.message;
    const restoredHtml = log.html ? log.html : plainTextToEditorHtml(restoredPlain);
    setEditorHtmlProgrammatically(restoredHtml, restoredPlain);

    if (log.replyTo) setReplyTo(log.replyTo);
    setSelectedLog(null);
    setConfirmDeleteId(null);
    setActiveView('compose');
    setShowPreview(false);
    addToast('Loaded email details, buttons, recipients, and formatting into composer.', 'info');
  };

  const handleDeleteLog = async (id: string) => {
    try {
      const res = await authFetch(`/api/email/history/${id}`, { method: 'DELETE' });
      const data = await parseJsonResponse<any>(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not delete email record.');
      }
      setHistoryLogs(prev => prev.filter(l => l.id !== id));
      if (selectedLog?.id === id) setSelectedLog(null);
      setConfirmDeleteId(null);
      addToast('Email history entry deleted.', 'info');
    } catch (err: any) {
      addToast(err?.message || 'Error deleting record.', 'error');
    }
  };

  const effectiveDisplayName = senderName.trim() || 'NexGen Council';
  const effectiveSenderEmail = senderEmail.trim().toLowerCase() || `admin@${VERIFIED_DOMAIN}`;

  return (
    <div className="space-y-6">
      {/* Header + Mode Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-950 text-amber-400 shadow-xs">
              <Mail className="w-5 h-5" />
            </span>
            <span>Official Email System</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dispatch from{' '}
            <span className="font-semibold text-slate-800">{effectiveDisplayName}</span>{' '}
            <span className="font-mono font-semibold text-indigo-950">&lt;{effectiveSenderEmail}&gt;</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Compose vs History Tabs */}
          <div className="inline-flex p-1 rounded-xl bg-slate-200/80 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveView('compose')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'compose'
                  ? 'bg-indigo-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-amber-400" />
              <span>Compose Email</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('history');
                loadHistory();
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'history'
                  ? 'bg-indigo-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>Sent History ({historyLogs.length})</span>
            </button>
          </div>

          {activeView === 'compose' && (
            <button
              type="button"
              onClick={() => setShowPreview(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                showPreview
                  ? 'bg-indigo-950 text-white border-indigo-950'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {showPreview ? <Edit3 className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-slate-500" />}
              <span>{showPreview ? 'Back to Editor' : 'Preview Template'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Banner (Success / Error Feedback) */}
      {statusBanner && activeView === 'compose' && (
        <div
          className={`rounded-2xl p-4 border flex items-start gap-3 shadow-xs ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {statusBanner.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs space-y-1">
            <div className="font-bold text-sm">{statusBanner.title}</div>
            <p className="opacity-90">{statusBanner.detail}</p>
            {statusBanner.messageId && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/80 border border-emerald-300 font-mono text-[11px] font-semibold text-emerald-950 mt-1">
                <span>Resend Message ID:</span>
                <span>{statusBanner.messageId}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'compose' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Composer Form */}
          <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8">
            {showPreview ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Live HTML Email Template Preview
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    From: {effectiveDisplayName} &lt;{effectiveSenderEmail}&gt;
                  </span>
                </div>

                {(parsedTo.valid.length > 0 || parsedCc.valid.length > 0 || parsedBcc.valid.length > 0) && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-[11px] space-y-1">
                    {parsedTo.valid.length > 0 && (
                      <div>
                        <strong className="text-slate-600">To:</strong>{' '}
                        <span className="font-mono text-slate-800">{parsedTo.valid.join(', ')}</span>
                      </div>
                    )}
                    {parsedCc.valid.length > 0 && (
                      <div>
                        <strong className="text-slate-600">CC:</strong>{' '}
                        <span className="font-mono text-slate-800">{parsedCc.valid.join(', ')}</span>
                      </div>
                    )}
                    {parsedBcc.valid.length > 0 && (
                      <div>
                        <strong className="text-slate-600">BCC (Private):</strong>{' '}
                        <span className="font-mono text-slate-800">{parsedBcc.valid.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl bg-slate-950 p-6 sm:p-8 border border-slate-800 text-slate-100 space-y-5">
                  <div className="border-b border-slate-800 pb-5 flex items-center gap-4">
                    {logoUrl.trim() && (
                      <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-700 p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
                        <img
                          src={logoUrl.trim()}
                          alt={`${effectiveDisplayName} Logo`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
                        Official Communication
                      </div>
                      <div className="text-xl font-bold text-white">{effectiveDisplayName}</div>
                      <div className="text-xs text-slate-400">Women Empowerment &amp; Youth Leadership Council</div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {subject.trim() || '(Email Subject Preview)'}
                    </h2>
                    <div className="w-12 h-0.5 bg-amber-500 mt-3 rounded-full" />
                  </div>

                  {/* Top Banner Images Preview */}
                  {emailImages.filter(img => img.placement === 'top').length > 0 && (
                    <div className="space-y-3">
                      {emailImages
                        .filter(img => img.placement === 'top')
                        .map(img => (
                          <div key={img.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900/70">
                            <img
                              src={img.url}
                              alt={img.alt || img.caption || 'Email banner'}
                              referrerPolicy="no-referrer"
                              className="w-full max-h-72 object-contain mx-auto bg-slate-950"
                            />
                            {img.caption && (
                              <div className="px-3 py-2 text-[11px] text-slate-400 text-center border-t border-slate-800">
                                {img.caption}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {renderEmailBodyWithButtonPlacements(
                    htmlBody,
                    message,
                    emailButtons,
                    'Your formatted email message body will render here inside the branded email template.'
                  )}

                  {/* Bottom Inline Images Preview */}
                  {emailImages.filter(img => (img.placement || 'bottom') === 'bottom').length > 0 && (
                    <div className="space-y-3">
                      {emailImages
                        .filter(img => (img.placement || 'bottom') === 'bottom')
                        .map(img => (
                          <div key={img.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900/70">
                            <img
                              src={img.url}
                              alt={img.alt || img.caption || 'Email visual'}
                              referrerPolicy="no-referrer"
                              className="w-full max-h-72 object-contain mx-auto bg-slate-950"
                            />
                            {img.caption && (
                              <div className="px-3 py-2 text-[11px] text-slate-400 text-center border-t border-slate-800">
                                {img.caption}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="pt-5 border-t border-slate-800 text-center space-y-1 text-[11px] text-slate-500">
                    <div className="text-slate-300 font-semibold">{effectiveDisplayName} • Executive Secretariat</div>
                    <div>Sent via <span className="text-amber-400">nexgencouncil.bond</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendEmail} className="space-y-5 text-xs">
                {/* Template Preset & Reply-To */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="email-preset" className="block font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Template Preset</span>
                    </label>
                    <select
                      id="email-preset"
                      value={selectedPreset}
                      onChange={(e) => handlePresetChange(e.target.value)}
                      disabled={isSending}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
                    >
                      {EMAIL_PRESETS.map(preset => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="email-reply-to" className="block font-semibold text-slate-700 mb-1.5">
                      Reply-To Address (Optional)
                    </label>
                    <input
                      id="email-reply-to"
                      type="email"
                      disabled={isSending}
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder="contact@nexgencouncil.bond"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                {/* To / CC / BCC Recipients */}
                <div className="space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label htmlFor="email-to" className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-900" />
                        <span>To (Primary Recipient)</span>
                      </label>
                      <div className="flex items-center gap-2.5 text-[11px]">
                        {parsedTo.unique.length > 0 && (
                          <span
                            className={`font-semibold ${
                              parsedTo.invalid.length > 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {parsedTo.valid.length} valid
                            {parsedTo.invalid.length > 0 ? ` • ${parsedTo.invalid.length} invalid` : ''}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            totalValidRecipients > 50
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Total: {totalValidRecipients}/50
                        </span>
                      </div>
                    </div>

                    <input
                      id="email-to"
                      type="text"
                      disabled={isSending}
                      value={toInput}
                      onChange={(e) => setToInput(e.target.value)}
                      placeholder="member@example.com or comma-separated emails (optional if using BCC)"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-slate-900 focus:outline-none focus:ring-2 ${
                        parsedTo.invalid.length > 0
                          ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                          : 'border-slate-300 focus:ring-indigo-300'
                      }`}
                    />

                    {parsedTo.invalid.length > 0 && (
                      <p className="text-[11px] text-rose-600 mt-1 font-medium">
                        Invalid To email(s): {parsedTo.invalid.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* CC */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="email-cc" className="font-semibold text-slate-700">
                          CC (Carbon Copy)
                        </label>
                        {parsedCc.unique.length > 0 && (
                          <span
                            className={`text-[11px] font-semibold ${
                              parsedCc.invalid.length > 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {parsedCc.valid.length} valid
                            {parsedCc.invalid.length > 0 ? ` • ${parsedCc.invalid.length} invalid` : ''}
                          </span>
                        )}
                      </div>
                      <input
                        id="email-cc"
                        type="text"
                        disabled={isSending}
                        value={ccInput}
                        onChange={(e) => setCcInput(e.target.value)}
                        placeholder="cc1@example.com, cc2@example.com"
                        className={`w-full px-3.5 py-2 rounded-xl border text-slate-900 focus:outline-none focus:ring-2 ${
                          parsedCc.invalid.length > 0
                            ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-300'
                        }`}
                      />
                      {parsedCc.invalid.length > 0 && (
                        <p className="text-[11px] text-rose-600 mt-1 font-medium">
                          Invalid CC: {parsedCc.invalid.join(', ')}
                        </p>
                      )}
                    </div>

                    {/* BCC */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="email-bcc" className="font-semibold text-slate-700 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-indigo-900" />
                          <span>BCC (Hidden Recipients)</span>
                        </label>
                        {parsedBcc.unique.length > 0 && (
                          <span
                            className={`text-[11px] font-semibold ${
                              parsedBcc.invalid.length > 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {parsedBcc.valid.length} valid
                            {parsedBcc.invalid.length > 0 ? ` • ${parsedBcc.invalid.length} invalid` : ''}
                          </span>
                        )}
                      </div>
                      <input
                        id="email-bcc"
                        type="text"
                        disabled={isSending}
                        value={bccInput}
                        onChange={(e) => setBccInput(e.target.value)}
                        placeholder="bcc1@example.com, bcc2@example.com"
                        className={`w-full px-3.5 py-2 rounded-xl border text-slate-900 focus:outline-none focus:ring-2 ${
                          parsedBcc.invalid.length > 0
                            ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-300'
                        }`}
                      />
                      {parsedBcc.invalid.length > 0 && (
                        <p className="text-[11px] text-rose-600 mt-1 font-medium">
                          Invalid BCC: {parsedBcc.invalid.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label htmlFor="email-subject" className="block font-semibold text-slate-700 mb-1.5">
                    Subject *
                  </label>
                  <input
                    id="email-subject"
                    type="text"
                    required
                    disabled={isSending}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter email subject line..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                {/* Rich Text Formatted Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>Message Body &amp; Font Formatting {emailImages.length === 0 ? '*' : '(Optional if image attached)'}</span>
                    </label>
                    <span className="text-[11px] text-slate-400">{message.length} characters</span>
                  </div>

                  <div className="rounded-2xl border border-slate-300 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-indigo-300">
                    {/* Formatting Toolbar */}
                    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-slate-50 border-b border-slate-200">
                      {/* Block Heading / Paragraph */}
                      <select
                        aria-label="Text Heading Style"
                        defaultValue="p"
                        onChange={(e) => {
                          handleApplyBlockFormat(e.target.value);
                          e.target.value = 'p';
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 cursor-pointer focus:outline-none"
                      >
                        <option value="p">Normal Text</option>
                        <option value="h1">Heading 1</option>
                        <option value="h2">Heading 2</option>
                        <option value="h3">Heading 3</option>
                        <option value="blockquote">Blockquote</option>
                      </select>

                      {/* Font Family */}
                      <select
                        aria-label="Font Family"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) execEditorCommand('fontName', e.target.value);
                          e.target.value = '';
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none"
                      >
                        <option value="" disabled>Font</option>
                        <option value="Arial, Helvetica, sans-serif">Sans-Serif</option>
                        <option value="Georgia, Times New Roman, serif">Serif (Editorial)</option>
                        <option value="Courier New, monospace">Monospace</option>
                      </select>

                      {/* Font Size */}
                      <select
                        aria-label="Font Size"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) execEditorCommand('fontSize', e.target.value);
                          e.target.value = '';
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none"
                      >
                        <option value="" disabled>Size</option>
                        <option value="2">Small</option>
                        <option value="3">Normal</option>
                        <option value="4">Medium</option>
                        <option value="5">Large</option>
                        <option value="6">XL Heading</option>
                      </select>

                      <div className="w-px h-5 bg-slate-300 mx-0.5" />

                      {/* Bold, Italic, Underline, Strike */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('bold');
                        }}
                        title="Bold (Ctrl+B)"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('italic');
                        }}
                        title="Italic (Ctrl+I)"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('underline');
                        }}
                        title="Underline (Ctrl+U)"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('strikeThrough');
                        }}
                        title="Strikethrough"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-5 bg-slate-300 mx-0.5" />

                      {/* Lists & Quote */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('insertUnorderedList');
                        }}
                        title="Bullet List"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('insertOrderedList');
                        }}
                        title="Numbered List"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleApplyBlockFormat('blockquote');
                        }}
                        title="Blockquote"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Quote className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-5 bg-slate-300 mx-0.5" />

                      {/* Alignment */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('justifyLeft');
                        }}
                        title="Align Left"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('justifyCenter');
                        }}
                        title="Align Center"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('justifyRight');
                        }}
                        title="Align Right"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-5 bg-slate-300 mx-0.5" />

                      {/* Text Color Swatches */}
                      <div className="flex items-center gap-1 px-1" title="Text Color">
                        {EMAIL_TEXT_COLORS.map(swatch => (
                          <button
                            key={swatch.hex}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              execEditorCommand('foreColor', swatch.hex);
                            }}
                            title={`Color: ${swatch.label}`}
                            style={{ backgroundColor: swatch.hex }}
                            className="w-4 h-4 rounded-full border border-slate-300 hover:scale-110 transition-transform cursor-pointer"
                          />
                        ))}
                      </div>

                      <div className="w-px h-5 bg-slate-300 mx-0.5" />

                      {/* Insert Link */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleOpenLinkPopover();
                        }}
                        title="Insert Hyperlink"
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          showLinkPopover ? 'bg-indigo-100 text-indigo-950' : 'hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                      </button>

                      {/* Clear Formatting */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execEditorCommand('removeFormat');
                        }}
                        title="Clear Text Formatting"
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <RemoveFormatting className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-5 bg-slate-300 mx-0.5" />

                      {/* Place Button at Cursor Shortcut */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handlePlaceNewButtonAtCursor();
                        }}
                        title="Place a CTA button at current cursor position in message"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3 text-amber-700" />
                        <span>Place Button at Cursor</span>
                      </button>
                    </div>

                    {/* Inline Insert Link Bar */}
                    {showLinkPopover && (
                      <div className="px-3 py-2.5 bg-indigo-50/70 border-b border-indigo-200 flex flex-wrap items-center gap-2">
                        <input
                          type="url"
                          value={linkUrlInput}
                          onChange={(e) => setLinkUrlInput(e.target.value)}
                          placeholder="https://nexgencouncil.bond"
                          className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        {(!savedSelectionRef.current || savedSelectionRef.current.collapsed) && (
                          <input
                            type="text"
                            value={linkTextInput}
                            onChange={(e) => setLinkTextInput(e.target.value)}
                            placeholder="Link label text"
                            className="w-40 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleInsertLink}
                          className="px-3 py-1.5 rounded-lg bg-indigo-950 text-white text-[11px] font-semibold hover:bg-indigo-900 cursor-pointer"
                        >
                          Insert Link
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLinkPopover(false)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* ContentEditable Canvas */}
                    <div className="relative">
                      {!message && !htmlBody && (
                        <div className="pointer-events-none absolute top-3.5 left-4 text-sm text-slate-400">
                          Write your official message here. Use the toolbar above for headings, bold, italic, underline, colors, lists, and links...
                        </div>
                      )}
                      <div
                        ref={editorRef}
                        contentEditable={!isSending}
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Rich Email Message Body"
                        onInput={syncEditorFromDom}
                        onBlur={syncEditorFromDom}
                        onKeyUp={captureEditorSelection}
                        onMouseUp={captureEditorSelection}
                        onFocus={captureEditorSelection}
                        className={RICH_CONTENT_LIGHT_CLASSES}
                      />
                    </div>
                  </div>
                </div>

                {/* Email Action CTA Buttons Builder */}
                <div
                  ref={buttonsSectionRef}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <ExternalLink className="w-4 h-4 text-indigo-900" />
                        <span>Call-to-Action (CTA) Buttons ({emailButtons.length}/5)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Add, edit, and choose exactly where each button sits (Above Message, Inside Message at Cursor, or Below Message).
                      </p>
                    </div>
                  </div>

                  {/* Quick Website Preset Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 mr-1">Quick Add:</span>
                    {EMAIL_BUTTON_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={isSending || emailButtons.length >= 5}
                        onClick={() => handleAddPresetButton(preset)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-indigo-950 hover:text-white hover:border-indigo-950 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Button Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      disabled={isSending || emailButtons.length >= 5}
                      value={newButtonLabel}
                      onChange={e => setNewButtonLabel(e.target.value)}
                      placeholder="Button Label (e.g. Join Session Now)"
                      className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <input
                      type="text"
                      disabled={isSending || emailButtons.length >= 5}
                      value={newButtonUrl}
                      onChange={e => setNewButtonUrl(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddButton();
                        }
                      }}
                      placeholder="Target URL (https://..., /volunteer, mailto:..., tel:...)"
                      className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <select
                      aria-label="Button Color Style"
                      value={newButtonStyle}
                      onChange={e => setNewButtonStyle(e.target.value as 'amber' | 'primary' | 'outline')}
                      disabled={isSending}
                      className="sm:col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="amber">Gold Amber</option>
                      <option value="primary">Council Indigo</option>
                      <option value="outline">Gold Outline</option>
                    </select>
                    <select
                      aria-label="Button Alignment"
                      value={newButtonAlign}
                      onChange={e => setNewButtonAlign(e.target.value as 'left' | 'center' | 'right')}
                      disabled={isSending}
                      className="sm:col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      <option value="center">Align: Center</option>
                      <option value="left">Align: Left</option>
                      <option value="right">Align: Right</option>
                    </select>
                  </div>

                  {/* Placement Selector + Add Button Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-600 mr-1">
                        Where to place:
                      </span>
                      {(
                        [
                          { id: 'top', label: 'Top (Above Message)' },
                          { id: 'inline', label: 'Inside Message (At Cursor)' },
                          { id: 'bottom', label: 'Bottom (Below Message)' }
                        ] as const
                      ).map(pos => (
                        <button
                          key={pos.id}
                          type="button"
                          disabled={isSending}
                          onClick={() => setNewButtonPlacement(pos.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            newButtonPlacement === pos.id
                              ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-2xs'
                              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={isSending || emailButtons.length >= 5 || !newButtonLabel.trim() || !newButtonUrl.trim()}
                      onClick={handleAddButton}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Add Button</span>
                    </button>
                  </div>

                  {/* Configured Buttons List with Edit + Placement Controls */}
                  {emailButtons.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200/80">
                      {emailButtons.map((btn, idx) => {
                        const isEditing = editingButtonId === btn.id;
                        const activePlacement = btn.placement || 'bottom';
                        const activeHtmlCheck = htmlBody || message || '';
                        const hasMarkerInBody = activeHtmlCheck.includes(`[[BUTTON:${btn.id}]]`);
                        const previewChipClass =
                          btn.style === 'primary'
                            ? 'bg-indigo-700 text-white border-indigo-600'
                            : btn.style === 'outline'
                            ? 'bg-slate-900 text-amber-300 border-amber-400'
                            : 'bg-amber-400 text-slate-950 border-amber-500';
                        const placementLabel =
                          activePlacement === 'top'
                            ? 'Top (Above Message)'
                            : activePlacement === 'inline'
                            ? 'Inside Message'
                            : 'Bottom (Below Message)';

                        return (
                          <div
                            key={btn.id}
                            className={`rounded-xl bg-white border transition-all shadow-2xs ${
                              isEditing ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                            }`}
                          >
                            {/* Summary Row */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span className="text-[10px] font-bold text-slate-400 font-mono">
                                  #{idx + 1}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg border text-[11px] font-bold truncate max-w-[200px] ${previewChipClass}`}
                                >
                                  {btn.label || 'Untitled Button'}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                    activePlacement === 'top'
                                      ? 'bg-sky-50 text-sky-900 border-sky-200'
                                      : activePlacement === 'inline'
                                      ? 'bg-amber-50 text-amber-950 border-amber-300'
                                      : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                  }`}
                                >
                                  Place: {placementLabel}
                                </span>
                                <span className="text-[10px] font-semibold uppercase text-slate-500">
                                  Align: {btn.align || 'center'}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[180px]">
                                  {btn.url}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setEditingButtonId(isEditing ? null : btn.id)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                    isEditing
                                      ? 'bg-indigo-950 text-white border-indigo-950'
                                      : 'bg-indigo-50 text-indigo-950 border-indigo-200 hover:bg-indigo-100'
                                  }`}
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{isEditing ? 'Close Edit' : 'Edit / Place'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveButton(idx, -1)}
                                  disabled={idx === 0}
                                  title="Move up"
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveButton(idx, 1)}
                                  disabled={idx === emailButtons.length - 1}
                                  title="Move down"
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveButton(btn.id)}
                                  title="Remove button"
                                  className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Warning if Marker Deleted */}
                            {activePlacement === 'inline' && !hasMarkerInBody && (
                              <div className="mx-3 mb-2.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
                                <span>
                                  Marker <code className="font-mono font-bold">[[BUTTON:{btn.id}]]</code> is not inside your message yet (will fall back to Bottom unless inserted).
                                </span>
                                <button
                                  type="button"
                                  onClick={() => insertButtonMarkerIntoEditor(btn.id, true)}
                                  className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                                >
                                  Insert in Message Now
                                </button>
                              </div>
                            )}

                            {/* Expanded Edit & Placement Panel */}
                            {isEditing && (
                              <div className="p-3.5 pt-3 border-t border-slate-100 bg-slate-50/70 rounded-b-xl space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                      Button Label
                                    </label>
                                    <input
                                      type="text"
                                      value={btn.label}
                                      onChange={e => handleUpdateButton(btn.id, { label: e.target.value })}
                                      placeholder="Button label"
                                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                      Target Link URL
                                    </label>
                                    <input
                                      type="text"
                                      value={btn.url}
                                      onChange={e => handleUpdateButton(btn.id, { url: e.target.value })}
                                      placeholder="https://... or /path"
                                      className={`w-full px-3 py-2 rounded-lg border bg-white text-xs font-mono focus:outline-none focus:ring-2 ${
                                        isValidEmailButtonUrl(btn.url)
                                          ? 'border-slate-300 text-slate-800 focus:ring-indigo-300'
                                          : 'border-rose-300 bg-rose-50 text-rose-700 focus:ring-rose-300'
                                      }`}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                      Button Color Style
                                    </label>
                                    <select
                                      value={btn.style || 'amber'}
                                      onChange={e =>
                                        handleUpdateButton(btn.id, {
                                          style: e.target.value as 'amber' | 'primary' | 'outline'
                                        })
                                      }
                                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 cursor-pointer"
                                    >
                                      <option value="amber">Gold Amber</option>
                                      <option value="primary">Council Indigo</option>
                                      <option value="outline">Gold Outline</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                      Horizontal Alignment
                                    </label>
                                    <select
                                      value={btn.align || 'center'}
                                      onChange={e =>
                                        handleUpdateButton(btn.id, {
                                          align: e.target.value as 'left' | 'center' | 'right'
                                        })
                                      }
                                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 cursor-pointer"
                                    >
                                      <option value="center">Center</option>
                                      <option value="left">Left</option>
                                      <option value="right">Right</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Placement Editor */}
                                <div className="space-y-1.5">
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Email Position / Where to Place This Button
                                  </label>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {(
                                      [
                                        { id: 'top', label: 'Top (Above Message)' },
                                        { id: 'inline', label: 'Inside Message (At Marker)' },
                                        { id: 'bottom', label: 'Bottom (Below Message)' }
                                      ] as const
                                    ).map(pos => (
                                      <button
                                        key={pos.id}
                                        type="button"
                                        onClick={() => handleChangeButtonPlacement(btn.id, pos.id)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                          activePlacement === pos.id
                                            ? 'bg-indigo-950 text-white border-indigo-950'
                                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                        }`}
                                      >
                                        {pos.label}
                                      </button>
                                    ))}

                                    {activePlacement === 'inline' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          insertButtonMarkerIntoEditor(btn.id, true);
                                          addToast('Moved button marker to your current cursor position.', 'success');
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
                                      >
                                        Move Marker to Cursor
                                      </button>
                                    )}
                                  </div>
                                  {activePlacement === 'inline' && (
                                    <p className="text-[10px] text-slate-500">
                                      Tip: Keep <code className="font-mono font-semibold text-slate-700">[[BUTTON:{btn.id}]]</code> wherever you want this button to appear inside your message body.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Email Body Images Builder */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-indigo-900" />
                        <span>Email Images &amp; Banners ({emailImages.length}/10)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Upload photos or paste HTTPS image links to include inside this email.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={newImagePlacement}
                        onChange={(e) => setNewImagePlacement(e.target.value === 'top' ? 'top' : 'bottom')}
                        disabled={isSending}
                        aria-label="Default placement for newly added images"
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
                      >
                        <option value="bottom">Place: Below Message</option>
                        <option value="top">Place: Above Message (Banner)</option>
                      </select>

                      <input
                        ref={bodyImageFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleUploadBodyImages}
                      />
                      <button
                        type="button"
                        disabled={isSending || uploadingBodyImage || emailImages.length >= 10}
                        onClick={() => bodyImageFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {uploadingBodyImage ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{uploadingBodyImage ? 'Uploading...' : 'Upload Image'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Add Image by URL */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        disabled={isSending || emailImages.length >= 10}
                        value={newImageUrlInput}
                        onChange={(e) => setNewImageUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBodyImageByUrl();
                          }
                        }}
                        placeholder="Paste image URL (https://i.postimg.cc/... or /uploads/...)"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isSending || !newImageUrlInput.trim() || emailImages.length >= 10}
                      onClick={handleAddBodyImageByUrl}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Add URL
                    </button>
                  </div>

                  {/* Attached Image List */}
                  {emailImages.length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      {emailImages.map((img, idx) => (
                        <div
                          key={img.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-2xs"
                        >
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 shrink-0 flex items-center justify-center">
                            <img
                              src={img.url}
                              alt={img.alt || 'Attached visual'}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const el = e.currentTarget;
                                if (!el.dataset.fallbackApplied) {
                                  el.dataset.fallbackApplied = '1';
                                  el.src = '/logo.png';
                                  el.className = 'w-full h-full object-contain opacity-60 p-1';
                                }
                              }}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="text-[11px] font-mono text-slate-500 truncate">{img.url}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={img.caption || ''}
                                onChange={(e) => handleUpdateBodyImage(img.id, { caption: e.target.value })}
                                placeholder="Optional caption under image..."
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                              />
                              <select
                                value={img.placement || 'bottom'}
                                onChange={(e) =>
                                  handleUpdateBodyImage(img.id, {
                                    placement: e.target.value === 'top' ? 'top' : 'bottom'
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer"
                              >
                                <option value="bottom">Below Message Body</option>
                                <option value="top">Above Message (Banner)</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveBodyImage(idx, -1)}
                              disabled={idx === 0}
                              title="Move up"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveBodyImage(idx, 1)}
                              disabled={idx === emailImages.length - 1}
                              title="Move down"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveBodyImage(img.id)}
                              title="Remove image"
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit Footer */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">
                    Sending as <strong className="text-slate-800">{effectiveDisplayName}</strong> ({effectiveSenderEmail})
                  </span>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 text-amber-400" />
                        <span>Send Email</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Side Editable Sender Identity & Tips */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-slate-900 text-white rounded-3xl p-6 space-y-4 border border-slate-800 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-sm">Sender Identity</h3>
                    <p className="text-[11px] text-slate-400">Editable From Name &amp; Email</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3.5 text-xs bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label htmlFor="sender-display-name" className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Sender Display Name
                  </label>
                  <input
                    id="sender-display-name"
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. NexGen Council"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="sender-email-input" className="text-[11px] font-semibold text-slate-300">
                      Sender Email Address
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseCustomDomainEmail(prev => !prev)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                    >
                      {useCustomDomainEmail ? 'Use @nexgencouncil.bond' : 'Edit Full Email'}
                    </button>
                  </div>

                  {useCustomDomainEmail ? (
                    <input
                      id="sender-email-input"
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="info@nexgencouncil.bond"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                    />
                  ) : (
                    <div className="flex items-center rounded-xl bg-slate-900 border border-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-amber-400/50">
                      <input
                        id="sender-email-input"
                        type="text"
                        value={senderPrefix}
                        onChange={(e) => handlePrefixChange(e.target.value)}
                        placeholder="admin"
                        className="w-full min-w-0 px-3 py-2 bg-transparent text-amber-300 font-mono text-xs focus:outline-none"
                      />
                      <span className="px-2.5 py-2 bg-slate-800 text-slate-300 font-mono text-[11px] border-l border-slate-700 shrink-0 flex items-center gap-0.5">
                        <AtSign className="w-3 h-3 text-slate-400" />
                        {VERIFIED_DOMAIN}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Any handle on <span className="text-emerald-400 font-semibold">{VERIFIED_DOMAIN}</span> (like{' '}
                    <span className="font-mono">info</span>, <span className="font-mono">events</span>,{' '}
                    <span className="font-mono">secretary</span>) works immediately with your verified Resend domain.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="email-header-logo" className="text-[11px] font-semibold text-slate-300">
                      Header Brand Logo (Optional)
                    </label>
                    <div className="flex items-center gap-2">
                      {logoUrl.trim() && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                      {logoUrl.trim() !== DEFAULT_COUNCIL_LOGO_URL && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl(DEFAULT_COUNCIL_LOGO_URL)}
                          className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                        >
                          Use Council Logo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700 shrink-0 flex items-center justify-center overflow-hidden p-1">
                      {logoUrl.trim() ? (
                        <img
                          src={logoUrl.trim()}
                          alt="Header Logo Preview"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (!el.dataset.fallbackApplied) {
                              el.dataset.fallbackApplied = '1';
                              el.src = '/logo.png';
                            }
                          }}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-slate-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        id="email-header-logo"
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://... or /uploads/logo.png"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                      />
                    </div>

                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadLogoFile}
                    />
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoFileInputRef.current?.click()}
                      title="Upload header logo image"
                      className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[11px] font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                    >
                      {uploadingLogo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Upload</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSenderSettings}
                  disabled={isSavingSender}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSavingSender ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Sender...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save as Default Sender</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-3 text-xs">
              <h3 className="font-serif font-bold text-sm text-slate-900">Quick Usage Tips</h3>
              <ul className="space-y-2 text-slate-600 leading-relaxed list-disc pl-4">
                <li>Change <strong>Sender Display Name</strong>, prefix, or <strong>Header Brand Logo</strong> above anytime—save permanently or customize per email.</li>
                <li>Use <strong>Email Images &amp; Banners</strong> below the editor to upload photos or paste HTTPS URLs (place above or below your message).</li>
                <li>Separate multiple recipients with commas (up to 50 addresses per send) and inspect all dispatches in <strong>Sent History</strong>.</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* SENT EMAIL HISTORY VIEW */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70">
            <div className="flex flex-wrap items-center gap-2">
              {(['All', 'Sent', 'Failed'] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setHistoryStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    historyStatusFilter === status
                      ? 'bg-indigo-950 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search recipient, subject, sender, ID..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                title="Refresh history"
                className="p-2 rounded-xl border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin text-indigo-900' : ''}`} />
              </button>
            </div>
          </div>

          {loadingHistory && historyLogs.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-900" />
              <span>Loading email history...</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-16 text-center space-y-2">
              <Mail className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="font-serif font-bold text-base text-slate-800">No Sent Emails Found</h3>
              <p className="text-xs text-slate-500">
                {historyLogs.length === 0
                  ? 'Emails you send from the composer will be recorded here automatically.'
                  : 'No sent email logs match your current search or filter.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredHistory.map(log => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="p-5 hover:bg-slate-50/90 transition-colors cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          log.status === 'Sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {log.status === 'Sent' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {log.status}
                      </span>

                      <span className="text-sm font-bold text-slate-900 truncate">
                        {log.subject}
                      </span>

                      {((log.images && log.images.length > 0) || log.logoUrl) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200">
                          <ImageIcon className="w-3 h-3" />
                          {log.images && log.images.length > 0
                            ? `${log.images.length} image${log.images.length > 1 ? 's' : ''}`
                            : 'Logo'}
                        </span>
                      )}

                      {Array.isArray(log.buttons) && log.buttons.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                          <ExternalLink className="w-3 h-3" />
                          {log.buttons.length} button{log.buttons.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-700">From:</strong> {log.fromName} &lt;{log.fromEmail}&gt;
                      </span>
                      <span className="truncate max-w-md">
                        <strong className="text-slate-700">To:</strong>{' '}
                        {log.to.length > 0 ? (
                          <>
                            {log.to.slice(0, 2).join(', ')}
                            {log.to.length > 2 ? ` +${log.to.length - 2} more` : ''}
                          </>
                        ) : (
                          <span className="italic text-slate-400">Undisclosed (BCC)</span>
                        )}
                      </span>
                      {Array.isArray(log.cc) && log.cc.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          CC: {log.cc.length}
                        </span>
                      )}
                      {Array.isArray(log.bcc) && log.bcc.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 font-semibold text-[11px]">
                          BCC: {log.bcc.length}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-1">{log.message}</p>

                    {log.status === 'Failed' && log.error && (
                      <p className="text-[11px] text-rose-600 font-medium">Error: {log.error}</p>
                    )}
                  </div>

                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">
                      {new Date(log.sentAt).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      {log.resendId && (
                        <span className="font-mono px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600">
                          {log.resendId}
                        </span>
                      )}
                      {log.sentByName && (
                        <span className="text-slate-400">by {log.sentByName}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Email History Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setSelectedLog(null);
                setConfirmDeleteId(null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    selectedLog.status === 'Sent'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {selectedLog.status === 'Sent' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  {selectedLog.status}
                </span>
                {selectedLog.resendId && (
                  <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                    ID: {selectedLog.resendId}
                  </span>
                )}
              </div>

              <h3 className="text-xl font-serif font-bold text-slate-900">
                {selectedLog.subject}
              </h3>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 font-semibold">From:</span>{' '}
                <span className="text-slate-900 font-medium">
                  {selectedLog.fromName} &lt;{selectedLog.fromEmail}&gt;
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold">To ({selectedLog.to.length}):</span>{' '}
                <span className="text-slate-900 font-mono break-all">
                  {selectedLog.to.length > 0 ? selectedLog.to.join(', ') : 'Undisclosed Recipients'}
                </span>
              </div>
              {Array.isArray(selectedLog.cc) && selectedLog.cc.length > 0 && (
                <div>
                  <span className="text-slate-500 font-semibold">CC ({selectedLog.cc.length}):</span>{' '}
                  <span className="text-slate-900 font-mono break-all">
                    {selectedLog.cc.join(', ')}
                  </span>
                </div>
              )}
              {Array.isArray(selectedLog.bcc) && selectedLog.bcc.length > 0 && (
                <div>
                  <span className="text-slate-500 font-semibold">BCC ({selectedLog.bcc.length}):</span>{' '}
                  <span className="text-slate-900 font-mono break-all">
                    {selectedLog.bcc.join(', ')}
                  </span>
                </div>
              )}
              {selectedLog.replyTo && (
                <div>
                  <span className="text-slate-500 font-semibold">Reply-To:</span>{' '}
                  <span className="text-slate-800 font-mono">{selectedLog.replyTo}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-slate-500">
                <span>
                  Sent: <strong className="text-slate-700">{new Date(selectedLog.sentAt).toLocaleString()}</strong>
                </span>
                {selectedLog.sentByName && (
                  <span>
                    Admin: <strong className="text-slate-700">{selectedLog.sentByName}</strong>
                  </span>
                )}
              </div>
            </div>

            {selectedLog.status === 'Failed' && selectedLog.error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <strong>Delivery Error:</strong> {selectedLog.error}
              </div>
            )}

            <div className="rounded-2xl bg-slate-950 text-slate-100 p-5 border border-slate-800 space-y-4">
              {selectedLog.logoUrl && (
                <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                  <img
                    src={selectedLog.logoUrl}
                    alt={`${selectedLog.fromName} Logo`}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-contain bg-slate-900 border border-slate-700 p-1"
                  />
                  <div>
                    <div className="text-xs text-white font-bold">{selectedLog.fromName}</div>
                    <div className="text-[11px] text-slate-400">Women Empowerment &amp; Youth Leadership Council</div>
                  </div>
                </div>
              )}

              {selectedLog.images && selectedLog.images.filter(i => i.placement === 'top').length > 0 && (
                <div className="space-y-2">
                  {selectedLog.images
                    .filter(i => i.placement === 'top')
                    .map(img => (
                      <div key={img.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                        <img
                          src={img.url}
                          alt={img.alt || 'Banner'}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-56 object-contain mx-auto"
                        />
                        {img.caption && (
                          <div className="px-3 py-1.5 text-[11px] text-slate-400 text-center border-t border-slate-800">
                            {img.caption}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {renderEmailBodyWithButtonPlacements(
                selectedLog.html || '',
                selectedLog.message || '',
                Array.isArray(selectedLog.buttons) ? selectedLog.buttons : []
              )}

              {selectedLog.images && selectedLog.images.filter(i => (i.placement || 'bottom') === 'bottom').length > 0 && (
                <div className="space-y-2 pt-2">
                  {selectedLog.images
                    .filter(i => (i.placement || 'bottom') === 'bottom')
                    .map(img => (
                      <div key={img.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                        <img
                          src={img.url}
                          alt={img.alt || 'Attachment'}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-56 object-contain mx-auto"
                        />
                        {img.caption && (
                          <div className="px-3 py-1.5 text-[11px] text-slate-400 text-center border-t border-slate-800">
                            {img.caption}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                {isAdminUser && (
                  confirmDeleteId === selectedLog.id ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteLog(selectedLog.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Confirm Delete</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedLog.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Record</span>
                    </button>
                  )
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLog(null);
                    setConfirmDeleteId(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleReuseLog(selectedLog)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reuse in Composer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
