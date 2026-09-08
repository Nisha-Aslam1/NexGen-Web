import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  Linkedin,
  Mail,
  Award
} from 'lucide-react';
import { TeamMember } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

export const AdminTeam: React.FC = () => {
  const { team, refreshData, addToast } = useApp();
  const [editingMember, setEditingMember] = useState<Partial<TeamMember> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNewModal = () => {
    setEditingMember({
      name: '',
      position: '',
      department: 'Executive Board',
      bio: '',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
      order: team.length + 1,
      active: true,
      email: '',
      linkedin: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (mem: TeamMember) => {
    setEditingMember({ ...mem });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.name || !editingMember.position) {
      addToast('Please fill out required fields', 'error');
      return;
    }

    setSaving(true);
    try {
      const isNew = !editingMember.id;
      const url = isNew ? '/api/team' : `/api/team/${editingMember.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMember)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save member profile');

      addToast(isNew ? 'Member profile created!' : 'Member profile updated!', 'success');
      setIsModalOpen(false);
      setEditingMember(null);
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error saving team member', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete profile for ${name}?`)) return;

    try {
      const res = await authFetch(`/api/team/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      addToast('Profile deleted', 'info');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error deleting member', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Council Leadership &amp; Board Governance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage executive directorship, advisory council members, and program leads.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Add Council Member</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {team.map(mem => (
          <div
            key={mem.id}
            className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="aspect-square bg-slate-900 relative overflow-hidden">
                <img src={mem.image} alt={mem.name} className="w-full h-full object-cover" />
                <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-slate-950/80 text-amber-300 text-[10px] font-semibold backdrop-blur-xs">
                  {mem.department}
                </span>
                {!mem.active && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">
                    Inactive
                  </span>
                )}
              </div>

              <div className="p-5 space-y-1.5">
                <h3 className="font-serif font-bold text-base text-slate-900">{mem.name}</h3>
                <p className="text-xs font-semibold text-amber-700">{mem.position}</p>
                <p className="text-xs text-slate-500 line-clamp-2 pt-1">{mem.bio}</p>
              </div>
            </div>

            <div className="p-5 pt-0 border-t border-slate-100 flex items-center justify-between mt-2">
              <span className="text-[11px] text-slate-400">Order: #{mem.order}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(mem)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-950 hover:bg-slate-100 cursor-pointer"
                  title="Edit Profile"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(mem.id, mem.name)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="Delete Profile"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {editingMember.id ? 'Edit Member Profile' : 'Add New Council Member'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editingMember.name || ''}
                    onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <select
                    value={editingMember.department || 'Executive Board'}
                    onChange={e => setEditingMember({ ...editingMember, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Executive Board">Executive Board</option>
                    <option value="Leadership">Leadership</option>
                    <option value="Programs">Programs</option>
                    <option value="Technology">Technology</option>
                    <option value="Advisory Council">Advisory Council</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Official Position / Title *</label>
                <input
                  type="text"
                  required
                  value={editingMember.position || ''}
                  onChange={e => setEditingMember({ ...editingMember, position: e.target.value })}
                  placeholder="e.g. Founder & President or Director of Operations"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <ImageUploader
                  value={editingMember.image || ''}
                  onChange={(url) => setEditingMember({ ...editingMember, image: url })}
                  label="Profile Photograph"
                  helperText="Upload a portrait photo or enter an image URL"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bio</label>
                <textarea
                  rows={3}
                  value={editingMember.bio || ''}
                  onChange={e => setEditingMember({ ...editingMember, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editingMember.email || ''}
                    onChange={e => setEditingMember({ ...editingMember, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">LinkedIn URL</label>
                  <input
                    type="url"
                    value={editingMember.linkedin || ''}
                    onChange={e => setEditingMember({ ...editingMember, linkedin: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingMember.active ?? true}
                    onChange={e => setEditingMember({ ...editingMember, active: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-950"
                  />
                  <span className="font-semibold text-slate-800">Active Member</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
