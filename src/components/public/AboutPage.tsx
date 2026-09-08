import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Compass,
  Globe2,
  ShieldCheck,
  Target,
  Sparkles,
  Users,
  Award,
  CheckCircle2,
  BookOpen,
  ArrowRight
} from 'lucide-react';

export const AboutPage: React.FC = () => {
  const { setActivePage, settings } = useApp();

  useDocumentSEO({
    title: `About Us | ${settings?.organizationName || 'NexGen Council'}`,
    description:
      'Discover the mission, history, and core values of NexGen Council. Learn how our civil society initiative accelerates women empowerment and youth civic leadership.',
    canonicalPath: '/about',
    ogType: 'website',
    ogImage: '/banner.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin },
          { '@type': 'ListItem', position: 2, name: 'About Us', item: `${window.location.origin}/about` }
        ]
      }
    ]
  });

  return (
    <div className="space-y-16 pb-20">
      {/* Header Banner */}
      <section className="bg-slate-900 text-white py-16 sm:py-20 border-b border-slate-800 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5 text-amber-400" /> About Our Council
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight max-w-3xl mx-auto">
            Dedicated to Women Empowerment &amp; Youth Civic Leadership
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Cultivating grassroots changemakers and equipping visionary leaders with the ethical framework, strategic skills, and community support needed to transform society.
          </p>
        </div>
      </section>

      {/* Organizational Purpose & Story */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-900 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 inline-block">
              Our Origin &amp; Mandate
            </span>
            <h2 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">
              From Grassroots Mentorship to an International Leadership Network
            </h2>
            <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
              <p>
                Founded as a collaborative council of educators, social advocates, and youth researchers, NexGen Council was established to counteract structural disparities that limit young women and youth from entering senior civic, corporate, and social leadership roles.
              </p>
              <p>
                Over the years, our initiatives have expanded from local community dialogues into comprehensive 30-day leadership fellowships, women in technology bootcamps, and municipal youth parliamentary forums.
              </p>
              <p>
                Today, NexGen Council operates with chapters across multiple districts, mobilizing hundreds of active volunteers and partnering with educational institutions, community centres, and humanitarian organizations.
              </p>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden shadow-xl border-4 border-white bg-slate-900 aspect-4/3">
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=900&auto=format&fit=crop&q=80"
                alt="NexGen Council women leaders and educators collaborating during civic strategy session"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent flex items-end p-6">
                <p className="text-white text-xs sm:text-sm font-medium">
                  "Leadership is not defined by title or privilege, but by courage, civic empathy, and deliberate service to others."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission, Vision, and Core Values */}
      <section className="bg-slate-50 py-16 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-950 flex items-center justify-center font-bold">
                <Compass className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-serif font-bold text-slate-900">Our Mission</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {settings?.missionStatement ||
                  'To dismantle socio-economic barriers by providing young women and emerging youth leaders with world-class leadership training, mentorship networks, and platforms to enact systemic change in their communities.'}
              </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <Globe2 className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-serif font-bold text-slate-900">Our Vision</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {settings?.visionStatement ||
                  'A globally equitable society where every young woman has the agency, resources, and leadership opportunities to shape policy, enterprise, and social progress.'}
              </p>
            </div>
          </div>

          {/* Core Values */}
          <div>
            <div className="text-center space-y-2 mb-8">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-900">Guiding Philosophy</span>
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">Our Core Values</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: 'Inclusivity & Dignity', desc: 'Ensuring every voice from marginalized backgrounds is celebrated and given an equal seat at the table.' },
                { title: 'Ethical Leadership', desc: 'Promoting moral accountability, rigorous transparency, and compassionate stewardship in all public affairs.' },
                { title: 'Grassroots Action', desc: 'Believing that true transformation occurs from community ground-level upwards, not purely top-down.' },
                { title: 'Continuous Growth', desc: 'Fostering intellectual curiosity, scientific literacy, and resilience through structured mentorship.' }
              ].map((val, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <span className="w-7 h-7 rounded-full bg-slate-100 text-indigo-950 font-bold text-xs flex items-center justify-center">
                    0{i + 1}
                  </span>
                  <h4 className="font-serif font-bold text-base text-slate-900">{val.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{val.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Timeline / Milestones */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-700">Evolution &amp; Growth</span>
          <h3 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">Our Journey &amp; Milestones</h3>
        </div>

        <div className="space-y-6 relative border-l-2 border-slate-200 pl-6 ml-4 sm:ml-8">
          {[
            {
              year: '2021',
              title: 'Council Inception & First Grassroots Circle',
              desc: 'Initiated with 15 emerging women advocates organizing localized workshops on public narrative and career navigation.'
            },
            {
              year: '2022',
              title: 'Launch of 30-Day Leadership Development Cohorts',
              desc: 'Formalized accredited curriculum covering conflict resolution, media relations, and grant-writing fundamentals.'
            },
            {
              year: '2023',
              title: 'Women in STEM & Tech Mentorship Expansion',
              desc: 'Partnered with technology industry leaders to sponsor digital literacy, coding bootcamps, and career placement.'
            },
            {
              year: '2024 - 2025',
              title: 'National Youth Parliamentary & Policy Summits',
              desc: 'Hosted multi-district symposiums uniting youth delegates with civic representatives and policy scholars.'
            },
            {
              year: '2026 & Beyond',
              title: 'Digital Volunteer Directory & Expansion',
              desc: 'Deploying the integrated volunteer management and regional chapter portal to scale impact across hundreds of communities.'
            }
          ].map((m, i) => (
            <div key={i} className="relative space-y-1">
              <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-950 border-2 border-white shadow-xs" />
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider font-mono">{m.year}</span>
              <h4 className="font-serif font-bold text-base text-slate-900">{m.title}</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-indigo-950 text-white p-8 sm:p-12 rounded-3xl space-y-4">
          <h3 className="text-2xl sm:text-3xl font-serif font-bold">Be Part of the Next Chapter</h3>
          <p className="text-slate-300 text-sm max-w-xl mx-auto">
            Whether as an aspiring cohort scholar, grassroots volunteer, or philanthropic partner, your involvement strengthens our mission.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => {
                setActivePage('volunteer');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              Apply as Volunteer
            </button>
            <button
              onClick={() => {
                setActivePage('team');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              Meet Our Leadership
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
