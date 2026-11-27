import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  Loader2,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  MessageSquarePlus
} from 'lucide-react';
import { ContactMessage, SupportConversation, TicketStatus } from '../../types.ts';
import {
  SupportRichText,
  stripSupportFormattingForPreview
} from '../common/SupportRichText.tsx';

type SourceFilter = 'All' | 'Support Widget' | 'Contact Page';
type TicketStatusFilter = 'All' | TicketStatus;
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

function resolveTicketStatus(msg: ContactMessage): TicketStatus {
  if (msg.ticketStatus === 'Open' || msg.ticketStatus === 'In Review' || msg.ticketStatus === 'Resolved') {
    return msg.ticketStatus;
  }
  const raw = String(msg.status || '').trim();
  if (raw === 'Open' || raw === 'Unread' || raw === 'New') return 'Open';
  if (raw === 'In Review' || raw === 'Read') return 'In Review';
  if (raw === 'Resolved' || raw === 'Replied') return 'Resolved';
  return 'Open';
}

function getTicketStatusBadge(status: TicketStatus) {
  if (status === 'Open') {
    return {
      label: 'Open',
      className: 'bg-amber-50 text-amber-900 border-amber-200',
      Icon: AlertCircle
    };
  }
  if (status === 'In Review') {
    return {
      label: 'In Review',
      className: 'bg-indigo-50 text-indigo-900 border-indigo-200',
      Icon: Clock
    };
  }
  return {
    label: 'Resolved',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    Icon: CheckCircle2
  };
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

  // Helpdesk Queue State
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('All');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [ticketReplyText, setTicketReplyText] = useState('');
  const [replyTargetStatus, setReplyTargetStatus] = useState<TicketStatus>('Resolved');
  const [sendingTicketReply, setSendingTicketReply] = useState(false);
  const [copiedTicketNum, setCopiedTicketNum] = useState(false);

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

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/contacts');
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
        setSelectedMessage(prev => (prev ? data.find((m: ContactMessage) => m.id === prev.id) || prev : null));
      }
    } catch {
      addToast('Failed to load helpdesk queue', 'error');
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

  useEffect(() => {
    fetchMessages();
    fetchAiConversations();
  }, [fetchMessages, fetchAiConversations]);

  const handleRefreshAll = () => {
    fetchMessages();
    fetchAiConversations();
  };

  const updateTicketStatus = async (id: string, nextTicketStatus: TicketStatus, silent = false) => {
    setUpdatingStatusId(id);
    try {
      const res = await authFetch(`/api/contacts/${id}/ticket-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketStatus: nextTicketStatus })
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to update ticket status');

      setMessages(prev => prev.map(m => (m.id === id ? updated : m)));
      setSelectedMessage(prev => (prev?.id === id ? updated : prev));
      if (!silent) {
        addToast(`Ticket marked as ${nextTicketStatus}`, 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Error updating ticket status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMessage || !ticketReplyText.trim() || sendingTicketReply) return;

    setSendingTicketReply(true);
    try {
      const res = await authFetch(`/api/contacts/${selectedMessage.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: ticketReplyText.trim(),
          ticketStatus: replyTargetStatus
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send helpdesk reply.');

      if (data.ticket) {
        setMessages(prev => prev.map(m => (m.id === data.ticket.id ? data.ticket : m)));
        setSelectedMessage(data.ticket);
      }
      setTicketReplyText('');
      addToast(`Reply posted to ${data.ticket?.ticketNumber || 'ticket'} (${replyTargetStatus})`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Error posting helpdesk reply', 'error');
    } finally {
      setSendingTicketReply(false);
    }
  };

  const handleOpenTicketModal = (msg: ContactMessage) => {
    setSelectedMessage(msg);
    setConfirmDeleteId(null);
    setTicketReplyText('');
    setCopiedTicketNum(false);
    const currentStatus = resolveTicketStatus(msg);
    setReplyTargetStatus(currentStatus === 'Resolved' ? 'Resolved' : 'Resolved');
    if (currentStatus === 'Open') {
      updateTicketStatus(msg.id, 'In Review', true);
    }
  };

  const handleCopyTicketNumber = (ticketNum?: string) => {
    if (!ticketNum) return;
    navigator.clipboard.writeText(ticketNum);
    setCopiedTicketNum(true);
    addToast(`Copied ${ticketNum}`, 'info');
    setTimeout(() => setCopiedTicketNum(false), 2000);
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
      addToast('Support ticket deleted', 'info');
    } catch (err: any) {
      addToast(err.message || 'Error deleting ticket', 'error');
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

  const ticketMetrics = useMemo(() => {
    let open = 0;
    let inReview = 0;
    let resolved = 0;
    let widget = 0;
    let contact = 0;

    for (const msg of messages) {
      const tStatus = resolveTicketStatus(msg);
      if (tStatus === 'Open') open++;
      else if (tStatus === 'In Review') inReview++;
      else resolved++;

      if (getMessageSource(msg) === 'Support Widget') widget++;
      else contact++;
    }

    return {
      total: messages.length,
      open,
      inReview,
      resolved,
      widget,
      contact
    };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter(msg => {
      const tStatus = resolveTicketStatus(msg);
      if (statusFilter !== 'All' && tStatus !== statusFilter) return false;
      const src = getMessageSource(msg);
      if (sourceFilter !== 'All' && src !== sourceFilter) return false;
      if (!q) return true;
      const phone = (msg.whatsapp || msg.phone || '').toLowerCase();
      const tNum = (msg.ticketNumber || '').toLowerCase();
      return (
        tNum.includes(q) ||
        msg.name.toLowerCase().includes(q) ||
        msg.email.toLowerCase().includes(q) ||
        phone.includes(q) ||
        msg.subject.toLowerCase().includes(q) ||
        msg.message.toLowerCase().includes(q)
      );
    });
  }, [messages, statusFilter, sourceFilter, searchQuery]);

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
            Helpdesk Queue &amp; Support AI Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Triage support tickets with Ticket Numbers, post public replies, and inspect 7-day persisted AI &amp; Live chat history ({aiModelName}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMainView('inquiries')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mainView === 'inquiries'
                  ? 'bg-indigo-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Helpdesk Queue ({messages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView('ai_logs')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-700 ${(loading || aiLoading) ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {mainView === 'inquiries' ? (
        <>
          {/* Ticket Status KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setStatusFilter('All')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'All'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${statusFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                  All Tickets
                </p>
                <Ticket className={`w-4 h-4 ${statusFilter === 'All' ? 'text-amber-300' : 'text-slate-400'}`} />
              </div>
              <p className="text-2xl font-bold mt-1 tabular-nums">{ticketMetrics.total}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('Open')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'Open'
                  ? 'bg-amber-50 text-amber-950 border-amber-400 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  Open
                </p>
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold mt-1 text-amber-950 tabular-nums">{ticketMetrics.open}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('In Review')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'In Review'
                  ? 'bg-indigo-50 text-indigo-950 border-indigo-400 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  In Review
                </p>
                <Clock className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-bold mt-1 text-indigo-950 tabular-nums">{ticketMetrics.inReview}</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('Resolved')}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'Resolved'
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-400 shadow-sm'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Resolved
                </p>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold mt-1 text-emerald-950 tabular-nums">{ticketMetrics.resolved}</p>
            </button>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { key: 'All', label: `All Status (${ticketMetrics.total})` },
                  { key: 'Open', label: `Open (${ticketMetrics.open})` },
                  { key: 'In Review', label: `In Review (${ticketMetrics.inReview})` },
                  { key: 'Resolved', label: `Resolved (${ticketMetrics.resolved})` }
                ] as { key: TicketStatusFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    statusFilter === tab.key
                      ? 'bg-indigo-950 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value as SourceFilter)}
                aria-label="Filter by origin"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="All">All Origins ({ticketMetrics.total})</option>
                <option value="Support Widget">Support Widget ({ticketMetrics.widget})</option>
                <option value="Contact Page">Contact Page ({ticketMetrics.contact})</option>
              </select>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search ticket #, name, email, subject..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Ticket #</th>
                    <th className="py-3 px-4 font-semibold">Visitor &amp; Contact</th>
                    <th className="py-3 px-4 font-semibold">Origin</th>
                    <th className="py-3 px-4 font-semibold">Subject &amp; Thread</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Loading helpdesk tickets...
                      </td>
                    </tr>
                  ) : filteredMessages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        {messages.length === 0
                          ? 'No support tickets submitted yet.'
                          : 'No tickets match the selected status, origin, or search query.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMessages.map(msg => {
                      const src = getMessageSource(msg);
                      const tStatus = resolveTicketStatus(msg);
                      const badge = getTicketStatusBadge(tStatus);
                      const BadgeIcon = badge.Icon;
                      const isOpenTicket = tStatus === 'Open';
                      const contactNumber = msg.whatsapp || msg.phone;
                      const waHref = contactNumber ? toWhatsAppLink(contactNumber) : '';
                      const replyCount = msg.replies?.length || 0;

                      return (
                        <tr
                          key={msg.id}
                          onClick={() => handleOpenTicketModal(msg)}
                          className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                            isOpenTicket ? 'bg-amber-50/35' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-900 tabular-nums">
                              {msg.ticketNumber || `NXG-${msg.id.slice(-6).toUpperCase()}`}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 tabular-nums">
                              {new Date(msg.createdAt).toLocaleDateString()}
                            </div>
                            {msg.priority === 'Urgent' && (
                              <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                                Urgent Priority
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <strong className="text-slate-900 text-xs">{msg.name}</strong>
                              {msg.aiConversationId && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                                  <Sparkles className="w-3 h-3" />
                                  AI Escalated
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block">{msg.email}</span>
                            {contactNumber && (
                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                                <MessageCircle className="w-3 h-3 shrink-0" />
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
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900">
                                <Headphones className="w-3.5 h-3.5 text-amber-700" />
                                <span>Support Widget</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-950">
                                <Globe className="w-3.5 h-3.5 text-indigo-700" />
                                <span>Contact Page</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 max-w-xs">
                            <span className="font-semibold text-slate-900 block truncate">{msg.subject}</span>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{msg.message}</p>
                            {replyCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 mt-1 tabular-nums">
                                <MessageSquarePlus className="w-3 h-3" />
                                {replyCount} {replyCount === 1 ? 'reply' : 'replies'} in thread
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${badge.className}`}
                            >
                              <BadgeIcon className="w-3.5 h-3.5" />
                              <span>{badge.label}</span>
                            </span>
                          </td>

                          <td
                            className="py-3.5 px-4 text-right whitespace-nowrap"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenTicketModal(msg)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Manage
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
                                  title="Delete ticket"
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                                  <Headphones className="w-3 h-3" />
                                  <span>Live Human</span>
                                </span>
                              ) : conv.escalatedToHuman ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                                  <UserCheck className="w-3 h-3" />
                                  <span>Escalated Ticket</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
                                  <Bot className="w-3 h-3" />
                                  <span>AI Guided</span>
                                </span>
                              )}
                              {(conv.unreadByAgent || 0) > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-bold tabular-nums">
                                  {conv.unreadByAgent} new
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="text-slate-700 font-mono text-[11px] tabular-nums">
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

      {/* Structured Helpdesk Ticket Detail & Reply Modal */}
      {selectedMessage && (() => {
        const currentStatus = resolveTicketStatus(selectedMessage);
        const statusBadge = getTicketStatusBadge(currentStatus);
        const StatusIcon = statusBadge.Icon;
        const ticketNo = selectedMessage.ticketNumber || `NXG-${selectedMessage.id.slice(-6).toUpperCase()}`;
        const contactNum = selectedMessage.whatsapp || selectedMessage.phone || '';
        const waHref = contactNum ? toWhatsAppLink(contactNum) : '';

        return (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setSelectedMessage(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold tabular-nums">
                      <Ticket className="w-3.5 h-3.5 text-amber-300" />
                      <span>{ticketNo}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyTicketNumber(ticketNo)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      {copiedTicketNum ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedTicketNum ? 'Copied' : 'Copy #'}</span>
                    </button>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${statusBadge.className}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      <span>{statusBadge.label}</span>
                    </span>
                    {selectedMessage.priority === 'Urgent' && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                        · Urgent
                      </span>
                    )}
                  </div>

                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-snug">
                    {selectedMessage.subject}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Submitted by <strong className="text-slate-900">{selectedMessage.name}</strong> ·{' '}
                    <span className="font-medium text-indigo-900">{getMessageSource(selectedMessage)}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedMessage(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer shrink-0"
                  aria-label="Close ticket modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Ticket Dossier & Thread */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                {/* Status Control Bar + Metadata */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <span className="font-semibold text-slate-800">Ticket Status Transition:</span>
                    <div className="inline-flex items-center gap-1.5 flex-wrap">
                      {(['Open', 'In Review', 'Resolved'] as TicketStatus[]).map(st => {
                        const active = currentStatus === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            disabled={updatingStatusId === selectedMessage.id}
                            onClick={() => updateTicketStatus(selectedMessage.id, st)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-indigo-950 text-white border-indigo-950'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-slate-600">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Email Address</span>
                      <a href={`mailto:${selectedMessage.email}`} className="font-semibold text-indigo-900 hover:underline break-all">
                        {selectedMessage.email}
                      </a>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">WhatsApp / Phone</span>
                      {contactNum ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{contactNum}</span>
                          {waHref && (
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                            >
                              Open WhatsApp <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Not provided</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Created</span>
                      <span className="font-mono text-slate-800 tabular-nums">
                        {new Date(selectedMessage.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Last Updated</span>
                      <span className="font-mono text-slate-800 tabular-nums">
                        {new Date(selectedMessage.updatedAt || selectedMessage.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {selectedMessage.aiConversationId && (
                    <div className="pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleOpenLinkedAiChat(selectedMessage.aiConversationId)}
                        className="inline-flex items-center gap-1.5 text-indigo-800 hover:underline font-semibold cursor-pointer"
                      >
                        <MessageSquareText className="w-3.5 h-3.5" />
                        <span>Open Linked AI / Live Chat Transcript</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Chronological Conversation Thread */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Ticket Conversation Thread ({1 + (selectedMessage.replies?.length || 0)})
                  </h4>

                  {/* Initial Visitor Inquiry */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-slate-900">{selectedMessage.name} · Original Inquiry</span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {new Date(selectedMessage.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {selectedMessage.message}
                    </p>
                  </div>

                  {/* Replies */}
                  {(selectedMessage.replies || []).map(rep => {
                    const isAdmin = rep.senderRole === 'admin';
                    return (
                      <div
                        key={rep.id}
                        className={`rounded-2xl p-4 border space-y-1.5 ${
                          isAdmin
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-indigo-50/60 border-indigo-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className={`font-bold ${isAdmin ? 'text-emerald-950' : 'text-indigo-950'}`}>
                            {isAdmin
                              ? `${rep.senderName || 'Council Secretariat'} (Official Reply)`
                              : `${rep.senderName || selectedMessage.name} (Visitor Follow-up)`}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums">
                            {new Date(rep.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {rep.message}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Official Helpdesk Reply Composer */}
              <form
                onSubmit={handleSendTicketReply}
                className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label htmlFor="admin-ticket-reply" className="text-xs font-bold text-slate-800">
                    Post Reply (Visible to visitor via Ticket #{ticketNo})
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Set status to:</span>
                    <select
                      value={replyTargetStatus}
                      onChange={e => setReplyTargetStatus(e.target.value as TicketStatus)}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="In Review">In Review</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Open">Open</option>
                    </select>
                  </div>
                </div>

                <textarea
                  id="admin-ticket-reply"
                  rows={3}
                  value={ticketReplyText}
                  onChange={e => setTicketReplyText(e.target.value)}
                  disabled={sendingTicketReply}
                  placeholder="Write an official helpdesk response. Visitors can view this immediately using their ticket number..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-700"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {waHref && (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    <a
                      href={`mailto:${selectedMessage.email}?subject=${encodeURIComponent(`[${ticketNo}] Re: ${selectedMessage.subject}`)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <span>Email</span>
                    </a>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingTicketReply || !ticketReplyText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {sendingTicketReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{sendingTicketReply ? 'Posting Reply...' : 'Send Ticket Reply'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-950">
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0 whitespace-nowrap"
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
