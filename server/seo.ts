import type { Request } from 'express';
import { db } from './db.ts';
import {
  buildAutoImageAlt,
  buildAutoImageCaption,
  buildImageObjectSchema,
  resolvePublicImageUrl
} from '../src/lib/imageSeo.ts';

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

export interface NoscriptImageEntry {
  url: string;
  alt: string;
  title?: string;
}

export interface RouteMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: 'website' | 'article';
  ogImage: string;
  ogImageAlt?: string;
  keywords?: string[];
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  jsonLd?: Record<string, any>[];
  noscriptImages?: NoscriptImageEntry[];
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

  const dedupeImages = (entries: NoscriptImageEntry[]): NoscriptImageEntry[] => {
    const seen = new Set<string>();
    const out: NoscriptImageEntry[] = [];
    for (const entry of entries) {
      const resolved = resolvePublicImageUrl(entry.url, siteUrl, { allowDataUrl: false });
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      out.push({
        url: resolved,
        alt: entry.alt,
        title: entry.title || entry.alt
      });
    }
    return out;
  };

  // Handle Home
  if (cleanPath === '/' || cleanPath === '/home') {
    const homePrograms = (typeof db.getPrograms === 'function' ? db.getPrograms(true) : []).slice(0, 6);
    const homeTeam = (typeof db.getTeam === 'function' ? db.getTeam(true) : []).slice(0, 6);
    const homeNews = (typeof db.getNews === 'function' ? db.getNews(true) : [])
      .filter(n => Boolean((n.coverImage || '').trim()))
      .slice(0, 4);

    const homeImages = dedupeImages([
      {
        url: '/assets/aistudio/NexGen_Poster_190b79d4.png',
        alt: 'NexGen Women Empowerment & Youth Leadership Council Official Poster — Leadership & Civic Action',
        title: 'NexGen Council Official Showcase Poster'
      },
      {
        url: '/banner.png',
        alt: 'NexGen Women Empowerment & Youth Leadership Council Official Hero Banner',
        title: 'NexGen Council Official Banner'
      },
      {
        url: '/logo.png',
        alt: 'NexGen Women Empowerment & Youth Leadership Council Official Crest Logo',
        title: 'NexGen Council Official Logo'
      },
      ...homePrograms.map(p => ({
        url: p.coverImage,
        alt: buildAutoImageAlt({
          type: 'program',
          customAlt: p.imageAlt,
          title: p.title,
          category: p.category
        }),
        title: p.title
      })),
      ...homeTeam.map(m => ({
        url: m.image,
        alt: buildAutoImageAlt({
          type: 'team',
          customAlt: m.imageAlt,
          name: m.name,
          role: m.position,
          department: m.department
        }),
        title: `${m.name} — ${m.position}`
      })),
      ...homeNews.map(n => ({
        url: n.coverImage || '',
        alt: buildAutoImageAlt({
          type: 'news',
          customAlt: n.imageAlt,
          title: n.title,
          category: n.category
        }),
        title: n.title
      }))
    ]);

    const homePageSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${siteUrl}/#webpage`,
      url: `${siteUrl}/`,
      name: 'NexGen Council — Women Empowerment & Youth Leadership',
      description: defaultDescription,
      inLanguage: 'en',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
      primaryImageOfPage: buildImageObjectSchema({
        url: `${siteUrl}/banner.png`,
        alt: 'NexGen Women Empowerment & Youth Leadership Council Official Banner',
        caption: defaultDescription,
        pageUrl: `${siteUrl}/`,
        orgName,
        representativeOfPage: true
      }),
      associatedMedia: homeImages.map((img, idx) =>
        buildImageObjectSchema({
          url: img.url,
          alt: img.alt,
          name: img.title,
          caption: img.alt,
          pageUrl: `${siteUrl}/`,
          orgName,
          representativeOfPage: idx === 0
        })
      )
    };

    return {
      title: 'NexGen Council — Women Empowerment & Youth Leadership',
      description:
        'NexGen Council (NexGen Women Empowerment & Youth Leadership Council) empowers women and youth leaders through mentorship, fellowships, events, and civic action.',
      canonicalUrl: `${siteUrl}/`,
      ogType: 'website',
      ogImage: defaultLogo,
      ogImageAlt: 'NexGen Women Empowerment & Youth Leadership Council Official Banner',
      keywords: [
        ...CORE_NEXGEN_KEYWORDS,
        'NexGen official website',
        'women empowerment NGO Pakistan',
        'youth mentorship program'
      ],
      noscriptImages: homeImages,
      jsonLd: [orgSchema, websiteSchema, homePageSchema, faqSchema]
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

    const aboutImages = dedupeImages([
      {
        url: '/banner.png',
        alt: 'About NexGen Women Empowerment & Youth Leadership Council — Mission & Institutional Charter Banner',
        title: 'About NexGen Council Banner'
      },
      {
        url: '/logo.png',
        alt: 'NexGen Women Empowerment & Youth Leadership Council Official Crest',
        title: 'NexGen Council Logo'
      }
    ]);

    return {
      title: aboutTitle,
      description: aboutDesc,
      canonicalUrl: `${siteUrl}/about`,
      ogType: 'website',
      ogImage: defaultLogo,
      ogImageAlt: 'About NexGen Women Empowerment & Youth Leadership Council',
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
      noscriptImages: aboutImages,
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
    const publishedPrograms = typeof db.getPrograms === 'function' ? db.getPrograms(true) : [];
    const programImages = dedupeImages([
      ...publishedPrograms.map(p => ({
        url: p.coverImage,
        alt: buildAutoImageAlt({
          type: 'program',
          customAlt: p.imageAlt,
          title: p.title,
          category: p.category
        }),
        title: p.title
      })),
      {
        url: '/banner.png',
        alt: 'NexGen Council Leadership Programs & Fellowship Cohorts',
        title: 'NexGen Council Programs Banner'
      }
    ]);

    const programsCollectionSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${siteUrl}/programs#webpage`,
      url: `${siteUrl}/programs`,
      name: `Leadership Programs & Cohorts | ${shortBrand}`,
      description:
        'Explore NexGen Council training cohorts, 30-Day Leadership Development Series, Women in Tech fellowships, and grassroots community entrepreneurship programs.',
      associatedMedia: programImages.map((img, idx) =>
        buildImageObjectSchema({
          url: img.url,
          alt: img.alt,
          name: img.title,
          caption: img.alt,
          pageUrl: `${siteUrl}/programs`,
          orgName,
          representativeOfPage: idx === 0
        })
      )
    };

    const firstProgramImg = programImages[0]?.url || defaultLogo;
    const firstProgramAlt = programImages[0]?.alt || `Leadership Programs & Cohorts | ${shortBrand}`;

    return {
      title: `Leadership Programs & Cohorts | ${shortBrand}`,
      description:
        'Explore NexGen Council training cohorts, 30-Day Leadership Development Series, Women in Tech fellowships, and grassroots community entrepreneurship programs.',
      canonicalUrl: `${siteUrl}/programs`,
      ogType: 'website',
      ogImage: firstProgramImg,
      ogImageAlt: firstProgramAlt,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen programs', '30-Day Leadership Series', 'women in tech fellowship'],
      noscriptImages: programImages,
      jsonLd: [
        orgSchema,
        programsCollectionSchema,
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
      const progImage = resolvePublicImageUrl(program.coverImage, siteUrl, {
        allowDataUrl: false,
        fallbackPath: '/banner.png'
      }) || defaultLogo;
      const progAlt = buildAutoImageAlt({
        type: 'program',
        customAlt: program.imageAlt,
        title: program.title,
        category: program.category
      });
      const progCaption = buildAutoImageCaption({
        type: 'program',
        customAlt: program.imageAlt,
        title: program.title,
        category: program.category,
        summary: program.shortDescription
      });
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
        image: buildImageObjectSchema({
          url: progImage,
          alt: progAlt,
          name: program.title,
          caption: progCaption,
          pageUrl: `${siteUrl}/programs/${progSlug}`,
          orgName,
          representativeOfPage: true
        }),
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
        ogImageAlt: progAlt,
        keywords: [...CORE_NEXGEN_KEYWORDS, program.title, program.category, 'NexGen leadership cohort'],
        noscriptImages: [{ url: progImage, alt: progAlt, title: program.title }],
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
    const visibleEvents = (typeof db.getEvents === 'function' ? db.getEvents() : []).filter(e => e.status !== 'Draft');
    const eventImages = dedupeImages([
      ...visibleEvents.map(e => ({
        url: e.coverImage || e.image || '',
        alt: buildAutoImageAlt({
          type: 'event',
          customAlt: e.imageAlt,
          title: e.title,
          category: e.category,
          location: e.location
        }),
        title: e.title
      })),
      {
        url: '/banner.png',
        alt: 'NexGen Council Youth Leadership Summits & Community Events',
        title: 'NexGen Council Events Banner'
      }
    ]);

    const eventsCollectionSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${siteUrl}/events#webpage`,
      url: `${siteUrl}/events`,
      name: `Events & Leadership Summits | ${shortBrand}`,
      description:
        'Attend upcoming youth leadership summits, policy symposiums, community outreach workshops, and networking conferences hosted by NexGen Council.',
      associatedMedia: eventImages.map((img, idx) =>
        buildImageObjectSchema({
          url: img.url,
          alt: img.alt,
          name: img.title,
          caption: img.alt,
          pageUrl: `${siteUrl}/events`,
          orgName,
          representativeOfPage: idx === 0
        })
      )
    };

    return {
      title: `Events & Leadership Summits | ${shortBrand}`,
      description:
        'Attend upcoming youth leadership summits, policy symposiums, community outreach workshops, and networking conferences hosted by NexGen Council.',
      canonicalUrl: `${siteUrl}/events`,
      ogType: 'website',
      ogImage: eventImages[0]?.url || defaultLogo,
      ogImageAlt: eventImages[0]?.alt || 'NexGen Council Youth Leadership Summits & Community Events',
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen events', 'youth leadership summit', 'women empowerment conference'],
      noscriptImages: eventImages,
      jsonLd: [
        orgSchema,
        eventsCollectionSchema,
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
      const eventImage = resolvePublicImageUrl(rawImg, siteUrl, {
        allowDataUrl: false,
        fallbackPath: '/banner.png'
      }) || defaultLogo;
      const eventAlt = buildAutoImageAlt({
        type: 'event',
        customAlt: event.imageAlt,
        title: event.title,
        category: event.category,
        location: event.location
      });
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
        image: [
          buildImageObjectSchema({
            url: eventImage,
            alt: eventAlt,
            name: event.title,
            caption: eventAlt,
            pageUrl: `${siteUrl}/events/${eventSlug}`,
            orgName,
            representativeOfPage: true
          })
        ],
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
        ogImageAlt: eventAlt,
        keywords: [...CORE_NEXGEN_KEYWORDS, event.title, event.category, event.location],
        noscriptImages: [{ url: eventImage, alt: eventAlt, title: event.title }],
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
    const newsListingTitle = (settings.newsSeoTitle || '').trim() || `News & Dispatches | ${shortBrand}`;
    const newsListingDesc =
      (settings.newsSeoDescription || '').trim() ||
      'Stay informed with the latest dispatches, policy research, changemaker spotlights, and official announcements from NexGen Council.';
    const customNewsKeywords = Array.isArray(settings.newsSeoKeywords) ? settings.newsSeoKeywords : [];
    const publishedNews = (typeof db.getNews === 'function' ? db.getNews(true) : []).filter(
      n => Boolean((n.coverImage || '').trim())
    );
    const newsImages = dedupeImages([
      ...publishedNews.map(n => ({
        url: n.coverImage || '',
        alt: buildAutoImageAlt({
          type: 'news',
          customAlt: n.imageAlt,
          title: n.title,
          category: n.category
        }),
        title: n.title
      })),
      {
        url: '/banner.png',
        alt: 'NexGen Council Newsroom & Official Dispatches',
        title: 'NexGen Council News Banner'
      }
    ]);

    const newsCollectionSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${siteUrl}/news#webpage`,
      url: `${siteUrl}/news`,
      name: newsListingTitle,
      description: newsListingDesc,
      associatedMedia: newsImages.map((img, idx) =>
        buildImageObjectSchema({
          url: img.url,
          alt: img.alt,
          name: img.title,
          caption: img.alt,
          pageUrl: `${siteUrl}/news`,
          orgName,
          representativeOfPage: idx === 0
        })
      )
    };

    return {
      title: newsListingTitle,
      description: newsListingDesc,
      canonicalUrl: `${siteUrl}/news`,
      ogType: 'website',
      ogImage: newsImages[0]?.url || defaultLogo,
      ogImageAlt: newsImages[0]?.alt || newsListingTitle,
      keywords: [
        ...customNewsKeywords,
        ...CORE_NEXGEN_KEYWORDS,
        'NexGen news',
        'NexGen announcements',
        'youth policy updates'
      ],
      noscriptImages: newsImages,
      jsonLd: [
        orgSchema,
        newsCollectionSchema,
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
      const rawCover = (article.coverImage || '').trim();
      const hasCoverImage = Boolean(rawCover);
      const articleImage =
        resolvePublicImageUrl(rawCover, siteUrl, { allowDataUrl: false, fallbackPath: '/banner.png' }) || defaultLogo;
      const articleImageAlt = hasCoverImage
        ? buildAutoImageAlt({
            type: 'news',
            customAlt: article.imageAlt,
            title: article.title,
            category: article.category
          })
        : `${article.title} — NexGen Council Official Dispatch`;
      const articleSeoTitle = (article.seoTitle || '').trim() || `${article.title} | ${shortBrand}`;
      const articleSeoDesc = ((article.seoDescription || '').trim() || article.summary || '').slice(0, 160);
      const articleCustomKeywords = Array.isArray(article.seoKeywords) ? article.seoKeywords : [];
      const articleTags = Array.isArray(article.tags) ? article.tags : [];
      const resolvedCanonical =
        article.canonicalUrl && article.canonicalUrl.trim()
          ? article.canonicalUrl.startsWith('http')
            ? article.canonicalUrl
            : `${siteUrl}${article.canonicalUrl.startsWith('/') ? '' : '/'}${article.canonicalUrl}`
          : `${siteUrl}/news/${articleSlug}`;

      const mergedArticleKeywords = Array.from(
        new Set([
          ...articleCustomKeywords,
          ...articleTags,
          article.category,
          article.author,
          ...CORE_NEXGEN_KEYWORDS
        ].filter(Boolean))
      );

      const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: articleSeoDesc,
        image: [
          buildImageObjectSchema({
            url: articleImage,
            alt: articleImageAlt,
            name: article.title,
            caption: articleSeoDesc || articleImageAlt,
            pageUrl: resolvedCanonical,
            orgName,
            representativeOfPage: true
          })
        ],
        datePublished: article.publishedAt,
        dateModified: article.publishedAt,
        articleSection: article.category,
        keywords: mergedArticleKeywords.join(', '),
        mainEntityOfPage: resolvedCanonical,
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
        title: articleSeoTitle,
        description: articleSeoDesc,
        canonicalUrl: resolvedCanonical,
        ogType: 'article',
        ogImage: articleImage,
        ogImageAlt: articleImageAlt,
        keywords: mergedArticleKeywords,
        publishedTime: article.publishedAt,
        modifiedTime: article.publishedAt,
        author: article.author,
        noscriptImages: hasCoverImage ? [{ url: articleImage, alt: articleImageAlt, title: article.title }] : [],
        jsonLd: [
          orgSchema,
          articleSchema,
          createBreadcrumbs([
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'News', url: `${siteUrl}/news` },
            { name: article.title, url: resolvedCanonical }
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
      ogImageAlt: 'Volunteer With NexGen Women Empowerment & Youth Leadership Council',
      keywords: [...CORE_NEXGEN_KEYWORDS, 'join NexGen Council', 'NexGen volunteer registration', 'youth volunteer Pakistan'],
      noscriptImages: [
        {
          url: `${siteUrl}/banner.png`,
          alt: 'Join NexGen Council Volunteer & Youth Leadership Network',
          title: 'NexGen Volunteer Enrollment'
        }
      ],
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
      ogImageAlt: 'NexGen Council Volunteer Application Tracker',
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen application status', 'track volunteer application'],
      noscriptImages: [
        {
          url: `${siteUrl}/logo.png`,
          alt: 'NexGen Council Official Crest Logo',
          title: 'NexGen Council Official Logo'
        }
      ],
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
    const activeTeam = typeof db.getTeam === 'function' ? db.getTeam(true) : [];
    const teamImages = dedupeImages([
      ...activeTeam.map(m => ({
        url: m.image || '/logo.png',
        alt: buildAutoImageAlt({
          type: 'team',
          customAlt: m.imageAlt,
          name: m.name,
          role: m.position,
          department: m.department
        }),
        title: `${m.name} — ${m.position}`
      })),
      {
        url: '/banner.png',
        alt: 'NexGen Council Executive Leadership & Board of Directors',
        title: 'NexGen Council Executive Leadership'
      }
    ]);

    const teamPageSchema = {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      '@id': `${siteUrl}/team#webpage`,
      url: `${siteUrl}/team`,
      name: `Executive Leadership & Board | ${shortBrand}`,
      description:
        'Meet the founder, board of directors, council executives, and program coordinators leading NexGen Women Empowerment & Youth Leadership Council.',
      mainEntity: activeTeam.map(m => {
        const portraitUrl =
          resolvePublicImageUrl(m.image, siteUrl, { allowDataUrl: false, fallbackPath: '/logo.png' }) || defaultLogo;
        const portraitAlt = buildAutoImageAlt({
          type: 'team',
          customAlt: m.imageAlt,
          name: m.name,
          role: m.position,
          department: m.department
        });
        return {
          '@type': 'Person',
          name: m.name,
          jobTitle: m.position,
          description: m.bio,
          worksFor: { '@id': `${siteUrl}/#organization` },
          image: buildImageObjectSchema({
            url: portraitUrl,
            alt: portraitAlt,
            name: `${m.name} — ${m.position}`,
            caption: m.bio || portraitAlt,
            pageUrl: `${siteUrl}/team`,
            orgName
          })
        };
      }),
      associatedMedia: teamImages.map((img, idx) =>
        buildImageObjectSchema({
          url: img.url,
          alt: img.alt,
          name: img.title,
          caption: img.alt,
          pageUrl: `${siteUrl}/team`,
          orgName,
          representativeOfPage: idx === 0
        })
      )
    };

    return {
      title: `Executive Leadership & Board | ${shortBrand}`,
      description:
        'Meet the founder, board of directors, council executives, and program coordinators leading NexGen Women Empowerment & Youth Leadership Council.',
      canonicalUrl: `${siteUrl}/team`,
      ogType: 'website',
      ogImage: teamImages[0]?.url || defaultLogo,
      ogImageAlt: teamImages[0]?.alt || 'NexGen Council Executive Leadership & Board',
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen leadership', 'NexGen executive board', 'Minahil Imran Awan'],
      noscriptImages: teamImages,
      jsonLd: [
        orgSchema,
        teamPageSchema,
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
    const galleryImages = dedupeImages(
      galleryItems.map(item => ({
        url: item.imageUrl,
        alt: buildAutoImageAlt({
          type: 'gallery',
          customAlt: item.imageAlt,
          title: item.title,
          category: item.category,
          caption: item.caption
        }),
        title: item.title
      }))
    );

    const imageObjects = galleryItems
      .map(item => {
        const imgUrl = resolvePublicImageUrl(item.imageUrl, siteUrl, { allowDataUrl: false });
        if (!imgUrl) return null;
        const alt = buildAutoImageAlt({
          type: 'gallery',
          customAlt: item.imageAlt,
          title: item.title,
          category: item.category,
          caption: item.caption
        });
        const caption = buildAutoImageCaption({
          type: 'gallery',
          customAlt: item.imageAlt,
          title: item.title,
          category: item.category,
          caption: item.caption
        });
        return buildImageObjectSchema({
          url: imgUrl,
          alt,
          name: item.title,
          caption,
          pageUrl: `${siteUrl}/gallery`,
          orgName
        });
      })
      .filter(Boolean);

    const gallerySchema = {
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: `Photo & Media Gallery | ${shortBrand}`,
      description: 'Official image gallery showcasing NexGen Council youth leadership summits, skill building workshops, and civic outreach initiatives.',
      url: `${siteUrl}/gallery`,
      image: imageObjects.length > 0 ? imageObjects : [`${siteUrl}/banner.png`]
    };

    const firstImage = galleryImages[0]?.url || defaultLogo;
    const firstAlt = galleryImages[0]?.alt || `Field Photos & Media Gallery | ${shortBrand}`;

    return {
      title: `Field Photos & Media Gallery | ${shortBrand}`,
      description:
        'Browse photo highlights and archival visual records from NexGen Council youth summits, community outreach drives, and leadership graduation ceremonies.',
      canonicalUrl: `${siteUrl}/gallery`,
      ogType: 'website',
      ogImage: firstImage,
      ogImageAlt: firstAlt,
      keywords: [...CORE_NEXGEN_KEYWORDS, 'NexGen gallery', 'youth summit photos', 'women empowerment events gallery'],
      noscriptImages: galleryImages,
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
      ogImageAlt: 'Contact NexGen Women Empowerment & Youth Leadership Council Secretariat',
      keywords: [...CORE_NEXGEN_KEYWORDS, 'contact NexGen Council', 'NexGen secretariat'],
      noscriptImages: [
        {
          url: `${siteUrl}/banner.png`,
          alt: 'NexGen Council Central Secretariat & Partnerships Desk',
          title: 'Contact NexGen Council'
        }
      ],
      jsonLd: [
        orgSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Contact Us', url: `${siteUrl}/contact` }
        ])
      ]
    };
  }

  // Handle Donate
  if (cleanPath === '/donate' || cleanPath === '/donation' || cleanPath === '/support-us') {
    const donatePoster = `${siteUrl}/assets/aistudio/2535e6a6-f29c-44fd-8f0c-05946ee38cac_8942ae05.jpg`;
    const donateQr = `${siteUrl}/assets/donation-qr-easypaisa.png`;
    const donateTitle = `Donate to NexGen Council | Support Youth & Communities`;
    const donateDesc =
      'Donate to NexGen Council for education, healthcare & community relief. Contribute easily via QR Till 992191268, Easypaisa, NayaPay, or JazzCash today.';

    const donateActionSchema = {
      '@context': 'https://schema.org',
      '@type': 'DonateAction',
      name: 'Donate to NexGen Council',
      description: donateDesc,
      recipient: {
        '@id': `${siteUrl}/#organization`
      },
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/donate`,
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform'
        ]
      }
    };

    const donatePageSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${siteUrl}/donate#webpage`,
      url: `${siteUrl}/donate`,
      name: donateTitle,
      description: donateDesc,
      inLanguage: 'en',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: donatePoster,
        width: 1199,
        height: 1312,
        caption: 'NexGen Council Official Donation Drive — Your Donation Can Change Lives'
      },
      potentialAction: donateActionSchema
    };

    const donateHowToSchema = {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to Donate to NexGen Council',
      description: 'Donate securely to NexGen Council via QR Merchant Till 992191268, Easypaisa, or NayaPay/JazzCash.',
      image: donateQr,
      step: [
        {
          '@type': 'HowToStep',
          position: 1,
          name: 'Open Your Payment App',
          text: 'Open Easypaisa, NayaPay, JazzCash, or any Raast-enabled Pakistani banking app on your phone.'
        },
        {
          '@type': 'HowToStep',
          position: 2,
          name: 'Scan QR or Transfer Direct',
          text: 'Scan the official Scan to Donate QR code (Merchant Till Number 992191268) or transfer to Easypaisa (Momna Kokab, 03497100560) or NayaPay / JazzCash (Minahil Imran, 03418408350).'
        },
        {
          '@type': 'HowToStep',
          position: 3,
          name: 'Confirm Your Contribution',
          text: 'Submit your Transaction ID (TID) and cause choice through the Donor Acknowledgment Desk on the donation page.'
        }
      ]
    };

    const donateImages = dedupeImages([
      {
        url: donatePoster,
        alt: 'NexGen Council Official Donation Drive — Your Donation Can Change Lives',
        title: 'NexGen Council Official Donation Drive Poster'
      },
      {
        url: donateQr,
        alt: 'Scan to Donate Easypaisa Raast QR Code — NexGen Council Merchant Till 992191268',
        title: 'Easypaisa & Raast QR Merchant Till 992191268'
      },
      {
        url: '/assets/aistudio/WhatsApp_Image_2026-11-25_at_9.04.33_PM_ae4e7388.jpeg',
        alt: 'Official Easypaisa & Raast QR Payment Card — Merchant Till 992191268 for NexGen Council',
        title: 'Easypaisa Merchant Till 992191268 Payment Card'
      }
    ]);

    return {
      title: donateTitle,
      description: donateDesc,
      canonicalUrl: `${siteUrl}/donate`,
      ogType: 'website',
      ogImage: donatePoster,
      ogImageAlt: 'NexGen Council Official Donation Drive — Your Donation Can Change Lives',
      keywords: [
        ...CORE_NEXGEN_KEYWORDS,
        'Donate NexGen Council',
        'NexGen Council Donation',
        'NexGen Donation Drive',
        'Charity Pakistan',
        'Donate Education Pakistan',
        'Healthcare Charity Pakistan',
        'Women Empowerment Donation Pakistan',
        'Easypaisa Donation Pakistan',
        'NayaPay JazzCash Donation',
        'Merchant Till 992191268',
        'Raast QR Charity Pakistan',
        'SpreadKindness',
        'TogetherForChange'
      ],
      noscriptImages: donateImages,
      jsonLd: [
        orgSchema,
        donatePageSchema,
        donateHowToSchema,
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Donate & Support', url: `${siteUrl}/donate` }
        ])
      ]
    };
  }

  // Handle Site-Wide Standalone FAQ (/faq, /faqs)
  if (cleanPath === '/faq' || cleanPath === '/faqs' || cleanPath === '/help') {
    const siteFaqTitle = 'NexGen Council FAQ | Membership, Programs & Donations';
    const siteFaqDesc =
      'Get official answers on NexGen Council volunteer registration, Member ID cards, 30-Day Leadership Series, events, partnerships & verified donations.';
    const faqWebPageSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${siteUrl}/faq#webpage`,
      url: `${siteUrl}/faq`,
      name: siteFaqTitle,
      description: siteFaqDesc,
      inLanguage: 'en',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
      primaryImageOfPage: buildImageObjectSchema({
        url: defaultLogo,
        alt: 'NexGen Council Official FAQ — Membership, Programs & Donations',
        caption: siteFaqDesc,
        pageUrl: `${siteUrl}/faq`,
        orgName,
        representativeOfPage: true
      })
    };

    const liveFaqs = db.getFaqs(true);
    const fullFaqSchema = liveFaqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: liveFaqs.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer
            }
          }))
        }
      : null;

    return {
      title: siteFaqTitle,
      description: siteFaqDesc,
      canonicalUrl: `${siteUrl}/faq`,
      ogType: 'website',
      ogImage: defaultLogo,
      ogImageAlt: 'NexGen Council Official FAQ — Membership, Programs & Donations',
      keywords: [
        ...CORE_NEXGEN_KEYWORDS,
        'NexGen Council FAQ',
        'NexGen Women Empowerment FAQ',
        'how to join NexGen Council',
        'NexGen volunteer registration',
        'NexGen Member ID card download',
        'track NexGen application',
        '30-Day Leadership Series FAQ',
        'NexGen Council donation accounts',
        'NexGen Pakistan Sialkot NGO',
        'youth leadership mentorship FAQ'
      ],
      noscriptImages: [
        {
          url: `${siteUrl}/banner.png`,
          alt: 'NexGen Council Official Frequently Asked Questions Banner',
          title: 'NexGen Council FAQ'
        }
      ],
      jsonLd: [
        orgSchema,
        faqWebPageSchema,
        ...(fullFaqSchema ? [fullFaqSchema] : []),
        createBreadcrumbs([
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Frequently Asked Questions', url: `${siteUrl}/faq` }
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
  const teamMembers = typeof db.getTeam === 'function' ? db.getTeam(true) : [];
  const publishedPrograms = typeof db.getPrograms === 'function' ? db.getPrograms(true) : [];
  const visibleEvents = (typeof db.getEvents === 'function' ? db.getEvents() : []).filter(e => e.status !== 'Draft');
  const publishedNews = typeof db.getNews === 'function' ? db.getNews(true) : [];

  type SitemapImage = { url: string; title?: string; caption?: string };

  // Helper for image sitemap node (strictly excludes invalid/data URIs and deduplicates cleanly)
  const makeImageNodes = (images?: SitemapImage[]): string => {
    if (!images || images.length === 0) return '';
    const seen = new Set<string>();
    const chunks: string[] = [];

    for (const img of images) {
      const fullUrl = resolvePublicImageUrl(img.url, siteUrl, { allowDataUrl: false });
      if (!fullUrl || seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      let node = `\n    <image:image>\n      <image:loc>${escapeXml(fullUrl)}</image:loc>`;
      if (img.title) node += `\n      <image:title>${escapeXml(img.title)}</image:title>`;
      if (img.caption) node += `\n      <image:caption>${escapeXml(img.caption)}</image:caption>`;
      node += `\n    </image:image>`;
      chunks.push(node);
    }

    return chunks.join('');
  };

  // Static public routes with priorities and comprehensive images for Google Image Search
  const staticRoutes: Array<{
    url: string;
    priority: string;
    changefreq: string;
    lastmod: string;
    images?: SitemapImage[];
  }> = [
    {
      url: `${siteUrl}/`,
      priority: '1.0',
      changefreq: 'daily',
      lastmod: currentDate,
      images: [
        {
          url: '/assets/aistudio/NexGen_Poster_190b79d4.png',
          title: 'NexGen Council Official Showcase Poster',
          caption: 'NexGen Women Empowerment & Youth Leadership Council Official Showcase Poster'
        },
        {
          url: '/logo.png',
          title: 'NexGen Council Official Logo',
          caption: 'Official crest and insignia of NexGen Women Empowerment & Youth Leadership Council'
        },
        {
          url: '/banner.png',
          title: 'NexGen Women Empowerment & Youth Leadership Banner',
          caption: 'Empowering Women. Inspiring Youth. Transforming Communities.'
        },
        ...publishedPrograms.slice(0, 6).map(p => ({
          url: p.coverImage,
          title: buildAutoImageAlt({ type: 'program', customAlt: p.imageAlt, title: p.title, category: p.category }),
          caption: buildAutoImageCaption({ type: 'program', customAlt: p.imageAlt, title: p.title, category: p.category, summary: p.shortDescription })
        })),
        ...teamMembers.slice(0, 6).map(m => ({
          url: m.image,
          title: buildAutoImageAlt({ type: 'team', customAlt: m.imageAlt, name: m.name, role: m.position, department: m.department }),
          caption: buildAutoImageCaption({ type: 'team', customAlt: m.imageAlt, name: m.name, role: m.position, department: m.department, caption: m.bio })
        })),
        ...publishedNews.filter(n => Boolean((n.coverImage || '').trim())).slice(0, 4).map(n => ({
          url: n.coverImage || '',
          title: buildAutoImageAlt({ type: 'news', customAlt: n.imageAlt, title: n.title, category: n.category }),
          caption: buildAutoImageCaption({ type: 'news', customAlt: n.imageAlt, title: n.title, category: n.category, summary: n.summary })
        }))
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
        },
        {
          url: '/logo.png',
          title: 'NexGen Council Official Crest',
          caption: 'Institutional emblem of NexGen Women Empowerment & Youth Leadership Council'
        }
      ]
    },
    {
      url: `${siteUrl}/programs`,
      priority: '0.9',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: publishedPrograms.map(p => ({
        url: p.coverImage,
        title: buildAutoImageAlt({ type: 'program', customAlt: p.imageAlt, title: p.title, category: p.category }),
        caption: buildAutoImageCaption({ type: 'program', customAlt: p.imageAlt, title: p.title, category: p.category, summary: p.shortDescription })
      }))
    },
    {
      url: `${siteUrl}/events`,
      priority: '0.9',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: visibleEvents.map(e => ({
        url: e.coverImage || e.image || '',
        title: buildAutoImageAlt({ type: 'event', customAlt: e.imageAlt, title: e.title, category: e.category, location: e.location }),
        caption: buildAutoImageCaption({ type: 'event', customAlt: e.imageAlt, title: e.title, category: e.category, location: e.location, summary: e.description })
      }))
    },
    {
      url: `${siteUrl}/news`,
      priority: '0.9',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: publishedNews
        .filter(n => Boolean((n.coverImage || '').trim()))
        .map(n => ({
          url: n.coverImage || '',
          title: buildAutoImageAlt({ type: 'news', customAlt: n.imageAlt, title: n.title, category: n.category }),
          caption: buildAutoImageCaption({ type: 'news', customAlt: n.imageAlt, title: n.title, category: n.category, summary: n.summary })
        }))
    },
    {
      url: `${siteUrl}/volunteer`,
      priority: '0.9',
      changefreq: 'monthly',
      lastmod: currentDate,
      images: [
        {
          url: '/banner.png',
          title: 'Volunteer With NexGen Women Empowerment & Youth Leadership Council',
          caption: 'Official NexGen Council volunteer and fellowship registration portal'
        }
      ]
    },
    {
      url: `${siteUrl}/track`,
      priority: '0.5',
      changefreq: 'monthly',
      lastmod: currentDate,
      images: [
        {
          url: '/logo.png',
          title: 'NexGen Council Application Status Tracker',
          caption: 'Track your NexGen Council volunteer enrollment and Member ID card status'
        }
      ]
    },
    {
      url: `${siteUrl}/team`,
      priority: '0.7',
      changefreq: 'monthly',
      lastmod: currentDate,
      images: teamMembers.map(m => ({
        url: m.image || '/logo.png',
        title: buildAutoImageAlt({ type: 'team', customAlt: m.imageAlt, name: m.name, role: m.position, department: m.department }),
        caption: buildAutoImageCaption({ type: 'team', customAlt: m.imageAlt, name: m.name, role: m.position, department: m.department, caption: m.bio })
      }))
    },
    {
      url: `${siteUrl}/gallery`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: galleryItems.map(g => ({
        url: g.imageUrl,
        title: buildAutoImageAlt({ type: 'gallery', customAlt: g.imageAlt, title: g.title, category: g.category, caption: g.caption }),
        caption: buildAutoImageCaption({ type: 'gallery', customAlt: g.imageAlt, title: g.title, category: g.category, caption: g.caption })
      }))
    },
    {
      url: `${siteUrl}/contact`,
      priority: '0.8',
      changefreq: 'monthly',
      lastmod: currentDate,
      images: [
        {
          url: '/banner.png',
          title: 'Contact NexGen Council Secretariat',
          caption: 'Reach the NexGen Council central secretariat for institutional partnerships and inquiries'
        }
      ]
    },
    {
      url: `${siteUrl}/donate`,
      priority: '0.9',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: [
        {
          url: '/assets/aistudio/2535e6a6-f29c-44fd-8f0c-05946ee38cac_8942ae05.jpg',
          title: 'NexGen Council Official Donation Drive — Your Donation Can Change Lives',
          caption: 'Official NexGen Council donation appeal across Education, Healthcare, Community Support, and Women & Youth Empowerment'
        },
        {
          url: '/assets/donation-qr-easypaisa.png',
          title: 'Scan to Donate Easypaisa Raast QR Code — NexGen Council Merchant Till 992191268',
          caption: 'Official Easypaisa Digital Bank & Raast Merchant QR code for NexGen Council donations'
        },
        {
          url: '/assets/aistudio/WhatsApp_Image_2026-11-25_at_9.04.33_PM_ae4e7388.jpeg',
          title: 'Official Easypaisa & Raast QR Payment Card — Merchant Till 992191268',
          caption: 'Official Easypaisa & Raast merchant payment card for verified NexGen Council contributions'
        }
      ]
    },
    {
      url: `${siteUrl}/faq`,
      priority: '0.9',
      changefreq: 'weekly',
      lastmod: currentDate,
      images: [
        {
          url: '/banner.png',
          title: 'NexGen Council Frequently Asked Questions',
          caption: 'Official answers about NexGen Council membership, programs, Member ID cards, and donations'
        }
      ]
    }
  ];

  // Dynamic Programs
  const dynamicPrograms = publishedPrograms.map(p => ({
    url: `${siteUrl}/programs/${p.slug}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: p.createdAt ? p.createdAt.split('T')[0] : currentDate,
    images: p.coverImage
      ? [
          {
            url: p.coverImage,
            title: buildAutoImageAlt({ type: 'program', customAlt: p.imageAlt, title: p.title, category: p.category }),
            caption: buildAutoImageCaption({ type: 'program', customAlt: p.imageAlt, title: p.title, category: p.category, summary: p.shortDescription })
          }
        ]
      : []
  }));

  // Dynamic Events
  const dynamicEvents = visibleEvents.map(e => {
    const rawImg = (e.coverImage || e.image || '').trim();
    return {
      url: `${siteUrl}/events/${e.slug || e.id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: (e.createdAt || e.date) ? (e.createdAt || e.date).split('T')[0] : currentDate,
      images: rawImg
        ? [
            {
              url: rawImg,
              title: buildAutoImageAlt({ type: 'event', customAlt: e.imageAlt, title: e.title, category: e.category, location: e.location }),
              caption: buildAutoImageCaption({ type: 'event', customAlt: e.imageAlt, title: e.title, category: e.category, location: e.location, summary: e.description })
            }
          ]
        : []
    };
  });

  // Dynamic News
  const dynamicNews = publishedNews.map(n => ({
    url: `${siteUrl}/news/${n.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
    lastmod: n.publishedAt ? n.publishedAt.split('T')[0] : currentDate,
    images: (n.coverImage || '').trim()
      ? [
          {
            url: n.coverImage || '',
            title: buildAutoImageAlt({ type: 'news', customAlt: n.imageAlt, title: n.title, category: n.category }),
            caption: buildAutoImageCaption({ type: 'news', customAlt: n.imageAlt, title: n.title, category: n.category, summary: n.summary })
          }
        ]
      : []
  }));

  const allUrls = [...staticRoutes, ...dynamicPrograms, ...dynamicEvents, ...dynamicNews];

  const xmlEntries = allUrls
    .map(item => {
      const imgXml = makeImageNodes(item.images);
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

User-agent: Googlebot-Image
Allow: /
Allow: /uploads/
Allow: /assets/
Allow: /*.jpg
Allow: /*.jpeg
Allow: /*.png
Allow: /*.webp
Allow: /*.svg
Allow: /*.gif
Disallow: /admin
Disallow: /admin/*
Disallow: /meeting
Disallow: /meeting/*
Disallow: /room
Disallow: /room/*
Disallow: /meet
Disallow: /meet/*
Disallow: /api/
Disallow: /data/

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
Allow: /donate
Allow: /faq
Allow: /faqs
Allow: /track
Allow: /assets/
Allow: /uploads/
Allow: /*.jpg
Allow: /*.jpeg
Allow: /*.png
Allow: /*.webp
Allow: /*.svg
Allow: /*.gif

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
  const safeOgImageAlt = escapeHtml((meta.ogImageAlt || '').trim() || meta.title);
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
    `<meta property="og:image:alt" content="${safeOgImageAlt}" />`,
    `<meta property="og:site_name" content="NexGen Council" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeOgImage}" />`,
    `<meta name="twitter:image:alt" content="${safeOgImageAlt}" />`
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
  // Provide semantic noscript fallback + image figures for Googlebot-Image & non-JS crawlers.
  if (result.includes('<div id="root"></div>')) {
    const cleanBase = escapeHtml(siteUrl.replace(/\/+$/, ''));
    const noscriptImageHtml = (meta.noscriptImages || [])
      .map(img => {
        const safeSrc = escapeHtml(img.url);
        const safeImgAlt = escapeHtml(img.alt);
        const safeImgTitle = escapeHtml(img.title || img.alt);
        return `<figure><img src="${safeSrc}" alt="${safeImgAlt}" title="${safeImgTitle}" loading="lazy" /><figcaption>${safeImgAlt}</figcaption></figure>`;
      })
      .join('');

    const noscriptSemantic = !meta.noindex
      ? `\n    <noscript><main style="font-family:system-ui,sans-serif;max-width:960px;margin:0 auto;padding:24px;"><h1>${safeTitle}</h1><p>${safeDesc}</p><nav aria-label="NexGen Council Navigation"><a href="${cleanBase}/">Home</a> | <a href="${cleanBase}/about">About NexGen</a> | <a href="${cleanBase}/programs">Leadership Programs</a> | <a href="${cleanBase}/events">Events</a> | <a href="${cleanBase}/news">News</a> | <a href="${cleanBase}/team">Executive Leadership</a> | <a href="${cleanBase}/gallery">Gallery</a> | <a href="${cleanBase}/donate">Donate</a> | <a href="${cleanBase}/faq">FAQ</a> | <a href="${cleanBase}/volunteer">Volunteer</a> | <a href="${cleanBase}/contact">Contact</a></nav>${noscriptImageHtml ? `<section aria-label="Page Images">${noscriptImageHtml}</section>` : ''}</main></noscript>`
      : '';

    if (noscriptSemantic) {
      result = result.replace('<div id="root"></div>', `<div id="root"></div>${noscriptSemantic}`);
    }
  }

  return result;
}
