import { pool } from '@/lib/db';
import { json, bad, route, requireUser, isDate } from '@/lib/auth';
import { audit, activity } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

async function newAlerts(uid, sinceId) {
  const [rows] = await pool.query('SELECT alert_id,level,message FROM alerts WHERE user_id=? AND alert_id>? ORDER BY alert_id', [uid, sinceId]);
  return rows;
}
const maxAlert = async () => (await pool.query('SELECT COALESCE(MAX(alert_id),0) AS m FROM alerts'))[0][0].m;

function validate(b) {
  const amount = Number(b.amount);
  if (!(amount > 0) || amount > 9999999999) return 'Amount must be greater than zero.';
  if (!Number.isInteger(Number(b.category_id)) || !Number(b.category_id)) return 'Choose a category.';
  if (!isDate(b.txn_date)) return 'Enter a valid date.';
  if (String(b.description || '').length > 255) return 'Description is too long (max 255).';
  return null;
}

export const GET = route(async (req) => {
  const s = await requireUser();
  const p = req.nextUrl.searchParams;
  const where = ['t.user_id = ?'];
  const args = [s.uid];
  if (p.get('category_id')) { where.push('t.category_id = ?'); args.push(Number(p.get('category_id'))); }
  if (p.get('account_id')) { where.push('t.account_id = ?'); args.push(Number(p.get('account_id'))); }
  if (['income', 'expense'].includes(p.get('type'))) { where.push('c.type = ?'); args.push(p.get('type')); }
  if (isDate(p.get('from'))) { where.push('t.txn_date >= ?'); args.push(p.get('from')); }
  if (isDate(p.get('to'))) { where.push('t.txn_date <= ?'); args.push(p.get('to')); }
  const q = (p.get('q') || '').trim().slice(0, 60);
  if (q) {
    const words = q.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3);
    const like = '%' + q.replace(/[%_\\]/g, '') + '%';
    if (words.length) {
      where.push('(MATCH(t.description) AGAINST (? IN BOOLEAN MODE) OR t.description LIKE ?)');
      args.push(words.map((w) => '+' + w + '*').join(' '), like);
    } else {
      where.push('t.description LIKE ?');
      args.push(like);
    }
  }
  const [rows] = await pool.query(
    `SELECT t.txn_id, t.amount, t.txn_date, t.description, t.account_id, a.name AS account,
            t.category_id, c.name AS category, c.type
       FROM transactions t
       JOIN accounts a ON a.account_id = t.account_id
       JOIN categories c ON c.category_id = t.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.txn_date DESC, t.txn_id DESC LIMIT 200`, args);
  return json({ transactions: rows });
});

export const POST = route(async (req) => {
  const s = await requireUser();
  const b = await req.json().catch(() => ({}));
  const err = validate(b);
  if (err) return bad(err);
  const [acc] = await pool.query('SELECT account_id FROM accounts WHERE account_id=? AND user_id=?', [Number(b.account_id), s.uid]);
  if (!acc.length) return bad('Choose one of your accounts.');
  const before = await maxAlert();
  const [r] = await pool.query(
    'INSERT INTO transactions (user_id,account_id,category_id,amount,txn_date,description) VALUES (?,?,?,?,?,?)',
    [s.uid, Number(b.account_id), Number(b.category_id), Number(b.amount), b.txn_date, String(b.description || '').trim()]);
  audit(s.uid, 'create', 'transaction', r.insertId, null, { amount: Number(b.amount), category_id: Number(b.category_id), txn_date: b.txn_date });
  activity(s.uid, 'add_transaction');
  return json({ ok: true, txn_id: r.insertId, alerts: await newAlerts(s.uid, before) });
});

export const PUT = route(async (req) => {
  const s = await requireUser();
  const b = await req.json().catch(() => ({}));
  const err = validate(b);
  if (err) return bad(err);
  const [old] = await pool.query('SELECT amount,category_id,txn_date,description FROM transactions WHERE txn_id=? AND user_id=?', [Number(b.txn_id), s.uid]);
  if (!old.length) return bad('Transaction not found.');
  const before = await maxAlert();
  await pool.query('UPDATE transactions SET category_id=?, amount=?, txn_date=?, description=? WHERE txn_id=? AND user_id=?',
    [Number(b.category_id), Number(b.amount), b.txn_date, String(b.description || '').trim(), Number(b.txn_id), s.uid]);
  audit(s.uid, 'update', 'transaction', Number(b.txn_id), old[0], { amount: Number(b.amount), category_id: Number(b.category_id), txn_date: b.txn_date });
  return json({ ok: true, alerts: await newAlerts(s.uid, before) });
});

export const DELETE = route(async (req) => {
  const s = await requireUser();
  const id = Number(req.nextUrl.searchParams.get('id'));
  const [old] = await pool.query('SELECT amount,category_id,txn_date,description FROM transactions WHERE txn_id=? AND user_id=?', [id, s.uid]);
  if (!old.length) return bad('Transaction not found.');
  await pool.query('DELETE FROM transactions WHERE txn_id=? AND user_id=?', [id, s.uid]);
  audit(s.uid, 'delete', 'transaction', id, old[0], null);
  return json({ ok: true });
});
