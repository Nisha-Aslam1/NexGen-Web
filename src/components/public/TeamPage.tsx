import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Users,
  Mail,
  Linkedin,
  Twitter,
  ShieldCheck,
  Award
} from 'lucide-react';

export const TeamPage: React.FC = () => {
  const { team, setActivePage, settings } = useApp();

  const activeMembers = team.filter(m => m.active);
  const leadership = activeMembers.filter(m => m.department === 'Executive Board' || m.department === 'Leadership');
  const programLeads = activeMembers.filter(m => m.department !== 'Executive Board' && m.department !== 'Leadership');

  useDocumentSEO({
    title: `Council Leadership & Governance | ${settings?.organizationName || 'NexGen Council'}`,
    description:
      'Meet the visionary leaders, policy educators, and civil society advocates steering the NexGen Women Empowerment & Youth Leadership Council.',
    canonicalPath: '/team',
    ogType: 'website',
    ogImage: '/banner.png',
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
          <p className="text-xs text-slate-500 mt-1">Responsible for overall strategy, ethical standards, and global institutional partnerships.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {(leadership.length > 0 ? leadership : activeMembers).map(mem => (
            <div
              key={mem.id}
              className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col group"
            >
              <div className="aspect-square bg-slate-900 overflow-hidden relative">
                <img
                  src={mem.image}
                  alt={`${mem.name} - ${mem.position}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full bg-slate-950/80 text-amber-300 text-[11px] font-semibold backdrop-blur-xs">
                  {mem.department}
                </span>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div>
                    <h3 className="font-serif font-bold text-lg text-slate-900">{mem.name}</h3>
                    <p className="text-xs font-semibold text-amber-700">{mem.position}</p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{mem.bio}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-slate-400">
                  <span className="text-[11px] text-slate-400">Council Member</span>
                  <div className="flex items-center gap-2">
                    {mem.linkedin && (
                      <a href={mem.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-950 transition-colors">
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                    {mem.email && (
                      <a href={`mailto:${mem.email}`} className="hover:text-indigo-950 transition-colors">
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Program Leads & Department Coordinators */}
      {programLeads.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-2xl font-serif font-bold text-slate-900">Program Leads &amp; Coordinators</h2>
            <p className="text-xs text-slate-500 mt-1">Directing fellowship cohorts, grassroots projects, and digital curricula.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {programLeads.map(mem => (
              <div
                key={mem.id}
                className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                <div className="aspect-square bg-slate-100 overflow-hidden relative">
                  <img
                    src={mem.image}
                    alt={mem.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full bg-slate-950/80 text-slate-200 text-[10px] font-semibold">
                    {mem.department}
                  </span>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="font-serif font-bold text-base text-slate-900">{mem.name}</h4>
                    <p className="text-xs font-semibold text-amber-700">{mem.position}</p>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">{mem.bio}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-slate-400">
                    {mem.email && (
                      <a href={`mailto:${mem.email}`} className="hover:text-indigo-950 transition-colors">
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
    </div>
  );
};
