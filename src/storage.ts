import type { Task } from './types';

const TASKS_STORAGE_KEY = 'monday:tasks';
const ARCHIVE_RETENTION_DAYS = 90;

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

export function loadTasks(): Task[] {
  const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);

  if (!raw) {
    return [];
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
    return [];
  }

  const sanitized = sanitizeTasks(rawTasks);
  const changed = serializeTasks(sanitized) !== serializeTasks(rawTasks);

  if (changed) {
    saveTasks(sanitized);
  }

  return sanitized;
}

export function saveTasks(tasks: Task[]): void {
  try {
    window.localStorage.setItem(TASKS_STORAGE_KEY, serializeTasks(tasks));
  } catch (error) {
    console.error('[MONDAY] Failed to persist tasks to localStorage:', error);
  }
}
