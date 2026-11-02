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
EXPLAIN SELECT * FROM transactions WHERE user_id = 2 AND txn_date >= '2026-01-01';
