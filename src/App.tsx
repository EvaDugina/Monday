import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createBackupSnapshot,
  fetchCurrentUser,
  isConflictStatePayload,
  pullTasksFromServer,
  pushTasksToServer,
} from './api';
import ArchiveList from './components/ArchiveList';
import CategorySection from './components/CategorySection';
import CreateTaskModal from './components/CreateTaskModal';
import Header from './components/Header';
import TaskDetailsModal from './components/TaskDetailsModal';
import { loadLocalState, sanitizeTasks, saveLocalState, serializeTasks } from './storage';
import type {
  BackupSnapshotResponse,
  BackupSource,
  Category,
  CurrentUser,
  Deadline,
  Screen,
  ServerTasksState,
  Task,
} from './types';
import { compareIsoDates } from './utils/dates';

const CATEGORIES: Array<{ key: Category; label: string }> = [
  { key: 'passion', label: 'Страсти' },
  { key: 'routine', label: 'Бытец' },
  { key: 'body', label: 'Тело' },
  { key: 'projects', label: 'Projects' },
];
const AUTO_BACKUP_INTERVAL_MS = 5 * 60_000;
const DEFAULT_BACKUP_TOOLTIP =
  'Резервные копии создаются автоматически раз в 5 минут. Нажмите на точку, чтобы создать снимок сейчас.';

function getScreenFromPath(pathname: string): Screen {
  return pathname.startsWith('/archive') ? 'archive' : 'active';
}

function getPathForScreen(screen: Screen): string {
  return screen === 'archive' ? '/archive' : '/';
}

function normalizeDeadline(deadline: Deadline): Deadline {
  switch (deadline.kind) {
    case 'date':
      return deadline.date ? deadline : { kind: 'none' };
    case 'range': {
      const from = deadline.from.trim();
      const to = deadline.to.trim();

      if (!from && !to) {
        return { kind: 'none' };
      }

      if (from && !to) {
        return { kind: 'date', date: from };
      }

      if (!from && to) {
        return { kind: 'date', date: to };
      }

      return compareIsoDates(from, to) <= 0 ? { kind: 'range', from, to } : { kind: 'range', from: to, to: from };
    }
    case 'recurring':
      return deadline.mode === 'week'
        ? { kind: 'recurring', mode: 'week', weekday: deadline.weekday ?? 1 }
        : { kind: 'recurring', mode: deadline.mode };
    default:
      return deadline;
  }
}

type SyncStatus = 'synced' | 'syncing' | 'offline' | 'conflict';

function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(timestamp));
}

function formatSyncedTooltip(updatedAt: string): string {
  return `Синхронизировано с сервером: ${formatDateTime(updatedAt)}`;
}

function formatBackupTooltip(result: BackupSnapshotResponse): string {
  const backupTime = formatDateTime(result.createdAt);
  const snapshotTime = formatDateTime(result.stateUpdatedAt);
  const actionLabel = result.created ? 'Резервная копия создана' : 'Последняя резервная копия уже актуальна';

  return `${actionLabel}: ${backupTime}. Снимок состояния: ${snapshotTime}. Храним последние ${result.retainedBackups} бэкапа на пользователя.`;
}

function App() {
  const initialStateRef = useRef<ReturnType<typeof loadLocalState> | null>(null);

  if (!initialStateRef.current) {
    initialStateRef.current = loadLocalState();
  }

  const initialState = initialStateRef.current;

  const [tasks, setTasks] = useState<Task[]>(() => initialState.tasks);
  const [serverVersion, setServerVersion] = useState<number | null>(() => initialState.version);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(() => initialState.updatedAt);
  const [screen, setScreen] = useState<Screen>(() => getScreenFromPath(window.location.pathname));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetCategory, setDropTargetCategory] = useState<Category | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [conflictState, setConflictState] = useState<ServerTasksState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [syncTooltip, setSyncTooltip] = useState('Подключаемся к серверу…');
  const [backupTooltip, setBackupTooltip] = useState(DEFAULT_BACKUP_TOOLTIP);
  const [isBackuping, setIsBackuping] = useState(false);
  const latestTasksRef = useRef(tasks);
  const serverVersionRef = useRef(serverVersion);
  const syncStatusRef = useRef<SyncStatus>(syncStatus);
  const conflictStateRef = useRef<ServerTasksState | null>(conflictState);
  const lastSyncedJsonRef = useRef(serializeTasks(tasks));
  const lastBackedUpVersionRef = useRef<number | null>(null);
  const hasInitializedSyncRef = useRef(false);
  const backupInFlightRef = useRef(false);
  const backupRunnerRef = useRef<(source: BackupSource) => void>(() => undefined);

  useEffect(() => {
    latestTasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    serverVersionRef.current = serverVersion;
  }, [serverVersion]);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  useEffect(() => {
    conflictStateRef.current = conflictState;
  }, [conflictState]);

  useEffect(() => {
    saveLocalState({
      tasks,
      version: serverVersion,
      updatedAt: serverUpdatedAt,
    });
  }, [serverUpdatedAt, serverVersion, tasks]);

  useEffect(() => {
    function handlePopState() {
      setScreen(getScreenFromPath(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId && task.status === 'open')) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const user = await fetchCurrentUser();

        if (!isCancelled && user.email) {
          setCurrentUser(user);
        }
      } catch {
        if (!isCancelled) {
          setCurrentUser(null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function bootstrapSync() {
      try {
        const serverState = await pullTasksFromServer();

        if (isCancelled) {
          return;
        }

        const serverTasks = sanitizeTasks(serverState.tasks);
        const serverJson = serializeTasks(serverTasks);
        const localTasks = latestTasksRef.current;
        const localJson = serializeTasks(localTasks);

        if (serverTasks.length === 0 && localTasks.length > 0) {
          const seededState = await pushTasksToServer(localTasks, serverState.version);

          if (isCancelled) {
            return;
          }

          lastSyncedJsonRef.current = localJson;
          setServerVersion(seededState.version);
          setServerUpdatedAt(seededState.updatedAt);
          setConflictState(null);
          setSyncStatus('synced');
          setSyncTooltip(formatSyncedTooltip(seededState.updatedAt));
          return;
        }

        setTasks(serverTasks);
        lastSyncedJsonRef.current = serverJson;
        setServerVersion(serverState.version);
        setServerUpdatedAt(serverState.updatedAt);
        setConflictState(null);
        setSyncStatus('synced');
        setSyncTooltip(formatSyncedTooltip(serverState.updatedAt));
      } catch (error) {
        if (isCancelled) {
          return;
        }

        lastSyncedJsonRef.current = serializeTasks(latestTasksRef.current);
        setSyncStatus('offline');
        setSyncTooltip('Сервер недоступен, работаем из localStorage.');
      } finally {
        if (!isCancelled) {
          hasInitializedSyncRef.current = true;
        }
      }
    }

    void bootstrapSync();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function waitForPendingSync(timeoutMs = 8_000): Promise<boolean> {
    const startedAt = Date.now();

    while (syncStatusRef.current === 'syncing') {
      if (Date.now() - startedAt >= timeoutMs) {
        return false;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }

    return true;
  }

  async function pushLatestTasksForBackup(): Promise<void> {
    const nextTasks = latestTasksRef.current;
    const nextJson = serializeTasks(nextTasks);

    if (nextJson === lastSyncedJsonRef.current) {
      return;
    }

    setSyncStatus('syncing');
    setSyncTooltip('Сохраняем изменения перед созданием резервной копии…');

    try {
      const nextState = await pushTasksToServer(nextTasks, serverVersionRef.current ?? 0);

      lastSyncedJsonRef.current = nextJson;
      setServerVersion(nextState.version);
      setServerUpdatedAt(nextState.updatedAt);
      setConflictState(null);
      setSyncStatus('synced');
      setSyncTooltip(formatSyncedTooltip(nextState.updatedAt));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && isConflictStatePayload(error.payload)) {
        setConflictState(error.payload);
        setSyncStatus('conflict');
        setSyncTooltip('На сервере есть более новая версия. Загрузите её перед следующей записью.');
        throw error;
      }

      setSyncStatus('offline');
      setSyncTooltip('Сервер недоступен, изменения сохранены только локально.');
      throw error;
    }
  }

  async function runBackup(source: BackupSource): Promise<void> {
    if (backupInFlightRef.current) {
      if (source === 'manual') {
        setBackupTooltip('Резервное копирование уже выполняется. Подождите завершения текущего снимка.');
      }
      return;
    }

    if (source === 'auto') {
      if (
        document.visibilityState === 'hidden' ||
        !hasInitializedSyncRef.current ||
        syncStatusRef.current !== 'synced' ||
        conflictStateRef.current !== null ||
        lastBackedUpVersionRef.current === serverVersionRef.current ||
        serializeTasks(latestTasksRef.current) !== lastSyncedJsonRef.current
      ) {
        return;
      }
    }

    backupInFlightRef.current = true;
    setIsBackuping(true);

    try {
      if (source === 'manual' && syncStatusRef.current === 'syncing') {
        setBackupTooltip('Дожидаемся завершения синхронизации перед созданием резервной копии…');

        const didSyncSettle = await waitForPendingSync();

        if (!didSyncSettle) {
          setBackupTooltip('Синхронизация не завершилась вовремя. Повторите создание резервной копии ещё раз.');
          return;
        }
      }

      if (conflictStateRef.current) {
        setBackupTooltip('Сначала разрешите конфликт синхронизации, затем создайте резервную копию ещё раз.');
        return;
      }

      if (source === 'manual' && serializeTasks(latestTasksRef.current) !== lastSyncedJsonRef.current) {
        await pushLatestTasksForBackup();
      }

      const result = await createBackupSnapshot(source);
      lastBackedUpVersionRef.current = result.stateVersion;
      setBackupTooltip(formatBackupTooltip(result));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && isConflictStatePayload(error.payload)) {
        setBackupTooltip('Резервная копия не создана: на сервере уже есть более новая версия. Сначала загрузите её.');
      } else if (source === 'manual') {
        setBackupTooltip('Не удалось создать резервную копию: сервер сейчас недоступен. Попробуйте ещё раз.');
      }
    } finally {
      backupInFlightRef.current = false;
      setIsBackuping(false);
    }
  }

  backupRunnerRef.current = (source: BackupSource) => {
    void runBackup(source);
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      backupRunnerRef.current('auto');
    }, AUTO_BACKUP_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!hasInitializedSyncRef.current) {
      return;
    }

    if (conflictState) {
      return;
    }

    const nextJson = serializeTasks(tasks);

    if (nextJson === lastSyncedJsonRef.current) {
      return;
    }

    let isCancelled = false;
    setSyncStatus('syncing');
    setSyncTooltip('Сохраняем изменения и отправляем их на сервер…');

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const nextState = await pushTasksToServer(tasks, serverVersionRef.current ?? 0);

          if (isCancelled) {
            return;
          }

          lastSyncedJsonRef.current = nextJson;
          setServerVersion(nextState.version);
          setServerUpdatedAt(nextState.updatedAt);
          setConflictState(null);
          setSyncStatus('synced');
          setSyncTooltip(formatSyncedTooltip(nextState.updatedAt));
        } catch (error) {
          if (isCancelled) {
            return;
          }

          if (error instanceof ApiError && error.status === 409 && isConflictStatePayload(error.payload)) {
            setConflictState(error.payload);
            setSyncStatus('conflict');
            setSyncTooltip('На сервере есть более новая версия. Загрузите её перед следующей записью.');
            return;
          }

          setSyncStatus('offline');
          setSyncTooltip('Сервер недоступен, изменения сохранены только локально.');
        }
      })();
    }, 500);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [conflictState, tasks]);

  const openTasks = tasks.filter((task) => task.status === 'open');
  const archiveTasks = [...tasks]
    .filter((task) => task.status === 'closed')
    .sort((left, right) => (right.closedAt ?? '').localeCompare(left.closedAt ?? ''));
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && task.status === 'open') ?? null;
  const draggedTask =
    tasks.find((task) => task.id === draggedTaskId && task.status === 'open') ?? null;

  function navigateToScreen(nextScreen: Screen) {
    window.history.pushState({}, '', getPathForScreen(nextScreen));
    setScreen(nextScreen);
    setSelectedTaskId(null);
  }

  function reloadServerState() {
    if (!conflictState) {
      return;
    }

    const serverTasks = sanitizeTasks(conflictState.tasks);

    setTasks(serverTasks);
    setServerVersion(conflictState.version);
    setServerUpdatedAt(conflictState.updatedAt);
    lastSyncedJsonRef.current = serializeTasks(serverTasks);
    setConflictState(null);
    setSyncStatus('synced');
    setSyncTooltip(formatSyncedTooltip(conflictState.updatedAt));
    setSelectedTaskId(null);
  }

  function createTask(payload: {
    title: string;
    description: string;
    category: Category;
    deadline: Deadline;
    urgent?: boolean;
  }) {
    const nextTask: Task = {
      id: crypto.randomUUID(),
      title: payload.title,
      description: payload.description,
      category: payload.category,
      deadline: normalizeDeadline(payload.deadline),
      urgent: payload.urgent ?? false,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [nextTask, ...current]);
  }

  function updateTask(updatedTask: Task) {
    setTasks((current) =>
      current.map((task) =>
        task.id === updatedTask.id
          ? {
              ...updatedTask,
              deadline: normalizeDeadline(updatedTask.deadline),
            }
          : task,
      ),
    );
  }

  function archiveTask(taskId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'closed',
              closedAt: new Date().toISOString(),
            }
          : task,
      ),
    );
    setSelectedTaskId(null);
  }

  function restoreTask(taskId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'open',
              closedAt: undefined,
            }
          : task,
      ),
    );
  }

  function deleteTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setSelectedTaskId((current) => (current === taskId ? null : current));
  }

  function startTaskDrag(taskId: string) {
    setDraggedTaskId(taskId);
  }

  function updateDropTarget(category: Category | null) {
    setDropTargetCategory((current) => (current === category ? current : category));
  }

  function endTaskDrag() {
    setDraggedTaskId(null);
    setDropTargetCategory(null);
  }

  function moveTaskToCategory(taskId: string, nextCategory: Category) {
    setTasks((current) => {
      let hasChanged = false;

      const nextTasks = current.map((task) => {
        if (task.id !== taskId || task.status !== 'open' || task.category === nextCategory) {
          return task;
        }

        hasChanged = true;
        return {
          ...task,
          category: nextCategory,
        };
      });

      return hasChanged ? nextTasks : current;
    });
  }

  return (
    <div className="app">
      <div className="app__inner">
        <Header
          backupTooltip={backupTooltip}
          screen={screen}
          currentUser={currentUser}
          isBackuping={isBackuping}
          syncStatus={syncStatus}
          syncTooltip={syncTooltip}
          onBackup={() => backupRunnerRef.current('manual')}
          onToggleScreen={() => navigateToScreen(screen === 'active' ? 'archive' : 'active')}
          onCreate={() => setCreateModalOpen(true)}
        />

        {conflictState && (
          <section className="sync-alert sync-alert--conflict" role="status">
            <div className="sync-alert__copy">
              <strong>Конфликт синхронизации</strong>
              <span>
                На другом устройстве сохранена более новая версия. Локальные изменения не будут отправляться,
                пока вы не загрузите состояние с сервера.
              </span>
            </div>

            <button type="button" className="button button--secondary" onClick={reloadServerState}>
              Загрузить серверную версию
            </button>
          </section>
        )}

        {screen === 'active' ? (
          <main className="screen">
            <div className="sections">
              {CATEGORIES.map((category) => {
                const tasksForCategory = openTasks
                  .filter((task) => task.category === category.key)
                  .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

                return (
                  <CategorySection
                    key={category.key}
                    category={category.key}
                    label={category.label}
                    tasks={tasksForCategory}
                    draggedTaskId={draggedTaskId}
                    draggedTaskCategory={draggedTask?.category ?? null}
                    isDropTarget={dropTargetCategory === category.key}
                    onDropTargetChange={updateDropTarget}
                    onCreate={(title) =>
                      createTask({
                        title,
                        description: '',
                        category: category.key,
                        deadline: { kind: 'none' },
                      })
                    }
                    onTaskDragStart={startTaskDrag}
                    onTaskDragEnd={endTaskDrag}
                    onTaskDrop={moveTaskToCategory}
                    onTaskOpen={setSelectedTaskId}
                    onQuickClose={archiveTask}
                  />
                );
              })}
            </div>
          </main>
        ) : (
          <main className="screen">
            <ArchiveList
              tasks={archiveTasks}
              categories={CATEGORIES}
              onRestore={restoreTask}
              onDelete={deleteTask}
            />
          </main>
        )}
      </div>

      <TaskDetailsModal
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onSave={updateTask}
        onArchive={archiveTask}
        onDelete={deleteTask}
      />

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        categories={CATEGORIES}
        defaultCategory="passion"
        onClose={() => setCreateModalOpen(false)}
        onCreate={createTask}
      />
    </div>
  );
}

export default App;
