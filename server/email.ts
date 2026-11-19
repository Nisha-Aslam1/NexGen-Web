import { Resend } from 'resend';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  message?: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  data?: {
    id: string;
    recipients: string[];
    subject: string;
    sentAt: string;
  };
  error?: string;
  statusCode?: number;
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

export function buildNexGenEmailTemplate(subject: string, bodyHtml: string): string {
  const safeSubject = escapeHtml(subject);
  const year = new Date().getFullYear();

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
                  <td>
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #fbbf24; margin-bottom: 6px;">
                      Official Communication
                    </div>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                      NexGen Council
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
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 22px 32px 28px 32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #020617; padding: 22px 32px; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #cbd5e1;">
                NexGen Council • Executive Secretariat
              </p>
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748b;">
                Sent from <a href="https://nexgencouncil.bond" style="color: #fbbf24; text-decoration: none;">nexgencouncil.bond</a>
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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      statusCode: 500,
      error: 'Email service is not configured. Missing RESEND_API_KEY on server.'
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

  const rawHtml = typeof input.html === 'string' && input.html.trim() ? input.html.trim() : '';
  const rawMessage = typeof input.message === 'string' && input.message.trim() ? input.message.trim() : '';

  if (!rawHtml && !rawMessage) {
    return {
      success: false,
      statusCode: 400,
      error: 'Email message body or HTML content is required.'
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

  const bodyHtml = rawHtml || formatMessageToHtml(rawMessage);
  const fullHtml = buildNexGenEmailTemplate(subject, bodyHtml);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: 'NexGen Council <admin@nexgencouncil.bond>',
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
        error: error.message || 'Resend rejected the email request.'
      };
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        id: data?.id || `msg_${Date.now()}`,
        recipients,
        subject,
        sentAt: new Date().toISOString()
      }
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      error: err?.message || 'Unexpected error while dispatching email.'
    };
  }
}
