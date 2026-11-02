'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const links = [
  ['/dashboard', 'Dashboard'], ['/transactions', 'Transactions'], ['/budgets', 'Budgets'],
  ['/accounts', 'Accounts'], ['/alerts', 'Alerts'],
];

export default function Nav({ user }) {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    api('/api/alerts').then((d) => setUnread(d.unread)).catch(() => {});
  }, [path]);
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };
  const all = user.role === 'admin' ? [...links, ['/admin', 'Admin']] : links;
  return (
    <nav className="side" aria-label="Main">
      <p className="brand">Spend<span>Sense</span></p>
      {all.map(([href, label]) => (
        <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''}>
          {label}
          {href === '/alerts' && unread > 0 && <span className="badge">{unread}</span>}
        </Link>
      ))}
      <div className="who">
        {user.name} ({user.role})
        <button className="ghost" onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}
