import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  VolunteerApplication,
  Volunteer,
  Program,
  EventItem,
  NewsItem,
  TeamMember,
  GalleryItem,
  ContactMessage,
  WebsiteSettings,
  DashboardStats,
  ActivityLog
} from '../types.ts';

export type ActivePage =
  | 'home'
  | 'about'
  | 'programs'
  | 'events'
  | 'news'
  | 'gallery'
  | 'team'
  | 'volunteer'
  | 'track'
  | 'contact'
  | 'admin-login'
  | 'admin'
  | 'room'
  | 'meetings'
  | '404';

export type AdminTab =
  | 'dashboard'
  | 'analytics'
  | 'applications'
  | 'volunteers'
  | 'programs'
  | 'events'
  | 'news'
  | 'team'
  | 'gallery'
  | 'contacts'
  | 'email'
  | 'settings'
  | 'users'
  | 'activity'
  | 'database'
  | 'meetings';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface LoginResult {
  ok: boolean;
  requires2FA?: boolean;
  temp2faToken?: string;
  userPreview?: { name: string; email: string };
  expired?: boolean;
  error?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}

export function normalizeUserRole(role?: string): string {
  if (!role) return '';
  const s = role.toUpperCase().replace(/[\s-]+/g, '_');
  if (s === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (s === 'EDITOR') return 'CONTENT_MANAGER';
  return s;
}

export function canAccessAdminTab(tab: AdminTab, role?: string): boolean {
  const norm = normalizeUserRole(role);
  if (!norm) return false;
  if (norm === 'SUPER_ADMIN') return true;
  if (norm === 'ADMIN') {
    return tab !== 'users' && tab !== 'database';
  }
  if (norm === 'VOLUNTEER_MANAGER') {
    return ['dashboard', 'meetings', 'analytics', 'applications', 'volunteers', 'contacts', 'email', 'activity'].includes(tab);
  }
  if (norm === 'CONTENT_MANAGER') {
    return ['dashboard', 'meetings', 'analytics', 'programs', 'events', 'news', 'team', 'gallery', 'contacts', 'email', 'settings', 'activity'].includes(tab);
  }
  if (norm === 'COMMUNICATIONS_OFFICER') {
    return ['dashboard', 'contacts', 'email', 'news', 'gallery', 'analytics', 'activity'].includes(tab);
  }
  if (norm === 'EVENT_COORDINATOR') {
    return ['dashboard', 'programs', 'events', 'gallery', 'meetings', 'analytics', 'activity'].includes(tab);
  }
  if (norm === 'MEETING_HOST') {
    return ['dashboard', 'meetings', 'analytics', 'activity'].includes(tab);
  }
  if (norm === 'VIEWER') {
    return ['dashboard', 'analytics', 'activity'].includes(tab);
  }
  return false;
}

export function parsePathname(pathname: string, hash?: string): {
  page: ActivePage;
  programSlug?: string;
  eventSlug?: string;
  newsSlug?: string;
  meetingCode?: string;
  adminTab?: AdminTab;
} {
  let clean = pathname.split('?')[0].replace(/\/$/, '').toLowerCase() || '/';

  // Support hash routing fallback for admin and meeting direct links
  if ((clean === '/' || clean === '') && hash) {
    const cleanHash = hash.replace(/^#\/?/, '/').split('?')[0].replace(/\/$/, '').toLowerCase();
    if (cleanHash === '/admin' || cleanHash.startsWith('/admin/') || cleanHash === '/admin-login' || cleanHash === '/login') {
      clean = cleanHash;
    } else if (cleanHash.startsWith('/meeting/') || cleanHash.startsWith('/room/') || cleanHash.startsWith('/meet/')) {
      clean = cleanHash;
    }
  }

  if (clean === '/' || clean === '/home') return { page: 'home' };
  if (clean === '/about' || clean === '/about-us') return { page: 'about' };
  if (clean === '/programs') return { page: 'programs' };
  if (clean.startsWith('/programs/')) {
    return { page: 'programs', programSlug: clean.replace('/programs/', '') };
  }
  if (clean === '/events' || clean === '/upcoming-events') return { page: 'events' };
  if (clean.startsWith('/events/')) {
    return { page: 'events', eventSlug: clean.replace('/events/', '') };
  }
  if (clean === '/news' || clean === '/news-and-updates') return { page: 'news' };
  if (clean.startsWith('/news/')) {
    return { page: 'news', newsSlug: clean.replace('/news/', '') };
  }
  if (clean === '/gallery') return { page: 'gallery' };
  if (clean === '/team' || clean === '/leadership') return { page: 'team' };
  if (clean === '/volunteer' || clean === '/volunteer-with-us' || clean === '/volunteer-apply') return { page: 'volunteer' };
  if (clean === '/track' || clean === '/track-application') return { page: 'track' };
  if (clean === '/contact' || clean === '/contact-us') return { page: 'contact' };
  if (clean === '/admin-login' || clean === '/login') return { page: 'admin-login' };
  if (clean === '/admin/meetings') return { page: 'admin', adminTab: 'meetings' };
  if (clean === '/admin' || clean.startsWith('/admin/')) return { page: 'admin' };
  if (clean === '/meetings' || clean === '/meeting' || clean === '/meet') return { page: 'meetings' };
  if (clean.startsWith('/meeting/')) {
    return { page: 'room', meetingCode: clean.replace('/meeting/', '') };
  }
  if (clean.startsWith('/room/')) {
    return { page: 'room', meetingCode: clean.replace('/room/', '') };
  }
  if (clean.startsWith('/meet/')) {
    return { page: 'room', meetingCode: clean.replace('/meet/', '') };
  }
  return { page: '404' };
}

export function getPathForPage(
  page: ActivePage,
  programSlug?: string | null,
  eventSlug?: string | null,
  newsSlug?: string | null,
  meetingCode?: string | null
): string {
  if (page === 'home') return '/';
  if (page === 'about') return '/about';
  if (page === 'programs') return programSlug ? `/programs/${programSlug}` : '/programs';
  if (page === 'events') return eventSlug ? `/events/${eventSlug}` : '/events';
  if (page === 'news') return newsSlug ? `/news/${newsSlug}` : '/news';
  if (page === 'gallery') return '/gallery';
  if (page === 'team') return '/team';
  if (page === 'volunteer') return '/volunteer';
  if (page === 'track') return '/track';
  if (page === 'contact') return '/contact';
  if (page === 'admin-login') return '/admin-login';
  if (page === 'admin') return '/admin';
  if (page === 'meetings') return '/meetings';
  if (page === 'room') return meetingCode ? `/meeting/${meetingCode}` : '/meetings';
  return '/404';
}

interface AppContextType {
  // Navigation
  activePage: ActivePage;
  setActivePage: (page: ActivePage, slug?: string | null) => void;
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  selectedProgramSlug: string | null;
  setSelectedProgramSlug: (slug: string | null) => void;
  selectedEventSlug: string | null;
  setSelectedEventSlug: (slug: string | null) => void;
  selectedNewsSlug: string | null;
  setSelectedNewsSlug: (slug: string | null) => void;
  selectedMeetingCode: string | null;
  setSelectedMeetingCode: (code: string | null) => void;

  // Auth
  currentUser: User | null;
  authToken: string | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  verifyTwoFactorLogin: (temp2faToken: string, code: string) => Promise<LoginResult>;
  updateCurrentUser: (user: User) => void;
  logout: () => Promise<void>;
  isLoadingAuth: boolean;

  // Global Toast
  toasts: Toast[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // Public & General Data
  settings: WebsiteSettings | null;
  programs: Program[];
  events: EventItem[];
  news: NewsItem[];
  team: TeamMember[];
  gallery: GalleryItem[];
  isLoadingPublicData: boolean;
  refreshData: () => Promise<void>;

  // Real-time State
  isSyncing: boolean;
  lastSyncTime: Date;
  pendingApplicationsCount: number;
  unreadContactsCount: number;
  triggerRealtimeSync: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialNav = typeof window !== 'undefined'
    ? parsePathname(window.location.pathname, window.location.hash)
    : { page: 'home' as ActivePage };
  const [activePage, setActivePageState] = useState<ActivePage>(initialNav.page);
  const [adminTab, setAdminTab] = useState<AdminTab>(initialNav.adminTab || 'dashboard');
  const [selectedProgramSlug, setSelectedProgramSlug] = useState<string | null>(initialNav.programSlug || null);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(initialNav.eventSlug || null);
  const [selectedNewsSlug, setSelectedNewsSlug] = useState<string | null>(initialNav.newsSlug || null);
  const [selectedMeetingCode, setSelectedMeetingCode] = useState<string | null>(initialNav.meetingCode || null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('ng_token'));
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);

  // Synchronize browser history / popstate / hashchange
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parsePathname(window.location.pathname, window.location.hash);
      setActivePageState(parsed.page);
      if (parsed.adminTab) setAdminTab(parsed.adminTab);
      setSelectedProgramSlug(parsed.programSlug || null);
      setSelectedEventSlug(parsed.eventSlug || null);
      setSelectedNewsSlug(parsed.newsSlug || null);
      setSelectedMeetingCode(parsed.meetingCode || null);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const setActivePage = (page: ActivePage, slug?: string | null) => {
    setActivePageState(page);

    let pSlug = selectedProgramSlug;
    let eSlug = selectedEventSlug;
    let nSlug = selectedNewsSlug;
    let mCode = selectedMeetingCode;

    if (page === 'programs') {
      pSlug = slug !== undefined ? slug : null;
      setSelectedProgramSlug(pSlug);
      setSelectedEventSlug(null);
      setSelectedNewsSlug(null);
      setSelectedMeetingCode(null);
    } else if (page === 'events') {
      eSlug = slug !== undefined ? slug : null;
      setSelectedEventSlug(eSlug);
      setSelectedProgramSlug(null);
      setSelectedNewsSlug(null);
      setSelectedMeetingCode(null);
    } else if (page === 'news') {
      nSlug = slug !== undefined ? slug : null;
      setSelectedNewsSlug(nSlug);
      setSelectedProgramSlug(null);
      setSelectedEventSlug(null);
      setSelectedMeetingCode(null);
    } else if (page === 'room') {
      mCode = slug !== undefined ? slug : null;
      setSelectedMeetingCode(mCode);
      setSelectedProgramSlug(null);
      setSelectedEventSlug(null);
      setSelectedNewsSlug(null);
    } else {
      setSelectedProgramSlug(null);
      setSelectedEventSlug(null);
      setSelectedNewsSlug(null);
      setSelectedMeetingCode(null);
      pSlug = null;
      eSlug = null;
      nSlug = null;
      mCode = null;
    }

    if (typeof window !== 'undefined') {
      const targetUrl = getPathForPage(page, pSlug, eSlug, nSlug, mCode);
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }
    }
  };

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [isLoadingPublicData, setIsLoadingPublicData] = useState<boolean>(true);

  // Real-time Sync State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState<number>(0);
  const [unreadContactsCount, setUnreadContactsCount] = useState<number>(0);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const triggerRealtimeSync = async (forceFullRefresh: boolean | any = false) => {
    const isExplicit = forceFullRefresh === true;
    if (isExplicit) {
      setIsSyncing(true);
    }
    try {
      // Only re-fetch full public collections when explicitly requested by admin
      if (isExplicit) {
        await refreshData();
      }
      // Lightweight background badge counters
      if (currentUser) {
        const token = localStorage.getItem('ng_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/analytics', { headers, credentials: 'include' });
        if (res.ok) {
          const stats = await res.json();
          if (typeof stats.pendingApplications === 'number') {
            setPendingApplicationsCount(stats.pendingApplications);
          }
          if (typeof stats.unreadInquiries === 'number') {
            setUnreadContactsCount(stats.unreadInquiries);
          }
        }
      }
      setLastSyncTime(new Date());
    } catch {
      // ignore
    } finally {
      if (isExplicit) {
        setIsSyncing(false);
      }
    }
  };

  // Background Notification Badge Poller (quiet, non-destructive every 25 seconds)
  useEffect(() => {
    if (!currentUser) return;
    triggerRealtimeSync(false);

    const interval = setInterval(() => {
      triggerRealtimeSync(false);
    }, 25000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Fetch Public Data
  const refreshData = async () => {
    try {
      const [settingsRes, programsRes, eventsRes, newsRes, teamRes, galleryRes] = await Promise.all([
        fetch('/api/settings').then(r => r.json()).catch(() => null),
        fetch('/api/programs').then(r => r.json()).catch(() => []),
        fetch('/api/events').then(r => r.json()).catch(() => []),
        fetch('/api/news').then(r => r.json()).catch(() => []),
        fetch('/api/team').then(r => r.json()).catch(() => []),
        fetch('/api/gallery').then(r => r.json()).catch(() => [])
      ]);

      if (settingsRes) setSettings(settingsRes);
      if (Array.isArray(programsRes)) setPrograms(programsRes);
      if (Array.isArray(eventsRes)) setEvents(eventsRes);
      if (Array.isArray(newsRes)) setNews(newsRes);
      if (Array.isArray(teamRes)) setTeam(teamRes);
      if (Array.isArray(galleryRes)) setGallery(galleryRes);
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setIsLoadingPublicData(false);
    }
  };

  // Check Auth Session
  const checkSession = async () => {
    setIsLoadingAuth(true);
    try {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('ng_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/auth/session', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkSession();
    refreshData();
  }, []);

  // Automatically log out immediately if backend rejects a session with 401 (revoked/expired)
  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('ng_token');
      setAuthToken(null);
      setCurrentUser(prev => {
        if (prev) {
          addToast('Your admin session expired or was revoked. Please sign in again.', 'error');
        }
        return null;
      });
      setActivePageState(prev => (prev === 'admin' ? 'admin-login' : prev));
    };

    window.addEventListener('ng:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('ng:unauthorized', handleUnauthorized);
  }, []);

  // Idle Inactivity Auto-Logout (30 minutes of inactivity while logged into Admin)
  useEffect(() => {
    if (!currentUser || activePage !== 'admin') return;

    const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout>;
    let lastReset = Date.now();

    const triggerIdleLogout = async () => {
      try {
        const token = localStorage.getItem('ng_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetch('/api/auth/logout', { method: 'POST', headers, credentials: 'include' });
      } catch {
        // ignore
      }
      localStorage.removeItem('ng_token');
      setAuthToken(null);
      setCurrentUser(null);
      addToast('Signed out automatically after 30 minutes of inactivity for security.', 'info');
      setActivePage('admin-login');
    };

    const resetTimer = () => {
      const now = Date.now();
      if (now - lastReset < 5000) return; // Throttle event churn
      lastReset = now;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(triggerIdleLogout, IDLE_TIMEOUT_MS);
    };

    idleTimer = setTimeout(triggerIdleLogout, IDLE_TIMEOUT_MS);
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
    events.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));

    return () => {
      clearTimeout(idleTimer);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [currentUser, activePage]);

  const updateCurrentUser = (user: User) => {
    setCurrentUser(user);
  };

  const login = async (username: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Login failed. Please verify your credentials.';
        addToast(errMsg, 'error');
        return {
          ok: false,
          error: errMsg,
          retryAfterSeconds: typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
          attemptsRemaining: typeof data.attemptsRemaining === 'number' ? data.attemptsRemaining : undefined
        };
      }

      if (data.requires2FA && data.temp2faToken) {
        return {
          ok: true,
          requires2FA: true,
          temp2faToken: data.temp2faToken,
          userPreview: data.userPreview
        };
      }

      setAuthToken(data.token);
      localStorage.setItem('ng_token', data.token);
      setCurrentUser(data.user);
      addToast(`Welcome back, ${data.user.name}!`, 'success');
      setActivePage('admin');
      return { ok: true };
    } catch (err: any) {
      const errMsg = err.message || 'Connection error';
      addToast(errMsg, 'error');
      return { ok: false, error: errMsg };
    }
  };

  const verifyTwoFactorLogin = async (temp2faToken: string, code: string): Promise<LoginResult> => {
    try {
      const res = await fetch('/api/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp2faToken, code }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Invalid verification code.';
        addToast(errMsg, 'error');
        return {
          ok: false,
          error: errMsg,
          expired: Boolean(data.expired),
          attemptsRemaining: typeof data.attemptsRemaining === 'number' ? data.attemptsRemaining : undefined
        };
      }

      setAuthToken(data.token);
      localStorage.setItem('ng_token', data.token);
      setCurrentUser(data.user);
      if (data.usedBackupCode) {
        addToast(
          `Signed in with backup recovery code (${data.backupCodesRemaining ?? 0} remaining).`,
          'info'
        );
      } else {
        addToast(`Welcome back, ${data.user.name}!`, 'success');
      }
      setActivePage('admin');
      return { ok: true };
    } catch (err: any) {
      const errMsg = err.message || 'Connection error';
      addToast(errMsg, 'error');
      return { ok: false, error: errMsg };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('ng_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch('/api/auth/logout', { method: 'POST', headers, credentials: 'include' });
    } catch {
      // ignore
    }
    localStorage.removeItem('ng_token');
    setAuthToken(null);
    setCurrentUser(null);
    addToast('You have been securely logged out.', 'info');
    setActivePage('home');
  };

  return (
    <AppContext.Provider
      value={{
        activePage,
        setActivePage,
        adminTab,
        setAdminTab,
        selectedProgramSlug,
        setSelectedProgramSlug,
        selectedEventSlug,
        setSelectedEventSlug,
        selectedNewsSlug,
        setSelectedNewsSlug,
        selectedMeetingCode,
        setSelectedMeetingCode,
        currentUser,
        authToken,
        login,
        verifyTwoFactorLogin,
        updateCurrentUser,
        logout,
        isLoadingAuth,
        toasts,
        addToast,
        removeToast,
        settings,
        programs,
        events,
        news,
        team,
        gallery,
        isLoadingPublicData,
        refreshData,
        isSyncing,
        lastSyncTime,
        pendingApplicationsCount,
        unreadContactsCount,
        triggerRealtimeSync
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
