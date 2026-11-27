import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  Search,
  LayoutGrid,
  Columns,
  Download,
  Share2,
  Calendar,
  Image as ImageIcon
} from 'lucide-react';
import { GalleryItem } from '../../types.ts';
import {
  buildAutoImageAlt,
  buildAutoImageCaption,
  buildImageObjectSchema,
  resolvePublicImageUrl
} from '../../lib/imageSeo.ts';

const PRESET_CATEGORIES = ['Workshops', 'Summits', 'Technology', 'Outreach', 'Ceremonies'];

export const GalleryPage: React.FC = () => {
  const { gallery, settings, addToast } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'masonry'>('grid');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const categories = useMemo(() => {
    const present = Array.from(new Set(gallery.map(g => g.category?.trim()).filter(Boolean)));
    const combined = Array.from(new Set([...PRESET_CATEGORIES, ...present]));
    return ['All', ...combined];
  }, [gallery]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return gallery.filter(item => {
      const catMatch =
        selectedCategory === 'All'
          ? true
          : item.category.toLowerCase().includes(selectedCategory.toLowerCase()) ||
            selectedCategory.toLowerCase().includes(item.category.toLowerCase());
      if (!catMatch) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.caption || '').toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.date || '').toLowerCase().includes(q)
      );
    });
  }, [gallery, selectedCategory, searchQuery]);

  const orgName = settings?.organizationName || 'NexGen Women Empowerment & Youth Leadership Council';

  const imageLdObjects = filteredItems
    .map(item => {
      const resolvedUrl = resolvePublicImageUrl(item.imageUrl, window.location.origin, { allowDataUrl: false });
      if (!resolvedUrl) return null;
      return buildImageObjectSchema({
        url: resolvedUrl,
        alt: buildAutoImageAlt({
          type: 'gallery',
          customAlt: item.imageAlt,
          title: item.title,
          category: item.category,
          caption: item.caption
        }),
        name: item.title,
        caption: buildAutoImageCaption({
          type: 'gallery',
          customAlt: item.imageAlt,
          title: item.title,
          category: item.category,
          caption: item.caption
        }),
        pageUrl: `${window.location.origin}/gallery`,
        orgName
      });
    })
    .filter(Boolean);

  const firstGalleryItem = filteredItems[0];
  const firstGalleryAlt = firstGalleryItem
    ? buildAutoImageAlt({
        type: 'gallery',
        customAlt: firstGalleryItem.imageAlt,
        title: firstGalleryItem.title,
        category: firstGalleryItem.category,
        caption: firstGalleryItem.caption
      })
    : 'Field Photos & Media Gallery — NexGen Council';

  useDocumentSEO({
    title: 'Field Photos & Media Gallery | NexGen Council',
    description:
      'Explore photos and archival visual highlights from NexGen Council youth leadership conventions, skills workshops, and women empowerment outreach cohorts.',
    canonicalPath: '/gallery',
    ogType: 'website',
    ogImage: firstGalleryItem ? firstGalleryItem.imageUrl : '/banner.png',
    ogImageAlt: firstGalleryAlt,
    keywords: ['NexGen gallery', 'youth leadership photos', 'women empowerment events gallery'],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ImageGallery',
        name: `${orgName} Civic & Youth Initiatives Photo Gallery`,
        description: 'Photo archive of workshops, ceremonies, conferences, and community engagement programs.',
        url: window.location.origin + '/gallery',
        image: imageLdObjects
      }
    ]
  });

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const nextImage = useCallback(() => {
    setLightboxIndex(prev => (prev !== null && filteredItems.length > 0 ? (prev + 1) % filteredItems.length : null));
  }, [filteredItems.length]);

  const prevImage = useCallback(() => {
    setLightboxIndex(prev =>
      prev !== null && filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : null
    );
  }, [filteredItems.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, closeLightbox, nextImage, prevImage]);

  const handleDownloadPhoto = async (item: GalleryItem) => {
    try {
      const link = document.createElement('a');
      link.href = item.imageUrl;
      link.download = `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      addToast('Right-click the image to save it locally.', 'info');
    }
  };

  const handleShareGalleryLink = async () => {
    const shareUrl = `${window.location.origin}/gallery`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast('Gallery link copied to clipboard!', 'success');
    } catch {
      addToast('Gallery URL: ' + shareUrl, 'info');
    }
  };

  const formatPhotoDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };

  const getCategoryCount = (cat: string) => {
    if (cat === 'All') return gallery.length;
    return gallery.filter(
      item =>
        item.category.toLowerCase().includes(cat.toLowerCase()) ||
        cat.toLowerCase().includes(item.category.toLowerCase())
    ).length;
  };

  const activeLightboxItem = lightboxIndex !== null ? filteredItems[lightboxIndex] : null;

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
            Council Visual Archives · {gallery.length} Curated Frames
          </p>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight text-balance">
            Visual Highlights &amp; Field Moments
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Glimpses into our participatory training halls, grassroots outreach campaigns, technology fellowships, and annual youth plenaries.
          </p>
        </div>
      </section>

      {/* Filter Toolbar, Search & Layout Switcher */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map(cat => {
                const count = getCategoryCount(cat);
                if (cat !== 'All' && count === 0) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setLightboxIndex(null);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-indigo-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
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
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search photos, captions, dates..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setLayoutMode('grid')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    layoutMode === 'grid' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Editorial Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('masonry')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    layoutMode === 'masonry' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Masonry Archive View"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Masonry</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Grid / Masonry */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
            <ImageIcon className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-serif font-bold text-lg text-slate-900">No archival photos match this filter</h3>
            <p className="text-xs text-slate-500">Try clearing the search bar or choosing another category.</p>
            {(searchQuery || selectedCategory !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="px-4 py-2 rounded-xl bg-indigo-950 text-white text-xs font-semibold hover:bg-indigo-900 cursor-pointer"
              >
                Show All Photos
              </button>
            )}
          </div>
        ) : layoutMode === 'masonry' ? (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
            {filteredItems.map((item, idx) => (
              <figure
                key={item.id}
                onClick={() => openLightbox(idx)}
                itemScope
                itemType="https://schema.org/ImageObject"
                className="break-inside-avoid group relative rounded-2xl overflow-hidden bg-slate-900 cursor-pointer shadow-xs hover:shadow-xl transition-all"
              >
                <meta itemProp="license" content={`${window.location.origin}/terms#media-licensing`} />
                <meta itemProp="acquireLicensePage" content={`${window.location.origin}/contact`} />
                <meta itemProp="creditText" content={orgName} />
                <meta itemProp="copyrightNotice" content={`© ${new Date().getFullYear()} ${orgName}. All rights reserved.`} />
                <img
                  src={item.imageUrl || '/banner.png'}
                  alt={buildAutoImageAlt({
                    type: 'gallery',
                    customAlt: item.imageAlt,
                    title: item.title,
                    category: item.category,
                    caption: item.caption
                  })}
                  title={`${item.title} (${item.category}) — NexGen Council`}
                  itemProp="contentUrl"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (!el.dataset.fallbackApplied) {
                      el.dataset.fallbackApplied = '1';
                      el.src = '/banner.png';
                    }
                  }}
                  className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

                <figcaption className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                  <div className="flex items-center gap-2 text-[11px] text-amber-300 font-semibold">
                    <span>{item.category}</span>
                    {item.date && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200 font-normal">{formatPhotoDate(item.date)}</span>
                      </>
                    )}
                  </div>
                  <h4 itemProp="name" className="font-serif font-bold text-base leading-snug">
                    {item.title}
                  </h4>
                  {item.caption && (
                    <p itemProp="caption" className="text-xs text-slate-200 line-clamp-2">
                      {item.caption}
                    </p>
                  )}
                </figcaption>

                <div className="absolute top-3.5 right-3.5 p-2 rounded-lg bg-black/50 text-white backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item, idx) => (
              <figure
                key={item.id}
                onClick={() => openLightbox(idx)}
                itemScope
                itemType="https://schema.org/ImageObject"
                className={`group relative rounded-2xl overflow-hidden bg-slate-900 cursor-pointer shadow-xs hover:shadow-xl transition-all ${
                  idx === 0 && filteredItems.length >= 4 ? 'sm:col-span-2 lg:col-span-2 aspect-16/10' : 'aspect-4/3'
                }`}
              >
                <meta itemProp="license" content={`${window.location.origin}/terms#media-licensing`} />
                <meta itemProp="acquireLicensePage" content={`${window.location.origin}/contact`} />
                <meta itemProp="creditText" content={orgName} />
                <meta itemProp="copyrightNotice" content={`© ${new Date().getFullYear()} ${orgName}. All rights reserved.`} />
                <img
                  src={item.imageUrl || '/banner.png'}
                  alt={buildAutoImageAlt({
                    type: 'gallery',
                    customAlt: item.imageAlt,
                    title: item.title,
                    category: item.category,
                    caption: item.caption
                  })}
                  title={`${item.title} (${item.category}) — NexGen Council`}
                  itemProp="contentUrl"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (!el.dataset.fallbackApplied) {
                      el.dataset.fallbackApplied = '1';
                      el.src = '/banner.png';
                    }
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-85 group-hover:opacity-100 transition-opacity" />

                <figcaption className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                  <div className="flex items-center gap-2 text-[11px] text-amber-300 font-semibold">
                    <span>{item.category}</span>
                    {item.date && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200 font-normal">{formatPhotoDate(item.date)}</span>
                      </>
                    )}
                  </div>
                  <h4 itemProp="name" className="font-serif font-bold text-base leading-snug">
                    {item.title}
                  </h4>
                  {item.caption && (
                    <p itemProp="caption" className="text-xs text-slate-200 line-clamp-2">
                      {item.caption}
                    </p>
                  )}
                </figcaption>

                <div className="absolute top-3.5 right-3.5 p-2 rounded-lg bg-black/50 text-white backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* Fullscreen Lightbox Modal with Keyboard & Thumbnail Strip */}
      {activeLightboxItem && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={activeLightboxItem.title}
        >
          {/* Top Lightbox Controls */}
          <div className="flex items-center justify-between gap-4 text-white shrink-0">
            <div className="text-xs text-slate-300 tabular-nums font-medium">
              Frame {String(lightboxIndex + 1).padStart(2, '0')} / {String(filteredItems.length).padStart(2, '0')}
              <span className="mx-2 text-slate-600">·</span>
              <span className="text-amber-300 font-semibold">{activeLightboxItem.category}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleShareGalleryLink()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Copy Gallery Link"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPhoto(activeLightboxItem)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Download / Open Full Photo"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                type="button"
                onClick={closeLightbox}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                aria-label="Close lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Media Viewer */}
          <div className="relative flex-1 flex items-center justify-center min-h-0 my-4">
            <button
              type="button"
              onClick={prevImage}
              className="absolute left-1 sm:left-4 text-white/80 hover:text-white p-2.5 sm:p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors z-10 cursor-pointer"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="max-w-5xl max-h-full flex flex-col items-center justify-center px-10 sm:px-16 space-y-3">
              <img
                src={activeLightboxItem.imageUrl || '/banner.png'}
                alt={buildAutoImageAlt({
                  type: 'gallery',
                  customAlt: activeLightboxItem.imageAlt,
                  title: activeLightboxItem.title,
                  category: activeLightboxItem.category,
                  caption: activeLightboxItem.caption
                })}
                title={`${activeLightboxItem.title} (${activeLightboxItem.category}) — NexGen Council`}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset.fallbackApplied) {
                    el.dataset.fallbackApplied = '1';
                    el.src = '/banner.png';
                  }
                }}
                className="max-h-[60vh] sm:max-h-[64vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
              />
              <div className="text-center text-white space-y-1 max-w-2xl">
                <h3 className="font-serif font-bold text-lg sm:text-xl">{activeLightboxItem.title}</h3>
                {activeLightboxItem.caption && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {activeLightboxItem.caption}
                  </p>
                )}
                {activeLightboxItem.date && (
                  <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 pt-0.5">
                    <Calendar className="w-3 h-3" />
                    <span>Captured {formatPhotoDate(activeLightboxItem.date)}</span>
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={nextImage}
              className="absolute right-1 sm:right-4 text-white/80 hover:text-white p-2.5 sm:p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors z-10 cursor-pointer"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Clickable Bottom Thumbnail Strip */}
          {filteredItems.length > 1 && (
            <div className="flex items-center justify-center gap-2 overflow-x-auto py-1 shrink-0">
              {filteredItems.map((thumb, idx) => (
                <button
                  key={thumb.id}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className={`relative w-14 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                    idx === lightboxIndex
                      ? 'border-amber-400 opacity-100 scale-105'
                      : 'border-transparent opacity-50 hover:opacity-85'
                  }`}
                  aria-label={`View photo ${idx + 1}: ${thumb.title}`}
                >
                  <img
                    src={thumb.imageUrl || '/banner.png'}
                    alt={buildAutoImageAlt({
                      type: 'gallery',
                      customAlt: thumb.imageAlt,
                      title: thumb.title,
                      category: thumb.category,
                      caption: thumb.caption
                    })}
                    title={thumb.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
