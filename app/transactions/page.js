'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, money, today } from '@/lib/api';

const empty = () => ({ account_id: '', category_id: '', amount: '', txn_date: today(), description: '' });

export default function Transactions() {
  const [accounts, setAccounts] = useState([]);
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(empty());
  const [editing, setEditing] = useState(null);
  const [flt, setFlt] = useState({ q: '', category_id: '', type: '', from: '', to: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(flt).filter(([, v]) => v)).toString();
    try { setRows((await api('/api/transactions?' + qs)).transactions); }
    catch (e) { setMsg({ t: 'err', m: e.message }); }
  }, [flt]);

  useEffect(() => {
    Promise.all([api('/api/accounts'), api('/api/categories')]).then(([a, c]) => {
      setAccounts(a.accounts); setCats(c.categories);
      setF((x) => ({ ...x, account_id: a.accounts[0]?.account_id || '' }));
    }).catch((e) => setMsg({ t: 'err', m: e.message }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const d = editing
        ? await api('/api/transactions', { method: 'PUT', body: { ...f, txn_id: editing } })
        : await api('/api/transactions', { method: 'POST', body: f });
      const al = d.alerts || [];
      setMsg(al.length ? { t: 'warn', m: al.map((a) => a.message).join(' | ') } : { t: 'ok', m: editing ? 'Transaction updated.' : 'Transaction added.' });
      setF({ ...empty(), account_id: f.account_id }); setEditing(null);
      load();
    } catch (x) { setMsg({ t: 'err', m: x.message }); }
    setBusy(false);
  }

  function edit(r) {
    setEditing(r.txn_id);
    setF({ account_id: r.account_id, category_id: r.category_id, amount: r.amount, txn_date: r.txn_date, description: r.description });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function del(id) {
    if (!confirm('Delete this transaction? The account balance will be adjusted.')) return;
    try { await api('/api/transactions?id=' + id, { method: 'DELETE' }); setMsg({ t: 'ok', m: 'Transaction deleted.' }); load(); }
    catch (x) { setMsg({ t: 'err', m: x.message }); }
  }

  return (
    <>
      <h1>Transactions</h1>
      <p className="sub">Add income and expenses. Expenses that push a category past 80% or 100% of its budget raise an alert automatically.</p>
      {msg && <p className={'msg ' + msg.t} role="status">{msg.m}</p>}

      <form className="card row" onSubmit={save}>
        <label>Account<select value={f.account_id} onChange={set('account_id')} required disabled={!!editing}>
          {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} ({money(a.balance)})</option>)}</select></label>
        <label>Category<select value={f.category_id} onChange={set('category_id')} required>
          <option value="">Choose…</option>
          {['expense', 'income'].map((t) => (<optgroup key={t} label={t === 'expense' ? 'Expenses' : 'Income'}>
            {cats.filter((c) => c.type === t).map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</optgroup>))}
        </select></label>
        <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} required style={{ width: 120 }} /></label>
        <label>Date<input type="date" value={f.txn_date} onChange={set('txn_date')} required /></label>
        <label style={{ flex: 1, minWidth: 160 }}>Description<input maxLength={255} value={f.description} onChange={set('description')} /></label>
        <button disabled={busy}>{editing ? 'Save changes' : 'Add transaction'}</button>
        {editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setF({ ...empty(), account_id: accounts[0]?.account_id || '' }); }}>Cancel</button>}
      </form>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <label>Search<input placeholder="e.g. groceries" value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} /></label>
          <label>Category<select value={flt.category_id} onChange={(e) => setFlt({ ...flt, category_id: e.target.value })}>
            <option value="">All</option>{cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
          <label>Type<select value={flt.type} onChange={(e) => setFlt({ ...flt, type: e.target.value })}>
            <option value="">All</option><option value="expense">Expense</option><option value="income">Income</option></select></label>
          <label>From<input type="date" value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} /></label>
          <label>To<input type="date" value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} /></label>
        </div>
        {rows.length === 0 ? <p className="empty">No transactions match. Add one above or clear the filters.</p> : (
          <div className="wrap"><table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.txn_id}><td>{r.txn_date}</td><td>{r.description || '—'}</td><td>{r.category}</td><td>{r.account}</td>
                <td className={'num ' + (r.type === 'income' ? 'inc' : 'exp')}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</td>
                <td className="num"><button className="ghost" onClick={() => edit(r)}>Edit</button>{' '}<button className="danger" onClick={() => del(r.txn_id)}>Delete</button></td></tr>))}
            </tbody></table></div>
        )}
      </div>
    </>
  );
}
