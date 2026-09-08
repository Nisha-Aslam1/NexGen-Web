import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2
} from 'lucide-react';
import { GalleryItem } from '../../types.ts';

export const GalleryPage: React.FC = () => {
  const { gallery, settings } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useDocumentSEO({
    title: `Community & Event Gallery | ${settings?.organizationName || 'NexGen Council'}`,
    description:
      'Explore photos and media highlights from NexGen Council youth leadership conventions, skills workshops, and women empowerment outreach cohorts.',
    canonicalPath: '/gallery',
    ogType: 'website',
    ogImage: '/banner.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ImageGallery',
        name: 'NexGen Council Civic & Youth Initiatives Gallery',
        description: 'Photo archive of workshops, ceremonies, conferences, and community engagement programs.'
      }
    ]
  });

  const categories = ['All', 'Workshops', 'Summits', 'Technology', 'Outreach', 'Ceremonies'];

  const filteredItems = gallery.filter(item =>
    selectedCategory === 'All' ? true : item.category.toLowerCase().includes(selectedCategory.toLowerCase())
  );

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  const nextImage = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % filteredItems.length);
    }
  };

  const prevImage = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + filteredItems.length) % filteredItems.length);
    }
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Council Archives
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            Visual Highlights &amp; Field Moments
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Glimpses into our participatory training halls, grassroots outreach campaigns, technology fellowships, and annual youth plenaries.
          </p>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-950 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => openLightbox(idx)}
              className="group relative rounded-3xl overflow-hidden bg-slate-900 aspect-4/3 cursor-pointer shadow-xs hover:shadow-xl transition-all"
            >
              <img
                src={item.imageUrl}
                alt={`${item.title} - ${item.category} activity`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

              <div className="absolute bottom-4 left-4 right-4 text-white">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">
                  {item.category}
                </span>
                <h4 className="font-serif font-bold text-sm leading-snug">{item.title}</h4>
                {item.caption && <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">{item.caption}</p>}
              </div>

              <div className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && filteredItems[lightboxIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-50 cursor-pointer"
            aria-label="Close lightbox"
          >
            <X className="w-6 h-6" />
          </button>

          <button
            onClick={prevImage}
            className="absolute left-6 text-white/70 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-50 cursor-pointer hidden sm:block"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={nextImage}
            className="absolute right-6 text-white/70 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-50 cursor-pointer hidden sm:block"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center space-y-4">
            <img
              src={filteredItems[lightboxIndex].imageUrl}
              alt={filteredItems[lightboxIndex].title}
              className="max-h-[70vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <div className="text-center text-white space-y-1">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                {filteredItems[lightboxIndex].category}
              </span>
              <h3 className="font-serif font-bold text-lg">{filteredItems[lightboxIndex].title}</h3>
              {filteredItems[lightboxIndex].caption && (
                <p className="text-xs text-slate-300 max-w-lg">{filteredItems[lightboxIndex].caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
