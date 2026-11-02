import { pool } from '@/lib/db';
import { json, route, requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireUser();
  const [rows] = await pool.query(
    `SELECT a.alert_id, a.level, a.message, a.spent, a.is_read, a.created_at, c.name AS category, b.period, b.limit_amount
       FROM alerts a JOIN budgets b ON b.budget_id = a.budget_id JOIN categories c ON c.category_id = b.category_id
      WHERE a.user_id = ? ORDER BY a.created_at DESC, a.alert_id DESC LIMIT 100`, [s.uid]);
  return json({ alerts: rows, unread: rows.filter((a) => !a.is_read).length });
});

export const PUT = route(async () => {
  const s = await requireUser();
  await pool.query('UPDATE alerts SET is_read=1 WHERE user_id=?', [s.uid]);
  return json({ ok: true });
});
