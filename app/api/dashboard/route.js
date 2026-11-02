import { pool } from '@/lib/db';
import { json, bad, route, requireUser, isPeriod, currentPeriod } from '@/lib/auth';
import { activity } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const s = await requireUser();
  const period = req.nextUrl.searchParams.get('period') || currentPeriod();
  if (!isPeriod(period)) return bad('Period must look like 2026-10.');

  const [[tot]] = await pool.query('SELECT COALESCE(SUM(balance),0) AS balance FROM accounts WHERE user_id=?', [s.uid]);
  const [byCategory] = await pool.query(
    'SELECT category, type, total, txn_count FROM v_monthly_category_summary WHERE user_id=? AND period=? ORDER BY total DESC', [s.uid, period]);
  const [budgets] = await pool.query('SELECT * FROM v_budget_status WHERE user_id=? AND period=? ORDER BY pct_used DESC', [s.uid, period]);
  // Window function: month-over-month comparison of expenses.
  const [monthly] = await pool.query(
    `SELECT period, income, expense, LAG(expense) OVER (ORDER BY period) AS prev_expense FROM (
       SELECT DATE_FORMAT(t.txn_date,'%Y-%m') AS period,
              SUM(CASE WHEN c.type='income' THEN t.amount ELSE 0 END) AS income,
              SUM(CASE WHEN c.type='expense' THEN t.amount ELSE 0 END) AS expense
         FROM transactions t JOIN categories c ON c.category_id = t.category_id
        WHERE t.user_id = ? GROUP BY DATE_FORMAT(t.txn_date,'%Y-%m')) m
     ORDER BY period DESC LIMIT 6`, [s.uid]);
  // Subquery + HAVING: expenses more than twice their category's average (needs 4+ samples).
  const [anomalies] = await pool.query(
    `SELECT t.txn_id, t.txn_date, t.description, t.amount, c.name AS category, ROUND(x.avg_amt,2) AS avg_amount
       FROM transactions t
       JOIN categories c ON c.category_id = t.category_id
       JOIN (SELECT category_id, AVG(amount) AS avg_amt FROM transactions WHERE user_id = ?
              GROUP BY category_id HAVING COUNT(*) >= 4) x ON x.category_id = t.category_id
      WHERE t.user_id = ? AND c.type = 'expense' AND t.amount > 2 * x.avg_amt
      ORDER BY t.amount DESC LIMIT 5`, [s.uid, s.uid]);
  const [[ua]] = await pool.query('SELECT COUNT(*) AS n FROM alerts WHERE user_id=? AND is_read=0', [s.uid]);

  const sum = (type) => byCategory.filter((r) => r.type === type).reduce((t, r) => t + Number(r.total), 0);
  activity(s.uid, 'view_dashboard');
  return json({ period, balance: tot.balance, income: sum('income'), expense: sum('expense'),
    byCategory, budgets, monthly: monthly.reverse(), anomalies, unread: ua.n });
});
