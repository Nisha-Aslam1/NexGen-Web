import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Edit2,
  Trash2,
  Star,
  BookOpen,
  Calendar,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Program } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

export const AdminPrograms: React.FC = () => {
  const { programs, refreshData, addToast } = useApp();
  const [editingProgram, setEditingProgram] = useState<Partial<Program> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNewProgramModal = () => {
    setEditingProgram({
      title: '',
      slug: '',
      category: 'Leadership',
      shortDescription: '',
      fullDescription: '',
      coverImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=900&auto=format&fit=crop&q=80',
      featured: false,
      status: 'Published',
      startDate: 'October 2026',
      endDate: 'Ongoing',
      targetAudience: 'University students & emerging professionals',
      curriculumHighlights: ['Civic Ethics & Public Narrative', 'Grassroots Project Management']
    });
    setIsModalOpen(true);
  };

  const openEditModal = (prg: Program) => {
    setEditingProgram({ ...prg });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgram || !editingProgram.title || !editingProgram.shortDescription) {
      addToast('Please complete required fields', 'error');
      return;
    }

    setSaving(true);
    try {
      const isNew = !editingProgram.id;
      const url = isNew ? '/api/programs' : `/api/programs/${editingProgram.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProgram)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save program');

      addToast(isNew ? 'Program created successfully!' : 'Program updated successfully!', 'success');
      setIsModalOpen(false);
      setEditingProgram(null);
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error saving program', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const res = await authFetch(`/api/programs/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      addToast('Program deleted', 'info');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error deleting program', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Programs &amp; Leadership Cohorts
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage public training cohorts, curriculum outlines, and admission windows.
          </p>
        </div>

        <button
          onClick={openNewProgramModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Add New Program</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {programs.map(prg => (
          <div
            key={prg.id}
            className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="aspect-16/9 bg-slate-900 relative overflow-hidden">
                <img src={prg.coverImage} alt={prg.title} className="w-full h-full object-cover" />
                <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-white/90 text-indigo-950 text-[10px] font-bold uppercase tracking-wider backdrop-blur-xs">
                  {prg.category}
                </span>
                {prg.featured && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Star className="w-3 h-3 fill-slate-950" /> Flagship
                  </span>
                )}
              </div>

              <div className="p-5 space-y-2">
                <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                  {prg.title}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {prg.shortDescription}
                </p>
                <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{prg.startDate || 'Quarterly'} - {prg.endDate || 'Ongoing'}</span>
                </div>
              </div>
            </div>

            <div className="p-5 pt-0 border-t border-slate-100 flex items-center justify-between mt-2">
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                {prg.status}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(prg)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-950 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Edit Program"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(prg.id, prg.title)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Delete Program"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Program Create/Edit Modal */}
      {isModalOpen && editingProgram && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {editingProgram.id ? 'Edit Program Details' : 'Create New Program Cohort'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={editingProgram.title || ''}
                    onChange={e => setEditingProgram({ ...editingProgram, title: e.target.value })}
                    placeholder="e.g. 30-Day Leadership Series"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={editingProgram.category || 'Leadership'}
                    onChange={e => setEditingProgram({ ...editingProgram, category: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="Leadership">Leadership</option>
                    <option value="Technology">Technology</option>
                    <option value="Community">Community</option>
                    <option value="Advocacy">Advocacy</option>
                  </select>
                </div>
              </div>

              <div>
                <ImageUploader
                  value={editingProgram.coverImage || ''}
                  onChange={(url) => setEditingProgram({ ...editingProgram, coverImage: url })}
                  label="Cover Image"
                  helperText="Upload program hero graphic or specify image URL"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Short Description *</label>
                <textarea
                  rows={2}
                  required
                  value={editingProgram.shortDescription || ''}
                  onChange={e => setEditingProgram({ ...editingProgram, shortDescription: e.target.value })}
                  placeholder="Summary shown on cards..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Description &amp; Objectives</label>
                <textarea
                  rows={4}
                  value={editingProgram.fullDescription || ''}
                  onChange={e => setEditingProgram({ ...editingProgram, fullDescription: e.target.value })}
                  placeholder="Comprehensive curriculum and goals..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="text"
                    value={editingProgram.startDate || ''}
                    onChange={e => setEditingProgram({ ...editingProgram, startDate: e.target.value })}
                    placeholder="e.g. October 15, 2026"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="text"
                    value={editingProgram.endDate || ''}
                    onChange={e => setEditingProgram({ ...editingProgram, endDate: e.target.value })}
                    placeholder="e.g. November 15, 2026"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProgram.featured || false}
                    onChange={e => setEditingProgram({ ...editingProgram, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-950"
                  />
                  <span className="font-semibold text-slate-800">Featured Flagship Program</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProgram.status === 'Published'}
                    onChange={e => setEditingProgram({ ...editingProgram, status: e.target.checked ? 'Published' : 'Draft' })}
                    className="w-4 h-4 rounded text-indigo-950"
                  />
                  <span className="font-semibold text-slate-800">Published to Public Site</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
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
                  {saving ? 'Saving...' : 'Save Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
