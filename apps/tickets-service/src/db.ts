import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tickets (
      number TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL,
      impact TEXT NOT NULL,
      status TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tickets_requester ON tickets(requester_email);
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL REFERENCES tickets(number),
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS counters (type TEXT PRIMARY KEY, next INTEGER NOT NULL);
  `);
  return db;
}
