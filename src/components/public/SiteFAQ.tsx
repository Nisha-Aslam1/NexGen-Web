import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ChevronDown,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  Search
} from 'lucide-react';

export type FaqCategory =
  | 'All'
  | 'About NexGen Council'
  | 'Volunteers & Member ID'
  | 'Programs & Events'
  | 'Donations & Partnerships';

export interface SiteFaqItem {
  id: string;
  category: Exclude<FaqCategory, 'All'>;
  question: string;
  answer: string;
}

export const SITE_FAQ_ITEMS: SiteFaqItem[] = [
  {
    id: 'faq-what-is-nexgen',
    category: 'About NexGen Council',
    question: 'What is NexGen Council (NexGen Women Empowerment & Youth Leadership Council)?',
    answer:
      'NexGen Council is a civil society leadership organization empowering women and youth across Pakistan and international chapters through structured mentorship, leadership fellowships, civic policy forums, and grassroots humanitarian outreach.'
  },
  {
    id: 'faq-leadership-headquarters',
    category: 'About NexGen Council',
    question: 'Where is NexGen Council based and how is it governed?',
    answer:
      'Headquartered in Sialkot, Punjab, Pakistan, NexGen Council operates through an executive leadership board, program coordinators, and regional volunteer teams committed to transparent, merit-driven community service and youth empowerment.'
  },
  {
    id: 'faq-volunteer-apply',
    category: 'Volunteers & Member ID',
    question: 'How can women and youth apply to join or volunteer with NexGen Council?',
    answer:
      'Anyone passionate about community service or leadership can submit an online application via the Join as Volunteer portal (/volunteer). After review by our Secretariat, accepted applicants receive official membership onboarding.'
  },
  {
    id: 'faq-track-member-card',
    category: 'Volunteers & Member ID',
    question: 'How do I track my volunteer application and get my Member ID Card?',
    answer:
      'Visit the Track Application portal (/track) and enter your application reference ID or registered email address to check your real-time approval status and download your official NexGen Council Member ID card.'
  },
  {
    id: 'faq-programs-offered',
    category: 'Programs & Events',
    question: 'What leadership programs and workshops does NexGen Council run?',
    answer:
      'Flagship initiatives include the 30-Day Leadership Development Series, Women in Tech and entrepreneurship workshops, youth civic advocacy forums, and district-level educational and health outreach drives listed on the Programs page (/programs).'
  },
  {
    id: 'faq-events-rsvp',
    category: 'Programs & Events',
    question: 'How can I attend upcoming conferences, summits, or community events?',
    answer:
      'Browse upcoming seminars and outreach summits on the Events page (/events), review venue timings and seat capacity, and submit your Delegate RSVP directly online to reserve your seat or join a waitlist.'
  },
  {
    id: 'faq-donate-how-utilization',
    category: 'Donations & Partnerships',
    question: 'How can I donate to NexGen Council and how are funds utilized?',
    answer:
      'You can donate safely via the official RAAST / Easypaisa Merchant QR (Till Number: 992191268), Easypaisa (Momna Kokab · 03497100560), or NayaPay / JazzCash (Minahil Imran · 03418408350). All funds directly support Education, Healthcare, Community Support, and Women & Youth Empowerment without third-party intermediaries.'
  },
  {
    id: 'faq-donate-receipt-minimum',
    category: 'Donations & Partnerships',
    question: 'Is there a minimum donation amount, and how do I get a confirmation receipt?',
    answer:
      'No contribution is too small — every rupee makes a meaningful difference. After transferring via QR or mobile wallet, submit your name, email, amount, and Transaction ID (TID) on the Donate page (/donate) to receive an official Secretariat confirmation reference.'
  },
  {
    id: 'faq-partnerships-contact',
    category: 'Donations & Partnerships',
    question: 'How can schools, universities, NGOs, or sponsors partner with NexGen Council?',
    answer:
      'Institutions, community organizations, and corporate sponsors can submit partnership proposals, speaking invitations, or in-kind support requests anytime via our Contact Secretariat page (/contact).'
  }
];

const CATEGORIES: FaqCategory[] = [
  'All',
  'About NexGen Council',
  'Volunteers & Member ID',
  'Programs & Events',
  'Donations & Partnerships'
];

interface SiteFAQProps {
  defaultCategory?: FaqCategory;
  headingTitle?: string;
  eyebrowLabel?: string;
}

export const SiteFAQ: React.FC<SiteFAQProps> = ({
  defaultCategory = 'All',
  headingTitle = 'Frequently Asked Questions',
  eyebrowLabel = 'Complete Website Guide · NexGen Council'
}) => {
  const { setActivePage } = useApp();
  const [activeCategory, setActiveCategory] = useState<FaqCategory>(defaultCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [openIds, setOpenIds] = useState<string[]>([
    'faq-what-is-nexgen',
    'faq-volunteer-apply',
    'faq-donate-how-utilization'
  ]);

  const cleanSearch = searchQuery.trim().toLowerCase();
  const filteredItems = SITE_FAQ_ITEMS.filter(item => {
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
        {/* Left Column: Website Overview & Quick Navigation */}
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
              Everything you need to know about joining NexGen Council, tracking membership IDs, attending events, partnering with us, and supporting community drives.
            </p>
          </div>

          {/* Search FAQs */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions across the website..."
              aria-label="Search frequently asked questions"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-indigo-900"
            />
          </div>

          {/* Institutional Pillars & Trust Summary */}
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
                <span>Volunteer &amp; Fellowship Application</span>
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
                onClick={() => setActivePage('donate')}
                className="w-full py-1.5 text-left text-emerald-800 hover:text-emerald-950 font-semibold flex items-center justify-between border-b border-slate-200/70 cursor-pointer transition-colors"
              >
                <span>Donation Accounts &amp; QR Till</span>
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
              {CATEGORIES.map((category) => {
                const isSelected = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveCategory(category)}
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
                        className="px-5 pb-4 pl-12 text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50/90"
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
