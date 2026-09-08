import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Trash2,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Calendar,
  GraduationCap,
  HeartHandshake,
  AlertCircle,
  Check,
  Copy
} from 'lucide-react';
import { VolunteerApplication, ApplicationStatus } from '../../types.ts';

export const AdminApplications: React.FC = () => {
  const { addToast } = useApp();
  const [applications, setApplications] = useState<VolunteerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [cityFilter, setCityFilter] = useState<string>('All');
  const [selectedApp, setSelectedApp] = useState<VolunteerApplication | null>(null);
  const [editingStatus, setEditingStatus] = useState<ApplicationStatus>('Pending');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<VolunteerApplication | null>(null);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/applications?perPage=500');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setApplications(list);
    } catch (err) {
      addToast('Failed to load volunteer applications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const openDossier = (app: VolunteerApplication) => {
    setSelectedApp(app);
    setEditingStatus(app.status);
    setReviewNotes(app.reviewNotes || '');
  };

  const handleStatusUpdate = async (appId: string, newStatus: ApplicationStatus, notes: string) => {
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/applications/${appId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reviewNotes: notes })
      });

      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.error || 'Failed to update status');
      }

      setApplications(prev => prev.map(a => (a.id === appId ? updated : a)));
      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp(updated);
      }

      addToast(
        newStatus === 'Approved'
          ? 'Application approved! Candidate automatically enrolled into Volunteers directory.'
          : `Application status updated to ${newStatus}.`,
        'success'
      );
    } catch (err: any) {
      addToast(err.message || 'Error updating application status', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      const res = await authFetch(`/api/applications/${deleteCandidate.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      setApplications(prev => prev.filter(a => a.id !== deleteCandidate.id));
      if (selectedApp?.id === deleteCandidate.id) setSelectedApp(null);
      addToast('Application record deleted successfully', 'info');
      setDeleteCandidate(null);
    } catch (err: any) {
      addToast(err.message || 'Error deleting application', 'error');
    }
  };

  const handleExportCSV = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : null;
    const exportUrl = '/api/applications/export/csv' + (token ? `?auth_token=${encodeURIComponent(token)}` : '');
    window.open(exportUrl, '_blank');
    addToast('Exporting complete applicant CSV file...', 'info');
  };

  // Cities extracted for filter dropdown
  const uniqueCities = Array.from(new Set(applications.map(a => a.city).filter(Boolean)));

  const filtered = applications.filter(a => {
    const matchesStatus = statusFilter === 'All' || a.status === statusFilter;
    const matchesCity = cityFilter === 'All' || a.city === cityFilter;
    const query = search.toLowerCase();
    const matchesSearch =
      a.fullName.toLowerCase().includes(query) ||
      a.email.toLowerCase().includes(query) ||
      a.phone.toLowerCase().includes(query) ||
      a.referenceCode.toLowerCase().includes(query) ||
      (a.preferredRole && a.preferredRole.toLowerCase().includes(query));

    return matchesStatus && matchesCity && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Volunteer Applications Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review incoming candidate dossiers, update approval states, and synchronize directly with active chapters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={fetchApplications}
            className="px-3.5 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, ref code..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white focus:ring-1 focus:ring-indigo-300"
            >
              <option value="All">All Statuses ({applications.length})</option>
              <option value="Pending">Pending ({applications.filter(a => a.status === 'Pending').length})</option>
              <option value="Under Review">Under Review ({applications.filter(a => a.status === 'Under Review').length})</option>
              <option value="Approved">Approved ({applications.filter(a => a.status === 'Approved').length})</option>
              <option value="Rejected">Rejected ({applications.filter(a => a.status === 'Rejected').length})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>City:</span>
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white focus:ring-1 focus:ring-indigo-300"
            >
              <option value="All">All Cities</option>
              {uniqueCities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 font-semibold">Reference</th>
                <th className="py-3 px-4 font-semibold">Applicant Details</th>
                <th className="py-3 px-4 font-semibold">Education &amp; Profession</th>
                <th className="py-3 px-4 font-semibold">Role Preference</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading applicant records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No applications found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                filtered.map(app => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-indigo-950">
                      {app.referenceCode}
                    </td>

                    <td className="py-3.5 px-4">
                      <strong className="text-slate-900 block text-xs">{app.fullName}</strong>
                      <span className="text-[11px] text-slate-500 block">{app.email}</span>
                      <span className="text-[10px] text-slate-400 block">{app.phone} • {app.city}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-800 block">{app.profession}</span>
                      <span className="text-[10px] text-slate-400 block">{app.educationLevel}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-800 block">{app.preferredRole || 'General'}</span>
                      <span className="text-[10px] text-slate-400 block">{app.availableHours}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          app.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : app.status === 'Under Review'
                            ? 'bg-amber-100 text-amber-900'
                            : app.status === 'Rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {app.status === 'Approved' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {app.status === 'Under Review' && <Clock className="w-3 h-3 text-amber-600" />}
                        {app.status === 'Rejected' && <XCircle className="w-3 h-3 text-rose-600" />}
                        <span>{app.status}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openDossier(app)}
                          className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-semibold transition-colors cursor-pointer"
                          title="View Full Dossier"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(app)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Application"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Dossier Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-8 max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setSelectedApp(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full cursor-pointer"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="border-b border-slate-200 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">
                    {selectedApp.referenceCode}
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-slate-900 mt-1">
                    {selectedApp.fullName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Submitted on {new Date(selectedApp.submittedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      selectedApp.status === 'Approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedApp.status === 'Under Review'
                        ? 'bg-amber-100 text-amber-900'
                        : selectedApp.status === 'Rejected'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Current Status: {selectedApp.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Dossier Content Tabs / Blocks */}
            <div className="space-y-6 text-xs text-slate-700">
              {/* 1. Contact & Demographics */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] block">
                  1. Contact &amp; Personal Info
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block">Email:</span>
                    <strong className="text-slate-900 truncate block">{selectedApp.email}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Phone:</span>
                    <strong className="text-slate-900">{selectedApp.phone}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">City / District:</span>
                    <strong className="text-slate-900">{selectedApp.city}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Date of Birth / Gender:</span>
                    <strong className="text-slate-900">{selectedApp.dateOfBirth || '—'} ({selectedApp.gender || '—'})</strong>
                  </div>
                </div>
                {selectedApp.address && (
                  <div className="pt-1 text-slate-600">
                    <span className="text-slate-400">Address: </span> {selectedApp.address}
                  </div>
                )}
              </div>

              {/* 2. Education & Background */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] block">
                  2. Background, Education &amp; Skills
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block">Education Level:</span>
                    <strong className="text-slate-900">{selectedApp.educationLevel}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Current Profession:</span>
                    <strong className="text-slate-900">{selectedApp.profession}</strong>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Declared Skills:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedApp.skills.map((s, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedApp.previousVolunteerExperience && (
                  <div className="pt-1">
                    <span className="text-slate-400 block mb-0.5">Previous Volunteer Work:</span>
                    <p className="bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700 leading-relaxed">
                      {selectedApp.previousVolunteerExperience}
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Volunteering Intent & Commitment */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] block">
                  3. Motivation &amp; Availability
                </span>
                <div>
                  <span className="text-slate-400 block mb-1">Why They Want to Join NexGen:</span>
                  <p className="bg-white p-3 rounded-xl border border-slate-200 text-slate-800 leading-relaxed font-normal">
                    {selectedApp.whyJoin}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <span className="text-slate-400 block">Target Role:</span>
                    <strong className="text-slate-900">{selectedApp.preferredRole || 'General'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Availability:</span>
                    <strong className="text-slate-900">{selectedApp.availableHours}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Available Days:</span>
                    <strong className="text-slate-900">{selectedApp.availableDays.join(', ')}</strong>
                  </div>
                </div>
              </div>

              {/* 4. Emergency & Notes */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] block">
                  4. Emergency Contact &amp; Additional Information
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block">Emergency Contact:</span>
                    <strong className="text-slate-900">{selectedApp.emergencyContactName || 'Not specified'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Emergency Phone:</span>
                    <strong className="text-slate-900">{selectedApp.emergencyContactPhone || 'Not specified'}</strong>
                  </div>
                </div>
                {selectedApp.additionalMessage && (
                  <div className="pt-1">
                    <span className="text-slate-400 block mb-0.5">Applicant Note:</span>
                    <p className="bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700">
                      {selectedApp.additionalMessage}
                    </p>
                  </div>
                )}
              </div>

              {/* Committee Review Action Form */}
              <div className="bg-indigo-900/5 p-5 rounded-2xl border border-indigo-900/10 space-y-4">
                <span className="font-bold text-indigo-950 uppercase tracking-wider text-xs block">
                  Committee Review &amp; Status Determination
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Change Application Status:
                    </label>
                    <select
                      value={editingStatus}
                      onChange={e => setEditingStatus(e.target.value as ApplicationStatus)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="Pending">Pending (Queue)</option>
                      <option value="Under Review">Under Review (Committee)</option>
                      <option value="Approved">Approved (Induct as Active Volunteer)</option>
                      <option value="Rejected">Rejected (Declined)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Internal Committee Notes:
                    </label>
                    <textarea
                      rows={2}
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      placeholder="e.g. Cleared phone interview; assigned to Lahore chapter media squad."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-500">
                    * Approving an applicant automatically enrolls them into the live Volunteers directory.
                  </span>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleStatusUpdate(selectedApp.id, editingStatus, reviewNotes)}
                    className="px-5 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Updating...' : 'Save Review & Update Status'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
            <div className="text-center space-y-1">
              <h4 className="font-serif font-bold text-lg text-slate-900">Delete Application Record?</h4>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete the record for <strong>{deleteCandidate.fullName}</strong> ({deleteCandidate.referenceCode})? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
