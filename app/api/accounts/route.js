import { pool } from '@/lib/db';
import { json, bad, route, requireUser } from '@/lib/auth';
import { audit, activity } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireUser();
  const [rows] = await pool.query('SELECT account_id,name,balance FROM accounts WHERE user_id=? ORDER BY name', [s.uid]);
  return json({ accounts: rows, total: rows.reduce((t, a) => t + Number(a.balance), 0) });
});

export const POST = route(async (req) => {
  const s = await requireUser();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  const opening = Number(b.opening_balance || 0);
  if (!name || name.length > 60) return bad('Account name is required (max 60 characters).');
  if (!(opening >= 0)) return bad('Opening balance cannot be negative.');
  const [r] = await pool.query('INSERT INTO accounts (user_id,name,balance) VALUES (?,?,?)', [s.uid, name, opening]);
  audit(s.uid, 'create', 'account', r.insertId, null, { name, opening });
  return json({ ok: true, account_id: r.insertId });
});

// Transfer between two of the user's accounts: one atomic SQL transaction.
export const PUT = route(async (req) => {
  const s = await requireUser();
  const b = await req.json().catch(() => ({}));
  const from = Number(b.from_id), to = Number(b.to_id), amount = Number(b.amount);
  if (!from || !to || from === to) return bad('Pick two different accounts.');
  if (!(amount > 0)) return bad('Amount must be greater than zero.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT account_id FROM accounts WHERE user_id=? AND account_id IN (?,?) FOR UPDATE', [s.uid, from, to]);
    if (rows.length !== 2) { await conn.rollback(); return bad('Account not found.'); }
    await conn.query('UPDATE accounts SET balance = balance - ? WHERE account_id=?', [amount, from]);
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE account_id=?', [amount, to]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  audit(s.uid, 'transfer', 'account', from, null, { to, amount });
  activity(s.uid, 'transfer');
  return json({ ok: true });
});
