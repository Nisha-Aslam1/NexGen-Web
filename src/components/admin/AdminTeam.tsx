import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripVertical,
  ArrowUpDown
} from 'lucide-react';
import { TeamMember } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

export const AdminTeam: React.FC = () => {
  const { team, refreshData, addToast } = useApp();
  const [editingMember, setEditingMember] = useState<Partial<TeamMember> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sortedTeam = useMemo(() => {
    return [...team].sort((a, b) => {
      const orderA = a.displayOrder ?? (a as any).order ?? 999;
      const orderB = b.displayOrder ?? (b as any).order ?? 999;
      return orderA - orderB;
    });
  }, [team]);

  const openNewModal = () => {
    const maxOrder = sortedTeam.reduce((max, m) => {
      const o = Number(m.displayOrder ?? (m as any).order ?? 0);
      return o > max ? o : max;
    }, 0);

    setEditingMember({
      name: '',
      position: '',
      department: 'Executive Board',
      bio: '',
      image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
      displayOrder: maxOrder + 1,
      active: true,
      email: '',
      linkedinUrl: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (mem: TeamMember) => {
    setEditingMember({
      ...mem,
      displayOrder: mem.displayOrder ?? (mem as any).order ?? 1,
      linkedinUrl: mem.linkedinUrl || (mem as any).linkedin || ''
    });
    setIsModalOpen(true);
  };

  const persistOrder = async (newOrderedList: TeamMember[]) => {
    setReordering(true);
    try {
      const orderedIds = newOrderedList.map(m => m.id);
      const res = await authFetch('/api/team/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update display sequence');

      addToast('Leadership display sequence updated!', 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error updating sequence', 'error');
    } finally {
      setReordering(false);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (reordering) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedTeam.length) return;

    const updated = [...sortedTeam];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    await persistOrder(updated);
  };

  const handlePositionJump = async (fromIndex: number, newPositionNumber: number) => {
    if (reordering) return;
    const targetIndex = Math.max(0, Math.min(sortedTeam.length - 1, newPositionNumber - 1));
    if (targetIndex === fromIndex) return;

    const updated = [...sortedTeam];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(targetIndex, 0, moved);
    await persistOrder(updated);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggedId || e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    setDragOverId(null);

    if (!sourceId || sourceId === targetId || reordering) return;

    const fromIndex = sortedTeam.findIndex(m => m.id === sourceId);
    const toIndex = sortedTeam.findIndex(m => m.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const updated = [...sortedTeam];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    await persistOrder(updated);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
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

      const payload = {
        ...editingMember,
        displayOrder: Number(editingMember.displayOrder) > 0 ? Number(editingMember.displayOrder) : 1
      };

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

  const departmentOptions = [
    'Executive Board',
    'Leadership',
    'Executive Directorate',
    'Operations',
    'Programs',
    'Academics & Strategy',
    'Partnerships',
    'Technology',
    'Advisory Council'
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Council Leadership &amp; Board Governance
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage executive directorship, advisory council members, and control their exact display sequence.
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

      {/* Sequence Helper Banner */}
      <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-950">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Display Sequence Control:</strong> Drag cards, use the <strong>Position #</strong> selector, or click arrow buttons to choose who appears 1st, 2nd, 3rd on the website.
          </span>
        </div>
        {reordering && (
          <span className="text-[11px] font-semibold text-indigo-900 animate-pulse">
            Saving new order...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedTeam.map((mem, index) => {
          const isDragging = draggedId === mem.id;
          const isDragOver = dragOverId === mem.id && draggedId !== mem.id;

          return (
            <div
              key={mem.id}
              draggable={!reordering}
              onDragStart={(e) => handleDragStart(e, mem.id)}
              onDragOver={(e) => handleDragOver(e, mem.id)}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => handleDrop(e, mem.id)}
              onDragEnd={handleDragEnd}
              className={`bg-white rounded-3xl border overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                isDragging
                  ? 'opacity-50 scale-[0.98] border-indigo-400'
                  : isDragOver
                  ? 'border-2 border-indigo-600 ring-4 ring-indigo-500/15'
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="aspect-square bg-slate-900 relative overflow-hidden">
                  <img
                    src={mem.image || '/logo.png'}
                    alt={mem.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.dataset.fallbackApplied) {
                        el.dataset.fallbackApplied = '1';
                        el.src = '/logo.png';
                        el.className = 'w-full h-full object-contain p-8 bg-slate-900';
                      }
                    }}
                    className="w-full h-full object-cover"
                  />

                  {/* Sequence Badge + Drag Handle */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-950/90 text-amber-300 text-[11px] font-bold backdrop-blur-xs shadow-sm cursor-grab active:cursor-grabbing"
                      title="Drag card to reorder"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-amber-400/90" />
                      <span>#{index + 1}</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-950/80 text-white text-[10px] font-semibold backdrop-blur-xs">
                      {mem.department}
                    </span>
                  </div>

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

              <div className="p-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
                {/* Quick Sequence Controls */}
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500" htmlFor={`pos-${mem.id}`}>
                    Pos:
                  </label>
                  <select
                    id={`pos-${mem.id}`}
                    disabled={reordering}
                    value={index + 1}
                    onChange={(e) => handlePositionJump(index, Number(e.target.value))}
                    className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer disabled:opacity-50"
                    title="Change display position"
                  >
                    {sortedTeam.map((_, posIdx) => (
                      <option key={posIdx + 1} value={posIdx + 1}>
                        #{posIdx + 1}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                    <button
                      type="button"
                      disabled={index === 0 || reordering}
                      onClick={() => handleMove(index, 'up')}
                      className="p-1.5 text-slate-600 hover:text-indigo-950 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      title="Move Earlier"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-slate-200" />
                    <button
                      type="button"
                      disabled={index === sortedTeam.length - 1 || reordering}
                      onClick={() => handleMove(index, 'down')}
                      className="p-1.5 text-slate-600 hover:text-indigo-950 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      title="Move Later"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Edit / Delete Actions */}
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
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {editingMember.id ? 'Edit Member Profile' : 'Add New Council Member'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
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
                    {departmentOptions.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
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
                  <label className="block font-semibold text-slate-700 mb-1">Display Order #</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editingMember.displayOrder ?? 1}
                    onChange={e => setEditingMember({ ...editingMember, displayOrder: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-indigo-950"
                  />
                </div>
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
                    value={editingMember.linkedinUrl || ''}
                    onChange={e => setEditingMember({ ...editingMember, linkedinUrl: e.target.value })}
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
