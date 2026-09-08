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

export const ProgramsPage: React.FC = () => {
  const { programs, setActivePage, selectedProgramSlug } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeModalProgram, setActiveModalProgram] = useState<Program | null>(null);

  // Sync selectedProgramSlug from URL
  useEffect(() => {
    if (selectedProgramSlug && programs.length > 0) {
      const match = programs.find(p => p.slug === selectedProgramSlug || p.id === selectedProgramSlug);
      if (match) {
        setActiveModalProgram(match);
      }
    }
  }, [selectedProgramSlug, programs]);

  useDocumentSEO({
    title: activeModalProgram
      ? `${activeModalProgram.title} | Leadership Programs | NexGen Council`
      : 'Empowerment & Leadership Programs | NexGen Council',
    description: activeModalProgram
      ? activeModalProgram.shortDescription
      : 'Browse active youth civic fellowships, women leadership cohorts, and skills accelerator programs designed to foster grassroots change.',
    canonicalPath: activeModalProgram ? `/programs/${activeModalProgram.slug}` : '/programs',
    ogType: 'website',
    ogImage: activeModalProgram?.coverImage || '/banner.png',
    jsonLd: activeModalProgram
      ? {
          '@context': 'https://schema.org',
          '@type': 'EducationalOccupationalProgram',
          name: activeModalProgram.title,
          description: activeModalProgram.shortDescription,
          provider: {
            '@type': 'NGO',
            name: 'NexGen Council',
            url: window.location.origin
          },
          timeToComplete: activeModalProgram.duration || 'P1M'
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'NexGen Leadership & Empowerment Programs',
          itemListElement: programs.map((p, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: p.title,
            url: `${window.location.origin}/programs/${p.slug}`
          }))
        }
  });

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPrograms.map(prg => (
              <div
                key={prg.id}
                className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col group"
              >
                <div className="relative aspect-16/10 overflow-hidden bg-slate-900">
                  <img
                    src={prg.coverImage}
                    alt={prg.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-serif font-bold text-lg text-slate-900 group-hover:text-indigo-950 transition-colors">
                      {prg.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
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
                        setActivePage('programs', prg.slug);
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-8">
            <button
              onClick={() => {
                setActiveModalProgram(null);
                setActivePage('programs', null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full cursor-pointer"
            >
              ✕
            </button>

            <div className="aspect-16/9 rounded-2xl overflow-hidden bg-slate-900">
              <img
                src={activeModalProgram.coverImage}
                alt={`${activeModalProgram.title} cohort overview banner`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-950 text-xs font-semibold">
                {activeModalProgram.category}
              </span>
              <h3 className="text-2xl font-serif font-bold text-slate-900">
                {activeModalProgram.title}
              </h3>
              <p className="text-xs text-slate-500">
                Cohort Duration: {activeModalProgram.startDate || 'Quarterly Session'} to {activeModalProgram.endDate || 'Ongoing'}
              </p>
            </div>

            <div className="text-sm text-slate-700 leading-relaxed space-y-3">
              <p>{activeModalProgram.fullDescription}</p>

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

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setActiveModalProgram(null);
                  setActivePage('programs', null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
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
