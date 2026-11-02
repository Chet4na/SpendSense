import { pool } from '@/lib/db';
import { json, bad, route, requireUser, isPeriod, currentPeriod } from '@/lib/auth';
import { audit } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const s = await requireUser();
  const period = req.nextUrl.searchParams.get('period') || currentPeriod();
  if (!isPeriod(period)) return bad('Period must look like 2026-10.');
  const [rows] = await pool.query('SELECT * FROM v_budget_status WHERE user_id=? AND period=? ORDER BY pct_used DESC', [s.uid, period]);
  return json({ budgets: rows });
});

// Create or update a budget, then re-run the alert check for it.
export const POST = route(async (req) => {
  const s = await requireUser();
  const b = await req.json().catch(() => ({}));
  const cat = Number(b.category_id), limit = Number(b.limit_amount);
  if (!isPeriod(b.period)) return bad('Choose a valid month.');
  if (!cat) return bad('Choose a category.');
  if (!(limit > 0)) return bad('Budget limit must be greater than zero.');
  const [c] = await pool.query("SELECT category_id FROM categories WHERE category_id=? AND type='expense'", [cat]);
  if (!c.length) return bad('Budgets can only be set for expense categories.');
  await pool.query(
    'INSERT INTO budgets (user_id,category_id,period,limit_amount) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE limit_amount=VALUES(limit_amount)',
    [s.uid, cat, b.period, limit]);
  const [[row]] = await pool.query('SELECT budget_id FROM budgets WHERE user_id=? AND category_id=? AND period=?', [s.uid, cat, b.period]);
  await pool.query('DELETE FROM alerts WHERE budget_id=?', [row.budget_id]);
  await pool.query('CALL sp_check_budget(?,?,?)', [s.uid, cat, b.period]);
  audit(s.uid, 'upsert', 'budget', row.budget_id, null, { category_id: cat, period: b.period, limit });
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const s = await requireUser();
  const id = Number(req.nextUrl.searchParams.get('id'));
  const [r] = await pool.query('DELETE FROM budgets WHERE budget_id=? AND user_id=?', [id, s.uid]);
  if (!r.affectedRows) return bad('Budget not found.');
  audit(s.uid, 'delete', 'budget', id, null, null);
  return json({ ok: true });
});
