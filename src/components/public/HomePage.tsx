import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ArrowRight,
  Sparkles,
  Users,
  Award,
  BookOpen,
  HeartHandshake,
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Globe2,
  Layers,
  Compass,
  Maximize2,
  X
} from 'lucide-react';
import { Program, EventItem } from '../../types.ts';
import { useDocumentSEO } from '../../lib/seo.ts';

export const HomePage: React.FC = () => {
  const { setActivePage, settings, programs, events, news, team } = useApp();
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showPosterModal, setShowPosterModal] = useState(false);

  useDocumentSEO({
    title: `Home | ${settings?.organizationName || 'NexGen Council'}`,
    description:
      'Empowering the next generation of female leaders and civic innovators through structured mentorship, skill building, and grassroots advocacy.',
    canonicalPath: '/',
    ogType: 'website',
    ogImage: '/banner.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'NGO',
        name: settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council',
        alternateName: 'NexGen Council',
        url: window.location.origin,
        logo: `${window.location.origin}/logo.png`,
        image: `${window.location.origin}/banner.png`,
        description:
          settings?.tagline ||
          'Empowering women and youth through leadership mentorship, civic innovation, and grassroots community advocacy.',
        telephone: settings?.contactPhone || '+1 (800) 482-9380',
        email: settings?.contactEmail || 'contact@nexgencouncil.org'
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: settings?.organizationName || 'NexGen Council',
        url: window.location.origin
      }
    ]
  });

  const featuredPrograms = programs.filter(p => p.featured || p.status === 'Published').slice(0, 3);
  const upcomingEvents = events.filter(e => e.status === 'Upcoming').slice(0, 3);
  const latestNews = news.filter(n => n.status === 'Published').slice(0, 3);
  const leadershipPreview = team.filter(t => t.active).slice(0, 4);

  return (
    <div className="space-y-20 pb-20">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 border-b border-slate-200/80 bg-gradient-to-b from-slate-100 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-950 text-white text-xs font-semibold uppercase tracking-wider shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>NexGen Women &amp; Youth Leadership Council</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-slate-950 tracking-tight leading-[1.12]">
                Empowering Women. <br />
                Inspiring Youth. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-950 via-indigo-900 to-amber-700">
                  Transforming Communities.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                {settings?.heroSubheading ||
                  'NexGen Council is an international civil society initiative dedicated to accelerating female leadership, youth civic engagement, and socio-economic advancement through rigorous mentorship and grassroots innovation.'}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <button
                  onClick={() => {
                    setActivePage('volunteer');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto px-7 py-4 bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-indigo-950/20 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <HeartHandshake className="w-4 h-4 text-amber-400" />
                  <span>Become a Volunteer</span>
                </button>

                <button
                  onClick={() => {
                    setActivePage('programs');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto px-6 py-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Explore Programs</span>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="pt-6 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs text-slate-500 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Official Civil Society Charter</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-800" />
                  <span>{settings?.stats?.volunteersCount || '1,450+'} Registered Volunteers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span>30-Day Leadership Framework</span>
                </div>
              </div>
            </div>

            {/* Right Visual Card */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden shadow-xl border border-slate-200/90 bg-white group flex flex-col justify-between">
                <img
                  src="/banner.png"
                  alt="NexGen Women Empowerment and Youth Leadership Council official poster showcasing flagship community initiatives"
                  loading="eager"
                  fetchPriority="high"
                  className="w-full h-auto object-contain block transition-transform duration-500 group-hover:scale-[1.01] cursor-pointer"
                  onClick={() => setShowPosterModal(true)}
                  onError={(e) => {
                    // Fallback to high quality leadership image
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=900&auto=format&fit=crop&q=80';
                  }}
                />

                {/* Full-screen expand button */}
                <button
                  type="button"
                  onClick={() => setShowPosterModal(true)}
                  className="absolute top-3 right-3 p-2 rounded-xl bg-white/90 hover:bg-white text-slate-700 shadow-md backdrop-blur-xs transition-opacity opacity-80 hover:opacity-100 cursor-pointer"
                  title="View Full Poster"
                  aria-label="View Full Poster"
                >
                  <Maximize2 className="w-4 h-4 text-slate-700" />
                </button>

                {/* Cohort Action Badge */}
                <div className="p-4 sm:p-5 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block">
                      30-Day Flagship Cohort
                    </span>
                    <strong className="text-slate-900 text-sm font-semibold block">
                      Leadership Development Series
                    </strong>
                    <span className="text-slate-500 text-xs">
                      Enrolling emerging women &amp; youth leaders
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setActivePage('volunteer');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="p-3 rounded-xl bg-indigo-950 text-white hover:bg-indigo-900 transition-colors shrink-0 cursor-pointer shadow-sm"
                    title="Apply to Cohort"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2 & 3 & 4. ABOUT, MISSION, VISION & WHAT WE DO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 inline-block">
              About the Organization
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight">
              Institutional Mentorship Built For Systemic Impact
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              NexGen Women Empowerment &amp; Youth Leadership Council was created to bridge the critical gap between raw potential and institutional influence. We equip emerging women changemakers with evidence-based policy formulation, public speaking acumen, and grassroots community organizing methodologies.
            </p>
            <div className="pt-2">
              <button
                onClick={() => {
                  setActivePage('about');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-950 hover:text-indigo-800 cursor-pointer"
              >
                <span>Read our full organizational charter &amp; history</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Mission Card */}
            <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-950 flex items-center justify-center font-bold">
                <Compass className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-serif font-bold text-slate-900">Our Mission</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {settings?.missionStatement ||
                  'To dismantle socio-economic barriers by providing young women and emerging youth leaders with world-class leadership training, mentorship networks, and platforms to enact systemic change in their communities.'}
              </p>
            </div>

            {/* Vision Card */}
            <div className="bg-white p-7 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <Globe2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-serif font-bold text-slate-900">Our Vision</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {settings?.visionStatement ||
                  'A globally equitable society where every young woman has the agency, resources, and leadership opportunities to shape policy, enterprise, and social progress.'}
              </p>
            </div>
          </div>
        </div>

        {/* 4. WHAT WE DO (5 PILLARS) */}
        <div className="pt-8">
          <div className="text-center space-y-2 mb-10">
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-900">Core Strategic Pillars</span>
            <h3 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">What We Do</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {[
              {
                title: '30-Day Leadership Series',
                desc: 'Accelerated cohort training in strategic negotiation, public narrative, and civic ethics.',
                icon: Award
              },
              {
                title: 'Women in Tech & STEM',
                desc: '1-on-1 industry mentorship and practical hands-on software & AI fellowships.',
                icon: Layers
              },
              {
                title: 'Grassroots Micro-Grants',
                desc: 'Seed funding and financial literacy for female artisans and micro-entrepreneurs.',
                icon: TrendingUp
              },
              {
                title: 'Youth Civic Policy',
                desc: 'Direct interaction with parliamentarians, policy research, and municipal advocacy.',
                icon: BookOpen
              },
              {
                title: 'Community Health Camps',
                desc: 'Mobile preventive screenings, mental wellness circles, and maternal hygiene kits.',
                icon: HeartHandshake
              }
            ].map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={i}
                  className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-indigo-900/30 transition-all hover:-translate-y-1 space-y-3 shadow-xs"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-indigo-950 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="font-serif font-bold text-sm text-slate-900">{pillar.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{pillar.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. FEATURED PROGRAMS */}
      <section className="bg-slate-100/70 py-16 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-900 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 inline-block mb-2">
                Structured Curriculums
              </span>
              <h2 className="text-3xl font-serif font-bold text-slate-900">Featured Programs &amp; Cohorts</h2>
              <p className="text-slate-600 text-sm max-w-xl mt-1">
                Rigorous, accredited cohorts tailored for university scholars, professional women, and civic activists.
              </p>
            </div>
            <button
              onClick={() => {
                setActivePage('programs');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-950 hover:text-indigo-800 cursor-pointer self-start sm:self-auto"
            >
              <span>View all programs</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredPrograms.map(prg => (
              <div
                key={prg.id}
                className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group"
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

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => setSelectedProgram(prg)}
                      className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                    >
                      View Curriculum →
                    </button>
                    <button
                      onClick={() => {
                        setActivePage('volunteer');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-3 py-1.5 bg-indigo-950 text-white text-xs font-semibold rounded-lg hover:bg-indigo-900 transition-colors cursor-pointer"
                    >
                      Apply Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. UPCOMING EVENTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 inline-block mb-2">
              Gatherings &amp; Masterclasses
            </span>
            <h2 className="text-3xl font-serif font-bold text-slate-900">Upcoming Events &amp; Summits</h2>
            <p className="text-slate-600 text-sm max-w-xl mt-1">
              Participate in interactive discussions, civic masterclasses, and executive dialogues.
            </p>
          </div>
          <button
            onClick={() => {
              setActivePage('events');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-950 hover:text-indigo-800 cursor-pointer self-start sm:self-auto"
          >
            <span>Browse event calendar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {upcomingEvents.map(evt => (
            <div
              key={evt.id}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-indigo-950 bg-slate-100 px-2.5 py-1 rounded-md">
                    {evt.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    {new Date(evt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                  {evt.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {evt.description}
                </p>

                <div className="space-y-1.5 text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{evt.time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{evt.location}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  onClick={() => setSelectedEvent(evt)}
                  className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                >
                  Event Details
                </button>
                <button
                  onClick={() => {
                    setActivePage('volunteer');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  RSVP / Register
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7. ORGANIZATION IMPACT / STATISTICS */}
      <section className="bg-gradient-to-br from-indigo-950 via-slate-950 to-indigo-950 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 text-center">
          <div className="space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
              Measurable Progress
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">
              Our Collective Impact Across Regions
            </h2>
            <p className="text-slate-300 text-sm">
              Through sustained community presence and institutional partnerships, NexGen Council continues to expand opportunities.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { value: settings?.stats?.volunteersCount || '1,450+', label: 'Trained Volunteers', desc: 'Mobilized in civic action' },
              { value: settings?.stats?.beneficiariesCount || '8,200+', label: 'Women & Youth Beneficiaries', desc: 'Across education & health' },
              { value: settings?.stats?.programsCount || '28', label: 'Completed Cohorts', desc: 'Accredited development series' },
              { value: settings?.stats?.communitiesCount || '46', label: 'Regional Chapters', desc: 'Active municipal districts' }
            ].map((stat, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm space-y-1">
                <strong className="font-serif text-3xl sm:text-4xl font-bold text-amber-300 block">
                  {stat.value}
                </strong>
                <span className="font-semibold text-sm text-white block">{stat.label}</span>
                <span className="text-[11px] text-slate-400 block">{stat.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. LEADERSHIP / TEAM PREVIEW */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-900 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 inline-block mb-2">
              Council Governance
            </span>
            <h2 className="text-3xl font-serif font-bold text-slate-900">Leadership &amp; Advisory Council</h2>
            <p className="text-slate-600 text-sm max-w-xl mt-1">
              Led by seasoned educators, legal researchers, and youth organizers dedicated to ethical stewardship.
            </p>
          </div>
          <button
            onClick={() => {
              setActivePage('team');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-950 hover:text-indigo-800 cursor-pointer self-start sm:self-auto"
          >
            <span>Meet full leadership</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {leadershipPreview.map(mem => (
            <div
              key={mem.id}
              className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col"
            >
              <div className="aspect-square bg-slate-100 overflow-hidden relative">
                <img
                  src={mem.image}
                  alt={mem.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-2">
                <div>
                  <h4 className="font-serif font-bold text-base text-slate-900">{mem.name}</h4>
                  <p className="text-xs font-medium text-amber-700">{mem.position}</p>
                </div>
                <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{mem.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 9. LATEST NEWS & ANNOUNCEMENTS */}
      <section className="bg-slate-50 py-16 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 inline-block mb-2">
                Press &amp; Stories
              </span>
              <h2 className="text-3xl font-serif font-bold text-slate-900">Latest News &amp; Updates</h2>
              <p className="text-slate-600 text-sm max-w-xl mt-1">
                Official press releases, fellowship stories, and regional expansion bulletins.
              </p>
            </div>
            <button
              onClick={() => {
                setActivePage('news');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-950 hover:text-indigo-800 cursor-pointer self-start sm:self-auto"
            >
              <span>Browse all articles</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {latestNews.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-16/9 overflow-hidden bg-slate-900 relative">
                    <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover" />
                    <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full bg-slate-950/80 text-white text-[11px] font-semibold">
                      {item.category}
                    </span>
                  </div>
                  <div className="p-6 space-y-2">
                    <span className="text-[11px] text-slate-400">
                      {new Date(item.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • By {item.author}
                    </span>
                    <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>
                </div>
                <div className="px-6 pb-6 pt-2">
                  <button
                    onClick={() => {
                      setActivePage('news');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                  >
                    Read Full Story →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10 & 11. VOLUNTEER CTA & CONTACT INQUIRY BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 sm:p-14 shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-4 text-center sm:text-left">
            <span className="text-xs font-bold text-amber-300 uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full inline-block">
              Take the Next Step
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">
              Start Your Journey. Discover Yourself. Build Your Skills. Become a Leader.
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Applications for the 2026 Leadership Development Cohorts and Regional Volunteer Teams are now open. Join us in shaping an inclusive future for women and youth.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
              <button
                onClick={() => {
                  setActivePage('volunteer');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-7 py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <HeartHandshake className="w-4 h-4 fill-slate-950" />
                <span>Submit Volunteer Application</span>
              </button>
              <button
                onClick={() => {
                  setActivePage('contact');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-6 py-4 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Contact Council Secretariat
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Program Details Modal */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-8">
            <button
              onClick={() => setSelectedProgram(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full cursor-pointer"
            >
              ✕
            </button>

            <div className="aspect-16/9 rounded-2xl overflow-hidden bg-slate-900">
              <img src={selectedProgram.coverImage} alt={selectedProgram.title} className="w-full h-full object-cover" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-950 text-xs font-semibold">
                {selectedProgram.category}
              </span>
              <h3 className="text-2xl font-serif font-bold text-slate-900">
                {selectedProgram.title}
              </h3>
              <p className="text-xs text-slate-500">
                Timeline: {selectedProgram.startDate || 'Rolling Cohorts'} to {selectedProgram.endDate || 'Ongoing'}
              </p>
            </div>

            <div className="text-sm text-slate-700 leading-relaxed space-y-3">
              <p>{selectedProgram.fullDescription}</p>

              {selectedProgram.curriculumHighlights && selectedProgram.curriculumHighlights.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-4">
                  <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider mb-2">
                    Curriculum Highlights &amp; Modules
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {selectedProgram.curriculumHighlights.map((hl, i) => (
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
                onClick={() => setSelectedProgram(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedProgram(null);
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

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-8">
            <button
              onClick={() => setSelectedEvent(null)}
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

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setActivePage('volunteer');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer"
              >
                RSVP via Volunteer Registration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Poster Modal */}
      {showPosterModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => setShowPosterModal(false)}
        >
          <div
            className="relative max-w-6xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl p-4 sm:p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">NexGen Council Official Poster</h3>
                <p className="text-xs text-slate-500">Full resolution display</p>
              </div>
              <button
                onClick={() => setShowPosterModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-auto max-h-[75vh] flex items-center justify-center bg-slate-50 rounded-2xl p-2 sm:p-4">
              <img
                src="/banner.png"
                alt="NexGen Council Official Poster - Full"
                className="w-full h-auto max-h-[70vh] object-contain rounded-xl shadow-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">Official Civil Society &amp; Leadership Initiative</span>
              <button
                onClick={() => {
                  setShowPosterModal(false);
                  setActivePage('volunteer');
                }}
                className="px-5 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Apply to Next Cohort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
