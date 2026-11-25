import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Search,
  Award,
  Trash2,
  Edit2,
  Camera
} from 'lucide-react';
import { Volunteer } from '../../types.ts';
import { VolunteerIdCardModal } from './VolunteerIdCardModal.tsx';

export const AdminVolunteers: React.FC = () => {
  const { addToast } = useApp();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Volunteer | null>(null);
  const [viewingIdCard, setViewingIdCard] = useState<Volunteer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchVolunteers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/volunteers');
      const data = await res.json();
      if (Array.isArray(data)) setVolunteers(data);
    } catch (err) {
      addToast('Error loading volunteers directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolunteers();
  }, []);

  const handleUpdateVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVolunteer) return;

    try {
      const res = await authFetch(`/api/volunteers/${editingVolunteer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingVolunteer)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update volunteer');

      setVolunteers(prev => prev.map(v => (v.id === editingVolunteer.id ? data : v)));
      addToast('Volunteer profile updated successfully', 'success');
      setEditingVolunteer(null);
    } catch (err: any) {
      addToast(err.message || 'Error updating volunteer', 'error');
    }
  };

  const uploadVolunteerAvatarFile = async (file: File): Promise<string> => {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
    const res = await authFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: rawDataUrl, filename: file.name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Photo upload failed');
    return data.url;
  };

  const handleEditModalAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingVolunteer) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadVolunteerAvatarFile(file);
      setEditingVolunteer(prev => (prev ? { ...prev, avatar: url } : null));
      addToast('Portrait photo uploaded! Click Save Changes to apply.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to upload photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveCardAvatar = async (volunteerId: string, newAvatarUrl: string) => {
    try {
      const res = await authFetch(`/api/volunteers/${volunteerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: newAvatarUrl })
      });
      if (res.ok) {
        const updated = await res.json();
        setVolunteers(prev => prev.map(v => (v.id === volunteerId ? updated : v)));
        setViewingIdCard(updated);
        addToast('ID Card portrait saved to volunteer profile.', 'success');
      }
    } catch {
      // Silently allow local preview even if offline
    }
  };

  const confirmDeleteVolunteer = async () => {
    if (!deleteCandidate) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/volunteers/${deleteCandidate.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Volunteer deletion failed');
      }
      setVolunteers(prev => prev.filter(v => v.id !== deleteCandidate.id));
      addToast(`Volunteer record for ${deleteCandidate.fullName} deleted successfully.`, 'info');
      if (editingVolunteer?.id === deleteCandidate.id) {
        setEditingVolunteer(null);
      }
      setDeleteCandidate(null);
    } catch (err: any) {
      addToast(err.message || 'Error deleting volunteer', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = volunteers.filter(v => {
    const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      v.fullName.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q) ||
      v.city.toLowerCase().includes(q) ||
      v.assignedRole.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Active Volunteers Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage inductees, track community hours, and supervise active project deployments.
          </p>
        </div>

        <button
          onClick={fetchVolunteers}
          className="px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer self-start sm:self-auto"
        >
          Refresh Directory
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search volunteers by name, email, city..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Status:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white"
          >
            <option value="All">All ({volunteers.length})</option>
            <option value="Active">Active ({volunteers.filter(v => v.status === 'Active').length})</option>
            <option value="On Leave">On Leave ({volunteers.filter(v => v.status === 'On Leave').length})</option>
            <option value="Alumni">Alumni ({volunteers.filter(v => v.status === 'Alumni').length})</option>
          </select>
        </div>
      </div>

      {/* Volunteers Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 font-semibold">Volunteer</th>
                <th className="py-3 px-4 font-semibold">Role &amp; Chapter</th>
                <th className="py-3 px-4 font-semibold">Logged Hours</th>
                <th className="py-3 px-4 font-semibold">Joined Date</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading volunteer directory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No volunteers found.
                  </td>
                </tr>
              ) : (
                filtered.map(vol => (
                  <tr key={vol.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-950 text-amber-300 font-serif font-bold text-xs flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                          {vol.avatar ? (
                            <img src={vol.avatar} alt={vol.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            vol.fullName.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <strong className="text-slate-900 block text-xs">{vol.fullName}</strong>
                          <span className="text-[11px] text-slate-400 block">{vol.email} • {vol.phone}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-indigo-950 block">{vol.assignedRole}</span>
                      <span className="text-[10px] text-slate-400 block">{vol.city} Chapter</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono tabular-nums font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {vol.hoursContributed ?? vol.hoursLogged ?? 0} hrs
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(vol.joinedDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          vol.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : vol.status === 'On Leave'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {vol.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingIdCard(vol)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                          title="View Official Digital ID Card"
                          aria-label={`View ID Card for ${vol.fullName}`}
                        >
                          <Award className="w-4 h-4 text-amber-500" />
                        </button>
                        <button
                          onClick={() => setEditingVolunteer(vol)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-950 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit Volunteer Details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(vol)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Volunteer Record"
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

      {/* Official Digital ID Card Modal */}
      {viewingIdCard && (
        <VolunteerIdCardModal
          volunteer={viewingIdCard}
          isAdmin={true}
          onAvatarChange={(newUrl) => handleSaveCardAvatar(viewingIdCard.id, newUrl)}
          onClose={() => setViewingIdCard(null)}
        />
      )}

      {/* Edit Volunteer Modal */}
      {editingVolunteer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-lg text-slate-900">
                Edit Volunteer Record: {editingVolunteer.fullName}
              </h3>
              <button
                onClick={() => setEditingVolunteer(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateVolunteer} className="space-y-4 text-xs">
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="w-16 h-16 rounded-2xl bg-indigo-950 text-amber-300 font-serif font-bold text-lg flex items-center justify-center overflow-hidden shrink-0 border-2 border-amber-400/60">
                  {editingVolunteer.avatar ? (
                    <img src={editingVolunteer.avatar} alt={editingVolunteer.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    editingVolunteer.fullName.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="block font-semibold text-slate-700">Member ID Portrait Photo</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-white font-semibold cursor-pointer transition-colors">
                      <Camera className="w-3.5 h-3.5 text-amber-300" />
                      <span>{uploadingPhoto ? 'Uploading...' : 'Upload Portrait'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleEditModalAvatarChange}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                    </label>
                    {editingVolunteer.avatar && (
                      <button
                        type="button"
                        onClick={() => setEditingVolunteer({ ...editingVolunteer, avatar: '' })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Role</label>
                <input
                  type="text"
                  required
                  value={editingVolunteer.assignedRole}
                  onChange={e => setEditingVolunteer({ ...editingVolunteer, assignedRole: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editingVolunteer.status}
                    onChange={e => setEditingVolunteer({ ...editingVolunteer, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Alumni">Alumni</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hours Logged</label>
                  <input
                    type="number"
                    value={editingVolunteer.hoursContributed ?? editingVolunteer.hoursLogged ?? 0}
                    onChange={e => setEditingVolunteer({ ...editingVolunteer, hoursContributed: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City Chapter</label>
                  <input
                    type="text"
                    value={editingVolunteer.city}
                    onChange={e => setEditingVolunteer({ ...editingVolunteer, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Membership Tier</label>
                  <select
                    value={editingVolunteer.membershipTier || ''}
                    onChange={e => setEditingVolunteer({ ...editingVolunteer, membershipTier: (e.target.value || undefined) as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="">Auto-Assigned by Role/Hours</option>
                    <option value="Active Volunteer Scholar">Active Volunteer Scholar</option>
                    <option value="Senior Coordinator">Senior Coordinator</option>
                    <option value="Distinguished Fellow">Distinguished Fellow</option>
                    <option value="Executive Member">Executive Member</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const candidate = editingVolunteer;
                    setEditingVolunteer(null);
                    setDeleteCandidate(candidate);
                  }}
                  className="px-3.5 py-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Volunteer</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingVolunteer(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Volunteer Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="font-serif font-bold text-lg text-slate-900">Delete Volunteer Record?</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete the record for <strong>{deleteCandidate.fullName}</strong> ({deleteCandidate.assignedRole}, {deleteCandidate.city} Chapter)? This will remove them from the active volunteer directory.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteVolunteer}
                disabled={deleting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Yes, Delete Volunteer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
