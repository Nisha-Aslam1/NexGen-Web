import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Users,
  MessageSquare,
  Shield,
  Maximize2,
  Minimize2,
  X,
  Send,
  UserX,
  AlertCircle,
  PhoneOff,
  RefreshCw,
  Eye,
  Copy,
  Check
} from 'lucide-react';

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, any>) => any;
  }
}

interface LiveMeetingRoomProps {
  jitsiDomain?: string;
  jitsiRoomName?: string;
  initialAudioMuted?: boolean;
  initialVideoMuted?: boolean;
  meeting: any;
  role: string;
  identity: string;
  displayName: string;
  userEmail?: string;
  onLeave: (durationSeconds?: number) => void;
}

export const LiveMeetingRoom: React.FC<LiveMeetingRoomProps> = ({
  jitsiDomain = 'meet.nexgencouncil.bond',
  jitsiRoomName,
  initialAudioMuted,
  initialVideoMuted,
  meeting,
  role,
  identity,
  displayName,
  userEmail,
  onLeave
}) => {
  const { addToast, authToken } = useApp();

  const [jitsiLoading, setJitsiLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Drawer & UI State
  const [activeDrawer, setActiveDrawer] = useState<'participants' | 'chat' | 'waiting' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [meetingSeconds, setMeetingSeconds] = useState(0);

  // Waiting Room Data (for Host)
  const [waitingParticipants, setWaitingParticipants] = useState<any[]>([]);
  const [participantsList, setParticipantsList] = useState<any[]>([]);

  // Persistent Application Chat State
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');

  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);
  const jitsiApiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const hasExitedRef = useRef(false);
  const meetingSecondsRef = useRef(0);

  const isHost = role === 'host' || meeting?.hostId === identity;

  // Keep latest duration ref for clean exit summary
  useEffect(() => {
    meetingSecondsRef.current = meetingSeconds;
  }, [meetingSeconds]);

  // Meeting timer
  useEffect(() => {
    const timer = setInterval(() => {
      setMeetingSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const triggerSafeExit = () => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.dispose();
      } catch {}
      jitsiApiRef.current = null;
    }
    onLeave(meetingSecondsRef.current);
  };

  // Poll Waiting Room & Participants Roster
  useEffect(() => {
    if (!meeting?.id) return;
    const fetchWaitingAndParticipants = async () => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const [pRes, wRes] = await Promise.all([
          fetch(`/api/meetings/${meeting.id}/participants`),
          isHost ? fetch(`/api/meetings/${meeting.id}/waiting-room`, { headers }) : Promise.resolve(null)
        ]);

        if (pRes.ok) {
          const pData = await pRes.json();
          setParticipantsList(pData.participants || []);
        }

        if (wRes && wRes.ok) {
          const wData = await wRes.json();
          setWaitingParticipants(wData.waiting || []);
        }
      } catch {}
    };

    fetchWaitingAndParticipants();
    const interval = setInterval(fetchWaitingAndParticipants, 3500);
    return () => clearInterval(interval);
  }, [meeting?.id, isHost, authToken]);

  // Poll Persistent Chat History
  const fetchChatHistory = async () => {
    if (!meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchChatHistory();
    const interval = setInterval(fetchChatHistory, 3500);
    return () => clearInterval(interval);
  }, [meeting?.id]);

  // Dynamically load https://meet.nexgencouncil.bond/external_api.js and initialize JitsiMeetExternalAPI
  useEffect(() => {
    let isMounted = true;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    hasExitedRef.current = false;

    const cleanDomain = (jitsiDomain || 'meet.nexgencouncil.bond')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    const scriptUrl = `https://${cleanDomain}/external_api.js`;

    const loadScript = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve();
          return;
        }
        const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve());
          existingScript.addEventListener('error', () =>
            reject(new Error(`Failed to load Jitsi External API script from ${scriptUrl}`))
          );
          return;
        }
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error(`Failed to load Jitsi External API script from ${scriptUrl}`));
        document.body.appendChild(script);
      });
    };

    const initJitsi = async () => {
      setJitsiLoading(true);
      setLoadError(null);

      try {
        await loadScript();
        if (!isMounted || !jitsiContainerRef.current) return;

        if (!window.JitsiMeetExternalAPI) {
          throw new Error('JitsiMeetExternalAPI constructor is unavailable after loading script.');
        }

        if (jitsiApiRef.current) {
          try {
            jitsiApiRef.current.dispose();
          } catch {}
          jitsiApiRef.current = null;
        }

        jitsiContainerRef.current.innerHTML = '';

        const slug = meeting?.meetingCode || 'nex-council';
        const targetRoomName = jitsiRoomName || meeting?.roomName || `nexgencouncil-${slug}`;
        const screenSharingAllowed = meeting?.screenShareEnabled !== false;

        const enabledToolbarButtons = [
          'microphone',
          'camera',
          ...(screenSharingAllowed ? ['desktop'] : []),
          'chat',
          'raisehand',
          'participants-pane',
          'tileview',
          'recording',
          'settings',
          'fullscreen',
          'hangup',
          'closedcaptions',
          'security',
          'mute-everyone',
          'videoquality',
          'filmstrip',
          'shortcuts'
        ];

        const effectiveAudioMuted =
          initialAudioMuted !== undefined ? initialAudioMuted : Boolean(meeting?.startWithAudioMuted);
        const effectiveVideoMuted =
          initialVideoMuted !== undefined ? initialVideoMuted : Boolean(meeting?.startWithVideoMuted);

        const options: Record<string, any> = {
          roomName: targetRoomName,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: {
            displayName: displayName || 'Participant',
            ...(userEmail ? { email: userEmail } : {})
          },
          configOverwrite: {
            subject: meeting?.title || 'NexGen Council Video Conference',
            startWithAudioMuted: effectiveAudioMuted,
            startWithVideoMuted: effectiveVideoMuted,
            prejoinPageEnabled: false,
            enableWelcomePage: false,
            enableClosePage: false,
            disableDeepLinking: true,
            disableInviteFunctions: true,
            hideAddRoomButton: true,
            disableDesktopSharing: !screenSharingAllowed,
            toolbarButtons: enabledToolbarButtons,
            notifications: [],
            lobby: {
              autoKnock: Boolean(meeting?.waitingRoomEnabled),
              enableChat: true
            }
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            HIDE_INVITE_MORE_HEADER: true,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            TOOLBAR_BUTTONS: enabledToolbarButtons
          }
        };

        const api = new window.JitsiMeetExternalAPI(cleanDomain, options);
        jitsiApiRef.current = api;

        const iframe = jitsiContainerRef.current.querySelector('iframe');
        if (iframe) {
          iframe.setAttribute(
            'allow',
            'camera; microphone; fullscreen; display-capture; autoplay; clipboard-write; speaker-selection'
          );
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = '0';
          iframe.addEventListener('load', () => {
            setTimeout(() => {
              if (isMounted) setJitsiLoading(false);
            }, 900);
          });
        }

        api.addEventListener('videoConferenceJoined', () => {
          if (isMounted) {
            setJitsiLoading(false);
          }
        });

        api.addEventListener('videoConferenceLeft', () => {
          if (isMounted) {
            triggerSafeExit();
          }
        });

        api.addEventListener('readyToClose', () => {
          if (isMounted) {
            triggerSafeExit();
          }
        });

        api.addEventListener('errorOccurred', (err: any) => {
          console.error('[Jitsi Error Event]:', err);
          if (isMounted && err?.fatal) {
            setLoadError(err.message || 'A video conference connection error occurred.');
            setJitsiLoading(false);
          }
        });

        // Safety fallback so overlay dismisses cleanly if iframe already rendered
        safetyTimer = setTimeout(() => {
          if (isMounted) setJitsiLoading(false);
        }, 3000);
      } catch (err: any) {
        console.error('[Jitsi Initialization Error]:', err);
        if (isMounted) {
          setLoadError(err.message || `Failed to connect to ${cleanDomain}.`);
          setJitsiLoading(false);
        }
      }
    };

    initJitsi();

    return () => {
      isMounted = false;
      if (safetyTimer) clearTimeout(safetyTimer);
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
        jitsiApiRef.current = null;
      }
    };
  }, [jitsiDomain, jitsiRoomName, meeting?.meetingCode, displayName, userEmail, initialAudioMuted, initialVideoMuted]);

  const handleCopyInviteLink = () => {
    const slug = meeting?.meetingCode;
    if (!slug) return;
    const url = `${window.location.origin}/meeting/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    addToast('Meeting invite link copied!', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Host Action: Admit Waiting Participant
  const handleAdmitParticipant = async (pId: string, admitAll = false) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${meeting.id}/admit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ participantId: pId, admitAll })
      });

      if (res.ok) {
        addToast(admitAll ? 'Admitted all waiting participants' : 'Participant admitted', 'success');
        setWaitingParticipants(prev => (admitAll ? [] : prev.filter(w => w.id !== pId)));
      }
    } catch {
      addToast('Error admitting participant', 'error');
    }
  };

  const handleRejectParticipant = async (pId: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${meeting.id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ participantId: pId })
      });

      if (res.ok) {
        setWaitingParticipants(prev => prev.filter(w => w.id !== pId));
      }
    } catch {
      addToast('Error rejecting participant', 'error');
    }
  };

  const handleKickParticipant = async (pIdentity: string) => {
    if (!confirm('Are you sure you want to remove this participant?')) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      await fetch(`/api/meetings/${meeting.id}/kick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ participantIdentity: pIdentity })
      });
      addToast('Participant removed from room', 'info');
    } catch {
      addToast('Error removing participant', 'error');
    }
  };

  const handleEndMeeting = async () => {
    if (!confirm('Are you sure you want to end this meeting for everyone?')) return;
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      await fetch(`/api/meetings/${meeting.id}/end`, { method: 'POST', headers });
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.executeCommand('hangup');
        } catch {}
      }
      triggerSafeExit();
    } catch {
      addToast('Error ending meeting', 'error');
    }
  };

  const handleLeaveCall = () => {
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.executeCommand('hangup');
      } catch {}
    }
    triggerSafeExit();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const messageText = chatInput.trim();
    setChatInput('');

    try {
      const res = await fetch(`/api/meetings/${meeting.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          senderName: displayName,
          senderId: identity
        })
      });
      if (res.ok) fetchChatHistory();
    } catch {
      addToast('Error sending message', 'error');
    }
  };

  useEffect(() => {
    if (activeDrawer === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeDrawer]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-screen bg-slate-950 text-white flex flex-col overflow-hidden z-50 font-sans"
    >
      {/* Top Header Bar (4rem / h-16) */}
      <header className="h-16 px-4 sm:px-6 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="NexGen Council" className="h-8 w-8 object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-serif font-bold text-white leading-tight truncate max-w-[180px] sm:max-w-md">
              {meeting?.title || 'NexGen Council Video Conference'}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
              <span className="text-amber-400">{formatTime(meetingSeconds)}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-sans font-semibold">
                {isHost ? 'Host / Moderator' : 'Participant'}
              </span>
              {meeting?.meetingCode && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline text-slate-500">{meeting.meetingCode}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isHost && waitingParticipants.length > 0 && (
            <button
              onClick={() => setActiveDrawer(activeDrawer === 'waiting' ? null : 'waiting')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{waitingParticipants.length} Waiting</span>
            </button>
          )}

          <button
            onClick={handleCopyInviteLink}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            title="Copy NexGen Meeting Invite Link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied' : 'Copy Invite'}</span>
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'participants' ? null : 'participants')}
            className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
              activeDrawer === 'participants'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Participant Roster"
          >
            <Users className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
            className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
              activeDrawer === 'chat'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Saved Council Notes & Chat"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {isHost ? (
            <button
              onClick={handleEndMeeting}
              className="px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              End for All
            </button>
          ) : (
            <button
              onClick={handleLeaveCall}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Leave</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Embedded Container: calc(100vh - 4rem) exact height, 100% width */}
      <main className="w-full h-[calc(100vh-4rem)] relative flex overflow-hidden">
        <div className="flex-1 relative bg-slate-950 w-full h-full flex flex-col">
          {/* Connecting Overlay */}
          {jitsiLoading && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-10 p-6 text-center space-y-4">
              <div className="w-11 h-11 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <h2 className="text-lg font-serif font-bold text-white">Connecting to NexGen Meet...</h2>
              <p className="text-xs text-slate-400 max-w-sm">
                Initializing encrypted WebRTC session via <span className="font-mono text-slate-200">{jitsiDomain}</span>
              </p>
              <button
                type="button"
                onClick={() => setJitsiLoading(false)}
                className="mt-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Show Video Frame</span>
              </button>
            </div>
          )}

          {/* Load / Connection Error Card */}
          {loadError && (
            <div className="absolute inset-0 bg-slate-950/95 flex items-center justify-center z-20 p-6">
              <div className="max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
                <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                <h3 className="text-lg font-bold text-white">Conference Connection Issue</h3>
                <p className="text-xs text-slate-400">{loadError}</p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                  <button
                    onClick={triggerSafeExit}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Exit Room
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Jitsi IFrame External API Mount Node */}
          <div
            ref={jitsiContainerRef}
            className="w-full h-full relative bg-slate-950 overflow-hidden"
          />
        </div>

        {/* Right Side Drawer (Waiting Room / Participants / Persistent Notes) */}
        {activeDrawer && (
          <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {activeDrawer === 'participants' && (
                  <>
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Meeting Roster ({participantsList.length})</span>
                  </>
                )}
                {activeDrawer === 'chat' && (
                  <>
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>Council Meeting Notes</span>
                  </>
                )}
                {activeDrawer === 'waiting' && (
                  <>
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Waiting Lobby ({waitingParticipants.length})</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setActiveDrawer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeDrawer === 'waiting' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {waitingParticipants.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center pt-8">
                    No participants currently waiting in lobby.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-amber-300">Pending Admissions</span>
                      <button
                        onClick={() => handleAdmitParticipant('', true)}
                        className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer"
                      >
                        Admit All
                      </button>
                    </div>
                    {waitingParticipants.map(wp => (
                      <div
                        key={wp.id}
                        className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs"
                      >
                        <span className="font-semibold text-white truncate max-w-[140px]">{wp.displayName}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAdmitParticipant(wp.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-[11px] cursor-pointer"
                          >
                            Admit
                          </button>
                          <button
                            onClick={() => handleRejectParticipant(wp.id)}
                            className="p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {activeDrawer === 'participants' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {participantsList.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 text-amber-300 font-bold flex items-center justify-center text-xs border border-slate-700">
                        {p.displayName ? p.displayName.slice(0, 2).toUpperCase() : 'PT'}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {p.displayName} {p.displayName === displayName && '(You)'}
                        </div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {p.role || (p.displayName === meeting?.hostName ? 'Host' : 'Participant')}
                        </div>
                      </div>
                    </div>
                    {isHost && p.displayName !== displayName && (
                      <button
                        onClick={() => handleKickParticipant(p.identity || p.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="Remove Participant"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeDrawer === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-slate-500 italic pt-12">
                      No saved council notes yet. Post a note to archive it with this meeting.
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-amber-300">{msg.senderName}</span>
                          <span className="text-slate-500 tabular-nums">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-200 text-xs leading-relaxed">{msg.message}</p>
                      </div>
                    ))
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Write archived note..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  );
};
