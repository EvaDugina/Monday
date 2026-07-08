import type {
  AccountSettings,
  BackgroundDecorationRef,
  BackupSnapshotResponse,
  BackupSource,
  CategoryOption,
  CurrentUser,
  SaveTasksResponse,
  ServerTasksState,
  Task,
} from './types';
import { buildApiPath } from './basePath';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServerTasksState(value: unknown): value is ServerTasksState {
  return (
    isRecord(value) &&
    Array.isArray(value.categories) &&
    Array.isArray(value.tasks) &&
    typeof value.updatedAt === 'string' &&
    typeof value.version === 'number'
  );
}

function isSaveTasksResponse(value: unknown): value is SaveTasksResponse {
  return isRecord(value) && typeof value.updatedAt === 'string' && typeof value.version === 'number';
}

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    isRecord(value) &&
    typeof value.canLogout === 'boolean' &&
    typeof value.username === 'string' &&
    (typeof value.name === 'string' || value.name === null)
  );
}

function isBackupSnapshotResponse(value: unknown): value is BackupSnapshotResponse {
  return (
    isRecord(value) &&
    typeof value.created === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.retainedBackups === 'number' &&
    (value.source === 'auto' || value.source === 'manual') &&
    typeof value.stateUpdatedAt === 'string' &&
    typeof value.stateVersion === 'number' &&
    (value.reason === undefined || value.reason === 'unchanged')
  );
}

async function readJsonResponse<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'same-origin',
    ...init,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, payload);
  }

  return payload as T;
}

function normalizeAccountSettings(value: unknown): AccountSettings {
  if (!isRecord(value)) {
    return { backgroundDecorations: [] };
  }

  const backgroundDecorations = Array.isArray(value.backgroundDecorations)
    ? (value.backgroundDecorations as BackgroundDecorationRef[])
    : [];
  const settings: AccountSettings = { backgroundDecorations };

  if (typeof value.weatherCityId === 'string') {
    settings.weatherCityId = value.weatherCityId;
  }

  return settings;
}

function normalizeServerTasksState(state: ServerTasksState): ServerTasksState {
  return {
    ...state,
    settings: normalizeAccountSettings((state as { settings?: unknown }).settings),
  };
}

export function isConflictStatePayload(value: unknown): value is ServerTasksState {
  return isServerTasksState(value);
}

export function normalizeConflictState(state: ServerTasksState): ServerTasksState {
  return normalizeServerTasksState(state);
}

export async function pullTasksFromServer(): Promise<ServerTasksState> {
  const payload = await readJsonResponse<ServerTasksState>(buildApiPath('tasks'), {
    cache: 'no-store',
  });

  if (!isServerTasksState(payload)) {
    throw new Error('Invalid /api/tasks response payload');
  }

  return normalizeServerTasksState(payload);
}

export async function pushTasksToServer(
  tasks: Task[],
  categories: CategoryOption[],
  settings: AccountSettings,
  expectedVersion: number,
): Promise<SaveTasksResponse> {
  const payload = await readJsonResponse<SaveTasksResponse>(buildApiPath('tasks'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categories, tasks, settings, expectedVersion }),
  });

  if (!isSaveTasksResponse(payload)) {
    throw new Error('Invalid PUT /api/tasks response payload');
  }

  return payload;
}

export function backgroundImageUrl(imageId: string): string {
  return buildApiPath(`backgrounds/${encodeURIComponent(imageId)}`);
}

export async function uploadBackgroundImage(file: Blob): Promise<{ id: string }> {
  const payload = await readJsonResponse<{ id: string }>(buildApiPath('backgrounds'), {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!isRecord(payload) || typeof payload.id !== 'string') {
    throw new Error('Invalid POST /api/backgrounds response payload');
  }

  return { id: payload.id };
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const payload = await readJsonResponse<CurrentUser>(buildApiPath('me'), {
    cache: 'no-store',
  });

  if (!isCurrentUser(payload)) {
    throw new Error('Invalid /api/me response payload');
  }

  return payload;
}

export async function createBackupSnapshot(source: BackupSource): Promise<BackupSnapshotResponse> {
  const payload = await readJsonResponse<BackupSnapshotResponse>(buildApiPath('backups'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source }),
  });

  if (!isBackupSnapshotResponse(payload)) {
    throw new Error('Invalid POST /api/backups response payload');
  }

  return payload;
}

export async function loginToServer(username: string, password: string): Promise<CurrentUser> {
  const payload = await readJsonResponse<CurrentUser>(buildApiPath('auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!isCurrentUser(payload)) {
    throw new Error('Invalid POST /api/auth/login response payload');
  }

  return payload;
}

export async function logoutFromServer(): Promise<void> {
  const response = await fetch(buildApiPath('auth/logout'), {
    credentials: 'same-origin',
    method: 'POST',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(`Request failed with status ${response.status}`, response.status, payload);
  }
}
