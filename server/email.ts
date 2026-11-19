import { Resend } from 'resend';
import type { EmailImage } from '../src/types.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  message?: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
  logoUrl?: string;
  images?: EmailImage[];
  siteUrl?: string;
}

export interface SendEmailResult {
  success: boolean;
  data?: {
    id: string;
    fromName: string;
    fromEmail: string;
    recipients: string[];
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
    subject: string;
    replyTo?: string;
    message: string;
    logoUrl?: string;
    images?: EmailImage[];
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

export function buildNexGenEmailTemplate(
  subject: string,
  bodyHtml: string,
  senderName = 'NexGen Council',
  options?: {
    logoUrl?: string;
    images?: EmailImage[];
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
  const topImagesHtml = renderEmailImagesHtml(allImages, 'top');
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
            <td style="padding: 22px 32px 28px 32px;">
              ${bodyHtml}
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

export function parseRecipientList(to: string | string[]): { valid: string[]; invalid: string[] } {
  const rawItems = Array.isArray(to)
    ? to
    : String(to || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

  const unique = Array.from(new Set(rawItems.map(email => email.trim().toLowerCase())));
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

  const { valid: recipients, invalid } = parseRecipientList(input.to);
  if (invalid.length > 0) {
    return {
      success: false,
      statusCode: 400,
      error: `Invalid email address(es): ${invalid.join(', ')}`
    };
  }

  if (recipients.length === 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'At least one valid recipient email address is required.'
    };
  }

  if (recipients.length > 50) {
    return {
      success: false,
      statusCode: 400,
      error: 'Maximum 50 recipients allowed per email request.'
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

  const rawHtml = typeof input.html === 'string' && input.html.trim() ? input.html.trim() : '';
  const rawMessage = typeof input.message === 'string' && input.message.trim() ? input.message.trim() : '';

  if (!rawHtml && !rawMessage && sanitizedImages.length === 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'Email message body, HTML content, or at least one image is required.'
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
    recipients,
    subject,
    replyTo,
    message: rawMessage || '[HTML Content]',
    logoUrl: resolvedLogoUrl,
    images: sanitizedImages
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

  const bodyHtml = rawHtml || (rawMessage ? formatMessageToHtml(rawMessage) : '');
  const fullHtml = buildNexGenEmailTemplate(subject, bodyHtml, fromName, {
    logoUrl: resolvedLogoUrl,
    images: sanitizedImages,
    siteUrl
  });

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipients,
      subject,
      html: fullHtml,
      ...(rawMessage ? { text: rawMessage } : {}),
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
        recipients,
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
