import fs from 'fs';
import path from 'path';
import { db } from './db.ts';
import { mongoDeleteMedia, mongoGetMedia, mongoMediaExists, mongoSaveMedia } from './mongo.ts';

export type MediaEntityType =
  | 'news'
  | 'team'
  | 'program'
  | 'event'
  | 'gallery'
  | 'volunteer'
  | 'user'
  | 'email';

const ALLOWED_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/;

export function getUploadDirs() {
  const publicUploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  const persistentUploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  return { publicUploadsDir, persistentUploadsDir };
}

function ensureUploadDirs() {
  const { publicUploadsDir, persistentUploadsDir } = getUploadDirs();
  for (const dir of [publicUploadsDir, persistentUploadsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return { publicUploadsDir, persistentUploadsDir };
}

/**
 * Resolve a filename strictly confined inside baseDir (blocks directory traversal).
 */
export function resolveConfinedUploadPath(baseDir: string, filename: string): string | null {
  if (!filename || typeof filename !== 'string') return null;
  const clean = path.basename(filename.trim());
  if (!clean || clean === '.' || clean === '..' || !SAFE_FILENAME_RE.test(clean)) {
    return null;
  }
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, clean);
  if (!resolved.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * Produce a clean, lowercase, ASCII kebab-case filename stem suitable for Google Images & web URLs.
 */
export function slugifyImageFilename(input: string, fallback = 'nexgen-image', maxLength = 72): string {
  const normalized = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)/g, '');

  const safeFallback = String(fallback || 'nexgen-image')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'nexgen-image';

  if (!normalized) return safeFallback.slice(0, maxLength);
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength);
  const lastDash = sliced.lastIndexOf('-');
  const trimmed = lastDash > Math.floor(maxLength * 0.5) ? sliced.slice(0, lastDash) : sliced;
  return trimmed.replace(/(^-|-$)/g, '') || safeFallback.slice(0, maxLength);
}

/**
 * Strip meaningless leading numeric timestamps or noisy upload stems when no explicit title exists yet.
 */
export function cleanRawFilenameStem(rawFilename: string, fallback = 'nexgen-upload'): string {
  const base = path.basename(String(rawFilename || '').trim());
  const stem = base
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{10,16}[_-]+/, '');
  return slugifyImageFilename(stem, fallback, 56);
}

/**
 * Derive an entity-specific descriptive SEO image base slug from entity metadata.
 */
export function buildEntityImageBaseName(
  type: MediaEntityType,
  data: Record<string, any> = {}
): string {
  switch (type) {
    case 'news':
      return slugifyImageFilename(
        data.slug || data.title || data.headline || '',
        'nexgen-news-dispatch'
      );
    case 'team': {
      const combined = [data.name, data.position].filter(Boolean).join(' ');
      return slugifyImageFilename(combined || data.name || '', 'nexgen-leadership-member');
    }
    case 'program':
      return slugifyImageFilename(
        data.slug || data.title || '',
        'nexgen-program'
      );
    case 'event':
      return slugifyImageFilename(
        data.slug || data.title || '',
        'nexgen-event'
      );
    case 'gallery': {
      const combined = [data.title, data.category].filter(Boolean).join(' ');
      return slugifyImageFilename(combined || data.title || '', 'nexgen-gallery-photo');
    }
    case 'volunteer': {
      const combined = [data.fullName, data.referenceCode || data.assignedRole].filter(Boolean).join(' ');
      return slugifyImageFilename(combined || data.fullName || '', 'nexgen-volunteer');
    }
    case 'user': {
      const combined = [data.name || data.username, 'staff'].filter(Boolean).join(' ');
      return slugifyImageFilename(combined, 'nexgen-staff-profile');
    }
    case 'email': {
      const combined = [data.subject || data.title, data.kind || 'email-asset'].filter(Boolean).join(' ');
      return slugifyImageFilename(combined, 'nexgen-email-asset');
    }
    default:
      return slugifyImageFilename(data.title || data.name || '', 'nexgen-image');
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractLocalUploadFilename(urlValue: unknown): string | null {
  if (typeof urlValue !== 'string') return null;
  const trimmed = urlValue.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith('uploads/') ? `/${trimmed}` : trimmed;
  if (!normalized.startsWith('/uploads/')) return null;

  const rest = normalized.slice('/uploads/'.length).split('?')[0].split('#')[0];
  // Never rename meeting captures or subdirectories
  if (!rest || rest.includes('/') || rest.includes('\\')) return null;
  // Never touch protected signatory / locked ID card filenames
  if (rest.startsWith('sigasset_') || rest.startsWith('idcard_')) return null;

  const extMatch = rest.match(/\.([a-zA-Z0-9]+)$/);
  if (!extMatch) return null;
  const ext = extMatch[1].toLowerCase() === 'jpeg' ? 'jpg' : extMatch[1].toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) return null;

  return SAFE_FILENAME_RE.test(rest) ? rest : null;
}

export async function mediaFilenameExists(filename: string): Promise<boolean> {
  const { publicUploadsDir, persistentUploadsDir } = ensureUploadDirs();
  const pubPath = resolveConfinedUploadPath(publicUploadsDir, filename);
  const dataPath = resolveConfinedUploadPath(persistentUploadsDir, filename);

  if (pubPath && fs.existsSync(pubPath)) return true;
  if (dataPath && fs.existsSync(dataPath)) return true;
  return mongoMediaExists(filename);
}

/**
 * Pick a collision-free SEO filename `<baseSlug>.<ext>` (or `<baseSlug>-2.<ext>`, etc.).
 * If `currentFilename` already matches `<baseSlug>.<ext>` (or `<baseSlug>-N.<ext>` when the base is occupied),
 * keeps it stable to avoid unnecessary renaming.
 */
export async function resolveUniqueUploadFilename(
  baseSlug: string,
  extInput: string,
  options?: { currentFilename?: string }
): Promise<string> {
  const ext = extInput.toLowerCase() === 'jpeg' ? 'jpg' : extInput.toLowerCase();
  const safeExt = ALLOWED_IMAGE_EXTS.has(ext) ? ext : 'jpg';
  const cleanSlug = slugifyImageFilename(baseSlug, 'nexgen-image');
  const current = options?.currentFilename;

  const primary = `${cleanSlug}.${safeExt}`;
  if (current === primary || !(await mediaFilenameExists(primary))) {
    return primary;
  }

  for (let i = 2; i <= 500; i++) {
    const candidate = `${cleanSlug}-${i}.${safeExt}`;
    if (current === candidate || !(await mediaFilenameExists(candidate))) {
      return candidate;
    }
  }

  return `${cleanSlug}-${Date.now().toString(36)}.${safeExt}`;
}

async function readLocalUploadMedia(
  filename: string
): Promise<{ buffer: Buffer; mimeType: string; dataUrl: string } | null> {
  const { publicUploadsDir, persistentUploadsDir } = ensureUploadDirs();
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  const rawExt = (extMatch?.[1] || 'jpg').toLowerCase();
  const mimeExt = rawExt === 'jpg' || rawExt === 'jpeg' ? 'jpeg' : rawExt;
  const fallbackMime = `image/${mimeExt}`;

  const pubPath = resolveConfinedUploadPath(publicUploadsDir, filename);
  const dataPath = resolveConfinedUploadPath(persistentUploadsDir, filename);

  for (const candidate of [pubPath, dataPath]) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const buffer = fs.readFileSync(candidate);
      const dataUrl = `data:${fallbackMime};base64,${buffer.toString('base64')}`;
      return { buffer, mimeType: fallbackMime, dataUrl };
    }
  }

  const mongoDoc = await mongoGetMedia(filename);
  if (mongoDoc?.dataUrl) {
    const matches = String(mongoDoc.dataUrl).match(
      /^data:image\/([a-zA-Z0-9.+-]+)(?:;[^;,=]+=[^;,]+)*;base64,([\s\S]+)$/i
    );
    if (matches) {
      const buffer = Buffer.from(matches[2].replace(/\s+/g, ''), 'base64');
      const mimeType = mongoDoc.mimeType || fallbackMime;
      return { buffer, mimeType, dataUrl: mongoDoc.dataUrl };
    }
  }

  return null;
}

function countAllUploadFilenameReferences(): Map<string, number> {
  const counts = new Map<string, number>();
  const addRef = (val: unknown) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    const normalized = trimmed.startsWith('uploads/') ? `/${trimmed}` : trimmed;
    if (!normalized.startsWith('/uploads/')) return;
    const fname = path.basename(normalized.slice('/uploads/'.length).split('?')[0].split('#')[0]);
    if (!fname) return;
    counts.set(fname, (counts.get(fname) || 0) + 1);
  };

  try {
    for (const n of db.getNews(false)) addRef(n.coverImage);
    for (const t of db.getTeam(false)) addRef(t.image);
    for (const p of db.getPrograms(false)) addRef(p.coverImage);
    for (const e of db.getEvents('All')) {
      const seen = new Set<string>();
      for (const field of [e.coverImage, e.image]) {
        if (typeof field === 'string' && field.trim() && !seen.has(field.trim())) {
          seen.add(field.trim());
          addRef(field);
        }
      }
    }
    for (const g of db.getGallery()) addRef(g.imageUrl);
    for (const v of db.getVolunteers()) {
      addRef(v.avatar);
      if (v.idCardPhotoUrl && v.idCardPhotoUrl !== v.avatar) addRef(v.idCardPhotoUrl);
    }
    const apps = db.getApplications({ perPage: 5000 }).data || [];
    for (const a of apps) {
      addRef(a.avatar);
      if (a.idCardPhotoUrl && a.idCardPhotoUrl !== a.avatar) addRef(a.idCardPhotoUrl);
    }
    for (const u of db.getUsers()) addRef(u.avatar);
    const settings = db.getSettings();
    addRef(settings?.emailLogoUrl);
    for (const sig of db.getSignatories({ activeOnly: false })) {
      if (sig.signatureAssetFilename) addRef(`/uploads/${sig.signatureAssetFilename}`);
      if (sig.stampAssetFilename) addRef(`/uploads/${sig.stampAssetFilename}`);
    }
    for (const apt of db.getAppointmentLetters()) {
      addRef(apt.appointeePhotoUrl);
    }
    for (const log of db.getEmailLogs(500)) {
      addRef(log.logoUrl);
      if (Array.isArray(log.images)) {
        for (const img of log.images) addRef(img?.url);
      }
    }
  } catch (err) {
    console.warn('[MediaNaming] Reference scan notice:', err);
  }

  return counts;
}

async function deleteObsoleteUploadFileIfUnused(oldFilename: string): Promise<void> {
  const counts = countAllUploadFilenameReferences();
  if ((counts.get(oldFilename) || 0) > 0) {
    return;
  }

  const { publicUploadsDir, persistentUploadsDir } = ensureUploadDirs();
  for (const dir of [publicUploadsDir, persistentUploadsDir]) {
    const oldPath = resolveConfinedUploadPath(dir, oldFilename);
    if (oldPath && fs.existsSync(oldPath) && fs.statSync(oldPath).isFile()) {
      try {
        fs.unlinkSync(oldPath);
      } catch (err) {
        console.warn(`[MediaNaming] Could not delete obsolete file ${oldPath}:`, err);
      }
    }
  }
  await mongoDeleteMedia(oldFilename).catch(() => false);
}

/**
 * Copy/write a local `/uploads/...` asset under a clean SEO filename matching `targetBaseSlug`.
 * Caller updates the DB record with the returned URL, then calls `cleanupOldUploadFilename(oldFilename)`
 * so the old file is deleted only after the DB update succeeds and nothing else references it.
 */
export async function prepareRenamedLocalUploadAsset(
  currentUrl: string,
  targetBaseSlug: string
): Promise<{ nextUrl: string; oldFilename?: string; newFilename?: string; changed: boolean }> {
  const oldFilename = extractLocalUploadFilename(currentUrl);
  if (!oldFilename) {
    return { nextUrl: currentUrl, changed: false };
  }

  const extMatch = oldFilename.match(/\.([a-zA-Z0-9]+)$/);
  const rawExt = (extMatch?.[1] || 'jpg').toLowerCase();
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const cleanSlug = slugifyImageFilename(targetBaseSlug, 'nexgen-image');

  // Idempotency: keep already-matching `<slug>.<ext>` or `<slug>-N.<ext>` if primary is occupied
  const exactTarget = `${cleanSlug}.${ext}`;
  if (oldFilename === exactTarget) {
    return { nextUrl: `/uploads/${oldFilename}`, changed: false };
  }
  const suffixedPattern = new RegExp(`^${escapeRegExp(cleanSlug)}-\\d+\\.${escapeRegExp(ext)}$`);
  if (suffixedPattern.test(oldFilename) && (await mediaFilenameExists(exactTarget))) {
    return { nextUrl: `/uploads/${oldFilename}`, changed: false };
  }

  const mediaData = await readLocalUploadMedia(oldFilename);
  if (!mediaData) {
    // Source file not found on disk/Mongo; preserve existing URL untouched
    return { nextUrl: currentUrl, changed: false };
  }

  const newFilename = await resolveUniqueUploadFilename(cleanSlug, ext, {
    currentFilename: oldFilename
  });
  if (newFilename === oldFilename) {
    return { nextUrl: `/uploads/${oldFilename}`, changed: false };
  }

  const { publicUploadsDir, persistentUploadsDir } = ensureUploadDirs();
  const pubTarget = resolveConfinedUploadPath(publicUploadsDir, newFilename);
  const dataTarget = resolveConfinedUploadPath(persistentUploadsDir, newFilename);
  if (!pubTarget || !dataTarget) {
    return { nextUrl: currentUrl, changed: false };
  }

  fs.writeFileSync(pubTarget, mediaData.buffer);
  try {
    fs.writeFileSync(dataTarget, mediaData.buffer);
  } catch (err) {
    console.warn('[MediaNaming] Could not write renamed copy to data/uploads:', err);
  }
  await mongoSaveMedia(newFilename, mediaData.dataUrl, mediaData.mimeType, mediaData.buffer.length).catch(() => false);

  return {
    nextUrl: `/uploads/${newFilename}`,
    oldFilename,
    newFilename,
    changed: true
  };
}

export interface MediaRenameEntry {
  type: MediaEntityType;
  id: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Automatically update the `/uploads/...` filename for a single entity right after create/update.
 */
export async function syncEntityImageFilename<T = any>(
  type: Exclude<MediaEntityType, 'email'>,
  id: string
): Promise<{ record: T | null; renamed?: MediaRenameEntry }> {
  if (type === 'news') {
    const item = db.getNews(false).find(n => n.id === id);
    if (!item) return { record: null };
    if (!item.coverImage) return { record: item as unknown as T };

    const targetSlug = buildEntityImageBaseName('news', item);
    const prep = await prepareRenamedLocalUploadAsset(item.coverImage, targetSlug);
    if (!prep.changed) return { record: item as unknown as T };

    const updated = db.updateNews(id, { coverImage: prep.nextUrl });
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || item) as unknown as T,
      renamed: { type, id, label: item.title, from: item.coverImage, to: prep.nextUrl }
    };
  }

  if (type === 'team') {
    const member = db.getTeam(false).find(t => t.id === id);
    if (!member) return { record: null };
    if (!member.image) return { record: member as unknown as T };

    const targetSlug = buildEntityImageBaseName('team', member);
    const prep = await prepareRenamedLocalUploadAsset(member.image, targetSlug);
    if (!prep.changed) return { record: member as unknown as T };

    const updated = db.updateTeamMember(id, { image: prep.nextUrl });
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || member) as unknown as T,
      renamed: { type, id, label: member.name, from: member.image, to: prep.nextUrl }
    };
  }

  if (type === 'program') {
    const prog = db.getPrograms(false).find(p => p.id === id);
    if (!prog) return { record: null };
    if (!prog.coverImage) return { record: prog as unknown as T };

    const targetSlug = buildEntityImageBaseName('program', prog);
    const prep = await prepareRenamedLocalUploadAsset(prog.coverImage, targetSlug);
    if (!prep.changed) return { record: prog as unknown as T };

    const updated = db.updateProgram(id, { coverImage: prep.nextUrl });
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || prog) as unknown as T,
      renamed: { type, id, label: prog.title, from: prog.coverImage, to: prep.nextUrl }
    };
  }

  if (type === 'event') {
    const evt = db.getEvents('All').find(e => e.id === id);
    if (!evt) return { record: null };
    const sourceImg = evt.coverImage || evt.image;
    if (!sourceImg) return { record: evt as unknown as T };

    const targetSlug = buildEntityImageBaseName('event', evt);
    const prep = await prepareRenamedLocalUploadAsset(sourceImg, targetSlug);
    if (!prep.changed) return { record: evt as unknown as T };

    const updates: Record<string, string> = {};
    if (evt.coverImage === sourceImg || !evt.coverImage) updates.coverImage = prep.nextUrl;
    if (evt.image === sourceImg || !evt.image) updates.image = prep.nextUrl;
    const updated = db.updateEvent(id, updates);
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || evt) as unknown as T,
      renamed: { type, id, label: evt.title, from: sourceImg, to: prep.nextUrl }
    };
  }

  if (type === 'gallery') {
    const gal = db.getGallery().find(g => g.id === id);
    if (!gal) return { record: null };
    if (!gal.imageUrl) return { record: gal as unknown as T };

    const targetSlug = buildEntityImageBaseName('gallery', gal);
    const prep = await prepareRenamedLocalUploadAsset(gal.imageUrl, targetSlug);
    if (!prep.changed) return { record: gal as unknown as T };

    const updated = db.updateGalleryItem(id, { imageUrl: prep.nextUrl });
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || gal) as unknown as T,
      renamed: { type, id, label: gal.title, from: gal.imageUrl, to: prep.nextUrl }
    };
  }

  if (type === 'volunteer') {
    const vol = db.getVolunteers().find(v => v.id === id);
    if (!vol) return { record: null };
    if (!vol.avatar) return { record: vol as unknown as T };

    const targetSlug = buildEntityImageBaseName('volunteer', vol);
    const prep = await prepareRenamedLocalUploadAsset(vol.avatar, targetSlug);
    if (!prep.changed) return { record: vol as unknown as T };

    const updated = db.updateVolunteer(id, { avatar: prep.nextUrl });
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || vol) as unknown as T,
      renamed: { type, id, label: vol.fullName, from: vol.avatar, to: prep.nextUrl }
    };
  }

  if (type === 'user') {
    const usr = db.getUsers().find(u => u.id === id);
    if (!usr) return { record: null };
    if (!usr.avatar) return { record: usr as unknown as T };

    const targetSlug = buildEntityImageBaseName('user', usr);
    const prep = await prepareRenamedLocalUploadAsset(usr.avatar, targetSlug);
    if (!prep.changed) return { record: usr as unknown as T };

    const updated = db.updateUser(id, { avatar: prep.nextUrl });
    if (prep.oldFilename) await deleteObsoleteUploadFileIfUnused(prep.oldFilename);
    return {
      record: (updated || usr) as unknown as T,
      renamed: { type, id, label: usr.name || usr.username, from: usr.avatar, to: prep.nextUrl }
    };
  }

  return { record: null };
}

/**
 * Scan all existing database records across News, Team, Programs, Events, Gallery, Volunteers, and Staff
 * and normalize any local `/uploads/...` filenames to match their current entity titles/names.
 */
export async function syncAllEntityImageFilenames(): Promise<{
  scanned: number;
  renamedCount: number;
  renamed: MediaRenameEntry[];
}> {
  const renamed: MediaRenameEntry[] = [];
  let scanned = 0;

  const jobs: Array<{ type: Exclude<MediaEntityType, 'email'>; ids: string[] }> = [
    { type: 'news', ids: db.getNews(false).map(i => i.id) },
    { type: 'team', ids: db.getTeam(false).map(i => i.id) },
    { type: 'program', ids: db.getPrograms(false).map(i => i.id) },
    { type: 'event', ids: db.getEvents('All').map(i => i.id) },
    { type: 'gallery', ids: db.getGallery().map(i => i.id) },
    { type: 'volunteer', ids: db.getVolunteers().map(i => i.id) },
    { type: 'user', ids: db.getUsers().map(i => i.id) }
  ];

  for (const group of jobs) {
    for (const id of group.ids) {
      scanned++;
      try {
        const res = await syncEntityImageFilename(group.type, id);
        if (res.renamed) {
          renamed.push(res.renamed);
        }
      } catch (err: any) {
        console.warn(`[MediaNaming] Sync skipped for ${group.type}/${id}:`, err?.message || err);
      }
    }
  }

  if (renamed.length > 0) {
    console.log(`[MediaNaming] Automatically synchronized ${renamed.length} local image filename(s) to SEO entity names.`);
  }

  return {
    scanned,
    renamedCount: renamed.length,
    renamed
  };
}
