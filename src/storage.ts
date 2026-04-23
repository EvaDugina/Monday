import type { Task } from './types';

const TASKS_STORAGE_KEY = 'monday:tasks';
const SYNC_STATE_STORAGE_KEY = 'monday:sync-state';
const LAST_SYNCED_TASKS_STORAGE_KEY = 'monday:last-synced-tasks';
const ARCHIVE_RETENTION_DAYS = 90;

export interface LocalStateSnapshot {
  lastSyncedJson: string | null;
  tasks: Task[];
  version: number | null;
  updatedAt: string | null;
}

export function serializeTasks(tasks: Task[]): string {
  return JSON.stringify(tasks);
}

export function pruneArchive(tasks: Task[], now = new Date()): Task[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - ARCHIVE_RETENTION_DAYS);
  const cutoffTime = cutoff.getTime();

  return tasks.filter((task) => {
    if (task.status !== 'closed' || !task.closedAt) {
      return true;
    }

    return new Date(task.closedAt).getTime() >= cutoffTime;
  });
}

export function migrateTask(task: Task): Task {
  return { ...task, urgent: task.urgent ?? false };
}

export function sanitizeTasks(tasks: Task[]): Task[] {
  return pruneArchive(tasks.map(migrateTask));
}

function loadSyncMetadata(): Pick<LocalStateSnapshot, 'updatedAt' | 'version'> {
  const raw = window.localStorage.getItem(SYNC_STATE_STORAGE_KEY);

  if (!raw) {
    return { version: null, updatedAt: null };
  }

  try {
    const parsed = JSON.parse(raw) as { version?: unknown; updatedAt?: unknown };

    return {
      version: typeof parsed.version === 'number' && Number.isInteger(parsed.version) ? parsed.version : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return { version: null, updatedAt: null };
  }
}

function loadLastSyncedJson(): string | null {
  const raw = window.localStorage.getItem(LAST_SYNCED_TASKS_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeTasks(Array.isArray(parsed) ? (parsed as Task[]) : []);
    return serializeTasks(sanitized);
  } catch {
    return null;
  }
}

export function loadLocalState(): LocalStateSnapshot {
  const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);
  const syncMetadata = loadSyncMetadata();
  const lastSyncedJson = loadLastSyncedJson();

  if (!raw) {
    return {
      lastSyncedJson,
      tasks: [],
      version: syncMetadata.version,
      updatedAt: syncMetadata.updatedAt,
    };
  }

  let rawTasks: Task[] = [];

  try {
    const parsed = JSON.parse(raw);
    rawTasks = Array.isArray(parsed) ? parsed : [];
  } catch {
    const quarantineKey = `${TASKS_STORAGE_KEY}:corrupt:${Date.now()}`;
    try {
      window.localStorage.setItem(quarantineKey, raw);
    } catch {
      // quarantine failed too (quota) — original data stays in main slot, untouched
    }
    return {
      lastSyncedJson,
      tasks: [],
      version: syncMetadata.version,
      updatedAt: syncMetadata.updatedAt,
    };
  }

  const sanitized = sanitizeTasks(rawTasks);
  const changed = serializeTasks(sanitized) !== serializeTasks(rawTasks);

  if (changed) {
    saveLocalState({
      lastSyncedJson,
      tasks: sanitized,
      version: syncMetadata.version,
      updatedAt: syncMetadata.updatedAt,
    });
  }

  return {
    lastSyncedJson,
    tasks: sanitized,
    version: syncMetadata.version,
    updatedAt: syncMetadata.updatedAt,
  };
}

export function saveLocalState(snapshot: LocalStateSnapshot): void {
  try {
    window.localStorage.setItem(TASKS_STORAGE_KEY, serializeTasks(snapshot.tasks));
    window.localStorage.setItem(
      SYNC_STATE_STORAGE_KEY,
      JSON.stringify({
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
      }),
    );

    if (snapshot.lastSyncedJson === null) {
      window.localStorage.removeItem(LAST_SYNCED_TASKS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LAST_SYNCED_TASKS_STORAGE_KEY, snapshot.lastSyncedJson);
    }
  } catch (error) {
    console.error('[MONDAY] Failed to persist state to localStorage:', error);
  }
}
