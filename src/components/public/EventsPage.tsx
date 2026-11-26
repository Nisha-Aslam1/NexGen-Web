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
  X
} from 'lucide-react';
import { EventItem } from '../../types.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import {
  buildAutoImageAlt,
  buildAutoImageCaption,
  buildImageObjectSchema,
  resolvePublicImageUrl
} from '../../lib/imageSeo.ts';

export const EventsPage: React.FC = () => {
  const { events, setActivePage, addToast, selectedEventSlug, isLoadingPublicData, refreshData } = useApp();
  const [tab, setTab] = useState<'Upcoming' | 'Past'>('Upcoming');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [rsvpName, setRsvpName] = useState('');
  const [rsvpEmail, setRsvpEmail] = useState('');
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpResult, setRsvpResult] = useState<'ok' | 'waitlisted' | null>(null);

  const matchedEvent = selectedEventSlug
    ? events.find(
        e =>
          (e.slug && e.slug.toLowerCase() === selectedEventSlug.toLowerCase()) ||
          e.id.toLowerCase() === selectedEventSlug.toLowerCase()
      ) || null
    : null;

  const effectiveEvent = selectedEvent || matchedEvent;

  // Sync selectedEventSlug from URL and refresh selectedEvent when events list updates
  useEffect(() => {
    if (selectedEventSlug) {
      if (matchedEvent) {
        setSelectedEvent(matchedEvent);
      }
    } else if (selectedEvent) {
      const latest = events.find(e => e.id === selectedEvent.id);
      if (latest && latest !== selectedEvent) {
        setSelectedEvent(latest);
      }
    }
  }, [selectedEventSlug, matchedEvent, events]);

  const isNotFoundSlug = Boolean(selectedEventSlug && !isLoadingPublicData && !matchedEvent);
  const shouldSkipSeo = Boolean(selectedEventSlug && (isLoadingPublicData || !matchedEvent));

  const effectiveEventRawImg = effectiveEvent?.coverImage || effectiveEvent?.image || '/banner.png';
  const effectiveEventImage =
    resolvePublicImageUrl(effectiveEventRawImg, window.location.origin, {
      allowDataUrl: true,
      fallbackPath: '/banner.png'
    }) || '/banner.png';
  const effectiveEventAlt = effectiveEvent
    ? buildAutoImageAlt({
        type: 'event',
        customAlt: effectiveEvent.imageAlt,
        title: effectiveEvent.title,
        category: effectiveEvent.category,
        location: effectiveEvent.location
      })
    : 'Upcoming Events, Summits & Workshops — NexGen Council';

  useDocumentSEO({
    skip: shouldSkipSeo,
    title: effectiveEvent
      ? `${effectiveEvent.title} | Events Calendar | NexGen Council`
      : 'Upcoming Events, Summits & Workshops | NexGen Council',
    description: effectiveEvent
      ? `${effectiveEvent.description} Organized by NexGen Council in ${effectiveEvent.location}.`
      : 'Join NexGen Council for upcoming youth leadership summits, policy debates, and women empowerment community symposiums.',
    canonicalPath: effectiveEvent ? `/events/${effectiveEvent.slug || effectiveEvent.id}` : '/events',
    ogType: 'website',
    ogImage: effectiveEventImage,
    ogImageAlt: effectiveEventAlt,
    jsonLd: effectiveEvent
      ? {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: effectiveEvent.title,
          description: effectiveEvent.description,
          startDate: effectiveEvent.date,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: effectiveEvent.isVirtual
            ? 'https://schema.org/OnlineEventAttendanceMode'
            : 'https://schema.org/OfflineEventAttendanceMode',
          maximumAttendeeCapacity: effectiveEvent.capacity || undefined,
          image: [
            buildImageObjectSchema({
              url: effectiveEventImage,
              alt: effectiveEventAlt,
              name: effectiveEvent.title,
              caption: buildAutoImageCaption({
                type: 'event',
                customAlt: effectiveEvent.imageAlt,
                title: effectiveEvent.title,
                category: effectiveEvent.category,
                location: effectiveEvent.location,
                summary: effectiveEvent.description
              }),
              pageUrl: `${window.location.origin}/events/${effectiveEvent.slug || effectiveEvent.id}`,
              representativeOfPage: true
            })
          ],
          location: {
            '@type': 'Place',
            name: effectiveEvent.location,
            address: {
              '@type': 'PostalAddress',
              addressLocality: effectiveEvent.location
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
            image: resolvePublicImageUrl(e.coverImage || e.image, window.location.origin, { allowDataUrl: false }) || undefined,
            url: `${window.location.origin}/events/${e.slug || e.id}`
          }))
        }
  });

  if (isNotFoundSlug) {
    return <NotFoundPage />;
  }

  const filteredEvents = events.filter(e => {
    const matchesTab = tab === 'Upcoming' ? e.status === 'Upcoming' : e.status === 'Past';
    const matchesSearch =
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.location.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const openEventModal = (evt: EventItem) => {
    setSelectedEvent(evt);
    setActivePage('events', evt.slug || evt.id);
    setRsvpResult(null);
    setRsvpName('');
    setRsvpEmail('');
  };

  const closeEventModal = () => {
    setSelectedEvent(null);
    setActivePage('events', null);
    setRsvpResult(null);
  };

  const handleRsvpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    setSubmittingRsvp(true);
    try {
      const res = await fetch(`/api/events/${selectedEvent.id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rsvpName.trim(),
          email: rsvpEmail.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not record registration.');
      }
      if (data.event) {
        setSelectedEvent(data.event);
      }
      setRsvpResult(data.status === 'waitlisted' ? 'waitlisted' : 'ok');
      addToast(data.message || 'Your attendance reservation has been recorded!', 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Unable to register right now.', 'error');
    } finally {
      setSubmittingRsvp(false);
    }
  };

  const renderCapacityBlock = (evt: EventItem) => {
    if (evt.showCapacity === false) return null;
    const cap = Number(evt.capacity || 0);
    const reg = Number(evt.registeredCount || 0);
    if (cap <= 0) {
      return (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Capacity: Open Seating</span>
        </div>
      );
    }
    const isFull = reg >= cap;

    return (
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="tabular-nums">
          Capacity: <strong className="font-semibold text-slate-800">{cap} seats</strong>
          {isFull ? (evt.waitlistEnabled ? ' · Full (Waitlist Open)' : ' · Full') : ''}
        </span>
      </div>
    );
  };

  const selectedCap = Number(selectedEvent?.capacity || 0);
  const selectedReg = Number(selectedEvent?.registeredCount || 0);
  const selectedIsFull = selectedCap > 0 && selectedReg >= selectedCap;

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
            Council Calendar · Leadership Gatherings
          </p>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-balance">
            Conferences, Summits &amp; Community Gatherings
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Participate in our interactive conferences, youth leadership plenaries, and regional grassroots outreach sessions.
          </p>
        </div>
      </section>

      {/* Tabs & Search */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('Upcoming')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'Upcoming' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upcoming Events ({events.filter(e => e.status === 'Upcoming').length})
            </button>
            <button
              type="button"
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
              placeholder="Search by title, category, venue..."
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {filteredEvents.map(evt => {
              const cap = Number(evt.capacity || 0);
              const reg = Number(evt.registeredCount || 0);
              const isFull = cap > 0 && reg >= cap;
              const rawImg = (evt.coverImage || evt.image || '').trim();
              const evtCover = rawImg ? (rawImg.startsWith('uploads/') ? `/${rawImg}` : rawImg) : null;

              return (
                <div
                  key={evt.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col"
                >
                  {evtCover && (
                    <div
                      onClick={() => openEventModal(evt)}
                      className="w-full overflow-hidden bg-slate-100 relative flex items-center justify-center cursor-pointer group"
                    >
                      <img
                        src={evtCover}
                        alt={buildAutoImageAlt({
                          type: 'event',
                          customAlt: evt.imageAlt,
                          title: evt.title,
                          category: evt.category,
                          location: evt.location
                        })}
                        title={`${evt.title} — NexGen Council`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const container = e.currentTarget.parentElement;
                          if (container) container.style.display = 'none';
                        }}
                        className="w-full h-auto block object-contain group-hover:scale-[1.02] transition-transform duration-500"
                      />
                    </div>
                  )}

                  <div className="p-6 flex flex-col space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-indigo-950">
                          {evt.category}
                        </span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-amber-600" />
                          {new Date(evt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>

                    <h3 className="font-serif font-bold text-lg text-slate-900 leading-snug">
                      {evt.title}
                    </h3>

                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-line">
                      {evt.description}
                    </p>

                    <div className="space-y-2 text-xs text-slate-500 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{evt.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{evt.location}</span>
                      </div>
                      {renderCapacityBlock(evt)}
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => openEventModal(evt)}
                      className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                    >
                      Details &amp; Agenda →
                    </button>

                    {tab === 'Upcoming' && (
                      <button
                        type="button"
                        onClick={() => openEventModal(evt)}
                        className="px-3.5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer shadow-xs"
                      >
                        {isFull ? (evt.waitlistEnabled ? 'Join Waitlist' : 'View Status') : 'RSVP / Register'}
                      </button>
                    )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Event Details & RSVP Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden"
          onClick={closeEventModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="events-page-modal-title"
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  {selectedEvent.category} · {selectedEvent.status}
                </p>
                <h3 id="events-page-modal-title" className="text-xl sm:text-2xl font-serif font-bold text-slate-900 leading-snug">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeEventModal}
                className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 p-2 rounded-full cursor-pointer shrink-0 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 space-y-5 overscroll-contain">
              {(() => {
                const rawModalImg = (selectedEvent.coverImage || selectedEvent.image || '').trim();
                const modalImg = rawModalImg ? (rawModalImg.startsWith('uploads/') ? `/${rawModalImg}` : rawModalImg) : null;
                if (!modalImg) return null;
                return (
                  <div className="rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
                    <img
                      src={modalImg}
                      alt={buildAutoImageAlt({
                        type: 'event',
                        customAlt: selectedEvent.imageAlt,
                        title: selectedEvent.title,
                        category: selectedEvent.category,
                        location: selectedEvent.location
                      })}
                      title={`${selectedEvent.title} — NexGen Council`}
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
                );
              })()}

              <div className="space-y-2.5 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-900 shrink-0" />
                  <span>Date: <strong>{selectedEvent.date}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-900 shrink-0" />
                  <span>Time: <strong>{selectedEvent.time}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-900 shrink-0" />
                  <span>Location: <strong>{selectedEvent.location}</strong></span>
                </div>
                {selectedEvent.showCapacity !== false && (
                  <div className="pt-1 border-t border-slate-200">
                    {renderCapacityBlock(selectedEvent)}
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line break-words">
                {selectedEvent.description}
              </p>

              {/* RSVP Form or Confirmation */}
              {selectedEvent.status === 'Upcoming' && (
                <div className="border-t border-slate-200 pt-4">
                  {rsvpResult ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1 text-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                      <p className="font-semibold text-sm">
                        {rsvpResult === 'waitlisted' ? 'Added to Priority Waitlist' : 'Attendance Confirmed'}
                      </p>
                      <p>
                        {rsvpResult === 'waitlisted'
                          ? 'Your details have been recorded on the waitlist and the coordinator team will notify you if a seat opens.'
                          : 'Your delegate seat has been reserved cleanly in our council directory.'}
                      </p>
                    </div>
                  ) : selectedIsFull && !selectedEvent.waitlistEnabled ? (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs text-center space-y-1">
                      <p className="font-semibold text-sm">Delegate Capacity Reached</p>
                      <p>All {selectedCap} seats for this session are currently filled.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleRsvpSubmit} className="space-y-3">
                      <span className="text-xs font-semibold text-slate-800 block">
                        {selectedIsFull && selectedEvent.waitlistEnabled
                          ? 'Session Full — Join Priority Waitlist'
                          : 'Quick Delegate Registration'}
                      </span>
                      <input
                        type="text"
                        required
                        value={rsvpName}
                        onChange={e => setRsvpName(e.target.value)}
                        placeholder="Your Full Name"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-200"
                      />
                      <input
                        type="email"
                        required
                        value={rsvpEmail}
                        onChange={e => setRsvpEmail(e.target.value)}
                        placeholder="Your Email Address"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-200"
                      />
                      <button
                        type="submit"
                        disabled={submittingRsvp}
                        className="w-full py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {submittingRsvp
                          ? 'Recording Registration...'
                          : selectedIsFull && selectedEvent.waitlistEnabled
                          ? 'Join Event Waitlist'
                          : 'Confirm Delegate RSVP'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex items-center justify-end shrink-0 bg-slate-50/70">
              <button
                type="button"
                onClick={closeEventModal}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
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
