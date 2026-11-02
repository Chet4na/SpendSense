import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { json, bad, route, signToken, setAuthCookie, COOKIE } from '@/lib/auth';
import { activity, audit } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export const POST = route(async (req) => {
  const action = req.nextUrl.pathname.split('/').pop();
  const b = await req.json().catch(() => ({}));

  if (action === 'logout') {
    const res = json({ ok: true });
    res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (action === 'register') {
    const name = String(b.name || '').trim();
    if (name.length < 2 || name.length > 80) return bad('Name must be 2 to 80 characters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('Enter a valid email address.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      return bad('Password needs 8+ characters with at least one letter and one number.');
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)', [name, email, hash]);
    await pool.query('INSERT INTO accounts (user_id,name) VALUES (?,?)', [r.insertId, 'Main Account']);
    const res = json({ ok: true });
    setAuthCookie(res, await signToken({ user_id: r.insertId, name, role: 'user' }));
    audit(r.insertId, 'create', 'user', r.insertId, null, { email });
    activity(r.insertId, 'register');
    return res;
  }

  if (action === 'login') {
    const [rows] = await pool.query('SELECT user_id,name,role,password_hash FROM users WHERE email=?', [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      activity(u?.user_id ?? null, 'login_failed', { email });
      return json({ error: 'Incorrect email or password.' }, 401);
    }
    const res = json({ ok: true, role: u.role });
    setAuthCookie(res, await signToken(u));
    activity(u.user_id, 'login');
    return res;
  }
  return bad('Unknown action.');
});
