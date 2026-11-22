import { Resend } from 'resend';
import type { EmailButton, EmailImage } from '../src/types.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailInput {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  message?: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
  logoUrl?: string;
  images?: EmailImage[];
  buttons?: EmailButton[];
  siteUrl?: string;
}

export interface SendEmailResult {
  success: boolean;
  data?: {
    id: string;
    fromName: string;
    fromEmail: string;
    recipients: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    sentAt: string;
  };
  error?: string;
  statusCode?: number;
  attemptedDispatch?: boolean;
  resolvedMeta?: {
    fromName: string;
    fromEmail: string;
    recipients: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    replyTo?: string;
    message: string;
    html?: string;
    logoUrl?: string;
    images?: EmailImage[];
    buttons?: EmailButton[];
  };
}

export function sanitizeSenderName(name?: string): string {
  const cleaned = String(name || '')
    .replace(/[\r\n<>"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'NexGen Council';
}

export function isValidEmailAddress(email?: string): boolean {
  return EMAIL_REGEX.test(String(email || '').trim().toLowerCase());
}

export function isValidImageUrl(rawUrl?: string): boolean {
  const value = String(rawUrl || '').trim();
  if (!value) return false;
  if (value.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function resolveEmailImageUrl(rawUrl?: string, siteUrl = 'https://nexgencouncil.bond'): string | undefined {
  const value = String(rawUrl || '').trim();
  if (!value) return undefined;
  const base = String(siteUrl || 'https://nexgencouncil.bond').trim().replace(/\/+$/, '');

  if (value.startsWith('/')) {
    return `${base}${value}`;
  }
  if (value.startsWith('uploads/')) {
    return `${base}/${value}`;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeEmailImages(
  images: unknown,
  siteUrl = 'https://nexgencouncil.bond'
): { valid: EmailImage[]; invalidCount: number } {
  if (!Array.isArray(images)) return { valid: [], invalidCount: 0 };
  const valid: EmailImage[] = [];
  let invalidCount = 0;

  for (let i = 0; i < images.length; i++) {
    const item = images[i] as Partial<EmailImage> | null;
    if (!item || typeof item.url !== 'string') {
      invalidCount++;
      continue;
    }
    const resolved = resolveEmailImageUrl(item.url, siteUrl);
    if (!resolved) {
      invalidCount++;
      continue;
    }
    valid.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `img_${i + 1}`,
      url: resolved,
      alt: typeof item.alt === 'string' ? item.alt.trim().slice(0, 140) : '',
      caption: typeof item.caption === 'string' ? item.caption.trim().slice(0, 240) : '',
      placement: item.placement === 'top' ? 'top' : 'bottom'
    });
  }

  return { valid, invalidCount };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_EMAIL_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'hr',
  'font'
]);

const VOID_EMAIL_TAGS = new Set(['br', 'hr']);

const ALLOWED_CSS_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'line-height',
  'margin',
  'margin-top',
  'margin-bottom',
  'padding',
  'padding-left',
  'border-left'
]);

const FONT_SIZE_MAP: Record<string, string> = {
  '1': '11px',
  '2': '13px',
  '3': '15px',
  '4': '18px',
  '5': '22px',
  '6': '26px',
  '7': '32px'
};

function sanitizeInlineStyle(rawStyle: string): string {
  const declarations = rawStyle
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
  const safeParts: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!ALLOWED_CSS_PROPERTIES.has(prop) || !val) continue;
    const lowerVal = val.toLowerCase();
    if (
      lowerVal.includes('javascript:') ||
      lowerVal.includes('expression(') ||
      lowerVal.includes('url(') ||
      /[<>]/.test(val)
    ) {
      continue;
    }
    safeParts.push(`${prop}: ${val}`);
  }

  return safeParts.join('; ');
}

function sanitizeSafeLinkUrl(rawHref: string): string | null {
  const trimmed = rawHref
    .replace(/&amp;/gi, '&')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    ) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function sanitizeEmailBodyHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  // Remove dangerous elements & comments completely (including contents)
  let cleaned = rawHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|textarea|input|button|select|meta|link|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|textarea|input|button|select|meta|link|base)\b[^>]*\/?>/gi, '');

  // Filter every remaining HTML tag against allowlist
  cleaned = cleaned.replace(/<\/?([a-zA-Z0-9:-]+)(\s[^>]*?)?\/?>/g, (fullMatch, rawTagName: string, rawAttrs = '') => {
    const tag = rawTagName.toLowerCase();
    if (!ALLOWED_EMAIL_TAGS.has(tag)) {
      return '';
    }

    const isClosing = fullMatch.startsWith('</');
    if (isClosing) {
      return VOID_EMAIL_TAGS.has(tag) ? '' : `</${tag}>`;
    }

    if (VOID_EMAIL_TAGS.has(tag)) {
      return tag === 'hr'
        ? '<hr style="border: 0; border-top: 1px solid #334155; margin: 18px 0;" />'
        : '<br />';
    }

    const safeAttrs: string[] = [];
    const attrMap: Record<string, string> = {};

    // Parse attributes safely
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = match[1].toLowerCase();
      const attrVal = (match[2] ?? match[3] ?? match[4] ?? '').trim();
      if (attrName.startsWith('on')) continue;
      attrMap[attrName] = attrVal;
    }

    const inlineStyles: string[] = [];
    if (attrMap.style) {
      const safeCss = sanitizeInlineStyle(attrMap.style);
      if (safeCss) inlineStyles.push(safeCss);
    }

    if (tag === 'a') {
      const safeHref = attrMap.href ? sanitizeSafeLinkUrl(attrMap.href) : null;
      if (safeHref) {
        safeAttrs.push(`href="${escapeHtml(safeHref)}"`);
        safeAttrs.push('target="_blank"');
        safeAttrs.push('rel="noopener noreferrer"');
      }
    }

    if (tag === 'font') {
      if (attrMap.color && /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$|^rgb\([\d\s,]+\)$/i.test(attrMap.color)) {
        inlineStyles.push(`color: ${attrMap.color}`);
      }
      if (attrMap.face) {
        const cleanFace = attrMap.face.replace(/[^a-zA-Z0-9,\s\-"]/g, '').trim();
        if (cleanFace) inlineStyles.push(`font-family: ${cleanFace}`);
      }
      if (attrMap.size && FONT_SIZE_MAP[attrMap.size]) {
        inlineStyles.push(`font-size: ${FONT_SIZE_MAP[attrMap.size]}`);
      }
    }

    if ((tag === 'p' || tag === 'div' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') && attrMap.align) {
      const cleanAlign = attrMap.align.toLowerCase();
      if (['left', 'center', 'right', 'justify'].includes(cleanAlign)) {
        inlineStyles.push(`text-align: ${cleanAlign}`);
      }
    }

    if (inlineStyles.length > 0) {
      safeAttrs.push(`style="${escapeHtml(inlineStyles.join('; '))}"`);
    }

    return safeAttrs.length > 0 ? `<${tag} ${safeAttrs.join(' ')}>` : `<${tag}>`;
  });

  return cleaned.trim();
}

function mergeDefaultTagStyle(existingAttrs: string | undefined, defaultCss: string): string {
  const attrs = existingAttrs || '';
  const styleMatch = attrs.match(/\sstyle=(["'])([\s\S]*?)\1/i);
  if (styleMatch) {
    const existingCss = styleMatch[2].trim();
    const combined = `${defaultCss}; ${existingCss}`;
    return attrs.replace(styleMatch[0], ` style="${combined}"`);
  }
  return `${attrs} style="${defaultCss}"`;
}

export function enhanceEmailHtmlForClients(sanitizedHtml: string): string {
  if (!sanitizedHtml) return '';

  return sanitizedHtml
    .replace(/<h1(\s[^>]*)?>/gi, (_m, attrs) => `<h1${mergeDefaultTagStyle(attrs, 'margin: 0 0 14px 0; color: #ffffff; font-size: 22px; font-weight: 700; line-height: 1.3')}>`)
    .replace(/<h2(\s[^>]*)?>/gi, (_m, attrs) => `<h2${mergeDefaultTagStyle(attrs, 'margin: 18px 0 10px 0; color: #ffffff; font-size: 18px; font-weight: 700; line-height: 1.35')}>`)
    .replace(/<h3(\s[^>]*)?>/gi, (_m, attrs) => `<h3${mergeDefaultTagStyle(attrs, 'margin: 16px 0 8px 0; color: #fbbf24; font-size: 16px; font-weight: 700; line-height: 1.4')}>`)
    .replace(/<h4(\s[^>]*)?>/gi, (_m, attrs) => `<h4${mergeDefaultTagStyle(attrs, 'margin: 14px 0 6px 0; color: #f1f5f9; font-size: 15px; font-weight: 700; line-height: 1.4')}>`)
    .replace(/<p(\s[^>]*)?>/gi, (_m, attrs) => `<p${mergeDefaultTagStyle(attrs, 'margin: 0 0 14px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65')}>`)
    .replace(/<div(\s[^>]*)?>/gi, (_m, attrs) => `<div${mergeDefaultTagStyle(attrs, 'margin: 0 0 8px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65')}>`)
    .replace(/<ul(\s[^>]*)?>/gi, (_m, attrs) => `<ul${mergeDefaultTagStyle(attrs, 'margin: 0 0 16px 0; padding-left: 22px; color: #e2e8f0; font-size: 15px; line-height: 1.65')}>`)
    .replace(/<ol(\s[^>]*)?>/gi, (_m, attrs) => `<ol${mergeDefaultTagStyle(attrs, 'margin: 0 0 16px 0; padding-left: 22px; color: #e2e8f0; font-size: 15px; line-height: 1.65')}>`)
    .replace(/<li(\s[^>]*)?>/gi, (_m, attrs) => `<li${mergeDefaultTagStyle(attrs, 'margin: 0 0 6px 0; color: #e2e8f0')}>`)
    .replace(/<blockquote(\s[^>]*)?>/gi, (_m, attrs) => `<blockquote${mergeDefaultTagStyle(attrs, 'margin: 14px 0 16px 0; padding: 10px 16px; border-left: 3px solid #f59e0b; background-color: #1e293b; color: #f8fafc; font-style: italic; border-radius: 6px')}>`)
    .replace(/<a(\s[^>]*)?>/gi, (_m, attrs) => `<a${mergeDefaultTagStyle(attrs, 'color: #fbbf24; text-decoration: underline')}>`);
}

export function extractPlainTextFromHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|blockquote|li|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatMessageToHtml(message: string): string {
  const paragraphs = message
    .trim()
    .split(/\n{2,}/)
    .map(p => {
      const safeLines = escapeHtml(p).replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 16px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65;">${safeLines}</p>`;
    });

  return paragraphs.join('\n');
}

function renderEmailImagesHtml(images: EmailImage[], placement: 'top' | 'bottom'): string {
  const matching = images.filter(img => (img.placement || 'bottom') === placement);
  if (matching.length === 0) return '';

  const blocks = matching
    .map(img => {
      const safeUrl = escapeHtml(img.url);
      const safeAlt = escapeHtml(img.alt || img.caption || 'NexGen Council Visual');
      const safeCaption = img.caption ? escapeHtml(img.caption) : '';
      return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: ${placement === 'top' ? '18px 0 4px 0' : '16px 0 0 0'}; background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden;">
          <tr>
            <td align="center" style="padding: 0;">
              <img src="${safeUrl}" alt="${safeAlt}" style="display: block; width: 100%; max-width: 556px; height: auto; border: 0; outline: none; text-decoration: none;" />
            </td>
          </tr>
          ${
            safeCaption
              ? `<tr>
                  <td style="padding: 10px 14px; font-size: 12px; color: #94a3b8; border-top: 1px solid #1e293b; text-align: center;">
                    ${safeCaption}
                  </td>
                </tr>`
              : ''
          }
        </table>`;
    })
    .join('\n');

  return blocks;
}

export function sanitizeEmailButtons(
  buttons: unknown,
  siteUrl = 'https://nexgencouncil.bond'
): { valid: EmailButton[]; invalidCount: number } {
  if (!Array.isArray(buttons)) return { valid: [], invalidCount: 0 };
  const base = String(siteUrl || 'https://nexgencouncil.bond').trim().replace(/\/+$/, '');
  const valid: EmailButton[] = [];
  let invalidCount = 0;

  for (let i = 0; i < buttons.length; i++) {
    const item = buttons[i] as Partial<EmailButton> | null;
    if (!item || typeof item.label !== 'string' || typeof item.url !== 'string') {
      invalidCount++;
      continue;
    }
    const cleanLabel = item.label.trim().slice(0, 80);
    const rawUrl = item.url.trim();
    const expandedUrl = rawUrl.startsWith('/') ? `${base}${rawUrl}` : rawUrl;
    const safeUrl = sanitizeSafeLinkUrl(expandedUrl);

    if (!cleanLabel || !safeUrl) {
      invalidCount++;
      continue;
    }

    const style: EmailButton['style'] =
      item.style === 'primary' || item.style === 'outline' ? item.style : 'amber';
    const align: EmailButton['align'] =
      item.align === 'left' || item.align === 'right' ? item.align : 'center';
    const placement: EmailButton['placement'] =
      item.placement === 'top' || item.placement === 'inline' ? item.placement : 'bottom';
    const safeId =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim().replace(/[^a-zA-Z0-9_-]/g, '') || `btn_${i + 1}`
        : `btn_${i + 1}`;

    valid.push({
      id: safeId,
      label: cleanLabel,
      url: safeUrl,
      style,
      align,
      placement
    });
  }

  return { valid, invalidCount };
}

function renderSingleEmailButtonHtml(btn: EmailButton): string {
  const safeUrl = escapeHtml(btn.url);
  const safeLabel = escapeHtml(btn.label);
  const align = btn.align || 'center';

  let tdStyle = 'background-color: #f59e0b; border-radius: 10px;';
  let aStyle =
    'display: inline-block; padding: 12px 26px; font-size: 14px; font-weight: 700; color: #0f172a; text-decoration: none; border-radius: 10px; mso-padding-alt: 0;';

  if (btn.style === 'primary') {
    tdStyle = 'background-color: #4f46e5; border-radius: 10px;';
    aStyle =
      'display: inline-block; padding: 12px 26px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; mso-padding-alt: 0;';
  } else if (btn.style === 'outline') {
    tdStyle = 'background-color: transparent; border: 2px solid #f59e0b; border-radius: 10px;';
    aStyle =
      'display: inline-block; padding: 10px 24px; font-size: 14px; font-weight: 700; color: #fbbf24; text-decoration: none; border-radius: 10px; mso-padding-alt: 0;';
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 16px 0 10px 0;">
      <tr>
        <td align="${align}">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="center" style="${tdStyle}">
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="${aStyle}">
                  ${safeLabel}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function renderEmailButtonsHtml(buttons: EmailButton[]): string {
  if (!buttons || buttons.length === 0) return '';
  return buttons.map(renderSingleEmailButtonHtml).join('\n');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyButtonPlacements(
  bodyHtml: string,
  allButtons: EmailButton[]
): { topButtonsHtml: string; processedBodyHtml: string; bottomButtonsHtml: string } {
  const topButtons: EmailButton[] = [];
  const bottomButtons: EmailButton[] = [];
  let processedBodyHtml = bodyHtml || '';

  for (const btn of allButtons) {
    const safeId = escapeRegExp(btn.id);
    const tokenPattern = new RegExp(`\\[\\[BUTTON:${safeId}\\]\\]`, 'g');
    const wrappedTokenPattern = new RegExp(
      `<(?:p|div)[^>]*>\\s*\\[\\[BUTTON:${safeId}\\]\\]\\s*(?:<br\\s*\\/?>\\s*)*<\\/(?:p|div)>`,
      'gi'
    );

    const hasInlineToken = tokenPattern.test(processedBodyHtml);
    tokenPattern.lastIndex = 0;

    if (btn.placement === 'inline' || hasInlineToken) {
      if (hasInlineToken) {
        const singleBtnHtml = renderSingleEmailButtonHtml(btn);
        processedBodyHtml = processedBodyHtml.replace(wrappedTokenPattern, singleBtnHtml);
        processedBodyHtml = processedBodyHtml.replace(tokenPattern, singleBtnHtml);
      } else {
        // Fallback if inline was chosen but marker was removed from message text
        bottomButtons.push(btn);
      }
    } else if (btn.placement === 'top') {
      topButtons.push(btn);
    } else {
      bottomButtons.push(btn);
    }
  }

  // Strip any leftover orphan button markers whose buttons were deleted
  processedBodyHtml = processedBodyHtml
    .replace(/<(?:p|div)[^>]*>\s*\[\[BUTTON:[a-zA-Z0-9_-]+\]\]\s*(?:<br\s*\/?>\s*)*<\/(?:p|div)>/gi, '')
    .replace(/\[\[BUTTON:[a-zA-Z0-9_-]+\]\]/g, '');

  return {
    topButtonsHtml: renderEmailButtonsHtml(topButtons),
    processedBodyHtml,
    bottomButtonsHtml: renderEmailButtonsHtml(bottomButtons)
  };
}

export function buildNexGenEmailTemplate(
  subject: string,
  bodyHtml: string,
  senderName = 'NexGen Council',
  options?: {
    logoUrl?: string;
    images?: EmailImage[];
    buttons?: EmailButton[];
    siteUrl?: string;
  }
): string {
  const safeSubject = escapeHtml(subject);
  const safeSenderName = escapeHtml(sanitizeSenderName(senderName));
  const year = new Date().getFullYear();
  const siteUrl = options?.siteUrl || 'https://nexgencouncil.bond';
  const resolvedLogo = resolveEmailImageUrl(options?.logoUrl, siteUrl);
  const safeLogoUrl = resolvedLogo ? escapeHtml(resolvedLogo) : '';
  const allImages = Array.isArray(options?.images) ? options!.images : [];
  const allButtons = Array.isArray(options?.buttons) ? options!.buttons : [];
  const topImagesHtml = renderEmailImagesHtml(allImages, 'top');
  const { topButtonsHtml, processedBodyHtml, bottomButtonsHtml } = applyButtonPlacements(bodyHtml, allButtons);
  const bottomImagesHtml = renderEmailImagesHtml(allImages, 'bottom');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #020617; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); padding: 28px 32px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  ${
                    safeLogoUrl
                      ? `<td width="72" valign="middle" style="padding-right: 16px;">
                          <img src="${safeLogoUrl}" alt="${safeSenderName} Logo" width="60" height="60" style="display: block; width: 60px; height: 60px; object-fit: contain; border-radius: 12px; background-color: #020617; border: 1px solid #334155; padding: 4px;" />
                        </td>`
                      : ''
                  }
                  <td valign="middle">
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #fbbf24; margin-bottom: 6px;">
                      Official Communication
                    </div>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                      ${safeSenderName}
                    </div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                      Women Empowerment &amp; Youth Leadership Council
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Subject Banner -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; line-height: 1.35;">
                ${safeSubject}
              </h1>
              <div style="width: 48px; height: 3px; background-color: #f59e0b; border-radius: 999px; margin-top: 14px;"></div>
              ${topImagesHtml}
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 22px 32px 28px 32px; color: #e2e8f0; font-size: 15px; line-height: 1.65;">
              ${topButtonsHtml}
              ${processedBodyHtml}
              ${bottomButtonsHtml}
              ${bottomImagesHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #020617; padding: 22px 32px; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #cbd5e1;">
                ${safeSenderName} &bull; Executive Secretariat
              </p>
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748b;">
                Sent via <a href="${escapeHtml(siteUrl)}" style="color: #fbbf24; text-decoration: none;">nexgencouncil.bond</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                &copy; ${year} NexGen Women Empowerment &amp; Youth Leadership Council. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function parseRecipientList(to?: string | string[]): { valid: string[]; invalid: string[] } {
  if (!to) return { valid: [], invalid: [] };
  const rawItems = Array.isArray(to)
    ? to
    : String(to || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

  const unique = Array.from(new Set(rawItems.map(email => email.trim().toLowerCase()).filter(Boolean)));
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const email of unique) {
    if (EMAIL_REGEX.test(email)) {
      valid.push(email);
    } else {
      invalid.push(email);
    }
  }

  return { valid, invalid };
}

export async function sendCouncilEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const fromName = sanitizeSenderName(input.fromName);
  const fromEmail = (input.fromEmail || 'admin@nexgencouncil.bond').trim().toLowerCase();
  const siteUrl = (input.siteUrl || 'https://nexgencouncil.bond').trim().replace(/\/+$/, '');

  if (!EMAIL_REGEX.test(fromEmail)) {
    return {
      success: false,
      statusCode: 400,
      error: 'Sender email address must be a valid email (e.g. admin@nexgencouncil.bond).'
    };
  }

  const { valid: toRecipients, invalid: invalidTo } = parseRecipientList(input.to);
  const { valid: ccRecipients, invalid: invalidCc } = parseRecipientList(input.cc);
  const { valid: bccRecipients, invalid: invalidBcc } = parseRecipientList(input.bcc);

  if (invalidTo.length > 0) {
    return {
      success: false,
      statusCode: 400,
      error: `Invalid To email address(es): ${invalidTo.join(', ')}`
    };
  }
  if (invalidCc.length > 0) {
    return {
      success: false,
      statusCode: 400,
      error: `Invalid CC email address(es): ${invalidCc.join(', ')}`
    };
  }
  if (invalidBcc.length > 0) {
    return {
      success: false,
      statusCode: 400,
      error: `Invalid BCC email address(es): ${invalidBcc.join(', ')}`
    };
  }

  const totalRecipients = toRecipients.length + ccRecipients.length + bccRecipients.length;
  if (totalRecipients === 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'At least one valid recipient email address (To, CC, or BCC) is required.'
    };
  }

  if (totalRecipients > 50) {
    return {
      success: false,
      statusCode: 400,
      error: 'Maximum 50 total recipients (To + CC + BCC) allowed per email request.'
    };
  }

  const subject = String(input.subject || '').trim();
  if (!subject) {
    return {
      success: false,
      statusCode: 400,
      error: 'Email subject is required.'
    };
  }

  const rawLogoUrl = typeof input.logoUrl === 'string' ? input.logoUrl.trim() : '';
  if (rawLogoUrl && !isValidImageUrl(rawLogoUrl)) {
    return {
      success: false,
      statusCode: 400,
      error: 'Header logo URL must be a valid http(s) URL or uploaded image path.'
    };
  }
  const resolvedLogoUrl = rawLogoUrl ? resolveEmailImageUrl(rawLogoUrl, siteUrl) : undefined;

  const { valid: sanitizedImages, invalidCount } = sanitizeEmailImages(input.images, siteUrl);
  if (invalidCount > 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'One or more attached email image URLs are invalid. Use uploaded images or http(s) URLs.'
    };
  }
  if (sanitizedImages.length > 10) {
    return {
      success: false,
      statusCode: 400,
      error: 'Maximum 10 inline images allowed per email.'
    };
  }

  const { valid: sanitizedButtons, invalidCount: invalidButtonsCount } = sanitizeEmailButtons(input.buttons, siteUrl);
  if (invalidButtonsCount > 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'One or more email buttons have an empty label or invalid URL (use https://, http://, mailto:, or /path).'
    };
  }
  if (sanitizedButtons.length > 5) {
    return {
      success: false,
      statusCode: 400,
      error: 'Maximum 5 CTA buttons allowed per email.'
    };
  }

  const rawHtml = typeof input.html === 'string' && input.html.trim() ? input.html.trim() : '';
  const sanitizedHtml = rawHtml ? sanitizeEmailBodyHtml(rawHtml) : '';
  const rawMessageInput = typeof input.message === 'string' && input.message.trim() ? input.message.trim() : '';
  const derivedPlainText = rawMessageInput || extractPlainTextFromHtml(sanitizedHtml);

  if (!sanitizedHtml && !derivedPlainText && sanitizedImages.length === 0 && sanitizedButtons.length === 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'Email message body, formatted content, button, or at least one image is required.'
    };
  }

  const replyTo = typeof input.replyTo === 'string' && input.replyTo.trim() ? input.replyTo.trim() : undefined;
  if (replyTo && !EMAIL_REGEX.test(replyTo)) {
    return {
      success: false,
      statusCode: 400,
      error: 'Reply-To must be a valid email address.'
    };
  }

  const resolvedMeta = {
    fromName,
    fromEmail,
    recipients: toRecipients,
    cc: ccRecipients,
    bcc: bccRecipients,
    subject,
    replyTo,
    message: derivedPlainText || '[Formatted Content]',
    html: sanitizedHtml || undefined,
    logoUrl: resolvedLogoUrl,
    images: sanitizedImages,
    buttons: sanitizedButtons
  };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      statusCode: 500,
      attemptedDispatch: true,
      resolvedMeta,
      error: 'Email service is not configured. Missing RESEND_API_KEY on server.'
    };
  }

  const bodyHtml = sanitizedHtml
    ? enhanceEmailHtmlForClients(sanitizedHtml)
    : derivedPlainText
      ? formatMessageToHtml(derivedPlainText)
      : '';

  const fullHtml = buildNexGenEmailTemplate(subject, bodyHtml, fromName, {
    logoUrl: resolvedLogoUrl,
    images: sanitizedImages,
    buttons: sanitizedButtons,
    siteUrl
  });

  let plainWithInlineButtons = derivedPlainText;
  const nonInlineButtons: EmailButton[] = [];
  for (const btn of sanitizedButtons) {
    const marker = `[[BUTTON:${btn.id}]]`;
    if (plainWithInlineButtons.includes(marker)) {
      plainWithInlineButtons = plainWithInlineButtons.split(marker).join(`${btn.label}: ${btn.url}`);
    } else {
      nonInlineButtons.push(btn);
    }
  }
  plainWithInlineButtons = plainWithInlineButtons.replace(/\[\[BUTTON:[a-zA-Z0-9_-]+\]\]/g, '').trim();
  const buttonTextLines = nonInlineButtons.map(b => `${b.label}: ${b.url}`).join('\n');
  const fullPlainText = [plainWithInlineButtons, buttonTextLines].filter(Boolean).join('\n\n');

  // Resend API requires at least one address in `to`. If sending BCC/CC-only, fallback `to` to `[fromEmail]`
  const effectiveTo = toRecipients.length > 0 ? toRecipients : [fromEmail];

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: effectiveTo,
      ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
      ...(bccRecipients.length > 0 ? { bcc: bccRecipients } : {}),
      subject,
      html: fullHtml,
      ...(fullPlainText ? { text: fullPlainText } : {}),
      ...(replyTo ? { replyTo } : {})
    });

    if (error) {
      return {
        success: false,
        statusCode: 502,
        attemptedDispatch: true,
        resolvedMeta,
        error: error.message || 'Resend rejected the email request.'
      };
    }

    return {
      success: true,
      statusCode: 200,
      attemptedDispatch: true,
      resolvedMeta,
      data: {
        id: data?.id || `msg_${Date.now()}`,
        fromName,
        fromEmail,
        recipients: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        sentAt: new Date().toISOString()
      }
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      attemptedDispatch: true,
      resolvedMeta,
      error: err?.message || 'Unexpected error while dispatching email.'
    };
  }
}

export interface VolunteerApprovalEmailOptions {
  volunteerName: string;
  referenceCode: string;
  preferredRole?: string;
  city?: string;
  customNote?: string;
  includeWhatsappInvite?: boolean;
  whatsappGroupLink?: string;
  siteUrl?: string;
}

export function buildVolunteerApprovalEmail(opts: VolunteerApprovalEmailOptions): {
  subject: string;
  html: string;
  message: string;
  buttons: EmailButton[];
  hasValidWhatsappLink: boolean;
} {
  const rawName = String(opts.volunteerName || 'Changemaker').trim() || 'Changemaker';
  const firstName = rawName.split(/\s+/)[0] || rawName;
  const safeFullName = escapeHtml(rawName);
  const safeRef = escapeHtml(String(opts.referenceCode || 'NG-VOL').trim());
  const safeRole = escapeHtml(String(opts.preferredRole || 'Council Volunteer').trim());
  const safeCity = escapeHtml(String(opts.city || 'Community Chapter').trim());
  const safeCustomNote = opts.customNote && opts.customNote.trim()
    ? escapeHtml(opts.customNote.trim()).replace(/\n/g, '<br />')
    : '';
  const siteUrl = (opts.siteUrl || 'https://nexgencouncil.bond').trim().replace(/\/+$/, '');

  const cleanedLink = typeof opts.whatsappGroupLink === 'string' ? opts.whatsappGroupLink.trim() : '';
  const validatedWhatsappUrl = cleanedLink ? sanitizeSafeLinkUrl(cleanedLink) : null;
  const shouldIncludeWhatsappButton = Boolean(opts.includeWhatsappInvite && validatedWhatsappUrl);

  const subject = `🎉 Congratulations, ${firstName}! Welcome to NexGen Council 🌟`;

  const buttons: EmailButton[] = [];
  if (shouldIncludeWhatsappButton && validatedWhatsappUrl) {
    buttons.push({
      id: 'whatsapp_group_invite',
      label: '💬 Join Official WhatsApp Group →',
      url: validatedWhatsappUrl,
      style: 'amber',
      align: 'center'
    });
  }

  const html = `
    <p style="margin: 0 0 16px 0; font-size: 16px; color: #ffffff; font-weight: 700;">
      🎉 Dear ${safeFullName}, Congratulations! 🌟
    </p>
    <p style="margin: 0 0 16px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65;">
      We are thrilled to inform you that your volunteer application with
      <strong style="color: #fbbf24;">NexGen Women Empowerment &amp; Youth Leadership Council</strong>
      has been officially <strong style="color: #34d399;">APPROVED</strong>! 🙌✨
    </p>
    <p style="margin: 0 0 16px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65;">
      Your passion, vision, and commitment to empowering women and inspiring youth leaders stood out to our Selection Committee. Welcome to a vibrant community of changemakers making real impact! 🤝🌍
    </p>

    <div style="margin: 18px 0; padding: 16px 18px; background-color: #020617; border: 1px solid #334155; border-left: 4px solid #f59e0b; border-radius: 10px;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #fbbf24; margin-bottom: 10px;">
        📋 Volunteer Onboarding Summary
      </div>
      <div style="font-size: 14px; color: #f8fafc; line-height: 1.75;">
        <div><strong>👤 Full Name:</strong> ${safeFullName}</div>
        <div><strong>🔖 Application Ref:</strong> ${safeRef}</div>
        <div><strong>🎯 Assigned Track / Role:</strong> ${safeRole}</div>
        <div><strong>📍 Chapter / City:</strong> ${safeCity}</div>
        <div><strong>✅ Membership Status:</strong> <span style="color: #34d399; font-weight: 700;">Active Approved Volunteer</span></div>
      </div>
    </div>

    ${
      safeCustomNote
        ? `<blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #34d399; background-color: #1e293b; color: #f8fafc; border-radius: 8px; font-size: 14px;">
            <strong style="color: #34d399;">💌 Note from Committee:</strong><br />
            ${safeCustomNote}
          </blockquote>`
        : ''
    }

    ${
      shouldIncludeWhatsappButton
        ? `<p style="margin: 18px 0 8px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65;">
            💚 <strong>Next Step — Join Our Official Volunteers WhatsApp Group:</strong><br />
            Connect immediately with our core team, fellow volunteers, orientation briefings, and upcoming project announcements by clicking the invitation button below 👇
          </p>`
        : `<p style="margin: 18px 0 8px 0; color: #e2e8f0; font-size: 15px; line-height: 1.65;">
            📩 <strong>What Happens Next?</strong><br />
            Our chapter coordinators will reach out shortly with your orientation schedule, onboarding brief, and upcoming council activities. You can also track updates anytime at
            <a href="${escapeHtml(siteUrl)}" style="color: #fbbf24; text-decoration: underline;">${escapeHtml(siteUrl)}</a>. 🌟
          </p>`
    }

    <p style="margin: 18px 0 0 0; color: #cbd5e1; font-size: 14px; line-height: 1.6;">
      Warmest regards &amp; welcome aboard! 🚀<br />
      <strong style="color: #ffffff;">Executive Secretariat &amp; Volunteer Directorate</strong><br />
      <span style="color: #94a3b8;">NexGen Women Empowerment &amp; Youth Leadership Council</span>
    </p>
  `.trim();

  const messageLines = [
    `🎉 Dear ${rawName}, Congratulations! 🌟`,
    '',
    'We are thrilled to inform you that your volunteer application with NexGen Women Empowerment & Youth Leadership Council has been officially APPROVED! 🙌✨',
    '',
    `📋 Onboarding Summary:`,
    `- Full Name: ${rawName}`,
    `- Reference Code: ${opts.referenceCode}`,
    `- Role: ${opts.preferredRole || 'Council Volunteer'}`,
    `- City: ${opts.city || 'Community Chapter'}`,
    '- Status: Active Approved Volunteer ✅',
    opts.customNote?.trim() ? `\n💌 Note from Committee: ${opts.customNote.trim()}` : '',
    shouldIncludeWhatsappButton
      ? `\n💚 Join our Official Volunteers WhatsApp Group using the link below!`
      : `\n📩 Our coordinators will share your orientation schedule and upcoming activities shortly.`,
    '',
    'Warmest regards, 🚀',
    'NexGen Council Executive Secretariat'
  ].filter(Boolean);

  return {
    subject,
    html,
    message: messageLines.join('\n'),
    buttons,
    hasValidWhatsappLink: Boolean(validatedWhatsappUrl)
  };
}

