import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp, ActivePage } from '../../context/AppContext.tsx';
import { resolveActiveFaqs } from './SiteFAQ.tsx';
import {
  Search,
  X,
  BookOpen,
  Calendar,
  Newspaper,
  HelpCircle,
  Hash,
  ArrowRight,
  CornerDownLeft,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Sparkles,
  UserCheck,
  MessageSquare
} from 'lucide-react';

type SearchTab = 'all' | 'programs' | 'events' | 'news' | 'faqs' | 'track';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResultItem {
  key: string;
  type: 'program' | 'event' | 'news' | 'faq' | 'shortcut';
  title: string;
  subtitle: string;
  meta: string;
  onSelect: () => void;
}

interface TrackLookupResult {
  kind: 'application' | 'ticket';
  code: string;
  title: string;
  status: string;
  subtitle: string;
  extra?: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const {
    programs,
    events,
    news,
    faqs,
    isLoadingPublicData,
    setActivePage
  } = useApp();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<TrackLookupResult | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Focus input & lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 30);

    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
    };
  }, [isOpen]);

  // Reset inline lookup state when query edits
  useEffect(() => {
    setLookupError(null);
    setLookupResult(null);
    setSelectedIndex(0);
  }, [query, activeTab]);

  const activeFaqItems = useMemo(
    () => resolveActiveFaqs(faqs, isLoadingPublicData),
    [faqs, isLoadingPublicData]
  );

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const upperQuery = trimmedQuery.toUpperCase();

  const isTicketPattern = /^NXG-TKT-[0-9A-Z-]+$/i.test(trimmedQuery);
  const isRefPattern =
    !isTicketPattern &&
    (/^(NXG|NG)-[0-9A-Z-]+$/i.test(trimmedQuery) ||
      (activeTab === 'track' && trimmedQuery.length >= 4 && !trimmedQuery.includes(' ')));

  const navigatePublic = useCallback(
    (page: ActivePage, slug?: string | null) => {
      setActivePage(page, slug);
      onClose();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setActivePage, onClose]
  );

  const openTrackWithCode = useCallback(
    (code: string) => {
      const clean = code.trim().toUpperCase();
      try {
        sessionStorage.setItem('nexgen_track_prefill_code', clean);
      } catch {
        // ignore storage errors
      }
      window.dispatchEvent(new CustomEvent('nexgen:track-code', { detail: { code: clean } }));
      setActivePage('track');
      onClose();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setActivePage, onClose]
  );

  const openFaqItem = useCallback(
    (faqId: string) => {
      try {
        sessionStorage.setItem('nexgen_faq_prefill_id', faqId);
      } catch {
        // ignore storage errors
      }
      window.dispatchEvent(new CustomEvent('nexgen:open-faq', { detail: { id: faqId } }));
      setActivePage('faq');
      onClose();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setActivePage, onClose]
  );

  const handleInlineVerify = useCallback(
    async (codeOverride?: string) => {
      const code = (codeOverride || trimmedQuery).trim().toUpperCase();
      if (!code) return;

      setLookupLoading(true);
      setLookupError(null);
      setLookupResult(null);

      try {
        if (/^NXG-TKT-/i.test(code)) {
          const res = await fetch(`/api/support-tickets/lookup/${encodeURIComponent(code)}`);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Support ticket reference not found.');
          }
          setLookupResult({
            kind: 'ticket',
            code: data.ticketNumber || code,
            title: data.subject || 'Secretariat Support Ticket',
            status: data.ticketStatus || data.status || 'Open',
            subtitle: `Submitted by ${data.name || 'Visitor'}`,
            extra: data.createdAt
              ? `Opened ${new Date(data.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}`
              : undefined
          });
        } else {
          const res = await fetch(`/api/applications/verify/${encodeURIComponent(code)}`);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Reference code not found in council records.');
          }
          setLookupResult({
            kind: 'application',
            code: data.referenceCode || code,
            title: data.fullName || 'Volunteer Applicant',
            status: data.status || 'Pending',
            subtitle: [data.preferredRole || 'General Council Volunteer', data.city].filter(Boolean).join(' · '),
            extra: data.idCardIssued ? 'Official Member ID Card Issued' : undefined
          });
        }
      } catch (err: any) {
        setLookupError(err.message || 'Unable to verify reference code.');
      } finally {
        setLookupLoading(false);
      }
    },
    [trimmedQuery]
  );

  // Filtered datasets (published/active public entries only)
  const matchedPrograms = useMemo(() => {
    const published = programs.filter(p => p.status === 'Published');
    if (!normalizedQuery) return [];
    return published.filter(p =>
      [
        p.title,
        p.category,
        p.shortDescription,
        p.fullDescription,
        p.targetAudience,
        ...(p.curriculumHighlights || [])
      ]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(normalizedQuery))
    );
  }, [programs, normalizedQuery]);

  const matchedEvents = useMemo(() => {
    const visible = events.filter(e => e.status !== 'Draft');
    if (!normalizedQuery) return [];
    return visible.filter(e =>
      [e.title, e.category, e.description, e.location, e.date]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(normalizedQuery))
    );
  }, [events, normalizedQuery]);

  const matchedNews = useMemo(() => {
    const published = news.filter(n => n.status === 'Published');
    if (!normalizedQuery) return [];
    return published.filter(n =>
      [
        n.title,
        n.category,
        n.summary,
        n.content,
        n.author,
        ...(n.tags || []),
        ...(n.seoKeywords || [])
      ]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(normalizedQuery))
    );
  }, [news, normalizedQuery]);

  const matchedFaqs = useMemo(() => {
    if (!normalizedQuery) return [];
    return activeFaqItems.filter(f =>
      [f.question, f.answer, f.category]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(normalizedQuery))
    );
  }, [activeFaqItems, normalizedQuery]);

  // Flat navigable items based on activeTab
  const visibleItems: SearchResultItem[] = useMemo(() => {
    if (!normalizedQuery) {
      if (activeTab === 'programs') {
        return programs
          .filter(p => p.status === 'Published')
          .slice(0, 6)
          .map(p => ({
            key: `program-${p.id}`,
            type: 'program',
            title: p.title,
            subtitle: p.shortDescription,
            meta: [p.category, p.targetAudience || 'Fellowship'].filter(Boolean).join(' · '),
            onSelect: () => navigatePublic('programs', p.slug || p.id)
          }));
      }
      if (activeTab === 'events') {
        return events
          .filter(e => e.status !== 'Draft')
          .slice(0, 6)
          .map(e => ({
            key: `event-${e.id}`,
            type: 'event',
            title: e.title,
            subtitle: e.description,
            meta: [e.status, e.date, e.location].filter(Boolean).join(' · '),
            onSelect: () => navigatePublic('events', e.slug || e.id)
          }));
      }
      if (activeTab === 'news') {
        return news
          .filter(n => n.status === 'Published')
          .slice(0, 6)
          .map(n => ({
            key: `news-${n.id}`,
            type: 'news',
            title: n.title,
            subtitle: n.summary,
            meta: [n.category, new Date(n.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · '),
            onSelect: () => navigatePublic('news', n.slug || n.id)
          }));
      }
      if (activeTab === 'faqs') {
        return activeFaqItems.slice(0, 6).map(f => ({
          key: `faq-${f.id}`,
          type: 'faq',
          title: f.question,
          subtitle: f.answer,
          meta: f.category,
          onSelect: () => openFaqItem(f.id)
        }));
      }
      if (activeTab === 'track') {
        return [];
      }
      return [
        {
          key: 'shortcut-volunteer',
          type: 'shortcut',
          title: 'Join as Volunteer',
          subtitle: 'Submit an official NexGen Council volunteer or fellowship application.',
          meta: 'Application Portal · /volunteer',
          onSelect: () => navigatePublic('volunteer')
        },
        {
          key: 'shortcut-track',
          type: 'shortcut',
          title: 'Track Application & Member ID Card',
          subtitle: 'Verify your reference ID (e.g., NXG-2026-8812) and download your digital ID card.',
          meta: 'Verification Portal · /track',
          onSelect: () => navigatePublic('track')
        },
        {
          key: 'shortcut-programs',
          type: 'shortcut',
          title: 'Leadership & Empowerment Programs',
          subtitle: 'Browse active cohorts, women empowerment tracks, and youth leadership series.',
          meta: `${programs.filter(p => p.status === 'Published').length} Published · /programs`,
          onSelect: () => navigatePublic('programs')
        },
        {
          key: 'shortcut-events',
          type: 'shortcut',
          title: 'Events Calendar & Delegate RSVP',
          subtitle: 'View upcoming summits, policy dialogues, and workshops across chapters.',
          meta: `${events.filter(e => e.status === 'Upcoming').length} Upcoming · /events`,
          onSelect: () => navigatePublic('events')
        },
        {
          key: 'shortcut-news',
          type: 'shortcut',
          title: 'Newsroom & Council Press Releases',
          subtitle: 'Read official updates, regional chapter highlights, and community impact briefings.',
          meta: `${news.filter(n => n.status === 'Published').length} Dispatches · /news`,
          onSelect: () => navigatePublic('news')
        },
        {
          key: 'shortcut-faq',
          type: 'shortcut',
          title: 'Help Center & Frequently Asked Questions',
          subtitle: 'Official answers on enrollment, certificates, verified donations, and partnerships.',
          meta: `${activeFaqItems.length} Answers · /faq`,
          onSelect: () => navigatePublic('faq')
        }
      ];
    }

    const items: SearchResultItem[] = [];

    if (activeTab === 'all' || activeTab === 'programs') {
      matchedPrograms.slice(0, activeTab === 'all' ? 5 : 20).forEach(p => {
        items.push({
          key: `program-${p.id}`,
          type: 'program',
          title: p.title,
          subtitle: p.shortDescription,
          meta: ['Program', p.category, p.targetAudience].filter(Boolean).join(' · '),
          onSelect: () => navigatePublic('programs', p.slug || p.id)
        });
      });
    }

    if (activeTab === 'all' || activeTab === 'events') {
      matchedEvents.slice(0, activeTab === 'all' ? 5 : 20).forEach(e => {
        items.push({
          key: `event-${e.id}`,
          type: 'event',
          title: e.title,
          subtitle: e.description,
          meta: ['Event', e.status, e.date, e.location].filter(Boolean).join(' · '),
          onSelect: () => navigatePublic('events', e.slug || e.id)
        });
      });
    }

    if (activeTab === 'all' || activeTab === 'news') {
      matchedNews.slice(0, activeTab === 'all' ? 5 : 20).forEach(n => {
        items.push({
          key: `news-${n.id}`,
          type: 'news',
          title: n.title,
          subtitle: n.summary,
          meta: [
            'News',
            n.category,
            new Date(n.publishedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })
          ]
            .filter(Boolean)
            .join(' · '),
          onSelect: () => navigatePublic('news', n.slug || n.id)
        });
      });
    }

    if (activeTab === 'all' || activeTab === 'faqs') {
      matchedFaqs.slice(0, activeTab === 'all' ? 5 : 20).forEach(f => {
        items.push({
          key: `faq-${f.id}`,
          type: 'faq',
          title: f.question,
          subtitle: f.answer,
          meta: ['FAQ', f.category].filter(Boolean).join(' · '),
          onSelect: () => openFaqItem(f.id)
        });
      });
    }

    return items;
  }, [
    normalizedQuery,
    activeTab,
    programs,
    events,
    news,
    activeFaqItems,
    matchedPrograms,
    matchedEvents,
    matchedNews,
    matchedFaqs,
    navigatePublic,
    openFaqItem
  ]);

  // Keep selected index valid and scroll active item into view
  useEffect(() => {
    if (selectedIndex >= visibleItems.length) {
      setSelectedIndex(0);
    }
  }, [visibleItems.length, selectedIndex]);

  useEffect(() => {
    const activeEl = listContainerRef.current?.querySelector(`[data-search-index="${selectedIndex}"]`);
    if (activeEl instanceof HTMLElement) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' && visibleItems.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % visibleItems.length);
        return;
      }

      if (e.key === 'ArrowUp' && visibleItems.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + visibleItems.length) % visibleItems.length);
        return;
      }

      if (e.key === 'Enter') {
        if ((isRefPattern || isTicketPattern) && visibleItems.length === 0) {
          e.preventDefault();
          handleInlineVerify();
          return;
        }
        const selected = visibleItems[selectedIndex];
        if (selected) {
          e.preventDefault();
          selected.onSelect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, visibleItems, selectedIndex, isRefPattern, isTicketPattern, handleInlineVerify]);

  if (!isOpen) return null;

  const totalMatches =
    matchedPrograms.length + matchedEvents.length + matchedNews.length + matchedFaqs.length;

  const tabs: { id: SearchTab; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: normalizedQuery ? totalMatches : undefined },
    { id: 'programs', label: 'Programs', count: normalizedQuery ? matchedPrograms.length : programs.filter(p => p.status === 'Published').length },
    { id: 'events', label: 'Events', count: normalizedQuery ? matchedEvents.length : events.filter(e => e.status !== 'Draft').length },
    { id: 'news', label: 'News', count: normalizedQuery ? matchedNews.length : news.filter(n => n.status === 'Published').length },
    { id: 'faqs', label: 'FAQs', count: normalizedQuery ? matchedFaqs.length : activeFaqItems.length },
    { id: 'track', label: 'Track ID' }
  ];

  const getTypeIcon = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'program':
        return <BookOpen className="w-4 h-4 text-indigo-800 shrink-0" />;
      case 'event':
        return <Calendar className="w-4 h-4 text-amber-700 shrink-0" />;
      case 'news':
        return <Newspaper className="w-4 h-4 text-slate-700 shrink-0" />;
      case 'faq':
        return <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0" />;
      default:
        return <Sparkles className="w-4 h-4 text-indigo-900 shrink-0" />;
    }
  };

  const renderStatusPill = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'approved' || s === 'resolved') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-semibold">
          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          {status}
        </span>
      );
    }
    if (s === 'rejected' || s === 'declined') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 text-[11px] font-semibold">
          <XCircle className="w-3 h-3 text-rose-700" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold">
        <Clock className="w-3 h-3 text-amber-700" />
        {status}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-3 sm:px-6 pt-10 sm:pt-16 pb-6 bg-slate-950/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Global Website Search"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Top Search Bar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center gap-3 bg-white">
          <Search className="w-5 h-5 text-indigo-900 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === 'track'
                ? 'Enter Reference Code (e.g. NXG-2026-8812) or Ticket ID (NXG-TKT-...)'
                : 'Search programs, events, news, FAQs, or Reference Code (NXG-2026-...)'
            }
            className="flex-1 min-w-0 bg-transparent text-slate-900 placeholder:text-slate-400 text-sm sm:text-[15px] focus:outline-none"
            aria-label="Search programs, events, news, FAQs, and reference codes"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="px-2 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Close global search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center gap-1.5 overflow-x-auto">
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-950 text-white shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:text-slate-950'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`text-[11px] tabular-nums ${
                      isSelected ? 'text-amber-300' : 'text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Results Region */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Track ID / Reference Code Card */}
          {(activeTab === 'track' || isRefPattern || isTicketPattern) && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-950 text-amber-300 flex items-center justify-center shrink-0">
                    {isTicketPattern ? (
                      <MessageSquare className="w-4 h-4" />
                    ) : (
                      <Hash className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">
                      {isTicketPattern
                        ? 'Support Ticket Lookup'
                        : 'Application Reference & ID Card Lookup'}
                    </p>
                    <h3 className="text-sm font-serif font-bold text-slate-950 mt-0.5">
                      {trimmedQuery
                        ? `Check status for "${upperQuery}"`
                        : 'Enter your NXG-XXXX-XXXX Reference Code above'}
                    </h3>
                  </div>
                </div>

                {trimmedQuery && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={lookupLoading}
                      onClick={() => handleInlineVerify()}
                      className="px-3.5 py-2 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      {lookupLoading ? 'Checking...' : 'Verify Status'}
                    </button>
                    {!isTicketPattern && (
                      <button
                        type="button"
                        onClick={() => openTrackWithCode(trimmedQuery)}
                        className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 text-indigo-950 border border-indigo-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Open Track Portal</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Sample Codes when on Track Tab without input */}
              {activeTab === 'track' && !trimmedQuery && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
                  <span>Try sample code:</span>
                  {['NXG-2026-8812', 'NXG-2026-7241'].map(sample => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setQuery(sample);
                        handleInlineVerify(sample);
                      }}
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-indigo-400 font-mono text-[11px] font-semibold text-indigo-950 cursor-pointer"
                    >
                      {sample}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigatePublic('track')}
                    className="ml-auto inline-flex items-center gap-1 text-indigo-900 font-semibold hover:underline cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Go to full Track Page</span>
                  </button>
                </div>
              )}

              {/* Inline Lookup Result */}
              {lookupError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{lookupError}</span>
                </div>
              )}

              {lookupResult && (
                <div className="rounded-xl bg-white border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-950">
                        {lookupResult.code}
                      </span>
                      {renderStatusPill(lookupResult.status)}
                    </div>
                    <p className="text-sm font-serif font-bold text-slate-900">
                      {lookupResult.title}
                    </p>
                    <p className="text-xs text-slate-600">
                      {lookupResult.subtitle}
                      {lookupResult.extra ? ` · ${lookupResult.extra}` : ''}
                    </p>
                  </div>

                  {lookupResult.kind === 'application' && (
                    <button
                      type="button"
                      onClick={() => openTrackWithCode(lookupResult.code)}
                      className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>View Full Record &amp; ID Card</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section Heading when Empty Query */}
          {!normalizedQuery && visibleItems.length > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 px-1">
              {activeTab === 'all' ? 'Quick Directory & Shortcuts' : `Featured ${activeTab}`}
            </p>
          )}

          {/* Result Rows */}
          {visibleItems.length > 0 ? (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {visibleItems.map((item, index) => {
                const isHighlighted = index === selectedIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-search-index={index}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={item.onSelect}
                    className={`w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isHighlighted ? 'bg-indigo-50/75' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0">
                        {getTypeIcon(item.type)}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                          {item.meta}
                        </p>
                        <h4 className="text-sm font-serif font-bold text-slate-950 truncate">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-600 line-clamp-1">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      className={`w-4 h-4 mt-2 shrink-0 transition-transform ${
                        isHighlighted ? 'text-indigo-950 translate-x-0.5' : 'text-slate-400'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            normalizedQuery &&
            !isRefPattern &&
            !isTicketPattern &&
            activeTab !== 'track' && (
              <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/60 px-4">
                <Search className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-sm font-serif font-bold text-slate-900">
                  No matches found for &ldquo;{trimmedQuery}&rdquo;
                </p>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Try another keyword for Programs, Events, News, or FAQs — or switch to the{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('track')}
                    className="font-semibold text-indigo-950 underline cursor-pointer"
                  >
                    Track ID tab
                  </button>{' '}
                  if you are searching a reference code.
                </p>
              </div>
            )
          )}
        </div>

        {/* Footer Keyboard Hints */}
        <div className="px-4 sm:px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 inline-flex items-center gap-0.5">
                <CornerDownLeft className="w-2.5 h-2.5" />
                Enter
              </kbd>
              Open
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700">
                Esc
              </kbd>
              Close
            </span>
          </div>
          <span className="tabular-nums text-slate-500">
            {normalizedQuery
              ? `${totalMatches} content ${totalMatches === 1 ? 'match' : 'matches'}`
              : 'Programs · Events · News · FAQs · Track ID'}
          </span>
        </div>
      </div>
    </div>
  );
};
