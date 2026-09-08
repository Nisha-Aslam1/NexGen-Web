import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Newspaper,
  Calendar,
  User,
  Search,
  ArrowRight,
  Share2,
  Sparkles,
  Check
} from 'lucide-react';
import { NewsItem } from '../../types.ts';

export const NewsPage: React.FC = () => {
  const { news, setActivePage, selectedNewsSlug, addToast } = useApp();
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const publishedNews = news.filter(n => n.status === 'Published');
  const featured = publishedNews.find(n => n.featured) || publishedNews[0];

  const filteredNews = publishedNews.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.summary.toLowerCase().includes(search.toLowerCase())
  );

  // Sync selectedNewsSlug from URL
  useEffect(() => {
    if (selectedNewsSlug && news.length > 0) {
      const match = news.find(n => n.slug === selectedNewsSlug || n.id === selectedNewsSlug);
      if (match) {
        setSelectedArticle(match);
      }
    }
  }, [selectedNewsSlug, news]);

  useDocumentSEO({
    title: selectedArticle
      ? `${selectedArticle.title} | NexGen Council News`
      : 'Latest News, Dispatches & Announcements | NexGen Council',
    description: selectedArticle
      ? selectedArticle.summary
      : 'Stay updated on women empowerment programs, youth civic development milestones, and official press releases from NexGen Council.',
    canonicalPath: selectedArticle ? `/news/${selectedArticle.slug}` : '/news',
    ogType: selectedArticle ? 'article' : 'website',
    ogImage: selectedArticle?.coverImage || '/banner.png',
    publishedTime: selectedArticle?.publishedAt,
    author: selectedArticle?.author || 'NexGen Secretariat',
    jsonLd: selectedArticle
      ? {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: selectedArticle.title,
          description: selectedArticle.summary,
          image: [selectedArticle.coverImage],
          datePublished: selectedArticle.publishedAt,
          dateModified: selectedArticle.updatedAt || selectedArticle.publishedAt,
          author: {
            '@type': 'Person',
            name: selectedArticle.author
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
            url: `${window.location.origin}/news/${n.slug}`
          }))
        }
  });

  const handleShareArticle = async (article: NewsItem) => {
    const shareUrl = `${window.location.origin}/news/${article.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url: shareUrl
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      addToast('Direct article link copied to clipboard!', 'success');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      addToast('Share URL: ' + shareUrl, 'info');
    }
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <Newspaper className="w-3.5 h-3.5 text-amber-400" /> Press &amp; Dispatches
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            News, Insights &amp; Council Announcements
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Stay informed on our regional program milestones, leadership research publications, and advocacy releases.
          </p>
        </div>
      </section>

      {/* Featured Story */}
      {featured && !search && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-md grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-7 aspect-16/10 lg:aspect-auto overflow-hidden bg-slate-900">
              <img
                src={featured.coverImage}
                alt={featured.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold uppercase tracking-wider border border-amber-200">
                    {featured.category}
                  </span>
                  <span className="text-xs text-slate-400">Featured Dispatch</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 leading-tight">
                  {featured.title}
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {featured.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  <span>By {featured.author}</span>
                  <span className="block text-slate-400">
                    {new Date(featured.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setSelectedArticle(featured);
                    setActivePage('news', featured.slug);
                  }}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl text-xs font-semibold hover:bg-indigo-900 transition-colors cursor-pointer shadow-xs"
                >
                  Read Full Article
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search & Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <h3 className="text-xl font-serif font-bold text-slate-900">All Published Articles</h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search news..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredNews.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div>
                <div className="aspect-16/9 overflow-hidden bg-slate-900 relative">
                  <img
                    src={item.coverImage}
                    alt={`${item.title} article cover`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full bg-slate-950/80 text-white text-[11px] font-semibold">
                    {item.category}
                  </span>
                </div>
                <div className="p-6 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(item.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span>•</span>
                    <span>By {item.author}</span>
                  </div>
                  <h3 className="font-serif font-bold text-base text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {item.summary}
                  </p>
                </div>
              </div>
              <div className="px-6 pb-6 pt-2">
                <button
                  onClick={() => {
                    setSelectedArticle(item);
                    setActivePage('news', item.slug);
                  }}
                  className="text-xs font-semibold text-indigo-950 hover:underline cursor-pointer"
                >
                  Read Full Story →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Full Article Reader Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-10 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setSelectedArticle(null);
                setActivePage('news', null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-2 rounded-full cursor-pointer"
            >
              ✕
            </button>

            <div className="aspect-16/9 rounded-2xl overflow-hidden bg-slate-900">
              <img
                src={selectedArticle.coverImage}
                alt={`${selectedArticle.title} article cover`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-950 text-xs font-semibold">
                  {selectedArticle.category}
                </span>
                <button
                  onClick={() => handleShareArticle(selectedArticle)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedLink ? 'Link Copied' : 'Share Article'}</span>
                </button>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 leading-tight">
                {selectedArticle.title}
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                <span>By <strong>{selectedArticle.author}</strong></span>
                <span>•</span>
                <span>Published on {new Date(selectedArticle.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 text-slate-700 text-sm leading-relaxed whitespace-pre-line space-y-4">
              <p className="font-medium text-slate-900 text-base">{selectedArticle.summary}</p>
              <p>{selectedArticle.content}</p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => handleShareArticle(selectedArticle)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-950 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Article
              </button>
              <button
                onClick={() => {
                  setSelectedArticle(null);
                  setActivePage('news', null);
                }}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close Article
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
