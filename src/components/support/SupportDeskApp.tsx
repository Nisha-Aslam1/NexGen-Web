import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp, normalizeUserRole } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { SupportConversation, SupportChatMessage } from '../../types.ts';
import { SupportRichText, stripSupportFormattingForPreview } from '../common/SupportRichText.tsx';
import { usePWAInstall, useOnlineStatus } from '../../hooks/usePWAInstall.ts';
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Send,
  ArrowLeft,
  Download,
  WifiOff,
  CheckCircle2,
  RotateCcw,
  MessageCircle,
  Search,
  LogOut,
  ShieldCheck,
  UserCheck,
  Bot,
  Sparkles,
  ExternalLink,
  Mail,
  LayoutDashboard,
  Loader2,
  X,
  Smartphone
} from 'lucide-react';

type DeskFilter = 'all' | 'human' | 'unread' | 'resolved';

const ALLOWED_AGENT_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'VOLUNTEER_MANAGER',
  'CONTENT_MANAGER',
  'COMMUNICATIONS_OFFICER'
];

const QUICK_REPLIES = [
  'Assalam-o-Alaikum! How can the Council Secretariat help you today?',
  'Please share your Application Reference Code (e.g. NG-XXXX) so I can check your status.',
  'Thank you for waiting. Our coordinator has reviewed your request and is updating your record now.',
  'You can also reach us directly via our official Volunteer & Track portals on the website.'
];

function toWhatsAppLink(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(660, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.14);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 500);
  } catch {}
}

function sortConversations(list: SupportConversation[]): SupportConversation[] {
  return [...list].sort((a, b) => {
    const aScore = (a.unreadByAgent || 0) > 0 ? 3 : a.mode === 'human' && a.status !== 'resolved' ? 2 : a.escalatedToHuman ? 1 : 0;
    const bScore = (b.unreadByAgent || 0) > 0 ? 3 : b.mode === 'human' && b.status !== 'resolved' ? 2 : b.escalatedToHuman ? 1 : 0;
    if (bScore !== aScore) return bScore - aScore;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function mergeConversationList(prev: SupportConversation[], incoming: SupportConversation): SupportConversation[] {
  const idx = prev.findIndex(c => c.id === incoming.id || c.sessionId === incoming.sessionId);
  if (idx === -1) {
    return sortConversations([incoming, ...prev]);
  }
  const next = [...prev];
  next[idx] = incoming;
  return sortConversations(next);
}

export const SupportDeskApp: React.FC = () => {
  const { currentUser, authToken, isLoadingAuth, login, verifyTwoFactorLogin, logout, setActivePage, addToast } = useApp();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Login State for Staff Sign-In inside the Mobile App
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [temp2faToken, setTemp2faToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Support Conversations State
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeskFilter>('all');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Realtime & Notifications State
  const [wsConnected, setWsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [typingSessions, setTypingSessions] = useState<Record<string, boolean>>({});
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const soundEnabledRef = useRef(soundEnabled);
  const selectedIdRef = useRef(selectedId);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const userRole = normalizeUserRole(currentUser?.role);
  const isAuthorizedAgent = Boolean(currentUser && ALLOWED_AGENT_ROLES.includes(userRole));

  const fetchConversations = useCallback(async () => {
    if (!isAuthorizedAgent) return;
    setLoadingConvs(true);
    try {
      const res = await authFetch('/api/support-live/conversations');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.conversations)) {
          setConversations(sortConversations(data.conversations));
        }
      }
    } catch {
      // silent refresh error
    } finally {
      setLoadingConvs(false);
    }
  }, [isAuthorizedAgent]);

  const triggerDeviceNotification = useCallback(
    async (title: string, body: string, targetConvId?: string) => {
      if (soundEnabledRef.current) {
        playNotificationChime();
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([160, 70, 160]);
        } catch {}
      }

      if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
        return;
      }

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && typeof reg.showNotification === 'function') {
            await reg.showNotification(title, {
              body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: targetConvId ? `ng-support-${targetConvId}` : 'ng-support-alert',
              data: { url: '/support-desk', conversationId: targetConvId }
            });
            return;
          }
        }
        const notif = new Notification(title, {
          body,
          icon: '/pwa-192x192.png',
          tag: targetConvId ? `ng-support-${targetConvId}` : 'ng-support-alert'
        });
        notif.onclick = () => {
          window.focus();
          if (targetConvId) setSelectedId(targetConvId);
          notif.close();
        };
      } catch {}
    },
    []
  );

  // Real-time WebSocket connection for instant visitor alerts & two-way chat sync
  useEffect(() => {
    if (!isAuthorizedAgent) return;
    fetchConversations();

    let closedByUser = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      if (closedByUser) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const tokenParam = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
      const wsUrl = `${proto}//${window.location.host}/ws/support?role=agent${tokenParam}`;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setWsConnected(false);
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        setWsConnected(true);
        fetchConversations();
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload || !payload.type) return;

          if (payload.type === 'support:new_message' || payload.type === 'support:handoff') {
            const conv = payload.conversation as SupportConversation | undefined;
            const msg = payload.message as SupportChatMessage | undefined;
            if (conv) {
              setConversations(prev => mergeConversationList(prev, conv));
            }
            const sender = conv?.visitorName || msg?.senderName || 'Website Visitor';
            const snippet = msg?.text
              ? stripSupportFormattingForPreview(msg.text).slice(0, 110)
              : 'Visitor requested live human support.';
            addToast(`${sender}: ${snippet}`, 'info');
            triggerDeviceNotification(`New message from ${sender}`, snippet, conv?.id);

            // Auto-mark read if coordinator is actively viewing this chat
            if (conv && selectedIdRef.current === conv.id && (conv.unreadByAgent || 0) > 0) {
              authFetch(`/api/support-live/conversations/${conv.id}/read`, { method: 'PATCH' }).catch(() => {});
            }
          } else if (payload.type === 'support:agent_reply' || payload.type === 'support:conversation_updated') {
            const conv = payload.conversation as SupportConversation | undefined;
            if (conv) {
              setConversations(prev => mergeConversationList(prev, conv));
            }
          } else if (payload.type === 'support:visitor_typing') {
            const sid = payload.sessionId || payload.conversationId;
            const isTyping = Boolean(payload.isTyping);
            if (sid) {
              setTypingSessions(prev => ({ ...prev, [sid]: isTyping }));
              if (isTyping) {
                if (typingTimersRef.current[sid]) {
                  clearTimeout(typingTimersRef.current[sid]);
                }
                typingTimersRef.current[sid] = setTimeout(() => {
                  setTypingSessions(prev => ({ ...prev, [sid]: false }));
                }, 4000);
              }
            }
          } else if (payload.type === 'support:new_ticket') {
            const contact = payload.contact;
            if (contact) {
              addToast(`New Support Form ticket from ${contact.name}`, 'info');
              triggerDeviceNotification(
                `Support Ticket: ${contact.name}`,
                contact.subject || contact.message?.slice(0, 90) || 'New ticket submitted'
              );
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByUser) {
          attempts += 1;
          const delay = Math.min(10000, 1200 * attempts);
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connect();

    // Resilient polling fallback whenever reverse proxies delay or close WebSockets
    const pollTimer = setInterval(() => {
      if (!closedByUser && (!ws || ws.readyState !== WebSocket.OPEN)) {
        fetchConversations();
      }
    }, 6000);

    return () => {
      closedByUser = true;
      clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };
  }, [isAuthorizedAgent, authToken, fetchConversations, addToast, triggerDeviceNotification]);

  const selectedConversation = useMemo(
    () => conversations.find(c => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  const isVisitorTyping = useMemo(() => {
    if (!selectedConversation) return false;
    return Boolean(
      typingSessions[selectedConversation.sessionId] ||
      typingSessions[selectedConversation.id]
    );
  }, [selectedConversation, typingSessions]);

  // Scroll chat to newest message whenever selected chat updates
  useEffect(() => {
    if (selectedConversation) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedConversation?.messages?.length, selectedConversation?.id]);

  // Mark conversation read on open
  const handleSelectConversation = async (conv: SupportConversation) => {
    setSelectedId(conv.id);
    if ((conv.unreadByAgent || 0) > 0) {
      setConversations(prev =>
        prev.map(c => (c.id === conv.id ? { ...c, unreadByAgent: 0 } : c))
      );
      try {
        await authFetch(`/api/support-live/conversations/${conv.id}/read`, { method: 'PATCH' });
      } catch {}
    }
  };

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      addToast('Browser push notifications are not supported on this device.', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      playNotificationChime();
      addToast('Mobile notifications enabled! You will be alerted when visitors message.', 'success');
    } else {
      addToast('Notifications blocked. Allow notifications in browser/app settings.', 'error');
    }
  };

  const handleSendReply = async (overrideText?: string) => {
    const cleanText = (overrideText ?? replyText).trim();
    if (!selectedConversation || !cleanText || sendingReply) return;

    if (!overrideText) setReplyText('');
    setSendingReply(true);
    try {
      const res = await authFetch(`/api/support-live/conversations/${selectedConversation.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not send reply.');
      }
      if (data.conversation) {
        setConversations(prev => mergeConversationList(prev, data.conversation));
      }
    } catch (err: any) {
      if (!overrideText) setReplyText(cleanText);
      addToast(err?.message || 'Failed to deliver reply.', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleToggleResolve = async () => {
    if (!selectedConversation) return;
    const nextStatus = selectedConversation.status === 'resolved' ? 'open' : 'resolved';
    try {
      const res = await authFetch(`/api/support-live/conversations/${selectedConversation.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.conversation) {
        setConversations(prev => mergeConversationList(prev, data.conversation));
        addToast(nextStatus === 'resolved' ? 'Conversation marked resolved.' : 'Conversation reopened.', 'success');
      }
    } catch {
      addToast('Could not update status.', 'error');
    }
  };

  const handleAssignConversation = async (agentName: string) => {
    if (!selectedConversation || !agentName) return;
    try {
      const res = await authFetch(`/api/support-live/conversations/${selectedConversation.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.conversation) {
        setConversations(prev => mergeConversationList(prev, data.conversation));
        addToast(`Assigned conversation to ${agentName}`, 'success');
      }
    } catch {
      addToast('Could not assign conversation.', 'error');
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await login(username.trim(), password);
      if (res.requires2FA && res.temp2faToken) {
        setTemp2faToken(res.temp2faToken);
      } else if (!res.ok) {
        setLoginError(res.error || 'Invalid credentials.');
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!temp2faToken) return;
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await verifyTwoFactorLogin(temp2faToken, twoFactorCode.trim());
      if (!res.ok) {
        setLoginError(res.error || 'Invalid verification code.');
        if (res.expired) setTemp2faToken(null);
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const counts = useMemo(() => {
    let unread = 0;
    let human = 0;
    let resolved = 0;
    for (const c of conversations) {
      unread += c.unreadByAgent || 0;
      if (c.mode === 'human' || c.escalatedToHuman) human += 1;
      if (c.status === 'resolved') resolved += 1;
    }
    return { all: conversations.length, unread, human, resolved };
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(c => {
      if (filter === 'human' && c.mode !== 'human' && !c.escalatedToHuman) return false;
      if (filter === 'unread' && (c.unreadByAgent || 0) === 0) return false;
      if (filter === 'resolved' && c.status !== 'resolved') return false;
      if (!q) return true;
      return (
        (c.visitorName || '').toLowerCase().includes(q) ||
        (c.visitorEmail || '').toLowerCase().includes(q) ||
        (c.visitorWhatsapp || '').toLowerCase().includes(q) ||
        c.sessionId.toLowerCase().includes(q) ||
        (c.messages || []).some(m => m.text.toLowerCase().includes(q))
      );
    });
  }, [conversations, filter, search]);

  const renderInstallButton = () => {
    if (isInstalled) return null;
    if (isInstallable) {
      return (
        <button
          type="button"
          onClick={install}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      );
    }
    if (isIOS) {
      return (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-amber-300" />
          <span>Add to Home</span>
        </button>
      );
    }
    return null;
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
          <span className="text-xs font-medium text-slate-300">Loading NexGen Support Desk...</span>
        </div>
      </div>
    );
  }

  // Staff Login Gate when not authenticated
  if (!isAuthorizedAgent) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-center justify-between max-w-md w-full mx-auto pt-2">
          <div className="flex items-center gap-2.5">
            <img src="/pwa-192x192.png" alt="NexGen Desk" className="w-9 h-9 rounded-xl bg-white/10 p-1 object-contain" />
            <div>
              <h1 className="font-serif font-bold text-sm leading-tight">NexGen Live Support Desk</h1>
              <p className="text-[11px] text-slate-400">Mobile Coordinator Console</p>
            </div>
          </div>
          {renderInstallButton()}
        </div>

        <div className="max-w-md w-full mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 my-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-amber-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-white">Coordinator Sign In</h2>
              <p className="text-xs text-slate-400">Authenticate to receive live widget alerts & reply.</p>
            </div>
          </div>

          {currentUser && !isAuthorizedAgent && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-200">
              Your account role ({currentUser.role}) does not have Support Desk messaging access.
            </div>
          )}

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-700 text-xs text-rose-200">
              {loginError}
            </div>
          )}

          {temp2faToken ? (
            <form onSubmit={handleVerify2FA} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Google Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loginBusy}
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm cursor-pointer disabled:opacity-50"
              >
                {loginBusy ? 'Verifying...' : 'Verify & Open Support Desk'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Staff Username or Email
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loginBusy}
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm cursor-pointer disabled:opacity-50"
              >
                {loginBusy ? 'Signing In...' : 'Sign In to Live Support App'}
              </button>
            </form>
          )}
        </div>

        <div className="text-center pb-2">
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            ← Back to Public Website
          </button>
        </div>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 text-white space-y-3">
              <h3 className="font-serif text-lg font-bold">Install on iPhone / iPad</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100 overflow-hidden select-none sm:select-text">
      {/* Top Mobile App Bar */}
      <header className="bg-indigo-950 text-white px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 border-b border-indigo-900 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/pwa-192x192.png"
            alt="NexGen Support Desk"
            className="w-8 h-8 rounded-xl bg-white/10 p-0.5 object-contain shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-bold text-sm sm:text-base truncate">NexGen Live Support</h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  wsConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {wsConnected ? 'Live' : 'Syncing'}
              </span>
            </div>
            <p className="text-[11px] text-indigo-200 truncate">
              {currentUser?.name} · {counts.unread > 0 ? `${counts.unread} unread` : 'All caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {renderInstallButton()}

          {notifPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={handleRequestNotifications}
              title={notifPermission === 'granted' ? 'Notifications active' : 'Enable phone/browser alerts'}
              className={`p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                notifPermission === 'granted'
                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
              }`}
            >
              {notifPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              <span className="hidden md:inline">
                {notifPermission === 'granted' ? 'Alerts On' : 'Enable Alerts'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            aria-label={soundEnabled ? 'Mute alert chime' : 'Unmute alert chime'}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>



          <button
            type="button"
            onClick={() => setActivePage('admin')}
            title="Open Full Admin Panel"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer hidden sm:flex items-center gap-1 text-xs font-semibold"
          >
            <LayoutDashboard className="w-4 h-4 text-amber-300" />
            <span>Admin</span>
          </button>

          <button
            type="button"
            onClick={logout}
            title="Sign Out"
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Responsive Split Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Pane: Conversation List */}
        <aside
          className={`${
            selectedConversation ? 'hidden md:flex' : 'flex'
          } w-full md:w-[360px] lg:w-[400px] flex-col bg-white border-r border-slate-200 min-h-0`}
        >
          {/* Search + Filter Strip */}
          <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search visitor name, email, WhatsApp..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  { id: 'all', label: `All (${counts.all})` },
                  { id: 'human', label: `Live Human (${counts.human})` },
                  { id: 'unread', label: `Unread (${counts.unread})` },
                  { id: 'resolved', label: `Resolved (${counts.resolved})` }
                ] as { id: DeskFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    filter === tab.id
                      ? 'bg-indigo-950 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConvs && conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading support threads...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-800">No Active Conversations</p>
                <p className="text-xs text-slate-500">
                  When a visitor clicks "Live Human" in the website support widget, it will appear here immediately with an alert.
                </p>
              </div>
            ) : (
              filteredConversations.map(conv => {
                const lastMsg = conv.messages?.[conv.messages.length - 1];
                const unreadCount = conv.unreadByAgent || 0;
                const isSelected = selectedId === conv.id;
                const displayName = conv.visitorName || `Visitor (${conv.sessionId.slice(-5)})`;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => handleSelectConversation(conv)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-indigo-50/90' : unreadCount > 0 ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-indigo-950 text-amber-300 font-bold text-sm flex items-center justify-center shrink-0">
                      {displayName.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">{displayName}</span>
                        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                          {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {conv.mode === 'human' && conv.status !== 'resolved' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                            LIVE HUMAN
                          </span>
                        )}
                        {conv.assignedAgentName && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[9px] font-bold">
                            {conv.assignedAgentName}
                          </span>
                        )}
                        {conv.status === 'resolved' && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[9px] font-bold">
                            RESOLVED
                          </span>
                        )}
                        {conv.visitorWhatsapp && (
                          <span className="text-[10px] text-slate-500 truncate">{conv.visitorWhatsapp}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-slate-600 truncate">
                          {typingSessions[conv.sessionId] || typingSessions[conv.id] ? (
                            <span className="text-emerald-700 font-bold inline-flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce" />
                              <span>Typing...</span>
                            </span>
                          ) : lastMsg ? (
                            stripSupportFormattingForPreview(lastMsg.text)
                          ) : (
                            'No messages yet'
                          )}
                        </p>
                        {unreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Pane: Live Messenger Chat View */}
        <main
          className={`${
            selectedConversation ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col bg-slate-50 min-w-0 min-h-0`}
        >
          {!selectedConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-950/10 text-indigo-900 flex items-center justify-center">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="font-serif text-lg font-bold text-slate-900">Select a Conversation</h2>
              <p className="text-xs text-slate-600 max-w-sm">
                Tap any visitor message on the left to view their full history and reply directly to their live website widget chat.
              </p>
            </div>
          ) : (
            <>
              {/* Active Chat Header */}
              <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Back to inbox"
                    className="md:hidden p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-sm text-slate-900 truncate">
                        {selectedConversation.visitorName || `Visitor (${selectedConversation.sessionId.slice(-5)})`}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          selectedConversation.status === 'resolved'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {selectedConversation.status === 'resolved' ? 'Resolved' : 'Active'}
                      </span>
                      {selectedConversation.assignedAgentName ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-900">
                          Assigned: {selectedConversation.assignedAgentName}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 border border-amber-300 text-amber-900 animate-pulse">
                          Unassigned · First to reply gets assigned
                        </span>
                      )}
                      {isVisitorTyping && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-bold animate-pulse shadow-2xs">
                          <span className="flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce" />
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.15s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:0.3s]" />
                          </span>
                          <span>Visitor is typing...</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                      {selectedConversation.visitorEmail && (
                        <a
                          href={`mailto:${selectedConversation.visitorEmail}`}
                          className="inline-flex items-center gap-1 hover:text-indigo-700"
                        >
                          <Mail className="w-3 h-3" />
                          <span>{selectedConversation.visitorEmail}</span>
                        </a>
                      )}
                      {selectedConversation.visitorWhatsapp && (
                        <a
                          href={toWhatsAppLink(selectedConversation.visitorWhatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>WhatsApp: {selectedConversation.visitorWhatsapp}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedConversation.assignedAgentName || ''}
                    onChange={e => handleAssignConversation(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-600 hidden sm:block"
                  >
                    <option value="">Assign to Coordinator...</option>
                    <option value={currentUser?.name || 'Coordinator'}>Assign to Me ({currentUser?.name})</option>
                    <option value="Secretariat Team">Secretariat Team</option>
                    <option value="Volunteer Directorate">Volunteer Directorate</option>
                    <option value="Tech Support Desk">Tech Support Desk</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleToggleResolve}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      selectedConversation.status === 'resolved'
                        ? 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {selectedConversation.status === 'resolved' ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reopen</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolve</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Chat Transcript */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
                {(selectedConversation.messages || []).map(msg => {
                  const isVisitor = msg.role === 'user';
                  const isHumanAgent = msg.role === 'agent';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isVisitor ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        {isVisitor ? (
                          <span className="text-[10px] font-bold text-slate-600">
                            {msg.senderName || selectedConversation.visitorName || 'Visitor'}
                          </span>
                        ) : isHumanAgent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                            <UserCheck className="w-3 h-3" />
                            {msg.senderName || 'Coordinator (You)'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700">
                            <Bot className="w-3 h-3" />
                            AI Assistant
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-0.5">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isHumanAgent && (
                            <span
                              className="inline-flex items-center ml-1"
                              title={msg.isRead ? `Read by visitor at ${new Date(msg.readAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Delivered to visitor widget'}
                            >
                              {msg.isRead ? (
                                <span className="text-sky-500 font-bold text-[11px] tracking-tight" aria-label="Read">✓✓</span>
                              ) : (
                                <span className="text-slate-400 font-medium text-[11px]" aria-label="Delivered">✓</span>
                              )}
                            </span>
                          )}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm ${
                          isVisitor
                            ? 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-2xs'
                            : isHumanAgent
                            ? 'bg-indigo-950 text-white rounded-br-sm shadow-sm'
                            : 'bg-indigo-50 border border-indigo-200 text-slate-800 rounded-br-sm'
                        }`}
                      >
                        {isVisitor || isHumanAgent ? (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        ) : (
                          <SupportRichText text={msg.text} variant="light" />
                        )}
                      </div>
                    </div>
                  );
                })}

                {isVisitorTyping && (
                  <div className="flex flex-col items-start animate-fade-in pt-1">
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-bold text-emerald-700">
                        {selectedConversation.visitorName || 'Visitor'}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium">is typing...</span>
                    </div>
                    <div className="bg-white border border-emerald-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-2xs inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.3s]" />
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Quick Canned Replies */}
              <div className="px-3 pt-2 pb-1 bg-white border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto">
                {QUICK_REPLIES.map((qr, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendReply(qr)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 border border-slate-200 text-[11px] font-medium text-slate-700 whitespace-nowrap cursor-pointer shrink-0"
                  >
                    {qr.slice(0, 42)}...
                  </button>
                ))}
              </div>

              {/* Reply Input Composer */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendReply();
                }}
                className="p-3 bg-white flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  disabled={sendingReply}
                  placeholder="Type a live reply to website visitor..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4 text-amber-300" />
                  <span className="hidden sm:inline">Send Reply</span>
                </button>
              </form>
            </>
          )}
        </main>
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline — Waiting to reconnect</span>
        </div>
      )}

      {/* iOS Safari Install Guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold">Install on iPhone / iPad</h3>
              <button type="button" onClick={() => setShowIOSGuide(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              1. Tap the <strong>Share</strong> button in Safari toolbar.<br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-950 text-white font-bold text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
