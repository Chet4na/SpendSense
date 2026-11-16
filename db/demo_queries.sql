-- Demonstration queries for the project report / viva. Run manually in MySQL.
-- ALTER / DROP demo
ALTER TABLE accounts ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE accounts DROP COLUMN currency;
CREATE TABLE tmp_demo (id INT PRIMARY KEY);
DROP TABLE tmp_demo;

-- JOIN + GROUP BY + HAVING + ORDER BY: categories where a user spent over 2000
SELECT c.name, SUM(t.amount) total FROM transactions t JOIN categories c USING (category_id)
WHERE t.user_id = 2 AND c.type = 'expense' GROUP BY c.name HAVING SUM(t.amount) > 2000 ORDER BY total DESC;

-- Subquery: expenses above the average expense
SELECT * FROM transactions WHERE amount > (SELECT AVG(amount) FROM transactions WHERE user_id = 2) AND user_id = 2;

-- Window function: month-over-month change
SELECT period, expense, LAG(expense) OVER (ORDER BY period) AS prev_expense FROM (
  SELECT DATE_FORMAT(txn_date,'%Y-%m') period, SUM(amount) expense
  FROM transactions t JOIN categories c USING (category_id)
  WHERE user_id = 2 AND c.type = 'expense' GROUP BY DATE_FORMAT(txn_date,'%Y-%m')) m;

-- Stored procedure, views, full-text search, index evidence
CALL sp_monthly_report(2, DATE_FORMAT(CURDATE(), '%Y-%m'));
SELECT * FROM v_budget_status WHERE user_id = 2;
SELECT * FROM transactions WHERE MATCH(description) AGAINST('+grocer*' IN BOOLEAN MODE);
EXPLAIN SELECT * FROM transactions WHERE user_id = 2 AND txn_date >= '2026-11-01';

-- =====================================================================
-- Advanced query demos (nested, correlated, recursive, joins, CTE,
-- function, DML with triggers, roles). User 2 = demo user.
-- =====================================================================

-- DML + triggers, safely: run inside a transaction and roll back so demo data is unchanged.
START TRANSACTION;
SELECT balance FROM accounts WHERE account_id = 1;                       -- before
INSERT INTO transactions (user_id, account_id, category_id, amount, txn_date, description)
VALUES (2, 1, (SELECT category_id FROM categories WHERE name = 'Entertainment'), 900, CURDATE(), 'Concert (demo)');
SELECT balance FROM accounts WHERE account_id = 1;                       -- trigger subtracted 900
SELECT level, message FROM alerts WHERE user_id = 2 ORDER BY alert_id DESC LIMIT 1;  -- 80% alert raised by trigger
UPDATE transactions SET amount = 1000 WHERE description = 'Concert (demo)';           -- update trigger adjusts balance
DELETE FROM transactions WHERE description = 'Concert (demo)';                        -- delete trigger refunds
ROLLBACK;

-- Nested subquery with IN: users who have at least one exceeded budget
SELECT name, email FROM users
WHERE user_id IN (SELECT user_id FROM alerts WHERE level = 'exceeded');

-- Correlated subquery: each expense compared with its own category's average
SELECT t.txn_id, t.description, t.amount,
       (SELECT ROUND(AVG(t2.amount), 2) FROM transactions t2
         WHERE t2.user_id = t.user_id AND t2.category_id = t.category_id) AS category_avg
FROM transactions t JOIN categories c ON c.category_id = t.category_id
WHERE t.user_id = 2 AND c.type = 'expense'
  AND t.amount > (SELECT AVG(t2.amount) FROM transactions t2
                   WHERE t2.user_id = t.user_id AND t2.category_id = t.category_id);

-- Correlated NOT EXISTS: expense categories with no spending this month
SELECT c.name FROM categories c
WHERE c.type = 'expense'
  AND NOT EXISTS (SELECT 1 FROM transactions t
                   WHERE t.category_id = c.category_id AND t.user_id = 2
                     AND DATE_FORMAT(t.txn_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m'));

-- Recursive CTE: the last 6 months, including months with no spending
WITH RECURSIVE months AS (
  SELECT DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH) AS month_start, 1 AS n
  UNION ALL
  SELECT DATE_ADD(month_start, INTERVAL 1 MONTH), n + 1 FROM months WHERE n < 6
)
SELECT DATE_FORMAT(m.month_start, '%Y-%m') AS period, COALESCE(SUM(t.amount), 0) AS spent
FROM months m
LEFT JOIN transactions t ON t.user_id = 2
      AND t.txn_date BETWEEN m.month_start AND LAST_DAY(m.month_start)
      AND t.category_id IN (SELECT category_id FROM categories WHERE type = 'expense')
GROUP BY m.month_start ORDER BY m.month_start;

-- CTE + window function: biggest expense category in each month
WITH monthly AS (
  SELECT DATE_FORMAT(t.txn_date, '%Y-%m') AS period, c.name AS category, SUM(t.amount) AS total
  FROM transactions t JOIN categories c ON c.category_id = t.category_id
  WHERE t.user_id = 2 AND c.type = 'expense'
  GROUP BY DATE_FORMAT(t.txn_date, '%Y-%m'), c.name
),
ranked AS (
  SELECT period, category, total, ROW_NUMBER() OVER (PARTITION BY period ORDER BY total DESC) AS rn
  FROM monthly
)
SELECT period, category, total FROM ranked WHERE rn = 1 ORDER BY period;

-- Joins: INNER (4 tables) and LEFT (budgets with nothing spent still appear)
SELECT u.name, a.name AS account, c.name AS category, t.amount, t.txn_date
FROM transactions t
JOIN users u ON u.user_id = t.user_id
JOIN accounts a ON a.account_id = t.account_id
JOIN categories c ON c.category_id = t.category_id
WHERE t.user_id = 2 ORDER BY t.txn_date DESC LIMIT 10;

SELECT c.name, b.period, b.limit_amount, COALESCE(SUM(t.amount), 0) AS spent
FROM budgets b
JOIN categories c ON c.category_id = b.category_id
LEFT JOIN transactions t ON t.user_id = b.user_id AND t.category_id = b.category_id
      AND DATE_FORMAT(t.txn_date, '%Y-%m') = b.period
WHERE b.user_id = 2
GROUP BY c.name, b.period, b.limit_amount;

-- Stored function
SELECT b.budget_id, c.name, b.period, fn_budget_pct(b.budget_id) AS pct_used_now
FROM budgets b JOIN categories c ON c.category_id = b.category_id WHERE b.user_id = 2;

-- Roles (RBAC in the database), see db/roles.sql
SHOW GRANTS FOR 'ss_user';
SHOW GRANTS FOR 'ss_admin';
-- Then log in as the demo account (needs MYSQL_ROLE_DEMO_PASSWORD at setup):
--   mysql -u ss_demo_user -p spendsense
--   INSERT INTO categories (name, type) VALUES ('Test', 'expense');   -- ERROR 1142: denied
--   SELECT password_hash FROM users;                                   -- ERROR 1143: denied
