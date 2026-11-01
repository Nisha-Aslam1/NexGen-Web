import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Users,
  MessageSquare,
  Shield,
  Lock,
  Unlock,
  Maximize2,
  Minimize2,
  Check,
  X,
  Send,
  UserX,
  AlertCircle
} from 'lucide-react';

interface LiveMeetingRoomProps {
  meeting: any;
  role: string;
  identity: string;
  displayName: string;
  onLeave: () => void;
}

export const LiveMeetingRoom: React.FC<LiveMeetingRoomProps> = ({
  meeting: initialMeeting,
  role,
  identity,
  displayName,
  onLeave
}) => {
  const { addToast, authToken } = useApp();

  const [meeting, setMeeting] = useState(initialMeeting);
  const [isConnecting, setIsConnecting] = useState(false);

  // Audio & Video State
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Media Stream
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Participants State
  const [participants, setParticipants] = useState<any[]>([
    {
      id: identity,
      displayName,
      role,
      joinedAt: new Date().toISOString(),
      isLocal: true
    }
  ]);

  // UI State
  const [activeDrawer, setActiveDrawer] = useState<'participants' | 'chat' | 'security' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [meetingSeconds, setMeetingSeconds] = useState(0);

  // Waiting Room Data (for Host)
  const [waitingParticipants, setWaitingParticipants] = useState<any[]>([]);

  // Chat State
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const isHost = role === 'host' || meeting.hostId === identity;

  // Initialize camera and mic
  useEffect(() => {
    let mounted = true;

    const startLocalMedia = async () => {
      try {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
        }

        if (!camOn && !micOn) {
          if (localVideoRef.current) localVideoRef.current.srcObject = null;
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: camOn,
          audio: micOn
        });

        if (mounted) {
          mediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }
      } catch (err: any) {
        console.warn('Local media access warning:', err);
      }
    };

    startLocalMedia();

    return () => {
      mounted = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [camOn, micOn]);

  // Meeting timer
  useEffect(() => {
    const timer = setInterval(() => {
      setMeetingSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Timer HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Poll Participants & Waiting Room
  useEffect(() => {
    const fetchParticipantsAndWaiting = async () => {
      try {
        const [pRes, wRes] = await Promise.all([
          fetch(`/api/meetings/${meeting.id}/participants`),
          isHost ? fetch(`/api/meetings/${meeting.id}/waiting-room`) : Promise.resolve(null)
        ]);

        if (pRes.ok) {
          const pData = await pRes.json();
          const remoteList = pData.participants || [];
          
          // Ensure local user is represented
          const hasLocal = remoteList.some((p: any) => p.userId === identity || p.displayName === displayName);
          const fullList = [...remoteList];
          if (!hasLocal) {
            fullList.unshift({
              id: identity,
              displayName,
              role,
              joinedAt: new Date().toISOString(),
              isLocal: true
            });
          }
          setParticipants(fullList);
        }

        if (wRes && wRes.ok) {
          const wData = await wRes.json();
          setWaitingParticipants(wData.waiting || []);
        }
      } catch {}
    };

    fetchParticipantsAndWaiting();
    const interval = setInterval(fetchParticipantsAndWaiting, 3000);
    return () => clearInterval(interval);
  }, [meeting.id, isHost, identity, displayName, role]);

  // Fetch Chat History
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

  // Toggle Mic
  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(t => (t.enabled = !micOn));
    }
    setMicOn(!micOn);
  };

  // Toggle Camera
  const toggleCam = () => {
    if (mediaStreamRef.current) {
      const videoTracks = mediaStreamRef.current.getVideoTracks();
      videoTracks.forEach(t => (t.enabled = !camOn));
    }
    setCamOn(!camOn);
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (screenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      setScreenSharing(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setScreenSharing(true);

      stream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
      };

      if (screenShareRef.current) {
        screenShareRef.current.srcObject = stream;
      }
    } catch (err: any) {
      addToast(err.message || 'Screen sharing cancelled', 'info');
    }
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
    if (!confirm('Are you sure you want to remove this participant from the room?')) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      await fetch(`/api/meetings/${meeting.id}/kick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ participantIdentity: pIdentity })
      });

      addToast('Participant removed', 'info');
    } catch (err) {
      addToast('Error kicking participant', 'error');
    }
  };

  // Send Chat Message
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
      setUnreadChatCount(0);
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
              <span className="text-slate-300">{participants.length} in meeting</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Waiting Room Badge for Host */}
          {isHost && waitingParticipants.length > 0 && (
            <button
              onClick={() => setActiveDrawer(activeDrawer === 'participants' ? null : 'participants')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold animate-pulse flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{waitingParticipants.length} Waiting</span>
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Video Grid Area */}
      <main className="flex-1 relative flex overflow-hidden p-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center justify-center max-w-7xl mx-auto w-full auto-rows-fr">
          {/* Local User Video Tile */}
          <div className="relative w-full h-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center aspect-video">
            {camOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-amber-300 text-2xl font-bold shadow-lg">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-white flex items-center gap-2">
              <span>{displayName} (You)</span>
              {micOn ? (
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <MicOff className="w-3.5 h-3.5 text-rose-400" />
              )}
            </div>
          </div>

          {/* Remote Participants Tiles */}
          {participants
            .filter((p) => p.displayName !== displayName)
            .map((p, idx) => (
              <div
                key={p.id || idx}
                className="relative w-full h-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center aspect-video"
              >
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-indigo-500/40 flex items-center justify-center text-indigo-300 text-2xl font-bold shadow-lg">
                  {p.displayName ? p.displayName.slice(0, 2).toUpperCase() : 'PT'}
                </div>

                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-white flex items-center gap-2">
                  <span>{p.displayName || 'Participant'}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
              </div>
            ))}
        </div>

        {/* Right Drawer Panel */}
        {activeDrawer && (
          <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl transition-all">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {activeDrawer === 'participants' && (
                  <>
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Meeting Roster ({participants.length})</span>
                  </>
                )}
                {activeDrawer === 'chat' && (
                  <>
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>In-Meeting Discussion</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setActiveDrawer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Participants Panel Content */}
            {activeDrawer === 'participants' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Waiting Room Section for Host */}
                {isHost && waitingParticipants.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                        Waiting Room ({waitingParticipants.length})
                      </span>
                      <button
                        onClick={() => handleAdmitParticipant('', true)}
                        className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                      >
                        Admit All
                      </button>
                    </div>

                    <div className="space-y-2">
                      {waitingParticipants.map((wp) => (
                        <div
                          key={wp.id}
                          className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"
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
                    </div>
                  </div>
                )}

                {/* Active Connected List */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Connected ({participants.length})
                  </div>
                  {participants.map((p, idx) => (
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

                      {/* Host Actions */}
                      {isHost && p.displayName !== displayName && (
                        <button
                          onClick={() => handleKickParticipant(p.id || p.displayName)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Remove Participant"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Panel Content */}
            {activeDrawer === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-slate-500 italic pt-12">
                      No chat messages yet. Send a message to start discussion.
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

                {/* Chat Composer */}
                <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Send a message to everyone..."
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

      {/* Bottom Control Bar */}
      <footer className="h-20 px-6 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between z-20 backdrop-blur-md">
        <div className="hidden sm:block text-xs text-slate-400 font-mono">
          NexGen Video Conference
        </div>

        {/* Central Media Controls */}
        <div className="flex items-center gap-3 mx-auto sm:mx-0">
          <button
            onClick={toggleMic}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer shadow-md ${
              micOn
                ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
            title={micOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleCam}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer shadow-md ${
              camOn
                ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
            title={camOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {meeting.screenShareEnabled !== false && (
            <button
              onClick={toggleScreenShare}
              className={`p-3.5 rounded-2xl transition-all cursor-pointer shadow-md ${
                screenSharing
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
              title={screenSharing ? 'Stop Screen Share' : 'Share Screen'}
            >
              <Monitor className="w-5 h-5" />
            </button>
          )}

          {/* Drawer Toggles */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'participants' ? null : 'participants')}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer relative shadow-md ${
              activeDrawer === 'participants'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
            }`}
            title="Participants"
          >
            <Users className="w-5 h-5" />
            {waitingParticipants.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full flex items-center justify-center">
                {waitingParticipants.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
            className={`p-3.5 rounded-2xl transition-all cursor-pointer relative shadow-md ${
              activeDrawer === 'chat'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
            }`}
            title="In-Meeting Discussion"
          >
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Leave Button */}
          <button
            onClick={onLeave}
            className="px-5 py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>

        <div className="hidden sm:block text-xs text-slate-500">
          NexGen Council
        </div>
      </footer>
    </div>
  );
};
