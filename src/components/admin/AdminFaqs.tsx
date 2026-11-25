import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { FaqItem } from '../../types.ts';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  ExternalLink,
  X,
  CheckCircle2,
  HelpCircle,
  Code2
} from 'lucide-react';

const PRESET_CATEGORIES = [
  'About NexGen Council',
  'Volunteers & Member ID',
  'Programs & Events',
  'Donations & Partnerships'
];

export const AdminFaqs: React.FC = () => {
  const { faqs: contextFaqs, refreshData, addToast, setActivePage } = useApp();
  const [adminFaqs, setAdminFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Published' | 'Hidden'>('All');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Partial<FaqItem> | null>(null);
  const [customCategoryMode, setCustomCategoryMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reorder & Delete confirmation state
  const [reordering, setReordering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FaqItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAdminFaqs = async () => {
    try {
      const res = await authFetch('/api/faqs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAdminFaqs(data);
        }
      }
    } catch {
      if (Array.isArray(contextFaqs) && contextFaqs.length > 0) {
        setAdminFaqs(contextFaqs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminFaqs();
  }, []);

  // Keep synced when context updates
  useEffect(() => {
    if (Array.isArray(contextFaqs) && contextFaqs.length > 0 && adminFaqs.length === 0) {
      setAdminFaqs(contextFaqs);
    }
  }, [contextFaqs]);

  const sortedFaqs = useMemo(() => {
    return [...adminFaqs].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
  }, [adminFaqs]);

  const availableCategories = useMemo(() => {
    const dynamic = Array.from(new Set(sortedFaqs.map(f => f.category).filter(Boolean)));
    const merged = [...PRESET_CATEGORIES];
    dynamic.forEach(cat => {
      if (!merged.includes(cat)) merged.push(cat);
    });
    return merged;
  }, [sortedFaqs]);

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedFaqs.filter(item => {
      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
      if (statusFilter === 'Published' && !item.active) return false;
      if (statusFilter === 'Hidden' && item.active) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [sortedFaqs, searchQuery, categoryFilter, statusFilter]);

  const publishedCount = sortedFaqs.filter(f => f.active).length;

  const openCreateModal = () => {
    const maxOrder = sortedFaqs.reduce((m, f) => Math.max(m, Number(f.displayOrder || 0)), 0);
    setCustomCategoryMode(false);
    setEditingFaq({
      category: availableCategories[0] || 'About NexGen Council',
      question: '',
      answer: '',
      displayOrder: maxOrder + 1,
      active: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: FaqItem) => {
    setCustomCategoryMode(!PRESET_CATEGORIES.includes(item.category));
    setEditingFaq({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq) return;

    const cleanQuestion = (editingFaq.question || '').trim();
    const cleanAnswer = (editingFaq.answer || '').trim();
    const cleanCategory = (editingFaq.category || '').trim() || 'About NexGen Council';

    if (cleanQuestion.length < 3 || cleanAnswer.length < 5) {
      addToast('Please enter both a clear question and a complete answer.', 'error');
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(editingFaq.id);
      const url = isEdit ? `/api/faqs/${editingFaq.id}` : '/api/faqs';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cleanCategory,
          question: cleanQuestion,
          answer: cleanAnswer,
          displayOrder: Number(editingFaq.displayOrder) || 1,
          active: editingFaq.active !== false
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save FAQ');

      addToast(isEdit ? 'FAQ updated & live SEO schema synced.' : 'New FAQ added & published.', 'success');
      setIsModalOpen(false);
      setEditingFaq(null);
      await Promise.all([loadAdminFaqs(), refreshData()]);
    } catch (err: any) {
      addToast(err.message || 'Could not save FAQ entry.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: FaqItem) => {
    try {
      const res = await authFetch(`/api/faqs/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update visibility');
      addToast(
        !item.active ? 'FAQ published on website & JSON-LD schema.' : 'FAQ hidden from public website.',
        'info'
      );
      await Promise.all([loadAdminFaqs(), refreshData()]);
    } catch (err: any) {
      addToast(err.message || 'Could not update FAQ visibility.', 'error');
    }
  };

  const handleMoveOrder = async (item: FaqItem, direction: 'up' | 'down') => {
    if (reordering) return;
    const index = sortedFaqs.findIndex(f => f.id === item.id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedFaqs.length) return;

    const updatedList = [...sortedFaqs];
    const [moved] = updatedList.splice(index, 1);
    updatedList.splice(targetIndex, 0, moved);

    setReordering(true);
    try {
      const res = await authFetch('/api/faqs/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: updatedList.map(f => f.id) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reorder FAQs');
      if (Array.isArray(data)) setAdminFaqs(data);
      addToast('FAQ display sequence updated.', 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Could not reorder FAQs.', 'error');
    } finally {
      setReordering(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/faqs/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete FAQ');
      addToast('FAQ removed permanently.', 'success');
      setDeleteTarget(null);
      await Promise.all([loadAdminFaqs(), refreshData()]);
    } catch (err: any) {
      addToast(err.message || 'Could not delete FAQ.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-slate-950 tracking-tight">
            FAQs &amp; SEO Help Center Manager
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Add, edit, reorder, or remove website questions. Published entries automatically update <span className="font-mono text-slate-700">/faq</span> and its Schema.org JSON-LD structured data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setActivePage('faq')}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span>View Live /faq Page</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span>Add New FAQ</span>
          </button>
        </div>
      </div>

      {/* Compact Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Total Questions</p>
          <p className="text-2xl font-bold text-slate-950 tabular-nums mt-1">{sortedFaqs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Published Live</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">{publishedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Hidden / Draft</p>
          <p className="text-2xl font-bold text-slate-600 tabular-nums mt-1">
            {sortedFaqs.length - publishedCount}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">JSON-LD Rich Schema</p>
          <p className="text-sm font-bold text-indigo-950 mt-2 flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="tabular-nums">{publishedCount} Indexed Q&amp;As</span>
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions, answers, or categories..."
              aria-label="Search FAQs"
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-900/15 focus:border-indigo-900"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto">
            {(['All', 'Published', 'Hidden'] as const).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
          {['All', ...availableCategories].map(cat => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`pb-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'border-indigo-950 text-indigo-950'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {cat === 'All' ? 'All Categories' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* FAQ Items List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredFaqs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                {sortedFaqs.length === 0 ? 'No FAQs created yet' : 'No matching FAQs found'}
              </p>
              <p className="text-xs text-slate-500">
                {sortedFaqs.length === 0
                  ? 'Add your first FAQ question to populate the public /faq Knowledge Base and JSON-LD schema.'
                  : 'Try adjusting your search query or category filter.'}
              </p>
            </div>
            {sortedFaqs.length === 0 && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-4 py-2 rounded-xl bg-slate-950 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First FAQ</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredFaqs.map((item, idx) => {
              const globalIdx = sortedFaqs.findIndex(f => f.id === item.id);
              const isFirst = globalIdx === 0;
              const isLast = globalIdx === sortedFaqs.length - 1;

              return (
                <div
                  key={item.id}
                  className={`p-5 transition-colors flex flex-col lg:flex-row lg:items-start justify-between gap-4 ${
                    item.active ? 'hover:bg-slate-50/70' : 'bg-slate-50/60 opacity-80'
                  }`}
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    {/* Order & Move Controls */}
                    <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={isFirst || reordering}
                        onClick={() => handleMoveOrder(item, 'up')}
                        title="Move Up"
                        aria-label="Move FAQ up"
                        className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-200/70 disabled:opacity-25 cursor-pointer transition-colors"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-mono font-bold tabular-nums text-slate-500">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        disabled={isLast || reordering}
                        onClick={() => handleMoveOrder(item, 'down')}
                        title="Move Down"
                        aria-label="Move FAQ down"
                        className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-200/70 disabled:opacity-25 cursor-pointer transition-colors"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Question, Answer & Unboxed Metadata */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-indigo-900">{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            item.active ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {item.active ? 'Published Live' : 'Hidden'}
                        </span>
                        {item.updatedAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              Updated {new Date(item.updatedAt).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="text-sm sm:text-[15px] font-semibold text-slate-950 leading-snug">
                        {item.question}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                        {item.answer}
                      </p>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-2 shrink-0 lg:pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {item.active ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Publish</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-indigo-950 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs font-semibold text-rose-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit FAQ Modal */}
      {isModalOpen && editingFaq && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !saving && setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="faq-modal-title"
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 id="faq-modal-title" className="text-lg font-serif font-bold text-slate-950">
                  {editingFaq.id ? 'Edit FAQ Entry' : 'Add New Website FAQ'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically indexed in JSON-LD FAQPage structured data when published.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {/* Category Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-semibold text-slate-700">
                      Topic Category <span className="text-rose-600">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomCategoryMode(v => !v)}
                      className="text-[11px] font-semibold text-indigo-900 hover:underline cursor-pointer"
                    >
                      {customCategoryMode ? 'Choose existing' : '+ Custom category'}
                    </button>
                  </div>

                  {customCategoryMode ? (
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={editingFaq.category || ''}
                      onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value })}
                      placeholder="e.g. Scholarships & Grants"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                    />
                  ) : (
                    <select
                      value={editingFaq.category || availableCategories[0]}
                      onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                    >
                      {availableCategories.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingFaq.displayOrder ?? 1}
                    onChange={(e) =>
                      setEditingFaq({ ...editingFaq, displayOrder: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                  />
                </div>
              </div>

              {/* Question */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Question <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={400}
                  value={editingFaq.question || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  placeholder="e.g. How can students apply for NexGen Council fellowships?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                />
              </div>

              {/* Answer */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Official Answer <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={5}
                  required
                  minLength={5}
                  maxLength={4000}
                  value={editingFaq.answer || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                  placeholder="Write a clear, helpful, search-friendly answer..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 resize-y"
                />
              </div>

              {/* Visibility Toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={editingFaq.active !== false}
                  onChange={(e) => setEditingFaq({ ...editingFaq, active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-950 focus:ring-indigo-900"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Published live on /faq and included in JSON-LD Search Schema
                </span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  <span>{saving ? 'Saving...' : editingFaq.id ? 'Save Changes' : 'Add FAQ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-lg font-serif font-bold text-slate-950">Remove This FAQ?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                This will permanently remove <strong className="text-slate-900">&ldquo;{deleteTarget.question}&rdquo;</strong> from the FAQ Help Center and Search Engine structured data.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Removing...' : 'Yes, Remove FAQ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
