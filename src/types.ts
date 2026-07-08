export type Category = string;

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
  pinned?: boolean;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
}

export type Screen = 'active' | 'archive';

export type RainIntensity = 'none' | 'light' | 'moderate' | 'heavy' | 'max';

export type SkyCondition = 'none' | 'clear' | 'partly' | 'cloudy';

export type ThemeMode = 'light' | 'dark';

export interface BackgroundDecorationRef {
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

export interface AccountSettings {
  backgroundDecorations: BackgroundDecorationRef[];
  weatherCityId?: string;
}

export interface ServerTasksState {
  categories: CategoryOption[];
  tasks: Task[];
  settings: AccountSettings;
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
export const MAX_CATEGORIES = 16;
export const MAX_CATEGORY_KEY_LENGTH = 64;
export const MAX_CATEGORY_LABEL_LENGTH = 40;

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'invalid';

export interface CategoryOption {
  key: Category;
  label: string;
  color: string;
  status?: 'active' | 'archived';
  archivedAt?: string;
}

export const CATEGORY_COLOR_PALETTE = [
  '#e03131',
  '#868e96',
  '#002fa7',
  '#7048e8',
  '#0c8599',
  '#2f9e44',
  '#f08c00',
  '#c2255c',
  '#087f5b',
  '#1864ab',
  '#5f3dc4',
  '#e67700',
] as const;

export const DEFAULT_CATEGORIES: CategoryOption[] = [
  { key: 'passion', label: 'Страсти', color: '#e03131' },
  { key: 'routine', label: 'Бытец', color: '#868e96' },
  { key: 'body', label: 'Тело', color: '#002fa7' },
  { key: 'projects', label: 'Projects', color: '#7048e8' },
];

export const CATEGORIES = DEFAULT_CATEGORIES;
