import { ObjectId } from 'mongodb';
import { pool } from '@/lib/db';
import { getDb } from '@/lib/mongo';
import { json, bad, route, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireAdmin();
  const view = req.nextUrl.searchParams.get('view') || 'users';

  if (view === 'users') {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.role, u.created_at, COUNT(t.txn_id) AS txn_count,
              COALESCE(SUM(CASE WHEN c.type='expense' THEN t.amount END),0) AS total_spent
         FROM users u LEFT JOIN transactions t ON t.user_id = u.user_id
         LEFT JOIN categories c ON c.category_id = t.category_id
        GROUP BY u.user_id, u.name, u.email, u.role, u.created_at ORDER BY u.user_id`);
    return json({ users: rows });
  }

  let db;
  try { db = await getDb(); } catch { return json({ mongo: false }); }

  if (view === 'audit') {
    // READ: optional filters on entity and on review state.
    const q = {};
    const entity = req.nextUrl.searchParams.get('entity');
    const reviewed = req.nextUrl.searchParams.get('reviewed');
    if (entity) q.entity = String(entity);
    if (reviewed === 'yes') q.reviewed = true;
    if (reviewed === 'no') q.reviewed = { $ne: true };
    const logs = await db.collection('audit_logs').find(q).sort({ ts: -1 }).limit(60).toArray();
    const activityCount = await db.collection('activity_events').countDocuments();
    return json({ mongo: true, activityCount, logs: logs.map((l) => ({ ...l, _id: String(l._id) })) });
  }

  if (view === 'analytics') {
    const since = new Date(Date.now() - 14 * 86400000);
    const perDay = await db.collection('activity_events').aggregate([
      { $match: { ts: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, events: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    const perAction = await db.collection('activity_events').aggregate([
      { $group: { _id: '$action', events: { $sum: 1 } } }, { $sort: { events: -1 } },
    ]).toArray();
    const topUsers = await db.collection('activity_events').aggregate([
      { $match: { user_id: { $ne: null } } },
      { $group: { _id: '$user_id', events: { $sum: 1 } } }, { $sort: { events: -1 } }, { $limit: 5 },
    ]).toArray();
    const auditByEntity = await db.collection('audit_logs').aggregate([
      { $group: { _id: { entity: '$entity', action: '$action' }, n: { $sum: 1 } } }, { $sort: { n: -1 } },
    ]).toArray();
    let names = {};
    if (topUsers.length) {
      const [u] = await pool.query('SELECT user_id,name FROM users WHERE user_id IN (?)', [topUsers.map((t) => t._id)]);
      names = Object.fromEntries(u.map((x) => [x.user_id, x.name]));
    }
    return json({ mongo: true, perDay, perAction,
      topUsers: topUsers.map((t) => ({ user: names[t._id] || 'User #' + t._id, events: t.events })),
      auditByEntity: auditByEntity.map((a) => ({ entity: a._id.entity, action: a._id.action, n: a.n })) });
  }
  return bad('Unknown view.');
});

export const PUT = route(async (req) => {
  const s = await requireAdmin();
  const b = await req.json().catch(() => ({}));
  const id = Number(b.user_id);
  if (!['user', 'admin'].includes(b.role)) return bad('Role must be user or admin.');
  if (id === s.uid) return bad('You cannot change your own role.');
  const [r] = await pool.query('UPDATE users SET role=? WHERE user_id=?', [b.role, id]);
  if (!r.affectedRows) return bad('User not found.');
  audit(s.uid, 'update', 'user', id, null, { role: b.role });
  return json({ ok: true });
});

// UPDATE (MongoDB): an admin marks an audit entry as reviewed, with an optional note.
export const PATCH = route(async (req) => {
  const s = await requireAdmin();
  const b = await req.json().catch(() => ({}));
  if (!ObjectId.isValid(String(b.log_id || ''))) return bad('Invalid log id.');
  const reviewed = b.reviewed !== false;
  const note = String(b.note || '').trim().slice(0, 200);
  let db;
  try { db = await getDb(); } catch { return json({ error: 'MongoDB is not reachable.' }, 503); }
  const update = reviewed
    ? { $set: { reviewed: true, reviewed_by: s.uid, reviewed_at: new Date(), review_note: note } }
    : { $set: { reviewed: false }, $unset: { reviewed_by: '', reviewed_at: '', review_note: '' } };
  const r = await db.collection('audit_logs').updateOne({ _id: new ObjectId(String(b.log_id)) }, update);
  if (!r.matchedCount) return bad('Log entry not found.');
  return json({ ok: true, modified: r.modifiedCount });
});

// DELETE (MongoDB): remove activity events older than N days (the TTL index does this
// automatically after 90 days; this lets an admin clean up sooner).
export const DELETE = route(async (req) => {
  const s = await requireAdmin();
  const days = Number(req.nextUrl.searchParams.get('older_than_days'));
  if (!Number.isInteger(days) || days < 1 || days > 365) return bad('Days must be a whole number from 1 to 365.');
  let db;
  try { db = await getDb(); } catch { return json({ error: 'MongoDB is not reachable.' }, 503); }
  const cutoff = new Date(Date.now() - days * 86400000);
  const r = await db.collection('activity_events').deleteMany({ ts: { $lt: cutoff } });
  audit(s.uid, 'delete', 'activity_events', null, null, { older_than_days: days, deleted: r.deletedCount });
  return json({ ok: true, deleted: r.deletedCount });
});
