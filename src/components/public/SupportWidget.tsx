import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp, ActivePage } from '../../context/AppContext.tsx';
import { SupportChatMessage, SupportTicketReply, TicketStatus } from '../../types.ts';
import { SupportRichText } from '../common/SupportRichText.tsx';
import {
  X,
  Send,
  CheckCircle2,
  Phone,
  Mail,
  ArrowUpRight,
  MessageCircle,
  RotateCcw,
  UserCheck,
  Loader2,
  Bot,
  Headphones,
  Ticket,
  Search,
  Copy,
  Check,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

const SUPPORT_SESSION_STORAGE_KEY = 'nexgen_support_ai_session';
const SUPPORT_LIVE_MODE_KEY = 'nexgen_support_live_mode';
const SUPPORT_MY_TICKETS_KEY = 'nexgen_my_support_tickets';

interface SavedTicketSummary {
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
}

interface TicketDetails {
  id: string;
  ticketNumber: string;
  name: string;
  subject: string;
  message: string;
  ticketStatus: TicketStatus;
  priority?: 'Normal' | 'Urgent';
  assignedTo?: string | null;
  replies: SupportTicketReply[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

function loadSavedTickets(): SavedTicketSummary[] {
  try {
    const raw = localStorage.getItem(SUPPORT_MY_TICKETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function persistSavedTicket(item: SavedTicketSummary): SavedTicketSummary[] {
  const existing = loadSavedTickets().filter(
    t => t.ticketNumber.toUpperCase() !== item.ticketNumber.toUpperCase()
  );
  const next = [item, ...existing].slice(0, 6);
  try {
    localStorage.setItem(SUPPORT_MY_TICKETS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

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
  const [activeTab, setActiveTab] = useState<'ai' | 'ticket'>('ai');

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

  // Direct Human Helpdesk Ticket State
  const [ticketView, setTicketView] = useState<'submit' | 'lookup'>('submit');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    whatsapp: '',
    subject: 'General Inquiry',
    priority: 'Normal' as 'Normal' | 'Urgent',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<SavedTicketSummary | null>(null);
  const [copiedTicketNum, setCopiedTicketNum] = useState(false);
  const [recentTickets, setRecentTickets] = useState<SavedTicketSummary[]>(() => loadSavedTickets());
  const [lookupInput, setLookupInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookedUpTicket, setLookedUpTicket] = useState<TicketDetails | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const lookedUpTicketRef = useRef<TicketDetails | null>(null);

  useEffect(() => {
    lookedUpTicketRef.current = lookedUpTicket;
  }, [lookedUpTicket]);

  const handleNavigatePage = (page: ActivePage) => {
    setActivePage(page);
    setIsOpen(false);
  };

  const lookupTicketByNumber = useCallback(async (rawNumber: string) => {
    const clean = (rawNumber || '').trim().replace(/^#/, '').toUpperCase();
    if (!clean) {
      setLookupError('Please enter a ticket number (e.g. NXG-TKT-2026-XXXX).');
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupInput(clean);

    try {
      const res = await fetch(`/api/support-tickets/lookup/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Support ticket not found.');
      }
      setLookedUpTicket(data);
      const updatedRecent = persistSavedTicket({
        ticketNumber: data.ticketNumber,
        subject: data.subject,
        status: data.ticketStatus || 'Open',
        createdAt: data.createdAt
      });
      setRecentTickets(updatedRecent);
    } catch (err: any) {
      setLookedUpTicket(null);
      setLookupError(err?.message || 'Unable to look up that ticket number.');
    } finally {
      setLookupLoading(false);
    }
  }, []);

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
          } else if (payload.type === 'support:ticket_updated' && payload.ticket) {
            const t = payload.ticket;
            setRecentTickets(prev =>
              prev.map(item =>
                item.ticketNumber.toUpperCase() === (t.ticketNumber || '').toUpperCase()
                  ? { ...item, status: t.ticketStatus || item.status }
                  : item
              )
            );
            if (
              lookedUpTicketRef.current &&
              lookedUpTicketRef.current.ticketNumber.toUpperCase() ===
                (t.ticketNumber || '').toUpperCase()
            ) {
              setLookedUpTicket({
                id: t.id,
                ticketNumber: t.ticketNumber,
                name: t.name,
                subject: t.subject,
                message: t.message,
                ticketStatus: t.ticketStatus || 'Open',
                priority: t.priority || 'Normal',
                assignedTo: t.assignedTo || null,
                replies: t.replies || [],
                createdAt: t.createdAt,
                updatedAt: t.updatedAt || t.createdAt,
                resolvedAt: t.resolvedAt || null
              });
            }
            if (payload.reply?.senderRole === 'admin') {
              playVisitorReplyChime();
              addToast(
                `New reply on Ticket ${t.ticketNumber} from ${payload.reply.senderName || 'Secretariat'}`,
                'info'
              );
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
          priority: formData.priority,
          message: cleanMessage,
          source: 'Support Widget',
          channel: 'support_widget',
          sessionId
        })
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          `API returned unexpected response (HTTP ${res.status}).`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to submit your ticket.');
      }

      const savedSummary: SavedTicketSummary = {
        ticketNumber: data.ticketNumber || data.id,
        subject: formData.subject,
        status: data.ticketStatus || 'Open',
        createdAt: data.createdAt || new Date().toISOString()
      };
      setSubmittedTicket(savedSummary);
      setRecentTickets(persistSavedTicket(savedSummary));
      addToast(`Helpdesk Ticket ${savedSummary.ticketNumber} created!`, 'success');
      setFormData({
        name: '',
        email: '',
        whatsapp: '',
        subject: 'General Inquiry',
        priority: 'Normal',
        message: ''
      });
    } catch (err: any) {
      addToast(err.message || 'Error submitting support ticket.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTicketFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookedUpTicket || !followUpMessage.trim() || sendingFollowUp) return;
    setSendingFollowUp(true);
    try {
      const res = await fetch(
        `/api/support-tickets/${encodeURIComponent(lookedUpTicket.ticketNumber)}/visitor-reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: lookedUpTicket.name,
            message: followUpMessage.trim()
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send follow-up reply.');
      if (data.ticket) {
        setLookedUpTicket(data.ticket);
        setRecentTickets(
          persistSavedTicket({
            ticketNumber: data.ticket.ticketNumber,
            subject: data.ticket.subject,
            status: data.ticket.ticketStatus || 'Open',
            createdAt: data.ticket.createdAt
          })
        );
      }
      setFollowUpMessage('');
      addToast('Follow-up added to your support ticket!', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Unable to send follow-up reply.', 'error');
    } finally {
      setSendingFollowUp(false);
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
                  <p className="mt-0.5 text-[11px] text-slate-300">
                    Helpdesk Tickets, Live Chat &amp; AI Concierge
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

            {/* 2-Mode Tabs */}
            <div className="mt-3.5 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span>Live &amp; AI</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ticket')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  activeTab === 'ticket'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Ticket className="w-3.5 h-3.5 shrink-0" />
                <span>Helpdesk</span>
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
              <div className="space-y-4">
                  {/* Helpdesk Mode Switcher: Submit Ticket vs Check Status & Replies */}
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/70 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setTicketView('submit')}
                      className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                        ticketView === 'submit'
                          ? 'bg-white text-indigo-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Send className="w-3 h-3" />
                      <span>Submit Ticket</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketView('lookup')}
                      className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                        ticketView === 'lookup'
                          ? 'bg-white text-indigo-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Search className="w-3 h-3" />
                      <span>Check Ticket Status</span>
                    </button>
                  </div>

                  {ticketView === 'lookup' ? (
                    <div className="space-y-3.5">
                      <form
                        onSubmit={e => {
                          e.preventDefault();
                          lookupTicketByNumber(lookupInput);
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={lookupInput}
                          onChange={e => setLookupInput(e.target.value)}
                          placeholder="Enter Ticket ID (e.g. NXG-TKT-2026-XXXX)"
                          aria-label="Ticket ID"
                          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                        />
                        <button
                          type="submit"
                          disabled={lookupLoading}
                          className="px-3.5 py-2.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          {lookupLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5 text-amber-300" />
                          )}
                          <span>Check</span>
                        </button>
                      </form>

                      {recentTickets.length > 0 && !lookedUpTicket && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-slate-600">
                            Your Recent Tickets
                          </p>
                          <div className="space-y-1.5">
                            {recentTickets.map(t => (
                              <button
                                key={t.ticketNumber}
                                type="button"
                                onClick={() => lookupTicketByNumber(t.ticketNumber)}
                                className="w-full text-left p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                              >
                                <div className="min-w-0">
                                  <span className="font-mono text-[11px] font-bold text-indigo-950 block">
                                    {t.ticketNumber}
                                  </span>
                                  <span className="text-[11px] text-slate-600 truncate block">
                                    {t.subject}
                                  </span>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap shrink-0">
                                  {t.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {lookupError && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{lookupError}</span>
                        </div>
                      )}

                      {lookedUpTicket && (
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5">
                          {/* Ticket Status Header */}
                          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[11px] font-mono font-bold text-indigo-950">
                                <span>{lookedUpTicket.ticketNumber}</span>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span
                                  className={`font-sans font-bold ${
                                    lookedUpTicket.ticketStatus === 'Resolved'
                                      ? 'text-emerald-700'
                                      : lookedUpTicket.ticketStatus === 'In Review'
                                      ? 'text-amber-700'
                                      : 'text-indigo-700'
                                  }`}
                                >
                                  Status: {lookedUpTicket.ticketStatus}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                                {lookedUpTicket.subject}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Submitted {new Date(lookedUpTicket.createdAt).toLocaleDateString()}
                                {lookedUpTicket.assignedTo ? ` · Assigned: ${lookedUpTicket.assignedTo}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => lookupTicketByNumber(lookedUpTicket.ticketNumber)}
                                disabled={lookupLoading}
                                title="Refresh ticket status & replies"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-950 hover:bg-slate-100 cursor-pointer"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${lookupLoading ? 'animate-spin' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setLookedUpTicket(null);
                                  setLookupInput('');
                                  setLookupError(null);
                                }}
                                title="Check a different Ticket ID"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Chronological Thread: Initial Inquiry + Replies */}
                          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs">
                              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                                <strong className="text-slate-800">{lookedUpTicket.name} (Original Inquiry)</strong>
                                <span className="font-mono">
                                  {new Date(lookedUpTicket.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {lookedUpTicket.message}
                              </p>
                            </div>

                            {lookedUpTicket.replies.length === 0 ? (
                              <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-2.5 text-[11px] text-amber-900">
                                Queued with the Secretariat ({lookedUpTicket.ticketStatus}). Coordinator replies will appear directly here.
                              </div>
                            ) : (
                              lookedUpTicket.replies.map(rep => (
                                <div
                                  key={rep.id}
                                  className={`rounded-xl p-2.5 text-xs border ${
                                    rep.senderRole === 'admin'
                                      ? 'bg-emerald-50 border-emerald-200 text-slate-900'
                                      : 'bg-indigo-50/70 border-indigo-200 text-slate-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-[10px] mb-1">
                                    <strong
                                      className={
                                        rep.senderRole === 'admin' ? 'text-emerald-800' : 'text-indigo-900'
                                      }
                                    >
                                      {rep.senderRole === 'admin'
                                        ? `${rep.senderName} · Secretariat`
                                        : `${rep.senderName} (You)`}
                                    </strong>
                                    <span className="font-mono text-slate-500">
                                      {new Date(rep.createdAt).toLocaleString([], {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="whitespace-pre-wrap leading-relaxed">{rep.message}</p>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Visitor Follow-up Reply Form */}
                          <form onSubmit={handleSendTicketFollowUp} className="pt-2 border-t border-slate-100 flex items-center gap-2">
                            <input
                              type="text"
                              value={followUpMessage}
                              onChange={e => setFollowUpMessage(e.target.value)}
                              disabled={sendingFollowUp}
                              placeholder={
                                lookedUpTicket.ticketStatus === 'Resolved'
                                  ? 'Reply to reopen this ticket...'
                                  : 'Add a follow-up note...'
                              }
                              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            <button
                              type="submit"
                              disabled={sendingFollowUp || !followUpMessage.trim()}
                              aria-label="Send ticket follow-up"
                              className="px-3 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold cursor-pointer disabled:opacity-40 shrink-0"
                            >
                              {sendingFollowUp ? '...' : 'Reply'}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  ) : submittedTicket ? (
                    <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3.5">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                      <div>
                        <h4 className="font-serif font-bold text-base text-slate-900">
                          Support Ticket Created
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          Save your unique Ticket ID below to check your ticket status (Open / In Review / Resolved) and admin responses anytime:
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2 bg-white border border-emerald-300 rounded-xl px-3 py-2.5">
                        <span className="font-mono text-sm font-bold text-indigo-950 tracking-wider">
                          {submittedTicket.ticketNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(submittedTicket.ticketNumber);
                            setCopiedTicketNum(true);
                            setTimeout(() => setCopiedTicketNum(false), 2000);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          title="Copy Ticket Number"
                        >
                          {copiedTicketNum ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const num = submittedTicket.ticketNumber;
                            setSubmittedTicket(null);
                            setTicketView('lookup');
                            lookupTicketByNumber(num);
                          }}
                          className="w-full py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Check Ticket Status &amp; Replies
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubmittedTicket(null)}
                          className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          Submit Another Ticket
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Email Address <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            placeholder="you@example.com"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            WhatsApp Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="tel"
                            required
                            value={formData.whatsapp}
                            onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                            placeholder="+92 300 1234567"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Topic / Category <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={formData.subject}
                            onChange={e => setFormData({ ...formData, subject: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                          >
                            <option value="General Inquiry">General Inquiry / Support</option>
                            <option value="Certificate / Cohort Verification">Certificate / Verification</option>
                            <option value="Volunteer / Fellowship Application">Volunteer Application</option>
                            <option value="Event / Meeting Access Issue">Event / Meeting Access</option>
                            <option value="Website / Portal Bug Report">Website Technical Issue</option>
                            <option value="University / School Partnership">Institutional Partnership</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Priority
                          </label>
                          <select
                            value={formData.priority}
                            onChange={e =>
                              setFormData({
                                ...formData,
                                priority: e.target.value === 'Urgent' ? 'Urgent' : 'Normal'
                              })
                            }
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                          >
                            <option value="Normal">Normal</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Describe Your Issue <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={formData.message}
                          onChange={e => setFormData({ ...formData, message: e.target.value })}
                          placeholder="Share full details (include reference code or event name if applicable)..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3 bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <span>Creating Support Ticket...</span>
                        ) : (
                          <>
                            <Ticket className="w-3.5 h-3.5 text-amber-300" />
                            <span>Submit Ticket to Helpdesk Queue</span>
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
