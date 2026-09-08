import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { GalleryItem } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

export const AdminGallery: React.FC = () => {
  const { gallery, refreshData, addToast } = useApp();
  const [newItem, setNewItem] = useState<Partial<GalleryItem>>({
    title: '',
    category: 'Workshops',
    caption: '',
    imageUrl: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.title || !newItem.imageUrl) {
      addToast('Please provide title and image URL', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add media');

      addToast('Image uploaded to archives!', 'success');
      setIsModalOpen(false);
      setNewItem({ title: '', category: 'Workshops', caption: '', imageUrl: '' });
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error adding image', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this photo from the gallery?')) return;

    try {
      const res = await authFetch(`/api/gallery/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      addToast('Image removed', 'info');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error deleting item', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Media &amp; Visual Archives
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Curate photos from field workshops, leadership ceremonies, and summit halls.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Upload Archive Media</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {gallery.map(item => (
          <div
            key={item.id}
            className="group relative rounded-2xl overflow-hidden bg-slate-900 aspect-square shadow-xs hover:shadow-lg transition-all"
          >
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
              <div className="flex justify-end">
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-500 transition-colors cursor-pointer"
                  title="Delete Image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-white">
                <span className="text-[10px] text-amber-400 font-semibold uppercase">{item.category}</span>
                <p className="text-xs font-bold truncate">{item.title}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-lg text-slate-900">Add Archive Photo</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={newItem.title}
                  onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                  placeholder="e.g. Grassroots Technology Lab"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={newItem.category}
                  onChange={e => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Workshops">Workshops</option>
                  <option value="Summits">Summits</option>
                  <option value="Technology">Technology</option>
                  <option value="Outreach">Outreach</option>
                  <option value="Ceremonies">Ceremonies</option>
                </select>
              </div>

              <div>
                <ImageUploader
                  value={newItem.imageUrl || ''}
                  onChange={(url) => setNewItem({ ...newItem, imageUrl: url })}
                  label="Archive Photo"
                  helperText="Upload an image directly from your computer or provide an image URL"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Caption</label>
                <textarea
                  rows={2}
                  value={newItem.caption}
                  onChange={e => setNewItem({ ...newItem, caption: e.target.value })}
                  placeholder="Short description..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
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
                  {saving ? 'Adding...' : 'Add to Archive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
