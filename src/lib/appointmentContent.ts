import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { AppointmentLetter, SignatoryProfile, EffectiveAppointmentStatus } from '../src/types.ts';
import { buildAppointmentLetterContent, formatReadableDate, safeDesignation } from '../src/lib/appointmentContent.ts';
import { getCleanSignatoryAsset, getSharp } from './imageCleanup.ts';
import { mongoGetMedia } from './mongo.ts';

/**
 * ONE-PAGE A4 appointment letter, generated directly with PDFKit (no browser => ~100-300 ms).
 * Layout is the same as the live preview in the admin studio.
 * Needs: npm i pdfkit sharp   (qrcode is already used by the project)
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const NAVY = '#0F2346';
const BLUE = '#1E3A8A';
const GOLD = '#C4942D';
const SLATE = '#475569';
const SLATE_LIGHT = '#64748B';
const BORDER = '#CBD5E1';

const MARGIN_X = 46;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

export interface AppointmentPdfInput {
  letter: AppointmentLetter & { effectiveStatus?: EffectiveAppointmentStatus };
  signatory?: SignatoryProfile | null;
  siteUrl?: string;
}

/** Standard PDF fonts only support Latin text: drop anything else so no garbage glyphs appear. */
function safe(text?: string | null): string {
  return String(text ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u2026]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let logoCache: Buffer | null | undefined;
function loadLogo(): Buffer | null {
  if (logoCache !== undefined) return logoCache;
  for (const p of [
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'dist', 'logo.png')
  ]) {
    try {
      if (fs.existsSync(p)) {
        logoCache = fs.readFileSync(p);
        return logoCache;
      }
    } catch {}
  }
  logoCache = null;
  return null;
}

/** Makes any uploaded image usable by PDFKit (PNG / JPEG only). */
async function toPdfImage(buf: Buffer | null, maxSide = 400): Promise<Buffer | null> {
  if (!buf) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const sharp = await getSharp();
  if (sharp) {
    try {
      return await sharp(buf)
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch {}
  }
  return isPng || isJpg ? buf : null;
}

async function loadUploadedPhoto(url?: string): Promise<Buffer | null> {
  if (!url || !url.startsWith('/uploads/')) return null;
  const name = path.basename(url);
  for (const dir of ['public/uploads', 'data/uploads']) {
    try {
      const p = path.join(process.cwd(), dir, name);
      if (fs.existsSync(p)) return await toPdfImage(fs.readFileSync(p), 360);
    } catch {}
  }
  try {
    const media = await mongoGetMedia(name);
    const m = media?.dataUrl?.match(/base64,([\s\S]+)$/i);
    if (m) return await toPdfImage(Buffer.from(m[1].replace(/\s+/g, ''), 'base64'), 360);
  } catch {}
  return null;
}

/** Shrinks the font until the text fits on one line, ellipsis as last resort. */
function fitLine(doc: PDFKit.PDFDocument, text: string, width: number, font: string, size: number, minSize: number) {
  let s = size;
  doc.font(font);
  while (s > minSize) {
    doc.fontSize(s);
    if (doc.widthOfString(text) <= width) break;
    s -= 0.2;
  }
  doc.fontSize(s);
  return s;
}

function drawFitted(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  font: string,
  size: number,
  minSize: number,
  color: string
) {
  fitLine(doc, text, width, font, size, minSize);
  doc.fillColor(color).text(text, x, y, { width, lineBreak: false, ellipsis: true });
}

export async function generateAppointmentLetterPdfBuffer(input: AppointmentPdfInput): Promise<Buffer> {
  const { letter, signatory } = input;
  const status: EffectiveAppointmentStatus = letter.effectiveStatus || 'ACTIVE';

  const baseUrl = (input.siteUrl || 'https://nexgencouncil.bond').trim().replace(/\/+$/, '');
  const verifyBase = /localhost|127\.0\.0\.1/i.test(baseUrl) ? 'https://nexgencouncil.bond' : baseUrl;
  const verifyUrl = letter.verificationToken
    ? `${verifyBase}/track?code=${encodeURIComponent(letter.referenceCode)}&token=${encodeURIComponent(letter.verificationToken)}`
    : `${verifyBase}/track?code=${encodeURIComponent(letter.referenceCode)}`;

  // Everything the page needs is prepared in parallel => fast.
  const [qrBuf, sigBuf, stampBuf, photoBuf] = await Promise.all([
    QRCode.toBuffer(verifyUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: NAVY, light: '#FFFFFF' }
    }),
    getCleanSignatoryAsset(signatory?.signatureAssetFilename, 'signature'),
    getCleanSignatoryAsset(signatory?.stampAssetFilename, 'stamp'),
    loadUploadedPhoto(letter.appointeePhotoUrl)
  ]);
  const isPngOrJpg = (b: Buffer | null) => Boolean(b && ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8)));
  const sigImg = isPngOrJpg(sigBuf) ? sigBuf : await toPdfImage(sigBuf, 900);
  const stampImg = isPngOrJpg(stampBuf) ? stampBuf : await toPdfImage(stampBuf, 700);
  const logo = loadLogo();

  const designation = safeDesignation(letter.designation);
  const content = buildAppointmentLetterContent({ ...letter, designation });
  const letterNo = safe(letter.letterNumber) || 'NXG-APT-DRAFT';

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    compress: true,
    info: {
      Title: `Letter of Appointment - ${safe(letter.appointeeName)} (${letterNo})`,
      Author: 'NexGen Council Secretariat',
      Subject: 'Official Appointment Letter'
    }
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // ---------- Frame ----------
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');
  doc.lineWidth(2.2).strokeColor(NAVY).rect(14, 14, PAGE_W - 28, PAGE_H - 28).stroke();
  doc.lineWidth(0.8).strokeColor(GOLD).rect(19, 19, PAGE_W - 38, PAGE_H - 38).stroke();

  // Watermark logo
  if (logo) {
    doc.save();
    doc.opacity(0.05);
    doc.image(logo, PAGE_W / 2 - 150, PAGE_H / 2 - 150, { fit: [300, 300], align: 'center', valign: 'center' });
    doc.restore();
  }

  // ---------- Header ----------
  const headerTop = 36;
  if (logo) doc.image(logo, MARGIN_X, headerTop, { fit: [56, 56] });
  const textX = MARGIN_X + 68;
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor(NAVY);
  doc.text('NEXGEN WOMEN EMPOWERMENT &', textX, headerTop + 2, { lineBreak: false });
  doc.text('YOUTH LEADERSHIP COUNCIL', textX, headerTop + 16, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7.4).fillColor(BLUE);
  doc.text('COUNCIL SECRETARIAT  -  SIALKOT, PAKISTAN', textX, headerTop + 33, { lineBreak: false, characterSpacing: 0.6 });
  doc.font('Helvetica-BoldOblique').fontSize(7.4).fillColor(GOLD);
  doc.text('SHAPING TODAY, LEADING TOMORROW', textX, headerTop + 44, { lineBreak: false, characterSpacing: 0.5 });

  // Right block
  const rightW = 170;
  const rightX = PAGE_W - MARGIN_X - rightW;
  doc.roundedRect(rightX, headerTop, rightW, 17, 3).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#FFFFFF');
  doc.text('OFFICIAL APPOINTMENT RECORD', rightX, headerTop + 5.2, { width: rightW, align: 'center', lineBreak: false, characterSpacing: 0.6 });

  const kv = (label: string, value: string, y: number, valueColor = NAVY) => {
    doc.font('Helvetica').fontSize(6.8).fillColor(SLATE_LIGHT);
    doc.text(label, rightX, y, { width: 62, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(valueColor);
    doc.text(value, rightX + 62, y - 0.6, { width: rightW - 62, align: 'right', lineBreak: false });
  };
  kv('LETTER NO.', letterNo, headerTop + 24);
  kv('APP REF CODE', safe(letter.referenceCode) || '-', headerTop + 36);
  const statusColor = status === 'REVOKED' ? '#BE123C' : status === 'EXPIRED' ? '#B45309' : '#047857';
  kv('STATUS', status, headerTop + 48, statusColor);

  const ruleY = headerTop + 66;
  doc.lineWidth(1.6).strokeColor(NAVY).moveTo(MARGIN_X, ruleY).lineTo(PAGE_W - MARGIN_X, ruleY).stroke();

  // ---------- Title ----------
  doc.font('Times-Bold').fontSize(19).fillColor(NAVY);
  doc.text('LETTER OF APPOINTMENT', MARGIN_X, ruleY + 8, { width: CONTENT_W, align: 'center', characterSpacing: 2.4, lineBreak: false });
  const divY = ruleY + 34;
  doc.lineWidth(0.8).strokeColor(GOLD);
  doc.moveTo(PAGE_W / 2 - 62, divY).lineTo(PAGE_W / 2 - 8, divY).stroke();
  doc.moveTo(PAGE_W / 2 + 8, divY).lineTo(PAGE_W / 2 + 62, divY).stroke();
  doc.save().translate(PAGE_W / 2, divY).rotate(45).rect(-2.2, -2.2, 4.4, 4.4).fill(GOLD).restore();

  // ---------- Details box ----------
  const boxY = divY + 10;
  const rowH = 11.6;
  const boxH = rowH * 6 + 14;
  doc.roundedRect(MARGIN_X, boxY, CONTENT_W, boxH, 4).fillAndStroke('#F8FAFC', BORDER);

  const photoW = photoBuf ? 56 : 0;
  const innerX = MARGIN_X + 10;
  const innerW = CONTENT_W - 20 - (photoBuf ? photoW + 10 : 0);
  const colW = (innerW - 14) / 2;
  const labelW = 70;

  const issueStr = formatReadableDate(letter.issuedAt || new Date().toISOString(), '-');
  const leftRows: [string, string][] = [
    ['FULL LEGAL NAME', safe(letter.appointeeName) || '-'],
    ['DESIGNATION', safe(designation)],
    ['DEPARTMENT', safe(letter.department) || '-'],
    ['CHAPTER / CITY', `${safe(letter.chapter) || 'Sialkot'}, ${safe(letter.country) || 'Pakistan'}`],
    ['EMAIL ADDRESS', safe(letter.appointeeEmail) || 'On file'],
    ['CONTACT NO.', safe(letter.appointeePhone) || 'On file']
  ];
  const rightRows: [string, string][] = [
    ['ISSUE DATE', issueStr],
    ['EFFECTIVE DATE', formatReadableDate(letter.effectiveDate, '-')],
    ['VALIDITY / EXPIRY', letter.expiryDate ? formatReadableDate(letter.expiryDate) : 'Renewable Standing'],
    ['APPOINTMENT TYPE', safe(letter.appointmentType)],
    ['MEMBERSHIP TIER', safe(letter.membershipTier)],
    ['REPORTING TO', safe(letter.reportingAuthority)]
  ];

  const drawRows = (rows: [string, string][], x: number) => {
    rows.forEach(([label, value], i) => {
      const y = boxY + 8 + i * rowH;
      fitLine(doc, label, labelW - 4, 'Helvetica-Bold', 6.1, 5);
      doc.fillColor(SLATE_LIGHT).text(label, x, y + 1.4, { width: labelW - 2, lineBreak: false });
      drawFitted(doc, value, x + labelW, y, colW - labelW, 'Helvetica-Bold', 8, 6.2, '#0F172A');
    });
  };
  drawRows(leftRows, innerX);
  drawRows(rightRows, innerX + colW + 14);

  doc.lineWidth(0.5).strokeColor('#E2E8F0');
  doc.moveTo(innerX + colW + 7, boxY + 8).lineTo(innerX + colW + 7, boxY + boxH - 8).stroke();

  if (photoBuf) {
    const px = MARGIN_X + CONTENT_W - photoW - 10;
    try {
      doc.image(photoBuf, px, boxY + 7, { fit: [photoW, boxH - 14], align: 'center', valign: 'center' });
      doc.lineWidth(1.2).strokeColor(GOLD).rect(px, boxY + 7, photoW, boxH - 14).stroke();
    } catch {}
  }

  // ---------- Layout of the bottom block (signature / seal / QR / footer) ----------
  const footerTextY = PAGE_H - 46;
  const verifyLineY = footerTextY - 19;
  const sigBlockH = 104;
  const sigTop = verifyLineY - sigBlockH - 4;

  // ---------- Body (auto-fits to ONE page) ----------
  const bodyTop = boxY + boxH + 10;
  const bodyBottom = sigTop - 10;
  const available = bodyBottom - bodyTop;

  const sections: { title: string; text?: string; bullets?: string[] }[] = [
    { title: '1. Official Appointment Declaration', text: content.declaration },
    { title: '2. Responsibilities & Duties', text: content.responsibilitiesIntro, bullets: content.responsibilitiesList },
    { title: '3. Code of Conduct', text: content.codeOfConduct },
    { title: '4. Confidentiality & Organizational Policies', text: content.confidentiality },
    { title: '5. Appointment Terms & Tenure', text: content.terms },
    { title: '6. Organizational Recognition', text: content.recognition }
  ].map(s => ({ ...s, text: safe(s.text), bullets: s.bullets?.map(b => safe(b)) }));

  const greeting = `Dear ${safe(letter.appointeeName) || 'Appointee'},`;

  const runBody = (size: number, draw: boolean): number => {
    const gap = size * 0.28;
    const lineGap = size * 0.2;
    const titleSize = Math.min(8.2, size - 1.1);
    const bulletIndent = 12;
    let y = bodyTop;

    doc.font('Times-Bold').fontSize(size + 1);
    if (draw) doc.fillColor(NAVY).text(greeting, MARGIN_X, y, { width: CONTENT_W, lineBreak: false });
    y += size + 1 + gap * 1.6;

    for (const s of sections) {
      doc.font('Helvetica-Bold').fontSize(titleSize);
      const upper = s.title.toUpperCase();
      if (draw) {
        doc.fillColor(BLUE).text(upper, MARGIN_X, y, { lineBreak: false, characterSpacing: 0.4 });
        const w = doc.widthOfString(upper) + upper.length * 0.4;
        doc.lineWidth(0.6).strokeColor(GOLD).moveTo(MARGIN_X, y + titleSize + 1.6).lineTo(MARGIN_X + w, y + titleSize + 1.6).stroke();
      }
      y += titleSize + 4.6;

      if (s.text) {
        doc.font('Times-Roman').fontSize(size);
        const opts = { width: CONTENT_W, align: 'justify' as const, lineGap };
        if (draw) doc.fillColor('#1E293B').text(s.text, MARGIN_X, y, opts);
        y += doc.heightOfString(s.text, opts) + 1.4;
      }
      if (s.bullets) {
        for (const b of s.bullets) {
          doc.font('Times-Roman').fontSize(size);
          const opts = { width: CONTENT_W - bulletIndent, align: 'left' as const, lineGap };
          if (draw) {
            doc.circle(MARGIN_X + 4, y + size * 0.52, 1.5).fill(GOLD);
            doc.fillColor('#1E293B').text(b, MARGIN_X + bulletIndent, y, opts);
          }
          y += doc.heightOfString(b, opts) + 1.2;
        }
      }
      y += gap;
    }
    return y - bodyTop;
  };

  let bodySize = 10.4;
  while (bodySize > 7.6 && runBody(bodySize, false) > available) bodySize -= 0.1;
  runBody(bodySize, true);

  // ---------- Signature, seal, QR ----------
  doc.lineWidth(1.3).strokeColor(NAVY).moveTo(MARGIN_X, sigTop - 2).lineTo(PAGE_W - MARGIN_X, sigTop - 2).stroke();

  doc.font('Times-Italic').fontSize(9).fillColor(SLATE);
  doc.text('With warm regards,', MARGIN_X, sigTop + 5, { lineBreak: false });

  const sigAreaY = sigTop + 18;
  const sigAreaH = 46;
  const lineY = sigAreaY + sigAreaH + 2;
  const sigBlockW = 215;

  // signature sits ABOVE the line (bottom-left aligned)
  if (sigImg) {
    try {
      const img: any = (doc as any).openImage(sigImg);
      const scale = Math.min(172 / img.width, sigAreaH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      doc.image(sigImg, MARGIN_X + 2, sigAreaY + sigAreaH - h, { width: w, height: h });
    } catch {}
  }

  doc.lineWidth(0.8).strokeColor(NAVY).moveTo(MARGIN_X, lineY).lineTo(MARGIN_X + sigBlockW, lineY).stroke();

  // name + title UNDER the line
  const nameX = MARGIN_X;
  const nameW = 175;
  doc.font('Times-Bold').fontSize(10.5).fillColor(NAVY);
  doc.text(safe(letter.signatoryName) || 'Executive Director', nameX, lineY + 4, { width: nameW, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(7.6).fillColor(BLUE);
  const titleStr = safe(letter.signatoryTitle) || 'Executive Director - Council Secretariat';
  const titleH = doc.heightOfString(titleStr, { width: nameW });
  doc.text(titleStr, nameX, lineY + 17, { width: nameW });
  doc.font('Helvetica').fontSize(7).fillColor(SLATE_LIGHT);
  doc.text('NexGen Council - Authorized Signatory', nameX, lineY + 18 + titleH, { width: nameW, lineBreak: false });

  // official seal: overlaps the end of the signing line, like a real stamped letter
  if (stampImg) {
    try {
      const img: any = (doc as any).openImage(stampImg);
      const box = 96;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const cx = MARGIN_X + sigBlockW + 28;
      const cy = lineY - 14;
      doc.save();
      doc.opacity(0.92);
      doc.rotate(-6, { origin: [cx, cy] });
      doc.image(stampImg, cx - w / 2, cy - h / 2, { width: w, height: h });
      doc.restore();
    } catch {}
  }

  // QR verification panel
  const qrPanelW = 188;
  const qrPanelX = PAGE_W - MARGIN_X - qrPanelW;
  const qrPanelY = sigTop + 14;
  const qrPanelH = 80;
  doc.roundedRect(qrPanelX, qrPanelY, qrPanelW, qrPanelH, 4).fillAndStroke('#F8FAFC', BORDER);
  doc.image(qrBuf, qrPanelX + 8, qrPanelY + 9, { width: 62, height: 62 });
  doc.font('Helvetica-Bold').fontSize(7.4).fillColor(NAVY);
  doc.text('SCAN TO VERIFY', qrPanelX + 78, qrPanelY + 14, { lineBreak: false, characterSpacing: 0.6 });
  doc.font('Helvetica').fontSize(6.8).fillColor(SLATE);
  doc.text('Verify authenticity of this letter at nexgencouncil.bond/track', qrPanelX + 78, qrPanelY + 27, { width: qrPanelW - 86 });
  doc.font('Courier-Bold').fontSize(7).fillColor(BLUE);
  doc.text(letterNo, qrPanelX + 78, qrPanelY + 56, { width: qrPanelW - 86, lineBreak: false });

  // ---------- Footer ----------
  doc.font('Times-Italic').fontSize(7).fillColor(SLATE_LIGHT);
  doc.text(
    'This is a digitally verifiable document. Any alteration without Secretariat authorization is invalid.',
    MARGIN_X,
    verifyLineY + 5,
    { width: CONTENT_W, align: 'center', lineBreak: false }
  );
  doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(MARGIN_X, footerTextY - 5).lineTo(PAGE_W - MARGIN_X, footerTextY - 5).stroke();
  doc.font('Helvetica-Bold').fontSize(6.8).fillColor(NAVY);
  doc.text('NEXGEN COUNCIL SECRETARIAT - SIALKOT, PAKISTAN', MARGIN_X, footerTextY, { lineBreak: false });
  doc.font('Helvetica').fontSize(6.8).fillColor(SLATE_LIGHT);
  doc.text(`Ref: ${letterNo}  |  Issued by ${safe(letter.issuedByName) || 'Authorized Admin'}`, MARGIN_X, footerTextY, {
    width: CONTENT_W,
    align: 'right',
    lineBreak: false
  });

  // ---------- Revoked / expired diagonal stamp ----------
  if (status !== 'ACTIVE') {
    const col = status === 'REVOKED' ? '#BE123C' : '#B45309';
    doc.save();
    doc.opacity(0.14);
    doc.rotate(-28, { origin: [PAGE_W / 2, PAGE_H / 2] });
    doc.lineWidth(6).strokeColor(col).roundedRect(PAGE_W / 2 - 170, PAGE_H / 2 - 42, 340, 84, 10).stroke();
    doc.font('Helvetica-Bold').fontSize(62).fillColor(col);
    doc.text(status, PAGE_W / 2 - 170, PAGE_H / 2 - 33, { width: 340, align: 'center', lineBreak: false, characterSpacing: 4 });
    doc.restore();
  }

  doc.end();
  return finished;
}
