-- SpendSense MySQL schema (MySQL 8.0.16+). Statements are separated by "-- @@" lines
-- so scripts/setup-db.mjs can run them one by one (no DELIMITER needed).

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_users_name CHECK (CHAR_LENGTH(TRIM(name)) >= 2)
) ENGINE=InnoDB
-- @@
CREATE TABLE IF NOT EXISTS accounts (
  account_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_user_name (user_id, name),
  CONSTRAINT fk_account_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_balance_nonneg CHECK (balance >= 0)
) ENGINE=InnoDB
-- @@
CREATE TABLE IF NOT EXISTS categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  type ENUM('income','expense') NOT NULL
) ENGINE=InnoDB
-- @@
CREATE TABLE IF NOT EXISTS transactions (
  txn_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  account_id INT NOT NULL,
  category_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  txn_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_txn_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_txn_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
  CONSTRAINT fk_txn_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  CONSTRAINT chk_txn_amount CHECK (amount > 0),
  INDEX idx_txn_user_date (user_id, txn_date),
  INDEX idx_txn_user_cat_date (user_id, category_id, txn_date),
  FULLTEXT KEY ft_txn_description (description)
) ENGINE=InnoDB
-- @@
CREATE TABLE IF NOT EXISTS budgets (
  budget_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  period CHAR(7) NOT NULL,
  limit_amount DECIMAL(12,2) NOT NULL,
  UNIQUE KEY uq_budget (user_id, category_id, period),
  CONSTRAINT fk_budget_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
  CONSTRAINT chk_budget_limit CHECK (limit_amount > 0),
  CONSTRAINT chk_budget_period CHECK (period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')
) ENGINE=InnoDB
-- @@
CREATE TABLE IF NOT EXISTS alerts (
  alert_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  budget_id INT NOT NULL,
  level ENUM('warning','exceeded') NOT NULL,
  spent DECIMAL(12,2) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_alert_budget_level (budget_id, level),
  INDEX idx_alert_user_read (user_id, is_read),
  CONSTRAINT fk_alert_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_budget FOREIGN KEY (budget_id) REFERENCES budgets(budget_id) ON DELETE CASCADE
) ENGINE=InnoDB
-- @@
DROP PROCEDURE IF EXISTS sp_check_budget
-- @@
CREATE PROCEDURE sp_check_budget(IN p_user INT, IN p_cat INT, IN p_period CHAR(7))
BEGIN
  DECLARE v_budget INT DEFAULT NULL;
  DECLARE v_limit DECIMAL(12,2) DEFAULT 0;
  DECLARE v_spent DECIMAL(12,2) DEFAULT 0;
  DECLARE v_name VARCHAR(50) DEFAULT '';
  SET v_budget = (SELECT budget_id FROM budgets WHERE user_id = p_user AND category_id = p_cat AND period = p_period LIMIT 1);
  IF v_budget IS NOT NULL THEN
    SET v_limit = (SELECT limit_amount FROM budgets WHERE budget_id = v_budget);
    SET v_name = (SELECT name FROM categories WHERE category_id = p_cat);
    SET v_spent = (SELECT COALESCE(SUM(amount), 0) FROM transactions
                   WHERE user_id = p_user AND category_id = p_cat
                     AND txn_date BETWEEN STR_TO_DATE(CONCAT(p_period, '-01'), '%Y-%m-%d')
                                      AND LAST_DAY(STR_TO_DATE(CONCAT(p_period, '-01'), '%Y-%m-%d')));
    IF v_spent >= v_limit THEN
      INSERT IGNORE INTO alerts (user_id, budget_id, level, spent, message)
      VALUES (p_user, v_budget, 'exceeded', v_spent,
              CONCAT('Budget exceeded for ', v_name, ' (', p_period, '): spent ', v_spent, ' of ', v_limit));
    ELSEIF v_spent >= 0.8 * v_limit THEN
      INSERT IGNORE INTO alerts (user_id, budget_id, level, spent, message)
      VALUES (p_user, v_budget, 'warning', v_spent,
              CONCAT('You have used 80% of your ', v_name, ' budget (', p_period, '): spent ', v_spent, ' of ', v_limit));
    END IF;
  END IF;
END
-- @@
DROP TRIGGER IF EXISTS trg_txn_after_insert
-- @@
CREATE TRIGGER trg_txn_after_insert AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
  DECLARE v_type VARCHAR(10);
  SET v_type = (SELECT type FROM categories WHERE category_id = NEW.category_id);
  IF v_type = 'income' THEN
    UPDATE accounts SET balance = balance + NEW.amount WHERE account_id = NEW.account_id;
  ELSE
    UPDATE accounts SET balance = balance - NEW.amount WHERE account_id = NEW.account_id;
    CALL sp_check_budget(NEW.user_id, NEW.category_id, DATE_FORMAT(NEW.txn_date, '%Y-%m'));
  END IF;
END
-- @@
DROP TRIGGER IF EXISTS trg_txn_after_update
-- @@
CREATE TRIGGER trg_txn_after_update AFTER UPDATE ON transactions
FOR EACH ROW
BEGIN
  DECLARE v_old VARCHAR(10);
  DECLARE v_new VARCHAR(10);
  SET v_old = (SELECT type FROM categories WHERE category_id = OLD.category_id);
  SET v_new = (SELECT type FROM categories WHERE category_id = NEW.category_id);
  UPDATE accounts
     SET balance = balance + (CASE WHEN v_new = 'income' THEN NEW.amount ELSE -NEW.amount END)
                           - (CASE WHEN v_old = 'income' THEN OLD.amount ELSE -OLD.amount END)
   WHERE account_id = NEW.account_id;
  IF v_new = 'expense' THEN
    CALL sp_check_budget(NEW.user_id, NEW.category_id, DATE_FORMAT(NEW.txn_date, '%Y-%m'));
  END IF;
END
-- @@
DROP TRIGGER IF EXISTS trg_txn_after_delete
-- @@
CREATE TRIGGER trg_txn_after_delete AFTER DELETE ON transactions
FOR EACH ROW
BEGIN
  DECLARE v_type VARCHAR(10);
  SET v_type = (SELECT type FROM categories WHERE category_id = OLD.category_id);
  IF v_type = 'income' THEN
    UPDATE accounts SET balance = balance - OLD.amount WHERE account_id = OLD.account_id;
  ELSE
    UPDATE accounts SET balance = balance + OLD.amount WHERE account_id = OLD.account_id;
  END IF;
END
-- @@
CREATE OR REPLACE VIEW v_monthly_category_summary AS
SELECT t.user_id,
       DATE_FORMAT(t.txn_date, '%Y-%m') AS period,
       c.category_id, c.name AS category, c.type,
       SUM(t.amount) AS total,
       COUNT(*) AS txn_count
FROM transactions t
JOIN categories c ON c.category_id = t.category_id
GROUP BY t.user_id, DATE_FORMAT(t.txn_date, '%Y-%m'), c.category_id, c.name, c.type
-- @@
CREATE OR REPLACE VIEW v_budget_status AS
SELECT b.budget_id, b.user_id, b.category_id, c.name AS category, b.period, b.limit_amount,
       COALESCE(SUM(t.amount), 0) AS spent,
       ROUND(COALESCE(SUM(t.amount), 0) / b.limit_amount * 100, 1) AS pct_used,
       CASE WHEN COALESCE(SUM(t.amount), 0) >= b.limit_amount THEN 'exceeded'
            WHEN COALESCE(SUM(t.amount), 0) >= 0.8 * b.limit_amount THEN 'warning'
            ELSE 'ok' END AS status
FROM budgets b
JOIN categories c ON c.category_id = b.category_id
LEFT JOIN transactions t
       ON t.user_id = b.user_id AND t.category_id = b.category_id
      AND t.txn_date BETWEEN STR_TO_DATE(CONCAT(b.period, '-01'), '%Y-%m-%d')
                         AND LAST_DAY(STR_TO_DATE(CONCAT(b.period, '-01'), '%Y-%m-%d'))
GROUP BY b.budget_id, b.user_id, b.category_id, c.name, b.period, b.limit_amount
-- @@
DROP PROCEDURE IF EXISTS sp_monthly_report
-- @@
CREATE PROCEDURE sp_monthly_report(IN p_user INT, IN p_period CHAR(7))
BEGIN
  SELECT c.name AS category, c.type, SUM(t.amount) AS total, COUNT(*) AS txn_count,
         ROUND(AVG(t.amount), 2) AS avg_amount
  FROM transactions t
  JOIN categories c ON c.category_id = t.category_id
  WHERE t.user_id = p_user
    AND t.txn_date BETWEEN STR_TO_DATE(CONCAT(p_period, '-01'), '%Y-%m-%d')
                       AND LAST_DAY(STR_TO_DATE(CONCAT(p_period, '-01'), '%Y-%m-%d'))
  GROUP BY c.name, c.type
  HAVING SUM(t.amount) > 0
  ORDER BY c.type, total DESC;
END
