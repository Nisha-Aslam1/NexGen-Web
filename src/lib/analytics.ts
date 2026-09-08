// Client-Side Real-time Visitor & Analytics Tracker for NexGen Council
// Backed directly by MongoDB analytics_events & active_visitors collections

function getOrCreateSessionId(): string {
  try {
    let sid = sessionStorage.getItem('nexgen_visitor_session');
    if (!sid) {
      sid = 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('nexgen_visitor_session', sid);
    }
    return sid;
  } catch {
    return 'ses_' + Math.random().toString(36).substring(2, 9);
  }
}

function detectDevice(): string {
  if (typeof window === 'undefined') return 'Desktop';
  const ua = navigator.userAgent;
  if (/mobile/i.test(ua)) return 'Mobile';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  if (window.innerWidth < 768) return 'Mobile';
  if (window.innerWidth < 1024) return 'Tablet';
  return 'Desktop';
}

function detectBrowser(): string {
  if (typeof window === 'undefined') return 'Chrome';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  return 'Browser';
}

function detectOS(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  return 'Other';
}

export function trackPageView(pagePath?: string) {
  if (typeof window === 'undefined') return;

  const currentPath = pagePath || window.location.pathname + (window.location.hash || '');
  const payload = {
    sessionId: getOrCreateSessionId(),
    path: currentPath,
    referrer: document.referrer || undefined,
    device: detectDevice(),
    browser: detectBrowser(),
    os: detectOS(),
    screenWidth: window.innerWidth
  };

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

export function initAnalyticsHeartbeat() {
  if (typeof window === 'undefined') return () => {};

  // Track initial page view
  trackPageView();

  const intervalId = window.setInterval(() => {
    // Only send heartbeat if tab is visible
    if (document.visibilityState === 'visible') {
      const currentPath = window.location.pathname + (window.location.hash || '');
      fetch('/api/analytics/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getOrCreateSessionId(),
          path: currentPath
        })
      }).catch(() => {});
    }
  }, 20000);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      trackPageView();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
