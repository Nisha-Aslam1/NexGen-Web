import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { EmailImage, EmailLog } from '../../types.ts';
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
  ArrowDown
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
  if (clean.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

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
  const [replyTo, setReplyTo] = useState<string>(settings?.emailReplyTo || settings?.contactEmail || '');
  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [emailImages, setEmailImages] = useState<EmailImage[]>([]);
  const [newImageUrlInput, setNewImageUrlInput] = useState<string>('');
  const [newImagePlacement, setNewImagePlacement] = useState<'top' | 'bottom'>('bottom');
  const [uploadingBodyImage, setUploadingBodyImage] = useState<boolean>(false);
  const bodyImageFileInputRef = useRef<HTMLInputElement>(null);
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
      const data = await res.json();
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
      const data = await res.json();
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

  // Parse comma-separated recipients live
  const parsedRecipients = useMemo(() => {
    const items = toInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const unique: string[] = Array.from<string>(new Set(items));
    const valid = unique.filter(e => EMAIL_REGEX.test(e));
    const invalid = unique.filter(e => !EMAIL_REGEX.test(e));

    return { unique, valid, invalid };
  }, [toInput]);

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
        (log.resendId && log.resendId.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [historyLogs, historySearch, historyStatusFilter]);

  const handlePrefixChange = (rawPrefix: string) => {
    const cleaned = rawPrefix.replace(/[@\s<>]/g, '').toLowerCase();
    setSenderEmail(`${cleaned}@${VERIFIED_DOMAIN}`);
  };

  const uploadImageFile = async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose a valid image file (PNG, JPG, WebP, GIF).');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image is too large. Please select an image under 10MB.');
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });

    const res = await authFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename: file.name })
    });
    const data = await res.json();
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
      const uploadedUrl = await uploadImageFile(file);
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
        const uploadedUrl = await uploadImageFile(file);
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
      const data = await res.json();
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
      setMessage(preset.message);
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

    if (parsedRecipients.valid.length === 0) {
      const errMsg = 'Please enter at least one valid recipient email address.';
      setStatusBanner({ type: 'error', title: 'Validation Error', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (parsedRecipients.invalid.length > 0) {
      const errMsg = `Invalid email format detected: ${parsedRecipients.invalid.join(', ')}`;
      setStatusBanner({ type: 'error', title: 'Invalid Recipient Format', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (!subject.trim()) {
      const errMsg = 'Email subject is required.';
      setStatusBanner({ type: 'error', title: 'Missing Subject', detail: errMsg });
      addToast(errMsg, 'error');
      return;
    }

    if (!message.trim() && emailImages.length === 0) {
      const errMsg = 'Please enter a message body or attach at least one image before sending.';
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
          to: parsedRecipients.valid,
          subject: subject.trim(),
          message: message.trim(),
          replyTo: replyTo.trim() || undefined,
          fromName: activeFromName,
          fromEmail: activeFromEmail,
          logoUrl: activeLogoUrl,
          images: emailImages
        })
      });

      const payload = await res.json();

      if (payload.log) {
        setHistoryLogs(prev => [payload.log, ...prev]);
      } else {
        loadHistory();
      }

      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to dispatch email.');
      }

      const msgId = payload.data?.id;
      const recipientCount = payload.data?.recipients?.length || parsedRecipients.valid.length;

      setStatusBanner({
        type: 'success',
        title: `Email Sent Successfully to ${recipientCount} Recipient${recipientCount > 1 ? 's' : ''}`,
        detail: `Dispatched from ${activeFromName} <${activeFromEmail}>.`,
        messageId: msgId
      });

      addToast(`Email delivered! ID: ${msgId}`, 'success');

      // Reset composer fields
      setToInput('');
      setSubject('');
      setMessage('');
      setEmailImages([]);
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
    setToInput(log.to.join(', '));
    setSubject(log.subject);
    setMessage(log.message === '[HTML Content]' ? '' : log.message);
    if (log.replyTo) setReplyTo(log.replyTo);
    setSelectedLog(null);
    setActiveView('compose');
    setShowPreview(false);
    addToast('Loaded email details and images into composer.', 'info');
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm('Remove this email entry from sent history?')) return;
    try {
      const res = await authFetch(`/api/email/history/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not delete email record.');
      }
      setHistoryLogs(prev => prev.filter(l => l.id !== id));
      if (selectedLog?.id === id) setSelectedLog(null);
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

                <div className="rounded-2xl bg-slate-950 p-6 sm:p-8 border border-slate-800 text-slate-100 space-y-5">
                  <div className="border-b border-slate-800 pb-5 flex items-center gap-4">
                    {logoUrl.trim() && (
                      <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-700 p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
                        <img
                          src={logoUrl.trim()}
                          alt={`${effectiveDisplayName} Logo`}
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

                  <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[120px]">
                    {message.trim() || 'Your formatted email message body will render here inside the branded email template.'}
                  </div>

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

                {/* To Recipients */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="email-to" className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-900" />
                      <span>To (Recipient Email) *</span>
                    </label>
                    {parsedRecipients.unique.length > 0 && (
                      <span
                        className={`text-[11px] font-semibold ${
                          parsedRecipients.invalid.length > 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {parsedRecipients.valid.length} valid
                        {parsedRecipients.invalid.length > 0 ? ` • ${parsedRecipients.invalid.length} invalid` : ''}
                      </span>
                    )}
                  </div>

                  <input
                    id="email-to"
                    type="text"
                    required
                    disabled={isSending}
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    placeholder="member@example.com or comma-separated: one@example.com, two@example.com"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-slate-900 focus:outline-none focus:ring-2 ${
                      parsedRecipients.invalid.length > 0
                        ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-indigo-300'
                    }`}
                  />

                  {parsedRecipients.invalid.length > 0 && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">
                      Invalid email(s): {parsedRecipients.invalid.join(', ')}
                    </p>
                  )}
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

                {/* Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="email-body" className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>Message Body {emailImages.length === 0 ? '*' : '(Optional if image attached)'}</span>
                    </label>
                    <span className="text-[11px] text-slate-400">{message.length} characters</span>
                  </div>
                  <textarea
                    id="email-body"
                    rows={9}
                    required={emailImages.length === 0}
                    disabled={isSending}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your official message here. Blank lines create clean paragraphs inside the branded email template..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
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
                        accept="image/png,image/jpeg,image/webp,image/gif"
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
                      accept="image/png,image/jpeg,image/webp,image/gif"
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
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        <strong className="text-slate-700">From:</strong> {log.fromName} &lt;{log.fromEmail}&gt;
                      </span>
                      <span className="truncate max-w-md">
                        <strong className="text-slate-700">To:</strong>{' '}
                        {log.to.slice(0, 2).join(', ')}
                        {log.to.length > 2 ? ` +${log.to.length - 2} more` : ''}
                      </span>
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
              onClick={() => setSelectedLog(null)}
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
                  {selectedLog.to.join(', ')}
                </span>
              </div>
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
                    alt="Header Logo"
                    className="w-10 h-10 rounded-lg object-contain bg-slate-900 border border-slate-700 p-1"
                  />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                      Header Logo Included
                    </div>
                    <div className="text-xs text-slate-300 font-semibold">{selectedLog.fromName}</div>
                  </div>
                </div>
              )}

              {selectedLog.images && selectedLog.images.filter(i => i.placement === 'top').length > 0 && (
                <div className="space-y-2">
                  {selectedLog.images
                    .filter(i => i.placement === 'top')
                    .map(img => (
                      <div key={img.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                        <img src={img.url} alt={img.alt || 'Banner'} className="w-full max-h-56 object-contain mx-auto" />
                        {img.caption && (
                          <div className="px-3 py-1.5 text-[11px] text-slate-400 text-center border-t border-slate-800">
                            {img.caption}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {selectedLog.message}
              </div>

              {selectedLog.images && selectedLog.images.filter(i => (i.placement || 'bottom') === 'bottom').length > 0 && (
                <div className="space-y-2 pt-2">
                  {selectedLog.images
                    .filter(i => (i.placement || 'bottom') === 'bottom')
                    .map(img => (
                      <div key={img.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                        <img src={img.url} alt={img.alt || 'Attachment'} className="w-full max-h-56 object-contain mx-auto" />
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
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(selectedLog.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
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
