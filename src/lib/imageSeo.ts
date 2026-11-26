export type AutoImageEntityType = 'program' | 'event' | 'news' | 'team' | 'gallery' | 'custom';

export interface AutoImageAltInput {
  type: AutoImageEntityType;
  customAlt?: string | null;
  title?: string | null;
  name?: string | null;
  category?: string | null;
  role?: string | null;
  department?: string | null;
  location?: string | null;
  date?: string | null;
  caption?: string | null;
  summary?: string | null;
  organizationName?: string | null;
}

export interface ImageObjectSchemaInput {
  url: string;
  alt?: string;
  caption?: string;
  name?: string;
  pageUrl?: string;
  orgName?: string;
  width?: number;
  height?: number;
  representativeOfPage?: boolean;
}

const DEFAULT_ORG_LABEL = 'NexGen Council';
const FULL_ORG_LABEL = 'NexGen Women Empowerment & Youth Leadership Council';

function collapseWhitespace(value?: string | null): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function truncateSeoText(text: string, maxLength = 155): string {
  const clean = collapseWhitespace(text);
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength - 3).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const boundary = lastSpace > Math.floor(maxLength * 0.65) ? sliced.slice(0, lastSpace) : sliced;
  return `${boundary}...`;
}

/**
 * Resolves relative or absolute image URLs into clean absolute HTTPS/HTTP URLs
 * suitable for Google Image Search, sitemaps, OpenGraph, and Schema.org ImageObject.
 */
export function resolvePublicImageUrl(
  rawUrl?: string | null,
  siteUrl = 'https://nexgencouncil.bond',
  options?: { allowDataUrl?: boolean; fallbackPath?: string }
): string | null {
  const allowDataUrl = options?.allowDataUrl ?? false;
  const trimmed = collapseWhitespace(rawUrl);

  if (!trimmed) {
    if (options?.fallbackPath) {
      return resolvePublicImageUrl(options.fallbackPath, siteUrl, { allowDataUrl });
    }
    return null;
  }

  if (/^data:/i.test(trimmed)) {
    return allowDataUrl ? trimmed : null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalizedOrigin = siteUrl.replace(/\/+$/, '');
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${normalizedOrigin}${normalizedPath}`;
}

/**
 * Generates clean, descriptive, Google-Image-Search-optimized alt text automatically,
 * while always respecting any explicit admin/editor customAlt override.
 */
export function buildAutoImageAlt(input: AutoImageAltInput): string {
  const explicit = collapseWhitespace(input.customAlt);
  if (explicit) {
    return truncateSeoText(explicit, 175);
  }

  const org = collapseWhitespace(input.organizationName) || DEFAULT_ORG_LABEL;
  const title = collapseWhitespace(input.title || input.name);
  const category = collapseWhitespace(input.category);
  const role = collapseWhitespace(input.role);
  const department = collapseWhitespace(input.department);
  const location = collapseWhitespace(input.location);
  const caption = collapseWhitespace(input.caption);

  switch (input.type) {
    case 'program': {
      const parts = [
        title || 'Youth & Women Leadership Program',
        category ? `${category} Initiative` : 'Leadership Cohort',
        `${org} (${FULL_ORG_LABEL})`
      ].filter(Boolean);
      return truncateSeoText(parts.join(' — '), 155);
    }
    case 'event': {
      const details = [category || 'Event', location && location !== 'To Be Announced (TBA)' ? location : ''].filter(Boolean).join(', ');
      const parts = [
        title || 'NexGen Council Event',
        details,
        org
      ].filter(Boolean);
      return truncateSeoText(parts.join(' — '), 155);
    }
    case 'news': {
      const parts = [
        title || 'Official Dispatch',
        category ? `${category} Dispatch` : 'News & Research',
        org
      ].filter(Boolean);
      return truncateSeoText(parts.join(' — '), 155);
    }
    case 'team': {
      const roleBits = [role, department].filter(Boolean).join(', ');
      const parts = [
        title || 'Council Leader',
        roleBits || 'Executive Leadership',
        org
      ].filter(Boolean);
      return truncateSeoText(parts.join(' — '), 155);
    }
    case 'gallery': {
      const parts = [
        title || 'Field Activity Photo',
        caption || (category ? `${category} Highlight` : 'Community Impact Highlight'),
        org
      ].filter(Boolean);
      return truncateSeoText(parts.join(' — '), 155);
    }
    case 'custom':
    default: {
      const parts = [title, caption, org].filter(Boolean);
      return truncateSeoText(parts.join(' — ') || FULL_ORG_LABEL, 155);
    }
  }
}

/**
 * Generates descriptive image captions for <figcaption>, <image:caption>, and ImageObject.caption.
 */
export function buildAutoImageCaption(input: AutoImageAltInput): string {
  const explicitCaption = collapseWhitespace(input.caption);
  const summary = collapseWhitespace(input.summary);
  const autoAlt = buildAutoImageAlt(input);

  if (explicitCaption) {
    return truncateSeoText(`${explicitCaption} — ${DEFAULT_ORG_LABEL}`, 220);
  }
  if (summary) {
    return truncateSeoText(`${summary} (${DEFAULT_ORG_LABEL})`, 220);
  }
  return truncateSeoText(autoAlt, 220);
}

/**
 * Builds a complete Schema.org ImageObject node for Google Image Search rich attribution.
 */
export function buildImageObjectSchema(input: ImageObjectSchemaInput) {
  const orgName = collapseWhitespace(input.orgName) || FULL_ORG_LABEL;
  const altText = collapseWhitespace(input.alt || input.name) || orgName;
  const captionText = collapseWhitespace(input.caption || altText);

  return {
    '@type': 'ImageObject',
    '@id': input.url,
    url: input.url,
    contentUrl: input.url,
    name: collapseWhitespace(input.name) || altText,
    caption: captionText,
    description: captionText,
    ...(typeof input.width === 'number' ? { width: input.width } : {}),
    ...(typeof input.height === 'number' ? { height: input.height } : {}),
    ...(input.representativeOfPage ? { representativeOfPage: true } : {}),
    creditText: orgName,
    copyrightNotice: `© ${new Date().getFullYear()} ${orgName}`,
    creator: {
      '@type': 'Organization',
      name: orgName
    },
    ...(input.pageUrl ? { acquireLicensePage: input.pageUrl } : {})
  };
}
