'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, money, thisMonth } from '@/lib/api';
import Meter from '@/components/Meter';

export default function Dashboard() {
  const [period, setPeriod] = useState(thisMonth());
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    api('/api/dashboard?period=' + period).then(setD).catch((e) => setErr(e.message));
  }, [period]);

  if (err) return <p className="msg err">{err}</p>;
  if (!d) return <p>Loading…</p>;
  const expenses = d.byCategory.filter((c) => c.type === 'expense');
  const max = Math.max(1, ...expenses.map((c) => Number(c.total)));
  const saved = d.income - d.expense;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="row" style={{ marginBottom: 18 }}>
        <label>Month<input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></label>
      </div>
      {d.unread > 0 && <p className="msg warn">You have {d.unread} unread budget alert{d.unread > 1 ? 's' : ''}. <Link href="/alerts">Review alerts</Link></p>}

      <div className="grid">
        <div className="stat"><small>Total balance</small><b>{money(d.balance)}</b></div>
        <div className="stat"><small>Income this month</small><b className="inc">{money(d.income)}</b></div>
        <div className="stat"><small>Spent this month</small><b className="exp">{money(d.expense)}</b></div>
        <div className="stat"><small>Saved this month</small><b>{money(saved)}</b></div>
      </div>

      <div className="card">
        <h2>Budgets for {period}</h2>
        {d.budgets.length === 0 ? <p className="empty">No budgets for this month. <Link href="/budgets">Set a budget</Link> to start getting alerts.</p>
          : d.budgets.map((b) => <Meter key={b.budget_id} b={b} />)}
      </div>

      <div className="two">
        <div className="card">
          <h2>Spending by category</h2>
          {expenses.length === 0 ? <p className="empty">No expenses recorded this month.</p> : expenses.map((c) => (
            <div className="bar" key={c.category}>
              <span className="n">{c.category}</span>
              <span className="b"><i style={{ width: (Number(c.total) / max) * 100 + '%' }} /></span>
              <span className="v">{money(c.total)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Month-over-month</h2>
          <div className="wrap"><table>
            <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Spent</th><th className="num">Change</th></tr></thead>
            <tbody>{d.monthly.map((m) => {
              const ch = m.prev_expense ? ((m.expense - m.prev_expense) / m.prev_expense) * 100 : null;
              return (<tr key={m.period}><td>{m.period}</td><td className="num">{money(m.income)}</td><td className="num">{money(m.expense)}</td>
                <td className={'num ' + (ch > 0 ? 'exp' : 'inc')}>{ch === null ? '—' : (ch > 0 ? '+' : '') + ch.toFixed(0) + '%'}</td></tr>);
            })}</tbody>
          </table></div>
        </div>
      </div>

      <div className="card">
        <h2>Unusually large expenses</h2>
        {d.anomalies.length === 0 ? <p className="empty">Nothing stands out. Expenses more than twice their category average appear here.</p> : (
          <div className="wrap"><table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th><th className="num">Category average</th></tr></thead>
            <tbody>{d.anomalies.map((a) => (<tr key={a.txn_id}><td>{a.txn_date}</td><td>{a.description}</td><td>{a.category}</td><td className="num exp">{money(a.amount)}</td><td className="num">{money(a.avg_amount)}</td></tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
