import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  ShieldCheck,
  FileText,
  Camera,
  Award,
  Lock,
  Mail,
  HeartHandshake,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Globe2,
  AlertCircle
} from 'lucide-react';

export const TermsPage: React.FC = () => {
  const { setActivePage, settings } = useApp();
  const orgName = settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council';
  const contactEmail = settings?.contactEmail || 'contact@nexgencouncil.org';

  useDocumentSEO({
    title: 'Terms of Service & Media Licensing Policy | NexGen Council',
    description:
      'Official terms of service, image licensing guidelines, and copyright policy for NexGen Women Empowerment & Youth Leadership Council assets, photos, and publications.',
    canonicalPath: '/terms',
    ogType: 'website',
    ogImage: '/banner.png',
    ogImageAlt: 'NexGen Council Terms of Service and Media Licensing Policy',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': 'https://nexgencouncil.bond/terms#webpage',
        url: 'https://nexgencouncil.bond/terms',
        name: 'Terms of Service & Media Licensing Policy | NexGen Council',
        description:
          'Official terms of service, image licensing guidelines, and copyright policy for NexGen Women Empowerment & Youth Leadership Council assets, photos, and publications.',
        inLanguage: 'en',
        isPartOf: { '@id': 'https://nexgencouncil.bond/#website' },
        about: { '@id': 'https://nexgencouncil.bond/#organization' },
        license: 'https://nexgencouncil.bond/terms#media-licensing'
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://nexgencouncil.bond/'
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Terms & Media Licensing',
            item: 'https://nexgencouncil.bond/terms'
          }
        ]
      }
    ]
  });

  // Handle hash scrolling if navigating with #media-licensing or #acquire-license
  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.replace('#', ''));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header Breadcrumb & Title */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-900 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
            <span>Official Council Governance &amp; Intellectual Property</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-slate-900 tracking-tight">
            Terms of Service &amp; Media Licensing
          </h1>

          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Legal charter guidelines, digital member credential protections, and public image licensing terms governing the NexGen Women Empowerment &amp; Youth Leadership Council.
          </p>

          <p className="text-xs text-slate-400 font-mono">
            Effective Date: January 1, 2026 · Last Verified: November 27, 2026
          </p>
        </div>

        {/* Quick Jump Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs text-xs font-semibold">
          <a
            href="#media-licensing"
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50 hover:text-amber-900 transition-colors text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-600" />
              <span>Media &amp; Image Licensing</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <a
            href="#acquire-license"
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50 hover:text-amber-900 transition-colors text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-indigo-600" />
              <span>Acquire Permissions</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <a
            href="#credentials"
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-amber-50 hover:text-amber-900 transition-colors text-slate-700"
          >
            <span className="flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <span>Member ID Credentials</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>

        {/* SECTION 1: PRIMARY MEDIA & IMAGE LICENSING (GOOGLE SEARCH CONSOLE COMPLIANT) */}
        <section
          id="media-licensing"
          className="scroll-mt-24 bg-white rounded-3xl border-2 border-amber-400/40 p-6 sm:p-10 shadow-lg space-y-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-bl-full pointer-events-none" />

          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 text-amber-800 flex items-center justify-center shrink-0 border border-amber-400/30">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                Google Image Search &amp; Creative Commons Specification
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900">
                1. Official Image &amp; Media Licensing Policy
              </h2>
            </div>
          </div>

          <div className="prose prose-slate max-w-none text-xs sm:text-sm text-slate-600 space-y-4 leading-relaxed">
            <p>
              All photographs, documentary field images, infographics, event galleries, posters, and institutional emblems published on <code className="text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono">https://nexgencouncil.bond</code> are the protected intellectual property of <strong>{orgName}</strong>, registered civil society council.
            </p>

            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-2 text-slate-800">
              <h3 className="font-bold text-sm text-amber-950 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-700" />
                <span>Editorial, Journalistic &amp; Non-Commercial License (CC BY-NC-ND 4.0 Compatible)</span>
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed">
                Journalists, news agencies, academic institutions, and partner civil society organizations are granted a non-exclusive, worldwide, royalty-free license to reproduce Council photographs and public dispatches for editorial reporting, civic awareness, and educational purposes under the following mandatory terms:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                <li><strong>Mandatory Attribution:</strong> Clear attribution must accompany the image: <em>&ldquo;Photo: NexGen Women Empowerment &amp; Youth Leadership Council (nexgencouncil.bond)&rdquo;</em>.</li>
                <li><strong>Non-Commercial Purpose:</strong> Images may not be sold, licensed, or incorporated into commercial product merchandising without prior written consent.</li>
                <li><strong>No Derivative Exploitation:</strong> Photos documenting youth and female leadership activities may not be digitally altered, manipulated, or presented in defamatory or misleading contexts.</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Standard License URI</span>
                <code className="text-[11px] font-mono text-indigo-900 break-all">https://nexgencouncil.bond/terms#media-licensing</code>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Creative Commons Benchmark</span>
                <span className="text-slate-700">CC BY-NC-ND 4.0 (Attribution-NonCommercial-NoDerivatives)</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: HOW TO ACQUIRE LICENSES OR HIGH-RES PERMISSIONS */}
        <section
          id="acquire-license"
          className="scroll-mt-24 bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-6"
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-900 flex items-center justify-center shrink-0 border border-indigo-100">
              <Globe2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 block">
                Press Inquiries &amp; Specialized Rights
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900">
                2. How to Acquire an Image License or High-Resolution Assets
              </h2>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-slate-600 space-y-4 leading-relaxed">
            <p>
              If your publication, broadcasting agency, documentary team, or organization requires high-resolution RAW photography, print-quality vectors, or commercial publication rights beyond standard fair-use editorial reporting, please contact the Council Secretariat:
            </p>

            <div className="p-5 rounded-2xl bg-indigo-950 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="font-serif font-bold text-base text-white">Media Licensing &amp; Press Desk</h4>
                <p className="text-xs text-slate-300">
                  Direct requests to: <span className="font-mono text-amber-300">{contactEmail}</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  Subject Line: [Media License Request] &lt;Asset Name or Page URL&gt;
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActivePage('contact')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-colors whitespace-nowrap"
              >
                <Mail className="w-4 h-4" />
                <span>Contact Press Secretariat</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: DIGITAL MEMBER ID CARDS & ONE-TIME CREDENTIALS */}
        <section
          id="credentials"
          className="scroll-mt-24 bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-6"
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-100">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                Verification &amp; Fraud Prevention
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900">
                3. Official Digital Member ID Card Terms
              </h2>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-slate-600 space-y-4 leading-relaxed">
            <p>
              The NexGen Council Digital Member ID Card is an official civic identification credential issued exclusively to verified, approved volunteers and fellowship scholars:
            </p>

            <div className="space-y-2.5">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <Lock className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">One-Time Issuance &amp; Single Photo Lock:</strong>
                  <p className="text-xs text-slate-600 mt-0.5">
                    To prevent credential impersonation and duplicated claims, each approved applicant is restricted to a single portrait photo upload. Once generated, the official record is permanently locked in the Secretariat registry.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Live QR Verification:</strong>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Every issued card carries an encrypted verification QR code linking directly to <code className="bg-white px-1 py-0.5 rounded text-indigo-900 font-mono text-[11px]">https://nexgencouncil.bond/track?code=NXG-YYYY-XXXX</code> for instant validation by chapter coordinators and partnering organizations.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: CODE OF CONDUCT & COMMUNITY STANDARDS */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-900 flex items-center justify-center shrink-0 border border-amber-100">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">
                Ethical Service
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-slate-900">
                4. Code of Conduct &amp; Zero Tolerance
              </h2>
            </div>
          </div>

          <div className="text-xs sm:text-sm text-slate-600 space-y-3 leading-relaxed">
            <p>
              Members, fellows, volunteers, and visitors must uphold the highest standards of integrity, respect, and non-discrimination. NexGen Council maintains an uncompromising zero-tolerance policy regarding:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
              <li>Harassment, intimidation, or hate speech targeting any gender, ethnic, or religious group.</li>
              <li>Unauthorized solicitation of funds or misrepresentation of the Council&apos;s non-governmental standing.</li>
              <li>Breaching confidentiality of vulnerable beneficiaries or volunteer emergency contacts.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 5: GOVERNING LAW & SECRETARIAT NOTICE */}
        <div className="p-6 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-600 space-y-2 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-800">
              Jurisdiction &amp; Administration
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Administered under the registered civil charter of NexGen Women Empowerment &amp; Youth Leadership Council, Sialkot, Punjab, Pakistan.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
          >
            Return to Homepage
          </button>
        </div>
      </div>
    </div>
  );
};
