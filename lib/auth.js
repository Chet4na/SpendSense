import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const COOKIE = 'ss_token';

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET is missing or too short. Set it in .env.local');
  return new TextEncoder().encode(s);
}

export const json = (body, status = 200) => NextResponse.json(body, { status });

export async function signToken(u) {
  return new SignJWT({ uid: u.user_id, name: u.name, role: u.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(key());
}

export function setAuthCookie(res, token) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
    secure: process.env.COOKIE_SECURE === 'true',
  });
}

export async function getSession() {
  try {
    const t = cookies().get(COOKIE)?.value;
    if (!t) return null;
    const { payload } = await jwtVerify(t, key());
    return { uid: payload.uid, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const s = await getSession();
  if (!s) throw json({ error: 'Please sign in.' }, 401);
  return s;
}

export async function requireAdmin() {
  const s = await requireUser();
  if (s.role !== 'admin') throw json({ error: 'Admins only.' }, 403);
  return s;
}

const MYSQL_ERRORS = {
  1062: [409, 'That already exists.'],
  3819: [400, 'A rule was broken. For example, an account balance cannot go below zero.'],
  1452: [400, 'A referenced record does not exist.'],
  1451: [409, 'This record is still in use and cannot be removed.'],
  1406: [400, 'A value is too long.'],
  1292: [400, 'A value has an invalid format.'],
  1265: [400, 'A value is invalid.'],
};

// Wraps a route handler: thrown Responses pass through, MySQL errors become friendly JSON.
export function route(fn) {
  return async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof Response) return e;
      const m = MYSQL_ERRORS[e?.errno];
      if (m) return json({ error: m[1] }, m[0]);
      console.error(e);
      return json({ error: 'Server error: ' + (e?.message || 'unknown') }, 500);
    }
  };
}

export const bad = (msg) => json({ error: msg }, 400);
export const isPeriod = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p || '');
export const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d));
export const currentPeriod = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
