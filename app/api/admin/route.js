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
    const entity = req.nextUrl.searchParams.get('entity');
    const logs = await db.collection('audit_logs').find(entity ? { entity: String(entity) } : {}).sort({ ts: -1 }).limit(60).toArray();
    return json({ mongo: true, logs: logs.map((l) => ({ ...l, _id: String(l._id) })) });
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
