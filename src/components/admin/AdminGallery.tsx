import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Trash2,
  Edit2
} from 'lucide-react';
import { GalleryItem } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

const GALLERY_CATEGORIES = [
  'Workshops',
  'Summits',
  'Summit',
  'Technology',
  'Outreach',
  'Ceremonies',
  'Ceremony'
];

export const AdminGallery: React.FC = () => {
  const { gallery, refreshData, addToast } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formItem, setFormItem] = useState<Partial<GalleryItem>>({
    title: '',
    category: 'Workshops',
    caption: '',
    imageUrl: '',
    date: new Date().toISOString().split('T')[0],
    displayOrder: 1
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setEditingId(null);
    setFormItem({
      title: '',
      category: 'Workshops',
      caption: '',
      imageUrl: '',
      date: new Date().toISOString().split('T')[0],
      displayOrder: gallery.length + 1
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: GalleryItem) => {
    setEditingId(item.id);
    setFormItem({
      title: item.title || '',
      category: item.category || 'Workshops',
      caption: item.caption || '',
      imageUrl: item.imageUrl || '',
      date: item.date || new Date().toISOString().split('T')[0],
      displayOrder: item.displayOrder ?? 1
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formItem.title?.trim() || !formItem.imageUrl?.trim()) {
      addToast('Please provide title and image URL', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formItem,
        title: formItem.title.trim(),
        imageUrl: formItem.imageUrl.trim(),
        caption: formItem.caption?.trim() || '',
        displayOrder: Number(formItem.displayOrder) || 1
      };

      const isEdit = Boolean(editingId);
      const res = await authFetch(isEdit ? `/api/gallery/${editingId}` : '/api/gallery', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${isEdit ? 'update' : 'add'} media`);

      addToast(isEdit ? 'Gallery photo updated successfully!' : 'Image uploaded to archives!', 'success');
      closeModal();
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error saving gallery item', 'error');
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
            Curate, edit, and organize photos from field workshops, leadership ceremonies, and summit halls.
          </p>
        </div>

        <button
          onClick={openCreateModal}
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
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="p-1.5 rounded-full bg-white/95 text-slate-900 hover:bg-amber-300 transition-colors cursor-pointer shadow-sm"
                  title="Edit Image Details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-500 transition-colors cursor-pointer shadow-sm"
                  title="Delete Image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-white">
                <span className="text-[10px] text-amber-400 font-semibold uppercase">
                  {item.category}
                </span>
                <p className="text-xs font-bold truncate">{item.title}</p>
                {item.caption && (
                  <p className="text-[10px] text-slate-300 truncate mt-0.5">{item.caption}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-lg text-slate-900">
                {editingId ? 'Edit Archive Photo' : 'Add Archive Photo'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formItem.title || ''}
                  onChange={e => setFormItem({ ...formItem, title: e.target.value })}
                  placeholder="e.g. Grassroots Technology Lab"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formItem.category || 'Workshops'}
                    onChange={e => setFormItem({ ...formItem, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  >
                    {Array.from(
                      new Set([
                        ...GALLERY_CATEGORIES,
                        ...(formItem.category ? [formItem.category] : [])
                      ])
                    ).map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min={1}
                    value={formItem.displayOrder ?? 1}
                    onChange={e =>
                      setFormItem({ ...formItem, displayOrder: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={formItem.date || ''}
                  onChange={e => setFormItem({ ...formItem, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <ImageUploader
                  value={formItem.imageUrl || ''}
                  onChange={url => setFormItem({ ...formItem, imageUrl: url })}
                  label="Archive Photo"
                  helperText="Upload an image directly from your computer or provide an image URL"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Caption</label>
                <textarea
                  rows={2}
                  value={formItem.caption || ''}
                  onChange={e => setFormItem({ ...formItem, caption: e.target.value })}
                  placeholder="Short description..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add to Archive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
