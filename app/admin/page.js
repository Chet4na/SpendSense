'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, money } from '@/lib/api';

export default function Admin() {
  const [tab, setTab] = useState('analytics');
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [nc, setNc] = useState({ name: '', type: 'expense' });
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setData(null);
    try {
      if (tab === 'categories') setCats((await api('/api/categories')).categories);
      else setData(await api('/api/admin?view=' + tab));
    } catch (e) { setMsg({ t: 'err', m: e.message }); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function addCat(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/api/categories', { method: 'POST', body: nc }); setNc({ name: '', type: 'expense' }); load(); } catch (x) { setMsg({ t: 'err', m: x.message }); }
  }
  async function delCat(id) {
    setMsg(null);
    try { await api('/api/categories?id=' + id, { method: 'DELETE' }); load(); } catch (x) { setMsg({ t: 'err', m: x.message }); }
  }
  async function role(u, r) {
    setMsg(null);
    try { await api('/api/admin', { method: 'PUT', body: { user_id: u, role: r } }); load(); } catch (x) { setMsg({ t: 'err', m: x.message }); }
  }

  const noMongo = data && data.mongo === false;
  const maxDay = data?.perDay ? Math.max(1, ...data.perDay.map((x) => x.events)) : 1;

  return (
    <>
      <h1>Admin</h1>
      <p className="sub">System-wide analytics from MongoDB, user management and shared categories from MySQL.</p>
      <div className="tabs">
        {[['analytics', 'Activity analytics'], ['audit', 'Audit log'], ['users', 'Users'], ['categories', 'Categories']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setMsg(null); setTab(k); }}>{l}</button>))}
      </div>
      {msg && <p className={'msg ' + msg.t} role="status">{msg.m}</p>}
      {noMongo && <p className="msg warn">MongoDB is not reachable. Start MongoDB and check MONGODB_URI in .env.local.</p>}

      {tab === 'analytics' && data?.perDay && (
        <div className="two">
          <div className="card"><h2>Events per day (last 14 days)</h2>
            {data.perDay.length === 0 ? <p className="empty">No activity yet.</p> : data.perDay.map((x) => (
              <div className="bar" key={x._id}><span className="n">{x._id}</span><span className="b"><i style={{ width: (x.events / maxDay) * 100 + '%' }} /></span><span className="v">{x.events}</span></div>))}
          </div>
          <div>
            <div className="card"><h2>Events by action</h2>
              <table><tbody>{data.perAction.map((x) => <tr key={x._id}><td>{x._id}</td><td className="num">{x.events}</td></tr>)}</tbody></table></div>
            <div className="card"><h2>Most active users</h2>
              <table><tbody>{data.topUsers.map((x) => <tr key={x.user}><td>{x.user}</td><td className="num">{x.events}</td></tr>)}</tbody></table></div>
            <div className="card"><h2>Data changes by entity</h2>
              <table><tbody>{data.auditByEntity.map((x) => <tr key={x.entity + x.action}><td>{x.entity} · {x.action}</td><td className="num">{x.n}</td></tr>)}</tbody></table></div>
          </div>
        </div>
      )}

      {tab === 'audit' && data?.logs && (
        <div className="card wrap">
          {data.logs.length === 0 ? <p className="empty">No audit entries yet.</p> : (
            <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Before</th><th>After</th></tr></thead>
              <tbody>{data.logs.map((l) => (
                <tr key={l._id}><td>{String(l.ts).slice(0, 19).replace('T', ' ')}</td><td>#{l.user_id}</td><td>{l.action}</td><td>{l.entity} #{l.entity_id}</td>
                  <td>{l.before ? <pre>{JSON.stringify(l.before)}</pre> : '—'}</td><td>{l.after ? <pre>{JSON.stringify(l.after)}</pre> : '—'}</td></tr>))}</tbody></table>)}
        </div>
      )}

      {tab === 'users' && data?.users && (
        <div className="card wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="num">Transactions</th><th className="num">Total spent</th><th /></tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.user_id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td className="num">{u.txn_count}</td><td className="num">{money(u.total_spent)}</td>
              <td className="num"><button className="ghost" onClick={() => role(u.user_id, u.role === 'admin' ? 'user' : 'admin')}>Make {u.role === 'admin' ? 'user' : 'admin'}</button></td></tr>))}</tbody></table></div>
      )}

      {tab === 'categories' && (
        <>
          <form className="card row" onSubmit={addCat}>
            <label>Name<input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} required maxLength={50} /></label>
            <label>Type<select value={nc.type} onChange={(e) => setNc({ ...nc, type: e.target.value })}><option value="expense">Expense</option><option value="income">Income</option></select></label>
            <button>Add category</button>
          </form>
          <div className="card"><table>
            <thead><tr><th>Name</th><th>Type</th><th /></tr></thead>
            <tbody>{cats.map((c) => (<tr key={c.category_id}><td>{c.name}</td><td>{c.type}</td><td className="num"><button className="danger" onClick={() => delCat(c.category_id)}>Delete</button></td></tr>))}</tbody></table></div>
        </>
      )}
    </>
  );
}
