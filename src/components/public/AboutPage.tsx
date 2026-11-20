import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  ArrowRight,
  ChevronDown,
  Compass,
  Globe2,
  ShieldCheck,
  Users,
  BookOpen,
  HeartHandshake
} from 'lucide-react';

type CharterTabId = 'mandate' | 'governance' | 'fellowship';

interface FaqItem {
  question: string;
  answer: string;
}

const CHARTER_TABS: Record<
  CharterTabId,
  {
    index: string;
    label: string;
    heading: string;
    summary: string;
    commitments: { title: string; detail: string }[];
  }
> = {
  mandate: {
    index: '01',
    label: 'Mission & Mandate',
    heading: 'Institutional Mandate for Women & Youth Equity',
    summary:
      'NexGen Council advances measurable civic, economic, and leadership participation for young women and emerging youth leaders through structured education and mentorship.',
    commitments: [
      {
        title: 'Equitable Access to Leadership',
        detail:
          'Removing socio-economic and geographic barriers so talented young women from emerging districts enter civic, corporate, and policy rooms.'
      },
      {
        title: 'Applied Civic & Digital Literacy',
        detail:
          'Pairing ethics, public narrative, and parliamentary debate with STEM, entrepreneurship, and financial agency.'
      },
      {
        title: 'Verified Grassroots Outcomes',
        detail:
          'Every fellow graduates by designing and executing a measurable local community initiative audited by council mentors.'
      }
    ]
  },
  governance: {
    index: '02',
    label: 'Governance & Accountability',
    heading: 'Transparent Council Charter & Ethical Stewardship',
    summary:
      'Guided by an Executive Board, regional chapter coordinators, and educator advisors, NexGen Council operates with transparent application tracking and role-based accountability.',
    commitments: [
      {
        title: 'Merit-Based Cohort Selection',
        detail:
          'All volunteer and fellowship applications receive a verifiable tracking ID and structured review by trained regional coordinators.'
      },
      {
        title: 'Safeguarding & Inclusion Standards',
        detail:
          'Strict zero-harassment, equal-representation, and mentorship safety protocols across all physical summits and digital meetings.'
      },
      {
        title: 'Open Institutional Reporting',
        detail:
          'Publicly documented program rosters, event archives, and official press dispatches verify community impact.'
      }
    ]
  },
  fellowship: {
    index: '03',
    label: '30-Day Leadership Model',
    heading: 'How Our 30-Day Leadership Series Develops Changemakers',
    summary:
      'Our flagship cohort curriculum bridges classroom theory and real-world community execution in four progressive weekly sprints.',
    commitments: [
      {
        title: 'Weeks 1–2 · Foundations & Rhetoric',
        detail:
          'Ethical governance, critical policy analysis, executive communication, and persuasive public advocacy.'
      },
      {
        title: 'Week 3 · Strategy & Venture Lab',
        detail:
          'Project budgeting, grant proposal drafting, digital mobilization, and women-led social entrepreneurship.'
      },
      {
        title: 'Week 4 · Community Practicum & Induction',
        detail:
          'Live fieldwork deployment, peer evaluation, and certification into the active NexGen Council alumni network.'
      }
    ]
  }
};

const CORE_VALUES = [
  {
    num: '01',
    title: 'Inclusivity & Dignity',
    desc: 'Ensuring emerging voices from underserved districts and marginalized communities hold an equal seat in decision-making spaces.'
  },
  {
    num: '02',
    title: 'Ethical Stewardship',
    desc: 'Upholding moral accountability, transparent institutional governance, and principled public service across every chapter.'
  },
  {
    num: '03',
    title: 'Grassroots Action',
    desc: 'Treating community mobilization from the ground up—not symbolic statements—as the true engine of societal transformation.'
  },
  {
    num: '04',
    title: 'Continuous Scholarship',
    desc: 'Cultivating intellectual rigor, policy literacy, technological fluency, and collaborative resilience through mentorship.'
  }
];

export const AboutPage: React.FC = () => {
  const { setActivePage, settings, programs, events, team } = useApp();
  const [activeTab, setActiveTab] = useState<CharterTabId>('mandate');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [logoFailed, setLogoFailed] = useState(false);

  const canonicalBase =
    window.location.hostname === 'nexgencouncil.bond' || window.location.hostname === 'www.nexgencouncil.bond'
      ? 'https://nexgencouncil.bond'
      : window.location.origin;

  const publishedProgramsCount = programs.filter(p => p.status === 'Published').length;
  const activeLeadersCount = team.filter(t => t.active).length;
  const eventsCount = events.length;

  const faqItems: FaqItem[] = [
    {
      question: 'What is NexGen Council (NexGen Women Empowerment & Youth Leadership Council)?',
      answer:
        'NexGen Council is an independent civil society leadership council dedicated to advancing women empowerment, youth civic participation, and structured leadership mentorship across Pakistan and international chapters.'
    },
    {
      question: 'What is the 30-Day Leadership Series offered by NexGen Council?',
      answer:
        'The 30-Day Leadership Development Series is NexGen Council’s flagship intensive fellowship covering public policy, ethical governance, communication strategy, entrepreneurship, and community project execution.'
    },
    {
      question: 'How can women and youth volunteer or join NexGen Council programs?',
      answer:
        'Aspiring fellows, volunteers, and community organizers can apply online through our Volunteer Registration portal and track their application review status anytime using their reference ID.'
    },
    {
      question: 'How can educational institutions or organizations partner with NexGen Council?',
      answer:
        'Universities, NGOs, and civic partners can connect with the NexGen Council central secretariat through our Contact page to co-host leadership symposiums, sponsor mentorship fellowships, or collaborate on grassroots outreach.'
    }
  ];

  useDocumentSEO({
    title: 'About NexGen Council | Women Empowerment & Youth Leadership',
    description:
      'Discover NexGen Council—our mission, charter, 30-Day Leadership Series, and governance empowering women and youth civic leaders across Pakistan and beyond.',
    canonicalPath: '/about',
    ogType: 'website',
    ogImage: '/logo.png',
    keywords: [
      'NexGen',
      'NexGen Council',
      'about NexGen',
      'about NexGen Council',
      'NexGen Women Empowerment',
      'NexGen Youth Leadership',
      'NexGen Pakistan',
      'NexGen Sialkot',
      'women empowerment NGO Pakistan',
      'youth leadership council',
      '30-Day Leadership Series',
      'Minahil Imran Awan NexGen',
      'female leadership mentorship',
      'civic engagement Pakistan'
    ],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        '@id': `${canonicalBase}/about#webpage`,
        url: `${canonicalBase}/about`,
        name: 'About NexGen Council | Women Empowerment & Youth Leadership',
        description:
          'Discover NexGen Council—our mission, charter, 30-Day Leadership Series, and governance empowering women and youth civic leaders across Pakistan and beyond.',
        inLanguage: 'en',
        isPartOf: { '@id': `${canonicalBase}/#website` },
        about: { '@id': `${canonicalBase}/#organization` },
        mainEntity: { '@id': `${canonicalBase}/#organization` },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: `${canonicalBase}/logo.png`
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'NGO',
        '@id': `${canonicalBase}/#organization`,
        name: settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council',
        alternateName: ['NexGen', 'NexGen Council', 'NexGen Women Empowerment', 'NexGen Youth Leadership', 'NexGen Pakistan'],
        url: canonicalBase,
        logo: `${canonicalBase}/logo.png`,
        foundingLocation: {
          '@type': 'Place',
          name: 'Sialkot, Punjab, Pakistan'
        },
        description:
          settings?.metaDescription ||
          'NexGen Council empowers emerging female leaders and youth changemakers through mentorship, fellowships, and community impact.',
        knowsAbout: [
          'Women Empowerment',
          'Youth Leadership Development',
          '30-Day Leadership Series',
          'Civic Engagement',
          'Female Entrepreneurship'
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer
          }
        }))
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: canonicalBase },
          { '@type': 'ListItem', position: 2, name: 'About NexGen Council', item: `${canonicalBase}/about` }
        ]
      }
    ]
  });

  const navigate = (page: 'home' | 'volunteer' | 'team' | 'programs' | 'contact') => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentCharter = CHARTER_TABS[activeTab];

  return (
    <article
      className="bg-stone-50/70 text-slate-900 pb-24"
      itemScope
      itemType="https://schema.org/AboutPage"
    >
      {/* 1. INSTITUTIONAL EDITORIAL HERO + LOGO SEAL */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 lg:pt-14 lg:pb-16">
          {/* Clean Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-stone-500 mb-8">
            <button
              type="button"
              onClick={() => navigate('home')}
              className="hover:text-indigo-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              Home
            </button>
            <span aria-hidden="true">/</span>
            <span className="text-slate-900 font-medium whitespace-nowrap">About NexGen Council</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Editorial Column */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Institutional Charter · Sialkot &amp; Global Chapters
                </p>

                <h1
                  className="text-3xl sm:text-5xl lg:text-[3.25rem] font-serif font-bold text-slate-950 tracking-tight leading-[1.12] [text-wrap:balance] max-w-2xl"
                  itemProp="name"
                >
                  Dedicated to Women Empowerment &amp; Youth Civic Leadership
                </h1>

                <p
                  className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl"
                  itemProp="description"
                >
                  <strong>NexGen Council</strong> (NexGen Women Empowerment &amp; Youth Leadership Council) cultivates grassroots changemakers across Pakistan and international chapters—equipping emerging women and youth leaders with ethical governance frameworks, strategic fellowships, and real civic influence.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => navigate('volunteer')}
                  className="px-6 py-3 bg-indigo-950 hover:bg-indigo-900 text-white text-sm font-semibold rounded-xl transition-colors duration-150 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <HeartHandshake className="w-4 h-4 text-amber-300" />
                  <span>Apply as Volunteer</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('team')}
                  className="px-5 py-3 bg-stone-100 hover:bg-stone-200/80 text-slate-900 text-sm font-semibold rounded-xl transition-colors duration-150 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span>Meet Executive Board</span>
                  <ArrowRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Right Official Council Logo Showcase */}
            <div className="lg:col-span-5 flex">
              <figure className="w-full flex flex-col justify-between rounded-2xl border border-stone-200 bg-slate-950 p-8 sm:p-10 text-center">
                <div className="flex-1 flex items-center justify-center py-4">
                  {!logoFailed ? (
                    <img
                      src="/logo.png"
                      alt="NexGen Women Empowerment & Youth Leadership Council Official Logo"
                      referrerPolicy="no-referrer"
                      onError={() => setLogoFailed(true)}
                      className="w-44 h-44 sm:w-52 sm:h-52 object-contain"
                    />
                  ) : (
                    <div className="w-44 h-44 rounded-full border border-amber-400/30 bg-indigo-950 flex items-center justify-center">
                      <Compass className="w-16 h-16 text-amber-400" />
                    </div>
                  )}
                </div>

                <figcaption className="pt-6 border-t border-white/10 space-y-1">
                  <p className="font-serif font-bold text-base text-white">
                    NexGen Council
                  </p>
                  <p className="text-xs text-slate-300 tracking-wide">
                    Women Empowerment &amp; Youth Leadership
                  </p>
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Operational & Live Impact Ledger Strip (below hero split) */}
          <dl className="mt-12 pt-8 border-t border-stone-200 grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <div className="space-y-1">
              <dt className="text-xs font-medium text-stone-500">Council Headquarters</dt>
              <dd className="text-xl sm:text-2xl font-serif font-bold text-slate-950">
                {settings?.directoryHeadquarters || 'Sialkot, PK'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium text-stone-500">Active Leadership Programs</dt>
              <dd className="text-xl sm:text-2xl font-serif font-bold text-slate-950 tabular-nums">
                {publishedProgramsCount > 0 ? publishedProgramsCount : 4} Cohorts
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium text-stone-500">Council Board &amp; Leads</dt>
              <dd className="text-xl sm:text-2xl font-serif font-bold text-slate-950 tabular-nums">
                {activeLeadersCount > 0 ? activeLeadersCount : 6} Executives
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium text-stone-500">Summits &amp; Outreach Forums</dt>
              <dd className="text-xl sm:text-2xl font-serif font-bold text-slate-950 tabular-nums">
                {eventsCount > 0 ? `${eventsCount} Recorded` : 'Multi-District'}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {/* 2. FOUNDING ESSAY & INSTITUTIONAL DIRECTORY (Asymmetric 7/5 Grid) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Main Essay Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2 border-b border-stone-200 pb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-900">
                Chapter 01 · Origin &amp; Purpose
              </p>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-950 tracking-tight [text-wrap:balance]">
                From Local Mentorship Circles to a Structured Leadership Network
              </h2>
            </div>

            <div className="space-y-5 text-[15px] sm:text-base text-slate-700 leading-[1.75] max-w-2xl">
              <p className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:leading-none first-letter:text-indigo-950">
                Founded as a collaborative civil society initiative of educators, youth researchers, and women advocates, NexGen Council was established to address structural disparities that keep talented young women and emerging youth leaders out of senior civic, institutional, and entrepreneurial roles.
              </p>
              <p>
                What began as focused community dialogues in Sialkot has grown into our flagship 30-Day Leadership Development Series, Women in STEM and Entrepreneurship mentorship tracks, and multi-district youth parliamentary symposiums connecting emerging voices directly with civic scholars.
              </p>
              <p>
                Today, NexGen Women Empowerment &amp; Youth Leadership Council operates with verified volunteer onboarding, transparent application tracking, and active educational partnerships—turning ambition into disciplined public service.
              </p>
            </div>

            {/* Editorial Pull Quote */}
            <blockquote className="my-8 py-6 border-y border-stone-300 max-w-2xl">
              <p className="font-serif italic text-xl sm:text-2xl text-slate-900 leading-relaxed">
                “Leadership is not defined by title or inherited privilege—it is built through moral courage, civic empathy, and consistent service to one’s community.”
              </p>
              <footer className="mt-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                NexGen Council Founding Charter · Principle I
              </footer>
            </blockquote>
          </div>

          {/* Right Institutional Dossier Column */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                {settings?.directoryHeading || 'Institutional Record & Directory'}
              </h3>
              <dl className="divide-y divide-stone-200 text-sm">
                <div className="py-3.5 space-y-1">
                  <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Official Title</dt>
                  <dd className="text-slate-900 font-semibold">
                    {settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council'}
                  </dd>
                </div>
                <div className="py-3.5 space-y-1">
                  <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Primary Domains</dt>
                  <dd className="text-slate-700 leading-relaxed">
                    {settings?.primaryDomains ||
                      'Women Empowerment · Youth Civic Leadership · Mentorship · Policy Dialogue'}
                  </dd>
                </div>
                {settings?.directoryHeadquarters?.trim() && (
                  <div className="py-3.5 space-y-1">
                    <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Headquarters</dt>
                    <dd className="text-slate-700">{settings.directoryHeadquarters}</dd>
                  </div>
                )}
                {settings?.showOfficeAddress !== false && (
                  <div className="py-3.5 space-y-1">
                    <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Secretariat Office</dt>
                    <dd className="text-slate-700">
                      {settings?.officeAddress || 'Executive Secretariat, Sialkot, Punjab, Pakistan'}
                    </dd>
                  </div>
                )}
                {settings?.showContactEmail !== false && (
                  <div className="py-3.5 space-y-1">
                    <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Official Contact</dt>
                    <dd className="text-slate-700">
                      {settings?.contactEmail || 'admin@nexgencouncil.bond'}
                    </dd>
                  </div>
                )}
                {settings?.showContactPhone !== false && settings?.contactPhone?.trim() && (
                  <div className="py-3.5 space-y-1">
                    <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Official Phone</dt>
                    <dd className="text-slate-700 tabular-nums">{settings.contactPhone}</dd>
                  </div>
                )}
                {settings?.showRegistrationNumber !== false && settings?.registrationNumber?.trim() && (
                  <div className="py-3.5 space-y-1">
                    <dt className="text-xs text-stone-500 font-medium uppercase tracking-wider">Registration &amp; Charter</dt>
                    <dd className="text-slate-700">{settings.registrationNumber}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* 3. MISSION, VISION, INTERACTIVE CHARTER & CORE VALUES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-10 lg:p-12 space-y-12">
          {/* Mission & Vision Pair */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10 border-b border-stone-200">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-indigo-950">
                <Compass className="w-5 h-5 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-950">Our Mission</h2>
              </div>
              <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                {settings?.missionStatement ||
                  'To dismantle socio-economic barriers by equipping young women and emerging youth leaders with structured mentorship, leadership training, and civic platforms to enact lasting change in their communities.'}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-amber-800">
                <Globe2 className="w-5 h-5 shrink-0" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-950">Our Vision</h2>
              </div>
              <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                {settings?.visionStatement ||
                  'A globally equitable society where every young woman and emerging leader holds the agency, resources, and leadership representation required to shape public policy, enterprise, and social progress.'}
              </p>
            </div>
          </div>

          {/* Interactive Strategic Framework Tabs */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                  Chapter 02 · Strategic Framework
                </p>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-950">
                  How NexGen Council Operates
                </h2>
              </div>

              <div
                role="tablist"
                aria-label="Strategic Charter Sections"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-xl border border-stone-200 self-start md:self-auto"
              >
                {(Object.keys(CHARTER_TABS) as CharterTabId[]).map(key => {
                  const tab = CHARTER_TABS[key];
                  const isActive = activeTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(key)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-indigo-950 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {tab.index}. {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
              <div className="max-w-2xl space-y-2">
                <h3 className="text-lg sm:text-xl font-serif font-bold text-slate-950">
                  {currentCharter.heading}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{currentCharter.summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {currentCharter.commitments.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 border-t border-stone-200 pt-4">
                    <p className="font-mono tabular-nums text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
                      Pillar 0{idx + 1}
                    </p>
                    <h4 className="font-serif font-bold text-base text-slate-950">{item.title}</h4>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Four Core Values */}
          <div className="space-y-6 pt-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-900">
                Guiding Principles
              </p>
              <h2 className="text-2xl font-serif font-bold text-slate-950">Our Core Council Values</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {CORE_VALUES.map(val => (
                <div
                  key={val.num}
                  className="p-5 rounded-xl border border-stone-200 bg-stone-50/60 space-y-2.5"
                >
                  <span className="font-mono tabular-nums text-xs font-bold text-amber-800 block">
                    {val.num} /
                  </span>
                  <h3 className="font-serif font-bold text-base text-slate-950">{val.title}</h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">{val.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. FREQUENTLY ASKED QUESTIONS (Synced 1:1 with FAQPage JSON-LD) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20 space-y-6">
        <div className="space-y-1 border-b border-stone-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-900">
            Public Inquiries
          </p>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-950">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {faqItems.map((faq, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white border border-stone-200 rounded-xl overflow-hidden transition-colors self-start"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-stone-50/70 transition-colors"
                >
                  <span className="font-serif font-bold text-sm sm:text-base text-slate-950">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-stone-500 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-indigo-950' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-stone-100">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. GROUNDED INSTITUTIONAL CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20">
        <div className="bg-indigo-950 text-white rounded-2xl p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Participate · Collaborate · Lead
            </p>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight [text-wrap:balance]">
              Join the Next Cohort of Women &amp; Youth Changemakers
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Apply as an incoming cohort volunteer, explore active leadership programs, or reach our secretariat for institutional partnerships.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('volunteer')}
              className="px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm rounded-xl transition-colors duration-150 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Apply as Volunteer</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('programs')}
              className="px-5 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm rounded-xl transition-colors duration-150 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>View Programs</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('contact')}
              className="px-5 py-3 border border-white/20 hover:bg-white/10 text-white font-semibold text-sm rounded-xl transition-colors duration-150 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Users className="w-4 h-4" />
              <span>Contact Secretariat</span>
            </button>
          </div>
        </div>
      </section>
    </article>
  );
};
