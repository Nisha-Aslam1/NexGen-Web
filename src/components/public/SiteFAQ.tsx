import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { FaqItem } from '../../types.ts';
import {
  ChevronDown,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  Search
} from 'lucide-react';

export type FaqCategory = string;

export interface SiteFaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const SITE_FAQ_ITEMS: SiteFaqItem[] = [
  {
    id: 'faq-what-is-nexgen',
    category: 'About NexGen Council',
    question: 'What is NexGen Council (NexGen Women Empowerment & Youth Leadership Council)?',
    answer:
      'NexGen Council is an independent civil society leadership council dedicated to women empowerment, youth leadership development, civic advocacy, and grassroots community service across Pakistan and international chapters.'
  },
  {
    id: 'faq-leadership-headquarters',
    category: 'About NexGen Council',
    question: 'Where is NexGen Council headquartered and how is it governed?',
    answer:
      'Headquartered in Sialkot, Punjab, Pakistan, NexGen Council operates through an executive leadership board, department heads, program coordinators, and regional volunteer chapters governed by transparent institutional standards.'
  },
  {
    id: 'faq-founded-vision',
    category: 'About NexGen Council',
    question: 'What core impact areas guide NexGen Council initiatives?',
    answer:
      'Every initiative advances four foundational pillars: Education access & literacy, Community Healthcare outreach, Emergency Community Support, and Women & Youth Economic & Leadership Empowerment.'
  },
  {
    id: 'faq-volunteer-apply',
    category: 'Volunteers & Member ID',
    question: 'How can women and youth apply to join or volunteer with NexGen Council?',
    answer:
      'Complete the online application form on the Join as Volunteer page (/volunteer) with your background, skills, and preferred focus area. Every application is reviewed by the Council Secretariat.'
  },
  {
    id: 'faq-track-application',
    category: 'Volunteers & Member ID',
    question: 'How do I check the review status of my volunteer application?',
    answer:
      'Visit the Track Application page (/track) and enter your Application Reference ID or registered email address to view real-time status updates from Pending Review to Approved.'
  },
  {
    id: 'faq-member-id-card',
    category: 'Volunteers & Member ID',
    question: 'How do approved members download their official NexGen Member ID Card?',
    answer:
      'Once approved, open the Track Application portal (/track), look up your application, upload a clear portrait photo if requested, and download your official NexGen Council Member ID Card directly in PDF format.'
  },
  {
    id: 'faq-programs-offered',
    category: 'Programs & Events',
    question: 'What is the 30-Day Leadership Series and what other programs are offered?',
    answer:
      'Our flagship 30-Day Leadership Development Series covers public policy, ethical leadership, communication strategy, and community project execution, alongside Women in Tech workshops and entrepreneurship cohorts listed at /programs.'
  },
  {
    id: 'faq-events-rsvp',
    category: 'Programs & Events',
    question: 'How do I register or RSVP for upcoming conferences and workshops?',
    answer:
      'Explore upcoming workshops and leadership summits at /events, open any event card to view venue details and available seat capacity, and submit your Delegate RSVP online to confirm attendance or join the waitlist.'
  },
  {
    id: 'faq-certificates',
    category: 'Programs & Events',
    question: 'Do cohort fellows and active volunteers receive official certificates?',
    answer:
      'Yes. Participants who complete leadership cohorts, training workshops, or verified volunteer terms receive official NexGen Council completion or service recognition certificates recorded by the Secretariat.'
  },
  {
    id: 'faq-donate-how-utilization',
    category: 'Donations & Partnerships',
    question: 'How can I donate to NexGen Council and how are funds utilized?',
    answer:
      'You can donate securely via the official Easypaisa Digital Bank / RAAST Merchant QR (Merchant Till Number: 992191268), Easypaisa (Momna Kokab · 03497100560), or NayaPay / JazzCash (Minahil Imran · 03418408350) on /donate. Every rupee directly funds Education, Healthcare, Community Support, and Women & Youth Empowerment.'
  },
  {
    id: 'faq-donate-receipt-minimum',
    category: 'Donations & Partnerships',
    question: 'Is there a minimum donation amount, and how do I get a confirmation receipt?',
    answer:
      'No contribution is too small — every rupee helps create positive change. After sending your gift, submit your email, amount, and Transaction ID (TID) on /donate to receive an official Secretariat confirmation reference.'
  },
  {
    id: 'faq-partnerships-contact',
    category: 'Donations & Partnerships',
    question: 'How can schools, universities, NGOs, or sponsors partner with NexGen Council?',
    answer:
      'Educational institutions, NGOs, and corporate sponsors can submit co-hosting proposals, mentorship partnerships, or in-kind support requests via the Contact Secretariat portal at /contact.'
  }
];

export const CORE_FAQ_CATEGORIES = [
  'About NexGen Council',
  'Volunteers & Member ID',
  'Programs & Events',
  'Donations & Partnerships'
];

export function resolveActiveFaqs(faqs: FaqItem[], isLoadingPublicData: boolean): SiteFaqItem[] {
  if (Array.isArray(faqs) && faqs.length > 0) {
    return [...faqs]
      .filter(f => f.active !== false)
      .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
  }
  return isLoadingPublicData ? SITE_FAQ_ITEMS : [];
}

interface SiteFAQProps {
  selectedCategory?: FaqCategory;
  onSelectCategory?: (category: FaqCategory) => void;
  headingTitle?: string;
  eyebrowLabel?: string;
  itemsOverride?: SiteFaqItem[];
}

export const SiteFAQ: React.FC<SiteFAQProps> = ({
  selectedCategory,
  onSelectCategory,
  headingTitle = 'Complete Website Knowledge Base',
  eyebrowLabel = 'Official Help & Answers',
  itemsOverride
}) => {
  const { faqs, isLoadingPublicData, setActivePage } = useApp();
  const [internalCategory, setInternalCategory] = useState<FaqCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([
    'faq-what-is-nexgen',
    'faq-volunteer-apply',
    'faq-donate-how-utilization'
  ]);

  const activeItems = useMemo(() => {
    if (itemsOverride) return itemsOverride;
    return resolveActiveFaqs(faqs, isLoadingPublicData);
  }, [itemsOverride, faqs, isLoadingPublicData]);

  const availableCategories = useMemo(() => {
    const present = new Set(activeItems.map(i => i.category).filter(Boolean));
    const ordered: string[] = [];
    CORE_FAQ_CATEGORIES.forEach(c => {
      if (present.has(c)) ordered.push(c);
    });
    activeItems.forEach(item => {
      if (item.category && !ordered.includes(item.category)) {
        ordered.push(item.category);
      }
    });
    return ['All', ...ordered];
  }, [activeItems]);

  const activeCategory = selectedCategory ?? internalCategory;

  useEffect(() => {
    if (selectedCategory && selectedCategory !== 'All') {
      const firstMatch = activeItems.find(i => i.category === selectedCategory);
      if (firstMatch) {
        setOpenIds(prev => (prev.includes(firstMatch.id) ? prev : [...prev, firstMatch.id]));
      }
    }
  }, [selectedCategory, activeItems]);

  const handleCategoryChange = (cat: FaqCategory) => {
    setInternalCategory(cat);
    if (onSelectCategory) onSelectCategory(cat);
  };

  const cleanSearch = searchQuery.trim().toLowerCase();
  const filteredItems = activeItems.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    if (!matchesCategory) return false;
    if (!cleanSearch) return true;
    return (
      item.question.toLowerCase().includes(cleanSearch) ||
      item.answer.toLowerCase().includes(cleanSearch) ||
      item.category.toLowerCase().includes(cleanSearch)
    );
  });

  const toggleItem = (id: string) => {
    setOpenIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const allExpanded =
    filteredItems.length > 0 && filteredItems.every(item => openIds.includes(item.id));

  const handleToggleAll = () => {
    if (allExpanded) {
      const visibleSet = new Set(filteredItems.map(i => i.id));
      setOpenIds(prev => prev.filter(id => !visibleSet.has(id)));
    } else {
      setOpenIds(prev => Array.from(new Set([...prev, ...filteredItems.map(i => i.id)])));
    }
  };

  return (
    <section
      aria-labelledby="site-faq-heading"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 lg:p-10"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left Column: Search & Portal Quick Links */}
        <div className="lg:col-span-4 space-y-6">
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-900 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{eyebrowLabel}</span>
            </p>
            <h2
              id="site-faq-heading"
              className="text-2xl sm:text-3xl font-serif font-bold text-slate-950 tracking-tight leading-snug"
            >
              {headingTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Browse verified answers covering council governance, volunteering, Member ID cards, events, partnerships, and direct donations.
            </p>
          </div>

          {/* Search FAQs */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search any topic or keyword..."
              aria-label="Search frequently asked questions"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-indigo-900"
            />
          </div>

          {/* Portal Quick Links */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Quick Portal Directory</span>
            </div>

            <div className="space-y-2 text-xs">
              <button
                type="button"
                onClick={() => setActivePage('volunteer')}
                className="w-full py-1.5 text-left text-slate-700 hover:text-indigo-950 font-medium flex items-center justify-between border-b border-slate-200/70 cursor-pointer transition-colors"
              >
                <span>Volunteer Application</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('track')}
                className="w-full py-1.5 text-left text-slate-700 hover:text-indigo-950 font-medium flex items-center justify-between border-b border-slate-200/70 cursor-pointer transition-colors"
              >
                <span>Track Status &amp; Member ID Card</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('programs')}
                className="w-full py-1.5 text-left text-slate-700 hover:text-indigo-950 font-medium flex items-center justify-between border-b border-slate-200/70 cursor-pointer transition-colors"
              >
                <span>Programs &amp; Leadership Cohorts</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('events')}
                className="w-full py-1.5 text-left text-slate-700 hover:text-indigo-950 font-medium flex items-center justify-between border-b border-slate-200/70 cursor-pointer transition-colors"
              >
                <span>Upcoming Events &amp; Summits</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('donate')}
                className="w-full py-1.5 text-left text-emerald-800 hover:text-emerald-950 font-semibold flex items-center justify-between border-b border-slate-200/70 cursor-pointer transition-colors"
              >
                <span>Donate &amp; Support Mission</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('contact')}
                className="w-full pt-1 text-left text-slate-700 hover:text-indigo-950 font-medium flex items-center justify-between cursor-pointer transition-colors"
              >
                <span>Contact Executive Secretariat</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Whole-Site Category Tabs & Interactive Accordions */}
        <div className="lg:col-span-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="tablist" aria-label="Website FAQ categories">
              {availableCategories.map((category) => {
                const isSelected = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleCategoryChange(category)}
                    className={`pb-1.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'border-indigo-950 text-indigo-950'
                        : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {category === 'All' ? 'All Topics' : category}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleToggleAll}
              className="text-[11px] font-semibold text-slate-600 hover:text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                No matching questions found
              </p>
              <p className="text-xs text-slate-500">
                Try clearing your search or selecting &ldquo;All Topics&rdquo;, or reach out directly via our Contact Secretariat page.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {filteredItems.map((item, idx) => {
                const isOpen = openIds.includes(item.id);
                const panelId = `${item.id}-panel`;
                const buttonId = `${item.id}-trigger`;
                return (
                  <div key={item.id} className="transition-colors">
                    <h3>
                      <button
                        id={buttonId}
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggleItem(item.id)}
                        className={`w-full px-5 py-4 text-left flex items-start justify-between gap-4 transition-colors cursor-pointer ${
                          isOpen ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          <span className="text-[11px] font-bold tabular-nums text-indigo-900 mt-0.5 shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="space-y-0.5">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              {item.category}
                            </span>
                            <span className="block text-sm sm:text-[15px] font-semibold text-slate-950 leading-snug">
                              {item.question}
                            </span>
                          </div>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-500 shrink-0 mt-1 transition-transform duration-200 ${
                            isOpen ? 'rotate-180 text-indigo-950' : ''
                          }`}
                        />
                      </button>
                    </h3>
                    {isOpen && (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        className="px-5 pb-4 pl-12 text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50/90 whitespace-pre-line"
                      >
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
