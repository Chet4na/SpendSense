import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  let s = null;
  try {
    const t = req.cookies.get('ss_token')?.value;
    if (t) s = (await jwtVerify(t, new TextEncoder().encode(process.env.AUTH_SECRET || ''))).payload;
  } catch {}
  if (!s) return NextResponse.redirect(new URL('/login', req.url));
  if (req.nextUrl.pathname.startsWith('/admin') && s.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/transactions/:path*', '/budgets/:path*', '/accounts/:path*', '/alerts/:path*', '/admin/:path*'],
};
