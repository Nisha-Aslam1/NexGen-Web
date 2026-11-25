import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Trash2,
  MessageCircle,
  Globe,
  Headphones,
  Search,
  RefreshCw,
  ExternalLink,
  Bot,
  Clock,
  Sparkles,
  UserCheck,
  Inbox,
  MessageSquareText,
  X,
  Send,
  Smartphone,
  Loader2
} from 'lucide-react';
import { ContactMessage, SupportConversation } from '../../types.ts';
import {
  SupportRichText,
  stripSupportFormattingForPreview
} from '../common/SupportRichText.tsx';

type SourceFilter = 'All' | 'Support Widget' | 'Contact Page';
type MainView = 'inquiries' | 'ai_logs';
type AiFilter = 'all' | 'escalated' | 'ai_only';

const WIDGET_ONLY_SUBJECTS = [
  'Certificate / Cohort Verification',
  'Volunteer / Fellowship Application',
  'Event / Meeting Access Issue',
  'Website / Portal Bug Report'
];

function getMessageSource(msg: ContactMessage): 'Support Widget' | 'Contact Page' {
  const raw = typeof msg.source === 'string' ? msg.source.trim().toLowerCase() : '';
  if (raw.includes('widget')) return 'Support Widget';
  if (raw.includes('contact')) return 'Contact Page';
  if (typeof msg.whatsapp === 'string' && msg.whatsapp.trim().length > 0) return 'Support Widget';
  if (msg.subject && WIDGET_ONLY_SUBJECTS.includes(msg.subject.trim())) return 'Support Widget';
  return 'Contact Page';
}

function isUnreadStatus(status: string | undefined): boolean {
  return status === 'Unread' || status === 'New';
}

function toWhatsAppLink(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function formatRetentionRemaining(expiresAt?: string, updatedAt?: string): string {
  const targetMs = expiresAt
    ? new Date(expiresAt).getTime()
    : updatedAt
    ? new Date(updatedAt).getTime() + 7 * 24 * 60 * 60 * 1000
    : Date.now();
  const diffMs = Math.max(0, targetMs - Date.now());
  if (diffMs === 0) return 'Expiring soon';
  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.max(1, Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000)));
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

export const AdminContacts: React.FC = () => {
  const { addToast } = useApp();
  const [mainView, setMainView] = useState<MainView>('inquiries');

  // Inquiries Inbox State
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // AI 7-Day Chat Logs & Live Support State
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [aiModelName, setAiModelName] = useState<string>('gemini-3.5-flash-lite');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSearch, setAiSearch] = useState('');
  const [aiFilter, setAiFilter] = useState<AiFilter>('all');
  const [selectedConv, setSelectedConv] = useState<SupportConversation | null>(null);
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<string | null>(null);
  const [liveReplyText, setLiveReplyText] = useState('');
  const [sendingLiveReply, setSendingLiveReply] = useState(false);
  const [downloadingAndroidZip, setDownloadingAndroidZip] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/contacts');
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch {
      addToast('Failed to load inquiries', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const fetchAiConversations = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await authFetch('/api/support-ai/conversations');
      const data = await res.json();
      if (data?.model) setAiModelName(data.model);
      if (Array.isArray(data?.conversations)) {
        setConversations(data.conversations);
      }
    } catch {
      addToast('Failed to load 7-day AI support logs', 'error');
    } finally {
      setAiLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    fetchMessages();
    fetchAiConversations();
  }, [fetchMessages, fetchAiConversations]);

  const handleRefreshAll = () => {
    fetchMessages();
    fetchAiConversations();
  };

  const updateStatus = async (id: string, status: 'Read' | 'Replied') => {
    try {
      const res = await authFetch(`/api/contacts/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to update message');

      setMessages(prev => prev.map(m => (m.id === id ? updated : m)));
      if (selectedMessage?.id === id) setSelectedMessage(updated);
      addToast(`Marked as ${status}`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Error updating status', 'error');
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      const res = await authFetch(`/api/contacts/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      setMessages(prev => prev.filter(m => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);
      setConfirmDeleteId(null);
      addToast('Message deleted', 'info');
    } catch (err: any) {
      addToast(err.message || 'Error deleting message', 'error');
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const res = await authFetch(`/api/support-ai/conversations/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete conversation');

      setConversations(prev => prev.filter(c => c.id !== id));
      if (selectedConv?.id === id) setSelectedConv(null);
      setConfirmDeleteConvId(null);
      addToast('AI conversation deleted permanently', 'info');
    } catch (err: any) {
      addToast(err.message || 'Error deleting AI conversation', 'error');
    }
  };

  const handleSendLiveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConv || !liveReplyText.trim() || sendingLiveReply) return;
    const textToSend = liveReplyText.trim();
    setSendingLiveReply(true);
    try {
      const res = await authFetch(`/api/support-live/conversations/${selectedConv.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send live reply.');
      if (data.conversation) {
        setSelectedConv(data.conversation);
        setConversations(prev => prev.map(c => (c.id === data.conversation.id ? data.conversation : c)));
      }
      setLiveReplyText('');
      addToast('Live reply delivered to visitor widget!', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Error delivering live reply', 'error');
    } finally {
      setSendingLiveReply(false);
    }
  };

  const handleDownloadAndroidSource = async () => {
    if (downloadingAndroidZip) return;
    setDownloadingAndroidZip(true);
    try {
      const ticketRes = await authFetch('/api/support-live/android-project-ticket', {
        method: 'POST',
        headers: { Accept: 'application/json' }
      });
      const ticketData = await ticketRes.json().catch(() => null);
      if (ticketRes.ok && ticketData?.downloadUrl) {
        const a = document.createElement('a');
        a.href = ticketData.downloadUrl;
        a.download = ticketData.fileName || 'nexgen-support-android-project.zip';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        addToast(
          'Native Android APK project (.zip) downloading! Build via Android Studio or GitHub Actions.',
          'success'
        );
        return;
      }

      if (ticketRes.status !== 404) {
        throw new Error(ticketData?.error || `Download failed (HTTP ${ticketRes.status}).`);
      }

      const res = await authFetch('/api/support-live/android-project.zip');
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Download failed (HTTP ${res.status}).`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('Server returned an unexpected HTML page instead of the ZIP archive.');
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Downloaded archive was empty.');
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nexgen-support-android-project.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      addToast(
        'Native Android APK project (.zip) downloaded! Build via Android Studio or GitHub Actions.',
        'success'
      );
    } catch (err: any) {
      addToast(err?.message || 'Could not download Android APK project right now.', 'error');
    } finally {
      setDownloadingAndroidZip(false);
    }
  };

  const handleOpenLinkedAiChat = (aiConversationId?: string) => {
    if (!aiConversationId) return;
    const match = conversations.find(
      c => c.id === aiConversationId || c.sessionId === aiConversationId
    );
    if (match) {
      setSelectedMessage(null);
      setMainView('ai_logs');
      setSelectedConv(match);
    } else {
      addToast('This AI chat exceeded the 7-day retention window or was deleted.', 'info');
    }
  };

  const sourceCounts = useMemo(() => {
    let widget = 0;
    let contact = 0;
    let unread = 0;
    for (const msg of messages) {
      if (isUnreadStatus(msg.status)) unread++;
      if (getMessageSource(msg) === 'Support Widget') {
        widget++;
      } else {
        contact++;
      }
    }
    return { all: messages.length, widget, contact, unread };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter(msg => {
      const src = getMessageSource(msg);
      if (sourceFilter !== 'All' && src !== sourceFilter) return false;
      if (!q) return true;
      const phone = (msg.whatsapp || msg.phone || '').toLowerCase();
      return (
        msg.name.toLowerCase().includes(q) ||
        msg.email.toLowerCase().includes(q) ||
        phone.includes(q) ||
        msg.subject.toLowerCase().includes(q) ||
        msg.message.toLowerCase().includes(q)
      );
    });
  }, [messages, sourceFilter, searchQuery]);

  const aiStats = useMemo(() => {
    let totalMessages = 0;
    let escalatedCount = 0;
    for (const c of conversations) {
      totalMessages += (c.messages || []).length;
      if (c.escalatedToHuman) escalatedCount++;
    }
    return {
      totalChats: conversations.length,
      totalMessages,
      escalatedCount
    };
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = aiSearch.trim().toLowerCase();
    return conversations.filter(c => {
      if (aiFilter === 'escalated' && !c.escalatedToHuman) return false;
      if (aiFilter === 'ai_only' && c.escalatedToHuman) return false;
      if (!q) return true;
      return (
        (c.visitorName || '').toLowerCase().includes(q) ||
        (c.visitorEmail || '').toLowerCase().includes(q) ||
        (c.visitorWhatsapp || '').toLowerCase().includes(q) ||
        c.sessionId.toLowerCase().includes(q) ||
        (c.messages || []).some(m => m.text.toLowerCase().includes(q))
      );
    });
  }, [conversations, aiSearch, aiFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Public Inquiries &amp; Support AI Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Secretariat inquiries alongside 7-day persisted AI support conversations ({aiModelName}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMainView('inquiries')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mainView === 'inquiries'
                  ? 'bg-indigo-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Inquiries Inbox ({messages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView('ai_logs')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mainView === 'ai_logs'
                  ? 'bg-indigo-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Live &amp; AI Chats · 7d ({conversations.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={loading || aiLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-700 ${(loading || aiLoading) ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {mainView === 'inquiries' ? (
        <>
          {/* Source Breakdown Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setSourceFilter('All')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                sourceFilter === 'All'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-[11px] font-bold uppercase tracking-wider ${sourceFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Inquiries
              </p>
              <p className="text-2xl font-bold mt-1">{sourceCounts.all}</p>
            </button>

            <button
              type="button"
              onClick={() => setSourceFilter('Support Widget')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                sourceFilter === 'Support Widget'
                  ? 'bg-amber-50 text-amber-950 border-amber-400 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  Support Widget
                </p>
                <Headphones className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold mt-1 text-amber-950">{sourceCounts.widget}</p>
            </button>

            <button
              type="button"
              onClick={() => setSourceFilter('Contact Page')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                sourceFilter === 'Contact Page'
                  ? 'bg-indigo-50 text-indigo-950 border-indigo-400 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  Contact Page
                </p>
                <Globe className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold mt-1 text-indigo-950">{sourceCounts.contact}</p>
            </button>

            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Unread Queue
              </p>
              <p className="text-2xl font-bold mt-1 text-slate-900">{sourceCounts.unread}</p>
            </div>
          </div>

          {/* Source Filters & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { key: 'All', label: `All (${sourceCounts.all})` },
                  { key: 'Support Widget', label: `Support Widget (${sourceCounts.widget})` },
                  { key: 'Contact Page', label: `Contact Page (${sourceCounts.contact})` }
                ] as { key: SourceFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSourceFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    sourceFilter === tab.key
                      ? 'bg-indigo-950 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name, email, WhatsApp, subject..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Sender &amp; WhatsApp</th>
                    <th className="py-3 px-4 font-semibold">Source</th>
                    <th className="py-3 px-4 font-semibold">Subject</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Loading communications inbox...
                      </td>
                    </tr>
                  ) : filteredMessages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        {messages.length === 0
                          ? 'No inquiries received yet.'
                          : 'No inquiries match the selected source or search query.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMessages.map(msg => {
                      const src = getMessageSource(msg);
                      const unread = isUnreadStatus(msg.status);
                      const contactNumber = msg.whatsapp || msg.phone;
                      const waHref = contactNumber ? toWhatsAppLink(contactNumber) : '';

                      return (
                        <tr
                          key={msg.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            unread ? 'bg-amber-50/40 font-medium' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="text-slate-900 text-xs">{msg.name}</strong>
                              {msg.aiConversationId && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  AI Escalated
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block">{msg.email}</span>
                            {contactNumber && (
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                                <MessageCircle className="w-3 h-3 shrink-0" />
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {src === 'Support Widget' || msg.whatsapp ? 'WhatsApp:' : 'Phone:'}
                                </span>
                                {waHref ? (
                                  <a
                                    href={waHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {contactNumber}
                                  </a>
                                ) : (
                                  <span>{contactNumber}</span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {src === 'Support Widget' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-200">
                                <Headphones className="w-3 h-3 text-amber-700" />
                                <span>Support Widget</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-950 border border-indigo-200">
                                <Globe className="w-3 h-3 text-indigo-700" />
                                <span>Contact Page</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-indigo-950 block">{msg.subject}</span>
                            <p className="text-[11px] text-slate-500 truncate max-w-xs">{msg.message}</p>
                          </td>

                          <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                            {new Date(msg.createdAt).toLocaleDateString()}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                unread
                                  ? 'bg-amber-100 text-amber-900'
                                  : msg.status === 'Replied'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {msg.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMessage(msg);
                                  setConfirmDeleteId(null);
                                  if (unread) updateStatus(msg.id, 'Read');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-semibold cursor-pointer"
                              >
                                View
                              </button>
                              {confirmDeleteId === msg.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => deleteMessage(msg.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-1.5 py-1 rounded-lg text-[10px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(msg.id)}
                                  title="Delete inquiry"
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* AI CHAT LOGS VIEW (7-Day Retained Memory) */
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Active 7-Day Chats
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
                {aiStats.totalChats}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                Messages Logged
              </p>
              <p className="text-2xl font-bold text-indigo-950 mt-1 font-mono tabular-nums">
                {aiStats.totalMessages}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Escalated to Human
              </p>
              <p className="text-2xl font-bold text-emerald-900 mt-1 font-mono tabular-nums">
                {aiStats.escalatedCount}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Auto-Retention Policy
              </p>
              <p className="text-sm font-bold text-slate-900 mt-2 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>7 Days Auto-Purge</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { key: 'all', label: `All Chats (${conversations.length})` },
                  { key: 'escalated', label: `Escalated to Human (${aiStats.escalatedCount})` },
                  { key: 'ai_only', label: `AI Guided (${conversations.length - aiStats.escalatedCount})` }
                ] as { key: AiFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAiFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    aiFilter === tab.key
                      ? 'bg-indigo-950 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={aiSearch}
                onChange={e => setAiSearch(e.target.value)}
                placeholder="Search visitor name, email, message text..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Visitor / Session</th>
                    <th className="py-3 px-4 font-semibold">Conversation Preview</th>
                    <th className="py-3 px-4 font-semibold">Outcome</th>
                    <th className="py-3 px-4 font-semibold">Last Active &amp; Retention</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {aiLoading && conversations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        Loading AI support conversations...
                      </td>
                    </tr>
                  ) : filteredConversations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No AI support conversations logged within the 7-day retention window.
                      </td>
                    </tr>
                  ) : (
                    filteredConversations.map(conv => {
                      const lastMsg = conv.messages?.[conv.messages.length - 1];
                      const firstUserMsg = conv.messages?.find(m => m.role === 'user');
                      return (
                        <tr
                          key={conv.id}
                          onClick={() => {
                            setSelectedConv(conv);
                            setConfirmDeleteConvId(null);
                          }}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">
                              {conv.visitorName || 'Website Visitor'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {conv.visitorEmail || conv.sessionId}
                            </div>
                            {conv.visitorWhatsapp && (
                              <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                                WhatsApp: {conv.visitorWhatsapp}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 max-w-sm">
                            <div className="text-slate-800 font-medium truncate">
                              {firstUserMsg?.text
                                ? stripSupportFormattingForPreview(firstUserMsg.text)
                                : 'Chat session'}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {conv.messages?.length || 0} messages · Last:{' '}
                              {lastMsg?.text ? stripSupportFormattingForPreview(lastMsg.text) : ''}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {conv.mode === 'human' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                  <Headphones className="w-3 h-3" />
                                  <span>Live Human</span>
                                </span>
                              ) : conv.escalatedToHuman ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                  <UserCheck className="w-3 h-3" />
                                  <span>Escalated Ticket</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-900">
                                  <Bot className="w-3 h-3" />
                                  <span>AI Guided</span>
                                </span>
                              )}
                              {(conv.unreadByAgent || 0) > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                                  {conv.unreadByAgent} new
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="text-slate-700 font-mono text-[11px]">
                              {new Date(conv.updatedAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            <div className="text-[10px] text-amber-700 font-mono font-semibold mt-0.5">
                              {formatRetentionRemaining(conv.expiresAt, conv.updatedAt)}
                            </div>
                          </td>

                          <td
                            className="py-3.5 px-4 text-right whitespace-nowrap"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedConv(conv);
                                  setConfirmDeleteConvId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-semibold cursor-pointer"
                              >
                                Read Chat
                              </button>

                              {confirmDeleteConvId === conv.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => deleteConversation(conv.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteConvId(null)}
                                    className="px-1.5 py-1 rounded-lg text-[10px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteConvId(conv.id)}
                                  title="Delete conversation"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Inquiry Message Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {getMessageSource(selectedMessage) === 'Support Widget' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-200">
                      <Headphones className="w-3 h-3 text-amber-700" />
                      <span>Via Support Widget</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-950 border border-indigo-200">
                      <Globe className="w-3 h-3 text-indigo-700" />
                      <span>Via Contact Page</span>
                    </span>
                  )}
                  {selectedMessage.aiConversationId && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                      <Sparkles className="w-3 h-3" />
                      <span>AI Escalated</span>
                    </span>
                  )}
                  <span className="text-xs text-amber-700 font-semibold uppercase tracking-wider">
                    {selectedMessage.subject}
                  </span>
                </div>
                <h3 className="font-serif font-bold text-lg text-slate-900">
                  Inquiry from {selectedMessage.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <div>
                  <strong className="text-slate-800">Origin:</strong>{' '}
                  <span className="font-semibold text-indigo-950">
                    {getMessageSource(selectedMessage)}
                  </span>
                </div>
                <div>
                  <strong className="text-slate-800">Email:</strong>{' '}
                  <a href={`mailto:${selectedMessage.email}`} className="text-indigo-900 underline">
                    {selectedMessage.email}
                  </a>
                </div>
                {(selectedMessage.whatsapp || selectedMessage.phone) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-slate-800">
                      {selectedMessage.whatsapp ? 'WhatsApp / Phone:' : 'Phone:'}
                    </strong>{' '}
                    <span className="font-semibold text-slate-900">
                      {selectedMessage.whatsapp || selectedMessage.phone}
                    </span>
                    {toWhatsAppLink(selectedMessage.whatsapp || selectedMessage.phone || '') && (
                      <a
                        href={toWhatsAppLink(selectedMessage.whatsapp || selectedMessage.phone || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold hover:bg-emerald-200 transition-colors"
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>Open WhatsApp</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                )}
                <div>
                  <strong className="text-slate-800">Date Received:</strong>{' '}
                  {new Date(selectedMessage.createdAt).toLocaleString()}
                </div>
                {selectedMessage.aiConversationId && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenLinkedAiChat(selectedMessage.aiConversationId)}
                      className="inline-flex items-center gap-1.5 text-indigo-700 hover:underline font-semibold cursor-pointer"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      <span>Open Linked AI Chat Transcript</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <strong className="text-slate-900 block mb-1">Message Content:</strong>
                <p className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                  {selectedMessage.message}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => updateStatus(selectedMessage.id, 'Replied')}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Mark as Replied
              </button>

              <div className="flex items-center gap-2">
                {(selectedMessage.whatsapp || selectedMessage.phone) &&
                  toWhatsAppLink(selectedMessage.whatsapp || selectedMessage.phone || '') && (
                    <a
                      href={toWhatsAppLink(selectedMessage.whatsapp || selectedMessage.phone || '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Chat on WhatsApp</span>
                    </a>
                  )}
                <a
                  href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject)}`}
                  className="px-4 py-2 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Reply via Email
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full AI Conversation Transcript Modal */}
      {selectedConv && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedConv(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-950">
                    <Bot className="w-3 h-3" />
                    <span>{aiModelName} Transcript</span>
                  </span>
                  <span className="text-[11px] font-mono text-amber-800 font-semibold">
                    {formatRetentionRemaining(selectedConv.expiresAt, selectedConv.updatedAt)}
                  </span>
                </div>
                <h3 className="font-serif font-bold text-lg text-slate-900">
                  {selectedConv.visitorName || 'Website Visitor'}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedConv.visitorEmail ? `${selectedConv.visitorEmail} · ` : ''}
                  {selectedConv.visitorWhatsapp ? `WhatsApp: ${selectedConv.visitorWhatsapp} · ` : ''}
                  Session: {selectedConv.sessionId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConv(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/40">
              {(selectedConv.messages || []).map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-950 text-white rounded-br-sm'
                        : msg.role === 'agent'
                        ? 'bg-emerald-50 border border-emerald-200 text-slate-900 rounded-bl-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75 mb-1">
                      {msg.role === 'user'
                        ? msg.senderName || selectedConv.visitorName || 'Visitor'
                        : msg.role === 'agent'
                        ? `Coordinator · ${msg.senderName || 'Council Staff'}`
                        : 'NexGen AI Concierge'}
                    </div>
                    {msg.role === 'user' || msg.role === 'agent' ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    ) : (
                      <SupportRichText text={msg.text} variant="light" />
                    )}
                  </div>
                  {msg.escalatedTicketId && (
                    <span className="mt-1 text-[10px] font-mono font-semibold text-emerald-700">
                      Escalated to Ticket {msg.escalatedTicketId}
                    </span>
                  )}
                  <span className="mt-0.5 text-[10px] font-mono text-slate-400">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSendLiveReply}
              className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2"
            >
              <input
                type="text"
                value={liveReplyText}
                onChange={e => setLiveReplyText(e.target.value)}
                disabled={sendingLiveReply}
                placeholder="Reply live to visitor's website support widget..."
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={sendingLiveReply || !liveReplyText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingLiveReply ? 'Sending...' : 'Reply Live'}</span>
              </button>
            </form>

            <div className="p-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Started: {new Date(selectedConv.createdAt).toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => deleteConversation(selectedConv.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
