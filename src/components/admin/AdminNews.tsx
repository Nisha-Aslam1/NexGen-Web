import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Globe,
  Tag,
  Clock,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2
} from 'lucide-react';
import { NewsItem } from '../../types.ts';
import { ImageUploader } from '../common/ImageUploader.tsx';

const SUGGESTED_SEO_KEYWORDS = [
  'NexGen Council',
  'Women Empowerment',
  'Youth Leadership Pakistan',
  'Civic Engagement',
  '30-Day Leadership Series',
  'Community Outreach',
  'Female Entrepreneurship',
  'Youth Policy'
];

const NEWS_CATEGORIES = [
  'Press Release',
  'Announcement',
  'Policy Brief',
  'Research Dispatch',
  'Community Story',
  'Fellowship Spotlight',
  'Event Recap'
];

function computeReadTime(content?: string, override?: number): number {
  if (override && override > 0) return override;
  const words = (content || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const AdminNews: React.FC = () => {
  const { news, settings, refreshData, addToast } = useApp();
  const [editingNews, setEditingNews] = useState<Partial<NewsItem> | null>(null);
  const [modalTab, setModalTab] = useState<'content' | 'seo'>('content');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Admin News list filter & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Published' | 'Draft'>('All');

  // Article modal keyword & tag inputs
  const [tagInput, setTagInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  // Global /news Page SEO Settings Drawer
  const [showGlobalSeo, setShowGlobalSeo] = useState(false);
  const [globalSeoTitle, setGlobalSeoTitle] = useState('');
  const [globalSeoDesc, setGlobalSeoDesc] = useState('');
  const [globalSeoKeywords, setGlobalSeoKeywords] = useState<string[]>([]);
  const [globalKeywordInput, setGlobalKeywordInput] = useState('');
  const [savingGlobalSeo, setSavingGlobalSeo] = useState(false);

  useEffect(() => {
    if (settings) {
      setGlobalSeoTitle(settings.newsSeoTitle || '');
      setGlobalSeoDesc(settings.newsSeoDescription || '');
      setGlobalSeoKeywords(Array.isArray(settings.newsSeoKeywords) ? settings.newsSeoKeywords : []);
    }
  }, [settings]);

  const filteredNews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return news.filter(item => {
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.seoKeywords || []).some(k => k.toLowerCase().includes(q)) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    });
  }, [news, searchQuery, statusFilter]);

  const openNewModal = () => {
    setEditingNews({
      title: '',
      slug: '',
      category: 'Press Release',
      author: 'Council Secretariat',
      authorRole: 'Editorial Board',
      summary: '',
      content: '',
      coverImage: '/banner.png',
      publishedAt: new Date().toISOString().split('T')[0],
      featured: false,
      status: 'Published',
      tags: [],
      seoTitle: '',
      seoDescription: '',
      seoKeywords: []
    });
    setTagInput('');
    setKeywordInput('');
    setModalTab('content');
    setIsModalOpen(true);
  };

  const openEditModal = (item: NewsItem) => {
    setEditingNews({
      ...item,
      publishedAt: item.publishedAt ? item.publishedAt.split('T')[0] : new Date().toISOString().split('T')[0],
      tags: Array.isArray(item.tags) ? item.tags : [],
      seoKeywords: Array.isArray(item.seoKeywords) ? item.seoKeywords : []
    });
    setTagInput('');
    setKeywordInput('');
    setModalTab('content');
    setIsModalOpen(true);
  };

  const addArticleTags = (raw: string) => {
    if (!editingNews) return;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const merged = Array.from(new Set([...(editingNews.tags || []), ...parts])).slice(0, 15);
    setEditingNews({ ...editingNews, tags: merged });
    setTagInput('');
  };

  const removeArticleTag = (tag: string) => {
    if (!editingNews) return;
    setEditingNews({
      ...editingNews,
      tags: (editingNews.tags || []).filter(t => t !== tag)
    });
  };

  const addArticleKeywords = (raw: string) => {
    if (!editingNews) return;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const merged = Array.from(new Set([...(editingNews.seoKeywords || []), ...parts])).slice(0, 30);
    setEditingNews({ ...editingNews, seoKeywords: merged });
    setKeywordInput('');
  };

  const removeArticleKeyword = (kw: string) => {
    if (!editingNews) return;
    setEditingNews({
      ...editingNews,
      seoKeywords: (editingNews.seoKeywords || []).filter(k => k !== kw)
    });
  };

  const addGlobalKeywords = (raw: string) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setGlobalSeoKeywords(prev => Array.from(new Set([...prev, ...parts])).slice(0, 35));
    setGlobalKeywordInput('');
  };

  const handleSaveGlobalSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGlobalSeo(true);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsSeoTitle: globalSeoTitle.trim(),
          newsSeoDescription: globalSeoDesc.trim(),
          newsSeoKeywords: globalSeoKeywords
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save News SEO settings');
      addToast('Global News SEO settings saved cleanly!', 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error updating News SEO settings', 'error');
    } finally {
      setSavingGlobalSeo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews || !editingNews.title?.trim() || !editingNews.summary?.trim()) {
      addToast('Please provide a story headline and summary.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<NewsItem> = {
        ...editingNews,
        title: editingNews.title.trim(),
        slug: (editingNews.slug || '').trim() || toSlug(editingNews.title),
        summary: editingNews.summary.trim(),
        content: (editingNews.content || '').trim() || editingNews.summary.trim()
      };

      const isNew = !editingNews.id;
      const url = isNew ? '/api/news' : `/api/news/${editingNews.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save news article');

      addToast(isNew ? 'News story published!' : 'News story & SEO updated!', 'success');
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

  const previewTitle =
    (editingNews?.seoTitle || '').trim() ||
    (editingNews?.title ? `${editingNews.title} | NexGen Council` : 'Article Headline | NexGen Council');
  const previewDesc =
    (editingNews?.seoDescription || '').trim() ||
    (editingNews?.summary || 'Summary preview for search engines and social share cards...');
  const previewSlug = (editingNews?.slug || '').trim() || toSlug(editingNews?.title || 'article-slug');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            News, Dispatches &amp; SEO Manager
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Publish council stories, manage reading tags, and configure search keywords &amp; metadata.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowGlobalSeo(prev => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4 text-indigo-700" />
            <span>News Page SEO</span>
            {showGlobalSeo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={openNewModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Publish Story</span>
          </button>
        </div>
      </div>

      {/* Collapsible Global /news Page SEO Settings */}
      {showGlobalSeo && (
        <form
          onSubmit={handleSaveGlobalSeo}
          className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4 text-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-serif font-bold text-base text-slate-900">
                Main News Portal SEO Configuration (/news)
              </h2>
              <p className="text-[11px] text-slate-500">
                Controls the default search title, meta description, and keywords indexed for the /news directory page.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingGlobalSeo}
              className="px-4 py-2 bg-indigo-950 text-white rounded-xl font-semibold hover:bg-indigo-900 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
            >
              {savingGlobalSeo ? 'Saving SEO...' : 'Save News Page SEO'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">News Page Meta Title</label>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {globalSeoTitle.length}/60 recommended
                </span>
              </div>
              <input
                type="text"
                value={globalSeoTitle}
                onChange={e => setGlobalSeoTitle(e.target.value)}
                placeholder="e.g. News & Dispatches | NexGen Council"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Add News Page SEO Keywords</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={globalKeywordInput}
                  onChange={e => setGlobalKeywordInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGlobalKeywords(globalKeywordInput);
                    }
                  }}
                  placeholder="Type keywords separated by commas and press Enter..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => addGlobalKeywords(globalKeywordInput)}
                  className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">News Page Meta Description</label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {globalSeoDesc.length}/160 recommended
              </span>
            </div>
            <textarea
              rows={2}
              value={globalSeoDesc}
              onChange={e => setGlobalSeoDesc(e.target.value)}
              placeholder="Stay informed with the latest dispatches, policy research, changemaker spotlights, and official announcements from NexGen Council."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
            />
          </div>

          {globalSeoKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {globalSeoKeywords.map(kw => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => setGlobalSeoKeywords(prev => prev.filter(k => k !== kw))}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    aria-label={`Remove ${kw}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </form>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
          {(['All', 'Published', 'Draft'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === st ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st} ({st === 'All' ? news.length : news.filter(n => n.status === st).length})
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search headlines, authors, keywords..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      {/* Stories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredNews.map(item => {
          const kwCount = (item.seoKeywords?.length || 0) + (item.tags?.length || 0);
          const hasCustomSeo = Boolean(item.seoTitle || item.seoDescription || kwCount > 0);
          const readMins = computeReadTime(item.content, item.readTimeMinutes);

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="aspect-16/9 bg-slate-900 relative overflow-hidden">
                  <img
                    src={item.coverImage || '/banner.png'}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (!el.dataset.fallbackApplied) {
                        el.dataset.fallbackApplied = '1';
                        el.src = '/banner.png';
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="p-5 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="font-semibold text-indigo-900">{item.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{readMins} min read</span>
                    {item.featured && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-700">Featured</span>
                      </>
                    )}
                  </div>

                  <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>

                  <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Globe className={`w-3.5 h-3.5 ${hasCustomSeo ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>
                      {hasCustomSeo
                        ? `SEO Configured · ${kwCount} keyword${kwCount === 1 ? '' : 's'}`
                        : 'Using Auto SEO Defaults'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${item.status === 'Published' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {item.status} · By {item.author}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-950 hover:bg-slate-100 cursor-pointer"
                    title="Edit Story & SEO"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.title)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Delete Story"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Article & SEO Modal */}
      {isModalOpen && editingNews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-serif font-bold text-xl text-slate-900">
                  {editingNews.id ? 'Edit Dispatch & SEO Metadata' : 'Draft New Dispatch'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Configure editorial content, reading tags, and search engine keywords.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Section Switcher */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setModalTab('content')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  modalTab === 'content' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Editorial Content
              </button>
              <button
                type="button"
                onClick={() => setModalTab('seo')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  modalTab === 'seo' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>2. SEO, Keywords &amp; Preview</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {modalTab === 'content' ? (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Story Headline *</label>
                    <input
                      type="text"
                      required
                      value={editingNews.title || ''}
                      onChange={e => setEditingNews({ ...editingNews, title: e.target.value })}
                      placeholder="Enter clear, descriptive headline..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Category</label>
                      <select
                        value={editingNews.category || 'Press Release'}
                        onChange={e => setEditingNews({ ...editingNews, category: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                      >
                        {Array.from(new Set([...NEWS_CATEGORIES, ...(editingNews.category ? [editingNews.category] : [])])).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Author / Byline</label>
                      <input
                        type="text"
                        value={editingNews.author || ''}
                        onChange={e => setEditingNews({ ...editingNews, author: e.target.value })}
                        placeholder="Council Secretariat"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Author Title / Desk</label>
                      <input
                        type="text"
                        value={editingNews.authorRole || ''}
                        onChange={e => setEditingNews({ ...editingNews, authorRole: e.target.value })}
                        placeholder="Editorial Board"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Publish Date</label>
                      <input
                        type="date"
                        value={editingNews.publishedAt || ''}
                        onChange={e => setEditingNews({ ...editingNews, publishedAt: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Read Time (minutes — auto if blank)
                      </label>
                      <div className="relative">
                        <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={editingNews.readTimeMinutes ?? ''}
                          onChange={e =>
                            setEditingNews({
                              ...editingNews,
                              readTimeMinutes: e.target.value ? Number(e.target.value) : undefined
                            })
                          }
                          placeholder={`Auto (~${computeReadTime(editingNews.content)} min)`}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <ImageUploader
                      value={editingNews.coverImage || ''}
                      onChange={url => setEditingNews({ ...editingNews, coverImage: url })}
                      label="Cover Image"
                      helperText="Upload a high-resolution editorial cover or provide a URL"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Executive Summary (Deck) *</label>
                    <textarea
                      rows={2}
                      required
                      value={editingNews.summary || ''}
                      onChange={e => setEditingNews({ ...editingNews, summary: e.target.value })}
                      placeholder="Concise 1-2 sentence summary shown on article cards..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">Full Article Body</label>
                      <span className="text-[11px] tabular-nums text-slate-400">
                        {(editingNews.content || '').trim().split(/\s+/).filter(Boolean).length} words · ~{computeReadTime(editingNews.content, editingNews.readTimeMinutes)} min read
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={editingNews.content || ''}
                      onChange={e => setEditingNews({ ...editingNews, content: e.target.value })}
                      placeholder="Write full dispatch text. Separate paragraphs with a blank line for clean editorial typography..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 leading-relaxed"
                    />
                  </div>

                  {/* Topic Tags */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Reader Topic Tags (displayed on article page)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addArticleTags(tagInput);
                          }
                        }}
                        placeholder="e.g. Women in Tech, Youth Fellowship (comma separated)"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => addArticleTags(tagInput)}
                        className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 cursor-pointer"
                      >
                        Add Tag
                      </button>
                    </div>
                    {(editingNews.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(editingNews.tags || []).map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium"
                          >
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={() => removeArticleTag(tag)}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingNews.featured || false}
                        onChange={e => setEditingNews({ ...editingNews, featured: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-950"
                      />
                      <span className="font-semibold text-slate-800">Feature as Lead Story</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingNews.status === 'Published'}
                        onChange={e => setEditingNews({ ...editingNews, status: e.target.checked ? 'Published' : 'Draft' })}
                        className="w-4 h-4 rounded text-indigo-950"
                      />
                      <span className="font-semibold text-slate-800">Publish Publicly</span>
                    </label>
                  </div>
                </>
              ) : (
                /* SEO Tab */
                <div className="space-y-4">
                  {/* Search Snippet Preview */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-1">
                      <Eye className="w-3.5 h-3.5 text-indigo-700" />
                      <span>Search Engine Snippet Preview</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 truncate">
                      {(settings?.siteUrl || 'https://nexgencouncil.bond').replace(/\/+$/, '')}/news/{previewSlug}
                    </p>
                    <p className="text-base font-medium text-indigo-900 leading-snug line-clamp-1">
                      {previewTitle}
                    </p>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {previewDesc}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">Article URL Slug</label>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingNews({
                            ...editingNews,
                            slug: toSlug(editingNews.title || '')
                          })
                        }
                        className="text-[11px] text-indigo-700 font-semibold hover:underline cursor-pointer"
                      >
                        Generate from Headline
                      </button>
                    </div>
                    <div className="flex items-center rounded-xl border border-slate-300 overflow-hidden">
                      <span className="px-3 py-2 bg-slate-100 text-slate-500 border-r border-slate-200">/news/</span>
                      <input
                        type="text"
                        value={editingNews.slug || ''}
                        onChange={e => setEditingNews({ ...editingNews, slug: e.target.value })}
                        placeholder={toSlug(editingNews.title || 'article-url-slug')}
                        className="flex-1 px-3 py-2 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">SEO Meta Title (optional override)</label>
                      <span
                        className={`text-[11px] tabular-nums ${
                          (editingNews.seoTitle || '').length > 60 ? 'text-amber-700' : 'text-slate-400'
                        }`}
                      >
                        {(editingNews.seoTitle || '').length}/60 chars
                      </span>
                    </div>
                    <input
                      type="text"
                      value={editingNews.seoTitle || ''}
                      onChange={e => setEditingNews({ ...editingNews, seoTitle: e.target.value })}
                      placeholder={editingNews.title ? `${editingNews.title} | NexGen Council` : 'Custom search title...'}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">SEO Meta Description (120–160 chars recommended)</label>
                      <span
                        className={`text-[11px] tabular-nums ${
                          (editingNews.seoDescription || '').length > 160 ? 'text-amber-700' : 'text-slate-400'
                        }`}
                      >
                        {(editingNews.seoDescription || '').length}/160 chars
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={editingNews.seoDescription || ''}
                      onChange={e => setEditingNews({ ...editingNews, seoDescription: e.target.value })}
                      placeholder={editingNews.summary || 'Compelling summary for Google and social link previews...'}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      SEO Keywords (injected into meta tags &amp; NewsArticle JSON-LD)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addArticleKeywords(keywordInput);
                          }
                        }}
                        placeholder="Add keyword or comma-separated list, then press Enter..."
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => addArticleKeywords(keywordInput)}
                        className="px-3 py-2 rounded-xl bg-indigo-950 text-white font-semibold hover:bg-indigo-900 cursor-pointer"
                      >
                        Add Keyword
                      </button>
                    </div>

                    {(editingNews.seoKeywords || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(editingNews.seoKeywords || []).map(kw => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 text-[11px] font-medium"
                          >
                            <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                            <span>{kw}</span>
                            <button
                              type="button"
                              onClick={() => removeArticleKeyword(kw)}
                              className="text-indigo-400 hover:text-rose-600 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3">
                      <p className="text-[11px] text-slate-500 mb-1.5">Quick-add suggested council keywords:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_SEO_KEYWORDS.filter(k => !(editingNews.seoKeywords || []).includes(k)).map(kw => (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => addArticleKeywords(kw)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            + {kw}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                  {saving ? 'Saving...' : editingNews.id ? 'Update Story & SEO' : 'Publish Story'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
