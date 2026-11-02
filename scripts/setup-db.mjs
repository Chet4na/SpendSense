// Creates the MySQL database, runs db/schema.sql, seeds demo data, and prepares MongoDB.
// Usage: npm run db:setup   (or npm run db:reset to drop and rebuild everything)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE']) {
  if (!process.env[k]) { console.error(`Missing ${k}. Copy .env.example to .env.local first.`); process.exit(1); }
}
const dbName = process.env.MYSQL_DATABASE;
if (!/^[A-Za-z0-9_]+$/.test(dbName)) { console.error('MYSQL_DATABASE may only contain letters, digits, underscore.'); process.exit(1); }

const cfg = { host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD || '' };

let admin;
try { admin = await mysql.createConnection(cfg); }
catch (e) { console.error('Cannot connect to MySQL: ' + e.message); process.exit(1); }
if (process.argv.includes('--reset')) await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await admin.end();

const db = await mysql.createConnection({ ...cfg, database: dbName, dateStrings: true });
const sql = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
let n = 0;
for (const chunk of sql.split(/^-- @@\s*$/m)) {
  const body = chunk.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
  if (body) { await db.query(body); n++; }
}
console.log(`MySQL: ran ${n} schema statements.`);

const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM users');
let demoId = null;
if (cnt === 0) {
  const hash = (p) => bcrypt.hash(p, 10);
  await db.query('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?),(?,?,?,?)',
    ['Admin', 'admin@spendsense.com', await hash('Admin@123'), 'admin', 'Demo User', 'demo@spendsense.com', await hash('Demo@123'), 'user']);
  const [urows] = await db.query('SELECT user_id, email FROM users');
  const U = Object.fromEntries(urows.map((r) => [r.email, r.user_id]));
  demoId = U['demo@spendsense.com'];
  await db.query('INSERT INTO categories (name,type) VALUES ?', [[
    ['Salary', 'income'], ['Freelance', 'income'], ['Food', 'expense'], ['Rent', 'expense'], ['Transport', 'expense'],
    ['Shopping', 'expense'], ['Entertainment', 'expense'], ['Utilities', 'expense'], ['Health', 'expense']]]);
  const [crows] = await db.query('SELECT category_id, name FROM categories');
  const C = Object.fromEntries(crows.map((r) => [r.name, r.category_id]));
  await db.query('INSERT INTO accounts (user_id,name,balance) VALUES (?,?,0),(?,?,0),(?,?,0)',
    [demoId, 'Main Account', demoId, 'Savings', U['admin@spendsense.com'], 'Main Account']);
  const [[acc]] = await db.query('SELECT account_id FROM accounts WHERE user_id=? AND name=?', [demoId, 'Main Account']);

  const now = new Date();
  const ym = (off) => { const d = new Date(now.getFullYear(), now.getMonth() - off, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  // Budgets first, so the triggers raise alerts while seeding the current month.
  const cur = ym(0);
  await db.query('INSERT INTO budgets (user_id,category_id,period,limit_amount) VALUES ?', [[
    [demoId, C.Food, cur, 6000], [demoId, C.Shopping, cur, 3000], [demoId, C.Entertainment, cur, 2000], [demoId, C.Transport, cur, 3000]]]);

  const base = [['Salary', 60000, 1, 'Monthly salary'], ['Rent', 15000, 2, 'House rent'], ['Food', 1800, 5, 'Groceries'],
    ['Food', 1500, 12, 'Restaurant dinner'], ['Food', 1900, 20, 'Weekly groceries'], ['Transport', 1200, 8, 'Metro card recharge'],
    ['Shopping', 900, 10, 'Clothes'], ['Shopping', 600, 15, 'Books'], ['Utilities', 2400, 18, 'Electricity and internet'],
    ['Entertainment', 800, 22, 'Movie night'], ['Health', 700, 25, 'Pharmacy']];
  for (const off of [2, 1, 0]) {
    const f = off === 2 ? 0.9 : off === 1 ? 1.1 : 1;
    const rows = base.map(([c, a, d, t]) => [c, ['Salary', 'Rent'].includes(c) ? a : Math.round(a * f), d, t]);
    if (off === 2) rows.push(['Freelance', 8000, 14, 'Logo design project']);
    if (off === 1) rows.push(['Shopping', 7500, 16, 'Smartwatch']);
    if (off === 0) rows.push(['Shopping', 2000, 24, 'Headphones']);
    rows.sort((x, y) => x[2] - y[2]);
    for (const [c, a, d, t] of rows) {
      const day = off === 0 ? Math.min(d, now.getDate()) : d;
      await db.query('INSERT INTO transactions (user_id,account_id,category_id,amount,txn_date,description) VALUES (?,?,?,?,?,?)',
        [demoId, acc.account_id, C[c], a, `${ym(off)}-${String(day).padStart(2, '0')}`, t]);
    }
  }
  console.log('MySQL: seeded users, categories, accounts, budgets, transactions.');
} else {
  console.log('MySQL: data already present, seed skipped (use npm run db:reset to rebuild).');
}
await db.end();

// MongoDB: indexes + demo activity so the admin analytics page has data.
try {
  const mc = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', { serverSelectionTimeoutMS: 3000 });
  await mc.connect();
  const m = mc.db(process.env.MONGODB_DB || 'spendsense_logs');
  await m.collection('audit_logs').createIndex({ user_id: 1, ts: -1 });
  await m.collection('activity_events').createIndex({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
  await m.collection('activity_events').createIndex({ action: 1, ts: -1 });
  if (demoId && (await m.collection('activity_events').countDocuments()) === 0) {
    const actions = ['login', 'view_dashboard', 'add_transaction', 'view_budgets', 'view_alerts'];
    const ev = Array.from({ length: 60 }, (_, i) => ({
      user_id: i % 5 === 0 ? 1 : demoId, action: actions[i % actions.length], meta: {},
      ts: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)),
    }));
    await m.collection('activity_events').insertMany(ev);
    await m.collection('audit_logs').insertMany([
      { user_id: demoId, action: 'create', entity: 'transaction', entity_id: 1, before: null, after: { amount: 60000, description: 'Monthly salary' }, ts: new Date() },
      { user_id: demoId, action: 'update', entity: 'budget', entity_id: 1, before: { limit_amount: 5000 }, after: { limit_amount: 6000 }, ts: new Date() },
    ]);
  }
  console.log('MongoDB: indexes ready and demo logs seeded.');
  await mc.close();
} catch (e) {
  console.warn('MongoDB not reachable, skipped (' + e.message + '). The app still runs; admin log views will be empty.');
}
console.log('\nDone. Demo logins:\n  admin@spendsense.com / Admin@123\n  demo@spendsense.com  / Demo@123');
