import type { Task } from './types';

interface PullTasksResponse {
  tasks: Task[];
  updatedAt: string;
}

interface PushTasksResponse {
  updatedAt: string;
}

async function readJsonResponse<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function pullTasksFromServer(): Promise<PullTasksResponse> {
  const payload = await readJsonResponse<PullTasksResponse>('/api/tasks', {
    cache: 'no-store',
  });

  if (!Array.isArray(payload.tasks) || typeof payload.updatedAt !== 'string') {
    throw new Error('Invalid /api/tasks response payload');
  }

  return payload;
}

export async function pushTasksToServer(tasks: Task[]): Promise<PushTasksResponse> {
  const payload = await readJsonResponse<PushTasksResponse>('/api/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tasks }),
  });

  if (typeof payload.updatedAt !== 'string') {
    throw new Error('Invalid PUT /api/tasks response payload');
  }

  return payload;
}
