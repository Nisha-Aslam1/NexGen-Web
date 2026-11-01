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
  Video,
  Key,
  Info
} from 'lucide-react';

interface LiveMeetingRoomProps {
  jaasToken?: string | null;
  jaasAppId?: string;
  jaasRoomName?: string;
  jaasDomain?: string;
  jaasError?: string;
  meeting: any;
  role: string;
  identity: string;
  displayName: string;
  onLeave: () => void;
}

export const LiveMeetingRoom: React.FC<LiveMeetingRoomProps> = ({
  jaasToken,
  jaasAppId,
  jaasRoomName,
  jaasDomain = '8x8.vc',
  jaasError,
  meeting: initialMeeting,
  role,
  identity,
  displayName,
  onLeave
}) => {
  const { addToast, authToken } = useApp();

  const [meeting, setMeeting] = useState(initialMeeting);
  const [jitsiLoading, setJitsiLoading] = useState(true);
  const [jitsiConnected, setJitsiConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Drawer & UI State
  const [activeDrawer, setActiveDrawer] = useState<'participants' | 'chat' | 'waiting' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [meetingSeconds, setMeetingSeconds] = useState(0);

  // Waiting Room Data (for Host)
  const [waitingParticipants, setWaitingParticipants] = useState<any[]>([]);
  const [participantsList, setParticipantsList] = useState<any[]>([]);

  // Application Chat State
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');

  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);
  const jitsiApiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const isHost = role === 'host' || meeting.hostId === identity;

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

  // Poll Waiting Room & Participants from MongoDB
  useEffect(() => {
    const fetchWaitingAndParticipants = async () => {
      try {
        const [pRes, wRes] = await Promise.all([
          fetch(`/api/meetings/${meeting.id}/participants`),
          isHost ? fetch(`/api/meetings/${meeting.id}/waiting-room`) : Promise.resolve(null)
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
    const interval = setInterval(fetchWaitingAndParticipants, 3000);
    return () => clearInterval(interval);
  }, [meeting.id, isHost]);

  // Poll Persistent Chat History from MongoDB
  const fetchChatHistory = async () => {
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
    const interval = setInterval(fetchChatHistory, 3000);
    return () => clearInterval(interval);
  }, [meeting.id]);

  // Initialize Jitsi External API iframe
  useEffect(() => {
    let isMounted = true;

    const loadJitsiScriptAndInit = async () => {
      setJitsiLoading(true);
      setLoadError(null);

      // Load 8x8.vc External API script dynamically
      const scriptUrl = `https://${jaasDomain}/external_api.js`;

      const loadScript = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          if ((window as any).JitsiMeetExternalAPI) {
            resolve();
            return;
          }
          const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
          if (existingScript) {
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', () => reject(new Error('Failed to load Jitsi API script')));
            return;
          }
          const script = document.createElement('script');
          script.src = scriptUrl;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load JaaS External API script from ${scriptUrl}`));
          document.body.appendChild(script);
        });
      };

      try {
        await loadScript();

        if (!isMounted || !jitsiContainerRef.current) return;

        // Clean up any existing Jitsi instance
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
          jitsiApiRef.current = null;
        }

        const domain = jaasDomain || '8x8.vc';
        const targetRoomName = jaasRoomName || (jaasAppId ? `${jaasAppId}/${meeting.meetingCode}` : meeting.meetingCode);

        const options: any = {
          roomName: targetRoomName,
          jwt: jaasToken || undefined,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: {
            displayName: displayName
          },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableClosePage: false
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'closedcaptions', 'desktop', 'embedmeeting',
              'fullscreen', 'fudi', 'hangup', 'profile', 'chat', 'recording',
              'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
              'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
              'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
              'security'
            ]
          }
        };

        const api = new (window as any).JitsiMeetExternalAPI(domain, options);
        jitsiApiRef.current = api;

        // Attach Jitsi Event Listeners
        api.addEventListener('videoConferenceJoined', () => {
          if (isMounted) {
            setJitsiLoading(false);
            setJitsiConnected(true);
          }
        });

        api.addEventListener('videoConferenceLeft', () => {
          onLeave();
        });

        api.addEventListener('readyToClose', () => {
          onLeave();
        });

        api.addEventListener('participantJoined', (participant: any) => {
          console.log('[JaaS] Remote participant joined:', participant);
        });

        api.addEventListener('participantLeft', (participant: any) => {
          console.log('[JaaS] Remote participant left:', participant);
        });

      } catch (err: any) {
        console.error('[JaaS] Initialization Error:', err);
        if (isMounted) {
          setLoadError(err.message || 'Failed to initialize Jitsi video container');
          setJitsiLoading(false);
        }
      }
    };

    loadJitsiScriptAndInit();

    return () => {
      isMounted = false;
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
        jitsiApiRef.current = null;
      }
    };
  }, [jaasToken, jaasAppId, jaasRoomName, jaasDomain, meeting.meetingCode, displayName]);

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
    } catch (err) {
      addToast('Error admitting participant', 'error');
    }
  };

  // Host Action: Reject Waiting Participant
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
    } catch (err) {
      addToast('Error rejecting participant', 'error');
    }
  };

  // Host Action: Kick Connected Participant
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
    } catch (err) {
      addToast('Error kicking participant', 'error');
    }
  };

  // Host Action: End Meeting
  const handleEndMeeting = async () => {
    if (!confirm('Are you sure you want to end this meeting for everyone?')) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      await fetch(`/api/meetings/${meeting.id}/end`, { method: 'POST', headers });
      if (jitsiApiRef.current) {
        jitsiApiRef.current.executeCommand('hangup');
      }
      onLeave();
    } catch (err) {
      addToast('Error ending meeting', 'error');
    }
  };

  // Send Application Chat Message
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

      if (res.ok) {
        fetchChatHistory();
      }
    } catch (err) {
      addToast('Error sending message', 'error');
    }
  };

  useEffect(() => {
    if (activeDrawer === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeDrawer]);

  // Fullscreen toggle
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
      className="fixed inset-0 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none z-50 font-sans"
    >
      {/* Top Header Bar */}
      <header className="h-16 px-6 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="NexGen Council" className="h-8 w-8 object-contain" />
          <div>
            <h1 className="text-sm sm:text-base font-serif font-bold text-white leading-tight truncate max-w-xs sm:max-w-md">
              {meeting.title}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="text-amber-400">{formatTime(meetingSeconds)}</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">{isHost ? 'Host / Moderator' : 'Participant'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Waiting Room Badge for Host */}
          {isHost && waitingParticipants.length > 0 && (
            <button
              onClick={() => setActiveDrawer(activeDrawer === 'waiting' ? null : 'waiting')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold animate-pulse flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{waitingParticipants.length} Waiting</span>
            </button>
          )}

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'participants' ? null : 'participants')}
            className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
              activeDrawer === 'participants' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Participant List & Roster"
          >
            <Users className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
            className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
              activeDrawer === 'chat' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Saved Council Chat History"
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

          {isHost && (
            <button
              onClick={handleEndMeeting}
              className="px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
            >
              End for All
            </button>
          )}
        </div>
      </header>

      {/* JaaS Credentials Configuration Missing Notice Banner (if applicable) */}
      {jaasError && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-2.5 text-xs text-amber-200 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>JaaS Production Key Notice:</strong> {jaasError}
            </span>
          </div>
          <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded font-mono text-amber-300">
            JAAS_APP_ID required
          </span>
        </div>
      )}

      {/* Main Video & Sidebar Container */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* Video Frame */}
        <div className="flex-1 relative bg-slate-950 flex flex-col items-center justify-center">
          {jitsiLoading && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-10 p-6 text-center space-y-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <h2 className="text-lg font-serif font-bold text-white">Connecting to Jitsi Video Conference...</h2>
              <p className="text-xs text-slate-400 max-w-sm">
                Authenticating encrypted WebRTC media session on <strong>8x8.vc</strong>
              </p>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 bg-slate-950 flex items-center justify-center z-10 p-6">
              <div className="max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
                <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                <h3 className="text-lg font-bold text-white">Connection Error</h3>
                <p className="text-xs text-slate-400">{loadError}</p>
                <button
                  onClick={onLeave}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl text-xs"
                >
                  Return to Portal
                </button>
              </div>
            </div>
          )}

          {/* Jitsi External API Container */}
          <div ref={jitsiContainerRef} className="w-full h-full min-h-0 border-0" />
        </div>

        {/* Right Drawer Panel (Participants / Chat / Waiting Room) */}
        {activeDrawer && (
          <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl transition-all">
            {/* Drawer Header */}
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
                    <span>Persistent Council Chat</span>
                  </>
                )}
                {activeDrawer === 'waiting' && (
                  <>
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Waiting Room Queue ({waitingParticipants.length})</span>
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

            {/* Waiting Room Panel Content */}
            {activeDrawer === 'waiting' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {waitingParticipants.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center pt-8">
                    No participants currently in the waiting room.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                        Pending Admissions
                      </span>
                      <button
                        onClick={() => handleAdmitParticipant('', true)}
                        className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer"
                      >
                        Admit All
                      </button>
                    </div>

                    {waitingParticipants.map((wp) => (
                      <div
                        key={wp.id}
                        className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs"
                      >
                        <span className="font-semibold text-white truncate max-w-[130px]">
                          {wp.displayName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAdmitParticipant(wp.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                          >
                            Admit
                          </button>
                          <button
                            onClick={() => handleRejectParticipant(wp.id)}
                            className="p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-lg text-[10px] cursor-pointer"
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

            {/* Participants Roster Content */}
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
                        <div className="text-[10px] text-slate-500 capitalize">
                          {p.role || (p.displayName === meeting.hostName ? 'Host' : 'Participant')}
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

            {/* Persistent Chat Content */}
            {activeDrawer === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-slate-500 italic pt-12">
                      No saved chat messages yet. Send a message to start discussion.
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-amber-300">{msg.senderName}</span>
                          <span className="text-slate-500">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-200 text-xs leading-relaxed font-sans">{msg.message}</p>
                      </div>
                    ))
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Send saved message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
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
