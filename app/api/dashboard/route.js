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
  // Recursive CTE + CTE + window function: the 6 months ending at the selected month.
  // `months` generates every month (so months with no transactions still show as 0),
  // `totals` sums income and expense per month, LAG gives the previous month's expense.
  const [monthly] = await pool.query(
    `WITH RECURSIVE months AS (
       SELECT DATE_SUB(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 5 MONTH) AS month_start, 1 AS n
       UNION ALL
       SELECT DATE_ADD(month_start, INTERVAL 1 MONTH), n + 1 FROM months WHERE n < 6
     ),
     totals AS (
       SELECT DATE_FORMAT(t.txn_date, '%Y-%m') AS period,
              SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) AS income,
              SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END) AS expense
         FROM transactions t JOIN categories c ON c.category_id = t.category_id
        WHERE t.user_id = ?
          AND t.txn_date BETWEEN DATE_SUB(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 5 MONTH)
                             AND LAST_DAY(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'))
        GROUP BY DATE_FORMAT(t.txn_date, '%Y-%m')
     )
     SELECT DATE_FORMAT(m.month_start, '%Y-%m') AS period,
            COALESCE(x.income, 0) AS income,
            COALESCE(x.expense, 0) AS expense,
            LAG(COALESCE(x.expense, 0)) OVER (ORDER BY m.month_start) AS prev_expense
       FROM months m LEFT JOIN totals x ON x.period = DATE_FORMAT(m.month_start, '%Y-%m')
      ORDER BY m.month_start`, [period, s.uid, period, period]);
  // Correlated subqueries: the inner queries reference the outer row (t.user_id, t.category_id),
  // so they run per transaction. Finds expenses over twice their own category's average (4+ samples).
  const [anomalies] = await pool.query(
    `SELECT t.txn_id, t.txn_date, t.description, t.amount, c.name AS category,
            (SELECT ROUND(AVG(t2.amount), 2) FROM transactions t2
              WHERE t2.user_id = t.user_id AND t2.category_id = t.category_id) AS avg_amount
       FROM transactions t
       JOIN categories c ON c.category_id = t.category_id
      WHERE t.user_id = ? AND c.type = 'expense'
        AND (SELECT COUNT(*) FROM transactions t2
              WHERE t2.user_id = t.user_id AND t2.category_id = t.category_id) >= 4
        AND t.amount > 2 * (SELECT AVG(t2.amount) FROM transactions t2
                             WHERE t2.user_id = t.user_id AND t2.category_id = t.category_id)
      ORDER BY t.amount DESC LIMIT 5`, [s.uid]);
  const [[ua]] = await pool.query('SELECT COUNT(*) AS n FROM alerts WHERE user_id=? AND is_read=0', [s.uid]);

  const sum = (type) => byCategory.filter((r) => r.type === type).reduce((t, r) => t + Number(r.total), 0);
  activity(s.uid, 'view_dashboard');
  return json({ period, balance: tot.balance, income: sum('income'), expense: sum('expense'),
    byCategory, budgets, monthly, anomalies, unread: ua.n });
});
