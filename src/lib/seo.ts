import { useEffect } from 'react';

export interface SEOProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
}

/**
 * Client-Side SEO Manager hook
 * Updates document.title, canonical, robots, meta tags, and JSON-LD schema dynamically
 */
export function useDocumentSEO({
  title,
  description,
  canonicalPath = '',
  ogType = 'website',
  ogImage,
  noindex = false,
  publishedTime,
  modifiedTime,
  author,
  jsonLd
}: SEOProps) {
  useEffect(() => {
    // 1. Update Title
    if (title) {
      document.title = title;
    }

    // 2. Base domain from current location
    const origin = window.location.origin;
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const fullCanonical = `${origin}${cleanPath === '/' ? '' : cleanPath}`;
    const defaultImage = `${origin}/banner.png`;
    const imageToUse = ogImage || defaultImage;

    // Helper: update or create meta tag
    const setMeta = (attrName: string, attrVal: string, content: string) => {
      let element = document.querySelector(`meta[${attrName}="${attrVal}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrVal);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // Helper: update or create link tag
    const setLink = (rel: string, href: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
      if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', rel);
        document.head.appendChild(element);
      }
      element.setAttribute('href', href);
    };

    // 3. Core Meta Tags
    setMeta('name', 'description', description);
    setLink('canonical', fullCanonical);

    if (noindex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      setMeta('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    }

    // 4. Open Graph Tags
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', fullCanonical);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:image', imageToUse);
    setMeta('property', 'og:site_name', 'NexGen Council');

    // 5. Twitter / X Cards
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', imageToUse);

    if (publishedTime) {
      setMeta('property', 'article:published_time', publishedTime);
    }
    if (modifiedTime) {
      setMeta('property', 'article:modified_time', modifiedTime);
    }
    if (author) {
      setMeta('name', 'author', author);
    }

    // 6. JSON-LD Structured Data
    const existingLd = document.getElementById('jsonld-seo-client');
    if (existingLd) {
      existingLd.remove();
    }

    if (jsonLd) {
      const script = document.createElement('script');
      script.id = 'jsonld-seo-client';
      script.type = 'application/ld+json';
      script.text = JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
      document.head.appendChild(script);
    }

    return () => {
      // Clean up dynamic client JSON-LD on unmount
      const ld = document.getElementById('jsonld-seo-client');
      if (ld) {
        ld.remove();
      }
    };
  }, [
    title,
    description,
    canonicalPath,
    ogType,
    ogImage,
    noindex,
    publishedTime,
    modifiedTime,
    author,
    JSON.stringify(jsonLd)
  ]);
}
