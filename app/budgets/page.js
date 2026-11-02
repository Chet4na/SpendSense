'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, thisMonth } from '@/lib/api';
import Meter from '@/components/Meter';

export default function Budgets() {
  const [period, setPeriod] = useState(thisMonth());
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ category_id: '', limit_amount: '' });
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => api('/api/budgets?period=' + period).then((d) => setRows(d.budgets)).catch((e) => setMsg({ t: 'err', m: e.message })), [period]);
  useEffect(() => { api('/api/categories').then((d) => setCats(d.categories.filter((c) => c.type === 'expense'))).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault(); setMsg(null);
    try {
      await api('/api/budgets', { method: 'POST', body: { ...f, period } });
      setMsg({ t: 'ok', m: 'Budget saved. You will be alerted at 80% and 100%.' });
      setF({ category_id: '', limit_amount: '' }); load();
    } catch (x) { setMsg({ t: 'err', m: x.message }); }
  }
  async function del(id) {
    if (!confirm('Delete this budget and its alerts?')) return;
    try { await api('/api/budgets?id=' + id, { method: 'DELETE' }); load(); } catch (x) { setMsg({ t: 'err', m: x.message }); }
  }

  return (
    <>
      <h1>Budgets</h1>
      <p className="sub">Set a monthly limit per category. The tick on each bar marks 80%, where the first alert fires.</p>
      {msg && <p className={'msg ' + msg.t} role="status">{msg.m}</p>}
      <form className="card row" onSubmit={save}>
        <label>Month<input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} required /></label>
        <label>Category<select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} required>
          <option value="">Choose…</option>{cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
        <label>Limit (₹)<input type="number" min="1" step="0.01" value={f.limit_amount} onChange={(e) => setF({ ...f, limit_amount: e.target.value })} required style={{ width: 130 }} /></label>
        <button>Save budget</button>
      </form>
      <div className="card">
        <h2>Budgets for {period}</h2>
        {rows.length === 0 ? <p className="empty">No budgets for this month yet.</p> : rows.map((b) => (
          <div key={b.budget_id} style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
            <div style={{ flex: 1 }}><Meter b={b} /></div>
            <button className="danger" onClick={() => del(b.budget_id)}>Delete</button>
          </div>))}
      </div>
    </>
  );
}
