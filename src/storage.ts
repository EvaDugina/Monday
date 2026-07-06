import type { CategoryOption, Task } from './types';
import {
  CATEGORIES,
  CATEGORY_COLOR_PALETTE,
  MAX_CATEGORIES,
  MAX_CATEGORY_KEY_LENGTH,
  MAX_CATEGORY_LABEL_LENGTH,
} from './types';

const TASKS_STORAGE_KEY = 'monday:tasks';
const CATEGORIES_STORAGE_KEY = 'monday:categories';
const SYNC_STATE_STORAGE_KEY = 'monday:sync-state';
const LAST_SYNCED_TASKS_STORAGE_KEY = 'monday:last-synced-tasks';
const ARCHIVE_RETENTION_DAYS = 90;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export interface LocalStateSnapshot {
  categories: CategoryOption[];
  lastSyncedJson: string | null;
  tasks: Task[];
  version: number | null;
  updatedAt: string | null;
}

export function serializeTasks(tasks: Task[]): string {
  return JSON.stringify(tasks);
}

export function serializeBoardState(tasks: Task[], categories: CategoryOption[]): string {
  return JSON.stringify({ tasks, categories });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFallbackCategoryColor(index: number): string {
  return CATEGORY_COLOR_PALETTE[index % CATEGORY_COLOR_PALETTE.length];
}

export function sanitizeCategories(categories: unknown, tasks: Task[] = []): CategoryOption[] {
  const rawCategories = Array.isArray(categories) && categories.length > 0 ? categories : CATEGORIES;
  const nextCategories: CategoryOption[] = [];
  const seenKeys = new Set<string>();

  rawCategories.slice(0, MAX_CATEGORIES).forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      return;
    }

    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const color = typeof candidate.color === 'string' ? candidate.color.trim() : '';
    const status = candidate.status === 'archived' ? 'archived' : 'active';
    const archivedAt =
      status === 'archived' && typeof candidate.archivedAt === 'string' && !Number.isNaN(Date.parse(candidate.archivedAt))
        ? candidate.archivedAt
        : undefined;

    if (!key || key.length > MAX_CATEGORY_KEY_LENGTH || seenKeys.has(key)) {
      return;
    }

    const category: CategoryOption = {
      key,
      label: label.slice(0, MAX_CATEGORY_LABEL_LENGTH) || key,
      color: HEX_COLOR_PATTERN.test(color) ? color : getFallbackCategoryColor(index),
      status: status === 'archived' ? 'archived' : undefined,
    };

    if (archivedAt) {
      category.archivedAt = archivedAt;
    }

    nextCategories.push(category);
    seenKeys.add(key);
  });

  if (nextCategories.length === 0) {
    CATEGORIES.forEach((category) => {
      nextCategories.push(category);
      seenKeys.add(category.key);
    });
  }

  tasks.forEach((task) => {
    const key = typeof task.category === 'string' ? task.category.trim() : '';

    if (!key || key.length > MAX_CATEGORY_KEY_LENGTH || seenKeys.has(key) || nextCategories.length >= MAX_CATEGORIES) {
      return;
    }

    nextCategories.push({
      key,
      label: key,
      color: getFallbackCategoryColor(nextCategories.length),
    });
    seenKeys.add(key);
  });

  return nextCategories;
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
    const rawTasks = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const sanitizedTasks = sanitizeTasks(rawTasks as Task[]);
    const rawCategories = isRecord(parsed) && Array.isArray(parsed.categories) ? parsed.categories : CATEGORIES;
    const sanitizedCategories = sanitizeCategories(rawCategories, sanitizedTasks);
    return serializeBoardState(sanitizedTasks, sanitizedCategories);
  } catch {
    return null;
  }
}

function loadCategories(tasks: Task[]): CategoryOption[] {
  const raw = window.localStorage.getItem(CATEGORIES_STORAGE_KEY);

  if (!raw) {
    return sanitizeCategories(CATEGORIES, tasks);
  }

  try {
    return sanitizeCategories(JSON.parse(raw), tasks);
  } catch {
    return sanitizeCategories(CATEGORIES, tasks);
  }
}

export function loadLocalState(): LocalStateSnapshot {
  const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);
  const syncMetadata = loadSyncMetadata();
  const lastSyncedJson = loadLastSyncedJson();

  if (!raw) {
    return {
      categories: loadCategories([]),
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
      categories: loadCategories([]),
      lastSyncedJson,
      tasks: [],
      version: syncMetadata.version,
      updatedAt: syncMetadata.updatedAt,
    };
  }

  const sanitized = sanitizeTasks(rawTasks);
  const categories = loadCategories(sanitized);
  const changed = serializeTasks(sanitized) !== serializeTasks(rawTasks);

  if (changed) {
    saveLocalState({
      categories,
      lastSyncedJson,
      tasks: sanitized,
      version: syncMetadata.version,
      updatedAt: syncMetadata.updatedAt,
    });
  }

  return {
    categories,
    lastSyncedJson,
    tasks: sanitized,
    version: syncMetadata.version,
    updatedAt: syncMetadata.updatedAt,
  };
}

export function saveLocalState(snapshot: LocalStateSnapshot): void {
  try {
    window.localStorage.setItem(TASKS_STORAGE_KEY, serializeTasks(snapshot.tasks));
    window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(snapshot.categories));
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
