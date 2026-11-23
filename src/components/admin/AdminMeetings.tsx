import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Meeting } from '../../types.ts';
import {
  Video,
  Plus,
  Copy,
  Check,
  Lock,
  Unlock,
  Users,
  Clock,
  Calendar,
  Shield,
  Square,
  X,
  Play,
  Trash2,
  Eye,
  MessageSquare,
  Search,
  RefreshCw,
  MicOff,
  VideoOff,
  Monitor,
  Edit2,
  ShieldCheck,
  Minus,
  Plus as PlusIcon,
  Download,
  Camera,
  CircleDot
} from 'lucide-react';

function slugifyRoomSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function generateRandomRoomSlug(): string {
  const part1 = Math.random().toString(36).substring(2, 6);
  const part2 = Math.random().toString(36).substring(2, 6);
  return `nex-${part1}-${part2}`;
}

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
  icon?: React.ReactNode;
}

const ToggleSwitchRow: React.FC<SwitchProps> = ({ checked, onChange, label, description, icon }) => (
  <div className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
    <div className="flex items-start gap-2.5 min-w-0">
      {icon && <span className="mt-0.5 text-slate-500 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <span className="text-xs font-semibold text-slate-900 block leading-snug">{label}</span>
        <span className="text-[11px] text-slate-500 block leading-snug mt-0.5">{description}</span>
      </div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

interface MaxParticipantsFieldProps {
  value: number;
  onChange: (next: number) => void;
}

const CAPACITY_PRESETS = [10, 25, 50, 100, 250, 500, 1000];

const clampCapacity = (val: number) => {
  if (!Number.isFinite(val)) return 50;
  return Math.max(2, Math.min(1000, Math.round(val)));
};

const MaxParticipantsField: React.FC<MaxParticipantsFieldProps> = ({ value, onChange }) => {
  const safeVal = clampCapacity(value);
  return (
    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500 shrink-0" />
          <div>
            <span className="text-xs font-semibold text-slate-900 block leading-snug">
              Max Participants Capacity
            </span>
            <span className="text-[11px] text-slate-500 block leading-snug">
              Default is 50. Increase or decrease anytime (2 – 1000 seats).
            </span>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold tabular-nums shrink-0">
          {safeVal} max
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(clampCapacity(safeVal - 10))}
          disabled={safeVal <= 2}
          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-xs font-semibold text-slate-700 cursor-pointer shrink-0 tabular-nums"
          title="Decrease by 10"
        >
          -10
        </button>
        <button
          type="button"
          onClick={() => onChange(clampCapacity(safeVal - 1))}
          disabled={safeVal <= 2}
          className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-700 cursor-pointer shrink-0"
          title="Decrease by 1"
          aria-label="Decrease max participants"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="number"
          min={2}
          max={1000}
          value={value}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isNaN(parsed)) {
              onChange(Math.max(1, Math.min(1000, parsed)));
            }
          }}
          onBlur={() => onChange(clampCapacity(value))}
          className="flex-1 min-w-0 px-3 py-2 text-center text-sm font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
          aria-label="Max participants count"
        />
        <button
          type="button"
          onClick={() => onChange(clampCapacity(safeVal + 1))}
          disabled={safeVal >= 1000}
          className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-700 cursor-pointer shrink-0"
          title="Increase by 1"
          aria-label="Increase max participants"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(clampCapacity(safeVal + 10))}
          disabled={safeVal >= 1000}
          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-xs font-semibold text-slate-700 cursor-pointer shrink-0 tabular-nums"
          title="Increase by 10"
        >
          +10
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500 mr-1">Quick set:</span>
        {CAPACITY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer tabular-nums border ${
              safeVal === preset
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
};

export const AdminMeetings: React.FC = () => {
  const { addToast, authToken, setActivePage } = useApp();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'All' | 'Active' | 'Scheduled' | 'Ended'>('All');
  const [activeMainTab, setActiveMainTab] = useState<'rooms' | 'captures'>('rooms');
  const [captures, setCaptures] = useState<any[]>([]);
  const [viewingCapture, setViewingCapture] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    scheduledStart: '',
    scheduledEnd: '',
    enablePassword: false,
    password: '',
    clearPassword: false,
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    waitingRoomEnabled: false,
    screenShareEnabled: true,
    maxParticipants: 50
  });
  const [viewingHistoryMeeting, setViewingHistoryMeeting] = useState<Meeting | null>(null);
  const [historyParticipants, setHistoryParticipants] = useState<any[]>([]);
  const [historyMessages, setHistoryMessages] = useState<any[]>([]);

  // Form State
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    roomSlug: '',
    description: '',
    scheduledStart: '',
    scheduledEnd: '',
    password: '',
    enablePassword: false,
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    waitingRoomEnabled: false,
    screenShareEnabled: true,
    maxParticipants: 50
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmMeetingAction, setConfirmMeetingAction] = useState<{
    id: string;
    type: 'end' | 'delete';
  } | null>(null);

  const fetchMeetings = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/meetings', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (err: any) {
      console.error('Fetch meetings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCaptures = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/meetings-captures/all', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCaptures(data.captures || []);
      }
    } catch {}
  };

  const handleDeleteCapture = async (captureId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/meetings/captures/${captureId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        addToast('Capture deleted successfully.', 'success');
        fetchCaptures();
      } else {
        addToast('Failed to delete capture.', 'error');
      }
    } catch {
      addToast('Error deleting capture.', 'error');
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchCaptures();
    const interval = setInterval(fetchMeetings, 10000);
    const cInterval = setInterval(fetchCaptures, 15000);
    return () => {
      clearInterval(interval);
      clearInterval(cInterval);
    };
  }, [authToken]);

  const getInviteUrl = (roomSlug: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nexgencouncil.bond';
    return `${origin}/meeting/${roomSlug}`;
  };

  const handleCopyLink = (meetingCode: string) => {
    const url = getInviteUrl(meetingCode);
    navigator.clipboard.writeText(url);
    setCopiedCode(meetingCode);
    addToast(`Invite link copied: ${url}`, 'success');
    setTimeout(() => setCopiedCode(null), 3000);
  };

  const handleJoinAsHost = (e: React.MouseEvent, meetingCode: string) => {
    e.preventDefault();
    setActivePage('room', meetingCode);
  };

  const handleTitleChange = (val: string) => {
    if (!slugManuallyEdited) {
      const autoSlug = slugifyRoomSlug(val).slice(0, 36);
      setFormData(prev => ({ ...prev, title: val, roomSlug: autoSlug }));
    } else {
      setFormData(prev => ({ ...prev, title: val }));
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      addToast('Please enter a meeting title', 'error');
      return;
    }

    if (formData.enablePassword && !formData.password.trim()) {
      addToast('Please enter a room password or PIN', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const cleanSlug = slugifyRoomSlug(formData.roomSlug);

      const body = {
        title: formData.title.trim(),
        roomSlug: cleanSlug || undefined,
        description: formData.description.trim(),
        scheduledStart: formData.scheduledStart || new Date().toISOString(),
        scheduledEnd: formData.scheduledEnd || undefined,
        password: formData.enablePassword ? formData.password.trim() : undefined,
        startWithAudioMuted: formData.startWithAudioMuted,
        startWithVideoMuted: formData.startWithVideoMuted,
        waitingRoomEnabled: formData.waitingRoomEnabled,
        screenShareEnabled: formData.screenShareEnabled,
        maxParticipants: clampCapacity(formData.maxParticipants)
      };

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create meeting');
      }

      addToast('Meeting room created on NexGen Jitsi server!', 'success');
      setShowCreateModal(false);
      resetForm();
      fetchMeetings();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartInstantMeeting = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const slug = generateRandomRoomSlug();
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `Council Briefing - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          roomSlug: slug,
          description: 'Instant executive video conference hosted on NexGen Council.',
          scheduledStart: new Date().toISOString(),
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          waitingRoomEnabled: false,
          screenShareEnabled: true,
          maxParticipants: 50
        })
      });

      const data = await res.json();
      if (res.ok && data.meeting) {
        addToast('Instant meeting launched!', 'success');
        await fetchMeetings();
        setActivePage('room', data.meeting.meetingCode);
      } else {
        throw new Error(data.error || 'Error starting instant meeting');
      }
    } catch (err: any) {
      addToast(err.message || 'Error starting instant meeting', 'error');
    }
  };

  const handleToggleLock = async (meeting: Meeting) => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const endpoint = meeting.isLocked ? `/api/meetings/${meeting.id}/unlock` : `/api/meetings/${meeting.id}/lock`;
      const res = await fetch(endpoint, { method: 'POST', headers });
      if (res.ok) {
        addToast(meeting.isLocked ? 'Meeting unlocked' : 'Meeting locked', 'info');
        fetchMeetings();
      }
    } catch {
      addToast('Error toggling lock state', 'error');
    }
  };

  const handleEndMeeting = async (meeting: Meeting) => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${meeting.id}/end`, { method: 'POST', headers });
      if (res.ok) {
        addToast('Meeting ended for all active participants in real time.', 'success');
        setConfirmMeetingAction(null);
        fetchMeetings();
      }
    } catch {
      addToast('Error ending meeting', 'error');
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        addToast('Meeting deleted', 'success');
        setConfirmMeetingAction(null);
        fetchMeetings();
      }
    } catch {
      addToast('Error deleting meeting', 'error');
    }
  };

  const handleOpenEditModal = (m: Meeting) => {
    setEditingMeeting(m);
    setEditForm({
      title: m.title || '',
      description: m.description || '',
      scheduledStart: m.scheduledStart ? m.scheduledStart.slice(0, 16) : '',
      scheduledEnd: m.scheduledEnd ? m.scheduledEnd.slice(0, 16) : '',
      enablePassword: Boolean(m.hasPassword),
      password: '',
      clearPassword: false,
      startWithAudioMuted: Boolean(m.startWithAudioMuted),
      startWithVideoMuted: Boolean(m.startWithVideoMuted),
      waitingRoomEnabled: Boolean(m.waitingRoomEnabled),
      screenShareEnabled: m.screenShareEnabled !== false,
      maxParticipants: m.maxParticipants || 50
    });
  };

  const handleSaveEditMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeeting) return;
    if (!editForm.title.trim()) {
      addToast('Meeting title is required.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const payload: Record<string, any> = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        scheduledStart: editForm.scheduledStart || editingMeeting.scheduledStart,
        scheduledEnd: editForm.scheduledEnd || undefined,
        startWithAudioMuted: editForm.startWithAudioMuted,
        startWithVideoMuted: editForm.startWithVideoMuted,
        waitingRoomEnabled: editForm.waitingRoomEnabled,
        screenShareEnabled: editForm.screenShareEnabled,
        maxParticipants: clampCapacity(editForm.maxParticipants)
      };

      if (!editForm.enablePassword) {
        payload.password = '';
      } else if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      const res = await fetch(`/api/meetings/${editingMeeting.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update meeting');

      addToast('Meeting settings updated in real time!', 'success');
      setEditingMeeting(null);
      fetchMeetings();
    } catch (err: any) {
      addToast(err.message || 'Could not update meeting settings', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchMeetingHistory = async (meeting: Meeting) => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const [pRes, mRes] = await Promise.all([
        fetch(`/api/meetings/${meeting.id}/participants?all=true`, { headers }).then(r => r.json()),
        fetch(`/api/meetings/${meeting.id}/messages`, { headers }).then(r => r.json())
      ]);

      setHistoryParticipants(pRes.participants || []);
      setHistoryMessages(mRes.messages || []);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  const handleViewHistory = async (meeting: Meeting) => {
    setViewingHistoryMeeting(meeting);
    await fetchMeetingHistory(meeting);
  };

  useEffect(() => {
    if (!viewingHistoryMeeting) return;
    const interval = setInterval(() => {
      fetchMeetingHistory(viewingHistoryMeeting);
    }, 5000);
    return () => clearInterval(interval);
  }, [viewingHistoryMeeting?.id, authToken]);

  const handleKickFromHistory = async (meetingId: string, participantIdentity: string, displayName: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${meetingId}/kick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ participantIdentity })
      });
      if (!res.ok) throw new Error('Could not remove participant');
      addToast(`${displayName} removed from room.`, 'info');
      if (viewingHistoryMeeting) {
        fetchMeetingHistory(viewingHistoryMeeting);
      }
      fetchMeetings();
    } catch {
      addToast('Failed to remove participant.', 'error');
    }
  };

  const resetForm = () => {
    setSlugManuallyEdited(false);
    setFormData({
      title: '',
      roomSlug: generateRandomRoomSlug(),
      description: '',
      scheduledStart: '',
      scheduledEnd: '',
      password: '',
      enablePassword: false,
      startWithAudioMuted: false,
      startWithVideoMuted: false,
      waitingRoomEnabled: false,
      screenShareEnabled: true,
      maxParticipants: 50
    });
  };

  const filteredMeetings = meetings.filter(m => {
    if (activeTab === 'Active' && m.status !== 'Active') return false;
    if (activeTab === 'Scheduled' && m.status !== 'Scheduled') return false;
    if (activeTab === 'Ended' && m.status !== 'Ended' && m.status !== 'Cancelled') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        m.meetingCode.toLowerCase().includes(q) ||
        m.hostName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCount = meetings.filter(m => m.status === 'Active').length;
  const scheduledCount = meetings.filter(m => m.status === 'Scheduled').length;
  const completedCount = meetings.filter(m => m.status === 'Ended').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-slate-900 text-amber-400 border border-slate-800">
              <Video className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-serif font-bold text-slate-900">Video Meetings &amp; Rooms</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Create, schedule, and host council video meetings embedded on{' '}
            <span className="font-mono text-slate-700">nexgencouncil.bond/meeting/</span> via self-hosted Jitsi Meet.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleStartInstantMeeting}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Instant Meeting</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create / Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Private Invite-Only Notice Banner */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 px-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">
              Private &amp; Invite-Only Video Rooms
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Meetings are never listed publicly on the website or indexed by search engines (<span className="font-mono text-slate-300">noindex</span>). Only people with a direct private invite link can enter.
            </p>
          </div>
        </div>
        <span className="self-start sm:self-auto px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold whitespace-nowrap">
          Private Mode Active
        </span>
      </div>

      {/* Main View Switcher Tabs */}
      <div className="flex items-center gap-2 bg-slate-200/80 p-1.5 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveMainTab('rooms')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'rooms'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Video className="w-4 h-4 text-blue-600" />
          <span>Video Rooms ({meetings.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveMainTab('captures');
            fetchCaptures();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'captures'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Camera className="w-4 h-4 text-amber-600" />
          <span>Recordings &amp; Screenshots Archive ({captures.length})</span>
        </button>
      </div>

      {activeMainTab === 'rooms' && (
        <div className="space-y-6">
          {/* Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Total Rooms</span>
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{meetings.length}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Play className="w-5 h-5 fill-emerald-600" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Active Live</span>
            <span className="text-2xl font-bold text-emerald-600 tabular-nums">{activeCount}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Scheduled</span>
            <span className="text-2xl font-bold text-amber-600 tabular-nums">{scheduledCount}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block">Ended Archives</span>
            <span className="text-2xl font-bold text-slate-700 tabular-nums">{completedCount}</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          {(['All', 'Active', 'Scheduled', 'Ended'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 md:flex-initial whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search meeting title or room slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Meetings List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Loading scheduled meetings...</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Video className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-800">No Meetings Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create a new scheduled meeting or start an instant conference room to invite participants.
            </p>
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Meeting</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card List (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredMeetings.map(m => (
                <div key={m.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 leading-snug">{m.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>Host: {m.hostName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-700">{m.meetingCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-medium text-slate-700">
                          {m.activeParticipantCount ?? 0}/{m.maxParticipants || 50} live
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold shrink-0 ${
                        m.status === 'Active'
                          ? 'text-emerald-700'
                          : m.status === 'Scheduled'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {m.status === 'Active' ? 'Active Live' : m.status === 'Scheduled' ? 'Scheduled' : 'Ended'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="tabular-nums">
                      {new Date(m.scheduledStart || m.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {m.hasPassword && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-rose-700 font-medium">Password Protected</span>
                      </>
                    )}
                    {m.waitingRoomEnabled && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Lobby Enabled</span>
                      </>
                    )}
                    {m.isLocked && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-700 font-semibold">Locked</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {m.status !== 'Ended' && m.status !== 'Cancelled' && (
                      <a
                        href={`/meeting/${m.meetingCode}`}
                        onClick={(e) => handleJoinAsHost(e, m.meetingCode)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Join as Host</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopyLink(m.meetingCode)}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 border border-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedCode === m.meetingCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCode === m.meetingCode ? 'Copied' : 'Invite'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleLock(m)}
                      className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border text-xs cursor-pointer ${
                        m.isLocked
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                      title={m.isLocked ? 'Unlock room' : 'Lock room'}
                    >
                      {m.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(m)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 cursor-pointer"
                      title="Edit Room Settings"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleViewHistory(m)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600 cursor-pointer"
                      title="Attendance & Messages"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {m.status !== 'Ended' && m.status !== 'Cancelled' && (
                      confirmMeetingAction?.id === m.id && confirmMeetingAction.type === 'end' ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEndMeeting(m)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                          >
                            Confirm End
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmMeetingAction(null)}
                            className="min-h-[36px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmMeetingAction({ id: m.id, type: 'end' })}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Square className="w-3 h-3 fill-rose-600" />
                          <span>End</span>
                        </button>
                      )
                    )}

                    {confirmMeetingAction?.id === m.id && confirmMeetingAction.type === 'delete' ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteMeeting(m.id)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmMeetingAction(null)}
                          className="min-h-[36px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmMeetingAction({ id: m.id, type: 'delete' })}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Delete Meeting"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">Meeting Details</th>
                    <th className="px-6 py-3.5">Room Slug &amp; Website Link</th>
                    <th className="px-6 py-3.5">Status &amp; Schedule</th>
                    <th className="px-6 py-3.5">Room Behavior</th>
                    <th className="px-6 py-3.5 text-right">Host Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMeetings.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 leading-snug">{m.title}</div>
                        {m.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-xs">{m.description}</p>
                        )}
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <span>Host: {m.hostName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {m.status === 'Ended' || m.status === 'Cancelled'
                              ? `Max ${m.maxParticipants || 50}`
                              : `${m.activeParticipantCount ?? 0} / ${m.maxParticipants || 50} live`}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-xs font-mono font-semibold text-slate-800">{m.meetingCode}</div>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(m.meetingCode)}
                          className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {copiedCode === m.meetingCode ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copied Invite Link</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Invite Link</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <span
                            className={
                              m.status === 'Active'
                                ? 'text-emerald-700'
                                : m.status === 'Scheduled'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }
                          >
                            {m.status === 'Active' ? 'Active Live' : m.status === 'Scheduled' ? 'Scheduled' : 'Ended'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 tabular-nums">
                          {new Date(m.scheduledStart || m.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 max-w-xs">
                          {m.hasPassword && <span className="text-rose-700 font-medium">Password Protected</span>}
                          {m.waitingRoomEnabled && <span>Lobby Enabled</span>}
                          {m.startWithAudioMuted && <span>Audio Muted</span>}
                          {m.startWithVideoMuted && <span>Video Muted</span>}
                          <span>{m.screenShareEnabled !== false ? 'Screen Share On' : 'Screen Share Off'}</span>
                          {m.isLocked && <span className="text-amber-700 font-semibold">Locked</span>}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {m.status !== 'Ended' && m.status !== 'Cancelled' && (
                            <a
                              href={`/meeting/${m.meetingCode}`}
                              onClick={(e) => handleJoinAsHost(e, m.meetingCode)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>Start / Join as Host</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleLock(m)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                              m.isLocked
                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title={m.isLocked ? 'Unlock room' : 'Lock room'}
                          >
                            {m.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(m)}
                            className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Room Settings"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleViewHistory(m)}
                            className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Attendance & Messages"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {m.status !== 'Ended' && m.status !== 'Cancelled' && (
                            confirmMeetingAction?.id === m.id && confirmMeetingAction.type === 'end' ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEndMeeting(m)}
                                  className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  End All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmMeetingAction(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmMeetingAction({ id: m.id, type: 'end' })}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                                title="End Meeting"
                              >
                                <Square className="w-3 h-3 fill-rose-600" />
                                <span>End</span>
                              </button>
                            )
                          )}

                          {confirmMeetingAction?.id === m.id && confirmMeetingAction.type === 'delete' ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteMeeting(m.id)}
                                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmMeetingAction(null)}
                                className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmMeetingAction({ id: m.id, type: 'delete' })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete Meeting"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
        </div>
      )}

      {activeMainTab === 'captures' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-amber-900">3-Day Auto-Expiry Retention Policy</h3>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  All meeting recordings and screenshots are securely archived here and automatically purged after 3 days to preserve storage.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchCaptures}
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-xl border border-amber-300 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {captures.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Camera className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-800">No Recordings or Screenshots Captured Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Start a meeting room and click the Record or Snap button in the live call toolbar to capture and archive recordings here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-6 py-3.5">Type &amp; Filename</th>
                      <th className="px-6 py-3.5">Meeting Room</th>
                      <th className="px-6 py-3.5">Size &amp; Captured At</th>
                      <th className="px-6 py-3.5">Auto-Expiry (3 Days)</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {captures.map((cap) => {
                      const expiresAt = new Date(cap.expiresAt).getTime();
                      const now = Date.now();
                      const timeLeftHours = Math.max(0, Math.round((expiresAt - now) / (1000 * 60 * 60)));
                      const timeLeftDays = (timeLeftHours / 24).toFixed(1);

                      return (
                        <tr key={cap.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                  cap.kind === 'recording'
                                    ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                    : 'bg-blue-50 text-blue-600 border border-blue-200'
                                }`}
                              >
                                {cap.kind === 'recording' ? <Video className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                              </span>
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-900 block truncate max-w-xs">
                                  {cap.originalName || cap.filename}
                                </span>
                                <span className="text-[11px] text-slate-500 capitalize">
                                  {cap.kind}
                                  {typeof cap.durationSeconds === 'number' && cap.durationSeconds > 0
                                    ? ` · ${Math.floor(cap.durationSeconds / 60)}:${String(cap.durationSeconds % 60).padStart(2, '0')}`
                                    : ''}
                                  {cap.kind === 'recording' ? (cap.hasAudio ? ' · Audio + Video' : ' · Video') : ''}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-800 text-xs block truncate max-w-xs">
                              {cap.meetingTitle}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">{cap.meetingCode}</span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-xs">
                            <span className="font-medium text-slate-700 block">
                              {(cap.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                            </span>
                            <span className="text-slate-500 text-[11px]">
                              {new Date(cap.createdAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-xs">
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-medium border border-amber-200 text-[11px]">
                              {timeLeftHours <= 0 ? 'Expiring soon' : `${timeLeftDays} days left`}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingCapture(cap)}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Preview</span>
                              </button>
                              <a
                                href={cap.filename}
                                download={cap.originalName || true}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteCapture(cap.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete capture"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Capture Preview Modal */}
      {viewingCapture && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-serif font-bold text-slate-900 truncate">
                  {viewingCapture.originalName}
                </h3>
                <p className="text-xs text-slate-500">
                  Meeting: {viewingCapture.meetingTitle} ({viewingCapture.meetingCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCapture(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center p-2 min-h-[320px] max-h-[60vh]">
              {viewingCapture.kind === 'recording' ? (
                <video src={viewingCapture.filename} controls playsInline preload="metadata" className="max-w-full max-h-[50vh] rounded-xl" />
              ) : (
                <img src={viewingCapture.filename} alt="Screenshot preview" className="max-w-full max-h-[50vh] object-contain rounded-xl" />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 tabular-nums">
                Size: {(viewingCapture.sizeBytes / (1024 * 1024)).toFixed(2)} MB · Expires in 3 days
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={viewingCapture.filename}
                  download={viewingCapture.originalName || true}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download File</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingCapture(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Schedule Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-slate-900 text-amber-400">
                  <Video className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg font-serif font-bold text-slate-900">Create / Schedule Meeting</h3>
                  <p className="text-xs text-slate-500">Self-hosted Jitsi Meet embedded on nexgencouncil.bond</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Women Leadership Cohort Orientation"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Unique Room Slug
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSlugManuallyEdited(true);
                      setFormData(prev => ({ ...prev, roomSlug: generateRandomRoomSlug() }));
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Auto-Generate</span>
                  </button>
                </div>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="px-3 py-2.5 text-xs font-mono text-slate-500 bg-slate-100 border-r border-slate-200 select-none shrink-0">
                    /meeting/
                  </span>
                  <input
                    type="text"
                    placeholder="custom-room-slug"
                    value={formData.roomSlug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setFormData({ ...formData, roomSlug: slugifyRoomSlug(e.target.value) });
                    }}
                    className="flex-1 px-3 py-2.5 text-sm bg-transparent font-mono text-slate-900 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-mono truncate">
                  Invite URL: https://nexgencouncil.bond/meeting/{formData.roomSlug || 'auto-slug'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled Start
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.scheduledStart}
                    onChange={(e) => setFormData({ ...formData, scheduledStart: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled End (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.scheduledEnd}
                    onChange={(e) => setFormData({ ...formData, scheduledEnd: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <MaxParticipantsField
                value={formData.maxParticipants}
                onChange={(val) => setFormData(prev => ({ ...prev, maxParticipants: val }))}
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Agenda / Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief agenda or instructions for attendees..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Optional Room Password / Access PIN */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <ToggleSwitchRow
                  checked={formData.enablePassword}
                  onChange={(val) => setFormData({ ...formData, enablePassword: val })}
                  label="Room Password / Access PIN"
                  description="Require guests to enter a PIN before launching the meeting"
                  icon={<Lock className="w-4 h-4" />}
                />

                {formData.enablePassword && (
                  <input
                    type="text"
                    placeholder="Enter room password or numeric access PIN..."
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                )}
              </div>

              {/* Default Room Behavior Toggles */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <h4 className="text-xs font-semibold text-slate-800">Default Room Behavior</h4>

                <ToggleSwitchRow
                  checked={formData.startWithAudioMuted}
                  onChange={(val) => setFormData({ ...formData, startWithAudioMuted: val })}
                  label="Start with Audio Muted"
                  description="Microphones are muted automatically upon joining the call"
                  icon={<MicOff className="w-4 h-4" />}
                />

                <ToggleSwitchRow
                  checked={formData.startWithVideoMuted}
                  onChange={(val) => setFormData({ ...formData, startWithVideoMuted: val })}
                  label="Start with Video Muted"
                  description="Cameras remain turned off initially when joining"
                  icon={<VideoOff className="w-4 h-4" />}
                />

                <ToggleSwitchRow
                  checked={formData.waitingRoomEnabled}
                  onChange={(val) => setFormData({ ...formData, waitingRoomEnabled: val })}
                  label="Enable Lobby (Waiting Room)"
                  description="Hold unauthenticated guests in lobby until host admits them"
                  icon={<Shield className="w-4 h-4" />}
                />

                <ToggleSwitchRow
                  checked={formData.screenShareEnabled}
                  onChange={(val) => setFormData({ ...formData, screenShareEnabled: val })}
                  label="Allow Screen Sharing"
                  description="Enable desktop and window sharing controls inside the room"
                  icon={<Monitor className="w-4 h-4" />}
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating Room...' : 'Create Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance & Messages History Modal */}
      {viewingHistoryMeeting && (() => {
        const isMeetingClosed =
          viewingHistoryMeeting.status === 'Ended' || viewingHistoryMeeting.status === 'Cancelled';
        const activeAttendees = isMeetingClosed
          ? []
          : historyParticipants.filter(
              p => p.admissionStatus === 'admitted' && p.connectionStatus !== 'disconnected'
            );
        const pastAttendees = isMeetingClosed
          ? historyParticipants
          : historyParticipants.filter(
              p => p.connectionStatus === 'disconnected' || p.admissionStatus === 'rejected'
            );

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-serif font-bold text-slate-900 truncate">
                    {viewingHistoryMeeting.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                    Room Slug: {viewingHistoryMeeting.meetingCode}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fetchMeetingHistory(viewingHistoryMeeting)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 cursor-pointer"
                    title="Refresh attendance"
                    aria-label="Refresh attendance"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingHistoryMeeting(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {!isMeetingClosed && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 mb-3 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Currently In Room ({activeAttendees.length})</span>
                      </span>
                      <span className="text-[11px] font-normal text-slate-400">Auto-updates every 5s</span>
                    </h4>
                    {activeAttendees.length === 0 ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                        No participants are currently connected in this room.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {activeAttendees.map((p, idx) => (
                          <div
                            key={p.id || idx}
                            className="flex items-center justify-between gap-2 p-2.5 bg-emerald-50/60 rounded-xl text-xs border border-emerald-200/70"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-slate-900 truncate">{p.displayName}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold shrink-0">
                                Live
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5 text-slate-600 text-[11px] tabular-nums shrink-0">
                              <span className="capitalize font-medium text-slate-700">{p.role}</span>
                              {p.joinedAt && (
                                <span>
                                  Joined:{' '}
                                  {new Date(p.joinedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handleKickFromHistory(
                                    viewingHistoryMeeting.id,
                                    p.identity || p.id,
                                    p.displayName
                                  )
                                }
                                className="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-[10px] font-semibold cursor-pointer"
                                title="Disconnect participant from room"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className={!isMeetingClosed ? 'border-t border-slate-100 pt-4' : ''}>
                  <h4 className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>
                      {isMeetingClosed
                        ? `Participant Attendance (${pastAttendees.length})`
                        : `Left / Past Attendance (${pastAttendees.length})`}
                    </span>
                  </h4>
                  {pastAttendees.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No departed attendance records logged yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {pastAttendees.map((p, idx) => (
                        <div
                          key={p.id || idx}
                          className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-700 truncate">{p.displayName}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold shrink-0">
                              Left
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-slate-500 text-[11px] tabular-nums shrink-0">
                            <span className="capitalize font-medium text-slate-700">{p.role}</span>
                            {p.joinedAt && (
                              <span>
                                Joined:{' '}
                                {new Date(p.joinedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                            {p.leftAt && (
                              <span className="text-rose-600 font-medium">
                                Left:{' '}
                                {new Date(p.leftAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span>Persistent Chat Messages ({historyMessages.length})</span>
                  </h4>
                  {historyMessages.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No chat messages were recorded during this session.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 bg-slate-900 text-slate-200 p-4 rounded-2xl text-xs">
                      {historyMessages.map((msg, idx) => (
                        <div key={idx} className="space-y-0.5 border-b border-slate-800 pb-2">
                          <div className="flex items-center justify-between text-[11px] text-amber-400">
                            <span className="font-semibold">{msg.senderName}</span>
                            <span className="text-slate-500 text-[10px] tabular-nums">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-slate-300 text-xs">{msg.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Edit Meeting Settings Modal */}
      {editingMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-slate-900">Edit Meeting Settings</h3>
                <p className="text-xs text-slate-500 font-mono">
                  /meeting/{editingMeeting.meetingCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMeeting(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close edit modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMeeting} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled Start
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.scheduledStart}
                    onChange={e => setEditForm({ ...editForm, scheduledStart: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled End (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.scheduledEnd}
                    onChange={e => setEditForm({ ...editForm, scheduledEnd: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <MaxParticipantsField
                value={editForm.maxParticipants}
                onChange={(val) => setEditForm(prev => ({ ...prev, maxParticipants: val }))}
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Agenda / Description
                </label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <ToggleSwitchRow
                  checked={editForm.enablePassword}
                  onChange={val => setEditForm({ ...editForm, enablePassword: val })}
                  label="Room Password / Access PIN"
                  description="Toggle OFF to remove password, or type a new PIN below to replace it"
                  icon={<Lock className="w-4 h-4" />}
                />

                {editForm.enablePassword && (
                  <input
                    type="text"
                    placeholder={
                      editingMeeting.hasPassword
                        ? 'Enter new PIN (leave blank to keep existing PIN)...'
                        : 'Enter room password or numeric PIN...'
                    }
                    value={editForm.password}
                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <ToggleSwitchRow
                  checked={editForm.startWithAudioMuted}
                  onChange={val => setEditForm({ ...editForm, startWithAudioMuted: val })}
                  label="Start with Audio Muted"
                  description="Microphones muted initially upon joining"
                  icon={<MicOff className="w-4 h-4" />}
                />
                <ToggleSwitchRow
                  checked={editForm.startWithVideoMuted}
                  onChange={val => setEditForm({ ...editForm, startWithVideoMuted: val })}
                  label="Start with Video Muted"
                  description="Cameras turned off initially upon joining"
                  icon={<VideoOff className="w-4 h-4" />}
                />
                <ToggleSwitchRow
                  checked={editForm.waitingRoomEnabled}
                  onChange={val => setEditForm({ ...editForm, waitingRoomEnabled: val })}
                  label="Enable Lobby (Waiting Room)"
                  description="Hold unauthenticated guests until admitted by host"
                  icon={<Shield className="w-4 h-4" />}
                />
                <ToggleSwitchRow
                  checked={editForm.screenShareEnabled}
                  onChange={val => setEditForm({ ...editForm, screenShareEnabled: val })}
                  label="Allow Screen Sharing"
                  description="Enable desktop sharing inside the room"
                  icon={<Monitor className="w-4 h-4" />}
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMeeting(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Room Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
