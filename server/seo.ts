import type { Request } from 'express';
import { db } from './db.ts';

export interface RouteMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: 'website' | 'article';
  ogImage: string;
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  jsonLd?: Record<string, any>[];
}

export function getSiteBaseUrl(req?: Request): string {
  // 1. Environment variable SITE_URL, APP_URL, or VITE_SITE_URL
  const envUrl = process.env.SITE_URL || process.env.APP_URL || process.env.VITE_SITE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 2. Request host headers (handles proxy forwarding)
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return `${proto}://${host}`.replace(/\/$/, '');
    }
  }

  // 3. Cloud Run / Production fallback
  return 'https://nexgencouncil.bond';
}

export function getRouteMetadata(pathname: string, siteUrl: string): RouteMetadata {
  const settings = db.getSettings();
  const orgName = settings.organizationName || 'NexGen Women Empowerment & Youth Leadership Council';
  const defaultLogo = `${siteUrl}/banner.png`;
  const defaultDescription =
    settings.tagline ||
    'Official platform for NexGen Women Empowerment & Youth Leadership Council. Dedicated to female leadership, youth civic engagement, and grassroots innovation.';

  const cleanPath = pathname.split('?')[0].replace(/\/$/, '') || '/';

  // 1. Organization & Website Base Schemas
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: orgName,
    alternateName: 'NexGen Council',
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    image: defaultLogo,
    description: defaultDescription,
    telephone: settings.contactPhone || '+1 (800) 482-9380',
    email: settings.contactEmail || 'contact@nexgencouncil.org',
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.officeAddress || 'Executive Secretariat, 100 Leadership Plaza',
      addressLocality: 'Islamabad',
      addressCountry: 'PK'
    },
    sameAs: [
      settings.socialLinks?.linkedin,
      settings.socialLinks?.instagram,
      settings.socialLinks?.facebook,
      settings.socialLinks?.twitter
    ].filter(Boolean)
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: orgName,
    url: siteUrl,
    description: defaultDescription
  };

  // Helper for BreadcrumbList schema
  const createBreadcrumbs = (crumbs: { name: string; url: string }[]) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: c.name,
      item: c.url
    }))
  });

  // Handle Home
  if (cleanPath === '/' || cleanPath === '/home') {
    return {
      title: `Home | ${orgName}`,
      description:
        'Empowering the next generation of female leaders and civic innovators through structured mentorship, skill building, and grassroots advocacy.',
      canonicalUrl: `${siteUrl}/`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [orgSchema, websiteSchema]
    };
  }

  // Handle About
  if (cleanPath === '/about' || cleanPath === '/about-us') {
    return {
      title: `About Us | ${orgName}`,
      description:
        'Discover the mission, history, and core values of NexGen Council. Learn how our civil society initiative accelerates women empowerment and youth civic leadership.',
      canonicalUrl: `${siteUrl}/about`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'About Us', url: `${siteUrl}/about` }
        ])
      ]
    };
  }

  // Handle Programs Listing
  if (cleanPath === '/programs') {
    return {
      title: `Programs & Activities | ${orgName}`,
      description:
        'Explore NexGen Council training cohorts, 30-Day Leadership Development Series, Women in Tech fellowships, and grassroots community entrepreneurship programs.',
      canonicalUrl: `${siteUrl}/programs`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Programs & Activities', url: `${siteUrl}/programs` }
        ])
      ]
    };
  }

  // Handle Dynamic Program Detail (/programs/:slug)
  if (cleanPath.startsWith('/programs/')) {
    const slug = cleanPath.replace('/programs/', '').trim();
    const program = db.getProgramBySlug(slug);

    if (program) {
      const progImage = program.coverImage.startsWith('http') ? program.coverImage : `${siteUrl}${program.coverImage}`;
      const courseSchema = {
        '@context': 'https://schema.org',
        '@type': 'Course',
        name: program.title,
        description: program.shortDescription || program.fullDescription,
        provider: {
          '@type': 'Organization',
          name: orgName,
          sameAs: siteUrl
        },
        image: progImage,
        hasCourseInstance: {
          '@type': 'CourseInstance',
          courseMode: 'Blended',
          startDate: program.startDate,
          endDate: program.endDate
        }
      };

      return {
        title: `${program.title} | ${orgName}`,
        description: program.shortDescription || program.fullDescription.slice(0, 160),
        canonicalUrl: `${siteUrl}/programs/${program.slug}`,
        ogType: 'website',
        ogImage: progImage,
        jsonLd: [
          orgSchema,
          courseSchema,
          createBreadcrumbs([
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'Programs', url: `${siteUrl}/programs` },
            { name: program.title, url: `${siteUrl}/programs/${program.slug}` }
          ])
        ]
      };
    }
  }

  // Handle Events Listing
  if (cleanPath === '/events' || cleanPath === '/upcoming-events') {
    return {
      title: `Upcoming Events & Conferences | ${orgName}`,
      description:
        'Attend upcoming youth leadership summits, policy symposiums, community outreach workshops, and networking conferences hosted by NexGen Council.',
      canonicalUrl: `${siteUrl}/events`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Events & Conferences', url: `${siteUrl}/events` }
        ])
      ]
    };
  }

  // Handle Dynamic Event Detail (/events/:slug)
  if (cleanPath.startsWith('/events/')) {
    const slug = cleanPath.replace('/events/', '').trim();
    const event = db.getEventBySlug(slug);

    if (event) {
      const rawImg = event.coverImage || event.image || '/banner.png';
      const eventImage = rawImg.startsWith('http') ? rawImg : `${siteUrl}${rawImg}`;
      const eventSlug = event.slug || event.id;
      const eventSchema = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: event.title,
        description: event.description,
        startDate: event.date,
        endDate: event.date,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: event.location,
          address: {
            '@type': 'PostalAddress',
            streetAddress: event.location
          }
        },
        image: [eventImage],
        organizer: {
          '@type': 'Organization',
          name: orgName,
          url: siteUrl
        }
      };

      return {
        title: `${event.title} | ${orgName}`,
        description: event.description.slice(0, 160),
        canonicalUrl: `${siteUrl}/events/${eventSlug}`,
        ogType: 'website',
        ogImage: eventImage,
        jsonLd: [
          orgSchema,
          eventSchema,
          createBreadcrumbs([
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'Events', url: `${siteUrl}/events` },
            { name: event.title, url: `${siteUrl}/events/${eventSlug}` }
          ])
        ]
      };
    }
  }

  // Handle News Listing
  if (cleanPath === '/news' || cleanPath === '/news-and-updates') {
    return {
      title: `News & Updates | ${orgName}`,
      description:
        'Stay informed with the latest dispatches, policy research, changemaker spotlights, and council announcements from NexGen Council.',
      canonicalUrl: `${siteUrl}/news`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'News & Updates', url: `${siteUrl}/news` }
        ])
      ]
    };
  }

  // Handle Dynamic News Article (/news/:slug)
  if (cleanPath.startsWith('/news/')) {
    const slug = cleanPath.replace('/news/', '').trim();
    const article = db.getNewsBySlug(slug);

    if (article) {
      const articleImage = article.coverImage.startsWith('http') ? article.coverImage : `${siteUrl}${article.coverImage}`;
      const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.summary,
        image: [articleImage],
        datePublished: article.publishedAt,
        dateModified: article.publishedAt,
        author: {
          '@type': 'Person',
          name: article.author || 'Council Editorial Board'
        },
        publisher: {
          '@type': 'Organization',
          name: orgName,
          logo: {
            '@type': 'ImageObject',
            url: `${siteUrl}/logo.png`
          }
        }
      };

      return {
        title: `${article.title} | ${orgName}`,
        description: article.summary.slice(0, 160),
        canonicalUrl: `${siteUrl}/news/${article.slug}`,
        ogType: 'article',
        ogImage: articleImage,
        publishedTime: article.publishedAt,
        modifiedTime: article.publishedAt,
        author: article.author,
        jsonLd: [
          orgSchema,
          articleSchema,
          createBreadcrumbs([
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'News', url: `${siteUrl}/news` },
            { name: article.title, url: `${siteUrl}/news/${article.slug}` }
          ])
        ]
      };
    }
  }

  // Handle Volunteer
  if (cleanPath === '/volunteer' || cleanPath === '/volunteer-with-us' || cleanPath === '/volunteer-apply') {
    return {
      title: `Volunteer With Us | ${orgName}`,
      description:
        'Become a volunteer changemaker with NexGen Council. Apply today to lead grassroots educational workshops, mentor youth, and advocate for gender equity.',
      canonicalUrl: `${siteUrl}/volunteer`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Volunteer With Us', url: `${siteUrl}/volunteer` }
        ])
      ]
    };
  }

  // Handle Track Application
  if (cleanPath === '/track' || cleanPath === '/track-application') {
    return {
      title: `Track Application Status | ${orgName}`,
      description:
        'Check the real-time review status of your NexGen Council volunteer enrollment or fellowship application using your application ID.',
      canonicalUrl: `${siteUrl}/track`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Track Application', url: `${siteUrl}/track` }
        ])
      ]
    };
  }

  // Handle Leadership / Team
  if (cleanPath === '/team' || cleanPath === '/leadership') {
    return {
      title: `Leadership & Executive Board | ${orgName}`,
      description:
        'Meet the dedicated board of directors, council executives, and program coordinators spearheading NexGen Council initiatives worldwide.',
      canonicalUrl: `${siteUrl}/team`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Leadership & Executive Board', url: `${siteUrl}/team` }
        ])
      ]
    };
  }

  // Handle Gallery
  if (cleanPath === '/gallery') {
    const galleryItems = typeof db.getGallery === 'function' ? db.getGallery() : [];
    const imageObjects = galleryItems.map(item => {
      const imgUrl = item.imageUrl.startsWith('http') ? item.imageUrl : `${siteUrl}${item.imageUrl}`;
      return {
        '@type': 'ImageObject',
        url: imgUrl,
        contentUrl: imgUrl,
        name: item.title,
        caption: item.caption || item.category,
        description: item.caption || `${item.title} - ${item.category} field activity photo`,
        creditText: orgName,
        copyrightNotice: `© ${new Date().getFullYear()} ${orgName}`,
        acquireLicensePage: `${siteUrl}/gallery`
      };
    });

    const gallerySchema = {
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: `Photo & Media Gallery | ${orgName}`,
      description: 'Official image gallery showcasing youth leadership summits, skill building workshops, and civic outreach initiatives.',
      url: `${siteUrl}/gallery`,
      image: imageObjects.length > 0 ? imageObjects : [`${siteUrl}/banner.png`]
    };

    const firstImage = imageObjects.length > 0 ? imageObjects[0].url : defaultLogo;

    return {
      title: `Field Photos & Media Gallery | ${orgName}`,
      description:
        'Browse photo highlights and archival visual records from NexGen Council youth summits, community outreach drives, and leadership graduation ceremonies.',
      canonicalUrl: `${siteUrl}/gallery`,
      ogType: 'website',
      ogImage: firstImage,
      jsonLd: [
        orgSchema,
        gallerySchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Media Gallery', url: `${siteUrl}/gallery` }
        ])
      ]
    };
  }

  // Handle Contact
  if (cleanPath === '/contact' || cleanPath === '/contact-us') {
    return {
      title: `Contact Us | ${orgName}`,
      description:
        'Get in touch with the NexGen Council central secretariat for institutional partnerships, donor relations, event speaking, and community inquiries.',
      canonicalUrl: `${siteUrl}/contact`,
      ogType: 'website',
      ogImage: defaultLogo,
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Contact Us', url: `${siteUrl}/contact` }
        ])
      ]
    };
  }

  // Handle Meeting Room / Conferencing (/room/:code)
  if (cleanPath.startsWith('/room/') || cleanPath === '/room') {
    return {
      title: `Live Video Conference Room | ${orgName}`,
      description: 'Secure interactive video meeting room on NexGen Council platform.',
      canonicalUrl: `${siteUrl}${cleanPath}`,
      ogType: 'website',
      ogImage: defaultLogo,
      noindex: true
    };
  }

  // Handle Admin & Protected Routes (NOINDEX)
  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/') || cleanPath === '/admin-login' || cleanPath === '/login') {
    return {
      title: `Council Staff Portal | ${orgName}`,
      description: 'Secured administrative management portal for NexGen Council authorized personnel.',
      canonicalUrl: `${siteUrl}/admin`,
      ogType: 'website',
      ogImage: defaultLogo,
      noindex: true
    };
  }

  // Fallback / 404
  return {
    title: `Page Not Found (404) | ${orgName}`,
    description: 'The requested page could not be located on the NexGen Council official portal.',
    canonicalUrl: `${siteUrl}${cleanPath}`,
    ogType: 'website',
    ogImage: defaultLogo,
    noindex: true
  };
}

export function generateSitemapXml(siteUrl: string): string {
  const currentDate = new Date().toISOString().split('T')[0];
  const galleryItems = typeof db.getGallery === 'function' ? db.getGallery() : [];
  const teamMembers = typeof db.getTeam === 'function' ? db.getTeam() : [];

  // Helper for image sitemap node
  const makeImageNode = (url: string, title?: string, caption?: string) => {
    const fullUrl = url.startsWith('http') ? url : `${siteUrl}${url}`;
    let node = `\n    <image:image>\n      <image:loc>${escapeXml(fullUrl)}</image:loc>`;
    if (title) node += `\n      <image:title>${escapeXml(title)}</image:title>`;
    if (caption) node += `\n      <image:caption>${escapeXml(caption)}</image:caption>`;
    node += `\n    </image:image>`;
    return node;
  };

  // Static public routes with priorities and images
  const staticRoutes: Array<{
    url: string;
    priority: string;
    changefreq: string;
    lastmod: string;
    images?: Array<{ url: string; title?: string; caption?: string }>;
  }> = [
    {
      url: `${siteUrl}/`,
      priority: '1.0',
      changefreq: 'daily',
      lastmod: currentDate,
      images: [
        { url: '/logo.png', title: 'NexGen Council Official Logo' },
        { url: '/banner.png', title: 'NexGen Women Empowerment & Youth Leadership Banner' }
      ]
    },
    { url: `${siteUrl}/about`, priority: '0.8', changefreq: 'monthly', lastmod: currentDate },
    { url: `${siteUrl}/programs`, priority: '0.9', changefreq: 'weekly', lastmod: currentDate },
    { url: `${siteUrl}/events`, priority: '0.9', changefreq: 'weekly', lastmod: currentDate },
    { url: `${siteUrl}/news`, priority: '0.9', changefreq: 'weekly', lastmod: currentDate },
    { url: `${siteUrl}/volunteer`, priority: '0.9', changefreq: 'monthly', lastmod: currentDate },
    { url: `${siteUrl}/track`, priority: '0.5', changefreq: 'monthly', lastmod: currentDate },
    {
      url: `${siteUrl}/team`,
      priority: '0.7',
      changefreq: 'monthly',
      lastmod: currentDate,
      images: teamMembers.map(m => ({
        url: m.image || '/banner.png',
        title: `${m.name} - ${m.position}`,
        caption: m.bio || `${m.name}, ${m.position} at NexGen Council`
      }))
    },
    {
      url: `${siteUrl}/gallery`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: galleryItems.map(g => ({
        url: g.imageUrl,
        title: g.title,
        caption: g.caption || `${g.title} (${g.category}) photo archive`
      }))
    },
    { url: `${siteUrl}/contact`, priority: '0.8', changefreq: 'monthly', lastmod: currentDate }
  ];

  // Dynamic Programs
  const dynamicPrograms = db.getPrograms()
    .filter(p => p.status === 'Published')
    .map(p => ({
      url: `${siteUrl}/programs/${p.slug}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: p.createdAt ? p.createdAt.split('T')[0] : currentDate,
      images: p.coverImage ? [{ url: p.coverImage, title: p.title, caption: p.shortDescription || p.title }] : []
    }));

  // Dynamic Events
  const dynamicEvents = db.getEvents()
    .map(e => ({
      url: `${siteUrl}/events/${e.slug || e.id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: (e.createdAt || e.date) ? (e.createdAt || e.date).split('T')[0] : currentDate,
      images: (e.coverImage || e.image) ? [{ url: e.coverImage || e.image || '', title: e.title, caption: e.location }] : []
    }));

  // Dynamic News
  const dynamicNews = db.getNews()
    .filter(n => n.status === 'Published')
    .map(n => ({
      url: `${siteUrl}/news/${n.slug}`,
      priority: '0.8',
      changefreq: 'monthly',
      lastmod: n.publishedAt ? n.publishedAt.split('T')[0] : currentDate,
      images: n.coverImage ? [{ url: n.coverImage, title: n.title, caption: n.summary }] : []
    }));

  const allUrls = [...staticRoutes, ...dynamicPrograms, ...dynamicEvents, ...dynamicNews];

  const xmlEntries = allUrls
    .map(item => {
      let imgXml = '';
      if (item.images && item.images.length > 0) {
        imgXml = item.images.map(img => makeImageNode(img.url, img.title, img.caption)).join('');
      }
      return `  <url>
    <loc>${escapeXml(item.url)}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>${imgXml}
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd
        http://www.google.com/schemas/sitemap-image/1.1
        http://www.google.com/schemas/sitemap-image/1.1/sitemap-image.xsd">
${xmlEntries}
</urlset>`;
}

export function generateRobotsTxt(siteUrl: string): string {
  return `# Robots.txt for NexGen Council Official Website
# Optimized for Google, Google Image Search, Bing, and major search engine crawlers

User-agent: *
Allow: /
Allow: /about
Allow: /programs
Allow: /programs/*
Allow: /events
Allow: /events/*
Allow: /news
Allow: /news/*
Allow: /volunteer
Allow: /gallery
Allow: /team
Allow: /contact
Allow: /track
Allow: /uploads/
Allow: /*.jpg
Allow: /*.png
Allow: /*.webp
Allow: /*.svg

# Disallow administrative portals and private API surfaces
Disallow: /admin
Disallow: /admin/*
Disallow: /admin-login
Disallow: /login
Disallow: /api/
Disallow: /data/

# Primary XML Sitemap with Google Image Search Markup
Sitemap: ${siteUrl}/sitemap.xml
`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function injectSeoIntoHtml(
  html: string,
  meta: RouteMetadata,
  siteUrl: string,
  googleVerification?: string,
  gaTrackingId?: string
): string {
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description);
  const safeCanonical = escapeHtml(meta.canonicalUrl);
  const safeOgImage = escapeHtml(meta.ogImage);

  // 1. Replace Title
  let result = html.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`);

  // 2. Build Injected Tags
  const tags: string[] = [
    `<meta name="description" content="${safeDesc}" />`,
    `<link rel="canonical" href="${safeCanonical}" />`,
    `<link rel="image_src" href="${safeOgImage}" />`,
    `<meta name="image" content="${safeOgImage}" />`,
    `<meta itemprop="image" content="${safeOgImage}" />`,
    `<meta name="thumbnail" content="${safeOgImage}" />`,
    meta.noindex
      ? `<meta name="robots" content="noindex, nofollow" />`
      : `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeCanonical}" />`,
    `<meta property="og:type" content="${meta.ogType}" />`,
    `<meta property="og:image" content="${safeOgImage}" />`,
    `<meta property="og:image:secure_url" content="${safeOgImage}" />`,
    `<meta property="og:image:alt" content="${safeTitle}" />`,
    `<meta property="og:site_name" content="NexGen Council" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeOgImage}" />`,
    `<meta name="twitter:image:alt" content="${safeTitle}" />`
  ];

  if (meta.publishedTime) {
    tags.push(`<meta property="article:published_time" content="${meta.publishedTime}" />`);
  }
  if (meta.modifiedTime) {
    tags.push(`<meta property="article:modified_time" content="${meta.modifiedTime}" />`);
  }
  if (meta.author) {
    tags.push(`<meta name="author" content="${escapeHtml(meta.author)}" />`);
  }

  // Google Search Console Verification tag
  if (googleVerification && googleVerification.trim()) {
    tags.push(`<meta name="google-site-verification" content="${escapeHtml(googleVerification.trim())}" />`);
  }

  // Structured Data (JSON-LD)
  if (meta.jsonLd && meta.jsonLd.length > 0) {
    meta.jsonLd.forEach(schema => {
      tags.push(`<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`);
    });
  }

  // Google Analytics (GA4) script if configured
  if (gaTrackingId && gaTrackingId.trim()) {
    const cleanId = escapeHtml(gaTrackingId.trim());
    tags.push(`
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${cleanId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${cleanId}', { send_page_view: true });
</script>`);
  }

  const injectedTagsString = tags.join('\n    ');

  // Strip pre-existing static meta tags to prevent duplicates
  result = result.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/gi, '');
  result = result.replace(/<meta\s+property="og:.*?"\s+content=".*?"\s*\/?>/gi, '');
  result = result.replace(/<meta\s+name="twitter:.*?"\s+content=".*?"\s*\/?>/gi, '');
  result = result.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/gi, '');

  // Insert before </head>
  result = result.replace('</head>', `    ${injectedTagsString}\n  </head>`);

  return result;
}
