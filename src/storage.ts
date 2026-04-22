import type { Task } from './types';

const TASKS_STORAGE_KEY = 'monday:tasks';
const ARCHIVE_RETENTION_DAYS = 90;

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

export function loadTasks(): Task[] {
  const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Task[];
    const rawTasks = Array.isArray(parsed) ? parsed : [];
    const migrated = rawTasks.map((task) => ({ ...task, urgent: task.urgent ?? false }));
    const pruned = pruneArchive(migrated);
    const changed = pruned.length !== rawTasks.length || migrated.some((task, index) => task !== rawTasks[index]);

    if (changed) {
      saveTasks(pruned);
    }

    return pruned;
  } catch {
    window.localStorage.removeItem(TASKS_STORAGE_KEY);
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}
