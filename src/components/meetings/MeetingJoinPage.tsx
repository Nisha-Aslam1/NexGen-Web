import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ShieldAlert,
  Lock,
  UserCheck,
  ArrowRight,
  RefreshCw,
  LogOut
} from 'lucide-react';

interface MeetingJoinPageProps {
  meetingCode: string;
  onAdmitted: (data: {
    meeting: any;
    role: string;
    identity: string;
    displayName: string;
    email?: string;
    jitsiDomain?: string;
    jitsiRoomName?: string;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
  }) => void;
  onWaiting: (data: {
    meeting: any;
    participantId: string;
    identity: string;
    displayName: string;
    email?: string;
    startWithAudioMuted?: boolean;
    startWithVideoMuted?: boolean;
  }) => void;
}

export const MeetingJoinPage: React.FC<MeetingJoinPageProps> = ({ meetingCode, onAdmitted, onWaiting }) => {
  const { currentUser, addToast, setActivePage } = useApp();

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(currentUser?.name || '');
  const [guestEmail, setGuestEmail] = useState(currentUser?.email || '');
  const [password, setPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Pre-join camera/mic controls
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/meetings/${encodeURIComponent(meetingCode)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Meeting not found');
        }
        setMeeting(data.meeting);
        if (data.meeting?.startWithAudioMuted) setMicEnabled(false);
        if (data.meeting?.startWithVideoMuted) setCamEnabled(false);
      } catch (err: any) {
        setError(err.message || 'Could not load meeting');
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [meetingCode]);

  const startPreview = async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: micEnabled ? { deviceId: selectedAudioId ? { exact: selectedAudioId } : undefined } : false,
        video: camEnabled ? { deviceId: selectedVideoId ? { exact: selectedVideoId } : undefined } : false
      };

      if (!micEnabled && !camEnabled) {
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
    } catch {
      // Camera or microphone permission denied or unavailable
    }
  };

  useEffect(() => {
    if (!loading && meeting) {
      startPreview();
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [camEnabled, micEnabled, selectedAudioId, selectedVideoId, loading, meeting]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      addToast('Please enter your name to join the meeting', 'error');
      return;
    }

    setIsJoining(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('ng_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingCode)}/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: guestEmail.trim(),
          password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join meeting');
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const muteAudio = Boolean(data.startWithAudioMuted) || !micEnabled;
      const muteVideo = Boolean(data.startWithVideoMuted) || !camEnabled;

      if (data.waitingRoom) {
        onWaiting({
          meeting: data.meeting,
          participantId: data.participantId,
          identity: data.identity,
          displayName: data.displayName,
          email: data.email || guestEmail.trim(),
          startWithAudioMuted: muteAudio,
          startWithVideoMuted: muteVideo
        });
      } else {
        onAdmitted({
          meeting: data.meeting,
          role: data.role,
          identity: data.identity,
          displayName: data.displayName,
          email: data.email || guestEmail.trim(),
          jitsiDomain: data.jitsiDomain,
          jitsiRoomName: data.jitsiRoomName,
          startWithAudioMuted: muteAudio,
          startWithVideoMuted: muteVideo
        });
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-11 h-11 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-serif font-bold">Loading Meeting Room...</h2>
        <p className="text-xs text-slate-400 mt-1">Checking room details and access rules</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-white">Meeting Unavailable</h2>
          <p className="text-slate-400 text-sm">{error || 'The meeting room link is invalid, expired, or ended.'}</p>
          <button
            onClick={() => setActivePage('home')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Return to NexGen Council
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="NexGen Council" className="h-9 w-9 object-contain" />
          <div>
            <span className="font-serif font-bold text-white text-base block leading-none">NexGen Council Conferencing</span>
            <span className="text-[11px] text-amber-400 tracking-wide font-medium">Embedded Secure Video Portal</span>
          </div>
        </div>

        <button
          onClick={() => setActivePage('home')}
          className="text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </header>

      {/* Main Pre-Join Content */}
      <main className="max-w-6xl mx-auto w-full px-4 py-8 flex-1 flex flex-col lg:flex-row items-center justify-center gap-10">
        {/* Camera Preview Box */}
        <div className="w-full lg:w-1/2 space-y-4">
          <div className="relative aspect-video bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
            {camEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="text-center space-y-2 text-slate-500">
                <VideoOff className="w-12 h-12 mx-auto text-slate-600" />
                <p className="text-xs font-medium">Camera muted before joining</p>
              </div>
            )}

            {/* Quick Mic/Camera Toggles */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-950/85 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-800 shadow-lg">
              <button
                type="button"
                onClick={() => setMicEnabled(!micEnabled)}
                className={`p-3 rounded-xl transition-colors cursor-pointer ${
                  micEnabled
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
                title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() => setCamEnabled(!camEnabled)}
                className={`p-3 rounded-xl transition-colors cursor-pointer ${
                  camEnabled
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
                title={camEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Device Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {audioDevices.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Microphone</label>
                <select
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {audioDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 5)}`}</option>
                  ))}
                </select>
              </div>
            )}

            {videoDevices.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Camera</label>
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {videoDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Clean Guest Pre-Join Card */}
        <div className="w-full lg:w-1/2 max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-blue-400 mb-2">
              <Video className="w-4 h-4" />
              <span>NexGen Meeting Room</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-400">{meeting.meetingCode}</span>
            </div>
            <h1 className="text-2xl font-serif font-bold text-white leading-snug">{meeting.title}</h1>
            {meeting.description && (
              <p className="text-slate-400 text-xs mt-1.5 line-clamp-2">{meeting.description}</p>
            )}
            <div className="text-xs text-slate-400 mt-2.5 font-medium">
              Hosted by <span className="text-amber-400 font-semibold">{meeting.hostName}</span>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Your Name *
              </label>
              <input
                type="text"
                required
                placeholder="Enter your full name..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            {!currentUser && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {meeting.hasPassword && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Room Password / Access PIN *</span>
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter room password or PIN..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            )}

            {meeting.waitingRoomEnabled && (
              <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-xs text-indigo-300 flex items-start gap-2.5">
                <UserCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>Lobby is enabled. The host will admit you into the meeting shortly after submitting.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isJoining}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isJoining ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Launching Meeting...</span>
                </>
              ) : (
                <>
                  <span>{meeting.waitingRoomEnabled ? 'Request Admission' : 'Join Meeting'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-500 border-t border-slate-900">
        NexGen Council Secure Video Conferencing
      </footer>
    </div>
  );
};
