'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, money } from '@/lib/api';

export default function Accounts() {
  const [data, setData] = useState({ accounts: [], total: 0 });
  const [nf, setNf] = useState({ name: '', opening_balance: '' });
  const [tf, setTf] = useState({ from_id: '', to_id: '', amount: '' });
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => api('/api/accounts').then(setData).catch((e) => setMsg({ t: 'err', m: e.message })), []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/api/accounts', { method: 'POST', body: nf }); setNf({ name: '', opening_balance: '' }); setMsg({ t: 'ok', m: 'Account created.' }); load(); }
    catch (x) { setMsg({ t: 'err', m: x.message }); }
  }
  async function transfer(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/api/accounts', { method: 'PUT', body: tf }); setTf({ from_id: '', to_id: '', amount: '' }); setMsg({ t: 'ok', m: 'Transfer completed.' }); load(); }
    catch (x) { setMsg({ t: 'err', m: x.message + ' No money was moved.' }); }
  }
  const opts = data.accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name} ({money(a.balance)})</option>);

  return (
    <>
      <h1>Accounts</h1>
      <p className="sub">Balances update automatically when you add, edit or delete transactions.</p>
      {msg && <p className={'msg ' + msg.t} role="status">{msg.m}</p>}
      <div className="grid">
        <div className="stat"><small>Total across accounts</small><b>{money(data.total)}</b></div>
        {data.accounts.map((a) => <div className="stat" key={a.account_id}><small>{a.name}</small><b>{money(a.balance)}</b></div>)}
      </div>
      <div className="two">
        <form className="card row" onSubmit={create}>
          <h2 style={{ width: '100%' }}>New account</h2>
          <label>Name<input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} required maxLength={60} /></label>
          <label>Opening balance (₹)<input type="number" min="0" step="0.01" value={nf.opening_balance} onChange={(e) => setNf({ ...nf, opening_balance: e.target.value })} style={{ width: 130 }} /></label>
          <button>Create account</button>
        </form>
        <form className="card row" onSubmit={transfer}>
          <h2 style={{ width: '100%' }}>Transfer between accounts</h2>
          <label>From<select value={tf.from_id} onChange={(e) => setTf({ ...tf, from_id: e.target.value })} required><option value="">Choose…</option>{opts}</select></label>
          <label>To<select value={tf.to_id} onChange={(e) => setTf({ ...tf, to_id: e.target.value })} required><option value="">Choose…</option>{opts}</select></label>
          <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={tf.amount} onChange={(e) => setTf({ ...tf, amount: e.target.value })} required style={{ width: 120 }} /></label>
          <button>Transfer</button>
        </form>
      </div>
    </>
  );
}
