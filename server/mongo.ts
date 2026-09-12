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
      await dbInstance.collection('contacts').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('contacts').createIndex({ createdAt: -1 });
      await dbInstance.collection('activityLogs').createIndex({ timestamp: -1 });
      await dbInstance.collection('analytics_events').createIndex({ timestamp: -1 });
      await dbInstance.collection('analytics_events').createIndex({ sessionId: 1 });
      await dbInstance.collection('active_visitors').createIndex({ lastSeen: -1 });
      await dbInstance.collection('active_visitors').createIndex({ sessionId: 1 }, { unique: true });
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
    const programs = await dbInstance.collection('programs').find({}).toArray();
    const events = await dbInstance.collection('events').find({}).toArray();
    const news = await dbInstance.collection('news').find({}).toArray();
    const team = await dbInstance.collection('team').find({}).toArray();
    const gallery = await dbInstance.collection('gallery').find({}).toArray();
    const contacts = await dbInstance.collection('contacts').find({}).sort({ createdAt: -1 }).toArray();
    const activityLogs = await dbInstance.collection('activityLogs').find({}).sort({ timestamp: -1 }).limit(200).toArray();

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

    // EXACT collections are returned. If an array is empty (e.g. user deleted all demo items),
    // it stays empty! It NEVER reverts back to seed/mock data!
    return {
      users: users.length > 0 ? (stripMongoId(users) as any) : fallbackData.users,
      applications: stripMongoId(applications) as any,
      volunteers: stripMongoId(volunteers) as any,
      programs: stripMongoId(programs) as any,
      events: stripMongoId(events) as any,
      news: stripMongoId(news) as any,
      team: stripMongoId(team) as any,
      gallery: stripMongoId(gallery) as any,
      contacts: stripMongoId(contacts) as any,
      settings: settingsDoc ? (({ _id, ...s }) => s)(settingsDoc as any) : fallbackData.settings,
      activityLogs: stripMongoId(activityLogs) as any
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
        const matches = doc.dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
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
      programs: schema.programs,
      events: schema.events,
      news: schema.news,
      team: schema.team,
      gallery: schema.gallery,
      contacts: schema.contacts,
      activityLogs: schema.activityLogs
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
// REALTIME ANALYTICS & INSIGHTS ENGINE (MongoDB + Live Synchronized)
// ----------------------------------------------------

export interface AnalyticsEvent {
  sessionId: string;
  path: string;
  referrer?: string;
  device?: string;
  browser?: string;
  os?: string;
  screenWidth?: number;
  ip?: string;
  timestamp: string;
}

export interface ActiveVisitor {
  sessionId: string;
  lastSeen: Date;
  currentPath: string;
  device?: string;
  browser?: string;
  os?: string;
  ip?: string;
}

// In-memory real-time live cache (persists during runtime & syncs with MongoDB)
const inMemoryEvents: AnalyticsEvent[] = [];
const inMemoryVisitors = new Map<string, ActiveVisitor>();

export async function recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const eventObj: AnalyticsEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  };

  // 1. Store in live in-memory registry
  inMemoryEvents.unshift(eventObj);
  if (inMemoryEvents.length > 5000) {
    inMemoryEvents.pop();
  }

  // 2. Track / update active visitor
  inMemoryVisitors.set(event.sessionId, {
    sessionId: event.sessionId,
    lastSeen: new Date(),
    currentPath: event.path,
    device: event.device || 'Desktop',
    browser: event.browser || 'Unknown',
    os: event.os || 'Unknown',
    ip: event.ip || 'Unknown'
  });

  // 3. Persist to MongoDB if connected
  if (isMongoConnected() && dbInstance) {
    try {
      await dbInstance.collection('analytics_events').insertOne({
        ...eventObj,
        createdAt: new Date(eventObj.timestamp)
      });

      await dbInstance.collection('active_visitors').updateOne(
        { sessionId: event.sessionId },
        {
          $set: {
            sessionId: event.sessionId,
            lastSeen: new Date(),
            currentPath: event.path,
            device: event.device || 'Desktop',
            browser: event.browser || 'Unknown',
            os: event.os || 'Unknown',
            ip: event.ip || 'Unknown'
          }
        },
        { upsert: true }
      );
    } catch (err: any) {
      console.warn('[Analytics] MongoDB insert warning:', err.message);
    }
  }
}

export async function recordVisitorHeartbeat(sessionId: string, path: string): Promise<void> {
  const existing = inMemoryVisitors.get(sessionId);
  if (existing) {
    existing.lastSeen = new Date();
    existing.currentPath = path;
  } else {
    inMemoryVisitors.set(sessionId, {
      sessionId,
      lastSeen: new Date(),
      currentPath: path
    });
  }

  if (isMongoConnected() && dbInstance) {
    try {
      await dbInstance.collection('active_visitors').updateOne(
        { sessionId },
        {
          $set: {
            lastSeen: new Date(),
            currentPath: path
          }
        },
        { upsert: true }
      );
    } catch {
      // ignore
    }
  }
}

export async function getRealtimeInsights(totalApplicationsCount = 0, totalVolunteersCount = 0) {
  // If MongoDB is connected and has records, use MongoDB aggregation
  if (isMongoConnected() && dbInstance) {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const activeVisitors = await dbInstance
        .collection('active_visitors')
        .countDocuments({ lastSeen: { $gte: fiveMinutesAgo } });

      const totalPageViews = await dbInstance.collection('analytics_events').countDocuments();
      const todayPageViews = await dbInstance
        .collection('analytics_events')
        .countDocuments({ createdAt: { $gte: startOfToday } });

      const uniqueSessionDocs = await dbInstance.collection('analytics_events').distinct('sessionId');
      const uniqueVisitors = uniqueSessionDocs.length;

      const pageAgg = await dbInstance.collection('analytics_events').aggregate([
        { $group: { _id: '$path', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]).toArray();

      const topPages = pageAgg.map(p => ({
        page: p._id || '/',
        views: p.count,
        percentage: totalPageViews > 0 ? Math.round((p.count / totalPageViews) * 100) : 0
      }));

      const deviceAgg = await dbInstance.collection('analytics_events').aggregate([
        { $group: { _id: '$device', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();

      const deviceBreakdown = deviceAgg.map(d => ({
        name: d._id || 'Desktop',
        count: d.count,
        percentage: totalPageViews > 0 ? Math.round((d.count / totalPageViews) * 100) : 0
      }));

      const browserAgg = await dbInstance.collection('analytics_events').aggregate([
        { $group: { _id: '$browser', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).toArray();

      const browserBreakdown = browserAgg.map(b => ({
        name: b._id || 'Chrome',
        count: b.count,
        percentage: totalPageViews > 0 ? Math.round((b.count / totalPageViews) * 100) : 0
      }));

      const osAgg = await dbInstance.collection('analytics_events').aggregate([
        { $group: { _id: '$os', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).toArray();

      const osBreakdown = osAgg.map(o => ({
        name: o._id || 'Other',
        count: o.count,
        percentage: totalPageViews > 0 ? Math.round((o.count / totalPageViews) * 100) : 0
      }));

      const conversionRate = uniqueVisitors > 0
        ? Number(((totalApplicationsCount / uniqueVisitors) * 100).toFixed(1))
        : 0;

      const recentActivity = await dbInstance
        .collection('analytics_events')
        .find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();

      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const hourlyAgg = await dbInstance.collection('analytics_events').aggregate([
        { $match: { createdAt: { $gte: twelveHoursAgo } } },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            views: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]).toArray();

      const hoursMap = new Map(hourlyAgg.map(h => [h._id, h.views]));
      const hourlyTraffic = [];
      const currentHour = new Date().getHours();
      for (let i = 11; i >= 0; i--) {
        const h = (currentHour - i + 24) % 24;
        hourlyTraffic.push({
          hour: `${h.toString().padStart(2, '0')}:00`,
          views: hoursMap.get(h) || 0
        });
      }

      // Active visitor sessions list
      const activeSessionsList = await dbInstance
        .collection('active_visitors')
        .find({ lastSeen: { $gte: fiveMinutesAgo } })
        .sort({ lastSeen: -1 })
        .limit(10)
        .toArray();

      return {
        activeVisitors,
        totalPageViews,
        todayPageViews,
        uniqueVisitors,
        topPages,
        deviceBreakdown,
        browserBreakdown,
        osBreakdown,
        conversionRate,
        hourlyTraffic,
        recentActivity: recentActivity.map(({ _id, ...r }) => r),
        activeSessionsList: activeSessionsList.map(({ _id, ...s }) => s)
      };
    } catch (err: any) {
      console.warn('[Analytics] Fallback to in-memory store:', err.message);
    }
  }

  // Pure Real-Time In-Memory Engine (Accurate calculations from actual incoming telemetry)
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Active visitors
  let activeVisitors = 0;
  const activeSessionsList: any[] = [];
  inMemoryVisitors.forEach(v => {
    const elapsed = now - new Date(v.lastSeen).getTime();
    if (elapsed < fiveMin) {
      activeVisitors++;
      activeSessionsList.push(v);
    }
  });

  // 2. Total and Today page views
  const totalPageViews = inMemoryEvents.length;
  const todayPageViews = inMemoryEvents.filter(e => e.timestamp.startsWith(todayStr)).length;

  // 3. Unique sessions
  const uniqueSessions = new Set(inMemoryEvents.map(e => e.sessionId));
  const uniqueVisitors = uniqueSessions.size;

  // 4. Top pages
  const pageMap: Record<string, number> = {};
  inMemoryEvents.forEach(e => {
    const p = e.path || '/';
    pageMap[p] = (pageMap[p] || 0) + 1;
  });
  const topPages = Object.entries(pageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([page, views]) => ({
      page,
      views,
      percentage: totalPageViews > 0 ? Math.round((views / totalPageViews) * 100) : 0
    }));

  // 5. Devices
  const deviceMap: Record<string, number> = {};
  inMemoryEvents.forEach(e => {
    const d = e.device || 'Desktop';
    deviceMap[d] = (deviceMap[d] || 0) + 1;
  });
  const deviceBreakdown = Object.entries(deviceMap)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalPageViews > 0 ? Math.round((count / totalPageViews) * 100) : 0
    }));

  // 6. Browsers
  const browserMap: Record<string, number> = {};
  inMemoryEvents.forEach(e => {
    const b = e.browser || 'Chrome';
    browserMap[b] = (browserMap[b] || 0) + 1;
  });
  const browserBreakdown = Object.entries(browserMap)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalPageViews > 0 ? Math.round((count / totalPageViews) * 100) : 0
    }));

  // 7. Operating Systems
  const osMap: Record<string, number> = {};
  inMemoryEvents.forEach(e => {
    const o = e.os || 'Other';
    osMap[o] = (osMap[o] || 0) + 1;
  });
  const osBreakdown = Object.entries(osMap)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalPageViews > 0 ? Math.round((count / totalPageViews) * 100) : 0
    }));

  // 8. Conversion
  const conversionRate = uniqueVisitors > 0
    ? Number(((totalApplicationsCount / uniqueVisitors) * 100).toFixed(1))
    : 0;

  // 9. Hourly traffic
  const currentHour = new Date().getHours();
  const hourlyCounts: Record<number, number> = {};
  inMemoryEvents.forEach(e => {
    const d = new Date(e.timestamp);
    if (now - d.getTime() <= 12 * 60 * 60 * 1000) {
      const h = d.getHours();
      hourlyCounts[h] = (hourlyCounts[h] || 0) + 1;
    }
  });

  const hourlyTraffic = [];
  for (let i = 11; i >= 0; i--) {
    const h = (currentHour - i + 24) % 24;
    hourlyTraffic.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      views: hourlyCounts[h] || 0
    });
  }

  return {
    activeVisitors,
    totalPageViews,
    todayPageViews,
    uniqueVisitors,
    topPages,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    conversionRate,
    hourlyTraffic,
    recentActivity: inMemoryEvents.slice(0, 20),
    activeSessionsList: activeSessionsList.slice(0, 10)
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
