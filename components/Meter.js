import { money } from '@/lib/api';

// Budget meter: ticks mark 80% (warning alert) and 100% (exceeded alert).
export default function Meter({ b }) {
  const pct = Number(b.pct_used);
  return (
    <div className="meter">
      <div className="top">
        <span>{b.category} <span className={'pill ' + b.status}>{b.status === 'ok' ? 'on track' : b.status}</span></span>
        <span>{money(b.spent)} of {money(b.limit_amount)} ({pct}%)</span>
      </div>
      <div className="track" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin="0" aria-valuemax="100" aria-label={b.category + ' budget used'}>
        <div className={'fill ' + b.status} style={{ width: Math.min(pct, 100) + '%' }} />
        <span className="tick" style={{ left: '80%' }} />
      </div>
    </div>
  );
}
