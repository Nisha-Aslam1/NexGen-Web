import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import { TeamMember } from '../../types.ts';
import { LeaderProfileModal } from './LeaderProfileModal.tsx';
import {
  Users,
  Mail,
  Linkedin,
  Twitter,
  Award,
  ArrowUpRight
} from 'lucide-react';

export const TeamPage: React.FC = () => {
  const { team, setActivePage, settings } = useApp();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const activeMembers = [...team]
    .filter(m => m.active)
    .sort((a, b) => (a.displayOrder ?? (a as any).order ?? 999) - (b.displayOrder ?? (b as any).order ?? 999));
  const leadership = activeMembers.filter(m => m.department === 'Executive Board' || m.department === 'Leadership');
  const programLeads = activeMembers.filter(m => m.department !== 'Executive Board' && m.department !== 'Leadership');

  useDocumentSEO({
    title: 'Executive Leadership & Board | NexGen Council',
    description:
      'Meet the founder, board of directors, council executives, and program coordinators leading NexGen Women Empowerment & Youth Leadership Council.',
    canonicalPath: '/team',
    ogType: 'website',
    ogImage: '/banner.png',
    keywords: ['NexGen leadership', 'NexGen executive board', 'Minahil Imran Awan'],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'NexGen Council Leadership & Advisory Board',
        itemListElement: activeMembers.map((m, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          item: {
            '@type': 'Person',
            name: m.name,
            jobTitle: m.position,
            worksFor: {
              '@type': 'NGO',
              name: 'NexGen Council'
            }
          }
        }))
      }
    ]
  });

  return (
    <div className="space-y-16 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <Users className="w-3.5 h-3.5 text-amber-400" /> Council Governance
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            Leadership &amp; Advisory Council
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Meet the researchers, policy advocates, and educators guiding our programs with ethical governance and strategic direction.
          </p>
        </div>
      </section>

      {/* Executive Board */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-2xl font-serif font-bold text-slate-900">Executive Council &amp; Directorship</h2>
          <p className="text-xs text-slate-500 mt-1">
            Responsible for overall strategy, ethical standards, and global institutional partnerships. Click any profile card to read the full biography.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
          {(leadership.length > 0 ? leadership : activeMembers).map(mem => {
            const linkedin = mem.linkedinUrl || (mem as any).linkedin;
            const twitter = mem.twitterUrl || (mem as any).twitter;
            const bioPreview = (mem.bio || '').trim();

            return (
              <article
                key={mem.id}
                className="h-full bg-white rounded-3xl border border-slate-200 hover:border-indigo-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col group relative"
              >
                <div className="aspect-square bg-slate-900 overflow-hidden relative shrink-0">
                  <img
                    src={mem.image || '/logo.png'}
                    alt={`${mem.name} - ${mem.position}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.dataset.fallbackApplied) {
                        el.dataset.fallbackApplied = '1';
                        el.src = '/logo.png';
                        el.className = 'w-full h-full object-contain p-8 bg-slate-900';
                      }
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full bg-slate-950/80 text-amber-300 text-[11px] font-semibold backdrop-blur-xs">
                    {mem.department}
                  </span>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div>
                      <h3 className="font-serif font-bold text-lg text-slate-900 line-clamp-1 group-hover:text-indigo-950 transition-colors">
                        {mem.name}
                      </h3>
                      <p className="text-xs font-semibold text-amber-700 line-clamp-1 mt-0.5">
                        {mem.position}
                      </p>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 min-h-[3.65rem]">
                      {bioPreview || `${mem.position} at ${settings?.organizationName || 'NexGen Council'}. Click to view full profile.`}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMember(mem)}
                      aria-haspopup="dialog"
                      aria-label={`View full profile for ${mem.name}, ${mem.position}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-950 group-hover:text-amber-700 transition-colors cursor-pointer after:absolute after:inset-0 after:z-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg p-0.5 text-left"
                    >
                      <span>View Full Profile</span>
                      <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </button>

                    <div
                      className="relative z-10 flex items-center gap-2 text-slate-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {linkedin && (
                        <a
                          href={linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${mem.name} LinkedIn Profile`}
                          className="p-1 hover:text-indigo-950 transition-colors"
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {twitter && (
                        <a
                          href={twitter}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${mem.name} Twitter Profile`}
                          className="p-1 hover:text-indigo-950 transition-colors"
                        >
                          <Twitter className="w-4 h-4" />
                        </a>
                      )}
                      {mem.email && (
                        <a
                          href={`mailto:${mem.email}`}
                          aria-label={`Send email to ${mem.name}`}
                          className="p-1 hover:text-indigo-950 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Program Leads & Department Coordinators */}
      {programLeads.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-2xl font-serif font-bold text-slate-900">Program Leads &amp; Coordinators</h2>
            <p className="text-xs text-slate-500 mt-1">Directing fellowship cohorts, grassroots projects, and digital curricula.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {programLeads.map(mem => {
              const bioPreview = (mem.bio || '').trim();
              return (
                <article
                  key={mem.id}
                  className="h-full bg-white rounded-3xl border border-slate-200 hover:border-indigo-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group relative"
                >
                  <div className="aspect-square bg-slate-100 overflow-hidden relative shrink-0">
                    <img
                      src={mem.image || '/logo.png'}
                      alt={mem.name}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (!el.dataset.fallbackApplied) {
                          el.dataset.fallbackApplied = '1';
                          el.src = '/logo.png';
                          el.className = 'w-full h-full object-contain p-6 bg-slate-900';
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full bg-slate-950/80 text-slate-200 text-[10px] font-semibold">
                      {mem.department}
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <h4 className="font-serif font-bold text-base text-slate-900 line-clamp-1 group-hover:text-indigo-950 transition-colors">
                        {mem.name}
                      </h4>
                      <p className="text-xs font-semibold text-amber-700 line-clamp-1 mt-0.5">{mem.position}</p>
                      <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed min-h-[3.65rem]">
                        {bioPreview || `${mem.position} — click to view profile.`}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMember(mem)}
                        aria-haspopup="dialog"
                        aria-label={`View full profile for ${mem.name}, ${mem.position}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-950 group-hover:text-amber-700 transition-colors cursor-pointer after:absolute after:inset-0 after:z-0 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg p-0.5 text-left"
                      >
                        <span>View Profile</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>

                      {mem.email && (
                        <a
                          href={`mailto:${mem.email}`}
                          aria-label={`Send email to ${mem.name}`}
                          className="relative z-10 p-1 text-slate-400 hover:text-indigo-950 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Join Advisory Council Callout */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 space-y-3">
          <Award className="w-8 h-8 text-amber-600 mx-auto" />
          <h3 className="font-serif font-bold text-xl text-slate-900">Interested in Joining Our Advisory Board?</h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            We actively welcome senior academic researchers, civil servants, and philanthropic leaders to provide strategic guidance.
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                setActivePage('contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer"
            >
              Contact Advisory Secretariat
            </button>
          </div>
        </div>
      </section>

      {/* Openable Full Leader Biography Modal */}
      <LeaderProfileModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  );
};
