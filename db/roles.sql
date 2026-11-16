-- SpendSense role-based access control (RBAC) inside MySQL.
-- Run by scripts/setup-db.mjs after schema.sql. {{DB}} is replaced with MYSQL_DATABASE.
-- Statements are separated by "-- @@" lines.
--
-- ss_user     : what a normal user's actions need (own money data, read categories)
-- ss_admin    : everything ss_user has + manage categories + change user roles
-- ss_readonly : read-only access for reports and analytics
--
-- Column-level privilege: ss_user can read users' id, name, email and role,
-- but never password_hash.

CREATE ROLE IF NOT EXISTS 'ss_user', 'ss_admin', 'ss_readonly'
-- @@
GRANT SELECT, INSERT, UPDATE, DELETE ON {{DB}}.transactions TO 'ss_user'
-- @@
GRANT SELECT, INSERT, UPDATE, DELETE ON {{DB}}.budgets TO 'ss_user'
-- @@
GRANT SELECT, INSERT, UPDATE ON {{DB}}.accounts TO 'ss_user'
-- @@
GRANT SELECT, UPDATE ON {{DB}}.alerts TO 'ss_user'
-- @@
GRANT SELECT ON {{DB}}.categories TO 'ss_user'
-- @@
GRANT SELECT (user_id, name, email, role) ON {{DB}}.users TO 'ss_user'
-- @@
GRANT SELECT ON {{DB}}.v_budget_status TO 'ss_user'
-- @@
GRANT SELECT ON {{DB}}.v_monthly_category_summary TO 'ss_user'
-- @@
GRANT EXECUTE ON PROCEDURE {{DB}}.sp_check_budget TO 'ss_user'
-- @@
GRANT EXECUTE ON PROCEDURE {{DB}}.sp_monthly_report TO 'ss_user'
-- @@
GRANT EXECUTE ON FUNCTION {{DB}}.fn_budget_pct TO 'ss_user'
-- @@
GRANT 'ss_user' TO 'ss_admin'
-- @@
GRANT INSERT, UPDATE, DELETE ON {{DB}}.categories TO 'ss_admin'
-- @@
GRANT UPDATE (role) ON {{DB}}.users TO 'ss_admin'
-- @@
GRANT SELECT ON {{DB}}.* TO 'ss_readonly'
