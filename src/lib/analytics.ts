// Client-Side Real-time Visitor & Analytics Tracker for NexGen Council
// Tracks real visitor sessions, acquisition source, viewport/environment, and route dwell duration.

const SESSION_KEY = 'nexgen_visitor_session';
const VISITOR_KEY = 'nexgen_visitor_id';
const VISITOR_SEEN_KEY = 'nexgen_visitor_first_seen';
const SESSION_RETURNING_KEY = 'nexgen_session_is_returning';
const SESSION_UTM_KEY = 'nexgen_session_utm';

interface UtmAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

let activeTrackedPath = '';
let activePathStartedAt = Date.now();
let lastHeartbeatFlushedAt = Date.now();
let lastTrackedSignature = '';
let lastTrackedTime = 0;

function getOrCreateSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'ses_' + Math.random().toString(36).substring(2, 9);
  }
}

function getOrCreateVisitorIdentity(): { visitorId: string; isReturning: boolean } {
  try {
    // Check if returning status was already locked for this browser session
    const cachedReturning = sessionStorage.getItem(SESSION_RETURNING_KEY);
    let vid = localStorage.getItem(VISITOR_KEY);
    const firstSeen = localStorage.getItem(VISITOR_SEEN_KEY);

    if (cachedReturning !== null && vid) {
      return { visitorId: vid, isReturning: cachedReturning === '1' };
    }

    const isReturning = Boolean(vid && firstSeen);
    if (!vid) {
      vid = 'vis_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(VISITOR_KEY, vid);
      localStorage.setItem(VISITOR_SEEN_KEY, new Date().toISOString());
    }

    sessionStorage.setItem(SESSION_RETURNING_KEY, isReturning ? '1' : '0');
    return { visitorId: vid, isReturning };
  } catch {
    return { visitorId: getOrCreateSessionId(), isReturning: false };
  }
}

function getUtmAttribution(): UtmAttribution {
  if (typeof window === 'undefined') return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source')?.trim() || undefined;
    const utmMedium = params.get('utm_medium')?.trim() || undefined;
    const utmCampaign = params.get('utm_campaign')?.trim() || undefined;

    if (utmSource || utmMedium || utmCampaign) {
      const data: UtmAttribution = { utmSource, utmMedium, utmCampaign };
      sessionStorage.setItem(SESSION_UTM_KEY, JSON.stringify(data));
      return data;
    }

    const stored = sessionStorage.getItem(SESSION_UTM_KEY);
    if (stored) {
      return JSON.parse(stored) as UtmAttribution;
    }
  } catch {
    // Ignore storage errors
  }
  return {};
}

function classifyTrafficSource(referrer: string | undefined, utm: UtmAttribution): {
  trafficSource: string;
  referrerDomain: string;
} {
  if (utm.utmSource) {
    const srcLower = utm.utmSource.toLowerCase();
    if (/(facebook|instagram|fb|linkedin|twitter|x\.com|whatsapp|tiktok|youtube)/.test(srcLower)) {
      return { trafficSource: 'Social Media', referrerDomain: utm.utmSource };
    }
    if (/(google|bing|yahoo|duckduckgo)/.test(srcLower) && utm.utmMedium === 'organic') {
      return { trafficSource: 'Organic Search', referrerDomain: utm.utmSource };
    }
    return { trafficSource: 'Campaign', referrerDomain: utm.utmSource };
  }

  if (!referrer) {
    return { trafficSource: 'Direct', referrerDomain: 'Direct' };
  }

  try {
    const refUrl = new URL(referrer);
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const refHost = refUrl.hostname.replace(/^www\./, '').toLowerCase();

    if (!refHost || (currentHost && refHost === currentHost.replace(/^www\./, '').toLowerCase())) {
      return { trafficSource: 'Direct', referrerDomain: 'Direct' };
    }

    if (/(google\.|bing\.|yahoo\.|duckduckgo\.|ecosia\.|yandex\.)/.test(refHost)) {
      return { trafficSource: 'Organic Search', referrerDomain: refHost };
    }

    if (/(facebook\.|fb\.|l\.facebook\.|instagram\.|l\.instagram\.|t\.co|twitter\.|x\.com|linkedin\.|youtube\.|youtu\.be|tiktok\.|wa\.me|whatsapp\.)/.test(refHost)) {
      return { trafficSource: 'Social Media', referrerDomain: refHost };
    }

    return { trafficSource: 'External Referral', referrerDomain: refHost };
  } catch {
    return { trafficSource: 'Direct', referrerDomain: 'Direct' };
  }
}

function detectDevice(): string {
  if (typeof window === 'undefined') return 'Desktop';
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  if (/mobile|iphone|android/i.test(ua) && !/tablet|ipad/i.test(ua)) return 'Mobile';
  if (window.innerWidth < 768) return 'Mobile';
  if (window.innerWidth < 1024) return 'Tablet';
  return 'Desktop';
}

function detectBrowser(): string {
  if (typeof window === 'undefined') return 'Chrome';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  return 'Browser';
}

function detectOS(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Other';
}

function getTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function flushDwellDuration(useBeacon = false) {
  if (typeof window === 'undefined' || !activeTrackedPath) return;
  const now = Date.now();
  const elapsedSec = Math.min(300, Math.max(0, Math.round((now - lastHeartbeatFlushedAt) / 1000)));
  if (elapsedSec <= 0) return;

  lastHeartbeatFlushedAt = now;
  const payload = JSON.stringify({
    sessionId: getOrCreateSessionId(),
    path: activeTrackedPath,
    durationDeltaSec: elapsedSec
  });

  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/heartbeat', blob);
      return;
    } catch {
      // fallback to fetch keepalive
    }
  }

  fetch('/api/analytics/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: useBeacon
  }).catch(() => {});
}

export function trackPageView(pagePath?: string) {
  if (typeof window === 'undefined') return;

  const rawPath = pagePath || window.location.pathname || 'home';
  const currentPath = rawPath.trim() || 'home';
  const now = Date.now();

  // Prevent React StrictMode / double-mount duplicate events within 1200ms
  const sig = `${getOrCreateSessionId()}:${currentPath}`;
  if (sig === lastTrackedSignature && now - lastTrackedTime < 1200) {
    return;
  }

  // Flush dwell duration spent on previous route before switching
  if (activeTrackedPath && activeTrackedPath !== currentPath) {
    flushDwellDuration(false);
  }

  lastTrackedSignature = sig;
  lastTrackedTime = now;
  activeTrackedPath = currentPath;
  activePathStartedAt = now;
  lastHeartbeatFlushedAt = now;

  const { visitorId, isReturning } = getOrCreateVisitorIdentity();
  const utm = getUtmAttribution();
  const rawReferrer = document.referrer || undefined;
  const { trafficSource, referrerDomain } = classifyTrafficSource(rawReferrer, utm);
  const isAdmin = currentPath.startsWith('admin') || currentPath.startsWith('/admin');

  const payload = {
    sessionId: getOrCreateSessionId(),
    visitorId,
    isReturning,
    isAdmin,
    path: currentPath,
    referrer: rawReferrer,
    referrerDomain,
    trafficSource,
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    device: detectDevice(),
    browser: detectBrowser(),
    os: detectOS(),
    screenWidth: window.innerWidth,
    screenResolution: window.screen ? `${window.screen.width}x${window.screen.height}` : undefined,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: getTimezone(),
    language: navigator.language || undefined
  };

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

export function initAnalyticsHeartbeat() {
  if (typeof window === 'undefined') return () => {};

  const intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      const currentPath = activeTrackedPath || window.location.pathname || 'home';
      const now = Date.now();
      const elapsedSec = Math.min(60, Math.max(1, Math.round((now - lastHeartbeatFlushedAt) / 1000)));
      lastHeartbeatFlushedAt = now;

      fetch('/api/analytics/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getOrCreateSessionId(),
          path: currentPath,
          durationDeltaSec: elapsedSec
        })
      }).catch(() => {});
    }
  }, 20000);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushDwellDuration(true);
    } else if (document.visibilityState === 'visible') {
      lastHeartbeatFlushedAt = Date.now();
    }
  };

  const handlePageHide = () => {
    flushDwellDuration(true);
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
  };
}
