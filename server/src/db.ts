import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface StoredStateRow {
  tasks_json: string;
  updated_at: string;
}

const databasePath = process.env.SQLITE_PATH ?? '/data/monday.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tasks_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const now = new Date().toISOString();
db.prepare(`
  INSERT INTO state (id, tasks_json, updated_at)
  VALUES (1, @tasksJson, @updatedAt)
  ON CONFLICT(id) DO NOTHING
`).run({
  tasksJson: '[]',
  updatedAt: now,
});

function readStateRow(): StoredStateRow {
  const row = db
    .prepare<[], StoredStateRow>('SELECT tasks_json, updated_at FROM state WHERE id = 1')
    .get();

  if (!row) {
    throw new Error('State row is missing');
  }

  return row;
}

function parseTasks(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getTasksState(): { tasks: unknown[]; updatedAt: string } {
  const row = readStateRow();

  return {
    tasks: parseTasks(row.tasks_json),
    updatedAt: row.updated_at,
  };
}

export function setTasksState(tasks: unknown[]): { updatedAt: string } {
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE state
    SET tasks_json = @tasksJson,
        updated_at = @updatedAt
    WHERE id = 1
  `).run({
    tasksJson: JSON.stringify(tasks),
    updatedAt,
  });

  return { updatedAt };
}
