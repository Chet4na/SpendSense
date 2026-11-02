import { pool } from '@/lib/db';
import { json, bad, route, requireUser, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireUser();
  const [rows] = await pool.query('SELECT category_id,name,type FROM categories ORDER BY type DESC, name');
  return json({ categories: rows });
});

export const POST = route(async (req) => {
  const s = await requireAdmin();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (!name || name.length > 50) return bad('Category name is required (max 50 characters).');
  if (!['income', 'expense'].includes(b.type)) return bad('Type must be income or expense.');
  const [r] = await pool.query('INSERT INTO categories (name,type) VALUES (?,?)', [name, b.type]);
  audit(s.uid, 'create', 'category', r.insertId, null, { name, type: b.type });
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const s = await requireAdmin();
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return bad('Missing id.');
  await pool.query('DELETE FROM categories WHERE category_id=?', [id]); // RESTRICT blocks categories in use
  audit(s.uid, 'delete', 'category', id, null, null);
  return json({ ok: true });
});
