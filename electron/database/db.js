import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export function getDb() {
  if (db) return db;

  const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '../../data');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'tableflow.db');
  console.log('[DB] Opening database at:', dbPath);

  db = new Database(dbPath);

  // Performance: WAL mode for concurrent reads during writes
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Initialize schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  console.log('[DB] Database initialized successfully');
  return db;
}

export function generateId() {
  return crypto.randomUUID();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

// Prepared statement cache for hot paths
const stmtCache = new Map();

export function getStmt(sql) {
  if (!stmtCache.has(sql)) {
    stmtCache.set(sql, getDb().prepare(sql));
  }
  return stmtCache.get(sql);
}

// Transaction helper
export function runTransaction(fn) {
  const transaction = getDb().transaction(fn);
  return transaction();
}
