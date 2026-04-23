import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface StoredStateRow {
  tasks_json: string;
  updated_at: string;
  version: number;
}

export type BackupSource = 'auto' | 'manual';

export interface BackupOwner {
  key: string;
  email: string | null;
  name: string | null;
}

export interface BackupSnapshotResult {
  created: boolean;
  createdAt: string;
  retainedBackups: number;
  source: BackupSource;
  stateUpdatedAt: string;
  stateVersion: number;
  reason?: 'unchanged';
}

interface LatestBackupRow {
  created_at: string;
  state_version: number;
}

const databasePath = process.env.SQLITE_PATH ?? '/data/monday.sqlite';
const MAX_BACKUPS_PER_USER = 3;
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tasks_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS task_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL,
    user_email TEXT,
    user_name TEXT,
    tasks_json TEXT NOT NULL,
    state_version INTEGER NOT NULL,
    state_updated_at TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS task_backups_user_key_created_at_idx
  ON task_backups (user_key, created_at DESC, id DESC)
`);

const stateColumns = db.prepare<[], { name: string }>('PRAGMA table_info(state)').all();
const hasVersionColumn = stateColumns.some((column) => column.name === 'version');

if (!hasVersionColumn) {
  db.exec('ALTER TABLE state ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
}

const now = new Date().toISOString();
db.prepare(`
  INSERT INTO state (id, tasks_json, updated_at, version)
  VALUES (1, @tasksJson, @updatedAt, 0)
  ON CONFLICT(id) DO NOTHING
`).run({
  tasksJson: '[]',
  updatedAt: now,
});

function readStateRow(): StoredStateRow {
  const row = db
    .prepare<[], StoredStateRow>('SELECT tasks_json, updated_at, version FROM state WHERE id = 1')
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

function countBackupsForUser(userKey: string): number {
  const row = db
    .prepare<{ userKey: string }, { count: number }>('SELECT COUNT(*) as count FROM task_backups WHERE user_key = @userKey')
    .get({ userKey });

  return row?.count ?? 0;
}

function buildTasksState(row: StoredStateRow): { tasks: unknown[]; updatedAt: string; version: number } {
  return {
    tasks: parseTasks(row.tasks_json),
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export function getTasksState(): { tasks: unknown[]; updatedAt: string; version: number } {
  const row = readStateRow();

  return buildTasksState(row);
}

export function setTasksState(
  tasks: unknown[],
  expectedVersion: number,
): { kind: 'updated'; state: { tasks: unknown[]; updatedAt: string; version: number } } | {
  kind: 'conflict';
  state: { tasks: unknown[]; updatedAt: string; version: number };
} {
  const updatedAt = new Date().toISOString();
  const nextVersion = expectedVersion + 1;

  const result = db.prepare(`
    UPDATE state
    SET tasks_json = @tasksJson,
        updated_at = @updatedAt,
        version = @nextVersion
    WHERE id = 1
      AND version = @expectedVersion
  `).run({
    tasksJson: JSON.stringify(tasks),
    updatedAt,
    nextVersion,
    expectedVersion,
  });

  if (result.changes === 0) {
    return {
      kind: 'conflict',
      state: getTasksState(),
    };
  }

  return {
    kind: 'updated',
    state: {
      tasks,
      updatedAt,
      version: nextVersion,
    },
  };
}

export function isDatabaseReady(): boolean {
  try {
    readStateRow();
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

const createBackupSnapshotTransaction = db.transaction(
  (owner: BackupOwner, source: BackupSource, row: StoredStateRow): BackupSnapshotResult => {
    const latest = db
      .prepare<{ userKey: string }, LatestBackupRow>(`
        SELECT created_at, state_version
        FROM task_backups
        WHERE user_key = @userKey
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .get({ userKey: owner.key });

    if (latest && latest.state_version === row.version) {
      return {
        created: false,
        createdAt: latest.created_at,
        retainedBackups: countBackupsForUser(owner.key),
        source,
        stateUpdatedAt: row.updated_at,
        stateVersion: row.version,
        reason: 'unchanged',
      };
    }

    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO task_backups (
        user_key,
        user_email,
        user_name,
        tasks_json,
        state_version,
        state_updated_at,
        source,
        created_at
      )
      VALUES (
        @userKey,
        @userEmail,
        @userName,
        @tasksJson,
        @stateVersion,
        @stateUpdatedAt,
        @source,
        @createdAt
      )
    `).run({
      userKey: owner.key,
      userEmail: owner.email,
      userName: owner.name,
      tasksJson: row.tasks_json,
      stateVersion: row.version,
      stateUpdatedAt: row.updated_at,
      source,
      createdAt,
    });

    db.prepare(`
      DELETE FROM task_backups
      WHERE user_key = @userKey
        AND id NOT IN (
          SELECT id
          FROM task_backups
          WHERE user_key = @userKey
          ORDER BY created_at DESC, id DESC
          LIMIT ${MAX_BACKUPS_PER_USER}
        )
    `).run({
      userKey: owner.key,
    });

    return {
      created: true,
      createdAt,
      retainedBackups: countBackupsForUser(owner.key),
      source,
      stateUpdatedAt: row.updated_at,
      stateVersion: row.version,
    };
  },
);

export function createBackupSnapshot(owner: BackupOwner, source: BackupSource): BackupSnapshotResult {
  return createBackupSnapshotTransaction(owner, source, readStateRow());
}

export function closeDatabase(): void {
  db.close();
}
