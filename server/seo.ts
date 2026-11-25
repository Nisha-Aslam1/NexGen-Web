import type { Request } from 'express';
import { db } from './db.ts';

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

export interface RouteMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: 'website' | 'article';
  ogImage: string;
  keywords?: string[];
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
    const normalizedEnv = envUrl.trim().replace(/\/+$/, '');
    if (normalizedEnv.includes('www.nexgencouncil.bond') || normalizedEnv.includes('nexgencouncil.bond')) {
      return 'https://nexgencouncil.bond';
    }
    return normalizedEnv;
  }

  // 2. Request host headers (handles proxy forwarding)
  if (req) {
    const proto = ((req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http')).split(',')[0].trim();
    const rawHost = ((req.headers['x-forwarded-host'] as string) || req.headers.host || '').split(',')[0].trim();
    const hostWithoutPort = rawHost.split(':')[0].toLowerCase();
    if (hostWithoutPort === 'nexgencouncil.bond' || hostWithoutPort === 'www.nexgencouncil.bond') {
      return 'https://nexgencouncil.bond';
    }
    if (rawHost && !rawHost.includes('localhost') && !rawHost.includes('127.0.0.1')) {
      return `${proto}://${rawHost}`.replace(/\/+$/, '');
    }
  }

  // 3. Cloud Run / Production fallback
  return 'https://nexgencouncil.bond';
}

export function getRouteMetadata(pathname: string, siteUrl: string): RouteMetadata {
  const settings = db.getSettings();
  const orgName = settings.organizationName || 'NexGen Women Empowerment & Youth Leadership Council';
  const shortBrand = 'NexGen Council';
  const defaultLogo = `${siteUrl}/banner.png`;
  const defaultDescription =
    settings.metaDescription ||
    'NexGen Council (NexGen Women Empowerment & Youth Leadership Council) empowers women and youth leaders through mentorship, fellowships, events, and civic action.';

  const rawCleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  const cleanPath = rawCleanPath.toLowerCase();

  // 1. Organization & Website Base Schemas (Knowledge Graph Optimization for "NexGen" & "NexGen Council")
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    '@id': `${siteUrl}/#organization`,
    name: orgName,
    alternateName: [
      'NexGen',
      'NexGen Council',
      'NexGen Women Empowerment',
      'NexGen Youth Leadership',
      'NexGen Empowerment Council',
      'NexGen Pakistan'
    ],
    url: siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/logo.png`
    },
    image: defaultLogo,
    slogan: 'Empowering Women. Inspiring Youth. Transforming Communities.',
    description: defaultDescription,
    keywords: CORE_NEXGEN_KEYWORDS.join(', '),
    knowsAbout: [
      'Women Empowerment',
      'Youth Leadership Development',
      'Female Entrepreneurship',
      'Civic Engagement',
      'Leadership Mentorship',
      'Gender Equality',
      'Grassroots Community Advocacy'
    ],
    areaServed: [
      { '@type': 'Country', name: 'Pakistan' },
      { '@type': 'Place', name: 'Global' }
    ],
    foundingLocation: {
      '@type': 'Place',
      name: 'Sialkot, Punjab, Pakistan'
    },
    telephone: settings.contactPhone || '+1 (800) 482-9380',
    email: settings.contactEmail || 'admin@nexgencouncil.bond',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Secretariat & Partnerships',
      email: settings.contactEmail || 'admin@nexgencouncil.bond',
      availableLanguage: ['English', 'Urdu']
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.officeAddress || 'Executive Secretariat, 100 Leadership Plaza',
      addressLocality: 'Sialkot',
      addressRegion: 'Punjab',
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
    '@id': `${siteUrl}/#website`,
    name: 'NexGen Council',
    alternateName: ['NexGen', orgName],
    url: siteUrl,
    description: defaultDescription,
    publisher: {
      '@id': `${siteUrl}/#organization`
    },
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/programs?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is NexGen Council?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'NexGen Council (NexGen Women Empowerment & Youth Leadership Council) is a civil society leadership organization empowering women and youth through structured mentorship, the 30-Day Leadership Series, civic innovation fellowships, and community outreach.'
        }
      },
      {
        '@type': 'Question',
        name: 'How can I join or volunteer with NexGen Council?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `You can apply online through the official Volunteer Registration portal at ${siteUrl}/volunteer to join leadership cohorts, community drives, and mentorship programs.`
        }
      },
      {
        '@type': 'Question',
        name: 'What programs does NexGen Women Empowerment & Youth Leadership Council offer?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `NexGen Council runs the 30-Day Leadership Development Series, Women in Tech and entrepreneurship workshops, youth civic policy symposiums, and regional community leadership initiatives listed at ${siteUrl}/programs.`
        }
      }
    ]
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
      title: 'NexGen Council — Women Empowerment & Youth Leadership',
      description:
        'NexGen Council (NexGen Women Empowerment & Youth Leadership Council) empowers women and youth leaders through mentorship, fellowships, events, and civic action.',
      canonicalUrl: `${siteUrl}/`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [
        ...CORE_NEXGEN_KEYWORDS,
        'NexGen official website',
        'women empowerment NGO Pakistan',
        'youth mentorship program'
      ],
      jsonLd: [orgSchema, websiteSchema, faqSchema]
    };
  }

  // Handle About
  if (cleanPath === '/about' || cleanPath === '/about-us') {
    const aboutTitle = `About NexGen Council | Women Empowerment & Youth Leadership`;
    const aboutDesc =
      'Discover NexGen Council—our mission, charter, 30-Day Leadership Series, and governance empowering women and youth civic leaders across Pakistan and beyond.';
    const aboutPageSchema = {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      '@id': `${siteUrl}/about#webpage`,
      url: `${siteUrl}/about`,
      name: aboutTitle,
      description: aboutDesc,
      inLanguage: 'en',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
      mainEntity: { '@id': `${siteUrl}/#organization` },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: defaultLogo
      }
    };
    const aboutFaqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is NexGen Council (NexGen Women Empowerment & Youth Leadership Council)?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'NexGen Council is an independent civil society leadership council founded in 2021 to advance women empowerment, youth civic participation, and structured leadership mentorship across Pakistan and international chapters.'
          }
        },
        {
          '@type': 'Question',
          name: 'What is the 30-Day Leadership Series offered by NexGen Council?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The 30-Day Leadership Development Series is NexGen Council’s flagship intensive fellowship covering public policy, ethical governance, communication strategy, entrepreneurship, and community project execution.'
          }
        },
        {
          '@type': 'Question',
          name: 'How can women and youth volunteer or join NexGen Council programs?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Aspiring fellows, volunteers, and community organizers can apply online through the Volunteer Registration portal at ${siteUrl}/volunteer and track their review status at ${siteUrl}/track.`
          }
        },
        {
          '@type': 'Question',
          name: 'How can educational institutions or organizations partner with NexGen Council?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Universities, NGOs, and civic partners can connect with the NexGen Council central secretariat via ${siteUrl}/contact for co-hosted symposiums, mentorship cohorts, and youth leadership sponsorships.`
          }
        }
      ]
    };

    return {
      title: aboutTitle,
      description: aboutDesc,
      canonicalUrl: `${siteUrl}/about`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [
        ...CORE_NEXGEN_KEYWORDS,
        'about NexGen',
        'about NexGen Council',
        'NexGen mission and vision',
        'NexGen institutional charter',
        'women leadership NGO Pakistan',
        'youth leadership academy Pakistan',
        'Minahil Imran Awan NexGen'
      ],
      jsonLd: [
        orgSchema,
        aboutPageSchema,
        aboutFaqSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'About NexGen Council', url: `${siteUrl}/about` }
        ])
      ]
    };
  }

  // Handle Programs Listing
  if (cleanPath === '/programs') {
    return {
      title: `Leadership Programs & Cohorts | ${shortBrand}`,
      description:
        'Explore NexGen Council training cohorts, 30-Day Leadership Development Series, Women in Tech fellowships, and grassroots community entrepreneurship programs.',
      canonicalUrl: `${siteUrl}/programs`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen programs', '30-Day Leadership Series', 'women in tech fellowship'],
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
    const slug = rawCleanPath.slice('/programs/'.length).trim();
    const program = db.getProgramBySlug(slug);

    if (program && program.status === 'Published') {
      const progSlug = program.slug || program.id;
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
        title: `${program.title} | ${shortBrand}`,
        description: program.shortDescription || program.fullDescription.slice(0, 160),
        canonicalUrl: `${siteUrl}/programs/${progSlug}`,
        ogType: 'website',
        ogImage: progImage,
        keywords: [...CORE_NEXGEN_KEYWORDS, program.title, program.category, 'NexGen leadership cohort'],
        jsonLd: [
          orgSchema,
          courseSchema,
          createBreadcrumbs([
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'Programs', url: `${siteUrl}/programs` },
            { name: program.title, url: `${siteUrl}/programs/${progSlug}` }
          ])
        ]
      };
    }
  }

  // Handle Events Listing
  if (cleanPath === '/events' || cleanPath === '/upcoming-events') {
    return {
      title: `Events & Leadership Summits | ${shortBrand}`,
      description:
        'Attend upcoming youth leadership summits, policy symposiums, community outreach workshops, and networking conferences hosted by NexGen Council.',
      canonicalUrl: `${siteUrl}/events`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen events', 'youth leadership summit', 'women empowerment conference'],
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
    const slug = rawCleanPath.slice('/events/'.length).trim();
    const event = db.getEventBySlug(slug);

    if (event && event.status !== 'Draft') {
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
        title: `${event.title} | ${shortBrand}`,
        description: event.description.slice(0, 160),
        canonicalUrl: `${siteUrl}/events/${eventSlug}`,
        ogType: 'website',
        ogImage: eventImage,
        keywords: [...CORE_NEXGEN_KEYWORDS, event.title, event.category, event.location],
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
      title: `News & Dispatches | ${shortBrand}`,
      description:
        'Stay informed with the latest dispatches, policy research, changemaker spotlights, and official announcements from NexGen Council.',
      canonicalUrl: `${siteUrl}/news`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen news', 'NexGen announcements', 'youth policy updates'],
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
    const slug = rawCleanPath.slice('/news/'.length).trim();
    const article = db.getNewsBySlug(slug);

    if (article && article.status === 'Published') {
      const articleSlug = article.slug || article.id;
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
        title: `${article.title} | ${shortBrand}`,
        description: article.summary.slice(0, 160),
        canonicalUrl: `${siteUrl}/news/${articleSlug}`,
        ogType: 'article',
        ogImage: articleImage,
        keywords: [...CORE_NEXGEN_KEYWORDS, article.title, article.category, article.author],
        publishedTime: article.publishedAt,
        modifiedTime: article.publishedAt,
        author: article.author,
        jsonLd: [
          orgSchema,
          articleSchema,
          createBreadcrumbs([
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'News', url: `${siteUrl}/news` },
            { name: article.title, url: `${siteUrl}/news/${articleSlug}` }
          ])
        ]
      };
    }
  }

  // Handle Volunteer
  if (cleanPath === '/volunteer' || cleanPath === '/volunteer-with-us' || cleanPath === '/volunteer-apply') {
    return {
      title: `Volunteer With NexGen | ${shortBrand}`,
      description:
        'Become a volunteer changemaker with NexGen Council. Apply today to lead grassroots educational workshops, mentor youth, and advocate for women empowerment.',
      canonicalUrl: `${siteUrl}/volunteer`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'join NexGen Council', 'NexGen volunteer registration', 'youth volunteer Pakistan'],
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
      title: `Track Application Status | ${shortBrand}`,
      description:
        'Check the real-time review status of your NexGen Council volunteer enrollment or fellowship application using your application ID.',
      canonicalUrl: `${siteUrl}/track`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen application status', 'track volunteer application'],
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
      title: `Executive Leadership & Board | ${shortBrand}`,
      description:
        'Meet the founder, board of directors, council executives, and program coordinators leading NexGen Women Empowerment & Youth Leadership Council.',
      canonicalUrl: `${siteUrl}/team`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen leadership', 'NexGen executive board', 'Minahil Imran Awan'],
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
      name: `Photo & Media Gallery | ${shortBrand}`,
      description: 'Official image gallery showcasing NexGen Council youth leadership summits, skill building workshops, and civic outreach initiatives.',
      url: `${siteUrl}/gallery`,
      image: imageObjects.length > 0 ? imageObjects : [`${siteUrl}/banner.png`]
    };

    const firstImage = imageObjects.length > 0 ? imageObjects[0].url : defaultLogo;

    return {
      title: `Field Photos & Media Gallery | ${shortBrand}`,
      description:
        'Browse photo highlights and archival visual records from NexGen Council youth summits, community outreach drives, and leadership graduation ceremonies.',
      canonicalUrl: `${siteUrl}/gallery`,
      ogType: 'website',
      ogImage: firstImage,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen gallery', 'youth summit photos', 'women empowerment events gallery'],
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
      title: `Contact NexGen Secretariat | ${shortBrand}`,
      description:
        'Get in touch with the NexGen Council central secretariat for institutional partnerships, sponsorships, event speaking, and community inquiries.',
      canonicalUrl: `${siteUrl}/contact`,
      ogType: 'website',
      ogImage: defaultLogo,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'contact NexGen Council', 'NexGen secretariat'],
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Contact Us', url: `${siteUrl}/contact` }
        ])
      ]
    };
  }

  // Handle Meeting Room / Conferencing (/meeting/:slug, /room/:code) - STRICTLY PRIVATE / NOINDEX
  if (
    cleanPath.startsWith('/meeting/') ||
    cleanPath === '/meeting' ||
    cleanPath === '/meetings' ||
    cleanPath.startsWith('/room/') ||
    cleanPath === '/room' ||
    cleanPath.startsWith('/meet/') ||
    cleanPath === '/meet'
  ) {
    return {
      title: `Private Video Session | ${orgName}`,
      description: 'Private invite-only video conference session hosted on NexGen Council.',
      canonicalUrl: `${siteUrl}${cleanPath}`,
      ogType: 'website',
      ogImage: defaultLogo,
      noindex: true
    };
  }

  // Handle Admin & Protected Routes (NOINDEX)
  if (
    cleanPath === '/admin' ||
    cleanPath.startsWith('/admin/') ||
    cleanPath === '/admin-login' ||
    cleanPath === '/login'
  ) {
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
    {
      url: `${siteUrl}/about`,
      priority: '0.9',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: [
        {
          url: '/banner.png',
          title: 'About NexGen Council — Women Empowerment & Youth Leadership',
          caption: 'NexGen Women Empowerment & Youth Leadership Council mission, charter, and milestones'
        }
      ]
    },
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

# Disallow administrative portals, private meeting rooms, and API surfaces
Disallow: /admin
Disallow: /admin/*
Disallow: /admin-login
Disallow: /login
Disallow: /meeting
Disallow: /meeting/*
Disallow: /meetings
Disallow: /room
Disallow: /room/*
Disallow: /meet
Disallow: /meet/*
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

function isSearchCrawlerUserAgent(userAgent?: string): boolean {
  if (!userAgent) return false;
  return /bot|crawl|spider|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|applebot|duckduckbot|yandex|baidu/i.test(
    userAgent
  );
}

export function injectSeoIntoHtml(
  html: string,
  meta: RouteMetadata,
  siteUrl: string,
  googleVerification?: string,
  gaTrackingId?: string,
  userAgent?: string
): string {
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description);
  const safeCanonical = escapeHtml(meta.canonicalUrl);
  const safeOgImage = escapeHtml(meta.ogImage);
  const mergedKeywords = Array.from(
    new Set([...(meta.keywords || []), ...CORE_NEXGEN_KEYWORDS].map(k => k.trim()).filter(Boolean))
  );
  const safeKeywords = escapeHtml(mergedKeywords.join(', '));

  // 1. Replace Title
  let result = html.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`);

  // 2. Build Injected Tags
  const tags: string[] = [
    `<meta name="application-name" content="NexGen Council" />`,
    `<meta name="theme-color" content="#1e1b4b" />`,
    `<meta name="description" content="${safeDesc}" />`,
    `<meta name="keywords" content="${safeKeywords}" />`,
    `<link rel="canonical" href="${safeCanonical}" />`,
    `<link rel="alternate" hreflang="en" href="${safeCanonical}" />`,
    `<link rel="alternate" hreflang="x-default" href="${safeCanonical}" />`,
    `<link rel="image_src" href="${safeOgImage}" />`,
    `<meta name="image" content="${safeOgImage}" />`,
    `<meta itemprop="image" content="${safeOgImage}" />`,
    `<meta name="thumbnail" content="${safeOgImage}" />`,
    meta.noindex
      ? `<meta name="robots" content="noindex, nofollow" />`
      : `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />`,
    `<meta property="og:locale" content="en_US" />`,
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

  // Strip pre-existing static meta/link tags to prevent duplicates
  result = result.replace(/<meta\b[^>]*name=["']?application-name["']?[^>]*>/gi, '');
  result = result.replace(/<meta\b[^>]*name=["']?theme-color["']?[^>]*>/gi, '');
  result = result.replace(/<meta\b[^>]*name=["']?description["']?[^>]*>/gi, '');
  result = result.replace(/<meta\b[^>]*name=["']?keywords["']?[^>]*>/gi, '');
  result = result.replace(/<meta\b[^>]*name=["']?robots["']?[^>]*>/gi, '');
  result = result.replace(/<meta\b[^>]*property=["']?og:[^>]*>/gi, '');
  result = result.replace(/<meta\b[^>]*name=["']?twitter:[^>]*>/gi, '');
  result = result.replace(/<link\b[^>]*rel=["']?canonical["']?[^>]*>/gi, '');
  result = result.replace(/<link\b[^>]*rel=["']?alternate["']?[^>]*hreflang=[^>]*>/gi, '');
  result = result.replace(/<link\b[^>]*rel=["']?image_src["']?[^>]*>/gi, '');
  if (googleVerification && googleVerification.trim()) {
    result = result.replace(/<meta\b[^>]*name=["']?google-site-verification["']?[^>]*>/gi, '');
  }
  if (meta.author) {
    result = result.replace(/<meta\b[^>]*name=["']?author["']?[^>]*>/gi, '');
  }

  // Insert before </head>
  result = result.replace('</head>', `    ${injectedTagsString}\n  </head>`);

  // Always leave <div id="root"></div> clean for browser hydration and Lighthouse audits.
  // Provide semantic noscript fallback for non-JS bots, crawlers, and accessibility.
  if (result.includes('<div id="root"></div>')) {
    const cleanBase = escapeHtml(siteUrl.replace(/\/+$/, ''));
    const noscriptSemantic = !meta.noindex
      ? `\n    <noscript><main style="font-family:system-ui,sans-serif;max-width:960px;margin:0 auto;padding:24px;"><h1>${safeTitle}</h1><p>${safeDesc}</p><nav aria-label="NexGen Council Navigation"><a href="${cleanBase}/">Home</a> | <a href="${cleanBase}/about">About NexGen</a> | <a href="${cleanBase}/programs">Leadership Programs</a> | <a href="${cleanBase}/events">Events</a> | <a href="${cleanBase}/news">News</a> | <a href="${cleanBase}/team">Executive Leadership</a> | <a href="${cleanBase}/gallery">Gallery</a> | <a href="${cleanBase}/volunteer">Volunteer</a> | <a href="${cleanBase}/contact">Contact</a></nav></main></noscript>`
      : '';

    if (noscriptSemantic) {
      result = result.replace('<div id="root"></div>', `<div id="root"></div>${noscriptSemantic}`);
    }
  }

  return result;
}
