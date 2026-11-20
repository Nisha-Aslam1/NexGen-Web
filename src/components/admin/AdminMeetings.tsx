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
  Monitor
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

export const AdminMeetings: React.FC = () => {
  const { addToast, authToken, setActivePage } = useApp();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'All' | 'Active' | 'Scheduled' | 'Ended'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const fetchMeetings = async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/meetings', { headers });
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

  useEffect(() => {
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 10000);
    return () => clearInterval(interval);
  }, []);

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
        maxParticipants: formData.maxParticipants
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
    if (!confirm(`End "${meeting.title}" and mark this meeting session as completed?`)) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${meeting.id}/end`, { method: 'POST', headers });
      if (res.ok) {
        addToast('Meeting marked as ended', 'info');
        fetchMeetings();
      }
    } catch {
      addToast('Error ending meeting', 'error');
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this meeting?')) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        addToast('Meeting deleted', 'success');
        fetchMeetings();
      }
    } catch {
      addToast('Error deleting meeting', 'error');
    }
  };

  const handleViewHistory = async (meeting: Meeting) => {
    setViewingHistoryMeeting(meeting);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const [pRes, mRes] = await Promise.all([
        fetch(`/api/meetings/${meeting.id}/participants`, { headers }).then(r => r.json()),
        fetch(`/api/meetings/${meeting.id}/messages`, { headers }).then(r => r.json())
      ]);

      setHistoryParticipants(pRes.participants || []);
      setHistoryMessages(mRes.messages || []);
    } catch (err) {
      console.error('Error loading history:', err);
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
          <div className="overflow-x-auto">
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
                        <span className="tabular-nums">Max {m.maxParticipants}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-xs font-mono font-semibold text-slate-800">{m.meetingCode}</div>
                      <button
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
                          onClick={() => handleViewHistory(m)}
                          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Attendance & Messages"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {m.status !== 'Ended' && m.status !== 'Cancelled' && (
                          <button
                            onClick={() => handleEndMeeting(m)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
                            title="End Meeting"
                          >
                            <Square className="w-3 h-3 fill-rose-600" />
                            <span>End</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteMeeting(m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Meeting"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
      {viewingHistoryMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-slate-900">{viewingHistoryMeeting.title}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Room Slug: {viewingHistoryMeeting.meetingCode}</p>
              </div>
              <button
                onClick={() => setViewingHistoryMeeting(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Participant Attendance ({historyParticipants.length})</span>
                </h4>
                {historyParticipants.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No attendance records logged for this session.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {historyParticipants.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100">
                        <div className="font-semibold text-slate-800">{p.displayName}</div>
                        <div className="flex items-center gap-3 text-slate-500 text-[11px] tabular-nums">
                          <span className="capitalize font-medium text-slate-700">{p.role}</span>
                          <span>Joined: {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
                          <span className="text-slate-500 text-[10px] tabular-nums">{new Date(msg.createdAt).toLocaleTimeString()}</span>
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
      )}
    </div>
  );
};
