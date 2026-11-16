# SpendSense: Smart Expense Analyzer

Track income and expenses, set monthly budgets per category, and get **automatic budget alerts** at 80% and 100% of a budget.
Built with Next.js 14 (App Router), **MySQL** (financial records) and **MongoDB** (audit trail and activity analytics).

## Requirements
- Node.js 18.17 or newer
- MySQL 8.0.16+ (CHECK constraints are enforced from this version)
- MongoDB 6+ (optional to start the app; needed for admin logs and analytics)

## Setup
```bash
# 1. Start databases (skip if you already run MySQL and MongoDB locally)
docker compose up -d

# 2. Install and configure
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
# edit .env.local if your MySQL password or URLs differ

# 3. Create tables, triggers, views, procedures and demo data
npm run db:setup                  # use npm run db:reset to wipe and rebuild

# 4. Run
npm run dev                       # http://localhost:3000
```

## Demo logins
| Role | Email | Password |
|---|---|---|
| Admin | admin@spendsense.com | Admin@123 |
| User | demo@spendsense.com | Demo@123 |

The demo user already has a Food budget at 87% (warning alert) and a Shopping budget at 117% (exceeded alert).

## How automatic budget alerts work
1. A user sets a budget (category + month + limit).
2. Every expense insert or update fires a MySQL trigger, which calls `sp_check_budget`.
3. The procedure sums the month's spending. At 80% it creates a `warning` alert, at 100% an `exceeded` alert.
4. `UNIQUE(budget_id, level)` ensures each level is raised once. Changing a budget limit resets its alerts and re-checks.
5. The UI shows a message right after saving the transaction, a badge in the sidebar, and the Alerts page.

## Project layout
```
db/schema.sql        tables, constraints, indexes, triggers, views, procedures
db/demo_queries.sql  DDL, DML with triggers, nested/correlated/recursive queries, joins, CTEs,
                     window functions, function, roles, EXPLAIN demos
db/roles.sql         MySQL roles ss_user, ss_admin, ss_readonly (RBAC in the database)
db/mongo_queries.js  mongosh demo: indexes, insert, find, aggregate, updateOne, deleteMany
scripts/setup-db.mjs creates DB, runs schema, seeds data, prepares MongoDB
app/api/*            route handlers (backend layer)
app/*                pages: dashboard, transactions, budgets, accounts, alerts, admin
lib/                 MySQL pool, MongoDB logging, JWT auth helpers
docs/                full project documentation
```

## Role-based access (three layers)
1. Pages: `middleware.js` sends signed-out users to `/login` and non-admins away from `/admin`.
2. API: routes call `requireUser()` / `requireAdmin()`; a normal user gets 403 on admin APIs.
3. Database: `db/roles.sql` defines matching MySQL roles. Set `MYSQL_ROLE_DEMO_PASSWORD` in `.env.local`
   before `npm run db:setup` to also create demo accounts `ss_demo_user` and `ss_demo_admin`.

## Security notes
Passwords are hashed with bcrypt, sessions are signed HttpOnly JWT cookies, all SQL is parameterized, secrets live in `.env.local` (git-ignored), and routes are protected by middleware plus per-route role checks.

## Team
| Name | SRN | GitHub |
|---|---|---|
| Chetana Iyer | PES1UG24CS130 | [@Chet4na](https://github.com/Chet4na) |
| Aryan Upadhyay | PES1UG25CS806 | [@aryanupadhyayyy](https://github.com/aryanupadhyayyy) |

### Team contributions
| Area | Chetana Iyer | Aryan Upadhyay |
|---|---|---|
| Database | MySQL schema (`db/schema.sql`): tables, constraints, indexes | MongoDB collections and indexes (`lib/mongo.js`); stored function `fn_budget_pct` |
| Database logic | Triggers, `sp_check_budget`, `sp_monthly_report`, views | Audit trail and activity logging; CTE rewrite of `sp_monthly_report`; recursive CTE and correlated subqueries on the dashboard |
| NoSQL operations | | MongoDB read (`find`, 4 aggregation pipelines), update (`updateOne` audit review) and delete (`deleteMany` activity cleanup, TTL index) |
| Access control | Auth (bcrypt, JWT, middleware), `requireUser` / `requireAdmin` | MySQL roles `ss_user`, `ss_admin`, `ss_readonly` with GRANTs (`db/roles.sql`) |
| Backend | Transactions, budgets, accounts, categories, alerts APIs | Dashboard and admin APIs |
| Frontend | Login, transactions, budgets, accounts and alerts pages | Dashboard and admin panel pages, audit review and cleanup UI, "Used now" on alerts |
| Reports and setup | Demo data for budget alerts | Report queries (`db/demo_queries.sql`), `db/mongo_queries.js`, MongoDB and roles setup in `scripts/setup-db.mjs`, `.env.example`, `.gitignore` |
| Documentation | Project documentation (`docs/PROJECT_DOCUMENTATION.md`) | Docs updates for new features, test cases T13–T17, screenshots |
