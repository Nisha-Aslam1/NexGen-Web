import React from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  Mail,
  Phone,
  MapPin,
  Heart,
  ShieldCheck,
  ArrowUpRight,
  Clock,
  FileCheck,
  Code2
} from 'lucide-react';

export const Footer: React.FC = () => {
  const { setActivePage, settings, currentUser } = useApp();

  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800">
      {/* Top CTA Bar */}
      <div className="border-b border-slate-800/80 bg-slate-900/50 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <h3 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight">
              {settings?.footerHeading || 'Ready to create transformative community change?'}
            </h3>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              {settings?.footerSubheading ||
                'Join thousands of emerging leaders and volunteers working across educational equity, women empowerment, and youth civic policy.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-3">
            <button
              onClick={() => {
                setActivePage('volunteer');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <Heart className="w-4 h-4 fill-slate-950" />
              <span>{settings?.footerVolunteerButtonText || 'Become a Volunteer'}</span>
            </button>
            <button
              onClick={() => {
                setActivePage('contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-5 py-3 text-sm font-medium text-white border border-slate-700 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              {settings?.footerContactButtonText || 'Contact Us'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white p-1 overflow-hidden shrink-0">
                <img
                  src="/logo.png"
                  alt="NexGen Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <div>
                <h4 className="font-serif font-bold text-lg text-white leading-snug">
                  {settings?.organizationName || 'NexGen Council'}
                </h4>
                <p className="text-[11px] font-medium uppercase tracking-wider text-amber-400">
                  {settings?.footerSubTitle || 'Women Empowerment & Youth Leadership'}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed pr-4">
              {settings?.footerDescription ||
                settings?.tagline ||
                'Cultivating the next generation of visionary female leaders and civic changemakers through structured mentorship, skill building, and grassroots advocacy.'}
            </p>

            <div className="pt-2 text-xs text-slate-400 space-y-2">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{settings?.officeAddress || 'Global Leadership Secretariat'}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <a href={`mailto:${settings?.contactEmail || 'contact@nexgencouncil.org'}`} className="hover:text-white transition-colors">
                  {settings?.contactEmail || 'contact@nexgencouncil.org'}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{settings?.contactPhone || '+1 (800) 482-9380'}</span>
              </div>
              {settings?.footerOfficeHours && (
                <div className="flex items-center gap-2.5 text-slate-400">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{settings.footerOfficeHours}</span>
                </div>
              )}
              {settings?.registrationNumber && (
                <div className="flex items-center gap-2.5 text-emerald-400 font-medium">
                  <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{settings.registrationNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Navigation */}
          <div>
            <h5 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">
              Organization
            </h5>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  onClick={() => { setActivePage('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  About Us & Mission
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('team'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Leadership & Council
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('programs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Featured Programs
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('events'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Upcoming Events
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('news'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  News & Announcements
                </button>
              </li>
            </ul>
          </div>

          {/* Programs & Impact */}
          <div>
            <h5 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">
              Key Initiatives
            </h5>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  onClick={() => { setActivePage('programs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 group"
                >
                  <span>30-Day Leadership Series</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('programs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Women in Tech Fellowship
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('programs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Grassroots Micro-Grants
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('programs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Youth Parliamentary Forum
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('gallery'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Photo & Summit Gallery
                </button>
              </li>
            </ul>
          </div>

          {/* Participation & Portal */}
          <div>
            <h5 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4">
              Get Involved
            </h5>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button
                  onClick={() => { setActivePage('volunteer'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-amber-400 hover:text-amber-300 font-medium transition-colors cursor-pointer"
                >
                  Join as a Volunteer
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('track'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Check Application Status
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActivePage('contact'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Partner With Us
                </button>
              </li>
              <li className="pt-2">
                <button
                  onClick={() => { setActivePage(currentUser ? 'admin' : 'admin-login'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors border border-slate-800 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Admin Management</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-12 mt-12 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
            <p>
              {settings?.footerCopyrightText ||
                `© ${new Date().getFullYear()} ${settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council'}. All rights reserved.`}
            </p>
            <span className="hidden sm:inline text-slate-700">•</span>
            {/* Developer Watermark Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 shadow-xs">
              <Code2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 text-[11px]">Developed by</span>
              <span className="font-bold text-amber-300 text-xs tracking-wide">Nisha Aslam</span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-center md:justify-end">
            <span>{settings?.footerBadgeText || 'Non-Governmental Organization • Civic Leadership Initiative'}</span>
            <span>•</span>
            <button
              onClick={() => { setActivePage(currentUser ? 'admin' : 'admin-login'); }}
              className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Council Staff Login
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
