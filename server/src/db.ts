import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      no TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      seller TEXT NOT NULL,
      city TEXT NOT NULL,
      subject TEXT NOT NULL,
      total INTEGER NOT NULL,
      down_pct INTEGER NOT NULL,
      term INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      stage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      passport TEXT,
      face_match INTEGER,
      signature TEXT,
      down_payment TEXT
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL REFERENCES deals(id),
      kind TEXT NOT NULL,          -- 'down' | 'installment'
      n INTEGER,                   -- installment number, NULL for the down payment
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS codes (
      deal_id TEXT NOT NULL REFERENCES deals(id),
      purpose TEXT NOT NULL,       -- 'phone' | 'sign'
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (deal_id, purpose)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT NOT NULL REFERENCES deals(id),
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT
    );
  `);
  return db;
}
