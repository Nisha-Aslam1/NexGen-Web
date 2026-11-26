import { useEffect } from 'react';

export const CORE_NEXGEN_KEYWORDS = [
  'NexGen',
  'NexGen Council',
  'NexGen Women Empowerment',
  'NexGen Youth Leadership',
  'NexGen Women Empowerment & Youth Leadership Council',
  'NexGen Pakistan',
  'NexGen Sialkot',
  'NexGen Leadership Council',
  'women empowerment organization',
  'youth leadership council',
  '30-Day Leadership Series',
  'female leadership mentorship',
  'youth civic engagement Pakistan',
  'volunteer opportunities Pakistan',
  'nexgencouncil.bond'
];

export interface SEOProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  ogImageAlt?: string;
  keywords?: string[];
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
  skip?: boolean;
}

function getNormalizedOrigin(): string {
  const { origin, hostname } = window.location;
  if (hostname === 'nexgencouncil.bond' || hostname === 'www.nexgencouncil.bond') {
    return 'https://nexgencouncil.bond';
  }
  return origin.replace(/\/+$/, '');
}

/**
 * Client-Side SEO Manager hook
 * Updates document.title, canonical, keywords, robots, meta tags, and JSON-LD schema dynamically
 */
export function useDocumentSEO({
  title,
  description,
  canonicalPath = '',
  ogType = 'website',
  ogImage,
  ogImageAlt,
  keywords,
  noindex = false,
  publishedTime,
  modifiedTime,
  author,
  jsonLd,
  skip = false
}: SEOProps) {
  const serializedKeywords = Array.isArray(keywords) ? keywords.join(',') : '';

  useEffect(() => {
    if (skip) return;

    // 1. Update Title
    if (title) {
      document.title = title;
    }

    // 2. Base domain normalized to canonical origin
    const origin = getNormalizedOrigin();
    const rawPath = (canonicalPath || window.location.pathname || '/').trim();
    let fullCanonical: string;
    if (/^https?:\/\//i.test(rawPath)) {
      try {
        const parsed = new URL(rawPath);
        const normPath = parsed.pathname.replace(/\/+$/, '') || '/';
        fullCanonical = normPath === '/' ? `${origin}/` : `${origin}${normPath}`;
      } catch {
        fullCanonical = `${origin}/`;
      }
    } else {
      const strippedPath = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
      const cleanPath = strippedPath.startsWith('/') ? strippedPath : `/${strippedPath}`;
      fullCanonical = cleanPath === '/' ? `${origin}/` : `${origin}${cleanPath}`;
    }
    const defaultImage = `${origin}/banner.png`;
    const imageToUse = ogImage
      ? (ogImage.startsWith('http') ? ogImage : `${origin}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`)
      : defaultImage;

    const mergedKeywords = Array.from(
      new Set([...(keywords || []), ...CORE_NEXGEN_KEYWORDS].map(k => k.trim()).filter(Boolean))
    );

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
    const setLink = (rel: string, href: string, extraAttrs?: Record<string, string>) => {
      const selector = extraAttrs?.hreflang
        ? `link[rel="${rel}"][hreflang="${extraAttrs.hreflang}"]`
        : `link[rel="${rel}"]`;
      let element = document.querySelector(selector) as HTMLLinkElement;
      if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', rel);
        if (extraAttrs) {
          Object.entries(extraAttrs).forEach(([k, v]) => element.setAttribute(k, v));
        }
        document.head.appendChild(element);
      }
      element.setAttribute('href', href);
    };

    // 3. Core Meta Tags
    setMeta('name', 'description', description);
    setMeta('name', 'keywords', mergedKeywords.join(', '));
    setMeta('name', 'application-name', 'NexGen Council');
    setMeta('name', 'apple-mobile-web-app-title', 'NexGen Council');
    setLink('canonical', fullCanonical);
    setLink('alternate', fullCanonical, { hreflang: 'en' });
    setLink('alternate', fullCanonical, { hreflang: 'x-default' });

    if (noindex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      setMeta('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    }

    // 4. Open Graph Tags
    setMeta('property', 'og:locale', 'en_US');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', fullCanonical);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:image', imageToUse);
    if (imageToUse.startsWith('https://')) {
      setMeta('property', 'og:image:secure_url', imageToUse);
    }
    const resolvedImageAlt = (ogImageAlt || '').trim() || title;
    setMeta('property', 'og:image:alt', resolvedImageAlt);
    setMeta('property', 'og:site_name', 'NexGen Council');

    // 5. Twitter / X Cards
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', imageToUse);
    setMeta('name', 'twitter:image:alt', resolvedImageAlt);

    if (publishedTime) {
      setMeta('property', 'article:published_time', publishedTime);
    }
    if (modifiedTime) {
      setMeta('property', 'article:modified_time', modifiedTime);
    }
    if (author) {
      setMeta('name', 'author', author);
    }

    // 6. JSON-LD Structured Data (replace both SSR & previous client scripts to keep clean single graph)
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      if (el.id === 'jsonld-seo-client' || el.getAttribute('data-ssr-jsonld') === 'true') {
        el.remove();
      }
    });

    if (jsonLd) {
      const script = document.createElement('script');
      script.id = 'jsonld-seo-client';
      script.type = 'application/ld+json';
      script.text = JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
      document.head.appendChild(script);
    }

    return () => {
      const ld = document.getElementById('jsonld-seo-client');
      if (ld) {
        ld.remove();
      }
    };
  }, [
    skip,
    title,
    description,
    canonicalPath,
    ogType,
    ogImage,
    ogImageAlt,
    serializedKeywords,
    noindex,
    publishedTime,
    modifiedTime,
    author,
    JSON.stringify(jsonLd)
  ]);
}
