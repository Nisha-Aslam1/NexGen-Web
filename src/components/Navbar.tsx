import React, { useState, useEffect } from 'react';
import { useApp, ActivePage } from '../context/AppContext.tsx';
import {
  Menu,
  X,
  ChevronRight,
  UserCheck,
  Search,
  Sparkles
} from 'lucide-react';
import { GlobalSearchModal } from './public/GlobalSearchModal.tsx';

export const Navbar: React.FC = () => {
  const { activePage, setActivePage, settings } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navItems: { label: string; page: ActivePage }[] = [
    { label: 'Home', page: 'home' },
    { label: 'About', page: 'about' },
    { label: 'Programs', page: 'programs' },
    { label: 'Events', page: 'events' },
    { label: 'News', page: 'news' },
    { label: 'Gallery', page: 'gallery' },
    { label: 'Leadership', page: 'team' },
    { label: 'Donate', page: 'donate' },
    { label: 'Contact', page: 'contact' }
  ];

  // Global Ctrl+K / Cmd+K (and '/' when not typing in an input) to open Search
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMobileMenuOpen(false);
        setSearchOpen(prev => !prev);
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          target?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setMobileMenuOpen(false);
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  const navigateTo = (page: ActivePage) => {
    setActivePage(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showBanner = settings?.announcementBanner?.enabled && !bannerDismissed;

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        {/* Top Announcement Banner */}
        {showBanner && (
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white text-xs py-1.5 px-4 border-b border-indigo-900/50">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 mx-auto text-center truncate">
                <span className="bg-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1 border border-amber-400/30 shrink-0">
                  <Sparkles className="w-3 h-3 text-amber-300" /> Announcement
                </span>
                <span className="text-slate-200 text-xs font-normal truncate">
                  {settings.announcementBanner?.text}
                </span>
                {settings.announcementBanner?.linkText && (
                  <button
                    onClick={() => navigateTo('volunteer')}
                    className="text-amber-300 font-semibold underline hover:text-amber-200 ml-1 text-xs transition-colors cursor-pointer shrink-0"
                  >
                    {settings.announcementBanner.linkText} →
                  </button>
                )}
              </div>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-slate-400 hover:text-white transition-colors p-0.5 rounded shrink-0 cursor-pointer"
                aria-label="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2 xl:gap-3">
            {/* Brand Logo & Title */}
            <button
              onClick={() => navigateTo('home')}
              className="flex items-center gap-2.5 sm:gap-3 text-left group cursor-pointer focus:outline-none shrink-0 py-1"
              aria-label="NexGen Council Home"
            >
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-white p-1 border border-slate-200/90 shadow-2xs transition-transform duration-200 group-hover:scale-105 flex items-center justify-center shrink-0">
                <picture>
                  <source srcSet="/logo.webp" type="image/webp" />
                  <img
                    src="/logo.png"
                    alt="NexGen Women Empowerment & Youth Leadership Council Official Logo"
                    title="NexGen Council Official Logo"
                    width={40}
                    height={40}
                    loading="eager"
                    decoding="async"
                    className="w-full h-full object-contain filter drop-shadow-2xs"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </picture>
              </div>
              <div className="flex flex-col justify-center">
                <span className="font-serif font-bold text-base sm:text-lg tracking-tight text-slate-900 group-hover:text-indigo-950 transition-colors leading-none whitespace-nowrap">
                  NexGen Council
                </span>
                <span className="text-[11px] font-medium text-slate-500 leading-none mt-1 hidden sm:block whitespace-nowrap">
                  Women Empowerment &amp; Youth Leadership
                </span>
              </div>
            </button>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-0.5">
              {navItems.map(item => {
                const isActive = activePage === item.page;
                const isDonate = item.page === 'donate';
                return (
                  <button
                    key={item.page}
                    onClick={() => navigateTo(item.page)}
                    className={`px-2 xl:px-2.5 py-1.5 rounded-lg text-[13px] font-medium tracking-tight transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 text-indigo-950 font-semibold shadow-2xs'
                        : isDonate
                          ? 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Desktop Action Buttons - Proportional & Sleek */}
            <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0">
              {/* Universal Global Search Trigger */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="h-8.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-700 hover:text-indigo-950 hover:bg-slate-100 text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                title="Search Programs, Events, News, FAQs & Track ID (Ctrl+K)"
                aria-label="Open Global Search"
              >
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="hidden xl:inline">Search</span>
                <kbd className="hidden xl:inline-block px-1 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded leading-none">
                  Ctrl K
                </kbd>
              </button>

              {/* Track Application Button */}
              <button
                onClick={() => navigateTo('track')}
                className="h-8.5 px-2.5 xl:px-3 rounded-lg border border-slate-200 text-slate-700 hover:text-indigo-950 hover:bg-slate-100 text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                title="Track submitted volunteer application"
              >
                <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Track</span>
              </button>

              {/* Become a Volunteer Primary Button */}
              <button
                onClick={() => navigateTo('volunteer')}
                className="h-8.5 px-3.5 xl:px-4 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-white text-[13px] font-semibold flex items-center gap-1.5 transition-all shadow-xs hover:shadow-indigo-950/20 active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Join as Volunteer</span>
              </button>
            </div>

            {/* Mobile Right Controls */}
            <div className="flex lg:hidden items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSearchOpen(true);
                }}
                className="w-9 h-9 rounded-lg border border-slate-200 text-slate-700 hover:text-indigo-950 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Open Global Search"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateTo('volunteer')}
                className="h-9 px-3 text-xs font-semibold text-white bg-indigo-950 hover:bg-indigo-900 rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Volunteer</span>
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Toggle Navigation Menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 shadow-xl animate-in slide-in-from-top-2 duration-150">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setSearchOpen(true);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:text-indigo-950 text-xs font-medium flex items-center gap-2 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Search Programs, Events, News, FAQs &amp; Track ID...</span>
            </button>

            <div className="grid grid-cols-1 gap-1">
              {navItems.map(item => (
                <button
                  key={item.page}
                  onClick={() => navigateTo(item.page)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium w-full text-left transition-colors cursor-pointer ${
                    activePage === item.page
                      ? 'bg-slate-100 text-indigo-950 font-bold shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ))}
              <button
                onClick={() => navigateTo('faq')}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium w-full text-left transition-colors cursor-pointer ${
                  activePage === 'faq'
                    ? 'bg-slate-100 text-indigo-950 font-bold shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>FAQ &amp; Help</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <button
                onClick={() => navigateTo('track')}
                className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                <span>Track Application Status</span>
              </button>

              <button
                onClick={() => navigateTo('volunteer')}
                className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-white bg-indigo-950 hover:bg-indigo-900 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Become a Volunteer</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
};

