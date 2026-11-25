import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import { SiteFAQ, SITE_FAQ_ITEMS } from './SiteFAQ.tsx';

export const FaqPage: React.FC = () => {
  const { settings } = useApp();

  const canonicalBase =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'nexgencouncil.bond' ||
      window.location.hostname === 'www.nexgencouncil.bond')
      ? 'https://nexgencouncil.bond'
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'https://nexgencouncil.bond';

  useDocumentSEO({
    title: 'Frequently Asked Questions | NexGen Council Official Guide',
    description:
      'Find clear answers about NexGen Council membership, volunteer registration, ID cards, leadership programs, events, partnerships, and verified donation accounts.',
    canonicalPath: '/faq',
    ogType: 'website',
    ogImage: '/banner.png',
    keywords: [
      'NexGen Council FAQ',
      'NexGen volunteer FAQ',
      'NexGen Member ID card',
      'NexGen programs and events',
      'NexGen Council donations FAQ'
    ],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: SITE_FAQ_ITEMS.map(item => ({
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
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${canonicalBase}/` },
          { '@type': 'ListItem', position: 2, name: 'FAQ', item: `${canonicalBase}/faq` }
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `Frequently Asked Questions | ${settings?.organizationName || 'NexGen Council'}`,
        url: `${canonicalBase}/faq`
      }
    ]
  });

  return (
    <div className="bg-slate-50 pb-20">
      <section className="bg-[#090D1A] text-white py-14 sm:py-16 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            NexGen Council Help &amp; Directory
          </p>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight [text-wrap:balance]">
            Frequently Asked Questions
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Clear answers covering our mission, volunteer applications, Member ID cards, programs, events, partnerships, and official donation channels.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12">
        <SiteFAQ defaultCategory="All" />
      </div>
    </div>
  );
};
