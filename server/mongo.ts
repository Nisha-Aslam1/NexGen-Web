import { MongoClient, Db } from 'mongodb';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DatabaseSchema } from './db.ts';

let client: MongoClient | null = null;
let dbInstance: Db | null = null;
let isConnected = false;
let lastPingTime = 0;
let connectionError: string | null = null;

const CONFIG_PATH = path.join(process.cwd(), 'data', 'mongo_config.json');

function loadStoredMongoUri(): string {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (parsed.uri && typeof parsed.uri === 'string' && parsed.uri.trim()) {
        return parsed.uri.trim();
      }
    }
  } catch {}
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexgen_council';
}

function saveStoredMongoUri(uri: string) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ uri, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[MongoDB] Could not persist mongo_config.json:', err);
  }
}

let currentMongoUri = loadStoredMongoUri();
let currentDbName = process.env.MONGODB_DB_NAME || 'nexgen_council';

export function getCurrentMongoUri(): string {
  return currentMongoUri;
}

/**
 * Ensures the mongod daemon is running locally when targeting localhost/127.0.0.1
 */
export function ensureLocalMongoDaemon(): boolean {
  // If connection is configured to a remote host, skip local daemon startup
  if (!currentMongoUri.includes('localhost') && !currentMongoUri.includes('127.0.0.1')) {
    return true;
  }

  try {
    // Check if mongod is already running by checking port or process
    const isRunning = execSync("pgrep -x mongod || ss -tulpn | grep ':27017' || echo ''", {
      encoding: 'utf-8'
    }).trim();

    if (isRunning) {
      return true;
    }

    // Check if mongod binary is available
    const mongodPath = fs.existsSync('/usr/local/bin/mongod')
      ? '/usr/local/bin/mongod'
      : execSync('which mongod || echo ""', { encoding: 'utf-8' }).trim();

    if (!mongodPath) {
      return false;
    }

    console.log('[MongoDB] Auto-starting local MongoDB daemon on port 27017...');
    fs.mkdirSync('/var/lib/mongodb', { recursive: true });
    fs.mkdirSync('/var/log', { recursive: true });

    execSync(
      `${mongodPath} --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017 --fork --logpath /var/log/mongodb.log`,
      { stdio: 'inherit' }
    );
    console.log('[MongoDB] Local MongoDB daemon successfully launched.');
    return true;
  } catch (err: any) {
    console.warn('[MongoDB] Notice starting local MongoDB daemon:', err.message);
    return false;
  }
}

export async function initMongo(targetUri?: string): Promise<boolean> {
  if (targetUri && targetUri.trim()) {
    currentMongoUri = targetUri.trim();
    saveStoredMongoUri(currentMongoUri);
  }

  ensureLocalMongoDaemon();

  try {
    const maskedUri = currentMongoUri.replace(/:([^:@]{1,})@/, ':****@');
    console.log(`[MongoDB] Connecting to MongoDB at ${maskedUri}...`);

    if (client) {
      try {
        await client.close(true);
      } catch {}
      client = null;
      dbInstance = null;
      isConnected = false;
    }

    client = new MongoClient(currentMongoUri, {
      connectTimeoutMS: 6000,
      serverSelectionTimeoutMS: 6000
    });

    await client.connect();
    
    // Extract database name from URI if present, otherwise fallback
    try {
      const url = new URL(currentMongoUri.startsWith('mongodb+srv://') ? currentMongoUri.replace('mongodb+srv://', 'http://') : currentMongoUri);
      const pathname = url.pathname.replace(/^\//, '').split('?')[0];
      if (pathname) {
        currentDbName = pathname;
      }
    } catch {}

    dbInstance = client.db(currentDbName);
    isConnected = true;
    lastPingTime = Date.now();
    connectionError = null;
    console.log(`[MongoDB] Successfully connected to database: ${currentDbName}`);

    // Create high-performance indexes
    try {
      await dbInstance.collection('users').createIndex({ username: 1 }, { unique: true });
      await dbInstance.collection('users').createIndex({ email: 1 });
      await dbInstance.collection('applications').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('applications').createIndex({ referenceCode: 1 });
      await dbInstance.collection('applications').createIndex({ status: 1 });
      await dbInstance.collection('applications').createIndex({ createdAt: -1 });
      await dbInstance.collection('volunteers').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('idCardRecords').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('idCardRecords').createIndex({ referenceCode: 1 });
      await dbInstance.collection('idCardRecords').createIndex({ issuedAt: -1 });
      await dbInstance.collection('contacts').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('contacts').createIndex({ createdAt: -1 });
      await dbInstance.collection('activityLogs').createIndex({ timestamp: -1 });
      await dbInstance.collection('emailLogs').createIndex({ sentAt: -1 });
      await dbInstance.collection('emailLogs').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('analytics_events').createIndex({ timestamp: -1 });
      await dbInstance.collection('analytics_events').createIndex({ createdAt: -1 });
      await dbInstance.collection('analytics_events').createIndex({ sessionId: 1 });
      await dbInstance.collection('active_visitors').createIndex({ lastSeen: -1 });
      await dbInstance.collection('active_visitors').createIndex({ sessionId: 1 }, { unique: true });
      await dbInstance.collection('supportConversations').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('supportConversations').createIndex({ sessionId: 1 });
      await dbInstance.collection('supportConversations').createIndex({ updatedAt: -1 });
    } catch (idxErr) {
      console.warn('[MongoDB] Index creation notice:', idxErr);
    }

    return true;
  } catch (err: any) {
    isConnected = false;
    connectionError = err.message || 'Connection failed';
    if (currentMongoUri.includes('127.0.0.1') || currentMongoUri.includes('localhost')) {
      console.log('[Database] Local persistent database active (data/persistent_db.json). MongoDB ready to connect when remote MONGODB_URI (e.g. MongoDB Atlas) is configured.');
    } else {
      console.warn('[MongoDB] MongoDB Connection note:', err.message);
    }
    return false;
  }
}

export async function reconnectMongo(newUri: string): Promise<{ success: boolean; message: string; pingMs?: number }> {
  if (!newUri || !newUri.trim()) {
    return { success: false, message: 'Invalid MongoDB connection URI provided.' };
  }
  const cleanUri = newUri.trim();
  const ok = await initMongo(cleanUri);
  if (!ok) {
    return { success: false, message: connectionError || 'Could not connect with provided URI.' };
  }
  let pingMs = 0;
  try {
    const s = Date.now();
    await dbInstance!.command({ ping: 1 });
    pingMs = Date.now() - s;
  } catch {}
  return { success: true, message: `Successfully connected to MongoDB (${pingMs}ms)`, pingMs };
}

export function isMongoConnected(): boolean {
  return isConnected && dbInstance !== null;
}

export function getDb(): Db | null {
  return dbInstance;
}

export async function getMongoStatus() {
  let pingMs = -1;
  if (isMongoConnected() && dbInstance) {
    try {
      const start = Date.now();
      await dbInstance.command({ ping: 1 });
      pingMs = Date.now() - start;
      lastPingTime = Date.now();
    } catch (err: any) {
      isConnected = false;
      connectionError = err.message;
    }
  }

  let collectionsList: string[] = [];
  let counts: Record<string, number> = {};
  if (isMongoConnected() && dbInstance) {
    try {
      const cols = await dbInstance.listCollections().toArray();
      collectionsList = cols.map(c => c.name);
      for (const colName of collectionsList) {
        counts[colName] = await dbInstance.collection(colName).countDocuments();
      }
    } catch {
      // ignore
    }
  }

  return {
    connected: isConnected,
    configured: true,
    uriRedacted: currentMongoUri.replace(/:([^:@]{1,})@/, ':****@'),
    dbName: currentDbName,
    pingMs: pingMs >= 0 ? pingMs : null,
    collections: collectionsList,
    documentCounts: counts,
    lastPing: lastPingTime ? new Date(lastPingTime).toISOString() : null,
    error: connectionError
  };
}

/**
 * Loads all state from MongoDB or seeds it ONLY if this database has never been initialized.
 * Once initialized, it NEVER replaces or overrides customized user data with mock data.
 */
export async function loadOrSeedMongo(fallbackData: DatabaseSchema): Promise<DatabaseSchema> {
  if (!isMongoConnected() || !dbInstance) {
    return fallbackData;
  }

  try {
    const metaCol = dbInstance.collection('system_meta');
    const initMarker = await metaCol.findOne({ _id: 'database_init_status' as any });

    // Check if any users exist in collection
    const usersCount = await dbInstance.collection('users').countDocuments();

    // If never initialized AND no users exist at all, perform first-time initialization
    if (!initMarker && usersCount === 0) {
      console.log('[MongoDB] First-time setup: Seeding initial baseline collections into MongoDB...');
      await syncSchemaToMongo(fallbackData);
      await metaCol.updateOne(
        { _id: 'database_init_status' as any },
        { $set: { initialized: true, initializedAt: new Date().toISOString() } },
        { upsert: true }
      );
      return fallbackData;
    }

    console.log('[MongoDB] Loading user-persisted collections directly from MongoDB...');
    const users = await dbInstance.collection('users').find({}).toArray();
    const applications = await dbInstance.collection('applications').find({}).sort({ createdAt: -1 }).toArray();
    const volunteers = await dbInstance.collection('volunteers').find({}).toArray();
    const idCardRecords = await dbInstance.collection('idCardRecords').find({}).sort({ issuedAt: -1 }).toArray();
    const programs = await dbInstance.collection('programs').find({}).toArray();
    const events = await dbInstance.collection('events').find({}).toArray();
    const news = await dbInstance.collection('news').find({}).toArray();
    const team = await dbInstance.collection('team').find({}).toArray();
    const gallery = await dbInstance.collection('gallery').find({}).toArray();
    const faqsDocs = await dbInstance.collection('faqs').find({}).toArray();
    const faqsSeededMarker = await metaCol.findOne({ _id: 'faqs_seeded' as any });
    const contacts = await dbInstance.collection('contacts').find({}).sort({ createdAt: -1 }).toArray();
    const activityLogs = await dbInstance.collection('activityLogs').find({}).sort({ timestamp: -1 }).limit(200).toArray();
    const emailLogs = await dbInstance.collection('emailLogs').find({}).sort({ sentAt: -1 }).limit(500).toArray();
    const supportConversations = await dbInstance.collection('supportConversations').find({}).sort({ updatedAt: -1 }).limit(500).toArray();
    const meetings = await dbInstance.collection('meetings').find({}).toArray();
    const meetingParticipants = await dbInstance.collection('meeting_participants').find({}).toArray();
    const meetingMessages = await dbInstance.collection('meeting_messages').find({}).toArray();
    const meetingCaptures = await dbInstance.collection('meetingCaptures').find({}).sort({ createdAt: -1 }).toArray();

    const settingsDoc = await dbInstance.collection('settings').findOne({ _id: 'global_settings' as any });

    // Strip MongoDB _id fields to preserve schema purity
    const stripMongoId = (arr: any[]) => arr.map(({ _id, ...rest }) => rest);

    // Ensure initMarker exists so subsequent restarts know the DB is initialized
    if (!initMarker) {
      await metaCol.updateOne(
        { _id: 'database_init_status' as any },
        { $set: { initialized: true, initializedAt: new Date().toISOString() } },
        { upsert: true }
      );
    }

    // If MongoDB existed before FAQs were added, seed default FAQs once and mark as seeded
    let resolvedFaqs = stripMongoId(faqsDocs) as any;
    if (faqsDocs.length === 0 && !faqsSeededMarker && Array.isArray(fallbackData.faqs) && fallbackData.faqs.length > 0) {
      resolvedFaqs = fallbackData.faqs;
      const faqCol = dbInstance.collection('faqs');
      const ops = fallbackData.faqs.map(item => ({
        updateOne: { filter: { id: item.id }, update: { $set: item }, upsert: true }
      }));
      if (ops.length > 0) await faqCol.bulkWrite(ops);
      await metaCol.updateOne(
        { _id: 'faqs_seeded' as any },
        { $set: { seeded: true, seededAt: new Date().toISOString() } },
        { upsert: true }
      );
    } else if (faqsDocs.length > 0 && !faqsSeededMarker) {
      await metaCol.updateOne(
        { _id: 'faqs_seeded' as any },
        { $set: { seeded: true, seededAt: new Date().toISOString() } },
        { upsert: true }
      );
    }

    // EXACT collections are returned. If an array is empty (e.g. user deleted all demo items),
    // it stays empty! It NEVER reverts back to seed/mock data!
    return {
      users: users.length > 0 ? (stripMongoId(users) as any) : fallbackData.users,
      applications: stripMongoId(applications) as any,
      volunteers: stripMongoId(volunteers) as any,
      idCardRecords: stripMongoId(idCardRecords) as any,
      programs: stripMongoId(programs) as any,
      events: stripMongoId(events) as any,
      news: stripMongoId(news) as any,
      team: stripMongoId(team) as any,
      gallery: stripMongoId(gallery) as any,
      faqs: resolvedFaqs,
      contacts: stripMongoId(contacts) as any,
      settings: settingsDoc ? (({ _id, ...s }) => s)(settingsDoc as any) : fallbackData.settings,
      activityLogs: stripMongoId(activityLogs) as any,
      emailLogs: stripMongoId(emailLogs) as any,
      meetings: meetings.length > 0 ? (stripMongoId(meetings) as any) : (fallbackData.meetings || []),
      meetingParticipants: meetingParticipants.length > 0 ? (stripMongoId(meetingParticipants) as any) : (fallbackData.meetingParticipants || []),
      meetingMessages: meetingMessages.length > 0 ? (stripMongoId(meetingMessages) as any) : (fallbackData.meetingMessages || []),
      meetingCaptures: meetingCaptures.length > 0 ? (stripMongoId(meetingCaptures) as any) : (fallbackData.meetingCaptures || []),
      supportConversations: stripMongoId(supportConversations) as any
    };
  } catch (err: any) {
    console.error('[MongoDB] Error loading collections from MongoDB, using fallback state:', err.message);
    return fallbackData;
  }
}

/**
 * Real-time direct entity upsert to MongoDB
 */
export async function mongoUpsert(collectionName: string, id: string, doc: any) {
  if (!isMongoConnected() || !dbInstance) return;
  try {
    const col = dbInstance.collection(collectionName);
    const { _id, ...cleanDoc } = doc;
    if (collectionName === 'settings') {
      await col.updateOne(
        { _id: 'global_settings' as any },
        { $set: { ...cleanDoc, updatedAt: new Date() } },
        { upsert: true }
      );
    } else {
      await col.updateOne(
        { id: id },
        { $set: cleanDoc },
        { upsert: true }
      );
    }
  } catch (err: any) {
    console.error(`[MongoDB] Error upserting to ${collectionName}:`, err.message);
  }
}

/**
 * Real-time direct entity delete from MongoDB
 */
export async function mongoDelete(collectionName: string, id: string) {
  if (!isMongoConnected() || !dbInstance) return;
  try {
    await dbInstance.collection(collectionName).deleteOne({ id: id });
  } catch (err: any) {
    console.error(`[MongoDB] Error deleting from ${collectionName}:`, err.message);
  }
}

/**
 * Save an uploaded media/image file into MongoDB 'media' collection
 * so it permanently survives git pulls, server rebuilds, and fresh deployments.
 */
export async function mongoSaveMedia(filename: string, dataUrl: string, mimeType: string, size?: number) {
  if (!isMongoConnected() || !dbInstance) return null;
  try {
    const col = dbInstance.collection('media');
    await col.updateOne(
      { filename },
      {
        $set: {
          filename,
          dataUrl,
          mimeType,
          size: size || dataUrl.length,
          uploadedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
    return true;
  } catch (err: any) {
    console.error('[MongoDB] Failed to persist media file:', err.message);
    return false;
  }
}

/**
 * Retrieve media/image file from MongoDB by filename
 */
export async function mongoGetMedia(filename: string): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (!isMongoConnected() || !dbInstance) return null;
  try {
    const col = dbInstance.collection('media');
    const doc = await col.findOne({ filename });
    if (doc && doc.dataUrl) {
      return {
        dataUrl: doc.dataUrl,
        mimeType: doc.mimeType || 'image/jpeg'
      };
    }
  } catch (err: any) {
    console.error('[MongoDB] Failed to retrieve media file:', err.message);
  }
  return null;
}

/**
 * Restore all media documents from MongoDB to public/uploads & data/uploads on server startup
 */
export async function mongoRestoreAllMediaToDisk(targetDirs: string[]): Promise<number> {
  if (!isMongoConnected() || !dbInstance) return 0;
  try {
    for (const d of targetDirs) {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    }

    const col = dbInstance.collection('media');
    const cursor = col.find({});
    let count = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (doc && doc.filename && doc.dataUrl) {
        const matches = String(doc.dataUrl).match(/^data:image\/([a-zA-Z0-9.+-]+)(?:;[^;,=]+=[^;,]+)*;base64,([\s\S]+)$/i);
        if (matches) {
          const cleanBase64 = matches[2].replace(/\s+/g, '');
          const buffer = Buffer.from(cleanBase64, 'base64');
          for (const d of targetDirs) {
            const dest = path.join(d, doc.filename);
            if (!fs.existsSync(dest)) {
              fs.writeFileSync(dest, buffer);
            }
          }
          count++;
        }
      }
    }
    return count;
  } catch (err: any) {
    console.warn('[MongoDB] Error restoring media to disk:', err.message);
    return 0;
  }
}

/**
 * Real-time collection cleaner (e.g. for clearing demo mock records)
 */
export async function mongoClearCollections(collectionNames: string[]) {
  if (!isMongoConnected() || !dbInstance) return;
  try {
    for (const name of collectionNames) {
      await dbInstance.collection(name).deleteMany({});
    }
  } catch (err: any) {
    console.error('[MongoDB] Error clearing collections:', err.message);
  }
}

export async function syncSchemaToMongo(schema: DatabaseSchema) {
  if (!isMongoConnected() || !dbInstance) return;

  try {
    const collectionsMap: Record<string, any[]> = {
      users: schema.users,
      applications: schema.applications,
      volunteers: schema.volunteers,
      idCardRecords: schema.idCardRecords || [],
      programs: schema.programs,
      events: schema.events,
      news: schema.news,
      team: schema.team,
      gallery: schema.gallery,
      faqs: schema.faqs || [],
      contacts: schema.contacts,
      activityLogs: schema.activityLogs,
      emailLogs: schema.emailLogs || [],
      meetings: schema.meetings || [],
      meeting_participants: schema.meetingParticipants || [],
      meeting_messages: schema.meetingMessages || [],
      meetingCaptures: schema.meetingCaptures || [],
      supportConversations: schema.supportConversations || []
    };

    for (const [colName, items] of Object.entries(collectionsMap)) {
      const col = dbInstance.collection(colName);
      
      if (!Array.isArray(items) || items.length === 0) {
        // If collection has 0 items in state, clear MongoDB collection too!
        await col.deleteMany({});
        continue;
      }

      // Upsert current items
      const operations = items.map(item => {
        const { _id, ...cleanItem } = item;
        return {
          updateOne: {
            filter: { id: cleanItem.id },
            update: { $set: cleanItem },
            upsert: true
          }
        };
      });

      if (operations.length > 0) {
        await col.bulkWrite(operations);
      }

      // Permanently remove deleted items from MongoDB
      const activeIds = items.map(i => i.id).filter(Boolean);
      if (activeIds.length > 0) {
        await col.deleteMany({ id: { $nin: activeIds } });
      }
    }

    // Settings collection
    if (schema.settings) {
      const { _id, ...cleanSettings } = schema.settings as any;
      await dbInstance.collection('settings').updateOne(
        { _id: 'global_settings' as any },
        { $set: { ...cleanSettings, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    // Tag initialization marker
    await dbInstance.collection('system_meta').updateOne(
      { _id: 'database_init_status' as any },
      { $set: { initialized: true, lastSyncedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error('[MongoDB] Error syncing data:', err);
  }
}

// ----------------------------------------------------
// REALTIME ANALYTICS & INSIGHTS ENGINE (MongoDB + Persistent Local Fallback)
// ----------------------------------------------------

export type AnalyticsRange = '1h' | '24h' | '7d' | '30d' | 'all';

export interface AnalyticsEvent {
  sessionId: string;
  visitorId?: string;
  isReturning?: boolean;
  isAdmin?: boolean;
  path: string;
  referrer?: string;
  referrerDomain?: string;
  trafficSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  device?: string;
  browser?: string;
  os?: string;
  screenWidth?: number;
  screenResolution?: string;
  viewport?: string;
  timezone?: string;
  language?: string;
  durationSeconds?: number;
  ip?: string;
  timestamp: string;
}

export interface ActiveVisitor {
  sessionId: string;
  visitorId?: string;
  isReturning?: boolean;
  isAdmin?: boolean;
  firstSeen?: Date;
  lastSeen: Date;
  entryPath?: string;
  currentPath: string;
  pageViewsInSession?: number;
  durationSeconds?: number;
  trafficSource?: string;
  referrerDomain?: string;
  device?: string;
  browser?: string;
  os?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  ip?: string;
}

export interface AnalyticsOrgContext {
  totalApplications: number;
  pendingApplications: number;
  underReviewApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalVolunteers: number;
  activeVolunteers: number;
  totalInquiries: number;
  unreadInquiries: number;
  widgetInquiries: number;
  contactPageInquiries: number;
  totalPrograms: number;
  totalEvents: number;
  totalNews: number;
  totalMeetings: number;
  liveMeetings: number;
  totalEmailsSent: number;
  recentEmailLogs24h: number;
  interestDistribution: { name: string; count: number }[];
  cityDistribution: { city: string; count: number }[];
}

const ANALYTICS_CACHE_PATH = path.join(process.cwd(), 'data', 'analytics_cache.json');
const inMemoryEvents: AnalyticsEvent[] = [];
const inMemoryVisitors = new Map<string, ActiveVisitor>();
let analyticsPersistTimer: NodeJS.Timeout | null = null;

// Hydrate local analytics cache synchronously at startup so restarts never lose local metrics
(function hydrateAnalyticsCache() {
  try {
    if (fs.existsSync(ANALYTICS_CACHE_PATH)) {
      const raw = fs.readFileSync(ANALYTICS_CACHE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.events)) {
        for (const ev of parsed.events.slice(0, 5000)) {
          if (ev && ev.sessionId && ev.timestamp) {
            inMemoryEvents.push(ev);
          }
        }
      }
      if (Array.isArray(parsed?.visitors)) {
        for (const v of parsed.visitors.slice(0, 2000)) {
          if (v && v.sessionId) {
            inMemoryVisitors.set(v.sessionId, {
              ...v,
              firstSeen: v.firstSeen ? new Date(v.firstSeen) : new Date(v.lastSeen || Date.now()),
              lastSeen: new Date(v.lastSeen || Date.now())
            });
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[Analytics] Could not hydrate local cache:', err?.message);
  }
})();

function scheduleAnalyticsCacheWrite() {
  if (analyticsPersistTimer) return;
  analyticsPersistTimer = setTimeout(() => {
    analyticsPersistTimer = null;
    try {
      const dir = path.dirname(ANALYTICS_CACHE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const visitorsArr = Array.from(inMemoryVisitors.values())
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
        .slice(0, 2000);
      fs.writeFileSync(
        ANALYTICS_CACHE_PATH,
        JSON.stringify({
          events: inMemoryEvents.slice(0, 5000),
          visitors: visitorsArr
        }),
        'utf-8'
      );
    } catch (err: any) {
      console.warn('[Analytics] Could not persist local cache:', err?.message);
    }
  }, 1500);
}

function isAdminPath(p?: string): boolean {
  if (!p) return false;
  const clean = p.trim().toLowerCase();
  return clean === 'admin' || clean.startsWith('admin/') || clean.startsWith('/admin');
}

function deriveTrafficSourceFromReferrer(referrer?: string): { trafficSource: string; referrerDomain: string } {
  if (!referrer) return { trafficSource: 'Direct', referrerDomain: 'Direct' };
  try {
    const u = new URL(referrer);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!host) return { trafficSource: 'Direct', referrerDomain: 'Direct' };
    if (/(google\.|bing\.|yahoo\.|duckduckgo\.|ecosia\.|yandex\.)/.test(host)) {
      return { trafficSource: 'Organic Search', referrerDomain: host };
    }
    if (/(facebook\.|fb\.|l\.facebook\.|instagram\.|l\.instagram\.|t\.co|twitter\.|x\.com|linkedin\.|youtube\.|youtu\.be|tiktok\.|wa\.me|whatsapp\.)/.test(host)) {
      return { trafficSource: 'Social Media', referrerDomain: host };
    }
    return { trafficSource: 'External Referral', referrerDomain: host };
  } catch {
    return { trafficSource: 'Direct', referrerDomain: 'Direct' };
  }
}

export async function recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const derivedRef = deriveTrafficSourceFromReferrer(event.referrer);
  const isAdmin = typeof event.isAdmin === 'boolean' ? event.isAdmin : isAdminPath(event.path);
  const nowDate = event.timestamp ? new Date(event.timestamp) : new Date();

  const eventObj: AnalyticsEvent = {
    ...event,
    isAdmin,
    trafficSource: event.trafficSource || derivedRef.trafficSource,
    referrerDomain: event.referrerDomain || derivedRef.referrerDomain,
    device: event.device || 'Desktop',
    browser: event.browser || 'Unknown',
    os: event.os || 'Unknown',
    durationSeconds: Number(event.durationSeconds) || 0,
    timestamp: nowDate.toISOString()
  };

  // 1. Store in live in-memory registry + schedule local persistence
  inMemoryEvents.unshift(eventObj);
  if (inMemoryEvents.length > 5000) {
    inMemoryEvents.pop();
  }

  // 2. Track / update visitor session summary
  const existing = inMemoryVisitors.get(event.sessionId);
  const nextPageCount = (existing?.pageViewsInSession || 0) + 1;
  inMemoryVisitors.set(event.sessionId, {
    sessionId: event.sessionId,
    visitorId: event.visitorId || existing?.visitorId || event.sessionId,
    isReturning: typeof event.isReturning === 'boolean' ? event.isReturning : Boolean(existing?.isReturning),
    isAdmin,
    firstSeen: existing?.firstSeen || nowDate,
    lastSeen: nowDate,
    entryPath: existing?.entryPath || eventObj.path,
    currentPath: eventObj.path,
    pageViewsInSession: nextPageCount,
    durationSeconds: existing?.durationSeconds || 0,
    trafficSource: existing?.trafficSource || eventObj.trafficSource,
    referrerDomain: existing?.referrerDomain || eventObj.referrerDomain,
    device: eventObj.device,
    browser: eventObj.browser,
    os: eventObj.os,
    screenResolution: eventObj.screenResolution || existing?.screenResolution,
    timezone: eventObj.timezone || existing?.timezone,
    language: eventObj.language || existing?.language,
    ip: eventObj.ip || existing?.ip || 'Unknown'
  });

  scheduleAnalyticsCacheWrite();

  // 3. Persist to MongoDB if connected
  if (isMongoConnected() && dbInstance) {
    try {
      await dbInstance.collection('analytics_events').insertOne({
        ...eventObj,
        createdAt: nowDate
      });

      await dbInstance.collection('active_visitors').updateOne(
        { sessionId: event.sessionId },
        {
          $set: {
            sessionId: event.sessionId,
            visitorId: eventObj.visitorId,
            isReturning: eventObj.isReturning,
            isAdmin,
            lastSeen: nowDate,
            currentPath: eventObj.path,
            trafficSource: existing?.trafficSource || eventObj.trafficSource,
            referrerDomain: existing?.referrerDomain || eventObj.referrerDomain,
            device: eventObj.device,
            browser: eventObj.browser,
            os: eventObj.os,
            screenResolution: eventObj.screenResolution,
            timezone: eventObj.timezone,
            language: eventObj.language,
            ip: eventObj.ip || 'Unknown'
          },
          $setOnInsert: {
            firstSeen: nowDate,
            entryPath: eventObj.path,
            durationSeconds: 0
          },
          $inc: {
            pageViewsInSession: 1
          }
        },
        { upsert: true }
      );
    } catch (err: any) {
      console.warn('[Analytics] MongoDB insert warning:', err.message);
    }
  }
}

export async function recordVisitorHeartbeat(
  sessionId: string,
  reqPath: string,
  durationDeltaSec = 0
): Promise<void> {
  const safeDelta = Math.min(300, Math.max(0, Math.round(Number(durationDeltaSec) || 0)));
  const isAdmin = isAdminPath(reqPath);
  const nowDate = new Date();

  const existing = inMemoryVisitors.get(sessionId);
  if (existing) {
    existing.lastSeen = nowDate;
    existing.currentPath = reqPath;
    existing.isAdmin = isAdmin;
    existing.durationSeconds = (existing.durationSeconds || 0) + safeDelta;
  } else {
    inMemoryVisitors.set(sessionId, {
      sessionId,
      isAdmin,
      firstSeen: nowDate,
      lastSeen: nowDate,
      entryPath: reqPath,
      currentPath: reqPath,
      pageViewsInSession: 1,
      durationSeconds: safeDelta
    });
  }

  // Attribute dwell time to the latest matching pageview event for per-page average dwell
  if (safeDelta > 0) {
    const matchingEv = inMemoryEvents.find(e => e.sessionId === sessionId && e.path === reqPath);
    if (matchingEv) {
      matchingEv.durationSeconds = (matchingEv.durationSeconds || 0) + safeDelta;
    }
  }

  scheduleAnalyticsCacheWrite();

  if (isMongoConnected() && dbInstance) {
    try {
      await dbInstance.collection('active_visitors').updateOne(
        { sessionId },
        {
          $set: {
            lastSeen: nowDate,
            currentPath: reqPath,
            isAdmin
          },
          $setOnInsert: {
            firstSeen: nowDate,
            entryPath: reqPath,
            pageViewsInSession: 1
          },
          ...(safeDelta > 0 ? { $inc: { durationSeconds: safeDelta } } : {})
        },
        { upsert: true }
      );

      if (safeDelta > 0) {
        const latestEvent = await dbInstance
          .collection('analytics_events')
          .find({ sessionId, path: reqPath })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();
        if (latestEvent[0]?._id) {
          await dbInstance
            .collection('analytics_events')
            .updateOne({ _id: latestEvent[0]._id }, { $inc: { durationSeconds: safeDelta } });
        }
      }
    } catch {
      // ignore
    }
  }
}

function getRangeWindowMs(range: AnalyticsRange): number | null {
  switch (range) {
    case '1h':
      return 60 * 60 * 1000;
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    case 'all':
    default:
      return null;
  }
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function buildBreakdown(
  counts: Record<string, number>,
  total: number,
  limit = 8
): { name: string; count: number; percentage: number }[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({
      name,
      count,
      percentage: pct(count, total)
    }));
}

export async function getRealtimeInsights(
  totalApplicationsCount = 0,
  totalVolunteersCount = 0,
  options?: {
    range?: AnalyticsRange;
    includeAdmin?: boolean;
    orgContext?: Partial<AnalyticsOrgContext>;
  }
) {
  const range: AnalyticsRange = options?.range || '24h';
  const includeAdmin = Boolean(options?.includeAdmin);
  const nowMs = Date.now();
  const fiveMinAgoMs = nowMs - 5 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const windowMs = getRangeWindowMs(range);
  const rangeStartMs = windowMs ? nowMs - windowMs : 0;
  const prevRangeStartMs = windowMs ? nowMs - windowMs * 2 : 0;

  let allEvents: AnalyticsEvent[] = [];
  let visitorRecords: ActiveVisitor[] = [];
  let storageMode: 'mongodb' | 'local_persistent' = 'local_persistent';
  let totalAllTimeCountOverride: number | null = null;

  if (isMongoConnected() && dbInstance) {
    try {
      storageMode = 'mongodb';
      const baseQuery: Record<string, any> = includeAdmin
        ? {}
        : { isAdmin: { $ne: true } };

      totalAllTimeCountOverride = await dbInstance
        .collection('analytics_events')
        .countDocuments(baseQuery);

      const mongoEvents = await dbInstance
        .collection('analytics_events')
        .find(baseQuery)
        .sort({ createdAt: -1 })
        .limit(15000)
        .toArray();

      allEvents = mongoEvents.map(({ _id, createdAt, ...rest }: any) => ({
        ...rest,
        timestamp: rest.timestamp || (createdAt ? new Date(createdAt).toISOString() : new Date().toISOString())
      }));

      const mongoVisitors = await dbInstance
        .collection('active_visitors')
        .find(includeAdmin ? {} : { isAdmin: { $ne: true } })
        .sort({ lastSeen: -1 })
        .limit(3000)
        .toArray();

      visitorRecords = mongoVisitors.map(({ _id, ...v }: any) => ({
        ...v,
        lastSeen: new Date(v.lastSeen),
        firstSeen: v.firstSeen ? new Date(v.firstSeen) : new Date(v.lastSeen)
      }));
    } catch (err: any) {
      console.warn('[Analytics] Falling back to persistent local cache:', err.message);
      storageMode = 'local_persistent';
    }
  }

  if (storageMode === 'local_persistent') {
    allEvents = inMemoryEvents.filter(e => {
      const eventIsAdmin = typeof e.isAdmin === 'boolean' ? e.isAdmin : isAdminPath(e.path);
      return includeAdmin || !eventIsAdmin;
    });
    visitorRecords = Array.from(inMemoryVisitors.values()).filter(v => {
      const vIsAdmin = typeof v.isAdmin === 'boolean' ? v.isAdmin : isAdminPath(v.currentPath);
      return includeAdmin || !vIsAdmin;
    });
  }

  // Filter events inside selected timeframe and previous comparison timeframe
  const rangeEvents: AnalyticsEvent[] = [];
  const prevRangeEvents: AnalyticsEvent[] = [];
  let todayPageViews = 0;

  for (const ev of allEvents) {
    const t = new Date(ev.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= startOfTodayMs) todayPageViews++;
    if (!windowMs || t >= rangeStartMs) {
      rangeEvents.push(ev);
    } else if (t >= prevRangeStartMs && t < rangeStartMs) {
      prevRangeEvents.push(ev);
    }
  }

  // Active visitors breakdown (last 5 min) — always compute public vs admin active split from all visitors if available
  const allVisitorSource = storageMode === 'local_persistent'
    ? Array.from(inMemoryVisitors.values())
    : visitorRecords;

  let activePublicVisitors = 0;
  let activeAdminVisitors = 0;
  const activeSessionsList: ActiveVisitor[] = [];

  for (const v of visitorRecords) {
    const lastSeenMs = new Date(v.lastSeen).getTime();
    if (lastSeenMs >= fiveMinAgoMs) {
      activeSessionsList.push(v);
    }
  }

  for (const v of allVisitorSource) {
    const lastSeenMs = new Date(v.lastSeen).getTime();
    if (lastSeenMs >= fiveMinAgoMs) {
      const vIsAdmin = typeof v.isAdmin === 'boolean' ? v.isAdmin : isAdminPath(v.currentPath);
      if (vIsAdmin) activeAdminVisitors++;
      else activePublicVisitors++;
    }
  }

  if (storageMode === 'mongodb' && !includeAdmin) {
    // activeAdminVisitors wouldn't be in filtered visitorRecords; fetch quick count
    try {
      if (dbInstance) {
        activeAdminVisitors = await dbInstance.collection('active_visitors').countDocuments({
          isAdmin: true,
          lastSeen: { $gte: new Date(fiveMinAgoMs) }
        });
      }
    } catch {}
  }

  activeSessionsList.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  const activeVisitors = includeAdmin ? activePublicVisitors + activeAdminVisitors : activePublicVisitors;

  // Build per-session map within selected timeframe for deep engagement analytics
  const visitorDurationLookup = new Map<string, number>();
  for (const v of visitorRecords) {
    if (v.sessionId && typeof v.durationSeconds === 'number') {
      visitorDurationLookup.set(v.sessionId, v.durationSeconds);
    }
  }

  interface SessionSummary {
    sessionId: string;
    visitorId: string;
    isReturning: boolean;
    firstTime: number;
    lastTime: number;
    events: AnalyticsEvent[];
    entryPath: string;
    exitPath: string;
    dwellSeconds: number;
    trafficSource: string;
    referrerDomain: string;
  }

  const sessionMap = new Map<string, SessionSummary>();
  // Process chronological oldest -> newest so first/last events are entry/exit
  const chronoEvents = [...rangeEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const ev of chronoEvents) {
    const ts = new Date(ev.timestamp).getTime();
    const existing = sessionMap.get(ev.sessionId);
    const derivedRef = deriveTrafficSourceFromReferrer(ev.referrer);
    const tSource = ev.trafficSource || derivedRef.trafficSource;
    const rDomain = ev.referrerDomain || derivedRef.referrerDomain;

    if (!existing) {
      sessionMap.set(ev.sessionId, {
        sessionId: ev.sessionId,
        visitorId: ev.visitorId || ev.sessionId,
        isReturning: Boolean(ev.isReturning),
        firstTime: ts,
        lastTime: ts,
        events: [ev],
        entryPath: ev.path || '/',
        exitPath: ev.path || '/',
        dwellSeconds: Number(ev.durationSeconds) || 0,
        trafficSource: tSource,
        referrerDomain: rDomain
      });
    } else {
      existing.events.push(ev);
      existing.lastTime = Math.max(existing.lastTime, ts);
      existing.exitPath = ev.path || existing.exitPath;
      existing.dwellSeconds += Number(ev.durationSeconds) || 0;
      if (ev.isReturning) existing.isReturning = true;
    }
  }

  // Finalize session durations & compute engagement metrics
  let bounceCount = 0;
  let totalDurationSec = 0;
  const distinctVisitorIds = new Set<string>();
  const returningVisitorIds = new Set<string>();
  const newVisitorIds = new Set<string>();
  const entryCounts: Record<string, number> = {};
  const exitCounts: Record<string, number> = {};
  const channelSessionsMap: Record<string, Set<string>> = {};
  let volunteerPageSessions = 0;

  sessionMap.forEach(s => {
    const spanSec = Math.max(0, Math.round((s.lastTime - s.firstTime) / 1000));
    const storedVisitorDur = visitorDurationLookup.get(s.sessionId) || 0;
    const bestDur = Math.max(s.dwellSeconds, spanSec, range === 'all' ? storedVisitorDur : 0);
    s.dwellSeconds = bestDur;
    totalDurationSec += bestDur;

    if (s.events.length <= 1 && bestDur < 15) {
      bounceCount++;
    }

    distinctVisitorIds.add(s.visitorId);
    if (s.isReturning) {
      returningVisitorIds.add(s.visitorId);
    } else {
      newVisitorIds.add(s.visitorId);
    }

    entryCounts[s.entryPath] = (entryCounts[s.entryPath] || 0) + 1;
    exitCounts[s.exitPath] = (exitCounts[s.exitPath] || 0) + 1;

    if (!channelSessionsMap[s.trafficSource]) channelSessionsMap[s.trafficSource] = new Set();
    channelSessionsMap[s.trafficSource].add(s.sessionId);

    if (s.events.some(e => (e.path || '').toLowerCase().includes('volunteer'))) {
      volunteerPageSessions++;
    }
  });

  const rangePageViews = rangeEvents.length;
  const rangeUniqueSessions = sessionMap.size;
  const rangeUniqueVisitors = distinctVisitorIds.size;
  const bounceRate = rangeUniqueSessions > 0 ? Number(((bounceCount / rangeUniqueSessions) * 100).toFixed(1)) : 0;
  const avgPagesPerSession = rangeUniqueSessions > 0 ? Number((rangePageViews / rangeUniqueSessions).toFixed(1)) : 0;
  const avgSessionDurationSec = rangeUniqueSessions > 0 ? Math.round(totalDurationSec / rangeUniqueSessions) : 0;
  const returningVisitors = returningVisitorIds.size;
  const newVisitors = Math.max(0, rangeUniqueVisitors - returningVisitors);
  const returningRate = rangeUniqueVisitors > 0 ? Number(((returningVisitors / rangeUniqueVisitors) * 100).toFixed(1)) : 0;

  // Previous period comparison (real comparison, null if no prior data)
  const prevSessionsSet = new Set(prevRangeEvents.map(e => e.sessionId));
  const viewsDeltaPct =
    windowMs && prevRangeEvents.length > 0
      ? Number((((rangePageViews - prevRangeEvents.length) / prevRangeEvents.length) * 100).toFixed(1))
      : null;
  const sessionsDeltaPct =
    windowMs && prevSessionsSet.size > 0
      ? Number((((rangeUniqueSessions - prevSessionsSet.size) / prevSessionsSet.size) * 100).toFixed(1))
      : null;

  // All-time totals (backwards-compatible fields for AdminDashboard)
  const totalPageViews = totalAllTimeCountOverride !== null ? totalAllTimeCountOverride : allEvents.length;
  const allTimeUniqueSessions = new Set(allEvents.map(e => e.sessionId)).size;
  const uniqueVisitors = range === 'all' ? allTimeUniqueSessions : rangeUniqueSessions;
  const conversionRate = allTimeUniqueSessions > 0
    ? Number(((totalApplicationsCount / allTimeUniqueSessions) * 100).toFixed(1))
    : 0;

  // Aggregations inside selected range
  const pageStatsMap = new Map<string, { views: number; sessions: Set<string>; dwellTotal: number; dwellSamples: number }>();
  const deviceCounts: Record<string, number> = {};
  const browserCounts: Record<string, number> = {};
  const osCounts: Record<string, number> = {};
  const channelCounts: Record<string, number> = {};
  const referrerCounts: Record<string, number> = {};
  const resolutionCounts: Record<string, number> = {};
  const timezoneCounts: Record<string, number> = {};
  const languageCounts: Record<string, number> = {};
  const utmMap = new Map<string, { campaign: string; source: string; medium: string; count: number }>();
  const hourlyDistribution = new Array(24).fill(0) as number[];

  for (const ev of rangeEvents) {
    const p = ev.path || '/';
    let pStat = pageStatsMap.get(p);
    if (!pStat) {
      pStat = { views: 0, sessions: new Set(), dwellTotal: 0, dwellSamples: 0 };
      pageStatsMap.set(p, pStat);
    }
    pStat.views++;
    pStat.sessions.add(ev.sessionId);
    if (ev.durationSeconds && ev.durationSeconds > 0) {
      pStat.dwellTotal += ev.durationSeconds;
      pStat.dwellSamples++;
    }

    const dev = ev.device || 'Desktop';
    deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;

    const br = ev.browser || 'Chrome';
    browserCounts[br] = (browserCounts[br] || 0) + 1;

    const os = ev.os || 'Other';
    osCounts[os] = (osCounts[os] || 0) + 1;

    const derived = deriveTrafficSourceFromReferrer(ev.referrer);
    const ch = ev.trafficSource || derived.trafficSource;
    const dom = ev.referrerDomain || derived.referrerDomain;
    channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    referrerCounts[dom] = (referrerCounts[dom] || 0) + 1;

    if (ev.screenResolution) {
      resolutionCounts[ev.screenResolution] = (resolutionCounts[ev.screenResolution] || 0) + 1;
    }
    if (ev.timezone) {
      timezoneCounts[ev.timezone] = (timezoneCounts[ev.timezone] || 0) + 1;
    }
    if (ev.language) {
      languageCounts[ev.language] = (languageCounts[ev.language] || 0) + 1;
    }

    if (ev.utmCampaign || ev.utmSource) {
      const camp = ev.utmCampaign || '(no campaign)';
      const src = ev.utmSource || 'unknown';
      const med = ev.utmMedium || '—';
      const key = `${camp}|${src}|${med}`;
      const cur = utmMap.get(key) || { campaign: camp, source: src, medium: med, count: 0 };
      cur.count++;
      utmMap.set(key, cur);
    }

    const d = new Date(ev.timestamp);
    if (!Number.isNaN(d.getTime())) {
      hourlyDistribution[d.getHours()]++;
    }
  }

  const topPages = Array.from(pageStatsMap.entries())
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 12)
    .map(([page, st]) => ({
      page,
      views: st.views,
      uniqueVisitors: st.sessions.size,
      percentage: pct(st.views, rangePageViews),
      avgDwellSec: st.dwellSamples > 0 ? Math.round(st.dwellTotal / st.dwellSamples) : 0,
      entries: entryCounts[page] || 0,
      exits: exitCounts[page] || 0
    }));

  const deviceBreakdown = buildBreakdown(deviceCounts, rangePageViews, 5);
  const browserBreakdown = buildBreakdown(browserCounts, rangePageViews, 6);
  const osBreakdown = buildBreakdown(osCounts, rangePageViews, 6);

  const channels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      sessions: channelSessionsMap[name]?.size || 0,
      percentage: pct(count, rangePageViews)
    }));

  const referrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count]) => ({
      domain,
      count,
      percentage: pct(count, rangePageViews)
    }));

  const campaigns = Array.from(utmMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topEntryPages = Object.entries(entryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([page, sessions]) => ({
      page,
      sessions,
      percentage: pct(sessions, rangeUniqueSessions)
    }));

  const topExitPages = Object.entries(exitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([page, sessions]) => ({
      page,
      sessions,
      percentage: pct(sessions, rangeUniqueSessions)
    }));

  const screenResolutions = Object.entries(resolutionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([resolution, count]) => ({
      resolution,
      count,
      percentage: pct(count, rangePageViews)
    }));

  const timezones = Object.entries(timezoneCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([timezone, count]) => ({
      timezone,
      count,
      percentage: pct(count, rangePageViews)
    }));

  const languages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([language, count]) => ({
      language,
      count,
      percentage: pct(count, rangePageViews)
    }));

  // Backwards-compatible 12h hourlyTraffic for AdminDashboard.tsx
  const currentHour = new Date().getHours();
  const twelveHoursMap: Record<number, { views: number; sessions: Set<string> }> = {};
  for (const ev of allEvents) {
    const t = new Date(ev.timestamp).getTime();
    if (!Number.isNaN(t) && nowMs - t <= 12 * 60 * 60 * 1000) {
      const h = new Date(t).getHours();
      if (!twelveHoursMap[h]) twelveHoursMap[h] = { views: 0, sessions: new Set() };
      twelveHoursMap[h].views++;
      twelveHoursMap[h].sessions.add(ev.sessionId);
    }
  }
  const hourlyTraffic = [];
  for (let i = 11; i >= 0; i--) {
    const h = (currentHour - i + 24) % 24;
    hourlyTraffic.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      views: twelveHoursMap[h]?.views || 0,
      visitors: twelveHoursMap[h]?.sessions.size || 0
    });
  }

  // Adaptive trafficTimeline for selected range
  const trafficTimeline: { label: string; views: number; sessions: number }[] = [];
  if (range === '1h') {
    // 12 buckets of 5 minutes
    const bucketSize = 5 * 60 * 1000;
    const buckets: { views: number; sessions: Set<string>; start: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const bStart = nowMs - (i + 1) * bucketSize;
      buckets.push({ views: 0, sessions: new Set(), start: bStart });
    }
    for (const ev of rangeEvents) {
      const t = new Date(ev.timestamp).getTime();
      const idx = Math.floor((t - (nowMs - 12 * bucketSize)) / bucketSize);
      if (idx >= 0 && idx < 12) {
        buckets[idx].views++;
        buckets[idx].sessions.add(ev.sessionId);
      }
    }
    buckets.forEach(b => {
      const d = new Date(b.start + bucketSize);
      trafficTimeline.push({
        label: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
        views: b.views,
        sessions: b.sessions.size
      });
    });
  } else if (range === '24h') {
    // Rolling 24 hours
    const bucketSize = 60 * 60 * 1000;
    const baseTime = new Date();
    baseTime.setMinutes(0, 0, 0);
    const endHourMs = baseTime.getTime() + bucketSize;
    const start24Ms = endHourMs - 24 * bucketSize;
    const buckets: { views: number; sessions: Set<string>; hourDate: Date }[] = [];
    for (let i = 0; i < 24; i++) {
      buckets.push({ views: 0, sessions: new Set(), hourDate: new Date(start24Ms + i * bucketSize) });
    }
    for (const ev of rangeEvents) {
      const t = new Date(ev.timestamp).getTime();
      const idx = Math.floor((t - start24Ms) / bucketSize);
      if (idx >= 0 && idx < 24) {
        buckets[idx].views++;
        buckets[idx].sessions.add(ev.sessionId);
      }
    }
    buckets.forEach(b => {
      trafficTimeline.push({
        label: `${b.hourDate.getHours().toString().padStart(2, '0')}:00`,
        views: b.views,
        sessions: b.sessions.size
      });
    });
  } else {
    // Daily buckets: 7d = 7 days, 30d = 30 days, all = 14 days
    const daysCount = range === '30d' ? 30 : range === '7d' ? 7 : 14;
    const dayMap = new Map<string, { label: string; views: number; sessions: Set<string> }>();
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().split('T')[0];
      const lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayMap.set(iso, { label: lbl, views: 0, sessions: new Set() });
    }
    for (const ev of rangeEvents) {
      const d = new Date(ev.timestamp);
      if (Number.isNaN(d.getTime())) continue;
      const iso = d.toISOString().split('T')[0];
      const entry = dayMap.get(iso);
      if (entry) {
        entry.views++;
        entry.sessions.add(ev.sessionId);
      }
    }
    dayMap.forEach(v => {
      trafficTimeline.push({
        label: v.label,
        views: v.views,
        sessions: v.sessions.size
      });
    });
  }

  // 24-hour distribution heatmap
  let peakHourIdx = 0;
  let peakHourViews = -1;
  const hourlyHeatmap = hourlyDistribution.map((views, h) => {
    if (views > peakHourViews) {
      peakHourViews = views;
      peakHourIdx = h;
    }
    return {
      hour: `${h.toString().padStart(2, '0')}:00`,
      views
    };
  });
  const peakHourLabel =
    peakHourViews > 0
      ? `${peakHourIdx.toString().padStart(2, '0')}:00 – ${((peakHourIdx + 1) % 24).toString().padStart(2, '0')}:00`
      : 'No traffic yet';

  // Organization & Conversion Funnel Intelligence
  const org = options?.orgContext || {};
  const totalApps = org.totalApplications ?? totalApplicationsCount;
  const approvedApps = org.approvedApplications ?? totalVolunteersCount;
  const funnelReach = Math.max(allTimeUniqueSessions, rangeUniqueSessions);
  const funnelVolunteerVisits = Math.max(
    volunteerPageSessions,
    totalApps > 0 ? Math.min(funnelReach, totalApps) : 0
  );

  const conversionFunnel = [
    {
      stage: 'Unique Sessions',
      count: funnelReach,
      percentage: 100
    },
    {
      stage: 'Volunteer Page Visits',
      count: funnelVolunteerVisits,
      percentage: funnelReach > 0 ? Math.min(100, Math.round((funnelVolunteerVisits / funnelReach) * 100)) : 0
    },
    {
      stage: 'Applications Submitted',
      count: totalApps,
      percentage: funnelReach > 0 ? Math.min(100, Math.round((totalApps / funnelReach) * 100)) : 0
    },
    {
      stage: 'Approved Volunteers',
      count: approvedApps,
      percentage: totalApps > 0 ? Math.min(100, Math.round((approvedApps / totalApps) * 100)) : 0
    }
  ];

  const recentActivity = rangeEvents.slice(0, 60).map(ev => ({
    ...ev,
    page: ev.path || '/'
  }));

  return {
    activeVisitors,
    activePublicVisitors,
    activeAdminVisitors,
    totalPageViews,
    rangePageViews,
    todayPageViews,
    uniqueVisitors,
    allTimeUniqueVisitors: allTimeUniqueSessions,
    conversionRate,
    topPages,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    hourlyTraffic,
    trafficTimeline,
    hourlyHeatmap,
    peakHourLabel,
    engagement: {
      rangePageViews,
      rangeUniqueSessions,
      rangeUniqueVisitors,
      newVisitors,
      returningVisitors,
      returningRate,
      bounceRate,
      avgPagesPerSession,
      avgSessionDurationSec,
      viewsDeltaPct,
      sessionsDeltaPct
    },
    acquisition: {
      channels,
      referrers,
      campaigns
    },
    techDetails: {
      screenResolutions,
      timezones,
      languages
    },
    entryExitPages: {
      topEntryPages,
      topExitPages
    },
    conversionFunnel,
    orgIntelligence: {
      totalApplications: totalApps,
      pendingApplications: org.pendingApplications ?? 0,
      underReviewApplications: org.underReviewApplications ?? 0,
      approvedApplications: approvedApps,
      rejectedApplications: org.rejectedApplications ?? 0,
      totalVolunteers: org.totalVolunteers ?? totalVolunteersCount,
      activeVolunteers: org.activeVolunteers ?? totalVolunteersCount,
      totalInquiries: org.totalInquiries ?? 0,
      unreadInquiries: org.unreadInquiries ?? 0,
      widgetInquiries: org.widgetInquiries ?? 0,
      contactPageInquiries: org.contactPageInquiries ?? 0,
      totalPrograms: org.totalPrograms ?? 0,
      totalEvents: org.totalEvents ?? 0,
      totalNews: org.totalNews ?? 0,
      totalMeetings: org.totalMeetings ?? 0,
      liveMeetings: org.liveMeetings ?? 0,
      totalEmailsSent: org.totalEmailsSent ?? 0,
      recentEmailLogs24h: org.recentEmailLogs24h ?? 0,
      interestDistribution: org.interestDistribution || [],
      cityDistribution: org.cityDistribution || []
    },
    rangeMeta: {
      range,
      includeAdmin,
      storageMode,
      generatedAt: new Date().toISOString()
    },
    recentActivity,
    activeSessionsList: activeSessionsList.slice(0, 30)
  };
}

export async function testMongoConnection(uri: string): Promise<{ success: boolean; message: string; pingMs?: number }> {
  let testClient: MongoClient | null = null;
  try {
    const start = Date.now();
    testClient = new MongoClient(uri, {
      connectTimeoutMS: 4000,
      serverSelectionTimeoutMS: 4000
    });
    await testClient.connect();
    await testClient.db().command({ ping: 1 });
    const pingMs = Date.now() - start;
    await testClient.close();
    return { success: true, message: 'Connected successfully to MongoDB server!', pingMs };
  } catch (err: any) {
    if (testClient) {
      try { await testClient.close(); } catch {}
    }
    return { success: false, message: err.message || 'Could not connect to MongoDB server.' };
  }
}
