import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  SiteFAQ,
  FaqCategory,
  SiteFaqItem,
  resolveActiveFaqs
} from './SiteFAQ.tsx';
import {
  Compass,
  IdCard,
  Calendar,
  HeartHandshake,
  HelpCircle,
  ArrowRight,
  Mail
} from 'lucide-react';

const TOPIC_METADATA: Record<
  string,
  { description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'About NexGen Council': {
    description: 'Mission, Sialkot headquarters, governance & core pillars',
    icon: Compass
  },
  'Volunteers & Member ID': {
    description: 'Applying, tracking applications & Member ID cards',
    icon: IdCard
  },
  'Programs & Events': {
    description: '30-Day Leadership Series, RSVPs & certificates',
    icon: Calendar
  },
  'Donations & Partnerships': {
    description: 'Verified accounts, fund usage & institutional sponsors',
    icon: HeartHandshake
  }
};

export function buildFaqPageJsonLd(
  faqItems: SiteFaqItem[],
  canonicalBase: string,
  orgName: string
): Record<string, any>[] {
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalBase}/faq#webpage`,
    url: `${canonicalBase}/faq`,
    name: 'NexGen Council FAQ | Membership, Programs & Donations',
    description:
      'Get official answers on NexGen Council volunteer registration, Member ID cards, 30-Day Leadership Series, events, partnerships & verified donations.',
    inLanguage: 'en',
    isPartOf: {
      '@type': 'WebSite',
      name: orgName || 'NexGen Council',
      url: canonicalBase
    }
  };

  const faqSchema =
    faqItems.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          '@id': `${canonicalBase}/faq#faqpage`,
          mainEntity: faqItems.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer
            }
          }))
        }
      : null;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${canonicalBase}/` },
      { '@type': 'ListItem', position: 2, name: 'Frequently Asked Questions', item: `${canonicalBase}/faq` }
    ]
  };

  return [webPageSchema, ...(faqSchema ? [faqSchema] : []), breadcrumbSchema];
}

export const FaqPage: React.FC = () => {
  const { settings, faqs, isLoadingPublicData, setActivePage } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('All');

  const activeFaqItems = useMemo(
    () => resolveActiveFaqs(faqs, isLoadingPublicData),
    [faqs, isLoadingPublicData]
  );

  const topicCards = useMemo(() => {
    const categoriesInUse = Array.from(new Set(activeFaqItems.map(i => i.category).filter(Boolean)));
    const orderedCategories = [
      ...Object.keys(TOPIC_METADATA).filter(c => categoriesInUse.includes(c)),
      ...categoriesInUse.filter(c => !(c in TOPIC_METADATA))
    ];
    return orderedCategories.slice(0, 4).map((category, index) => {
      const meta = TOPIC_METADATA[category];
      return {
        category,
        num: String(index + 1).padStart(2, '0'),
        description:
          meta?.description ||
          `${activeFaqItems.filter(i => i.category === category).length} published answers in ${category}`,
        icon: meta?.icon || HelpCircle
      };
    });
  }, [activeFaqItems]);

  const canonicalBase =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'nexgencouncil.bond' ||
      window.location.hostname === 'www.nexgencouncil.bond')
      ? 'https://nexgencouncil.bond'
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'https://nexgencouncil.bond';

  const structuredData = useMemo(
    () =>
      buildFaqPageJsonLd(
        activeFaqItems,
        canonicalBase,
        settings?.organizationName || 'NexGen Council'
      ),
    [activeFaqItems, canonicalBase, settings?.organizationName]
  );

  useDocumentSEO({
    title: 'NexGen Council FAQ | Membership, Programs & Donations',
    description:
      'Get official answers on NexGen Council volunteer registration, Member ID cards, 30-Day Leadership Series, events, partnerships & verified donations.',
    canonicalPath: '/faq',
    ogType: 'website',
    ogImage: '/banner.png',
    keywords: [
      'NexGen Council FAQ',
      'NexGen Women Empowerment FAQ',
      'how to join NexGen Council',
      'NexGen volunteer registration',
      'NexGen Member ID card download',
      'track NexGen application',
      '30-Day Leadership Series FAQ',
      'NexGen Council donation accounts',
      'NexGen Pakistan Sialkot NGO',
      'youth leadership mentorship FAQ'
    ],
    jsonLd: structuredData
  });

  const handleSelectTopic = (cat: string) => {
    setSelectedCategory(cat);
    const el = document.getElementById('faq-knowledge-base');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="bg-slate-50 pb-20">
      {/* Dedicated Standalone FAQ Hero */}
      <section className="relative bg-[#080C18] text-white border-b border-white/10 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 right-0 w-[34rem] h-[34rem] rounded-full bg-indigo-500/12 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 left-0 w-[28rem] h-[28rem] rounded-full bg-amber-400/10 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 text-center space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            NexGen Council Help Center · Official Answers
          </p>
          <h1 className="font-serif font-bold tracking-tight text-white leading-[1.08] [text-wrap:balance] text-[clamp(2.25rem,4.2vw,3.6rem)] max-w-3xl mx-auto">
            Frequently Asked Questions
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Your complete guide to joining NexGen Council, tracking volunteer applications, downloading Member ID cards, attending events, partnering with us, and supporting our community drives.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span className="tabular-nums">
              {Math.max(1, Array.from(new Set(activeFaqItems.map(i => i.category))).length)} Core Topics
            </span>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span className="tabular-nums">{activeFaqItems.length} Verified Answers</span>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span>Direct Secretariat Support</span>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 space-y-10">
        {/* Topic Category Quick-Jump Cards */}
        {topicCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {topicCards.map((card) => {
              const Icon = card.icon;
              const active = selectedCategory === card.category;
              return (
                <button
                  key={card.category}
                  type="button"
                  onClick={() => handleSelectTopic(card.category)}
                  className={`text-left p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    active
                      ? 'bg-indigo-950 text-white border-indigo-950 shadow-md'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-900/40 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        active ? 'text-amber-300' : 'text-indigo-900'
                      }`}
                    >
                      {card.num}
                    </span>
                    <Icon
                      className={`w-4 h-4 ${
                        active ? 'text-amber-300' : 'text-slate-500'
                      }`}
                    />
                  </div>
                  <div>
                    <h2 className="text-sm font-serif font-bold leading-snug">
                      {card.category}
                    </h2>
                    <p
                      className={`text-xs mt-1 leading-relaxed ${
                        active ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {card.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Interactive Searchable Site-Wide FAQ Component */}
        <div id="faq-knowledge-base">
          <SiteFAQ
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            itemsOverride={activeFaqItems}
          />
        </div>

        {/* Dedicated Bottom Help Strip */}
        <div className="bg-[#080C18] text-white rounded-2xl border border-white/10 p-7 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              Still Need Help?
            </p>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight">
              Reach the NexGen Council Secretariat Directly
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Have a partnership proposal, membership inquiry, or event question not covered above? Send a message directly to our team.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActivePage('contact')}
              className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Mail className="w-4 h-4" />
              <span>Contact Secretariat</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePage('donate')}
              className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Visit Donation Page</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
