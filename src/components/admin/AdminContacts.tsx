import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Trash2,
  MessageCircle,
  Globe,
  Headphones,
  Search,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { ContactMessage } from '../../types.ts';

type SourceFilter = 'All' | 'Support Widget' | 'Contact Page';

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

export const AdminContacts: React.FC = () => {
  const { addToast } = useApp();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchMessages = async () => {
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
  };

  React.useEffect(() => {
    fetchMessages();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Public Inquiries &amp; Messages Inbox
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track inquiries submitted from both the Floating Support Widget and the Contact Page.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMessages}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer self-start sm:self-auto disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Inbox</span>
        </button>
      </div>

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
                          <span
                            className={`md:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              src === 'Support Widget'
                                ? 'bg-amber-100 text-amber-950 border-amber-200'
                                : 'bg-indigo-50 text-indigo-950 border-indigo-200'
                            }`}
                          >
                            {src}
                          </span>
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

      {/* Message Modal */}
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
                ✕
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
    </div>
  );
};
