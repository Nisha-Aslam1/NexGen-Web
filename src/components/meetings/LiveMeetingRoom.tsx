import React, { useEffect, useState, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  LocalVideoTrack,
  LocalAudioTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  Participant,
  DataPacket_Kind
} from 'livekit-client';
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
  MoreVertical,
  Volume2,
  UserX,
  UserCheck,
  AlertCircle,
  Copy
} from 'lucide-react';

interface LiveMeetingRoomProps {
  token: string;
  livekitUrl: string;
  meeting: any;
  role: string;
  identity: string;
  displayName: string;
  onLeave: () => void;
}

export const LiveMeetingRoom: React.FC<LiveMeetingRoomProps> = ({
  token,
  livekitUrl,
  meeting: initialMeeting,
  role,
  identity,
  displayName,
  onLeave
}) => {
  const { addToast, authToken } = useApp();

  const [meeting, setMeeting] = useState(initialMeeting);
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Audio & Video State
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Participants & Tracks State
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Drawer / UI State
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

  // Timer counter
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

  // Poll Waiting Room (for Host)
  useEffect(() => {
    if (!isHost) return;

    const fetchWaiting = async () => {
      try {
        const res = await fetch(`/api/meetings/${meeting.id}/waiting-room`);
        if (res.ok) {
          const data = await res.json();
          setWaitingParticipants(data.waiting || []);
        }
      } catch {}
    };

    fetchWaiting();
    const interval = setInterval(fetchWaiting, 3000);
    return () => clearInterval(interval);
  }, [meeting.id, isHost]);

  // Fetch Chat History from MongoDB
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
  }, [meeting.id]);

  // Initialize LiveKit Room
  useEffect(() => {
    let newRoom: Room | null = null;

    const connectToLiveKit = async () => {
      setIsConnecting(true);
      setConnectionError(null);

      try {
        newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: VideoPresets.h720.resolution
          }
        });

        // Event listeners
        newRoom.on(RoomEvent.Connected, () => {
          setIsConnecting(false);
          updateParticipants(newRoom!);
        });

        newRoom.on(RoomEvent.ParticipantConnected, () => {
          updateParticipants(newRoom!);
        });

        newRoom.on(RoomEvent.ParticipantDisconnected, (p) => {
          updateParticipants(newRoom!);
          addToast(`${p.name || p.identity} left the room`, 'info');
        });

        newRoom.on(RoomEvent.TrackSubscribed, () => {
          updateParticipants(newRoom!);
        });

        newRoom.on(RoomEvent.TrackUnsubscribed, () => {
          updateParticipants(newRoom!);
        });

        newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          if (speakers.length > 0) {
            setActiveSpeakerId(speakers[0].identity);
          } else {
            setActiveSpeakerId(null);
          }
        });

        newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
          try {
            const str = new TextDecoder().decode(payload);
            const data = JSON.parse(str);
            if (data.type === 'chat') {
              setChatMessages(prev => [...prev, data.message]);
              if (activeDrawer !== 'chat') {
                setUnreadChatCount(prev => prev + 1);
              }
            }
          } catch {}
        });

        newRoom.on(RoomEvent.Disconnected, () => {
          onLeave();
        });

        // Connect
        const wsUrl = livekitUrl.startsWith('ws') ? livekitUrl : `wss://${livekitUrl.replace(/^https?:\/\//, '')}`;
        await newRoom.connect(wsUrl, token);

        // Publish local camera and mic
        await newRoom.localParticipant.enableCameraAndMicrophone();

        setRoom(newRoom);
        updateParticipants(newRoom);
      } catch (err: any) {
        console.error('LiveKit connection error:', err);
        setConnectionError(err.message || 'Failed to connect to LiveKit server');
        setIsConnecting(false);
      }
    };

    connectToLiveKit();

    return () => {
      if (newRoom) {
        newRoom.disconnect();
      }
    };
  }, [token, livekitUrl]);

  const updateParticipants = (r: Room) => {
    const all = Array.from(r.remoteParticipants.values()) as Participant[];
    if (r.localParticipant) {
      all.unshift(r.localParticipant);
    }
    setParticipants(all);
  };

  // Toggle Mic
  const toggleMic = async () => {
    if (!room) return;
    const newState = !micOn;
    await room.localParticipant.setMicrophoneEnabled(newState);
    setMicOn(newState);
  };

  // Toggle Camera
  const toggleCam = async () => {
    if (!room) return;
    const newState = !camOn;
    await room.localParticipant.setCameraEnabled(newState);
    setCamOn(newState);
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!room) return;
    try {
      const newState = !screenSharing;
      await room.localParticipant.setScreenShareEnabled(newState);
      setScreenSharing(newState);
    } catch (err: any) {
      addToast(err.message || 'Screen sharing failed', 'error');
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
        setWaitingParticipants(prev => admitAll ? [] : prev.filter(w => w.id !== pId));
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

  // Send Real-Time Chat Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const messageText = chatInput.trim();
    setChatInput('');

    const newMsgObj = {
      id: `msg_${Date.now()}`,
      senderId: identity,
      senderName: displayName,
      message: messageText,
      createdAt: new Date().toISOString()
    };

    // Broadcast via LiveKit Data Message
    if (room) {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: 'chat',
          message: newMsgObj
        })
      );
      try {
        await room.localParticipant.publishData(payload, DataPacket_Kind.RELIABLE);
      } catch {}
    }

    // Save to MongoDB
    try {
      await fetch(`/api/meetings/${meeting.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          senderName: displayName,
          senderId: identity
        })
      });
    } catch {}

    setChatMessages(prev => [...prev, newMsgObj]);
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

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-serif font-bold">Joining LiveKit Meeting Room...</h2>
        <p className="text-xs text-slate-400 mt-1">Establishing encrypted WebRTC media connection</p>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-white">Connection Error</h2>
          <p className="text-slate-400 text-xs">{connectionError}</p>
          <button
            onClick={onLeave}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Back to Meeting Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none z-50 font-sans"
    >
      {/* Top Header Bar */}
      <header className="h-16 px-6 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between z-20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="NexGen" className="h-8 w-8 object-contain" />
          <div>
            <h1 className="text-sm sm:text-base font-serif font-bold text-white leading-tight truncate max-w-xs sm:max-w-md">
              {meeting.title}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="text-amber-400">{formatTime(meetingSeconds)}</span>
              <span>•</span>
              <span className="text-slate-300">{participants.length} connected</span>
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
          {participants.map((p) => (
            <ParticipantTile
              key={p.identity}
              participant={p}
              isLocal={p === room?.localParticipant}
              isSpeaking={p.identity === activeSpeakerId}
            />
          ))}
        </div>

        {/* Right Drawer Panel (Participants / Chat) */}
        {activeDrawer && (
          <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-30 shadow-2xl transition-all">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {activeDrawer === 'participants' && (
                  <>
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Meeting Participants ({participants.length})</span>
                  </>
                )}
                {activeDrawer === 'chat' && (
                  <>
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>In-Meeting Chat</span>
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
                      {waitingParticipants.map(wp => (
                        <div key={wp.id} className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                          <span className="font-semibold text-white truncate max-w-[130px]">{wp.displayName}</span>
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
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Connected ({participants.length})</div>
                  {participants.map(p => (
                    <div key={p.identity} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-amber-300 font-bold flex items-center justify-center text-xs border border-slate-700">
                          {p.name ? p.name.slice(0, 2).toUpperCase() : 'PT'}
                        </div>
                        <div>
                          <div className="font-semibold text-white">
                            {p.name || p.identity} {p === room?.localParticipant && '(You)'}
                          </div>
                          <div className="text-[10px] text-slate-500 capitalize">{p.identity === meeting.hostId ? 'Host' : 'Participant'}</div>
                        </div>
                      </div>

                      {/* Host Actions */}
                      {isHost && p !== room?.localParticipant && (
                        <button
                          onClick={() => handleKickParticipant(p.identity)}
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
                      No chat messages yet. Start the discussion below.
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-amber-300">{msg.senderName}</span>
                          <span className="text-slate-500">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
          LiveKit Encrypted RTC
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
            title="In-Meeting Chat"
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
            onClick={() => room?.disconnect()}
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

// Sub-component: Participant Video Tile
const ParticipantTile: React.FC<{
  participant: Participant;
  isLocal: boolean;
  isSpeaking: boolean;
}> = ({ participant, isLocal, isSpeaking }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const handleSubscribed = (pub: RemoteTrackPublication) => {
      if (pub.kind === Track.Kind.Video && videoRef.current) {
        pub.videoTrack?.attach(videoRef.current);
      }
      if (pub.kind === Track.Kind.Audio && audioRef.current && !isLocal) {
        pub.audioTrack?.attach(audioRef.current);
      }
    };

    if (isLocal) {
      const videoPub = Array.from(participant.videoTrackPublications.values())[0] as any;
      if (videoPub && videoPub.videoTrack && videoRef.current) {
        videoPub.videoTrack.attach(videoRef.current);
      }
    } else {
      participant.trackPublications.forEach((pub) => {
        if (pub.isSubscribed) {
          handleSubscribed(pub as RemoteTrackPublication);
        }
      });
    }
  }, [participant, isLocal]);

  return (
    <div
      className={`relative w-full h-full bg-slate-900 rounded-3xl overflow-hidden border transition-all shadow-xl flex items-center justify-center aspect-video ${
        isSpeaking ? 'border-2 border-emerald-400 ring-4 ring-emerald-500/20' : 'border-slate-800'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isLocal ? 'transform -scale-x-100' : ''}`}
      />
      <audio ref={audioRef} autoPlay />

      {/* Participant Name Overlay */}
      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-white flex items-center gap-2">
        <span>{participant.name || participant.identity} {isLocal && '(You)'}</span>
        {isSpeaking && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        )}
      </div>
    </div>
  );
};
