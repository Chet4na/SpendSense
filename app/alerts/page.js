'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, money } from '@/lib/api';

export default function Alerts() {
  const [d, setD] = useState({ alerts: [], unread: 0 });
  const [err, setErr] = useState('');
  const load = useCallback(() => api('/api/alerts').then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function readAll() { await api('/api/alerts', { method: 'PUT' }); load(); }

  return (
    <>
      <h1>Budget alerts</h1>
      <p className="sub">Created automatically by a database trigger when spending reaches 80% or 100% of a budget.</p>
      {err && <p className="msg err">{err}</p>}
      {d.unread > 0 && <p><button onClick={readAll}>Mark all {d.unread} as read</button></p>}
      <div className="card">
        {d.alerts.length === 0 ? <p className="empty">No alerts yet. Set a budget and keep spending within it.</p> : (
          <div className="wrap"><table>
            <thead><tr><th>When</th><th>Level</th><th>Alert</th><th className="num">Spent</th><th className="num">Limit</th></tr></thead>
            <tbody>{d.alerts.map((a) => (
              <tr key={a.alert_id} style={{ fontWeight: a.is_read ? 400 : 700 }}>
                <td>{String(a.created_at).slice(0, 16)}</td>
                <td><span className={'pill ' + a.level}>{a.level}</span></td>
                <td>{a.message}</td><td className="num">{money(a.spent)}</td><td className="num">{money(a.limit_amount)}</td></tr>))}
            </tbody></table></div>
        )}
      </div>
    </>
  );
}
