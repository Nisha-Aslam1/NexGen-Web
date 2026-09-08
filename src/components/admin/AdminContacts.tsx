import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Mail,
  MailOpen,
  Trash2,
  CheckCircle2,
  Clock,
  User,
  Phone,
  Calendar,
  MessageSquare
} from 'lucide-react';
import { ContactMessage } from '../../types.ts';

export const AdminContacts: React.FC = () => {
  const { addToast } = useApp();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/contacts');
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch (err) {
      addToast('Failed to load inquiries', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
    if (!confirm('Delete this message?')) return;
    try {
      const res = await authFetch(`/api/contacts/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      setMessages(prev => prev.filter(m => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);
      addToast('Message deleted', 'info');
    } catch (err: any) {
      addToast(err.message || 'Error deleting message', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Public Inquiries &amp; Messages Inbox
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Incoming communications from prospective partners, university delegates, and volunteers.
          </p>
        </div>

        <button
          onClick={fetchMessages}
          className="px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          Refresh Inbox
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 font-semibold">Sender</th>
                <th className="py-3 px-4 font-semibold">Subject</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Loading communications inbox...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No inquiries received yet.
                  </td>
                </tr>
              ) : (
                messages.map(msg => (
                  <tr
                    key={msg.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      msg.status === 'New' ? 'bg-amber-50/30 font-medium' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <strong className="text-slate-900 block text-xs">{msg.name}</strong>
                      <span className="text-[11px] text-slate-400 block">{msg.email}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-indigo-950 block">{msg.subject}</span>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs">{msg.message}</p>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(msg.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          msg.status === 'New'
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
                          onClick={() => {
                            setSelectedMessage(msg);
                            if (msg.status === 'New') updateStatus(msg.id, 'Read');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-semibold cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs text-amber-700 font-semibold uppercase tracking-wider">{selectedMessage.subject}</span>
                <h3 className="font-serif font-bold text-lg text-slate-900 mt-0.5">
                  Inquiry from {selectedMessage.name}
                </h3>
              </div>
              <button onClick={() => setSelectedMessage(null)} className="text-slate-400 hover:text-slate-700 p-1">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div><strong className="text-slate-800">Email:</strong> <a href={`mailto:${selectedMessage.email}`} className="text-indigo-900 underline">{selectedMessage.email}</a></div>
                {selectedMessage.phone && <div><strong className="text-slate-800">Phone:</strong> {selectedMessage.phone}</div>}
                <div><strong className="text-slate-800">Date Received:</strong> {new Date(selectedMessage.createdAt).toLocaleString()}</div>
              </div>

              <div>
                <strong className="text-slate-900 block mb-1">Message Content:</strong>
                <p className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                  {selectedMessage.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                onClick={() => updateStatus(selectedMessage.id, 'Replied')}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Mark as Replied
              </button>

              <a
                href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject)}`}
                className="px-4 py-2 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Reply via Email
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
