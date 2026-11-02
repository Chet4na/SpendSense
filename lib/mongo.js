import { MongoClient } from 'mongodb';

const g = globalThis;
const pending = []; // logs that failed to write; retried on the next successful write

export function getDb() {
  if (!g._ssMongo) {
    g._ssMongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', { serverSelectionTimeoutMS: 2000 })
      .connect()
      .then(async (c) => {
        const db = c.db(process.env.MONGODB_DB || 'spendsense_logs');
        await db.collection('audit_logs').createIndex({ user_id: 1, ts: -1 });
        await db.collection('activity_events').createIndex({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
        await db.collection('activity_events').createIndex({ action: 1, ts: -1 });
        return db;
      })
      .catch((e) => { g._ssMongo = null; throw e; });
  }
  return g._ssMongo;
}

async function write(col, doc) {
  try {
    const db = await getDb();
    while (pending.length) {
      await db.collection(pending[0].col).insertOne(pending[0].doc);
      pending.shift();
    }
    await db.collection(col).insertOne(doc);
  } catch (e) {
    pending.push({ col, doc });
    if (pending.length > 500) pending.shift();
    console.error('[mongo] log deferred:', e.message);
  }
}

// Fire-and-forget: a MongoDB outage never breaks a MySQL operation.
export const audit = (user_id, action, entity, entity_id, before, after) =>
  void write('audit_logs', { user_id, action, entity, entity_id, before: before ?? null, after: after ?? null, ts: new Date() });
export const activity = (user_id, action, meta = {}) =>
  void write('activity_events', { user_id, action, meta, ts: new Date() });
