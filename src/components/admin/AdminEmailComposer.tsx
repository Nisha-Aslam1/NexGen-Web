import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
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
  Users
} from 'lucide-react';

interface EmailPreset {
  id: string;
  label: string;
  subject: string;
  message: string;
}

const EMAIL_PRESETS: EmailPreset[] = [
  {
    id: 'custom',
    label: 'Custom Message',
    subject: '',
    message: ''
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

export const AdminEmailComposer: React.FC = () => {
  const { addToast, settings } = useApp();

  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [toInput, setToInput] = useState<string>('');
  const [replyTo, setReplyTo] = useState<string>(settings?.contactEmail || '');
  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    title: string;
    detail: string;
    messageId?: string;
  } | null>(null);

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

    if (!message.trim()) {
      const errMsg = 'Please enter a message body before sending.';
      setStatusBanner({ type: 'error', title: 'Missing Message', detail: errMsg });
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
          replyTo: replyTo.trim() || undefined
        })
      });

      const payload = await res.json();

      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to dispatch email.');
      }

      const msgId = payload.data?.id;
      const recipientCount = payload.data?.recipients?.length || parsedRecipients.valid.length;

      setStatusBanner({
        type: 'success',
        title: `Email Sent Successfully to ${recipientCount} Recipient${recipientCount > 1 ? 's' : ''}`,
        detail: `Dispatched from NexGen Council <admin@nexgencouncil.bond>.`,
        messageId: msgId
      });

      addToast(`Email delivered! ID: ${msgId}`, 'success');

      // Reset composer fields
      setToInput('');
      setSubject('');
      setMessage('');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-950 text-amber-400 shadow-xs">
              <Mail className="w-5 h-5" />
            </span>
            <span>Official Email Composer</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Send branded NexGen Council communications from{' '}
            <span className="font-mono font-semibold text-indigo-950">admin@nexgencouncil.bond</span> via Resend.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPreview(prev => !prev)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer self-start sm:self-auto ${
            showPreview
              ? 'bg-indigo-950 text-white border-indigo-950'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {showPreview ? <Edit3 className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-slate-500" />}
          <span>{showPreview ? 'Back to Editor' : 'Preview Email Template'}</span>
        </button>
      </div>

      {/* Status Banner (Success / Error Feedback) */}
      {statusBanner && (
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

      {/* Main Content Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Composer Form */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8">
          {showPreview ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Live HTML Email Template Preview
                </span>
                <span className="text-[11px] font-mono text-slate-400">From: NexGen Council &lt;admin@nexgencouncil.bond&gt;</span>
              </div>

              <div className="rounded-2xl bg-slate-950 p-6 sm:p-8 border border-slate-800 text-slate-100 space-y-5">
                <div className="border-b border-slate-800 pb-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
                    Official Communication
                  </div>
                  <div className="text-xl font-bold text-white">NexGen Council</div>
                  <div className="text-xs text-slate-400">Women Empowerment &amp; Youth Leadership Council</div>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-white">
                    {subject.trim() || '(Email Subject Preview)'}
                  </h2>
                  <div className="w-12 h-0.5 bg-amber-500 mt-3 rounded-full" />
                </div>

                <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[140px]">
                  {message.trim() || 'Your formatted email message body will render here inside the NexGen Council branded template.'}
                </div>

                <div className="pt-5 border-t border-slate-800 text-center space-y-1 text-[11px] text-slate-500">
                  <div className="text-slate-300 font-semibold">NexGen Council • Executive Secretariat</div>
                  <div>Sent from <span className="text-amber-400">nexgencouncil.bond</span></div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendEmail} className="space-y-5 text-xs">
              {/* Template Preset Selector */}
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
                    <span>Message Body *</span>
                  </label>
                  <span className="text-[11px] text-slate-400">{message.length} characters</span>
                </div>
                <textarea
                  id="email-body"
                  rows={10}
                  required
                  disabled={isSending}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your official message here. Blank lines create clean paragraphs inside the branded NexGen Council email template..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Submit Footer */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  Wrapped automatically in NexGen Council responsive HTML template.
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

        {/* Side Info & Sender Details */}
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-slate-900 text-white rounded-3xl p-6 space-y-4 border border-slate-800 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-sm">Sender Identity</h3>
                <p className="text-[11px] text-slate-400">Verified Domain Dispatch</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Display Name:</span>
                <span className="font-semibold text-white">NexGen Council</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Sender Email:</span>
                <span className="font-mono text-amber-300">admin@nexgencouncil.bond</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Verified Domain:</span>
                <span className="text-emerald-400 font-semibold">nexgencouncil.bond</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-3 text-xs">
            <h3 className="font-serif font-bold text-sm text-slate-900">Quick Usage Tips</h3>
            <ul className="space-y-2 text-slate-600 leading-relaxed list-disc pl-4">
              <li>Separate multiple recipients with commas (up to 50 addresses per send).</li>
              <li>Use the <strong>Template Preset</strong> dropdown to auto-fill common announcements and welcome emails.</li>
              <li>Switch to <strong>Preview Email Template</strong> anytime to inspect formatting before sending.</li>
              <li>All dispatched emails are logged securely in <strong>Activity Logs</strong>.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
