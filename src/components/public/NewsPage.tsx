import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Search,
  Share2,
  Check,
  ArrowRight,
  Clock,
  X,
  BookOpen,
  Tag
} from 'lucide-react';
import { NewsItem } from '../../types.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import {
  buildAutoImageAlt,
  buildAutoImageCaption,
  buildImageObjectSchema,
  resolvePublicImageUrl
} from '../../lib/imageSeo.ts';

function getReadMinutes(item: NewsItem): number {
  if (item.readTimeMinutes && item.readTimeMinutes > 0) return item.readTimeMinutes;
  const words = `${item.summary || ''} ${item.content || ''}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function resolveNewsCoverImage(raw?: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return trimmed;
}

export const NewsPage: React.FC = () => {
  const { news, settings, setActivePage, selectedNewsSlug, addToast, isLoadingPublicData } = useApp();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'featured' | 'shortest'>('newest');
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const readerScrollRef = useRef<HTMLDivElement | null>(null);

  const publishedNews = useMemo(
    () =>
      news
        .filter(n => n.status === 'Published')
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    [news]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(publishedNews.map(n => n.category).filter(Boolean)));
    return ['All', ...unique];
  }, [publishedNews]);

  const featured = useMemo(
    () => publishedNews.find(n => n.featured) || publishedNews[0],
    [publishedNews]
  );

  const filteredNews = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = publishedNews.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (item.seoKeywords || []).some(k => k.toLowerCase().includes(q))
      );
    });

    if (sortBy === 'featured') {
      return [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
    }
    if (sortBy === 'shortest') {
      return [...list].sort((a, b) => getReadMinutes(a) - getReadMinutes(b));
    }
    return list;
  }, [publishedNews, selectedCategory, search, sortBy]);

  const matchedArticle = selectedNewsSlug
    ? news.find(
        n =>
          (n.slug && n.slug.toLowerCase() === selectedNewsSlug.toLowerCase()) ||
          n.id.toLowerCase() === selectedNewsSlug.toLowerCase()
      ) || null
    : null;

  const effectiveArticle = selectedArticle || matchedArticle;

  useEffect(() => {
    if (selectedNewsSlug) {
      if (matchedArticle) {
        setSelectedArticle(matchedArticle);
      }
    } else {
      setSelectedArticle(null);
    }
  }, [selectedNewsSlug, matchedArticle]);

  // Reset reader scroll & progress when switching articles
  useEffect(() => {
    setReadProgress(0);
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
  }, [effectiveArticle?.id]);

  // Esc key closes article reader
  useEffect(() => {
    if (!selectedArticle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedArticle(null);
        setActivePage('news', null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedArticle, setActivePage]);

  const isNotFoundSlug = Boolean(selectedNewsSlug && !isLoadingPublicData && !matchedArticle);
  const shouldSkipSeo = Boolean(selectedNewsSlug && (isLoadingPublicData || !matchedArticle));

  const listingSeoTitle =
    (settings?.newsSeoTitle || '').trim() || 'News, Dispatches & Announcements | NexGen Council';
  const listingSeoDesc =
    (settings?.newsSeoDescription || '').trim() ||
    'Stay updated on women empowerment programs, youth civic development milestones, and official press releases from NexGen Council.';
  const listingSeoKeywords = Array.isArray(settings?.newsSeoKeywords) ? settings.newsSeoKeywords : [];

  const articleKeywords = useMemo(() => {
    if (!effectiveArticle) return listingSeoKeywords;
    return Array.from(
      new Set(
        [
          ...(effectiveArticle.seoKeywords || []),
          ...(effectiveArticle.tags || []),
          effectiveArticle.category,
          effectiveArticle.author
        ].filter(Boolean)
      )
    );
  }, [effectiveArticle, listingSeoKeywords]);

  const effectiveArticleCover = resolveNewsCoverImage(effectiveArticle?.coverImage) || '/banner.png';
  const effectiveArticleAlt = effectiveArticle
    ? buildAutoImageAlt({
        type: 'news',
        customAlt: effectiveArticle.imageAlt,
        title: effectiveArticle.title,
        category: effectiveArticle.category
      })
    : 'News, Dispatches & Announcements — NexGen Council';

  useDocumentSEO({
    skip: shouldSkipSeo,
    title: effectiveArticle
      ? (effectiveArticle.seoTitle || '').trim() || `${effectiveArticle.title} | NexGen Council News`
      : listingSeoTitle,
    description: effectiveArticle
      ? (effectiveArticle.seoDescription || '').trim() || effectiveArticle.summary
      : listingSeoDesc,
    canonicalPath: effectiveArticle
      ? effectiveArticle.canonicalUrl?.trim() || `/news/${effectiveArticle.slug || effectiveArticle.id}`
      : '/news',
    ogType: effectiveArticle ? 'article' : 'website',
    ogImage: effectiveArticleCover,
    ogImageAlt: effectiveArticleAlt,
    keywords: articleKeywords,
    publishedTime: effectiveArticle?.publishedAt,
    author: effectiveArticle?.author || 'NexGen Secretariat',
    jsonLd: effectiveArticle
      ? {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: effectiveArticle.title,
          description: (effectiveArticle.seoDescription || '').trim() || effectiveArticle.summary,
          image: [
            buildImageObjectSchema({
              url:
                resolvePublicImageUrl(effectiveArticleCover, window.location.origin, {
                  allowDataUrl: true,
                  fallbackPath: '/banner.png'
                }) || `${window.location.origin}/banner.png`,
              alt: effectiveArticleAlt,
              name: effectiveArticle.title,
              caption: buildAutoImageCaption({
                type: 'news',
                customAlt: effectiveArticle.imageAlt,
                title: effectiveArticle.title,
                category: effectiveArticle.category,
                summary: effectiveArticle.summary
              }),
              pageUrl: `${window.location.origin}/news/${effectiveArticle.slug || effectiveArticle.id}`,
              representativeOfPage: true
            })
          ],
          datePublished: effectiveArticle.publishedAt,
          dateModified: effectiveArticle.publishedAt,
          articleSection: effectiveArticle.category,
          keywords: articleKeywords.join(', '),
          author: {
            '@type': 'Person',
            name: effectiveArticle.author
          },
          publisher: {
            '@type': 'NGO',
            name: 'NexGen Council',
            logo: {
              '@type': 'ImageObject',
              url: `${window.location.origin}/logo.png`
            }
          }
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'NexGen Council News Articles',
          itemListElement: publishedNews.map((n, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: n.title,
            image: resolvePublicImageUrl(n.coverImage, window.location.origin, { allowDataUrl: false }) || undefined,
            url: `${window.location.origin}/news/${n.slug || n.id}`
          }))
        }
  });

  if (isNotFoundSlug) {
    return <NotFoundPage />;
  }

  const openArticle = (article: NewsItem) => {
    setSelectedArticle(article);
    setActivePage('news', article.slug || article.id);
  };

  const closeArticle = () => {
    setSelectedArticle(null);
    setActivePage('news', null);
  };

  const handleShareArticle = async (article: NewsItem, channel?: 'copy' | 'whatsapp' | 'x' | 'linkedin') => {
    const shareUrl = `${window.location.origin}/news/${article.slug || article.id}`;
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(article.title);

    if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (channel === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (channel === 'linkedin') {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!channel && navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url: shareUrl
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      addToast('Direct article link copied to clipboard!', 'success');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      addToast('Share link: ' + shareUrl, 'info');
    }
  };

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return publishedNews
      .filter(n => n.id !== selectedArticle.id)
      .sort((a, b) => {
        const aSameCat = a.category === selectedArticle.category ? 1 : 0;
        const bSameCat = b.category === selectedArticle.category ? 1 : 0;
        return bSameCat - aSameCat;
      })
      .slice(0, 2);
  }, [publishedNews, selectedArticle]);

  const handleReaderScroll = () => {
    const el = readerScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      setReadProgress(100);
      return;
    }
    setReadProgress(Math.min(100, Math.round((el.scrollTop / maxScroll) * 100)));
  };

  const articleParagraphs = useMemo(() => {
    if (!selectedArticle) return [];
    return (selectedArticle.content || '')
      .split(/\n{2,}|\r\n\r\n/)
      .map(p => p.trim())
      .filter(Boolean);
  }, [selectedArticle]);

  return (
    <div className="space-y-12 pb-20">
      {/* Editorial Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
            Press &amp; Council Dispatches · {publishedNews.length} Published
          </p>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-balance max-w-3xl mx-auto">
            News, Insights &amp; Official Announcements
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Read verified field reports, leadership research dispatches, fellowship updates, and institutional policy statements from NexGen Council.
          </p>
        </div>
      </section>

      {/* Lead Story Spotlight */}
      {featured && !search && selectedCategory === 'All' && (() => {
        const featuredCover = resolveNewsCoverImage(featured.coverImage);
        return (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <article className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs grid grid-cols-1 lg:grid-cols-12 items-stretch">
              {featuredCover && (
                <div className="lg:col-span-7 overflow-hidden bg-slate-950 flex items-center justify-center">
                  <img
                    src={featuredCover}
                    alt={buildAutoImageAlt({
                      type: 'news',
                      customAlt: featured.imageAlt,
                      title: featured.title,
                      category: featured.category
                    })}
                    title={`${featured.title} — NexGen Council`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const container = e.currentTarget.parentElement;
                      if (container) container.style.display = 'none';
                    }}
                    className="w-full h-auto block object-contain"
                  />
                </div>
              )}

              <div className={`${featuredCover ? 'lg:col-span-5' : 'lg:col-span-12'} p-8 sm:p-10 flex flex-col justify-between space-y-6`}>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-amber-800 uppercase tracking-wider">Lead Story</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-indigo-950">{featured.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{getReadMinutes(featured)} min read</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 leading-tight text-balance">
                  {featured.title}
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {featured.summary}
                </p>

                {(featured.tags || []).length > 0 && (
                  <p className="text-xs text-slate-500">
                    Topics: {(featured.tags || []).slice(0, 4).join(' · ')}
                  </p>
                )}
              </div>

              <div className="pt-5 border-t border-slate-100 flex items-center justify-between gap-4">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-800 block">By {featured.author}</span>
                  <span>
                    {new Date(featured.publishedAt).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openArticle(featured)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer shrink-0"
                >
                  <span>Read Full Dispatch</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </article>
        </section>
        );
      })()}

      {/* Filter, Sort & Editorial Archive Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map(cat => {
                const count = cat === 'All' ? publishedNews.length : publishedNews.filter(n => n.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-indigo-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search dispatches, topics, authors..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'newest' | 'featured' | 'shortest')}
                aria-label="Sort news articles"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="newest">Latest Published</option>
                <option value="featured">Featured First</option>
                <option value="shortest">Quick Reads First</option>
              </select>
            </div>
          </div>
        </div>

        {filteredNews.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 space-y-3">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-lg font-serif font-bold text-slate-900">No matching dispatches found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try clearing your search term or switching back to all categories.
            </p>
            {(search || selectedCategory !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('All');
                }}
                className="px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {filteredNews.map(item => {
              const readMins = getReadMinutes(item);
              const topicList = (item.tags && item.tags.length > 0 ? item.tags : item.seoKeywords || []).slice(0, 3);
              const itemCover = resolveNewsCoverImage(item.coverImage);

              return (
                <article
                  key={item.id}
                  onClick={() => openArticle(item)}
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col justify-between cursor-pointer"
                >
                  <div>
                    {itemCover && (
                      <div className="w-full overflow-hidden bg-slate-950 relative flex items-center justify-center">
                        <img
                          src={itemCover}
                          alt={buildAutoImageAlt({
                            type: 'news',
                            customAlt: item.imageAlt,
                            title: item.title,
                            category: item.category
                          })}
                          title={`${item.title} — NexGen Council`}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const container = e.currentTarget.parentElement;
                            if (container) container.style.display = 'none';
                          }}
                          className="w-full h-auto block object-contain group-hover:scale-[1.02] transition-transform duration-500"
                        />
                      </div>
                    )}

                    <div className="p-6 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-indigo-950">{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {new Date(item.publishedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{readMins} min read</span>
                      </div>

                      <h3 className="font-serif font-bold text-lg text-slate-900 leading-snug group-hover:text-indigo-900 transition-colors">
                        {item.title}
                      </h3>

                      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                        {item.summary}
                      </p>

                      {topicList.length > 0 && (
                        <p className="text-[11px] text-slate-400 pt-1 truncate">
                          {topicList.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 truncate">By {item.author}</span>
                    <span className="font-semibold text-indigo-950 inline-flex items-center gap-1 shrink-0">
                      <span>Read Dispatch</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Editorial Monograph Article Reader Modal */}
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-reader-title"
        >
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden">
            {/* Top Progress Bar */}
            <div className="h-1 w-full bg-slate-100 shrink-0">
              <div
                className="h-full bg-indigo-900 transition-all duration-150"
                style={{ width: `${readProgress}%` }}
              />
            </div>

            {/* Sticky Modal Header */}
            <div className="px-6 sm:px-8 py-4 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0 bg-white">
              <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
                <span className="font-semibold text-indigo-950 truncate">{selectedArticle.category}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  {getReadMinutes(selectedArticle)} min read
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleShareArticle(selectedArticle, 'copy')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={closeArticle}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close article"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Editorial Body */}
            <div
              ref={readerScrollRef}
              onScroll={handleReaderScroll}
              className="overflow-y-auto px-6 sm:px-10 py-8 space-y-6"
            >
              <header className="space-y-4 max-w-2xl mx-auto">
                <h2
                  id="article-reader-title"
                  className="text-2xl sm:text-4xl font-serif font-bold text-slate-900 leading-tight text-balance"
                >
                  {selectedArticle.title}
                </h2>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pb-4 border-b border-slate-200">
                  <span>
                    By <strong className="text-slate-800">{selectedArticle.author}</strong>
                    {selectedArticle.authorRole ? ` (${selectedArticle.authorRole})` : ''}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {new Date(selectedArticle.publishedAt).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </header>

              {(() => {
                const selectedCover = resolveNewsCoverImage(selectedArticle.coverImage);
                if (!selectedCover) return null;
                return (
                  <figure className="w-full max-w-2xl mx-auto">
                    <div className="rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center">
                      <img
                        src={selectedCover}
                        alt={buildAutoImageAlt({
                          type: 'news',
                          customAlt: selectedArticle.imageAlt,
                          title: selectedArticle.title,
                          category: selectedArticle.category
                        })}
                        title={`${selectedArticle.title} — NexGen Council`}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const fig = e.currentTarget.closest('figure');
                          if (fig) fig.style.display = 'none';
                        }}
                        className="w-full h-auto block object-contain"
                      />
                    </div>
                    <figcaption className="text-xs font-serif italic text-slate-500 mt-2">
                      Official NexGen Council Dispatch — {selectedArticle.category}
                    </figcaption>
                  </figure>
                );
              })()}

              <div className="max-w-2xl mx-auto space-y-5 text-slate-700 text-[15px] leading-[1.8]">
                <p className="font-serif text-lg text-slate-900 leading-relaxed">
                  {selectedArticle.summary}
                </p>

                <div className="border-t border-slate-100 pt-5 space-y-4">
                  {articleParagraphs.length > 0 ? (
                    articleParagraphs.map((para, idx) => (
                      <p
                        key={idx}
                        className={
                          idx === 0
                            ? 'first-letter:text-4xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-2.5 first-letter:leading-none first-letter:text-indigo-950 whitespace-pre-line'
                            : 'whitespace-pre-line'
                        }
                      >
                        {para}
                      </p>
                    ))
                  ) : (
                    <p className="whitespace-pre-line">{selectedArticle.content}</p>
                  )}
                </div>
              </div>

              {/* Topics & Share Strip */}
              <div className="max-w-2xl mx-auto pt-5 border-t border-slate-200 space-y-4">
                {((selectedArticle.tags && selectedArticle.tags.length > 0) ||
                  (selectedArticle.seoKeywords && selectedArticle.seoKeywords.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-700">Topics:</span>
                    <span>
                      {Array.from(
                        new Set([
                          ...(selectedArticle.tags || []),
                          ...(selectedArticle.seoKeywords || [])
                        ])
                      )
                        .slice(0, 8)
                        .join(' · ')}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Share:</span>
                    <button
                      type="button"
                      onClick={() => handleShareArticle(selectedArticle, 'whatsapp')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareArticle(selectedArticle, 'linkedin')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      LinkedIn
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareArticle(selectedArticle, 'x')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      X / Twitter
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={closeArticle}
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Close Dispatch
                  </button>
                </div>
              </div>

              {/* Related Stories */}
              {relatedArticles.length > 0 && (
                <div className="max-w-2xl mx-auto pt-6 border-t border-slate-200 space-y-3">
                  <h4 className="font-serif font-bold text-base text-slate-900">
                    Further Reading from the Council
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {relatedArticles.map(rel => (
                      <button
                        key={rel.id}
                        type="button"
                        onClick={() => openArticle(rel)}
                        className="text-left p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 transition-all space-y-1.5 cursor-pointer"
                      >
                        <span className="text-[11px] font-semibold text-indigo-900">
                          {rel.category} · {getReadMinutes(rel)} min read
                        </span>
                        <p className="font-serif font-bold text-sm text-slate-900 line-clamp-2">
                          {rel.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
