import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Award,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
  BookOpen,
  Sparkles
} from 'lucide-react';
import { Program } from '../../types.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import {
  buildAutoImageAlt,
  buildAutoImageCaption,
  buildImageObjectSchema,
  resolvePublicImageUrl
} from '../../lib/imageSeo.ts';

export const ProgramsPage: React.FC = () => {
  const { programs, setActivePage, selectedProgramSlug, isLoadingPublicData } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeModalProgram, setActiveModalProgram] = useState<Program | null>(null);

  const matchedProgram = selectedProgramSlug
    ? programs.find(
        p =>
          (p.slug && p.slug.toLowerCase() === selectedProgramSlug.toLowerCase()) ||
          p.id.toLowerCase() === selectedProgramSlug.toLowerCase()
      ) || null
    : null;

  const effectiveProgram = activeModalProgram || matchedProgram;

  // Sync selectedProgramSlug from URL
  useEffect(() => {
    if (selectedProgramSlug) {
      if (matchedProgram) {
        setActiveModalProgram(matchedProgram);
      }
    } else {
      setActiveModalProgram(null);
    }
  }, [selectedProgramSlug, matchedProgram]);

  const isNotFoundSlug = Boolean(selectedProgramSlug && !isLoadingPublicData && !matchedProgram);
  const shouldSkipSeo = Boolean(selectedProgramSlug && (isLoadingPublicData || !matchedProgram));

  const effectiveProgramAlt = effectiveProgram
    ? buildAutoImageAlt({
        type: 'program',
        customAlt: effectiveProgram.imageAlt,
        title: effectiveProgram.title,
        category: effectiveProgram.category
      })
    : 'Empowerment & Leadership Programs — NexGen Council';
  const effectiveProgramImageUrl = effectiveProgram
    ? resolvePublicImageUrl(effectiveProgram.coverImage, window.location.origin, {
        allowDataUrl: true,
        fallbackPath: '/banner.png'
      }) || '/banner.png'
    : '/banner.png';

  useDocumentSEO({
    skip: shouldSkipSeo,
    title: effectiveProgram
      ? `${effectiveProgram.title} | Leadership Programs | NexGen Council`
      : 'Empowerment & Leadership Programs | NexGen Council',
    description: effectiveProgram
      ? effectiveProgram.shortDescription
      : 'Browse active youth civic fellowships, women leadership cohorts, and skills accelerator programs designed to foster grassroots change.',
    canonicalPath: effectiveProgram ? `/programs/${effectiveProgram.slug || effectiveProgram.id}` : '/programs',
    ogType: 'website',
    ogImage: effectiveProgramImageUrl,
    ogImageAlt: effectiveProgramAlt,
    jsonLd: effectiveProgram
      ? {
          '@context': 'https://schema.org',
          '@type': 'EducationalOccupationalProgram',
          name: effectiveProgram.title,
          description: effectiveProgram.shortDescription,
          image: buildImageObjectSchema({
            url: effectiveProgramImageUrl,
            alt: effectiveProgramAlt,
            name: effectiveProgram.title,
            caption: buildAutoImageCaption({
              type: 'program',
              customAlt: effectiveProgram.imageAlt,
              title: effectiveProgram.title,
              category: effectiveProgram.category,
              summary: effectiveProgram.shortDescription
            }),
            pageUrl: `${window.location.origin}/programs/${effectiveProgram.slug || effectiveProgram.id}`,
            representativeOfPage: true
          }),
          provider: {
            '@type': 'NGO',
            name: 'NexGen Council',
            url: window.location.origin
          },
          timeToComplete: effectiveProgram.startDate ? 'P3M' : 'P1M'
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'NexGen Leadership & Empowerment Programs',
          itemListElement: programs.map((p, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: p.title,
            image: resolvePublicImageUrl(p.coverImage, window.location.origin, { allowDataUrl: false }) || undefined,
            url: `${window.location.origin}/programs/${p.slug || p.id}`
          }))
        }
  });

  if (isNotFoundSlug) {
    return <NotFoundPage />;
  }

  const categories = ['All', 'Leadership', 'Technology', 'Community', 'Advocacy'];

  const filteredPrograms = programs.filter(p => {
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-12 pb-20">
      {/* Page Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <Award className="w-3.5 h-3.5 text-amber-400" /> Academic &amp; Civic Initiatives
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            Programs &amp; Leadership Cohorts
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Discover our tailored curriculum tracks designed to cultivate executive leadership, digital proficiency, and community advocacy skills.
          </p>
        </div>
      </section>

      {/* Filters & Search */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Categories */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-indigo-950 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search programs..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>
      </section>

      {/* Programs Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {filteredPrograms.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-serif font-bold text-slate-800">No programs match your search</h3>
            <p className="text-xs text-slate-500 mt-1">Try selecting a different category or adjusting search keywords.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
            {filteredPrograms.map(prg => (
              <div
                key={prg.id}
                className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col group"
              >
                <div className="relative w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                  <img
                    src={prg.coverImage || '/banner.png'}
                    alt={buildAutoImageAlt({
                      type: 'program',
                      customAlt: prg.imageAlt,
                      title: prg.title,
                      category: prg.category
                    })}
                    title={`${prg.title} — NexGen Council`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.dataset.fallbackApplied) {
                        el.dataset.fallbackApplied = '1';
                        el.src = '/banner.png';
                      }
                    }}
                    className="w-full h-auto block object-contain group-hover:scale-[1.02] transition-transform duration-500"
                  />
                  <span className="absolute top-4 left-4 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[11px] font-bold text-indigo-950 uppercase tracking-wider shadow-sm">
                    {prg.category}
                  </span>
                  {prg.featured && (
                    <span className="absolute top-4 right-4 px-2.5 py-0.5 bg-amber-400 text-slate-950 font-bold rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Flagship
                    </span>
                  )}
                </div>

                <div className="p-6 flex flex-col space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-serif font-bold text-lg text-slate-900 group-hover:text-indigo-950 transition-colors">
                      {prg.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-line break-words">
                      {prg.shortDescription}
                    </p>
                  </div>

                  <div className="space-y-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-900" />
                      <span>{prg.startDate || 'Rolling intake'} - {prg.endDate || 'Ongoing'}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => {
                        setActiveModalProgram(prg);
                        setActivePage('programs', prg.slug || prg.id);
                      }}
                      className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                    >
                      Curriculum &amp; Details →
                    </button>
                    <button
                      onClick={() => {
                        setActivePage('volunteer');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-3.5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer shadow-xs"
                    >
                      Enroll / Apply
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Program Details Modal */}
      {activeModalProgram && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden"
          onClick={() => {
            setActiveModalProgram(null);
            setActivePage('programs', null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="programs-page-modal-title"
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
              <div className="space-y-1.5 min-w-0">
                <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-950 text-xs font-semibold">
                  {activeModalProgram.category}
                </span>
                <h3 id="programs-page-modal-title" className="text-xl sm:text-2xl font-serif font-bold text-slate-900 leading-snug">
                  {activeModalProgram.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Cohort Duration: {activeModalProgram.startDate || 'Quarterly Session'} to {activeModalProgram.endDate || 'Ongoing'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModalProgram(null);
                  setActivePage('programs', null);
                }}
                className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 p-2 rounded-full cursor-pointer shrink-0 transition-colors"
                aria-label="Close program details modal"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 space-y-5 overscroll-contain">
              <div className="rounded-2xl overflow-hidden bg-slate-100">
                <img
                  src={activeModalProgram.coverImage || '/banner.png'}
                  alt={buildAutoImageAlt({
                    type: 'program',
                    customAlt: activeModalProgram.imageAlt,
                    title: activeModalProgram.title,
                    category: activeModalProgram.category
                  })}
                  title={`${activeModalProgram.title} — NexGen Council`}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (!el.dataset.fallbackApplied) {
                      el.dataset.fallbackApplied = '1';
                      el.src = '/banner.png';
                    }
                  }}
                  className="w-full h-auto block object-contain"
                />
              </div>

              <div className="text-sm text-slate-700 leading-relaxed space-y-3">
                <p className="whitespace-pre-line break-words">{activeModalProgram.fullDescription}</p>

                {activeModalProgram.curriculumHighlights && activeModalProgram.curriculumHighlights.length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-4">
                    <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider mb-2">
                      Curriculum Highlights &amp; Modules
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-600">
                      {activeModalProgram.curriculumHighlights.map((hl, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-900 shrink-0 mt-0.5" />
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0 bg-slate-50/70">
              <button
                type="button"
                onClick={() => {
                  setActiveModalProgram(null);
                  setActivePage('programs', null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModalProgram(null);
                  setActivePage('volunteer');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer"
              >
                Apply for this Cohort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
