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
db/demo_queries.sql  ALTER/DROP, JOIN, GROUP BY, subquery, window function, EXPLAIN demos
scripts/setup-db.mjs creates DB, runs schema, seeds data, prepares MongoDB
app/api/*            route handlers (backend layer)
app/*                pages: dashboard, transactions, budgets, accounts, alerts, admin
lib/                 MySQL pool, MongoDB logging, JWT auth helpers
docs/                full project documentation
```

## Security notes
Passwords are hashed with bcrypt, sessions are signed HttpOnly JWT cookies, all SQL is parameterized, secrets live in `.env.local` (git-ignored), and routes are protected by middleware plus per-route role checks.

## Team contributions
Fill in your names and split here. Suggested: Member A = MySQL design, triggers/procedures/views, auth, transaction and budget pages. Member B = MongoDB logging and aggregations, dashboard, admin panel, reports queries. Commit separately so Git history shows individual work.
