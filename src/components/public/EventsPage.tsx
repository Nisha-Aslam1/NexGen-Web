import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Search,
  CheckCircle2,
  Ticket
} from 'lucide-react';
import { EventItem } from '../../types.ts';

export const EventsPage: React.FC = () => {
  const { events, setActivePage, addToast, selectedEventSlug } = useApp();
  const [tab, setTab] = useState<'Upcoming' | 'Past'>('Upcoming');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);

  // Sync selectedEventSlug from URL
  useEffect(() => {
    if (selectedEventSlug && events.length > 0) {
      const match = events.find(e => e.slug === selectedEventSlug || e.id === selectedEventSlug);
      if (match) {
        setSelectedEvent(match);
      }
    }
  }, [selectedEventSlug, events]);

  useDocumentSEO({
    title: selectedEvent
      ? `${selectedEvent.title} | Events Calendar | NexGen Council`
      : 'Upcoming Events, Summits & Workshops | NexGen Council',
    description: selectedEvent
      ? `${selectedEvent.description} Organized by NexGen Council in ${selectedEvent.location}.`
      : 'Join NexGen Council for upcoming youth leadership summits, policy debates, and women empowerment community symposiums.',
    canonicalPath: selectedEvent ? `/events/${selectedEvent.slug}` : '/events',
    ogType: 'website',
    ogImage: selectedEvent?.coverImage || '/banner.png',
    jsonLd: selectedEvent
      ? {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: selectedEvent.title,
          description: selectedEvent.description,
          startDate: selectedEvent.date,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: {
            '@type': 'Place',
            name: selectedEvent.location,
            address: {
              '@type': 'PostalAddress',
              addressLocality: selectedEvent.location
            }
          },
          organizer: {
            '@type': 'NGO',
            name: 'NexGen Council',
            url: window.location.origin
          }
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'NexGen Council Events & Summits',
          itemListElement: events.map((e, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: e.title,
            url: `${window.location.origin}/events/${e.slug}`
          }))
        }
  });

  const filteredEvents = events.filter(e => {
    const matchesTab = tab === 'Upcoming' ? e.status === 'Upcoming' : e.status === 'Past';
    const matchesSearch =
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.location.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleRsvpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRsvpSuccess(true);
    addToast('Your attendance reservation has been recorded!', 'success');
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-amber-400" /> Council Calendar
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            Conferences, Summits &amp; Community Gatherings
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Participate in our interactive conferences, youth leadership plenaries, and regional grassroots outreach sessions.
          </p>
        </div>
      </section>

      {/* Tabs & Search */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setTab('Upcoming')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'Upcoming' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upcoming Events ({events.filter(e => e.status === 'Upcoming').length})
            </button>
            <button
              onClick={() => setTab('Past')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'Past' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Past Archive ({events.filter(e => e.status === 'Past').length})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or venue..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>
      </section>

      {/* Events List */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-serif font-bold text-slate-800">No events found</h3>
            <p className="text-xs text-slate-500 mt-1">Check back soon for new announcements.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map(evt => (
              <div
                key={evt.id}
                className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-indigo-950 bg-slate-100 px-2.5 py-1 rounded-md">
                      {evt.category}
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      {new Date(evt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-snug">
                    {evt.title}
                  </h3>

                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-500 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{evt.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{evt.location}</span>
                    </div>
                    {evt.capacity && (
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Capacity: {evt.capacity} Delegates</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedEvent(evt);
                      setActivePage('events', evt.slug);
                      setRsvpSuccess(false);
                    }}
                    className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                  >
                    Details &amp; Agenda →
                  </button>

                  {tab === 'Upcoming' && (
                    <button
                      onClick={() => {
                        setSelectedEvent(evt);
                        setActivePage('events', evt.slug);
                        setRsvpSuccess(false);
                      }}
                      className="px-3.5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer shadow-xs"
                    >
                      RSVP / Register
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Event Details & RSVP Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-8">
            <button
              onClick={() => {
                setSelectedEvent(null);
                setActivePage('events', null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold">
                {selectedEvent.category}
              </span>
              <h3 className="text-2xl font-serif font-bold text-slate-900 leading-snug">
                {selectedEvent.title}
              </h3>
            </div>

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-900" />
                <span>Date: <strong>{selectedEvent.date}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-900" />
                <span>Time: <strong>{selectedEvent.time}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-900" />
                <span>Location: <strong>{selectedEvent.location}</strong></span>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              {selectedEvent.description}
            </p>

            {/* RSVP Form or Confirmation */}
            {selectedEvent.status === 'Upcoming' && (
              <div className="border-t border-slate-200 pt-4">
                {rsvpSuccess ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1 text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                    <p className="font-semibold text-sm">Attendance Confirmed!</p>
                    <p>A pass confirmation has been sent to your registered information.</p>
                  </div>
                ) : (
                  <form onSubmit={handleRsvpSubmit} className="space-y-3">
                    <span className="text-xs font-semibold text-slate-800 block">
                      Quick Registration for this Session
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Your Full Name"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-200"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Your Email Address"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-200"
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                    >
                      Confirm Delegate RSVP
                    </button>
                  </form>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setActivePage('events', null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
