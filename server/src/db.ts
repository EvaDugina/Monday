import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface StoredStateRow {
  tasks_json: string;
  updated_at: string;
  version: number;
}

interface StoredCategory {
  key: string;
  label: string;
  color: string;
  status?: 'active' | 'archived';
  archivedAt?: string;
}

interface StoredBackgroundRef {
  id: string;
  imageId: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height?: number;
  opacity: number;
  rotation: number;
  depth: number;
}

interface StoredAccountSettings {
  backgroundDecorations: StoredBackgroundRef[];
  weatherCityId?: string;
}

interface StoredBoardState {
  categories: StoredCategory[];
  tasks: unknown[];
  settings: StoredAccountSettings;
}

interface TasksState {
  categories: StoredCategory[];
  tasks: unknown[];
  settings: StoredAccountSettings;
  updatedAt: string;
  version: number;
}

export interface BackgroundImageInput {
  id: string;
  userKey: string;
  mime: string;
  bytes: Buffer;
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
const DEFAULT_CATEGORIES: StoredCategory[] = [
  { key: 'passion', label: 'Страсти', color: '#e03131' },
  { key: 'routine', label: 'Бытец', color: '#868e96' },
  { key: 'body', label: 'Тело', color: '#002fa7' },
  { key: 'projects', label: 'Projects', color: '#7048e8' },
];
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

db.exec(`
  CREATE TABLE IF NOT EXISTS background_images (
    id TEXT PRIMARY KEY,
    user_key TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes BLOB NOT NULL,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS background_images_user_key_created_at_idx
  ON background_images (user_key, created_at DESC)
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

function defaultSettings(): StoredAccountSettings {
  return { backgroundDecorations: [] };
}

// Read-path shape-guard only; write-path validation lives in schema.ts (parseSettings).
function normalizeStoredSettings(value: unknown): StoredAccountSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return defaultSettings();
  }

  const record = value as { backgroundDecorations?: unknown; weatherCityId?: unknown };
  const backgroundDecorations = Array.isArray(record.backgroundDecorations)
    ? (record.backgroundDecorations as StoredBackgroundRef[])
    : [];
  const settings: StoredAccountSettings = { backgroundDecorations };

  if (typeof record.weatherCityId === 'string') {
    settings.weatherCityId = record.weatherCityId;
  }

  return settings;
}

function parseBoardState(raw: string): StoredBoardState {
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return { categories: DEFAULT_CATEGORIES, tasks: parsed, settings: defaultSettings() };
    }

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const candidate = parsed as { categories?: unknown; tasks?: unknown; settings?: unknown };
      return {
        categories: Array.isArray(candidate.categories) ? (candidate.categories as StoredCategory[]) : DEFAULT_CATEGORIES,
        tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
        settings: normalizeStoredSettings(candidate.settings),
      };
    }

    return { categories: DEFAULT_CATEGORIES, tasks: [], settings: defaultSettings() };
  } catch {
    return { categories: DEFAULT_CATEGORIES, tasks: [], settings: defaultSettings() };
  }
}

function countBackupsForUser(userKey: string): number {
  const row = db
    .prepare<{ userKey: string }, { count: number }>('SELECT COUNT(*) as count FROM task_backups WHERE user_key = @userKey')
    .get({ userKey });

  return row?.count ?? 0;
}

function buildTasksState(row: StoredStateRow): TasksState {
  const boardState = parseBoardState(row.tasks_json);

  return {
    categories: boardState.categories,
    tasks: boardState.tasks,
    settings: boardState.settings,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export function getTasksState(): TasksState {
  const row = readStateRow();

  return buildTasksState(row);
}

const setTasksStateTransaction = db.transaction(
  (
    tasks: unknown[],
    categories: StoredCategory[],
    settings: StoredAccountSettings,
    expectedVersion: number,
    userKey: string,
  ): { kind: 'updated'; state: TasksState } | { kind: 'conflict'; state: TasksState } => {
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
      tasksJson: JSON.stringify({ categories, tasks, settings }),
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

    // Orphan GC: drop this user's blobs no longer referenced by the accepted settings.
    deleteOrphanBackgroundImages(
      userKey,
      settings.backgroundDecorations.map((ref) => ref.imageId),
    );

    return {
      kind: 'updated',
      state: {
        categories,
        tasks,
        settings,
        updatedAt,
        version: nextVersion,
      },
    };
  },
);

export function setTasksState(
  tasks: unknown[],
  categories: StoredCategory[],
  settings: StoredAccountSettings,
  expectedVersion: number,
  userKey: string,
): { kind: 'updated'; state: TasksState } | { kind: 'conflict'; state: TasksState } {
  return setTasksStateTransaction(tasks, categories, settings, expectedVersion, userKey);
}

const BACKGROUND_IMAGE_GC_GRACE_MS = 60_000;

export function insertBackgroundImage(input: BackgroundImageInput): void {
  db.prepare(`
    INSERT INTO background_images (id, user_key, mime, bytes, created_at)
    VALUES (@id, @userKey, @mime, @bytes, @createdAt)
  `).run({
    id: input.id,
    userKey: input.userKey,
    mime: input.mime,
    bytes: input.bytes,
    createdAt: new Date().toISOString(),
  });
}

export function getBackgroundImage(id: string): { mime: string; bytes: Buffer } | null {
  const row = db
    .prepare<{ id: string }, { mime: string; bytes: Buffer }>('SELECT mime, bytes FROM background_images WHERE id = @id')
    .get({ id });

  return row ?? null;
}

export function countBackgroundImagesForUser(userKey: string): number {
  const row = db
    .prepare<{ userKey: string }, { count: number }>(
      'SELECT COUNT(*) as count FROM background_images WHERE user_key = @userKey',
    )
    .get({ userKey });

  return row?.count ?? 0;
}

// Deletes this user's blobs that are not referenced by keepImageIds and are older than the grace
// window, so a just-uploaded-but-not-yet-referenced image survives a concurrent unrelated save.
function deleteOrphanBackgroundImages(userKey: string, keepImageIds: string[]): number {
  const cutoff = new Date(Date.now() - BACKGROUND_IMAGE_GC_GRACE_MS).toISOString();
  const params: Record<string, string> = { userKey, cutoff };
  const placeholders = keepImageIds.map((imageId, index) => {
    const key = `keep${index}`;
    params[key] = imageId;
    return `@${key}`;
  });
  const notInClause = placeholders.length > 0 ? ` AND id NOT IN (${placeholders.join(', ')})` : '';

  const result = db
    .prepare(`DELETE FROM background_images WHERE user_key = @userKey AND created_at < @cutoff${notInClause}`)
    .run(params);

  return result.changes;
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
