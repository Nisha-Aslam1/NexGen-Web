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
  Share2,
  Trash2,
  Edit,
  Eye,
  MessageSquare,
  Search,
  ExternalLink,
  AlertCircle,
  Sparkles
} from 'lucide-react';

export const AdminMeetings: React.FC = () => {
  const { addToast, authToken, currentUser } = useApp();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'All' | 'Active' | 'Scheduled' | 'Ended'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [viewingHistoryMeeting, setViewingHistoryMeeting] = useState<Meeting | null>(null);
  const [historyParticipants, setHistoryParticipants] = useState<any[]>([]);
  const [historyMessages, setHistoryMessages] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scheduledStart: '',
    scheduledEnd: '',
    password: '',
    enablePassword: false,
    waitingRoomEnabled: true,
    screenShareEnabled: true,
    maxParticipants: 50
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMeetings = async () => {
    setLoading(true);
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
    const interval = setInterval(fetchMeetings, 10000); // Polling every 10s for live meeting status updates
    return () => clearInterval(interval);
  }, []);

  const handleCopyLink = (meetingCode: string) => {
    const origin = window.location.origin;
    const url = `${origin}/room/${meetingCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(meetingCode);
    addToast('Meeting link copied to clipboard!', 'success');
    setTimeout(() => setCopiedCode(null), 3000);
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      addToast('Please enter a meeting title', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const body = {
        title: formData.title,
        description: formData.description,
        scheduledStart: formData.scheduledStart || new Date().toISOString(),
        scheduledEnd: formData.scheduledEnd || undefined,
        password: formData.enablePassword ? formData.password : undefined,
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

      addToast('Meeting created successfully!', 'success');
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

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `Instant Leadership Briefing - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          description: 'Live executive briefing hosted by council administrator.',
          scheduledStart: new Date().toISOString(),
          waitingRoomEnabled: true,
          screenShareEnabled: true,
          maxParticipants: 50
        })
      });

      const data = await res.json();
      if (res.ok && data.meeting) {
        addToast('Instant meeting created!', 'success');
        fetchMeetings();
        window.open(`/room/${data.meeting.meetingCode}`, '_blank');
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
    } catch (err: any) {
      addToast('Error toggling lock state', 'error');
    }
  };

  const handleEndMeeting = async (meeting: Meeting) => {
    if (!confirm(`Are you sure you want to end "${meeting.title}" for all participants?`)) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${meeting.id}/end`, { method: 'POST', headers });
      if (res.ok) {
        addToast('Meeting ended for everyone', 'info');
        fetchMeetings();
      }
    } catch (err: any) {
      addToast('Error ending meeting', 'error');
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm('Are you sure you want to delete this meeting record?')) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        addToast('Meeting record removed', 'success');
        fetchMeetings();
      }
    } catch (err: any) {
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
    setFormData({
      title: '',
      description: '',
      scheduledStart: '',
      scheduledEnd: '',
      password: '',
      enablePassword: false,
      waitingRoomEnabled: true,
      screenShareEnabled: true,
      maxParticipants: 50
    });
    setEditingMeeting(null);
  };

  // Filtering
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
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Video className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-serif font-bold text-slate-900">NexGen Council Video Meetings</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Schedule, manage, and host secure Google Meet-style video conferences across regional council networks.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleStartInstantMeeting}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Instant Meeting</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block uppercase tracking-wider">Total Meetings</span>
            <span className="text-2xl font-bold text-slate-900">{meetings.length}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold relative">
            <span className="relative flex h-3 w-3 absolute -top-1 -right-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <Play className="w-5 h-5 fill-emerald-600" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block uppercase tracking-wider">Active Now</span>
            <span className="text-2xl font-bold text-emerald-600">{activeCount}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block uppercase tracking-wider">Upcoming Scheduled</span>
            <span className="text-2xl font-bold text-amber-600">{scheduledCount}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 block uppercase tracking-wider">Completed Archives</span>
            <span className="text-2xl font-bold text-slate-700">{completedCount}</span>
          </div>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          {(['All', 'Active', 'Scheduled', 'Ended'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex-1 md:flex-initial ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search title or meeting code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Meetings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm font-medium">Loading video meeting sessions...</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Video className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-800">No Meetings Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no meetings matching your selected tab or search query. Click above to schedule or start an instant meeting.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Meeting Details</th>
                  <th className="px-6 py-3.5">Invitation Code &amp; Link</th>
                  <th className="px-6 py-3.5">Status &amp; Schedule</th>
                  <th className="px-6 py-3.5">Security &amp; Rules</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMeetings.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 leading-snug">{m.title}</div>
                      {m.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{m.description}</p>
                      )}
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span>Host: {m.hostName}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                        <span>{m.meetingCode}</span>
                        <button
                          onClick={() => handleCopyLink(m.meetingCode)}
                          className="text-slate-400 hover:text-blue-600 transition-colors cursor-pointer p-0.5"
                          title="Copy Invitation Link"
                        >
                          {copiedCode === m.meetingCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {m.status === 'Active' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          Active Now
                        </span>
                      )}
                      {m.status === 'Scheduled' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
                          <Clock className="w-3 h-3" /> Scheduled
                        </span>
                      )}
                      {m.status === 'Ended' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                          Completed
                        </span>
                      )}

                      <div className="text-[11px] text-slate-500 mt-1">
                        {new Date(m.scheduledStart || m.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1.5">
                        {m.hasPassword && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-semibold border border-rose-200">
                            <Lock className="w-3 h-3" /> Password
                          </span>
                        )}
                        {m.waitingRoomEnabled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-200">
                            <Shield className="w-3 h-3" /> Waiting Room
                          </span>
                        )}
                        {m.isLocked && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 text-[10px] font-bold">
                            Locked
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px]">
                          Max {m.maxParticipants}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/room/${m.meetingCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Join</span>
                        </a>

                        <button
                          onClick={() => handleToggleLock(m)}
                          className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                            m.isLocked
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                          title={m.isLocked ? 'Unlock meeting' : 'Lock meeting'}
                        >
                          {m.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => handleViewHistory(m)}
                          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="View Attendance & Messages"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {m.status === 'Active' && (
                          <button
                            onClick={() => handleEndMeeting(m)}
                            className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                            title="End Meeting for Everyone"
                          >
                            <Square className="w-4 h-4 fill-rose-600" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteMeeting(m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Record"
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

      {/* Schedule / Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Video className="w-5 h-5" />
                </span>
                <h3 className="text-lg font-serif font-bold text-slate-900">Schedule Video Meeting</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Women in Tech Fellowship Cohort Orientation"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Agenda / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of discussion topics or prerequisites..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
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
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Scheduled End
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.scheduledEnd}
                    onChange={(e) => setFormData({ ...formData, scheduledEnd: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Security &amp; Control Settings</h4>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Require Meeting Password</span>
                    <span className="text-[11px] text-slate-500">Participants must enter password before joining</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enablePassword}
                    onChange={(e) => setFormData({ ...formData, enablePassword: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                {formData.enablePassword && (
                  <div>
                    <input
                      type="password"
                      placeholder="Set 4-12 character password..."
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Enable Waiting Room</span>
                    <span className="text-[11px] text-slate-500">Host must manually admit participants</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.waitingRoomEnabled}
                    onChange={(e) => setFormData({ ...formData, waitingRoomEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Allow Screen Sharing</span>
                    <span className="text-[11px] text-slate-500">Participants can share screen during session</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.screenShareEnabled}
                    onChange={(e) => setFormData({ ...formData, screenShareEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Participant Capacity Limit
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={500}
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) || 50 })}
                    className="w-full px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Generating Room...' : 'Create Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance & Messages History Drawer */}
      {viewingHistoryMeeting && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-slate-900">{viewingHistoryMeeting.title}</h3>
                <p className="text-xs text-slate-500">Meeting Code: {viewingHistoryMeeting.meetingCode}</p>
              </div>
              <button
                onClick={() => setViewingHistoryMeeting(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Participants */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
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
                        <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                          <span className="capitalize px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">{p.role}</span>
                          <span>Joined: {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved Chat History */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>Persistent Chat Messages ({historyMessages.length})</span>
                </h4>
                {historyMessages.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No chat messages were recorded during this session.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1 bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono text-xs">
                    {historyMessages.map((msg, idx) => (
                      <div key={idx} className="space-y-0.5 border-b border-slate-800 pb-2">
                        <div className="flex items-center justify-between text-[11px] text-amber-400">
                          <span className="font-bold">{msg.senderName}</span>
                          <span className="text-slate-500 text-[10px]">{new Date(msg.createdAt).toLocaleTimeString()}</span>
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
