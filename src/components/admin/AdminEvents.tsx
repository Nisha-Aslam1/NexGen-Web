import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Edit2,
  Trash2,
  Calendar,
  MapPin,
  Users,
  Eye,
  EyeOff,
  X
} from 'lucide-react';
import { EventItem } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';
import { buildAutoImageAlt } from '../../lib/imageSeo.ts';

export const AdminEvents: React.FC = () => {
  const { events, refreshData, addToast } = useApp();
  const [editingEvent, setEditingEvent] = useState<Partial<EventItem> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNewEventModal = () => {
    setEditingEvent({
      title: '',
      category: 'Summit',
      date: new Date().toISOString().split('T')[0],
      time: '10:00 AM - 4:00 PM',
      location: 'Central Civic Auditorium',
      description: '',
      image: '',
      coverImage: '',
      capacity: 150,
      registeredCount: 0,
      showCapacity: true,
      waitlistEnabled: false,
      status: 'Upcoming'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (evt: EventItem) => {
    setEditingEvent({
      ...evt,
      capacity: evt.capacity ?? 0,
      registeredCount: evt.registeredCount ?? 0,
      showCapacity: evt.showCapacity !== false,
      waitlistEnabled: Boolean(evt.waitlistEnabled)
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editingEvent.title?.trim() || !editingEvent.location?.trim()) {
      addToast('Please fill out required event title and venue.', 'error');
      return;
    }

    const cap = Math.max(0, Math.floor(Number(editingEvent.capacity) || 0));
    const reg = Math.max(0, Math.floor(Number(editingEvent.registeredCount) || 0));

    setSaving(true);
    try {
      const resolvedImg = (editingEvent.image || editingEvent.coverImage || '').trim();
      const payload: Partial<EventItem> = {
        ...editingEvent,
        title: editingEvent.title.trim(),
        location: editingEvent.location.trim(),
        coverImage: resolvedImg,
        image: resolvedImg,
        capacity: cap,
        registeredCount: reg,
        showCapacity: editingEvent.showCapacity !== false,
        waitlistEnabled: Boolean(editingEvent.waitlistEnabled)
      };

      const isNew = !editingEvent.id;
      const url = isNew ? '/api/events' : `/api/events/${editingEvent.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save event');

      addToast(isNew ? 'Event created successfully!' : 'Event & capacity updated successfully!', 'success');
      setIsModalOpen(false);
      setEditingEvent(null);
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error saving event', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdjustSeats = async (evt: EventItem, delta: number) => {
    const nextReg = Math.max(0, (evt.registeredCount || 0) + delta);
    try {
      const res = await authFetch(`/api/events/${evt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registeredCount: nextReg })
      });
      if (!res.ok) throw new Error('Failed to adjust registered seats');
      addToast(`Updated registered delegates for "${evt.title}" to ${nextReg}`, 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Could not update seat count', 'error');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete event "${title}"?`)) return;

    try {
      const res = await authFetch(`/api/events/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      addToast('Event deleted', 'info');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error deleting event', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Events, Summits &amp; Capacity Manager
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create scheduled workshops and summits, configure delegate seat capacity, and control waitlist settings.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewEventModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Create New Event</span>
        </button>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {events.map(evt => {
            const cap = Number(evt.capacity || 0);
            const reg = Number(evt.registeredCount || 0);
            const isFull = cap > 0 && reg >= cap;
            const rawImg = (evt.coverImage || evt.image || '').trim();
            const evtImgSrc = rawImg ? (rawImg.startsWith('uploads/') ? `/${rawImg}` : rawImg) : null;

            return (
              <div
                key={evt.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
              >
                {evtImgSrc && (
                  <div className="w-full bg-slate-100 relative overflow-hidden flex items-center justify-center">
                    <img
                      src={evtImgSrc}
                      alt={buildAutoImageAlt({
                        type: 'event',
                        customAlt: evt.imageAlt,
                        title: evt.title,
                        category: evt.category,
                        location: evt.location
                      })}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const container = e.currentTarget.parentElement;
                        if (container) container.style.display = 'none';
                      }}
                      className="w-full h-auto block object-contain"
                    />
                  </div>
                )}
                <div className="p-6 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-indigo-950">
                    {evt.category} · {evt.status}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    {evt.showCapacity !== false ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Capacity Public</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        <span>Capacity Hidden</span>
                      </>
                    )}
                  </span>
                </div>

                <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                  {evt.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed whitespace-pre-line">
                  {evt.description}
                </p>

                <div className="space-y-1.5 text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{evt.date} · {evt.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{evt.location}</span>
                  </div>
                </div>

                {/* Simple Capacity Text & Controls */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                      <Users className="w-3.5 h-3.5 text-indigo-700" />
                      <span>Capacity:</span>
                    </span>
                    <span className="tabular-nums font-semibold text-slate-800">
                      {cap > 0 ? `${cap} seats (${reg} registered)` : `Open Seating (${reg} registered)`}
                    </span>
                  </div>

                  {cap > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="tabular-nums">
                        {isFull
                          ? evt.waitlistEnabled
                            ? 'Full · Waitlist Open'
                            : 'Full'
                          : 'Seats Available'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustSeats(evt, -1)}
                          disabled={reg <= 0}
                          className="px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                          title="Decrease registered seat count by 1"
                        >
                          -1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustSeats(evt, 1)}
                          className="px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          title="Add 1 manual/offline delegate seat"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => openEditModal(evt)}
                  className="text-xs font-semibold text-indigo-900 hover:underline cursor-pointer"
                >
                  Manage Details &amp; Capacity
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(evt)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-950 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Edit Event"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(evt.id, evt.title)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>

      {/* Modal */}
      {isModalOpen && editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {editingEvent.id ? 'Edit Event & Seat Capacity' : 'Create New Event'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={editingEvent.title || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  placeholder="e.g. Annual Youth Leadership Summit"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={editingEvent.category || 'Summit'}
                    onChange={e => setEditingEvent({ ...editingEvent, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Summit">Summit</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Conference">Conference</option>
                    <option value="Webinar">Webinar</option>
                    <option value="Field Outreach">Field Outreach</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editingEvent.status || 'Upcoming'}
                    onChange={e => setEditingEvent({ ...editingEvent, status: e.target.value as EventItem['status'] })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Past">Past</option>
                    <option value="Draft">Draft</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editingEvent.date || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Time</label>
                  <input
                    type="text"
                    value={editingEvent.time || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, time: e.target.value })}
                    placeholder="e.g. 10:00 AM - 4:00 PM"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Location / Venue *</label>
                <input
                  type="text"
                  required
                  value={editingEvent.location || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, location: e.target.value })}
                  placeholder="e.g. City Conference Hall or Virtual Link"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              {/* Delegate Capacity Management Block */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-800" />
                    <span>Delegate Capacity &amp; Seat Controls</span>
                  </span>
                  <span className="text-[11px] text-slate-500">Set 0 for Unlimited</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Maximum Seat Capacity
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={editingEvent.capacity ?? 0}
                      onChange={e =>
                        setEditingEvent({
                          ...editingEvent,
                          capacity: Math.max(0, Number(e.target.value) || 0)
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Registered Delegates Count
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={editingEvent.registeredCount ?? 0}
                      onChange={e =>
                        setEditingEvent({
                          ...editingEvent,
                          registeredCount: Math.max(0, Number(e.target.value) || 0)
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingEvent.showCapacity !== false}
                      onChange={e => setEditingEvent({ ...editingEvent, showCapacity: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-950"
                    />
                    <span className="font-medium text-slate-700">Show Capacity &amp; Remaining Seats Publicly</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingEvent.waitlistEnabled)}
                      onChange={e => setEditingEvent({ ...editingEvent, waitlistEnabled: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-950"
                    />
                    <span className="font-medium text-slate-700">Allow Waitlist When Full</span>
                  </label>
                </div>
              </div>

              <div>
                <ImageUploader
                  value={editingEvent.image || editingEvent.coverImage || ''}
                  onChange={url => setEditingEvent(prev => (prev ? { ...prev, image: url, coverImage: url } : prev))}
                  label="Event Cover Banner (Optional)"
                  helperText="Upload an event banner or paste an image URL"
                  required={false}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Image Alt Text (Auto-SEO)</label>
                  <span className="text-[11px] text-emerald-700 font-medium">Auto-generated if left blank</span>
                </div>
                <input
                  type="text"
                  value={editingEvent.imageAlt || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, imageAlt: e.target.value })}
                  placeholder={buildAutoImageAlt({
                    type: 'event',
                    title: editingEvent.title,
                    category: editingEvent.category,
                    location: editingEvent.location
                  })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingEvent.description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  placeholder="Event agenda and target audience..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
