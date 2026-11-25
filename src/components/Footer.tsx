import React from 'react';
import { useApp, ActivePage } from '../context/AppContext.tsx';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  ArrowUp,
  ChevronRight
} from 'lucide-react';

const SocialBrandIcons = {
  facebook: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.1H7.7v3h2.5V21h3.3z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="0.8" className="fill-current stroke-none" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M6.94 8.5H3.56V19.5H6.94V8.5ZM5.25 3.5C4.14 3.5 3.25 4.39 3.25 5.5C3.25 6.6 4.14 7.5 5.25 7.5C6.35 7.5 7.25 6.6 7.25 5.5C7.25 4.39 6.35 3.5 5.25 3.5ZM20.44 13.02C20.44 9.88 18.76 8.22 16.16 8.22C14.37 8.22 13.48 9.21 13.02 9.93V8.5H9.65C9.7 9.48 9.65 19.5 9.65 19.5H13.02V13.36C13.02 13.02 13.05 12.69 13.15 12.45C13.42 11.78 14.03 11.09 15.07 11.09C16.41 11.09 17.06 12.11 17.06 13.6V19.5H20.44V13.02Z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M21.58 7.19a2.75 2.75 0 0 0-1.94-1.95C17.93 4.75 12 4.75 12 4.75s-5.93 0-7.64.49A2.75 2.75 0 0 0 2.42 7.19 28.8 28.8 0 0 0 1.93 12a28.8 28.8 0 0 0 .49 4.81 2.75 2.75 0 0 0 1.94 1.95c1.71.49 7.64.49 7.64.49s5.93 0 7.64-.49a2.75 2.75 0 0 0 1.94-1.95A28.8 28.8 0 0 0 22.07 12a28.8 28.8 0 0 0-.49-4.81zM10 15.1V8.9l5.2 3.1-5.2 3.1z" />
    </svg>
  )
};

export const Footer: React.FC = () => {
  const { setActivePage, settings } = useApp();

  const navigate = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const orgLinks: { label: string; page: ActivePage }[] = [
    { label: 'Home', page: 'home' },
    { label: 'About Us & Mission', page: 'about' },
    { label: 'Leadership & Council', page: 'team' },
    { label: 'Featured Programs', page: 'programs' },
    { label: 'Photo Gallery', page: 'gallery' }
  ];

  const communityLinks: { label: string; page: ActivePage; highlight?: boolean }[] = [
    { label: 'Join as a Volunteer', page: 'volunteer', highlight: true },
    { label: 'Donate & Support Us', page: 'donate', highlight: true },
    { label: 'Track Application & ID', page: 'track' },
    { label: 'Upcoming Events', page: 'events' },
    { label: 'News & Announcements', page: 'news' },
    { label: 'Council Video Meetings', page: 'meetings' },
    { label: 'Help & FAQs', page: 'faq' }
  ];

  const socialItems = (
    settings?.showSocialLinks === false
      ? []
      : [
          { key: 'facebook' as const, label: 'Facebook', url: settings?.socialLinks?.facebook, icon: SocialBrandIcons.facebook },
          { key: 'instagram' as const, label: 'Instagram', url: settings?.socialLinks?.instagram, icon: SocialBrandIcons.instagram },
          { key: 'linkedin' as const, label: 'LinkedIn', url: settings?.socialLinks?.linkedin, icon: SocialBrandIcons.linkedin },
          { key: 'twitter' as const, label: 'X (Twitter)', url: settings?.socialLinks?.twitter, icon: SocialBrandIcons.twitter },
          { key: 'youtube' as const, label: 'YouTube', url: settings?.socialLinks?.youtube, icon: SocialBrandIcons.youtube }
        ].filter((item): item is { key: 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'youtube'; label: string; url: string; icon: React.JSX.Element } => {
          const isEnabled = settings?.socialLinksVisibility?.[item.key] !== false;
          const cleanUrl = typeof item.url === 'string' ? item.url.trim() : '';
          return isEnabled && /^https?:\/\//i.test(cleanUrl);
        })
  );

  const contactEmail = settings?.contactEmail || 'contact@nexgencouncil.org';
  const contactPhone = settings?.contactPhone || '+1 (800) 482-9380';
  const officeAddress = settings?.officeAddress || 'Executive Secretariat, 100 Leadership Plaza, Suite 400, Global District';

  return (
    <footer className="relative bg-[#090D1A] text-slate-300 border-t border-white/10 overflow-hidden">
      {/* Subtle architectural top illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[42rem] h-48 rounded-full bg-indigo-500/10 blur-3xl"
      />

      {/* Executive Action Strip */}
      <div className="relative border-b border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">
                {settings?.organizationName || 'NexGen Council'}
              </p>
              <h3 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight leading-snug [text-wrap:balance]">
                {settings?.footerHeading || 'Ready to create transformative community change?'}
              </h3>
              <p className="text-sm sm:text-[15px] text-slate-400 leading-relaxed max-w-xl">
                {settings?.footerSubheading ||
                  'Join emerging leaders and volunteers working across educational equity, women empowerment, and youth civic policy.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => navigate('volunteer')}
                className="px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] rounded-xl transition-all duration-200 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D1A]"
              >
                <span>{settings?.footerVolunteerButtonText || 'Become a Volunteer'}</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('donate')}
                className="px-5 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] rounded-xl transition-all duration-200 cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D1A]"
              >
                <span>Donate Now</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('contact')}
                className="px-5 py-3 text-sm font-medium text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/15 hover:border-white/25 rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D1A]"
              >
                {settings?.footerContactButtonText || 'Contact Us'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Institutional Grid */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
          {/* Column 1: Institutional Identity & Channels */}
          <div className="md:col-span-2 lg:col-span-4 space-y-5 lg:pr-4">
            <button
              type="button"
              onClick={() => navigate('home')}
              className="inline-flex items-center gap-3.5 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl"
            >
              <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-sm overflow-hidden shrink-0 transition-transform duration-200 group-hover:scale-105">
                <picture>
                  <source srcSet="/logo.webp" type="image/webp" />
                  <img
                    src="/logo.png"
                    alt="NexGen Council Logo"
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </picture>
              </div>
              <div>
                <h4 className="font-serif font-bold text-lg text-white leading-tight group-hover:text-amber-200 transition-colors">
                  {settings?.organizationName || 'NexGen Council'}
                </h4>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-amber-400/90 mt-1">
                  {settings?.footerSubTitle || 'Women Empowerment & Youth Leadership'}
                </p>
              </div>
            </button>

            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              {settings?.footerDescription ||
                settings?.tagline ||
                'Cultivating the next generation of visionary female leaders and civic changemakers through structured mentorship, skill building, and grassroots advocacy.'}
            </p>

            {/* Social Media Channels */}
            {socialItems.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-3">
                  Connect With Us
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  {socialItems.map((item) => (
                    <a
                      key={item.key}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      title={item.label}
                      className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300 hover:text-amber-300 hover:border-amber-400/40 hover:bg-white/[0.08] flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      {item.icon}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Organization */}
          <div className="lg:col-span-2">
            <h5 className="text-xs font-semibold text-white uppercase tracking-[0.16em] pb-3 mb-4 border-b border-white/10">
              Organization
            </h5>
            <ul className="space-y-2.5 text-sm">
              {orgLinks.map((item) => (
                <li key={item.page}>
                  <button
                    type="button"
                    onClick={() => navigate(item.page)}
                    className="group inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors duration-150 cursor-pointer py-0.5 text-left focus-visible:outline-none focus-visible:text-amber-300"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Get Involved & Portal */}
          <div className="lg:col-span-3">
            <h5 className="text-xs font-semibold text-white uppercase tracking-[0.16em] pb-3 mb-4 border-b border-white/10">
              Get Involved &amp; Portal
            </h5>
            <ul className="space-y-2.5 text-sm">
              {communityLinks.map((item) => (
                <li key={item.page}>
                  <button
                    type="button"
                    onClick={() => navigate(item.page)}
                    className={`group inline-flex items-center gap-1.5 transition-colors duration-150 cursor-pointer py-0.5 text-left focus-visible:outline-none ${
                      item.highlight
                        ? 'text-amber-400 hover:text-amber-300 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-all shrink-0 group-hover:translate-x-0.5 ${
                        item.highlight
                          ? 'text-amber-400'
                          : 'text-slate-600 group-hover:text-amber-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => navigate('contact')}
                  className="group inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors duration-150 cursor-pointer py-0.5 text-left focus-visible:outline-none"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  <span>Partner With Us</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Executive Secretariat */}
          <div className="lg:col-span-3">
            <h5 className="text-xs font-semibold text-white uppercase tracking-[0.16em] pb-3 mb-4 border-b border-white/10">
              Secretariat Desk
            </h5>
            <div className="space-y-3.5 text-[13px] text-slate-400">
              {settings?.showOfficeAddress !== false && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-amber-400/90 shrink-0 mt-0.5" />
                  <span className="leading-relaxed text-slate-300">{officeAddress}</span>
                </div>
              )}

              {settings?.showContactEmail !== false && (
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-amber-400/90 shrink-0" />
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-slate-300 hover:text-amber-300 transition-colors break-all"
                  >
                    {contactEmail}
                  </a>
                </div>
              )}

              {settings?.showContactPhone !== false && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-amber-400/90 shrink-0" />
                  <a
                    href={`tel:${contactPhone.replace(/[^+\d]/g, '')}`}
                    className="text-slate-300 hover:text-amber-300 transition-colors tabular-nums"
                  >
                    {contactPhone}
                  </a>
                </div>
              )}

              {settings?.showOfficeHours !== false && settings?.footerOfficeHours && (
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-400/90 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{settings.footerOfficeHours}</span>
                </div>
              )}

              {settings?.showRegistrationNumber !== false && settings?.registrationNumber && (
                <div className="pt-2 border-t border-white/10 flex items-start gap-2.5 text-emerald-400/95 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs leading-relaxed">{settings.registrationNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Legal & Attribution Bar */}
        <div className="mt-12 pt-7 border-t border-white/10 flex flex-col lg:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-3 gap-y-1.5 text-center lg:text-left">
            <p className="text-slate-400">
              {settings?.footerCopyrightText ||
                `© ${new Date().getFullYear()} ${settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council'}. All rights reserved.`}
            </p>
            <span aria-hidden="true" className="hidden sm:inline text-slate-700">·</span>
            <span className="text-slate-400">
              Developed by <span className="font-semibold text-amber-300">Nisha Aslam</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4">
            <span className="text-slate-400 text-center">
              {settings?.footerBadgeText || 'Non-Governmental Organization · Civic Leadership Initiative'}
            </span>
            <button
              type="button"
              onClick={scrollToTop}
              aria-label="Scroll back to top"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <span>Back to Top</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
