export type Category = 'passion' | 'routine' | 'body' | 'projects';

export type Deadline =
  | { kind: 'none' }
  | { kind: 'date'; date: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'recurring'; mode: 'day' | 'week' | 'month'; weekday?: number };

export interface Task {
  id: string;
  title: string;
  description: string;
  category: Category;
  deadline: Deadline;
  urgent: boolean;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
}

export type Screen = 'active' | 'archive';

export interface ServerTasksState {
  tasks: Task[];
  updatedAt: string;
  version: number;
}

export interface SaveTasksResponse {
  updatedAt: string;
  version: number;
}

export type BackupSource = 'auto' | 'manual';

export interface BackupSnapshotResponse {
  created: boolean;
  createdAt: string;
  retainedBackups: number;
  source: BackupSource;
  stateUpdatedAt: string;
  stateVersion: number;
  reason?: 'unchanged';
}

export interface CurrentUser {
  canLogout: boolean;
  username: string;
  name: string | null;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'conflict' | 'invalid';
