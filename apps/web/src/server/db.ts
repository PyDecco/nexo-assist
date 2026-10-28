import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_USERS } from '@nexo/core';

export type Db = DatabaseSync;

export function openWebDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      team TEXT
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL REFERENCES users(email),
      state TEXT NOT NULL,
      assigned_analyst TEXT,
      transfer_json TEXT,
      pending_draft_json TEXT,
      draft_message_id TEXT,
      memory_json TEXT NOT NULL DEFAULT '{}',
      user_message_count INTEGER NOT NULL DEFAULT 0,
      last_message_preview TEXT,
      last_message_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_email, updated_at);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, seq);
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO users (email, name, role, department, team) VALUES (?, ?, ?, ?, ?)');
  for (const u of SEED_USERS) insert.run(u.email, u.name, u.role, u.department, u.team ?? null);
  return db;
}
