import React, { useState, useEffect, useRef } from 'react';
import { useApp, ActivePage } from '../../context/AppContext.tsx';
import { SupportChatMessage } from '../../types.ts';
import { SupportRichText } from '../common/SupportRichText.tsx';
import {
  X,
  Send,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  Phone,
  Mail,
  Compass,
  Clock,
  ArrowUpRight,
  MessageCircle,
  Sparkles,
  RotateCcw,
  UserCheck,
  Loader2,
  Bot,
  Headphones
} from 'lucide-react';

const SUPPORT_SESSION_STORAGE_KEY = 'nexgen_support_ai_session';
const SUPPORT_LIVE_MODE_KEY = 'nexgen_support_live_mode';

function playVisitorReplyChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 450);
  } catch {}
}

const QUICK_FAQS = [
  {
    q: 'Who can apply as a volunteer or cohort scholar?',
    a: 'Women and youth advocates ages 16+ from all academic disciplines and backgrounds can join. No prior experience is required — submit your application on the Volunteer page.'
  },
  {
    q: 'How can I join the 30-Day Leadership & Empowerment Series?',
    a: 'Open the Programs or Volunteer page on the website, choose the active cohort, and complete the registration form. Approved members receive onboarding and live session links via email and WhatsApp.'
  },
  {
    q: 'How do I track my submitted volunteer application?',
    a: 'Go to the Track Application page (or click Track Application below) and enter your Application Reference Code (e.g., NG-XXXX) to see your real-time review status.'
  },
  {
    q: 'Is there any fee to join cohorts, workshops, or volunteer?',
    a: 'No. NexGen Council is a civil-society leadership initiative. Volunteer membership, leadership cohorts, and regular training sessions are 100% free of charge.'
  },
  {
    q: 'Are verified certificates provided after completion?',
    a: 'Yes! Participants who meet the attendance requirement and submit their practical community project receive an official digital certificate from the Secretariat.'
  },
  {
    q: 'How do I join scheduled online meetings or webinars?',
    a: 'Visit the Events page or use the direct Meeting Room link sent to your email. If your session requires waiting room admission, our coordinators admit attendees 5 minutes before start.'
  },
  {
    q: 'Where can I view recent Council updates, events, and photo archives?',
    a: 'You can browse official announcements on the News page, upcoming schedules on Events, and event photography in the Gallery section of this website.'
  },
  {
    q: 'How can universities or organizations partner with NexGen Council?',
    a: 'Select "University / School Partnership" in the Submit Issue tab here (or ask the AI Assistant to connect you) with your institution name and WhatsApp contact for a formal briefing.'
  }
];

const QUICK_NAV_LINKS: { label: string; page: ActivePage }[] = [
  { label: 'About Us', page: 'about' },
  { label: 'Programs', page: 'programs' },
  { label: 'Apply Volunteer', page: 'volunteer' },
  { label: 'Track Status', page: 'track' },
  { label: 'Events', page: 'events' },
  { label: 'Contact Page', page: 'contact' }
];

const AI_STARTER_PROMPTS = [
  'How do I apply as a volunteer?',
  'Programs & verified certificates info',
  'Upcoming events & how to join',
  'Connect me with a human coordinator'
];

function getOrCreateSupportSessionId(forceNew = false): string {
  try {
    if (!forceNew) {
      const existing = localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY);
      if (existing && existing.trim()) return existing;
    }
    const created = `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export const SupportWidget: React.FC = () => {
  const { settings, addToast, setActivePage } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'ticket' | 'faq'>('ai');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // AI + Live Human Chat State (persisted for 7 days on backend)
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSupportSessionId(false));
  const [aiMessages, setAiMessages] = useState<SupportChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<'ai' | 'human'>(() => {
    try {
      return localStorage.getItem(SUPPORT_LIVE_MODE_KEY) === 'human' ? 'human' : 'ai';
    } catch {
      return 'ai';
    }
  });
  const [assignedAgentName, setAssignedAgentName] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<'open' | 'resolved'>('open');
  const [wsConnected, setWsConnected] = useState(false);
  const [unreadHumanReplies, setUnreadHumanReplies] = useState(0);
  const [showHandoffCard, setShowHandoffCard] = useState(false);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [visitorDetails, setVisitorDetails] = useState({ name: '', email: '', whatsapp: '' });
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef(isOpen);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const sendTypingStatus = (typing: boolean) => {
    if (isTypingRef.current === typing) return;
    isTypingRef.current = typing;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'support:visitor_typing',
            sessionId,
            isTyping: typing,
            visitorName: visitorDetails.name.trim() || undefined
          })
        );
        return;
      } catch {}
    }

    fetch('/api/support-live/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        isTyping: typing,
        visitorName: visitorDetails.name.trim() || undefined
      })
    }).catch(() => {});
  };

  const handleChatInputChange = (val: string) => {
    setAiInput(val);
    if (val.trim()) {
      sendTypingStatus(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
      }, 2500);
    } else {
      sendTypingStatus(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setUnreadHumanReplies(0);
      fetch(`/api/support-live/conversations/${encodeURIComponent(sessionId)}/read`, { method: 'PATCH' }).catch(() => {});
    }
  }, [isOpen, sessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(SUPPORT_LIVE_MODE_KEY, chatMode);
    } catch {}
  }, [chatMode]);

  // Direct Human Ticket Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    whatsapp: '',
    subject: 'General Inquiry',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const handleNavigatePage = (page: ActivePage) => {
    setActivePage(page);
    setIsOpen(false);
  };

  // Load saved 7-day chat history when widget opens (or immediately if returning in Live Human mode)
  useEffect(() => {
    if ((!isOpen && chatMode !== 'human') || historyLoaded) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/support-ai/history?sessionId=${encodeURIComponent(sessionId)}`);
        if (res.ok && active) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            setAiMessages(data.messages);
          }
          if (data.mode === 'human' || data.mode === 'ai') {
            setChatMode(data.mode);
          }
          if (data.assignedAgentName) setAssignedAgentName(data.assignedAgentName);
          if (data.status === 'resolved' || data.status === 'open') setChatStatus(data.status);
          if (data.visitorName || data.visitorEmail || data.visitorWhatsapp) {
            setVisitorDetails({
              name: data.visitorName || '',
              email: data.visitorEmail || '',
              whatsapp: data.visitorWhatsapp || ''
            });
          }
        }
      } catch {
        // ignore silent history load errors
      } finally {
        if (active) setHistoryLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen, chatMode, historyLoaded, sessionId]);

  // Real-time WebSocket listener for Live Human Coordinator replies
  useEffect(() => {
    if (!isOpen && chatMode !== 'human') {
      setWsConnected(false);
      return;
    }

    let closedByUser = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = () => {
      if (closedByUser) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/support?role=visitor&sessionId=${encodeURIComponent(sessionId)}`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
      } catch {
        wsRef.current = null;
        setWsConnected(false);
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload || !payload.type) return;

          if (payload.type === 'support:agent_reply' || payload.type === 'support:conversation_updated') {
            const conv = payload.conversation;
            if (conv) {
              if (Array.isArray(conv.messages)) {
                setAiMessages(conv.messages);
              }
              if (conv.mode === 'human' || conv.mode === 'ai') {
                setChatMode(conv.mode);
              }
              if (conv.assignedAgentName) {
                setAssignedAgentName(conv.assignedAgentName);
              }
              if (conv.status === 'resolved' || conv.status === 'open') {
                setChatStatus(conv.status);
              }
            }

            if (payload.type === 'support:agent_reply') {
              playVisitorReplyChime();
              if (!isOpenRef.current) {
                setUnreadHumanReplies(prev => prev + 1);
                addToast(
                  `Live Support reply from ${payload.message?.senderName || 'Coordinator'}`,
                  'info'
                );
              } else {
                fetch(`/api/support-live/conversations/${encodeURIComponent(sessionId)}/read`, { method: 'PATCH' }).catch(() => {});
              }
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setWsConnected(false);
        if (!closedByUser) {
          attempts += 1;
          const delay = Math.min(10000, 1500 * attempts);
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setWsConnected(false);
      };
    };

    connect();

    const pollTimer = setInterval(async () => {
      if (closedByUser || (ws && ws.readyState === WebSocket.OPEN) || chatMode !== 'human') return;
      try {
        const res = await fetch(`/api/support-ai/history?sessionId=${encodeURIComponent(sessionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setAiMessages(prev => {
            if (data.messages.length > prev.length) {
              const latest = data.messages[data.messages.length - 1];
              if (latest?.role === 'agent') {
                playVisitorReplyChime();
                if (!isOpenRef.current) {
                  setUnreadHumanReplies(u => u + 1);
                } else {
                  fetch(`/api/support-live/conversations/${encodeURIComponent(sessionId)}/read`, { method: 'PATCH' }).catch(() => {});
                }
              }
            }
            return data.messages;
          });
        }
        if (data.assignedAgentName) setAssignedAgentName(data.assignedAgentName);
        if (data.status === 'resolved' || data.status === 'open') setChatStatus(data.status);
      } catch {}
    }, 6000);

    return () => {
      closedByUser = true;
      if (wsRef.current === ws) wsRef.current = null;
      clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };
  }, [isOpen, chatMode, sessionId, addToast]);

  useEffect(() => {
    if (isOpen && activeTab === 'ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, aiLoading, isOpen, activeTab]);

  const handleRequestLiveHuman = async (withDetails = false) => {
    if (handoffLoading) return;
    const cleanName = visitorDetails.name.trim();
    if (!cleanName || cleanName.length < 2) {
      setShowHandoffCard(true);
      setAiError('Please enter your full name (at least 2 letters) before connecting to live human coordinators.');
      return;
    }

    setAiError(null);
    setHandoffLoading(true);
    sendTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      const pendingText = aiInput.trim();
      const res = await fetch('/api/support-live/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sessionId,
          name: cleanName,
          email: visitorDetails.email.trim() || undefined,
          whatsapp: visitorDetails.whatsapp.trim() || undefined,
          message: pendingText || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not connect to live human support right now.');
      }
      if (pendingText) setAiInput('');
      setChatMode('human');
      setChatStatus('open');
      setShowHandoffCard(false);
      if (data.conversation && Array.isArray(data.conversation.messages)) {
        setAiMessages(data.conversation.messages);
      }
      addToast('Live Human Support activated! Secretariat coordinators have been notified.', 'success');
    } catch (err: any) {
      setAiError(err?.message || 'Could not connect to live support.');
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleSwitchBackToAi = async () => {
    try {
      const res = await fetch('/api/support-live/switch-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sessionId, mode: 'ai' })
      });
      if (res.ok) {
        setChatMode('ai');
        setShowHandoffCard(false);
      }
    } catch {}
  };

  const handleSendLiveHumanMessage = async (textToSend: string) => {
    const cleanName = visitorDetails.name.trim();
    if (!cleanName || cleanName.length < 2) {
      setShowHandoffCard(true);
      setAiError('Please enter your full name before sending messages to live coordinators.');
      return;
    }

    sendTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setAiError(null);
    setAiInput('');

    const optimisticUserMsg: SupportChatMessage = {
      id: `tmp_u_${Date.now()}`,
      role: 'user',
      senderName: cleanName || undefined,
      text: textToSend,
      timestamp: new Date().toISOString()
    };

    setAiMessages(prev => [...prev, optimisticUserMsg]);
    setAiLoading(true);

    try {
      const res = await fetch('/api/support-live/visitor-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sessionId,
          text: textToSend,
          name: cleanName,
          email: visitorDetails.email.trim() || undefined,
          whatsapp: visitorDetails.whatsapp.trim() || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not deliver message.');
      }
      if (data.conversation && Array.isArray(data.conversation.messages)) {
        setAiMessages(data.conversation.messages);
      }
    } catch (err: any) {
      setAiError(err?.message || 'Unable to deliver live message.');
      setAiMessages(prev => prev.filter(m => m.id !== optimisticUserMsg.id));
      setAiInput(textToSend);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendAiMessage = async (overrideText?: string) => {
    const textToSend = (overrideText ?? aiInput).trim();
    if (!textToSend || aiLoading) return;

    if (chatMode === 'human' && !overrideText) {
      await handleSendLiveHumanMessage(textToSend);
      return;
    }

    if (overrideText === 'Connect me with a human coordinator') {
      if (visitorDetails.name.trim().length >= 2) {
        await handleRequestLiveHuman(true);
      } else {
        setShowHandoffCard(true);
      }
      return;
    }

    sendTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setAiError(null);
    if (!overrideText) setAiInput('');

    const optimisticUserMsg: SupportChatMessage = {
      id: `tmp_u_${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toISOString()
    };

    setAiMessages(prev => [...prev, optimisticUserMsg]);
    setAiLoading(true);

    try {
      const res = await fetch('/api/support-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: textToSend
        })
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Unexpected response from AI service (HTTP ${res.status}).`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'AI Assistant could not process your request right now.');
      }

      if (data.visitorName) {
        setVisitorDetails(d => ({ ...d, name: data.visitorName || d.name }));
      }

      if (data.assignedToHuman) {
        setChatMode('human');
        setShowHandoffCard(false);
        addToast('Connected to Live Human Support! Secretariat coordinators alerted.', 'success');
      }

      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setAiMessages(data.messages);
      } else {
        setAiMessages(prev => [
          ...prev,
          {
            id: `tmp_a_${Date.now()}`,
            role: 'assistant',
            text: data.reply || 'Thank you for reaching out.',
            timestamp: new Date().toISOString(),
            escalatedTicketId: data.escalatedTicket?.id
          }
        ]);
      }

      if (data.escalatedTicket?.id) {
        addToast('Your issue has been forwarded to the Council Secretariat!', 'success');
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unable to reach AI Concierge right now.';
      setAiError(errMsg);
      // Roll back optimistic user message if failed so user can retry or use Human Ticket tab
      setAiMessages(prev => prev.filter(m => m.id !== optimisticUserMsg.id));
      if (!overrideText) setAiInput(textToSend);
    } finally {
      setAiLoading(false);
    }
  };

  const handleStartNewAiChat = () => {
    const newSid = getOrCreateSupportSessionId(true);
    setSessionId(newSid);
    setAiMessages([]);
    setAiError(null);
    setChatMode('ai');
    setAssignedAgentName(null);
    setChatStatus('open');
    setShowHandoffCard(false);
    setHistoryLoaded(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    const cleanEmail = formData.email.trim();
    const cleanWhatsapp = formData.whatsapp.trim();
    const cleanMessage = formData.message.trim();
    const whatsappDigits = cleanWhatsapp.replace(/\D/g, '');

    if (!cleanName || !cleanEmail || !cleanWhatsapp || !cleanMessage) {
      addToast('Please fill out all required fields including your WhatsApp number.', 'error');
      return;
    }

    if (whatsappDigits.length < 7) {
      addToast('Please enter a valid WhatsApp number with country code (at least 7 digits).', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/support-widget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanWhatsapp,
          whatsapp: cleanWhatsapp,
          subject: formData.subject,
          message: cleanMessage,
          source: 'Support Widget',
          channel: 'support_widget'
        })
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          `API returned HTML instead of JSON (HTTP ${res.status}). Check /api/contact route.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to submit your issue.');
      }

      setSubmittedSuccess(true);
      addToast('Your support request has been sent to the Council Secretariat.', 'success');
      setFormData({
        name: '',
        email: '',
        whatsapp: '',
        subject: 'General Inquiry',
        message: ''
      });
    } catch (err: any) {
      addToast(err.message || 'Error submitting support ticket.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-[345px] sm:w-[410px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all">
          {/* Header */}
          <div className="bg-slate-900 p-4 sm:p-5 text-white border-b border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <picture>
                  <source srcSet="/logo.webp" type="image/webp" />
                  <img
                    src="/logo.png"
                    alt="NexGen Council"
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.fallbackApplied) {
                        img.dataset.fallbackApplied = '1';
                        img.style.display = 'none';
                      }
                    }}
                    className="h-10 w-10 rounded-full bg-white/10 p-1 object-cover border border-amber-400/40"
                  />
                </picture>
                <div>
                  <h3 className="font-serif text-base font-bold leading-tight">
                    NexGen Support Desk
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>AI Guide, Website Info &amp; Human Secretariat</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Support Widget"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 3-Mode Tabs */}
            <div className="mt-3.5 grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 transition-all cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Live &amp; AI Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ticket')}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 transition-all cursor-pointer ${
                  activeTab === 'ticket'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Human Form</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('faq')}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 transition-all cursor-pointer ${
                  activeTab === 'faq'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>FAQs</span>
              </button>
            </div>
          </div>

          {/* Body */}
          {activeTab === 'ai' ? (
            <div className="flex flex-col h-[440px] bg-slate-50/70">
              {/* Sub-header Bar with Live Human Switch */}
              <div className="px-3.5 py-2 bg-white border-b border-slate-200/80 flex items-center justify-between gap-2 text-[11px]">
                {chatMode === 'human' ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-bold text-emerald-800 truncate">
                      {assignedAgentName ? `Live: ${assignedAgentName}` : 'Live Human Support'}
                    </span>
                    {!wsConnected && (
                      <span className="text-[10px] text-amber-700 font-medium">(Syncing)</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-600 font-medium truncate">AI Guide · 7d Memory</span>
                )}

                <div className="flex items-center gap-2 shrink-0">
                  {chatMode === 'human' ? (
                    <button
                      type="button"
                      onClick={handleSwitchBackToAi}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                    >
                      <Bot className="w-3 h-3 text-indigo-700" />
                      <span>AI Mode</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (visitorDetails.name.trim().length >= 2) {
                          handleRequestLiveHuman(true);
                        } else {
                          setShowHandoffCard(true);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs cursor-pointer"
                    >
                      <Headphones className="w-3 h-3" />
                      <span>Live Human</span>
                    </button>
                  )}

                  {aiMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleStartNewAiChat}
                      title="Start new conversation"
                      className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-950 font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>New</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Mandatory Name Before Starting Live Human Support Card */}
              {showHandoffCard && (
                <div className="p-3.5 bg-emerald-50 border-b border-emerald-200 space-y-2.5 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Headphones className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                          <span>Connect to Live Coordinator</span>
                        </p>
                        <p className="text-[11px] text-emerald-800 leading-snug">
                          Coordinators receive live alerts. Enter your full name below to start chat:
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowHandoffCard(false)}
                      className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg hover:bg-emerald-100/60 cursor-pointer"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRequestLiveHuman(true);
                    }}
                    className="space-y-2"
                  >
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-1">
                        Your Full Name <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={visitorDetails.name}
                        onChange={e => setVisitorDetails(d => ({ ...d, name: e.target.value }))}
                        placeholder="Enter your name (required)"
                        className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-emerald-800 mb-0.5">
                          WhatsApp (recommended)
                        </label>
                        <input
                          type="tel"
                          value={visitorDetails.whatsapp}
                          onChange={e => setVisitorDetails(d => ({ ...d, whatsapp: e.target.value }))}
                          placeholder="+92 300 1234567"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-[11px] text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-emerald-800 mb-0.5">
                          Email (optional)
                        </label>
                        <input
                          type="email"
                          value={visitorDetails.email}
                          onChange={e => setVisitorDetails(d => ({ ...d, email: e.target.value }))}
                          placeholder="name@email.com"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-[11px] text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={handoffLoading || visitorDetails.name.trim().length < 2}
                      className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {handoffLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting to Coordinators...</span>
                        </>
                      ) : (
                        <>
                          <Headphones className="w-3.5 h-3.5" />
                          <span>Start Live Human Chat</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Chat Transcript Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiMessages.length === 0 ? (
                  <div className="space-y-3.5">
                    <div className="rounded-2xl bg-white border border-slate-200 p-3.5 text-xs text-slate-700 space-y-1.5 shadow-2xs">
                      <p className="font-bold text-slate-900">
                        Welcome to NexGen Council Support
                      </p>
                      <p className="leading-relaxed text-slate-600">
                        Ask our AI Guide anything right away, or tap <strong className="text-emerald-700">Live Human</strong> above to chat directly with a real Council Secretariat coordinator in English, Urdu, or Roman Urdu.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
                        Quick Actions &amp; Questions
                      </p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {AI_STARTER_PROMPTS.map(prompt => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleSendAiMessage(prompt)}
                            className="text-left px-3 py-2 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-xs font-medium text-slate-700 hover:text-indigo-950 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span>{prompt}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  aiMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      {msg.role === 'agent' && (
                        <span className="inline-flex items-center gap-1 px-1.5 mb-1 text-[10px] font-bold text-emerald-700">
                          <UserCheck className="w-3 h-3" />
                          <span>{msg.senderName || 'Council Coordinator'}</span>
                        </span>
                      )}

                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs ${
                          msg.role === 'user'
                            ? 'bg-indigo-950 text-white rounded-br-sm'
                            : msg.role === 'agent'
                            ? 'bg-emerald-50 border border-emerald-200 text-slate-900 rounded-bl-sm shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-2xs'
                        }`}
                      >
                        {msg.role === 'user' || msg.role === 'agent' ? (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        ) : (
                          <SupportRichText
                            text={msg.text}
                            onNavigatePage={handleNavigatePage}
                            variant="light"
                          />
                        )}
                      </div>

                      {msg.escalatedTicketId && (
                        <div className="mt-1.5 max-w-[88%] rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-900 flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            Sent to Human Secretariat Inbox (Ticket{' '}
                            <strong className="font-mono">{msg.escalatedTicketId}</strong>)
                          </span>
                        </div>
                      )}

                      <span className="mt-1 px-1 text-[10px] text-slate-500 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  ))
                )}

                {chatMode === 'human' && chatStatus === 'resolved' && (
                  <div className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-[11px] text-slate-700 text-center">
                    This support session was marked resolved. Send a message anytime to reopen it.
                  </div>
                )}

                {aiLoading && (
                  <div className="flex items-start">
                    <div className="rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3.5 py-2.5 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      <span>{chatMode === 'human' ? 'Sending...' : 'Thinking...'}</span>
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-2">
                    <p>{aiError}</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ticket')}
                      className="inline-flex items-center gap-1 font-bold text-rose-900 underline cursor-pointer"
                    >
                      <span>Open Direct Human Support Form</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendAiMessage();
                }}
                className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={aiInput}
                  onChange={e => handleChatInputChange(e.target.value)}
                  disabled={aiLoading}
                  placeholder={
                    chatMode === 'human'
                      ? 'Message live human coordinator...'
                      : 'Ask AI or click Live Human above...'
                  }
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={aiLoading || !aiInput.trim()}
                  aria-label={chatMode === 'human' ? 'Send live message' : 'Send message to AI Assistant'}
                  className={`p-2.5 rounded-xl text-white transition-colors disabled:opacity-40 cursor-pointer shrink-0 ${
                    chatMode === 'human'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-indigo-950 hover:bg-indigo-900'
                  }`}
                >
                  <Send className="w-4 h-4 text-amber-300" />
                </button>
              </form>
            </div>
          ) : (
            <div className="max-h-[440px] overflow-y-auto p-5 bg-slate-50/60">
              {activeTab === 'faq' ? (
                <div className="space-y-3.5">
                  {/* Quick Website Navigation Links */}
                  <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/70 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-950">
                      <Compass className="w-3.5 h-3.5 text-amber-600" />
                      <span>Quick Website Links</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_NAV_LINKS.map(link => (
                        <button
                          key={link.page}
                          type="button"
                          onClick={() => handleNavigatePage(link.page)}
                          className="flex items-center justify-between gap-1 rounded-xl border border-indigo-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-800 hover:border-indigo-400 hover:bg-indigo-950 hover:text-white transition-colors cursor-pointer"
                        >
                          <span className="truncate">{link.label}</span>
                          <ArrowUpRight className="w-3 h-3 shrink-0 opacity-70" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expandable FAQs */}
                  <div className="space-y-2">
                    {QUICK_FAQS.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                          className="flex w-full items-center justify-between gap-2 p-3.5 text-left text-xs font-bold text-slate-900 hover:bg-slate-50 cursor-pointer"
                        >
                          <span>{item.q}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-amber-600 shrink-0 transition-transform ${
                              openFaq === idx ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {openFaq === idx && (
                          <div className="border-t border-slate-100 px-3.5 py-3 text-xs leading-relaxed text-slate-600 bg-slate-50/60">
                            {item.a}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Live Secretariat Info */}
                  {(settings?.showOfficeHours !== false ||
                    settings?.showContactEmail !== false ||
                    (settings?.showContactPhone !== false && settings?.contactPhone)) && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-1.5 text-[11px] text-slate-600">
                      <div className="font-bold text-slate-900 text-xs">Secretariat Desk Info</div>
                      {settings?.showOfficeHours !== false && settings?.footerOfficeHours && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{settings.footerOfficeHours}</span>
                        </div>
                      )}
                      {settings?.showContactEmail !== false && settings?.contactEmail && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <a
                            href={`mailto:${settings.contactEmail}`}
                            className="text-indigo-900 hover:underline font-medium"
                          >
                            {settings.contactEmail}
                          </a>
                        </div>
                      )}
                      {settings?.showContactPhone !== false && settings?.contactPhone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <a
                            href={`tel:${settings.contactPhone}`}
                            className="text-indigo-900 hover:underline font-medium"
                          >
                            {settings.contactPhone}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveTab('ticket')}
                    className="w-full py-3 bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-amber-300" />
                    <span>Still need help? Submit your issue</span>
                  </button>
                </div>
              ) : submittedSuccess ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                  <CheckCircle2 className="w-11 h-11 text-emerald-600 mx-auto" />
                  <h4 className="font-serif font-bold text-base text-slate-900">
                    Issue Logged Successfully
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Thank you! Your request has been delivered to the Council Secretariat. Our team will respond via email or WhatsApp shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmittedSuccess(false)}
                    className="mt-2 px-5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Submit Another Issue
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Your Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Ayesha Siddiqui"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-emerald-600" />
                          WhatsApp Number <span className="text-rose-500">*</span>
                        </span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.whatsapp}
                        onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                        placeholder="+92 300 1234567"
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      What is your issue about? <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.subject}
                      onChange={e => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="General Inquiry">General Inquiry / Support Issue</option>
                      <option value="Certificate / Cohort Verification">Certificate / Cohort Verification</option>
                      <option value="Volunteer / Fellowship Application">Volunteer / Fellowship Application</option>
                      <option value="Event / Meeting Access Issue">Event / Meeting Access Issue</option>
                      <option value="Website / Portal Bug Report">Website / Portal Technical Issue</option>
                      <option value="University / School Partnership">University / School Partnership</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Describe Your Issue in Detail <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={formData.message}
                      onChange={e => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Please explain the complete issue you are facing (include cohort name, reference code, or error details if applicable)..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>Submitting Issue...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-amber-300" />
                        <span>Submit Issue to Secretariat</span>
                      </>
                    )}
                  </button>

                  {/* Direct Contact Links */}
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                    {settings?.showContactEmail !== false && (
                      <a
                        href={`mailto:${settings?.contactEmail || 'contact@nexgencouncil.org'}`}
                        className="inline-flex items-center gap-1 hover:text-indigo-950"
                      >
                        <Mail className="w-3 h-3 text-amber-600" />
                        <span>Email Directly</span>
                      </a>
                    )}
                    {settings?.showContactPhone !== false && settings?.contactPhone && (
                      <a
                        href={`tel:${settings.contactPhone}`}
                        className="inline-flex items-center gap-1 hover:text-indigo-950"
                      >
                        <Phone className="w-3 h-3 text-amber-600" />
                        <span>{settings.contactPhone}</span>
                      </a>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Image Toggle Button (No Background, Full Uncropped Image) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open Customer Support"
        className="relative bg-transparent border-none p-0 focus:outline-none transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer"
      >
        {!isOpen && unreadHumanReplies > 0 && (
          <span className="absolute -top-1 right-1 z-10 min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
            {unreadHumanReplies}
          </span>
        )}
        <picture>
          <source srcSet="/NexGen-Support-2.webp" type="image/webp" />
          <img
            src="/NexGen-Support-2.png"
            alt="Customer Support"
            width={144}
            height={96}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fallbackApplied) {
                img.dataset.fallbackApplied = '1';
                img.src = '/logo.png';
                img.className = 'w-14 h-14 rounded-full object-contain bg-white p-1 shadow-xl border border-indigo-200 select-none';
              }
            }}
            className="w-28 sm:w-36 h-auto object-contain drop-shadow-xl select-none"
          />
        </picture>
      </button>
    </div>
  );
};
