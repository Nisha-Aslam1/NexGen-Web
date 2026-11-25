import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  HeartHandshake,
  QrCode,
  Copy,
  Check,
  Download,
  Maximize2,
  X,
  BookOpen,
  Stethoscope,
  Users,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Send,
  Share2,
  ArrowDown,
  Smartphone,
  Building2,
  Heart,
  HandHeart,
  ArrowRight
} from 'lucide-react';

type CauseId =
  | 'Education'
  | 'Healthcare'
  | 'Community Support'
  | 'Women & Youth Empowerment';

interface CauseDetail {
  id: CauseId;
  num: string;
  title: string;
  headline: string;
  description: string;
  tangibleExample: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CAUSES: CauseDetail[] = [
  {
    id: 'Education',
    num: '01',
    title: 'Education',
    headline: 'Keep a Young Dream Alive',
    description:
      'School kits, exam fee grants, and digital literacy mentorship for deserving students.',
    tangibleExample: 'PKR 1,500 equips a student with notebooks, books & stationery for a full term.',
    icon: BookOpen
  },
  {
    id: 'Healthcare',
    num: '02',
    title: 'Healthcare',
    headline: 'Deliver Care With Dignity',
    description:
      'Free preventive medical camps, essential medicines, and maternal wellness outreach.',
    tangibleExample: 'PKR 2,500 provides essential medicines & health screening at a community camp.',
    icon: Stethoscope
  },
  {
    id: 'Community Support',
    num: '03',
    title: 'Community Support',
    headline: 'Stand Beside Families in Need',
    description:
      'Emergency ration drives, seasonal relief packages, and urgent neighborhood welfare.',
    tangibleExample: 'PKR 5,000 sponsors an essential family ration & dignity relief package.',
    icon: Users
  },
  {
    id: 'Women & Youth Empowerment',
    num: '04',
    title: 'Women & Youth Empowerment',
    headline: 'Build Lifelong Independence',
    description:
      'Vocational skills workshops, leadership cohorts, and financial independence fellowships.',
    tangibleExample: 'PKR 10,000 funds vocational skills & leadership mentorship for an emerging leader.',
    icon: Sparkles
  }
];

const QUICK_AMOUNTS: { amount: number; impactLine: string }[] = [
  {
    amount: 1000,
    impactLine: 'Provides school notebooks, stationery & learning supplies for a deserving student.'
  },
  {
    amount: 2500,
    impactLine: 'Covers preventive screening & essential medicines for neighbors at a health camp.'
  },
  {
    amount: 5000,
    impactLine: 'Delivers an emergency food & household essentials package to a vulnerable family.'
  },
  {
    amount: 10000,
    impactLine: 'Sponsors vocational training & leadership cohort access for women and youth.'
  }
];

const PAYMENT_ACCOUNTS = {
  merchantTill: {
    label: 'Merchant Till Number',
    number: '992191268'
  },
  easypaisa: {
    provider: 'Easypaisa',
    accountName: 'Momna Kokab',
    accountNumber: '03497100560'
  },
  nayapayJazzcash: {
    provider: 'NayaPay / JazzCash',
    accountName: 'Minahil Imran',
    accountNumber: '03418408350'
  }
};

const POSTER_IMAGE_PATH = '/assets/aistudio/2535e6a6-f29c-44fd-8f0c-05946ee38cac_8942ae05.jpg';
const EASYPAISA_QR_CARD_PATH = '/assets/aistudio/WhatsApp_Image_2026-11-25_at_9.04.33_PM_ae4e7388.jpeg';
const QR_IMAGE_PATH = '/assets/donation-qr-easypaisa.png';

export const DonatePage: React.FC = () => {
  const { settings, addToast, setActivePage } = useApp();

  const [selectedCause, setSelectedCause] = useState<CauseId>('Education');
  const [selectedAmount, setSelectedAmount] = useState<string>('2500');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [qrViewMode, setQrViewMode] = useState<'qr' | 'card'>('qr');

  // Donation confirmation receipt form state
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>(
    'Easypaisa — Momna Kokab (03497100560)'
  );
  const [transactionId, setTransactionId] = useState('');
  const [donorNote, setDonorNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptRef, setReceiptRef] = useState<string | null>(null);

  const canonicalBase =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'nexgencouncil.bond' ||
      window.location.hostname === 'www.nexgencouncil.bond')
      ? 'https://nexgencouncil.bond'
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'https://nexgencouncil.bond';

  useDocumentSEO({
    title: 'Donate to NexGen Council | Support Youth & Communities',
    description:
      'Donate to NexGen Council for education, healthcare & community relief. Contribute easily via QR Till 992191268, Easypaisa, NayaPay, or JazzCash today.',
    canonicalPath: '/donate',
    ogType: 'website',
    ogImage: POSTER_IMAGE_PATH,
    keywords: [
      'Donate NexGen Council',
      'NexGen Council Donation',
      'NexGen Donation Drive',
      'Charity Pakistan',
      'Donate Education Pakistan',
      'Healthcare Charity Pakistan',
      'Women Empowerment Donation Pakistan',
      'Easypaisa Donation Pakistan',
      'NayaPay JazzCash Donation',
      'Merchant Till 992191268',
      'Raast QR Charity Pakistan',
      'SpreadKindness'
    ],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${canonicalBase}/donate#webpage`,
        name: 'Donate to NexGen Council | Support Youth & Communities',
        url: `${canonicalBase}/donate`,
        description:
          'Donate to NexGen Council for education, healthcare & community relief. Contribute easily via QR Till 992191268, Easypaisa, NayaPay, or JazzCash today.',
        inLanguage: 'en',
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: `${canonicalBase}${POSTER_IMAGE_PATH}`,
          width: 1199,
          height: 1312,
          caption: 'NexGen Council Official Donation Drive — Your Donation Can Change Lives'
        },
        isPartOf: {
          '@type': 'WebSite',
          name: settings?.organizationName || 'NexGen Council',
          url: canonicalBase
        },
        potentialAction: {
          '@type': 'DonateAction',
          name: 'Donate to NexGen Council',
          recipient: {
            '@type': 'NGO',
            name: settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council',
            url: canonicalBase
          },
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${canonicalBase}/donate`
          }
        }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'How to Donate to NexGen Council',
        description:
          'Donate securely to NexGen Council via QR Merchant Till 992191268, Easypaisa, or NayaPay/JazzCash.',
        image: `${canonicalBase}${QR_IMAGE_PATH}`,
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: 'Open Your Payment App',
            text: 'Open Easypaisa, NayaPay, JazzCash, or any Raast-enabled Pakistani banking app on your phone.'
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: 'Scan QR or Transfer Direct',
            text: 'Scan the official Scan to Donate QR code (Merchant Till Number 992191268) or transfer to Easypaisa (Momna Kokab, 03497100560) or NayaPay / JazzCash (Minahil Imran, 03418408350).'
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: 'Confirm Your Contribution',
            text: 'Submit your Transaction ID (TID) and cause choice through the Donor Acknowledgment Desk on the donation page.'
          }
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${canonicalBase}/` },
          { '@type': 'ListItem', position: 2, name: 'Donate & Support', item: `${canonicalBase}/donate` }
        ]
      }
    ]
  });

  const numericAmount = Math.max(0, Number(selectedAmount) || 0);
  const activeCauseObj = CAUSES.find(c => c.id === selectedCause) || CAUSES[0];

  const getDynamicImpactPreview = (): string => {
    const preset = QUICK_AMOUNTS.find(q => q.amount === numericAmount);
    if (preset) return preset.impactLine;
    if (numericAmount >= 10000) {
      return `Helps sustain transformative ${selectedCause.toLowerCase()} outreach for multiple families & youth leaders.`;
    }
    if (numericAmount >= 3000) {
      return `Directly accelerates community-led ${selectedCause.toLowerCase()} relief and grassroots support.`;
    }
    if (numericAmount > 0) {
      return `Every single rupee strengthens our ${selectedCause.toLowerCase()} mission — no kindness is ever too small.`;
    }
    return activeCauseObj.tangibleExample;
  };

  const handleCopy = async (key: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      addToast(`${label} copied: ${value}`, 'success');
      window.setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2200);
    } catch {
      addToast(`Please copy manually: ${value}`, 'info');
    }
  };

  const handleShareCampaign = async (channel: 'copy' | 'whatsapp' | 'facebook' | 'x') => {
    const shareUrl = `${canonicalBase}/donate`;
    const shareText =
      'Your Donation Can Change Lives! Support NexGen Council across Education, Healthcare, Community Support, and Women & Youth Empowerment. #NexGenCouncil #DonationDrive #SpreadKindness';

    if (channel === 'copy') {
      await handleCopy('campaign-url', shareUrl, 'Donation page link');
      return;
    }

    if (channel === 'whatsapp') {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\nDonate here: ${shareUrl}`)}`,
        '_blank',
        'noopener,noreferrer'
      );
      return;
    }

    if (channel === 'facebook') {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
        '_blank',
        'noopener,noreferrer'
      );
      return;
    }

    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectCauseFromGrid = (causeId: CauseId) => {
    setSelectedCause(causeId);
    scrollToSection('donation-accounts');
  };

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName.trim() || !donorEmail.trim()) {
      addToast('Please provide your full name and email address.', 'error');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(donorEmail.trim())) {
      addToast('Please enter a valid email address for confirmation.', 'error');
      return;
    }
    const cleanAmount = selectedAmount.replace(/[^\d.]/g, '');
    if (!cleanAmount || Number(cleanAmount) <= 0) {
      addToast('Please enter the donated amount in PKR.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const compiledMessage = [
        `Donation Confirmation Record`,
        `Cause Pillar: ${selectedCause}`,
        `Amount: PKR ${Number(cleanAmount).toLocaleString()}`,
        `Payment Channel: ${paymentMethod}`,
        `Transaction ID / TID: ${transactionId.trim() || 'Not provided'}`,
        donorNote.trim() ? `Donor Note: ${donorNote.trim()}` : null
      ]
        .filter(Boolean)
        .join('\n');

      const res = await fetch('/api/contact?source=donate-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: donorName.trim(),
          email: donorEmail.trim(),
          phone: donorPhone.trim(),
          subject: `Donation Confirmation — PKR ${Number(cleanAmount).toLocaleString()} (${selectedCause})`,
          message: compiledMessage,
          source: 'Contact Page',
          channel: 'donate_page'
        })
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(`Server returned an unexpected response (${res.status}).`);
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Unable to submit confirmation.');
      }

      setReceiptRef(data.id || `DON-${Date.now().toString().slice(-6)}`);
      addToast('Thank you! Your donation confirmation has been recorded.', 'success');
      setDonorName('');
      setDonorEmail('');
      setDonorPhone('');
      setTransactionId('');
      setDonorNote('');
    } catch (err: any) {
      addToast(err.message || 'Failed to submit donation confirmation.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-50 pb-20">
      {/* 1. Motivating Executive Hero */}
      <section className="relative bg-[#080C18] text-white border-b border-white/10 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-36 right-0 w-[38rem] h-[38rem] rounded-full bg-emerald-500/12 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -left-24 w-[32rem] h-[32rem] rounded-full bg-amber-400/10 blur-3xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
                NexGen Council Humanitarian Fund · Empower · Serve · Inspire
              </p>

              <h1 className="font-serif font-bold tracking-tight text-white leading-[1.06] [text-wrap:balance] text-[clamp(2.25rem,4.5vw,3.9rem)]">
                Your Donation Can{' '}
                <span className="text-amber-300">Change Lives!</span>
              </h1>

              <p className="text-base sm:text-xl text-slate-200 leading-relaxed max-w-2xl font-normal">
                A little kindness can make a big difference. Your contribution brings hope, dignity, and lasting opportunity to families, students, and emerging women leaders across our communities.
              </p>

              <p className="text-sm sm:text-[15px] text-slate-400 leading-relaxed max-w-2xl">
                At NexGen Council, we believe meaningful change begins when people come together with generous hearts. No contribution is too small — whether it puts books in a child&apos;s hands or medicines in a family&apos;s reach, every single rupee builds a kinder tomorrow.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollToSection('donation-accounts')}
                  className="px-6 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-amber-400/15"
                >
                  <span>Donate Now via QR or Account</span>
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPosterModal(true)}
                  className="px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Maximize2 className="w-4 h-4 text-emerald-400" />
                  <span>View Official Appeal Poster</span>
                </button>
              </div>
            </div>

            {/* Right Column: Editorial Promise & Motivating Callout */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/12 bg-white/[0.04] backdrop-blur-md p-6 sm:p-8 space-y-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                      Be Someone&apos;s Reason to Smile
                    </p>
                    <h2 className="text-xl font-serif font-bold text-white mt-1">
                      Three Ways Your Gift Transforms Lives
                    </h2>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center shrink-0">
                    <HandHeart className="w-5 h-5 text-emerald-300" />
                  </div>
                </div>

                <ul className="space-y-4 text-sm text-slate-200">
                  <li className="flex items-start gap-3.5">
                    <span className="text-xs font-bold text-amber-300 tabular-nums mt-0.5">01</span>
                    <div>
                      <p className="font-semibold text-white">Support our mission</p>
                      <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                        Keep students in classrooms and equip underserved youth with practical tools to thrive.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3.5">
                    <span className="text-xs font-bold text-amber-300 tabular-nums mt-0.5">02</span>
                    <div>
                      <p className="font-semibold text-white">Become a part of positive change</p>
                      <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                        Stand beside struggling households through medical relief, rations, and women&apos;s skill initiatives.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3.5">
                    <span className="text-xs font-bold text-amber-300 tabular-nums mt-0.5">03</span>
                    <div>
                      <p className="font-semibold text-white">Help us spread smiles and hope</p>
                      <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                        Donate today and be the quiet miracle that restores someone&apos;s confidence and future.
                      </p>
                    </div>
                  </li>
                </ul>

                <div className="rounded-xl bg-emerald-950/60 border border-emerald-500/25 px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-200 font-medium">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>100% Direct Verified Council Channels</span>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-amber-300">
                    Till 992191268
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stewardship Trust Strip */}
          <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
                Direct &amp; Transparent
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Every rupee transfers straight into official council-stewarded Easypaisa, NayaPay/JazzCash, or Merchant Till accounts.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
                Every Gift Matters
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                No donation is too small — even modest everyday kindness combines into life-changing scholarships and relief drives.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">
                Verified Receipt Desk
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Log your Transaction ID below after sending so the Secretariat records and acknowledges your generosity.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tangible Impact Pillars Band */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Where Hope Takes Shape
            </p>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-950 tracking-tight">
              What Your Generosity Builds Today
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md">
            Choose any pillar below to dedicate your contribution and immediately see how your kindness helps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAUSES.map((cause) => {
            const Icon = cause.icon;
            const isSelected = selectedCause === cause.id;
            return (
              <button
                key={cause.id}
                type="button"
                onClick={() => handleSelectCauseFromGrid(cause.id)}
                className={`group text-left rounded-2xl border p-5 sm:p-6 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                  isSelected
                    ? 'bg-slate-950 text-white border-slate-950 shadow-lg'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-600/50 hover:shadow-md'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold tabular-nums tracking-wider ${
                        isSelected ? 'text-amber-300' : 'text-emerald-700'
                      }`}
                    >
                      {cause.num}
                    </span>
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-white/10 text-amber-300'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <div>
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        isSelected ? 'text-emerald-300' : 'text-slate-500'
                      }`}
                    >
                      {cause.title}
                    </p>
                    <h3
                      className={`text-base font-serif font-bold mt-1 leading-snug ${
                        isSelected ? 'text-white' : 'text-slate-950'
                      }`}
                    >
                      {cause.headline}
                    </h3>
                  </div>

                  <p
                    className={`text-xs leading-relaxed ${
                      isSelected ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {cause.description}
                  </p>
                </div>

                <div
                  className={`pt-3 border-t text-[11px] font-medium flex items-center justify-between ${
                    isSelected
                      ? 'border-white/15 text-amber-300'
                      : 'border-slate-100 text-emerald-800'
                  }`}
                >
                  <span>{isSelected ? 'Selected for Donation' : 'Support This Cause'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Main Contribution Workspace: QR + Accounts + Impact Calculator */}
      <section
        id="donation-accounts"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 space-y-12"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Scan to Donate QR Card */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-950 text-white px-6 py-4 flex items-center justify-between border-b border-emerald-900">
              <div className="flex items-center gap-2.5">
                <QrCode className="w-5 h-5 text-amber-300 shrink-0" />
                <div>
                  <h2 className="text-base font-serif font-bold text-white leading-tight">
                    Scan to Donate Instantly
                  </h2>
                  <p className="text-[11px] text-emerald-200">
                    Easypaisa · Raast · Any Pakistani Banking App
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Official QR
              </span>
            </div>

            <div className="p-6 space-y-5">
              {/* View Switch: Crisp QR Only vs Full Easypaisa Raast Merchant Card */}
              <div className="flex items-center justify-between gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setQrViewMode('qr')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    qrViewMode === 'qr'
                      ? 'bg-white text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => setQrViewMode('card')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    qrViewMode === 'card'
                      ? 'bg-white text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Easypaisa Raast Card
                </button>
              </div>

              {/* Crisp QR Frame */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center">
                {qrViewMode === 'qr' ? (
                  <div className="w-64 h-64 sm:w-72 sm:h-72 bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs flex items-center justify-center">
                    <img
                      src={QR_IMAGE_PATH}
                      alt="Scan to Donate Easypaisa Raast QR Code — NexGen Council Merchant Till 992191268"
                      width={512}
                      height={512}
                      loading="eager"
                      decoding="async"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = EASYPAISA_QR_CARD_PATH;
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs">
                    <img
                      src={EASYPAISA_QR_CARD_PATH}
                      alt="Official Easypaisa Digital Bank & Raast QR Card for NexGen Council — Merchant Till 992191268"
                      width={720}
                      height={455}
                      loading="eager"
                      decoding="async"
                      className="w-full h-auto object-contain"
                    />
                  </div>
                )}
                <p className="text-xs text-slate-600 mt-3 text-center max-w-xs leading-relaxed">
                  Open Easypaisa Digital Bank, Raast, JazzCash, NayaPay, or any Pakistani banking app and scan to donate to NexGen Council.
                </p>
              </div>

              {/* Merchant Till Number */}
              <div className="rounded-xl border border-amber-300/80 bg-amber-50/75 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                    {PAYMENT_ACCOUNTS.merchantTill.label}
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-[0.14em] tabular-nums text-slate-950 mt-0.5">
                    {PAYMENT_ACCOUNTS.merchantTill.number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      'till',
                      PAYMENT_ACCOUNTS.merchantTill.number,
                      'Merchant Till Number'
                    )
                  }
                  className="px-3.5 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'till' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-300" />
                      <span>Copy Till</span>
                    </>
                  )}
                </button>
              </div>

              {/* QR Utility Actions */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={qrViewMode === 'card' ? EASYPAISA_QR_CARD_PATH : QR_IMAGE_PATH}
                  download={
                    qrViewMode === 'card'
                      ? 'NexGen-Council-Easypaisa-Raast-QR-Card.jpeg'
                      : 'NexGen-Council-Easypaisa-Donation-QR.png'
                  }
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{qrViewMode === 'card' ? 'Download QR Card' : 'Download QR'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowPosterModal(true)}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                  <span>Full Poster</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Official Accounts + Live Impact Amount Selector */}
          <div className="lg:col-span-7 space-y-6">
            {/* Official Donation Accounts */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Direct Mobile &amp; IBFT Transfer
                  </p>
                  <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-950 mt-0.5">
                    Official Donation Accounts
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  Tap any button below to copy account number
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Easypaisa Account */}
                <div className="rounded-xl border border-slate-200 border-t-4 border-t-emerald-600 bg-slate-50/70 p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-900">
                        {PAYMENT_ACCOUNTS.easypaisa.provider}
                      </span>
                      <Smartphone className="w-4 h-4 text-emerald-700" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                        Account Name
                      </p>
                      <p className="text-base font-bold text-slate-900 mt-0.5">
                        {PAYMENT_ACCOUNTS.easypaisa.accountName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                        Account Number
                      </p>
                      <p className="text-xl font-bold tracking-wider tabular-nums text-slate-950 mt-0.5">
                        {PAYMENT_ACCOUNTS.easypaisa.accountNumber}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Send directly via Easypaisa app or Raast from any bank account.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        'easypaisa',
                        PAYMENT_ACCOUNTS.easypaisa.accountNumber,
                        'Easypaisa number'
                      )
                    }
                    className="w-full py-2.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'easypaisa' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Easypaisa Number Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Easypaisa Number</span>
                      </>
                    )}
                  </button>
                </div>

                {/* NayaPay / JazzCash Account */}
                <div className="rounded-xl border border-slate-200 border-t-4 border-t-amber-500 bg-slate-50/70 p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {PAYMENT_ACCOUNTS.nayapayJazzcash.provider}
                      </span>
                      <Building2 className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                        Account Name
                      </p>
                      <p className="text-base font-bold text-slate-900 mt-0.5">
                        {PAYMENT_ACCOUNTS.nayapayJazzcash.accountName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                        Account Number
                      </p>
                      <p className="text-xl font-bold tracking-wider tabular-nums text-slate-950 mt-0.5">
                        {PAYMENT_ACCOUNTS.nayapayJazzcash.accountNumber}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Transfer effortlessly via NayaPay, JazzCash, or inter-bank transfer (IBFT).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        'nayapay',
                        PAYMENT_ACCOUNTS.nayapayJazzcash.accountNumber,
                        'NayaPay / JazzCash number'
                      )
                    }
                    className="w-full py-2.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === 'nayapay' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Number Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-amber-300" />
                        <span>Copy NayaPay / JazzCash</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Impact Guide & Contribution Amount */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-serif font-bold text-slate-950">
                    Dedicate Your Gift &amp; Preview Impact
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select your cause focus and preferred contribution amount
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-800">
                  Focus: {selectedCause}
                </span>
              </div>

              {/* Cause Pills / Selector Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {CAUSES.map((cause) => {
                  const Icon = cause.icon;
                  const active = selectedCause === cause.id;
                  return (
                    <button
                      key={cause.id}
                      type="button"
                      onClick={() => setSelectedCause(cause.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                        active
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-700/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          active ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      />
                      <span className="text-xs font-bold leading-snug">
                        {cause.title}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Suggested PKR Amount Buttons */}
              <div className="space-y-3 pt-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Choose or Enter Amount (PKR)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {QUICK_AMOUNTS.map(({ amount }) => {
                    const isSelected = selectedAmount === String(amount);
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setSelectedAmount(String(amount))}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold tabular-nums border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-950 text-white border-slate-950 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        PKR {amount.toLocaleString()}
                      </button>
                    );
                  })}
                  <div className="relative flex-1 min-w-[150px]">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                      PKR
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={selectedAmount}
                      onChange={(e) => setSelectedAmount(e.target.value)}
                      placeholder="Custom amount"
                      aria-label="Custom donation amount in PKR"
                      className="w-full pl-12 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Live Motivating Impact Statement */}
              <div className="rounded-xl bg-emerald-950 text-white p-4 sm:p-5 flex items-start gap-3.5">
                <Heart className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 tabular-nums">
                    {numericAmount > 0
                      ? `Impact of PKR ${numericAmount.toLocaleString()} · ${selectedCause}`
                      : `Your ${selectedCause} Impact`}
                  </p>
                  <p className="text-sm text-slate-100 leading-relaxed">
                    {getDynamicImpactPreview()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Lower Section: Step-by-Step Guide, Volunteer Invite & Receipt Desk */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Side: Steps + Share + Volunteer Invitation */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
              <h3 className="text-lg font-serif font-bold text-slate-950">
                How Your Gift Reaches the Community
              </h3>

              <ol className="space-y-4 text-sm">
                <li className="flex items-start gap-3.5">
                  <span className="w-6 h-6 rounded-md bg-slate-950 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                    01
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Open Your Payment App</p>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                      Launch Easypaisa, NayaPay, JazzCash, or any Raast-enabled Pakistani banking app on your mobile.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3.5">
                  <span className="w-6 h-6 rounded-md bg-slate-950 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                    02
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Scan QR or Transfer Direct</p>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                      Scan the Merchant QR (Till <strong className="tabular-nums text-slate-800">992191268</strong>) or transfer directly to <strong className="text-slate-800">Momna Kokab (03497100560)</strong> or <strong className="text-slate-800">Minahil Imran (03418408350)</strong>.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3.5">
                  <span className="w-6 h-6 rounded-md bg-slate-950 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                    03
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">Record Confirmation &amp; Receive Thanks</p>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                      Share your Transaction ID (TID) in the confirmation desk so the Council Secretariat can acknowledge your kindness.
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            {/* Share Campaign Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-700" />
                <h3 className="text-base font-serif font-bold text-slate-950">
                  Multiply the Kindness — Share This Drive
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Even sharing this campaign with one friend or family group can double the smiles we create together.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleShareCampaign('whatsapp')}
                  className="px-3.5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Share on WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => handleShareCampaign('facebook')}
                  className="px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Share on Facebook
                </button>
                <button
                  type="button"
                  onClick={() => handleShareCampaign('x')}
                  className="px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Share on X
                </button>
                <button
                  type="button"
                  onClick={() => handleShareCampaign('copy')}
                  className="px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedKey === 'campaign-url' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Page Link</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">Want to give your time too?</span>
                  <button
                    type="button"
                    onClick={() => setActivePage('volunteer')}
                    className="text-xs font-bold text-indigo-950 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Join as Volunteer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">Have questions about our work?</span>
                  <button
                    type="button"
                    onClick={() => setActivePage('faq')}
                    className="text-xs font-bold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Visit FAQ Page</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Donation Confirmation Form */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            {receiptRef ? (
              <div className="py-10 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-serif font-bold text-slate-950">
                    Thank You for Being Someone&apos;s Smile
                  </h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                    Your donation confirmation has been safely recorded with the NexGen Council Secretariat.
                  </p>
                </div>
                <div className="inline-block px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 tabular-nums">
                  Confirmation Reference: {receiptRef}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setReceiptRef(null)}
                    className="px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Submit Another Confirmation
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReceiptSubmit} className="space-y-5">
                <div className="border-b border-slate-100 pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-900">
                    Donor Acknowledgment Desk
                  </p>
                  <h3 className="text-xl font-serif font-bold text-slate-950 mt-0.5">
                    Confirm Your Donation Transfer
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    After sending your gift, share your transfer reference so our secretariat can verify and express gratitude.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Donor Full Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email Address <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      WhatsApp / Phone Number
                    </label>
                    <input
                      type="tel"
                      value={donorPhone}
                      onChange={(e) => setDonorPhone(e.target.value)}
                      placeholder="03XX-XXXXXXX"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Payment Channel Used
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    >
                      <option value="Easypaisa — Momna Kokab (03497100560)">
                        Easypaisa — Momna Kokab (03497100560)
                      </option>
                      <option value="NayaPay / JazzCash — Minahil Imran (03418408350)">
                        NayaPay / JazzCash — Minahil Imran (03418408350)
                      </option>
                      <option value="Merchant QR / Till Number (992191268)">
                        Merchant QR / Till Number (992191268)
                      </option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Cause Pillar
                    </label>
                    <select
                      value={selectedCause}
                      onChange={(e) => setSelectedCause(e.target.value as CauseId)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    >
                      {CAUSES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Amount (PKR) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={selectedAmount}
                      onChange={(e) => setSelectedAmount(e.target.value)}
                      placeholder="2500"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Transaction ID / TID
                    </label>
                    <input
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. TID 109482..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Message or Dedication (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={donorNote}
                    onChange={(e) => setDonorNote(e.target.value)}
                    placeholder="Share a message of hope or request an official acknowledgment receipt..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700 resize-none"
                  />
                </div>

                <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-500">
                    Recorded securely by the NexGen Council Secretariat.
                  </p>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmitting ? 'Submitting...' : 'Submit Donation Confirmation'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* 5. Closing Inspirational Charter Banner */}
        <div className="relative bg-[#080C18] text-white rounded-2xl border border-white/10 px-6 py-10 sm:px-12 sm:py-14 text-center space-y-4 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-40 rounded-full bg-emerald-500/15 blur-3xl"
          />
          <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            NexGen Council · Empower · Serve · Inspire
          </p>
          <h2 className="relative text-2xl sm:text-4xl font-serif font-bold text-white tracking-tight max-w-3xl mx-auto leading-tight [text-wrap:balance]">
            Together, let&apos;s build a stronger, kinder, and more hopeful community.
          </h2>
          <p className="relative text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
            Donate today and be the reason for someone&apos;s smile — no act of generosity ever goes unseen.
          </p>
          <p className="relative text-xs text-slate-400 pt-2 tracking-wide">
            #NexGenCouncil · #DonationDrive · #SpreadKindness · #CommunitySupport · #MakeADifference · #TogetherForChange
          </p>
        </div>
      </section>

      {/* Official Campaign Poster Modal */}
      {showPosterModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPosterModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Official NexGen Council Donation Poster"
        >
          <div
            className="relative bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-serif font-bold text-slate-950">
                  Official NexGen Council Donation Poster
                </h3>
                <p className="text-[11px] text-slate-500">
                  Merchant Till: 992191268 · Easypaisa: 03497100560 · NayaPay / JazzCash: 03418408350
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={POSTER_IMAGE_PATH}
                  download="NexGen-Council-Donation-Campaign.jpg"
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowPosterModal(false)}
                  aria-label="Close poster modal"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 overflow-y-auto flex items-center justify-center">
              <img
                src={POSTER_IMAGE_PATH}
                alt="NexGen Women Empowerment and Youth Leadership Council Official Donation Poster"
                width={1199}
                height={1312}
                className="max-h-[75vh] w-auto rounded-lg shadow-sm object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
