import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Edit2,
  Trash2,
  Star,
  Newspaper,
  Calendar,
  User
} from 'lucide-react';
import { NewsItem } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

export const AdminNews: React.FC = () => {
  const { news, refreshData, addToast } = useApp();
  const [editingNews, setEditingNews] = useState<Partial<NewsItem> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNewModal = () => {
    setEditingNews({
      title: '',
      slug: '',
      category: 'Press Release',
      author: 'Council Secretariat',
      summary: '',
      content: '',
      coverImage: 'https://images.unsplash.com/photo-1577962917302-cd874c4e31d2?w=900&auto=format&fit=crop&q=80',
      publishedAt: new Date().toISOString().split('T')[0],
      featured: false,
      status: 'Published'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: NewsItem) => {
    setEditingNews({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews || !editingNews.title || !editingNews.summary) {
      addToast('Please provide required news fields', 'error');
      return;
    }

    setSaving(true);
    try {
      const isNew = !editingNews.id;
      const url = isNew ? '/api/news' : `/api/news/${editingNews.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingNews)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save news article');

      addToast(isNew ? 'News story published!' : 'News story updated!', 'success');
      setIsModalOpen(false);
      setEditingNews(null);
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error saving story', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete article "${title}"?`)) return;

    try {
      const res = await authFetch(`/api/news/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      addToast('Story deleted', 'info');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error deleting story', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            News &amp; Press Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Publish official announcements, research findings, and community stories.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Publish Story</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {news.map(item => (
          <div
            key={item.id}
            className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="aspect-16/9 bg-slate-900 relative overflow-hidden">
                <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover" />
                <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-slate-950/80 text-white text-[10px] font-semibold">
                  {item.category}
                </span>
                {item.featured && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">
                    Featured
                  </span>
                )}
              </div>

              <div className="p-5 space-y-2">
                <span className="text-[11px] text-slate-400 block">
                  {new Date(item.publishedAt).toLocaleDateString()} • {item.author}
                </span>
                <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {item.summary}
                </p>
              </div>
            </div>

            <div className="p-5 pt-0 border-t border-slate-100 flex items-center justify-between mt-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">
                {item.status}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(item)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-950 hover:bg-slate-100 cursor-pointer"
                  title="Edit Story"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(item.id, item.title)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="Delete Story"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && editingNews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-serif font-bold text-xl text-slate-900">
                {editingNews.id ? 'Edit News Story' : 'Draft New Announcement'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Story Headline *</label>
                <input
                  type="text"
                  required
                  value={editingNews.title || ''}
                  onChange={e => setEditingNews({ ...editingNews, title: e.target.value })}
                  placeholder="Headline..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={editingNews.category || 'Press Release'}
                    onChange={e => setEditingNews({ ...editingNews, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Author / Bylines</label>
                  <input
                    type="text"
                    value={editingNews.author || 'Council Secretariat'}
                    onChange={e => setEditingNews({ ...editingNews, author: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <ImageUploader
                  value={editingNews.coverImage || ''}
                  onChange={(url) => setEditingNews({ ...editingNews, coverImage: url })}
                  label="Cover Image"
                  helperText="Upload an article thumbnail or provide an image URL"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Short Summary (Preview) *</label>
                <textarea
                  rows={2}
                  required
                  value={editingNews.summary || ''}
                  onChange={e => setEditingNews({ ...editingNews, summary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Article Body</label>
                <textarea
                  rows={5}
                  value={editingNews.content || ''}
                  onChange={e => setEditingNews({ ...editingNews, content: e.target.value })}
                  placeholder="Complete text..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingNews.featured || false}
                    onChange={e => setEditingNews({ ...editingNews, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-950"
                  />
                  <span className="font-semibold text-slate-800">Feature on Homepage</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingNews.status === 'Published'}
                    onChange={e => setEditingNews({ ...editingNews, status: e.target.checked ? 'Published' : 'Draft' })}
                    className="w-4 h-4 rounded text-indigo-950"
                  />
                  <span className="font-semibold text-slate-800">Publish Immediately</span>
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
                  {saving ? 'Publishing...' : 'Save Story'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
