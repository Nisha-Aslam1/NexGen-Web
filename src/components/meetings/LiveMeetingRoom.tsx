import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Check,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  MonitorUp,
  LayoutGrid,
  Lock,
  Unlock,
  VolumeX,
  Share2,
  UserCheck,
  Megaphone,
  Award,
  Minus,
  Plus,
  Clock,
  PenTool,
  Camera,
  CircleDot
} from 'lucide-react';
import { MeetingWhiteboard, WhiteboardSnapshot } from './MeetingWhiteboard.tsx';

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, any>) => any;
  }
}

interface RaisedHandEntry {
  identity: string;
  displayName: string;
  raisedAt: number;
}

interface RoomAnnouncement {
  id: string;
  text: string;
  senderName: string;
  createdAt: number;
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
  whiteboardOpen?: boolean;
  onWhiteboardOpenChange?: (open: boolean) => void;
  whiteboardSplitMode?: 'split' | 'full';
  onWhiteboardSplitModeChange?: (mode: 'split' | 'full') => void;
  onLeave: (durationSeconds?: number, reason?: string) => void;
  onMovedToWaiting?: () => void;
}

type DrawerType = 'participants' | 'chat' | 'host' | null;

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
  whiteboardOpen: controlledWhiteboardOpen,
  onWhiteboardOpenChange,
  whiteboardSplitMode: controlledSplitMode,
  onWhiteboardSplitModeChange,
  onLeave,
  onMovedToWaiting
}) => {
  const { addToast, authToken, currentUser } = useApp();

  const [jitsiLoading, setJitsiLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Synced Jitsi Media & Room State
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(
    initialAudioMuted !== undefined ? initialAudioMuted : Boolean(meeting?.startWithAudioMuted)
  );
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(
    initialVideoMuted !== undefined ? initialVideoMuted : Boolean(meeting?.startWithVideoMuted)
  );
  const [isHandRaised, setIsHandRaised] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isTileView, setIsTileView] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingDisplayStreamRef = useRef<MediaStream | null>(null);
  const recordingMicStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingUploadPromiseRef = useRef<Promise<void> | null>(null);

  // Dynamic Live Host / Co-Host & Room Security State
  const [currentRole, setCurrentRole] = useState<string>(role || 'participant');
  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(Boolean(meeting?.isLocked));
  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState<boolean>(
    Boolean(meeting?.waitingRoomEnabled)
  );
  const [screenSharingAllowed, setScreenSharingAllowed] = useState<boolean>(
    meeting?.screenShareEnabled !== false
  );
  const [chatDisabled, setChatDisabled] = useState<boolean>(false);
  const [micsLocked, setMicsLocked] = useState<boolean>(false);
  const [mediaStates, setMediaStates] = useState<Record<string, { audioMuted: boolean; videoMuted: boolean }>>({});
  const [unmutePromptFromHost, setUnmutePromptFromHost] = useState<string | null>(null);
  const [maxParticipants, setMaxParticipants] = useState<number>(meeting?.maxParticipants || 50);
  const [capacityDraft, setCapacityDraft] = useState<string>(String(meeting?.maxParticipants || 50));
  const [isUpdatingCapacity, setIsUpdatingCapacity] = useState<boolean>(false);

  const [raisedHands, setRaisedHands] = useState<RaisedHandEntry[]>([]);
  const [announcement, setAnnouncement] = useState<RoomAnnouncement | null>(null);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<string | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState<string>('');

  const [confirmEndPrompt, setConfirmEndPrompt] = useState<boolean>(false);
  const [confirmKickIdentity, setConfirmKickIdentity] = useState<string | null>(null);

  // Drawer & UI State
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [meetingSeconds, setMeetingSeconds] = useState(0);

  // Waiting Room & Roster
  const [waitingParticipants, setWaitingParticipants] = useState<any[]>([]);
  const [participantsList, setParticipantsList] = useState<any[]>([]);

  // Persistent Chat / Council Notes
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const lastSeenChatCountRef = useRef<number>(0);
  const [chatInput, setChatInput] = useState('');

  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // Interactive Whiteboard State (controlled by MeetingRoomWrapper when provided)
  const [internalWhiteboardOpen, setInternalWhiteboardOpen] = useState<boolean>(false);
  const [internalSplitMode, setInternalSplitMode] = useState<'split' | 'full'>('split');
  const [whiteboardSnapshot, setWhiteboardSnapshot] = useState<WhiteboardSnapshot | null>(null);
  const [whiteboardEvent, setWhiteboardEvent] = useState<{ seq: number; payload: any } | null>(null);
  const [whiteboardHasContent, setWhiteboardHasContent] = useState<boolean>(false);
  const wbEventSeqRef = useRef<number>(0);
  const lastSyncedWbVersionRef = useRef<number>(0);

  const effectiveWhiteboardOpen =
    controlledWhiteboardOpen !== undefined ? controlledWhiteboardOpen : internalWhiteboardOpen;
  const setWhiteboardOpen = (next: boolean) => {
    if (onWhiteboardOpenChange) onWhiteboardOpenChange(next);
    else setInternalWhiteboardOpen(next);
  };
  const effectiveSplitMode =
    controlledSplitMode !== undefined ? controlledSplitMode : internalSplitMode;
  const setSplitMode = (next: 'split' | 'full') => {
    if (onWhiteboardSplitModeChange) onWhiteboardSplitModeChange(next);
    else setInternalSplitMode(next);
  };

  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);
  const jitsiApiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const hasExitedRef = useRef(false);
  const hasNotifiedLeaveRef = useRef(false);
  const meetingSecondsRef = useRef(0);
  const activeDrawerRef = useRef<DrawerType>(null);
  const localJitsiIdRef = useRef<string | null>(null);
  const isAudioMutedRef = useRef<boolean>(isAudioMuted);
  const isVideoMutedRef = useRef<boolean>(isVideoMuted);
  const micsLockedRef = useRef<boolean>(micsLocked);
  const hostUnmuteGrantedRef = useRef<boolean>(false);
  const lastHandledMuteAllAtRef = useRef<number>(0);
  const lastHandledStopAllVideoAtRef = useRef<number>(0);
  const jitsiParticipantsMapRef = useRef<Map<string, string>>(new Map());

  const isPrimaryHost = role === 'host' || meeting?.hostId === identity;
  const isHost = isPrimaryHost || currentRole === 'host' || currentRole === 'co-host';

  useEffect(() => {
    setCurrentRole(role || 'participant');
  }, [role]);

  useEffect(() => {
    if (typeof meeting?.maxParticipants === 'number' && meeting.maxParticipants >= 2) {
      setMaxParticipants(meeting.maxParticipants);
      setCapacityDraft(String(meeting.maxParticipants));
    }
  }, [meeting?.maxParticipants]);

  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted;
    if (!isAudioMuted) {
      setUnmutePromptFromHost(null);
    }
  }, [isAudioMuted]);

  useEffect(() => {
    isVideoMutedRef.current = isVideoMuted;
  }, [isVideoMuted]);

  useEffect(() => {
    micsLockedRef.current = micsLocked;
  }, [micsLocked]);

  useEffect(() => {
    activeDrawerRef.current = activeDrawer;
    if (activeDrawer === 'chat') {
      setUnreadChatCount(0);
      lastSeenChatCountRef.current = chatMessages.length;
    }
  }, [activeDrawer, chatMessages.length]);

  useEffect(() => {
    meetingSecondsRef.current = meetingSeconds;
  }, [meetingSeconds]);

  const buildControlHeaders = useCallback(
    (withJson = false): Record<string, string> => {
      const headers: Record<string, string> = {
        'x-meeting-identity': identity
      };
      if (withJson) headers['Content-Type'] = 'application/json';
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      return headers;
    },
    [identity, authToken]
  );

  // Sync fullscreenchange listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  const notifyServerLeave = (preferBeacon = false) => {
    if (!meeting?.id || hasNotifiedLeaveRef.current) return;
    hasNotifiedLeaveRef.current = true;
    const url = `/api/meetings/${meeting.id}/leave`;
    const payload = JSON.stringify({ identity });
    try {
      if (preferBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const queued = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        if (queued) return;
      }
      fetch(url, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: payload,
        keepalive: true
      }).catch(() => {});
    } catch {}
  };

  useEffect(() => {
    const handleUnloadExit = () => {
      notifyServerLeave(true);
    };
    window.addEventListener('pagehide', handleUnloadExit);
    window.addEventListener('beforeunload', handleUnloadExit);
    return () => {
      window.removeEventListener('pagehide', handleUnloadExit);
      window.removeEventListener('beforeunload', handleUnloadExit);
      if (!hasExitedRef.current) {
        notifyServerLeave(true);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      recordingDisplayStreamRef.current?.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      recordingMicStreamRef.current?.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      if (recordingAudioCtxRef.current) {
        try { recordingAudioCtxRef.current.close(); } catch {}
      }
    };
  }, [meeting?.id, identity]);

  const triggerSafeExit = async (reason?: string, notifyLeave = false) => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;

    if (isRecordingRef.current || (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') || recordingUploadPromiseRef.current) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.requestData();
        } catch {}
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      setIsRecording(false);
      isRecordingRef.current = false;
      await new Promise(resolve => setTimeout(resolve, 150));
      if (recordingUploadPromiseRef.current) {
        addToast('Finalizing & saving meeting recording...', 'info');
        await Promise.race([
          recordingUploadPromiseRef.current,
          new Promise<void>(resolve => setTimeout(resolve, 20000))
        ]);
      }
    }

    if (notifyLeave) notifyServerLeave();
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.executeCommand('hangup');
      } catch {}
      try {
        jitsiApiRef.current.dispose();
      } catch {}
      jitsiApiRef.current = null;
    }
    onLeave(meetingSecondsRef.current, reason);
  };

  const triggerMoveToWaiting = (reason?: string) => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    hasNotifiedLeaveRef.current = true;
    if (jitsiApiRef.current) {
      try {
        jitsiApiRef.current.executeCommand('hangup');
      } catch {}
      try {
        jitsiApiRef.current.dispose();
      } catch {}
      jitsiApiRef.current = null;
    }
    if (onMovedToWaiting) {
      addToast(reason || 'The host moved you to the Waiting Lobby.', 'info');
      onMovedToWaiting();
    } else {
      onLeave(meetingSecondsRef.current, reason || 'The host moved you to the Waiting Lobby.');
    }
  };

  const reportLocalMediaState = (audioMutedVal: boolean, videoMutedVal: boolean) => {
    if (!meeting?.id || !identity || hasExitedRef.current) return;
    setMediaStates(prev => ({
      ...prev,
      [identity]: { audioMuted: audioMutedVal, videoMuted: videoMutedVal }
    }));
    fetch(`/api/meetings/${meeting.id}/media-state`, {
      method: 'POST',
      headers: buildControlHeaders(true),
      body: JSON.stringify({
        identity,
        audioMuted: audioMutedVal,
        videoMuted: videoMutedVal
      })
    }).catch(() => {});
  };

  const fetchWaitingAndParticipants = async () => {
    if (!meeting?.id) return;
    try {
      const headers = buildControlHeaders(false);

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

  const muteLocalMicIfNeeded = (reasonText: string) => {
    hostUnmuteGrantedRef.current = false;
    if (jitsiApiRef.current && !isAudioMutedRef.current) {
      try {
        jitsiApiRef.current.executeCommand('toggleAudio');
        setIsAudioMuted(true);
        reportLocalMediaState(true, isVideoMutedRef.current);
      } catch {}
    }
    addToast(reasonText, 'info');
  };

  const unmuteLocalMicFromHost = (triggeredBy?: string) => {
    hostUnmuteGrantedRef.current = true;
    if (jitsiApiRef.current && isAudioMutedRef.current) {
      try {
        jitsiApiRef.current.executeCommand('toggleAudio');
        addToast(`${triggeredBy || 'Host'} unmuted your microphone.`, 'info');
        setTimeout(() => {
          if (isAudioMutedRef.current && !hasExitedRef.current) {
            setUnmutePromptFromHost(triggeredBy || 'Host');
          }
        }, 900);
      } catch {
        setUnmutePromptFromHost(triggeredBy || 'Host');
      }
    } else {
      addToast(`${triggeredBy || 'Host'} allowed your microphone.`, 'info');
    }
  };

  const muteLocalVideoIfNeeded = (reasonText: string) => {
    if (jitsiApiRef.current && !isVideoMutedRef.current) {
      try {
        jitsiApiRef.current.executeCommand('toggleVideo');
        setIsVideoMuted(true);
        reportLocalMediaState(isAudioMutedRef.current, true);
      } catch {}
    }
    addToast(reasonText, 'info');
  };

  const applyMuteAllFromHost = (atTimestamp: number) => {
    if (!atTimestamp || atTimestamp <= lastHandledMuteAllAtRef.current) return;
    lastHandledMuteAllAtRef.current = atTimestamp;
    if (!isHost) {
      muteLocalMicIfNeeded('Your microphone was muted by the host.');
    }
  };

  const applyStopAllVideoFromHost = (atTimestamp: number) => {
    if (!atTimestamp || atTimestamp <= lastHandledStopAllVideoAtRef.current) return;
    lastHandledStopAllVideoAtRef.current = atTimestamp;
    if (!isHost) {
      muteLocalVideoIfNeeded('Host turned off all participant cameras.');
    }
  };

  // Authoritative live-state sync + real-time SSE room channel
  useEffect(() => {
    if (!meeting?.id) return;
    let disposed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const syncLiveState = async () => {
      if (disposed || hasExitedRef.current) return;
      try {
        const res = await fetch(
          `/api/meetings/${meeting.id}/live-state?identity=${encodeURIComponent(identity)}`,
          { headers: buildControlHeaders(false) }
        );
        if (!res.ok || disposed) return;
        const data = await res.json();

        if (data.meeting) {
          setIsRoomLocked(Boolean(data.meeting.isLocked));
          setIsWaitingRoomEnabled(Boolean(data.meeting.waitingRoomEnabled));
          setScreenSharingAllowed(data.meeting.screenShareEnabled !== false);
          if (typeof data.meeting.maxParticipants === 'number' && data.meeting.maxParticipants >= 2) {
            setMaxParticipants(data.meeting.maxParticipants);
            setCapacityDraft(prev =>
              document.activeElement?.getAttribute('data-capacity-input') === 'true'
                ? prev
                : String(data.meeting.maxParticipants)
            );
          }
          if (data.meeting.status === 'Ended' || data.meeting.status === 'Cancelled') {
            addToast('The host has ended this meeting for everyone.', 'info');
            triggerSafeExit('The host has ended this meeting for everyone.');
            return;
          }
        }

        if (data.isKicked) {
          addToast('You were removed from the meeting by the host.', 'error');
          triggerSafeExit('You were removed from the meeting by the host.');
          return;
        }

        if (data.isMovedToWaiting) {
          triggerMoveToWaiting('The host moved you to the Waiting Lobby.');
          return;
        }

        if (typeof data.chatDisabled === 'boolean') {
          setChatDisabled(data.chatDisabled);
        }
        if (typeof data.micsLocked === 'boolean') {
          setMicsLocked(data.micsLocked);
        }
        if (data.mediaStates && typeof data.mediaStates === 'object') {
          setMediaStates(data.mediaStates);
        }
        if (data.selfRole && !isPrimaryHost) {
          setCurrentRole(data.selfRole);
        }
        if (Array.isArray(data.raisedHands)) {
          setRaisedHands(data.raisedHands);
          setIsHandRaised(data.raisedHands.some((h: RaisedHandEntry) => h.identity === identity));
        }
        if ('announcement' in data) {
          setAnnouncement(data.announcement || null);
        }
        if (Array.isArray(data.participants)) {
          setParticipantsList(data.participants);
        }
        if (isHost && Array.isArray(data.waiting)) {
          setWaitingParticipants(data.waiting);
        }
        if (typeof data.muteAllAt === 'number' && data.muteAllAt > lastHandledMuteAllAtRef.current) {
          if (lastHandledMuteAllAtRef.current !== 0) {
            applyMuteAllFromHost(data.muteAllAt);
          } else {
            lastHandledMuteAllAtRef.current = data.muteAllAt;
          }
        }
        if (
          typeof data.stopAllVideoAt === 'number' &&
          data.stopAllVideoAt > lastHandledStopAllVideoAtRef.current
        ) {
          if (lastHandledStopAllVideoAtRef.current !== 0) {
            applyStopAllVideoFromHost(data.stopAllVideoAt);
          } else {
            lastHandledStopAllVideoAtRef.current = data.stopAllVideoAt;
          }
        }
        if (typeof data.whiteboardElementCount === 'number') {
          setWhiteboardHasContent(data.whiteboardElementCount > 0 || Boolean(data.whiteboardPresentedByHost));
        }
        if (
          typeof data.whiteboardUpdatedAt === 'number' &&
          data.whiteboardUpdatedAt > lastSyncedWbVersionRef.current
        ) {
          lastSyncedWbVersionRef.current = data.whiteboardUpdatedAt;
          try {
            const wbRes = await fetch(`/api/meetings/${meeting.id}/whiteboard`, {
              headers: buildControlHeaders(false)
            });
            if (wbRes.ok && !disposed) {
              const wbData = await wbRes.json();
              if (wbData.whiteboard) {
                setWhiteboardSnapshot(wbData.whiteboard);
                wbEventSeqRef.current += 1;
                setWhiteboardEvent({
                  seq: wbEventSeqRef.current,
                  payload: { type: 'whiteboard_snapshot_sync', whiteboard: wbData.whiteboard }
                });
              }
            }
          } catch {}
        }
      } catch {}
    };

    const connectSse = () => {
      if (disposed || hasExitedRef.current || typeof EventSource === 'undefined') return;
      try {
        eventSource = new EventSource(
          `/api/meetings/${meeting.id}/events?identity=${encodeURIComponent(identity)}`
        );

        eventSource.onopen = () => {
          if (!disposed) setRealtimeConnected(true);
        };

        eventSource.onmessage = (evt) => {
          if (disposed || hasExitedRef.current) return;
          try {
            const payload = JSON.parse(evt.data);
            switch (payload.type) {
              case 'snapshot': {
                setRealtimeConnected(true);
                if (typeof payload.muteAllAt === 'number') {
                  lastHandledMuteAllAtRef.current = Math.max(
                    lastHandledMuteAllAtRef.current,
                    payload.muteAllAt
                  );
                }
                if (typeof payload.stopAllVideoAt === 'number') {
                  lastHandledStopAllVideoAtRef.current = Math.max(
                    lastHandledStopAllVideoAtRef.current,
                    payload.stopAllVideoAt
                  );
                }
                if (payload.meeting) {
                  setIsRoomLocked(Boolean(payload.meeting.isLocked));
                  setIsWaitingRoomEnabled(Boolean(payload.meeting.waitingRoomEnabled));
                  setScreenSharingAllowed(payload.meeting.screenShareEnabled !== false);
                  if (typeof payload.meeting.maxParticipants === 'number' && payload.meeting.maxParticipants >= 2) {
                    setMaxParticipants(payload.meeting.maxParticipants);
                    setCapacityDraft(String(payload.meeting.maxParticipants));
                  }
                }
                if (typeof payload.chatDisabled === 'boolean') {
                  setChatDisabled(payload.chatDisabled);
                }
                if (typeof payload.micsLocked === 'boolean') {
                  setMicsLocked(payload.micsLocked);
                }
                if (payload.mediaStates && typeof payload.mediaStates === 'object') {
                  setMediaStates(payload.mediaStates);
                }
                if (Array.isArray(payload.raisedHands)) {
                  setRaisedHands(payload.raisedHands);
                  setIsHandRaised(
                    payload.raisedHands.some((h: RaisedHandEntry) => h.identity === identity)
                  );
                }
                if ('announcement' in payload) {
                  setAnnouncement(payload.announcement || null);
                }
                if (payload.selfRole && !isPrimaryHost) {
                  setCurrentRole(payload.selfRole);
                }
                if (payload.whiteboard) {
                  setWhiteboardSnapshot(payload.whiteboard);
                  lastSyncedWbVersionRef.current = Math.max(
                    lastSyncedWbVersionRef.current,
                    payload.whiteboard.updatedAt || 0
                  );
                  setWhiteboardHasContent(
                    (payload.whiteboard.elements?.length || 0) > 0 || Boolean(payload.whiteboard.presentedByHost)
                  );
                  wbEventSeqRef.current += 1;
                  setWhiteboardEvent({
                    seq: wbEventSeqRef.current,
                    payload: { type: 'whiteboard_snapshot_sync', whiteboard: payload.whiteboard }
                  });
                  if (payload.whiteboard.presentedByHost) {
                    setWhiteboardOpen(true);
                  }
                }
                break;
              }
              case 'meeting_ended': {
                addToast('The host has ended this meeting for everyone.', 'info');
                triggerSafeExit(payload.reason || 'The host has ended this meeting for everyone.');
                break;
              }
              case 'participant_kicked': {
                if (
                  payload.targetIdentity === identity ||
                  payload.targetParticipantId === identity ||
                  (currentUser?.id && payload.targetUserId === currentUser.id)
                ) {
                  addToast('You were removed from the meeting by the host.', 'error');
                  triggerSafeExit(payload.reason || 'You were removed from the meeting by the host.');
                } else {
                  fetchWaitingAndParticipants();
                }
                break;
              }
              case 'moved_to_waiting': {
                if (
                  !isPrimaryHost &&
                  (payload.targetIdentity === identity ||
                    payload.targetParticipantId === identity ||
                    (currentUser?.id && payload.targetUserId === currentUser.id))
                ) {
                  triggerMoveToWaiting(payload.reason || 'The host moved you to the Waiting Lobby.');
                } else {
                  fetchWaitingAndParticipants();
                }
                break;
              }
              case 'mute_all': {
                applyMuteAllFromHost(payload.at || Date.now());
                break;
              }
              case 'stop_all_video': {
                applyStopAllVideoFromHost(payload.at || Date.now());
                break;
              }
              case 'mute_participant': {
                if (
                  payload.targetIdentity === identity ||
                  payload.targetParticipantId === identity ||
                  (currentUser?.id && payload.targetUserId === currentUser.id)
                ) {
                  muteLocalMicIfNeeded('Host muted your microphone.');
                }
                break;
              }
              case 'media_action': {
                const isTarget =
                  payload.targetIdentity === identity ||
                  payload.targetParticipantId === identity ||
                  (currentUser?.id && payload.targetUserId === currentUser.id);
                if (isTarget) {
                  if (payload.action === 'mute_audio') {
                    muteLocalMicIfNeeded(`${payload.triggeredBy || 'Host'} muted your microphone.`);
                  } else if (payload.action === 'unmute_audio') {
                    unmuteLocalMicFromHost(payload.triggeredBy);
                  } else if (payload.action === 'mute_video') {
                    muteLocalVideoIfNeeded(`${payload.triggeredBy || 'Host'} turned off your camera.`);
                  }
                }
                break;
              }
              case 'media_state_updated': {
                if (payload.mediaStates && typeof payload.mediaStates === 'object') {
                  setMediaStates(payload.mediaStates);
                }
                break;
              }
              case 'hand_updated': {
                if (Array.isArray(payload.raisedHands)) {
                  setRaisedHands(payload.raisedHands);
                  setIsHandRaised(
                    payload.raisedHands.some((h: RaisedHandEntry) => h.identity === identity)
                  );
                }
                break;
              }
              case 'room_announcement': {
                setAnnouncement(payload.announcement || null);
                setDismissedAnnouncementId(null);
                if (payload.announcement?.text) {
                  addToast(`Announcement: ${payload.announcement.text}`, 'info');
                }
                break;
              }
              case 'role_updated': {
                if (
                  (payload.targetIdentity === identity || payload.targetParticipantId === identity) &&
                  !isPrimaryHost
                ) {
                  setCurrentRole(payload.role);
                  addToast(
                    payload.role === 'co-host'
                      ? 'You were promoted to Co-Host! Host controls are now unlocked.'
                      : 'Your Co-Host role was returned to Participant.',
                    'info'
                  );
                }
                fetchWaitingAndParticipants();
                break;
              }
              case 'room_updated': {
                if (typeof payload.isLocked === 'boolean') {
                  setIsRoomLocked(payload.isLocked);
                }
                if (typeof payload.waitingRoomEnabled === 'boolean') {
                  setIsWaitingRoomEnabled(payload.waitingRoomEnabled);
                }
                if (typeof payload.screenShareEnabled === 'boolean') {
                  setScreenSharingAllowed(payload.screenShareEnabled);
                }
                if (typeof payload.chatDisabled === 'boolean') {
                  setChatDisabled(payload.chatDisabled);
                }
                if (typeof payload.micsLocked === 'boolean') {
                  setMicsLocked(payload.micsLocked);
                }
                if (typeof payload.maxParticipants === 'number' && payload.maxParticipants >= 2) {
                  setMaxParticipants(payload.maxParticipants);
                  setCapacityDraft(String(payload.maxParticipants));
                }
                if (payload.meeting) {
                  setIsRoomLocked(Boolean(payload.meeting.isLocked));
                  setIsWaitingRoomEnabled(Boolean(payload.meeting.waitingRoomEnabled));
                  setScreenSharingAllowed(payload.meeting.screenShareEnabled !== false);
                  if (typeof payload.meeting.maxParticipants === 'number' && payload.meeting.maxParticipants >= 2) {
                    setMaxParticipants(payload.meeting.maxParticipants);
                    setCapacityDraft(String(payload.meeting.maxParticipants));
                  }
                }
                break;
              }
              case 'participants_updated':
              case 'waiting_updated': {
                fetchWaitingAndParticipants();
                break;
              }
              case 'chat_message': {
                if (payload.message) {
                  setChatMessages(prev => {
                    if (prev.some(m => m.id === payload.message.id)) return prev;
                    const next = [...prev, payload.message];
                    if (activeDrawerRef.current === 'chat') {
                      lastSeenChatCountRef.current = next.length;
                      setUnreadChatCount(0);
                    } else {
                      setUnreadChatCount(c => c + 1);
                    }
                    return next;
                  });
                }
                break;
              }
              case 'whiteboard_op':
              case 'whiteboard_live': {
                if (typeof payload.updatedAt === 'number') {
                  lastSyncedWbVersionRef.current = Math.max(
                    lastSyncedWbVersionRef.current,
                    payload.updatedAt
                  );
                }
                if (payload.type === 'whiteboard_op') {
                  if (payload.action === 'add') setWhiteboardHasContent(true);
                  if (payload.action === 'clear' && payload.target === 'all') setWhiteboardHasContent(false);
                }
                wbEventSeqRef.current += 1;
                setWhiteboardEvent({ seq: wbEventSeqRef.current, payload });
                break;
              }
              case 'whiteboard_present': {
                if (typeof payload.updatedAt === 'number') {
                  lastSyncedWbVersionRef.current = Math.max(
                    lastSyncedWbVersionRef.current,
                    payload.updatedAt
                  );
                }
                wbEventSeqRef.current += 1;
                setWhiteboardEvent({ seq: wbEventSeqRef.current, payload });
                if (payload.presented) {
                  setWhiteboardHasContent(true);
                  setWhiteboardOpen(true);
                  addToast(`${payload.triggeredBy || 'Host'} opened the collaborative whiteboard.`, 'info');
                }
                break;
              }
            }
          } catch {}
        };

        eventSource.onerror = () => {
          if (disposed) return;
          setRealtimeConnected(false);
          try {
            eventSource?.close();
          } catch {}
          eventSource = null;
          reconnectTimer = setTimeout(connectSse, 3000);
        };
      } catch {
        setRealtimeConnected(false);
      }
    };

    syncLiveState();
    connectSse();
    const fallbackInterval = setInterval(syncLiveState, 5000);

    return () => {
      disposed = true;
      setRealtimeConnected(false);
      clearInterval(fallbackInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }
    };
  }, [meeting?.id, identity, isHost, isPrimaryHost, authToken]);

  // Initial Persistent Chat Load
  const fetchChatHistory = async () => {
    if (!meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages || [];
        setChatMessages(msgs);
        if (activeDrawerRef.current === 'chat') {
          lastSeenChatCountRef.current = msgs.length;
          setUnreadChatCount(0);
        } else if (msgs.length > lastSeenChatCountRef.current) {
          setUnreadChatCount(msgs.length - lastSeenChatCountRef.current);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchChatHistory();
  }, [meeting?.id]);

  // Dynamically load Jitsi External API
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
            subject: meeting?.title || 'NexGen Council Private Meeting',
            startWithAudioMuted: effectiveAudioMuted,
            startWithVideoMuted: effectiveVideoMuted,
            prejoinPageEnabled: false,
            enableWelcomePage: false,
            enableClosePage: false,
            feedbackPercentage: 0,
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

        api.addEventListener('videoConferenceJoined', (info: any) => {
          if (isMounted) {
            if (info?.id) localJitsiIdRef.current = info.id;
            setJitsiLoading(false);
            reportLocalMediaState(isAudioMutedRef.current, isVideoMutedRef.current);
          }
        });

        api.addEventListener('participantJoined', (info: any) => {
          if (info?.id && info?.displayName) {
            jitsiParticipantsMapRef.current.set(String(info.displayName).trim().toLowerCase(), info.id);
          }
        });

        api.addEventListener('participantLeft', (info: any) => {
          if (info?.id) {
            for (const [k, v] of jitsiParticipantsMapRef.current.entries()) {
              if (v === info.id) jitsiParticipantsMapRef.current.delete(k);
            }
          }
          if (isMounted) {
            setTimeout(() => {
              if (isMounted && !hasExitedRef.current) {
                fetchWaitingAndParticipants();
              }
            }, 700);
          }
        });

        api.addEventListener('audioMuteStatusChanged', (e: any) => {
          if (isMounted && typeof e?.muted === 'boolean') {
            if (!e.muted && micsLockedRef.current && !isHost && !hostUnmuteGrantedRef.current) {
              try {
                api.executeCommand('toggleAudio');
              } catch {}
              setIsAudioMuted(true);
              reportLocalMediaState(true, isVideoMutedRef.current);
              addToast('Microphones are locked by the host. Raise your hand to request unmute.', 'info');
              return;
            }
            if (e.muted) {
              hostUnmuteGrantedRef.current = false;
            }
            setIsAudioMuted(e.muted);
            reportLocalMediaState(e.muted, isVideoMutedRef.current);
          }
        });

        api.addEventListener('videoMuteStatusChanged', (e: any) => {
          if (isMounted && typeof e?.muted === 'boolean') {
            setIsVideoMuted(e.muted);
            reportLocalMediaState(isAudioMutedRef.current, e.muted);
          }
        });

        api.addEventListener('screenSharingStatusChanged', (e: any) => {
          if (isMounted && typeof e?.on === 'boolean') {
            setIsScreenSharing(e.on);
          }
        });

        api.addEventListener('tileViewChanged', (e: any) => {
          if (isMounted && typeof e?.enabled === 'boolean') {
            setIsTileView(e.enabled);
          }
        });

        api.addEventListener('raiseHandUpdated', (e: any) => {
          if (isMounted && e) {
            if (!localJitsiIdRef.current || !e.id || e.id === localJitsiIdRef.current) {
              const raised = Boolean(e.handRaised && e.handRaised !== 0);
              setIsHandRaised(raised);
            }
          }
        });

        api.addEventListener('videoConferenceLeft', () => {
          if (isMounted) {
            triggerSafeExit(undefined, true);
          }
        });

        api.addEventListener('readyToClose', () => {
          if (isMounted) {
            triggerSafeExit(undefined, true);
          }
        });

        api.addEventListener('errorOccurred', (err: any) => {
          console.error('[Jitsi Error Event]:', err);
          if (isMounted && err?.fatal) {
            setLoadError(err.message || 'A video conference connection error occurred.');
            setJitsiLoading(false);
          }
        });

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

  const executeJitsiCommand = (command: string, ...args: any[]) => {
    if (!jitsiApiRef.current) {
      addToast('Video controls are still connecting...', 'info');
      return;
    }
    try {
      jitsiApiRef.current.executeCommand(command, ...args);
    } catch {
      addToast('Unable to trigger that room action yet.', 'error');
    }
  };

  const cleanupRecordingStreams = () => {
    recordingDisplayStreamRef.current?.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
    recordingDisplayStreamRef.current = null;
    recordingMicStreamRef.current?.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
    recordingMicStreamRef.current = null;
    if (recordingAudioCtxRef.current) {
      try {
        recordingAudioCtxRef.current.close();
      } catch {}
      recordingAudioCtxRef.current = null;
    }
  };

  const stopRecordingAndAwaitUpload = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
      } catch {}
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
    isRecordingRef.current = false;

    // Wait briefly so onstop fires and sets recordingUploadPromiseRef
    await new Promise(resolve => setTimeout(resolve, 150));

    if (recordingUploadPromiseRef.current) {
      addToast('Finalizing & uploading meeting recording before exit...', 'info');
      await Promise.race([
        recordingUploadPromiseRef.current,
        new Promise<void>(resolve => setTimeout(resolve, 20000))
      ]);
    }
  };

  const handleStartStopRecording = async () => {
    if (isRecordingRef.current || isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.requestData();
        } catch {}
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      setIsRecording(false);
      isRecordingRef.current = false;
      return;
    }

    try {
      let displayStream: MediaStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' } as any,
          audio: true
        });
      } catch {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
      }
      recordingDisplayStreamRef.current = displayStream;

      // Also capture microphone audio when available so presenter voice is recorded along with room audio
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        recordingMicStreamRef.current = micStream;
      } catch {
        recordingMicStreamRef.current = null;
      }

      const videoTracks = displayStream.getVideoTracks();
      const displayAudioTracks = displayStream.getAudioTracks();
      const micAudioTracks = micStream ? micStream.getAudioTracks() : [];

      const mixedTracks: MediaStreamTrack[] = [...videoTracks];
      let hasCapturedAudio = false;

      if (displayAudioTracks.length > 0 && micAudioTracks.length > 0 && typeof AudioContext !== 'undefined') {
        try {
          const audioCtx = new AudioContext();
          recordingAudioCtxRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume().catch(() => {});
          }
          const destination = audioCtx.createMediaStreamDestination();
          audioCtx.createMediaStreamSource(new MediaStream(displayAudioTracks)).connect(destination);
          audioCtx.createMediaStreamSource(new MediaStream(micAudioTracks)).connect(destination);
          mixedTracks.push(...destination.stream.getAudioTracks());
          hasCapturedAudio = true;
        } catch {
          mixedTracks.push(...displayAudioTracks);
          hasCapturedAudio = true;
        }
      } else if (displayAudioTracks.length > 0) {
        mixedTracks.push(...displayAudioTracks);
        hasCapturedAudio = true;
      } else if (micAudioTracks.length > 0) {
        mixedTracks.push(...micAudioTracks);
        hasCapturedAudio = true;
      }

      const combinedStream = new MediaStream(mixedTracks);

      const candidateMimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4'
      ];
      const supportedMimeType =
        typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
          ? candidateMimeTypes.find(type => {
              try {
                return MediaRecorder.isTypeSupported(type);
              } catch {
                return false;
              }
            }) || ''
          : '';

      recordedChunksRef.current = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combinedStream, {
          ...(supportedMimeType ? { mimeType: supportedMimeType } : {}),
          videoBitsPerSecond: 1_500_000,
          audioBitsPerSecond: 128_000
        });
      } catch {
        recorder = supportedMimeType
          ? new MediaRecorder(combinedStream, { mimeType: supportedMimeType })
          : new MediaRecorder(combinedStream);
      }

      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      // If user clicks browser "Stop sharing" pill, finalize & upload cleanly
      if (videoTracks[0]) {
        videoTracks[0].onended = () => {
          setIsRecording(false);
          isRecordingRef.current = false;
          if (recorder.state !== 'inactive') {
            try {
              recorder.requestData();
            } catch {}
            try {
              recorder.stop();
            } catch {}
          }
        };
      }

      recorder.onstop = () => {
        setIsRecording(false);
        isRecordingRef.current = false;
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartTimeRef.current) / 1000));
        const resolvedMime = (recorder.mimeType || supportedMimeType || 'video/webm').split(';')[0].trim();
        const blob = new Blob(recordedChunksRef.current, { type: resolvedMime || 'video/webm' });
        recordedChunksRef.current = [];
        cleanupRecordingStreams();

        if (!blob || blob.size === 0) {
          addToast('Recording was empty. Keep screen share active while recording.', 'error');
          return;
        }

        const ext = resolvedMime.includes('mp4') ? 'mp4' : 'webm';
        const uploadFilename = `recording_${meeting.meetingCode}_${Date.now()}.${ext}`;

        const uploadPromise = (async () => {
          try {
            addToast('Saving meeting recording to Admin Archive...', 'info');
            const params = new URLSearchParams({
              kind: 'recording',
              filename: uploadFilename,
              mimeType: resolvedMime || 'video/webm',
              durationSeconds: String(durationSeconds),
              hasAudio: hasCapturedAudio ? 'true' : 'false',
              hasVideo: videoTracks.length > 0 ? 'true' : 'false'
            });

            const res = await fetch(`/api/meetings/${meeting.id}/captures/upload?${params.toString()}`, {
              method: 'POST',
              credentials: 'include',
              headers: {
                ...buildControlHeaders(false),
                'Content-Type': resolvedMime || 'application/octet-stream'
              },
              body: blob
            });

            if (res.ok) {
              addToast('Meeting recording saved to Admin Archive (3-day retention).', 'success');
            } else {
              const errData = await res.json().catch(() => ({}));
              addToast(errData.error || `Failed to save meeting recording (${res.status}).`, 'error');
            }
          } catch (uploadErr) {
            console.error('Error uploading recording:', uploadErr);
            addToast('Network error while uploading meeting recording.', 'error');
          } finally {
            recordingUploadPromiseRef.current = null;
          }
        })();

        recordingUploadPromiseRef.current = uploadPromise;
      };

      recorder.start(1000);
      setIsRecording(true);
      isRecordingRef.current = true;
      addToast(
        hasCapturedAudio
          ? 'Meeting recording started (Audio + Video).'
          : 'Meeting video recording started (enable tab/mic audio if needed).',
        'success'
      );
    } catch (err: any) {
      console.error('Recording error:', err);
      cleanupRecordingStreams();
      setIsRecording(false);
      isRecordingRef.current = false;
      addToast('Could not start recording. Screen share permission is required.', 'error');
    }
  };

  const handleTakeScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as any,
        audio: false
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) {
          resolve();
          return;
        }
        video.onloadedmetadata = () => resolve();
        setTimeout(() => resolve(), 600);
      });
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');

      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach(t => t.stop());

      if (!dataUrl) throw new Error('Failed to capture frame');

      const res = await fetch(`/api/meetings/${meeting.id}/captures`, {
        method: 'POST',
        credentials: 'include',
        headers: buildControlHeaders(true),
        body: JSON.stringify({
          kind: 'screenshot',
          dataUrl,
          filename: `screenshot_${meeting.meetingCode}_${Date.now()}.png`,
          mimeType: 'image/png',
          hasVideo: true
        })
      });

      if (res.ok) {
        addToast('Meeting screenshot captured & saved to Admin Archive!', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Failed to save screenshot on server.', 'error');
      }
    } catch (err: any) {
      console.error('Screenshot error:', err);
      addToast('Could not take screenshot. Permission required.', 'error');
    }
  };

  const handleToggleAudio = () => {
    if (isAudioMutedRef.current && micsLockedRef.current && !isHost && !hostUnmuteGrantedRef.current) {
      addToast('Microphones are locked by the host. Raise your hand to speak.', 'info');
      return;
    }
    executeJitsiCommand('toggleAudio');
  };

  const handleToggleVideo = () => {
    executeJitsiCommand('toggleVideo');
  };

  const handleToggleRaiseHand = async () => {
    const nextRaised = !isHandRaised;
    executeJitsiCommand('toggleRaiseHand');
    setIsHandRaised(nextRaised);

    if (meeting?.id) {
      try {
        await fetch(`/api/meetings/${meeting.id}/hand`, {
          method: 'POST',
          headers: buildControlHeaders(true),
          body: JSON.stringify({
            identity,
            displayName,
            raised: nextRaised
          })
        });
      } catch {}
    }
  };

  const handleLowerAllHands = async () => {
    if (!isHost || !meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/hand`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ lowerAll: true })
      });
      if (res.ok) {
        setRaisedHands([]);
        setIsHandRaised(false);
        addToast('All raised hands lowered.', 'info');
      }
    } catch {
      addToast('Could not lower raised hands.', 'error');
    }
  };

  const handleToggleScreenShare = () => {
    if (!screenSharingAllowed && !isHost) {
      addToast('Screen sharing is currently disabled by the host.', 'info');
      return;
    }
    executeJitsiCommand('toggleShareScreen');
  };

  const handleToggleTileView = () => {
    executeJitsiCommand('toggleTileView');
    setIsTileView(prev => !prev);
  };

  const handleMuteAllParticipants = async () => {
    if (!isHost || !meeting?.id) return;
    try {
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.executeCommand('muteEveryone', 'audio');
        } catch {}
      }
      const res = await fetch(`/api/meetings/${meeting.id}/mute-all`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ actorIdentity: identity })
      });
      if (res.ok) {
        addToast('All participants muted in real time.', 'success');
      } else {
        throw new Error('Failed to broadcast mute-all');
      }
    } catch {
      addToast('Could not mute all participants.', 'error');
    }
  };

  const handleMuteSingleParticipant = async (targetIdentity: string, pName: string) => {
    if (!isHost || !meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/participant-action`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ targetIdentity, action: 'mute_audio', actorIdentity: identity })
      });
      if (res.ok) {
        addToast(`Muted ${pName}.`, 'info');
      } else {
        throw new Error('Mute participant failed');
      }
    } catch {
      addToast(`Could not mute ${pName}.`, 'error');
    }
  };

  const handleParticipantAction = async (
    targetIdentity: string,
    action: 'mute_audio' | 'unmute_audio' | 'mute_video' | 'lower_hand' | 'move_to_lobby',
    pName: string
  ) => {
    if (!isHost || !meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/participant-action`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ targetIdentity, action, actorIdentity: identity })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Action failed');
      }
      if (data.mediaStates) setMediaStates(data.mediaStates);
      if (data.raisedHands) setRaisedHands(data.raisedHands);
      if (action === 'move_to_lobby') {
        fetchWaitingAndParticipants();
      }
      const labels: Record<string, string> = {
        mute_audio: `Muted ${pName}'s microphone.`,
        unmute_audio: `Sent unmute to ${pName}.`,
        mute_video: `Turned off ${pName}'s camera.`,
        lower_hand: `Lowered ${pName}'s raised hand.`,
        move_to_lobby: `Moved ${pName} to the Waiting Lobby.`
      };
      addToast(labels[action] || 'Action applied.', 'info');
    } catch (err: any) {
      addToast(err.message || `Could not perform action for ${pName}.`, 'error');
    }
  };

  const handleToggleMicsLock = async () => {
    if (!isHost || !meeting?.id) return;
    const nextLocked = !micsLocked;
    try {
      if (nextLocked && jitsiApiRef.current) {
        try {
          jitsiApiRef.current.executeCommand('muteEveryone', 'audio');
        } catch {}
      }
      const res = await fetch(`/api/meetings/${meeting.id}/mics-lock`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ micsLocked: nextLocked, actorIdentity: identity })
      });
      if (res.ok) {
        setMicsLocked(nextLocked);
        addToast(
          nextLocked
            ? 'Participant mics locked — only host can unmute.'
            : 'Participant mics unlocked.',
          'info'
        );
      } else {
        throw new Error('Failed');
      }
    } catch {
      addToast('Could not update mic lock setting.', 'error');
    }
  };

  const handleStopAllCameras = async () => {
    if (!isHost || !meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/stop-all-video`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ actorIdentity: identity })
      });
      if (res.ok) {
        addToast('All participant cameras turned off.', 'success');
      } else {
        throw new Error('Failed');
      }
    } catch {
      addToast('Could not turn off all cameras.', 'error');
    }
  };

  const handleToggleCoHostRole = async (targetIdentity: string, currentPType: string, pName: string) => {
    if (!isPrimaryHost || !meeting?.id) return;
    const nextRole = currentPType === 'co-host' ? 'participant' : 'co-host';
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/participant-role`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ targetIdentity, role: nextRole })
      });
      if (res.ok) {
        addToast(
          nextRole === 'co-host'
            ? `${pName} promoted to Co-Host.`
            : `${pName} returned to Participant.`,
          'success'
        );
        fetchWaitingAndParticipants();
      } else {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Role update failed');
      }
    } catch (err: any) {
      addToast(err.message || 'Could not update participant role.', 'error');
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost || !meeting?.id) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/announcement`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ text: announcementDraft.trim(), actorIdentity: identity })
      });
      if (res.ok) {
        setAnnouncementDraft('');
        addToast('Room announcement broadcast live!', 'success');
      } else {
        throw new Error('Failed to send announcement');
      }
    } catch {
      addToast('Could not send room announcement.', 'error');
    }
  };

  const handleClearAnnouncement = async () => {
    if (!isHost || !meeting?.id) return;
    try {
      await fetch(`/api/meetings/${meeting.id}/announcement`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ text: '', actorIdentity: identity })
      });
      setAnnouncement(null);
    } catch {}
  };

  const handleToggleChatLock = async () => {
    if (!isHost || !meeting?.id) return;
    const nextDisabled = !chatDisabled;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/chat-lock`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ chatDisabled: nextDisabled, actorIdentity: identity })
      });
      if (res.ok) {
        setChatDisabled(nextDisabled);
        addToast(nextDisabled ? 'Participant chat locked by host.' : 'Room chat opened.', 'info');
      }
    } catch {
      addToast('Could not update chat lock state.', 'error');
    }
  };

  const handleToggleScreenSharePolicy = async () => {
    if (!isPrimaryHost || !meeting?.id) return;
    const nextAllowed = !screenSharingAllowed;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ screenShareEnabled: nextAllowed })
      });
      if (res.ok) {
        setScreenSharingAllowed(nextAllowed);
        addToast(
          nextAllowed ? 'Screen sharing enabled for room.' : 'Screen sharing restricted.',
          'info'
        );
      }
    } catch {
      addToast('Could not update screen sharing policy.', 'error');
    }
  };

  const handleShareOrCopyInvite = async () => {
    const slug = meeting?.meetingCode;
    if (!slug) return;
    const url = `${window.location.origin}/meeting/${slug}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: meeting?.title || 'NexGen Council Private Meeting',
          text: `Join NexGen Council private meeting: ${meeting?.title || slug}`,
          url
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    addToast('Private meeting invite link copied!', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleToggleRoomLock = async () => {
    if (!isHost || !meeting?.id) return;
    try {
      const endpoint = isRoomLocked
        ? `/api/meetings/${meeting.id}/unlock`
        : `/api/meetings/${meeting.id}/lock`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ actorIdentity: identity })
      });
      if (res.ok) {
        const nextLocked = !isRoomLocked;
        setIsRoomLocked(nextLocked);
        addToast(nextLocked ? 'Room locked — no new guests can join.' : 'Room unlocked.', 'info');
      } else {
        throw new Error('Failed to update room lock');
      }
    } catch {
      addToast('Could not update room lock state', 'error');
    }
  };

  const handleToggleWaitingRoom = async () => {
    if (!isPrimaryHost || !meeting?.id) return;
    try {
      const nextWaiting = !isWaitingRoomEnabled;
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ waitingRoomEnabled: nextWaiting })
      });
      if (res.ok) {
        setIsWaitingRoomEnabled(nextWaiting);
        addToast(
          nextWaiting ? 'Waiting Room lobby enabled for new guests.' : 'Waiting Room lobby disabled.',
          'info'
        );
      } else {
        throw new Error('Failed to update waiting room');
      }
    } catch {
      addToast('Could not update waiting room setting', 'error');
    }
  };

  const handleUpdateMaxParticipants = async (nextLimit: number) => {
    if (!isHost || !meeting?.id || isUpdatingCapacity) return;
    const clamped = Math.max(2, Math.min(1000, Math.round(nextLimit)));
    setIsUpdatingCapacity(true);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/max-participants`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ maxParticipants: clamped, actorIdentity: identity })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not update room capacity');
      }
      const updatedCap = data.maxParticipants || clamped;
      setMaxParticipants(updatedCap);
      setCapacityDraft(String(updatedCap));
      addToast(`Max participants updated to ${updatedCap}.`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Could not update room capacity.', 'error');
      setCapacityDraft(String(maxParticipants));
    } finally {
      setIsUpdatingCapacity(false);
    }
  };

  const handleAdmitParticipant = async (pId: string, admitAll = false) => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/admit`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ participantId: pId, admitAll, actorIdentity: identity })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        addToast(data.message || (admitAll ? 'Admitted all waiting participants' : 'Participant admitted'), 'success');
        if (admitAll) {
          fetchWaitingAndParticipants();
        } else {
          setWaitingParticipants(prev => prev.filter(w => w.id !== pId));
        }
      } else {
        addToast(data.error || 'Error admitting participant', 'error');
      }
    } catch {
      addToast('Error admitting participant', 'error');
    }
  };

  const handleRejectParticipant = async (pId: string) => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/reject`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ participantId: pId, actorIdentity: identity })
      });

      if (res.ok) {
        setWaitingParticipants(prev => prev.filter(w => w.id !== pId));
      }
    } catch {
      addToast('Error rejecting participant', 'error');
    }
  };

  const handleKickParticipant = async (pIdentity: string, pDisplayName?: string) => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/kick`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({ participantIdentity: pIdentity, actorIdentity: identity })
      });
      if (!res.ok) throw new Error('Kick failed');

      if (pDisplayName && jitsiApiRef.current) {
        const jitsiId = jitsiParticipantsMapRef.current.get(pDisplayName.trim().toLowerCase());
        if (jitsiId) {
          try {
            jitsiApiRef.current.executeCommand('kickParticipant', jitsiId);
          } catch {}
        }
      }

      setConfirmKickIdentity(null);
      setParticipantsList(prev => prev.filter(p => (p.identity || p.id) !== pIdentity));
      addToast('Participant removed from room in real time.', 'info');
    } catch {
      addToast('Error removing participant', 'error');
    }
  };

  const handleEndMeeting = async () => {
    try {
      if (isRecordingRef.current || recordingUploadPromiseRef.current) {
        await stopRecordingAndAwaitUpload();
      }
      const res = await fetch(`/api/meetings/${meeting.id}/end`, {
        method: 'POST',
        credentials: 'include',
        headers: buildControlHeaders(false)
      });
      if (!res.ok) throw new Error('Failed to end meeting');
      setConfirmEndPrompt(false);
      triggerSafeExit('You ended this meeting for all participants.');
    } catch {
      addToast('Error ending meeting', 'error');
    }
  };

  const handleLeaveCall = async () => {
    if (isRecordingRef.current || recordingUploadPromiseRef.current) {
      await stopRecordingAndAwaitUpload();
    }
    triggerSafeExit(undefined, true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (chatDisabled && !isHost) {
      addToast('Chat is locked by the host.', 'error');
      return;
    }

    const messageText = chatInput.trim();
    setChatInput('');

    try {
      const res = await fetch(`/api/meetings/${meeting.id}/messages`, {
        method: 'POST',
        headers: buildControlHeaders(true),
        body: JSON.stringify({
          message: messageText,
          senderName: displayName,
          senderId: identity,
          actorIdentity: identity
        })
      });
      if (res.ok) {
        fetchChatHistory();
      } else {
        const d = await res.json().catch(() => ({}));
        addToast(d.error || 'Unable to send message.', 'error');
      }
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
      containerRef.current.requestFullscreen?.().catch(() => {
        addToast('Fullscreen is handled by your mobile browser view.', 'info');
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const visibleAnnouncement =
    announcement && announcement.id !== dismissedAnnouncementId ? announcement : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-dvh max-h-dvh bg-slate-950 text-white flex flex-col overflow-hidden z-50 font-sans"
    >
      {/* Compact Top Bar */}
      <header className="h-12 sm:h-14 px-3 sm:px-5 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/logo.png" alt="NexGen Council" className="h-7 w-7 sm:h-8 sm:w-8 object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-serif font-bold text-white leading-tight truncate max-w-[140px] sm:max-w-md">
              {meeting?.title || 'NexGen Private Room'}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 font-mono tabular-nums">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  realtimeConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                }`}
                title={realtimeConnected ? 'Real-Time Sync Connected' : 'Syncing Room...'}
              />
              <span className="text-amber-400">{formatTime(meetingSeconds)}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-sans font-semibold">
                {isPrimaryHost ? 'Host' : currentRole === 'co-host' ? 'Co-Host' : 'Participant'}
              </span>
              {isRoomLocked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-rose-400 font-sans font-semibold inline-flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Locked</span>
                  </span>
                </>
              )}
              {meeting?.meetingCode && (
                <>
                  <span aria-hidden="true" className="hidden md:inline">·</span>
                  <span className="hidden md:inline text-slate-500">{meeting.meetingCode}</span>
                </>
              )}
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span
                className="hidden sm:inline text-slate-400"
                title="Active Participants / Room Capacity"
              >
                {participantsList.length}/{maxParticipants}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quick Mobile Grid Toggle */}
          <button
            type="button"
            onClick={handleToggleTileView}
            className={`sm:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border text-xs cursor-pointer ${
              isTileView
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
            title="Toggle Grid View"
            aria-label="Toggle Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {isHost && raisedHands.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveDrawer('participants')}
              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>{raisedHands.length}</span>
            </button>
          )}

          {isHost && waitingParticipants.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'host' ? null : 'host')}
              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{waitingParticipants.length} Waiting</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShareOrCopyInvite}
            className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            title="Share or Copy Private Invite Link"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Share2 className="w-3.5 h-3.5 sm:hidden" />
            )}
            {!copiedLink && <Copy className="w-3.5 h-3.5 hidden sm:inline" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Invite'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Live Host Announcement Banner */}
      {visibleAnnouncement && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0 text-xs text-amber-100">
            <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="truncate sm:whitespace-normal font-medium leading-snug">
              <strong className="text-amber-300 mr-1.5">{visibleAnnouncement.senderName}:</strong>
              {visibleAnnouncement.text}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isHost && (
              <button
                type="button"
                onClick={handleClearAnnouncement}
                className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-200 cursor-pointer"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissedAnnouncementId(visibleAnnouncement.id)}
              aria-label="Dismiss announcement"
              className="p-1 rounded-lg text-amber-300 hover:bg-amber-500/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Live Host Unmute Request Prompt */}
      {unmutePromptFromHost && isAudioMuted && (
        <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-3 sm:px-5 py-2 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0 text-xs text-emerald-100">
            <Mic className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium truncate sm:whitespace-normal">
              <strong>{unmutePromptFromHost}</strong> is asking to unmute your microphone.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                hostUnmuteGrantedRef.current = true;
                setUnmutePromptFromHost(null);
                executeJitsiCommand('toggleAudio');
              }}
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              Unmute Mic
            </button>
            <button
              type="button"
              onClick={() => setUnmutePromptFromHost(null)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
            >
              Stay Muted
            </button>
          </div>
        </div>
      )}

      {/* Main Stage (Always keeps Jitsi IFrame mounted in DOM while allowing Split/Full Whiteboard) */}
      <main
        className={`flex-1 min-h-0 w-full relative flex overflow-hidden ${
          effectiveWhiteboardOpen && effectiveSplitMode === 'split' ? 'flex-col lg:flex-row' : ''
        }`}
      >
        <div
          key="jitsi-stage-wrapper"
          className={
            !effectiveWhiteboardOpen
              ? 'flex-1 min-w-0 min-h-0 relative bg-slate-950 w-full h-full flex flex-col'
              : effectiveSplitMode === 'split'
              ? 'order-1 lg:order-2 w-full h-40 sm:h-48 lg:h-full lg:w-80 xl:w-96 relative bg-slate-950 border-b lg:border-b-0 lg:border-l border-slate-800 shrink-0 flex flex-col'
              : 'fixed bottom-20 right-3 sm:right-5 w-40 h-28 sm:w-64 sm:h-40 rounded-2xl border border-slate-700 shadow-2xl z-30 bg-slate-950 overflow-hidden flex flex-col'
          }
        >
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
                className="mt-2 min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Show Video Frame</span>
              </button>
            </div>
          )}

          {/* Load / Connection Error Card */}
          {loadError && (
            <div className="absolute inset-0 bg-slate-950/95 flex items-center justify-center z-20 p-4 sm:p-6">
              <div className="max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
                <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                <h3 className="text-lg font-bold text-white">Conference Connection Issue</h3>
                <p className="text-xs text-slate-400">{loadError}</p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerSafeExit(undefined, true)}
                    className="min-h-[44px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
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

        {effectiveWhiteboardOpen && (
          <div
            key="whiteboard-stage-wrapper"
            className="order-2 lg:order-1 flex-1 min-w-0 min-h-0 h-full flex flex-col"
          >
            <MeetingWhiteboard
              meetingId={meeting.id}
              meetingCode={meeting.meetingCode}
              identity={identity}
              displayName={displayName}
              isHost={isHost}
              buildHeaders={buildControlHeaders}
              onToast={addToast}
              initialSnapshot={whiteboardSnapshot}
              externalEvent={whiteboardEvent}
              splitVideoMode={effectiveSplitMode}
              onToggleSplitVideoMode={() =>
                setSplitMode(effectiveSplitMode === 'split' ? 'full' : 'split')
              }
              onClose={() => setWhiteboardOpen(false)}
            />
          </div>
        )}

        {/* Mobile Sheet Backdrop */}
        {activeDrawer && (
          <div
            onClick={() => setActiveDrawer(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
            aria-hidden="true"
          />
        )}

        {/* Responsive Drawer: Slide-up Bottom Sheet on Mobile, Side Panel on Desktop */}
        {activeDrawer && (
          <aside className="fixed inset-x-0 bottom-0 h-[78dvh] max-h-[78dvh] rounded-t-3xl border-t border-slate-700 bg-slate-900 flex flex-col z-40 shadow-2xl lg:static lg:inset-auto lg:w-96 lg:h-full lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-l lg:border-slate-800">
            <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mt-2.5 mb-1 shrink-0 lg:hidden" />

            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {activeDrawer === 'participants' && (
                  <>
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Participants ({participantsList.length} / {maxParticipants})</span>
                  </>
                )}
                {activeDrawer === 'chat' && (
                  <>
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>Council Meeting Chat</span>
                  </>
                )}
                {activeDrawer === 'host' && (
                  <>
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Host Controls &amp; Lobby</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                aria-label="Close panel"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Host Controls + Broadcast + Waiting Lobby Tab */}
            {activeDrawer === 'host' && isHost && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <div className="space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Moderator Room Controls
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleMuteAllParticipants}
                      className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-xs font-semibold text-slate-100 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <VolumeX className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Mute Everyone</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleMicsLock}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        micsLocked
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-100'
                      }`}
                    >
                      <MicOff className="w-4 h-4 shrink-0" />
                      <span>Mics: {micsLocked ? 'Locked' : 'Open'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleStopAllCameras}
                      className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-xs font-semibold text-slate-100 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <VideoOff className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Stop All Cams</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleRoomLock}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        isRoomLocked
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-100'
                      }`}
                    >
                      {isRoomLocked ? (
                        <>
                          <Unlock className="w-4 h-4 shrink-0" />
                          <span>Unlock Room</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Lock Room</span>
                        </>
                      )}
                    </button>

                    {isPrimaryHost && (
                      <button
                        type="button"
                        onClick={handleToggleWaitingRoom}
                        className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                          isWaitingRoomEnabled
                            ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <Shield className="w-4 h-4 shrink-0" />
                        <span>Lobby: {isWaitingRoomEnabled ? 'ON' : 'OFF'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleChatLock}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        chatDisabled
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                          : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>Chat: {chatDisabled ? 'Locked' : 'Open'}</span>
                    </button>

                    {isPrimaryHost && (
                      <button
                        type="button"
                        onClick={handleToggleScreenSharePolicy}
                        className={`min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                          screenSharingAllowed
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <MonitorUp className="w-4 h-4 shrink-0" />
                        <span>Share: {screenSharingAllowed ? 'ON' : 'OFF'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleShareOrCopyInvite}
                      className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-600 text-xs font-semibold text-slate-100 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {copiedLink ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Copy className="w-4 h-4 text-blue-400 shrink-0" />
                      )}
                      <span>{copiedLink ? 'Copied' : 'Private Link'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setWhiteboardOpen(!effectiveWhiteboardOpen);
                        setActiveDrawer(null);
                      }}
                      className={`col-span-2 min-h-[44px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        effectiveWhiteboardOpen
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 hover:border-indigo-500/50 text-indigo-200'
                      }`}
                    >
                      <PenTool className="w-4 h-4 shrink-0" />
                      <span>{effectiveWhiteboardOpen ? 'Close Whiteboard View' : 'Open Interactive Whiteboard'}</span>
                    </button>
                  </div>
                </div>

                {/* Room Participant Capacity (Increase / Decrease Live) */}
                <div className="space-y-2.5 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      <span>Room Capacity (Max Participants)</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-300 tabular-nums">
                      {participantsList.length} / {maxParticipants}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isUpdatingCapacity || maxParticipants <= 2}
                      onClick={() => handleUpdateMaxParticipants(maxParticipants - 10)}
                      className="min-h-[38px] px-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-600 disabled:opacity-40 text-xs font-semibold text-slate-200 cursor-pointer tabular-nums shrink-0"
                      title="Decrease max capacity by 10"
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingCapacity || maxParticipants <= 2}
                      onClick={() => handleUpdateMaxParticipants(maxParticipants - 1)}
                      aria-label="Decrease max participants"
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-600 disabled:opacity-40 text-slate-200 cursor-pointer shrink-0"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={2}
                      max={1000}
                      data-capacity-input="true"
                      value={capacityDraft}
                      onChange={(e) => setCapacityDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const parsed = parseInt(capacityDraft, 10);
                          if (!Number.isNaN(parsed)) handleUpdateMaxParticipants(parsed);
                        }
                      }}
                      className="flex-1 min-w-0 min-h-[38px] px-2 text-center text-xs font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                      aria-label="Room max participants"
                    />
                    <button
                      type="button"
                      disabled={isUpdatingCapacity || maxParticipants >= 1000}
                      onClick={() => handleUpdateMaxParticipants(maxParticipants + 1)}
                      aria-label="Increase max participants"
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-600 disabled:opacity-40 text-slate-200 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingCapacity || maxParticipants >= 1000}
                      onClick={() => handleUpdateMaxParticipants(maxParticipants + 10)}
                      className="min-h-[38px] px-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-600 disabled:opacity-40 text-xs font-semibold text-slate-200 cursor-pointer tabular-nums shrink-0"
                      title="Increase max capacity by 10"
                    >
                      +10
                    </button>
                  </div>

                  {Number(capacityDraft) !== maxParticipants && capacityDraft.trim() !== '' && (
                    <button
                      type="button"
                      disabled={isUpdatingCapacity}
                      onClick={() => {
                        const parsed = parseInt(capacityDraft, 10);
                        if (!Number.isNaN(parsed)) handleUpdateMaxParticipants(parsed);
                      }}
                      className="w-full min-h-[36px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Apply Limit ({Math.max(2, Math.min(1000, parseInt(capacityDraft, 10) || maxParticipants))})
                    </button>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[25, 50, 100, 250, 500].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        disabled={isUpdatingCapacity}
                        onClick={() => handleUpdateMaxParticipants(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                          maxParticipants === preset
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  {participantsList.length > maxParticipants && (
                    <p className="text-[11px] text-amber-300 leading-snug">
                      Active count ({participantsList.length}) is above {maxParticipants}. Existing attendees stay connected, but new joins are paused until below limit.
                    </p>
                  )}
                </div>

                {/* Live Room Announcement Broadcaster */}
                <form onSubmit={handleSendAnnouncement} className="space-y-2 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5" />
                      <span>Broadcast Live Banner</span>
                    </span>
                    {announcement && (
                      <button
                        type="button"
                        onClick={handleClearAnnouncement}
                        className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Clear active
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={announcementDraft}
                      onChange={e => setAnnouncementDraft(e.target.value)}
                      placeholder="e.g. Q&A starts in 2 minutes..."
                      className="flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={!announcementDraft.trim()}
                      className="min-h-[40px] px-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0"
                    >
                      Send
                    </button>
                  </div>
                </form>

                {/* Waiting Lobby Queue */}
                <div className="space-y-3 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">
                      Waiting Lobby ({waitingParticipants.length})
                    </span>
                    {waitingParticipants.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAdmitParticipant('', true)}
                        className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer"
                      >
                        Admit All
                      </button>
                    )}
                  </div>

                  {waitingParticipants.length === 0 ? (
                    <p className="text-xs text-slate-500 italic bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 text-center">
                      No participants currently waiting in the lobby.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {waitingParticipants.map(wp => (
                        <div
                          key={wp.id}
                          className="flex items-center justify-between gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs"
                        >
                          <span className="font-semibold text-white truncate">{wp.displayName}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleAdmitParticipant(wp.id)}
                              className="min-h-[36px] px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs cursor-pointer"
                            >
                              Admit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectParticipant(wp.id)}
                              aria-label={`Decline ${wp.displayName}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-lg cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* End Meeting Section (Primary Host / Admin only) */}
                {isPrimaryHost && (
                  <div className="border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setConfirmEndPrompt(true)}
                      className="w-full min-h-[44px] py-2.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      End Meeting for Everyone
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Participants Roster Tab (with Raised Hand Queue & Moderator Individual Controls) */}
            {activeDrawer === 'participants' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isHost && (
                  <div className="grid grid-cols-3 gap-1.5 pb-1">
                    <button
                      type="button"
                      onClick={handleMuteAllParticipants}
                      className="min-h-[36px] px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <VolumeX className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Mute All</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleMicsLock}
                      className={`min-h-[36px] px-2 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                        micsLocked
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-200'
                      }`}
                    >
                      <MicOff className="w-3.5 h-3.5 shrink-0" />
                      <span>{micsLocked ? 'Unlock Mics' : 'Lock Mics'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAllCameras}
                      className="min-h-[36px] px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <VideoOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Stop Cams</span>
                    </button>
                  </div>
                )}

                {raisedHands.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                        <Hand className="w-3.5 h-3.5" />
                        <span>Raised Hands ({raisedHands.length})</span>
                      </span>
                      {isHost && (
                        <button
                          type="button"
                          onClick={handleLowerAllHands}
                          className="text-[11px] font-semibold text-amber-200 hover:underline cursor-pointer"
                        >
                          Lower All
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {raisedHands.map(h => (
                        <span
                          key={h.identity}
                          className="px-2 py-0.5 rounded-lg bg-slate-950 border border-amber-500/30 text-[11px] text-amber-200 font-medium"
                        >
                          ✋ {h.displayName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {participantsList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center pt-8">
                    No active participants recorded yet.
                  </p>
                ) : (
                  participantsList.map((p, idx) => {
                    const pKey = p.identity || p.id;
                    const isSelf = pKey === identity || p.displayName === displayName;
                    const handUp = raisedHands.some(h => h.identity === pKey || h.identity === p.id);
                    const pRole = p.role || (p.displayName === meeting?.hostName ? 'host' : 'participant');
                    const pMedia = mediaStates[pKey] || (p.identity ? mediaStates[p.identity] : undefined);
                    const pAudioMuted = isSelf ? isAudioMuted : Boolean(pMedia?.audioMuted);
                    const pVideoMuted = isSelf ? isVideoMuted : Boolean(pMedia?.videoMuted);

                    return (
                      <div
                        key={p.id || idx}
                        className="flex flex-col gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-slate-800 text-amber-300 font-bold flex items-center justify-center text-xs border border-slate-700 shrink-0">
                              {p.displayName ? p.displayName.slice(0, 2).toUpperCase() : 'PT'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{p.displayName} {isSelf && '(You)'}</span>
                                {handUp && <span title="Hand raised">✋</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 capitalize flex items-center gap-2">
                                <span className={pRole === 'co-host' ? 'text-amber-300 font-semibold' : ''}>
                                  {pRole}
                                </span>
                                <span className={pAudioMuted ? 'text-rose-400' : 'text-emerald-400'}>
                                  {pAudioMuted ? 'Muted' : 'Mic On'}
                                </span>
                                {pVideoMuted && <span className="text-slate-500">Cam Off</span>}
                              </div>
                            </div>
                          </div>

                          {!isHost && (
                            <div className="flex items-center gap-1 shrink-0 text-slate-400">
                              {pAudioMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                              {pVideoMuted ? <VideoOff className="w-3.5 h-3.5 text-slate-500" /> : <Video className="w-3.5 h-3.5 text-blue-400" />}
                            </div>
                          )}
                        </div>

                        {isHost && !isSelf && (
                          confirmKickIdentity === pKey ? (
                            <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-900">
                              <span className="text-[11px] text-rose-300 mr-auto">Force leave room?</span>
                              <button
                                type="button"
                                onClick={() => handleKickParticipant(pKey, p.displayName)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Remove / Leave
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmKickIdentity(null)}
                                className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-900">
                              <button
                                type="button"
                                onClick={() =>
                                  pAudioMuted
                                    ? handleParticipantAction(pKey, 'unmute_audio', p.displayName)
                                    : handleMuteSingleParticipant(pKey, p.displayName)
                                }
                                className={`min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                  pAudioMuted
                                    ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                                    : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                                }`}
                                title={pAudioMuted ? `Unmute ${p.displayName}` : `Mute ${p.displayName}`}
                              >
                                {pAudioMuted ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                                <span>{pAudioMuted ? 'Unmute' : 'Mute'}</span>
                              </button>

                              {!pVideoMuted && (
                                <button
                                  type="button"
                                  onClick={() => handleParticipantAction(pKey, 'mute_video', p.displayName)}
                                  className="min-h-[30px] px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-500/40 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                  title={`Turn off ${p.displayName}'s camera`}
                                >
                                  <VideoOff className="w-3 h-3" />
                                  <span>Cam Off</span>
                                </button>
                              )}

                              {handUp && (
                                <button
                                  type="button"
                                  onClick={() => handleParticipantAction(pKey, 'lower_hand', p.displayName)}
                                  className="min-h-[30px] px-2 py-1 rounded-lg bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                  title={`Lower ${p.displayName}'s hand`}
                                >
                                  <Hand className="w-3 h-3" />
                                  <span>Lower</span>
                                </button>
                              )}

                              {isPrimaryHost && pRole !== 'host' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleCoHostRole(pKey, pRole, p.displayName)}
                                  className={`min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer ${
                                    pRole === 'co-host'
                                      ? 'text-amber-300 bg-amber-500/15 hover:bg-amber-500/25'
                                      : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300'
                                  }`}
                                  title={
                                    pRole === 'co-host'
                                      ? `Remove Co-Host from ${p.displayName}`
                                      : `Promote ${p.displayName} to Co-Host`
                                  }
                                >
                                  <Award className="w-3 h-3" />
                                  <span>{pRole === 'co-host' ? 'Co-Host' : 'Make Host'}</span>
                                </button>
                              )}

                              {pRole !== 'host' && (
                                <button
                                  type="button"
                                  onClick={() => handleParticipantAction(pKey, 'move_to_lobby', p.displayName)}
                                  className="min-h-[30px] px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-indigo-300 hover:border-indigo-500/40 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                  title={`Send ${p.displayName} back to Waiting Lobby`}
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>Lobby</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setConfirmKickIdentity(pKey)}
                                className="min-h-[30px] px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ml-auto"
                                title={`Remove ${p.displayName} from meeting`}
                              >
                                <UserX className="w-3 h-3" />
                                <span>Leave</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Persistent Chat Tab */}
            {activeDrawer === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden min-h-0">
                <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-slate-500 italic pt-12">
                      No saved council notes yet. Send a message to archive it with this meeting.
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
                        <p className="text-slate-200 text-xs leading-relaxed break-words">{msg.message}</p>
                      </div>
                    ))
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {chatDisabled && !isHost ? (
                  <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-950 text-center text-[11px] text-rose-300">
                    Chat has been temporarily locked by the host.
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendMessage}
                    className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-950 flex items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      placeholder="Write council note or message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 min-h-[44px] px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      aria-label="Send message"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer transition-colors shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </aside>
        )}
      </main>

      {/* Thumb-Friendly Bottom Control Dock (Always Visible on Mobile & Desktop without Fullscreen) */}
      <footer className="shrink-0 bg-slate-950/95 border-t border-slate-800 px-2 sm:px-4 py-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-20">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-start lg:justify-center gap-1.5 sm:gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Mic Toggle */}
          <button
            type="button"
            onClick={handleToggleAudio}
            aria-label={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`shrink-0 whitespace-nowrap min-h-[44px] min-w-[54px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              isAudioMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            {isAudioMuted ? <MicOff className="w-4 h-4 shrink-0" /> : <Mic className="w-4 h-4 shrink-0" />}
            <span className="leading-none">{isAudioMuted ? 'Unmute' : 'Mic'}</span>
          </button>

          {/* Camera Toggle */}
          <button
            type="button"
            onClick={handleToggleVideo}
            aria-label={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
            className={`shrink-0 whitespace-nowrap min-h-[44px] min-w-[54px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              isVideoMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            {isVideoMuted ? <VideoOff className="w-4 h-4 shrink-0" /> : <Video className="w-4 h-4 shrink-0" />}
            <span className="leading-none">{isVideoMuted ? 'Cam Off' : 'Camera'}</span>
          </button>

          {/* Raise Hand (Synced Real-Time) */}
          <button
            type="button"
            onClick={handleToggleRaiseHand}
            aria-label={isHandRaised ? 'Lower hand' : 'Raise hand'}
            className={`shrink-0 whitespace-nowrap min-h-[44px] min-w-[52px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              isHandRaised
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            <Hand className="w-4 h-4 shrink-0" />
            <span className="leading-none">Hand</span>
          </button>

          {/* Screen Share */}
          {(screenSharingAllowed || isHost) && (
            <button
              type="button"
              onClick={handleToggleScreenShare}
              aria-label="Toggle screen share"
              className={`hidden md:flex shrink-0 whitespace-nowrap min-h-[44px] px-3 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isScreenSharing
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
              }`}
            >
              <MonitorUp className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">Share Screen</span>
              <span className="xl:hidden">Share</span>
            </button>
          )}

          {/* Interactive Whiteboard */}
          <button
            type="button"
            onClick={() => setWhiteboardOpen(!effectiveWhiteboardOpen)}
            aria-label="Toggle interactive whiteboard"
            className={`relative shrink-0 whitespace-nowrap min-h-[44px] min-w-[52px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              effectiveWhiteboardOpen
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            <PenTool className="w-4 h-4 shrink-0" />
            <span className="leading-none">Board</span>
            {whiteboardHasContent && !effectiveWhiteboardOpen && (
              <span
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-400"
                title="Shared whiteboard has active content"
              />
            )}
          </button>

          {/* Record Audio + Video */}
          <button
            type="button"
            onClick={handleStartStopRecording}
            aria-label={isRecording ? 'Stop meeting recording' : 'Start meeting recording'}
            className={`shrink-0 whitespace-nowrap min-h-[44px] min-w-[54px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
            title="Record Audio & Video (Saved to Admin Archive with 3-day TTL)"
          >
            <CircleDot className={`w-4 h-4 shrink-0 ${isRecording ? 'text-white' : 'text-rose-400'}`} />
            <span className="leading-none">{isRecording ? 'Recing' : 'Record'}</span>
          </button>

          {/* Screenshot */}
          <button
            type="button"
            onClick={handleTakeScreenshot}
            aria-label="Take screenshot"
            className="shrink-0 whitespace-nowrap min-h-[44px] min-w-[52px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer"
            title="Take Screenshot (Saved to Admin Archive)"
          >
            <Camera className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="leading-none">Snap</span>
          </button>

          {/* Tile Grid View */}
          <button
            type="button"
            onClick={handleToggleTileView}
            aria-label="Toggle gallery grid view"
            className={`hidden sm:flex shrink-0 whitespace-nowrap min-h-[44px] px-3 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              isTileView
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>Grid</span>
          </button>

          {/* Chat & Notes */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'chat' ? null : 'chat')}
            aria-label="Toggle chat and notes"
            className={`relative shrink-0 whitespace-nowrap min-h-[44px] min-w-[52px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              activeDrawer === 'chat'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="leading-none">Chat</span>
            {unreadChatCount > 0 && activeDrawer !== 'chat' && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>

          {/* Participants Roster */}
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'participants' ? null : 'participants')}
            aria-label="Toggle participant list"
            className={`relative shrink-0 whitespace-nowrap min-h-[44px] min-w-[56px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
              activeDrawer === 'participants'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="leading-none">People</span>
            {participantsList.length > 0 && (
              <span className="hidden sm:inline font-mono text-[11px] opacity-80 tabular-nums">
                ({participantsList.length}/{maxParticipants})
              </span>
            )}
            {raisedHands.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center tabular-nums">
                {raisedHands.length}
              </span>
            )}
          </button>

          {/* Host Controls Button (Host & Co-Host) */}
          {isHost && (
            <button
              type="button"
              onClick={() => setActiveDrawer(activeDrawer === 'host' ? null : 'host')}
              aria-label="Open host controls and waiting room"
              className={`relative shrink-0 whitespace-nowrap min-h-[44px] min-w-[52px] sm:min-w-0 px-2.5 sm:px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[10px] sm:text-xs font-semibold transition-colors cursor-pointer ${
                activeDrawer === 'host'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span className="leading-none">Host</span>
              {waitingParticipants.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {waitingParticipants.length}
                </span>
              )}
            </button>
          )}

          {/* Leave / End Call */}
          <button
            type="button"
            onClick={() => (isPrimaryHost ? setConfirmEndPrompt(true) : handleLeaveCall())}
            aria-label={isPrimaryHost ? 'End or leave meeting' : 'Leave meeting'}
            className="shrink-0 whitespace-nowrap min-h-[44px] min-w-[54px] sm:min-w-0 px-3 sm:px-3.5 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] sm:text-xs font-bold transition-colors cursor-pointer"
          >
            <PhoneOff className="w-4 h-4 shrink-0" />
            <span className="leading-none">{isPrimaryHost ? 'End' : 'Leave'}</span>
          </button>
        </div>
      </footer>

      {/* Host Clean In-App End/Leave Choice Modal */}
      {confirmEndPrompt && isPrimaryHost && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-base font-serif font-bold text-white">End or Leave Meeting?</h3>
              <p className="text-xs text-slate-400">
                Choose whether to end this session for all participants or simply leave the call while keeping the room open.
              </p>
            </div>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleEndMeeting}
                className="w-full min-h-[44px] py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                End Meeting for All
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmEndPrompt(false);
                  handleLeaveCall();
                }}
                className="w-full min-h-[44px] py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Leave Meeting Only
              </button>
              <button
                type="button"
                onClick={() => setConfirmEndPrompt(false)}
                className="w-full min-h-[44px] py-2.5 text-slate-400 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
