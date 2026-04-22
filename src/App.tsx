import { useEffect, useRef, useState } from 'react';
import { pullTasksFromServer, pushTasksToServer } from './api';
import ArchiveList from './components/ArchiveList';
import CategorySection from './components/CategorySection';
import CreateTaskModal from './components/CreateTaskModal';
import Header from './components/Header';
import TaskDetailsModal from './components/TaskDetailsModal';
import { loadTasks, sanitizeTasks, saveTasks, serializeTasks } from './storage';
import type { Category, Deadline, Screen, Task } from './types';
import { compareIsoDates } from './utils/dates';

const CATEGORIES: Array<{ key: Category; label: string }> = [
  { key: 'passion', label: 'Страсти' },
  { key: 'routine', label: 'Бытец' },
  { key: 'body', label: 'Тело' },
  { key: 'projects', label: 'Projects' },
];

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

type SyncStatus = 'synced' | 'syncing' | 'offline';

function formatSyncedTooltip(updatedAt: string): string {
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(updatedAt));

  return `Синхронизировано с сервером: ${formatted}`;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [screen, setScreen] = useState<Screen>(() => getScreenFromPath(window.location.pathname));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetCategory, setDropTargetCategory] = useState<Category | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing');
  const [syncTooltip, setSyncTooltip] = useState('Подключаемся к серверу…');
  const latestTasksRef = useRef(tasks);
  const lastSyncedJsonRef = useRef(serializeTasks(tasks));
  const hasInitializedSyncRef = useRef(false);

  useEffect(() => {
    latestTasksRef.current = tasks;
  }, [tasks]);

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
          const seededState = await pushTasksToServer(localTasks);

          if (isCancelled) {
            return;
          }

          saveTasks(localTasks);
          lastSyncedJsonRef.current = localJson;
          setSyncStatus('synced');
          setSyncTooltip(formatSyncedTooltip(seededState.updatedAt));
          return;
        }

        setTasks(serverTasks);
        saveTasks(serverTasks);
        lastSyncedJsonRef.current = serverJson;
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

  useEffect(() => {
    if (!hasInitializedSyncRef.current) {
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
        saveTasks(tasks);

        try {
          const nextState = await pushTasksToServer(tasks);

          if (isCancelled) {
            return;
          }

          lastSyncedJsonRef.current = nextJson;
          setSyncStatus('synced');
          setSyncTooltip(formatSyncedTooltip(nextState.updatedAt));
        } catch (error) {
          if (isCancelled) {
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
  }, [tasks]);

  const openTasks = tasks.filter((task) => task.status === 'open');
  const archiveTasks = [...tasks]
    .filter((task) => task.status === 'closed')
    .sort((left, right) => (right.closedAt ?? '').localeCompare(left.closedAt ?? ''));
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && task.status === 'open') ?? null;
  const draggedTask =
    tasks.find((task) => task.id === draggedTaskId && task.status === 'open') ?? null;

  function navigateToScreen(nextScreen: Screen) {
    if (nextScreen === screen) {
      return;
    }

    window.history.pushState({}, '', getPathForScreen(nextScreen));
    setScreen(nextScreen);
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
          screen={screen}
          syncStatus={syncStatus}
          syncTooltip={syncTooltip}
          onNavigate={navigateToScreen}
          onCreate={() => setCreateModalOpen(true)}
        />

        <main key={screen} className={`screen screen--${screen}`}>
          {screen === 'active' ? (
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
                    selectedTaskId={selectedTaskId}
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
          ) : (
            <ArchiveList
              tasks={archiveTasks}
              categories={CATEGORIES}
              onRestore={restoreTask}
              onDelete={deleteTask}
            />
          )}
        </main>
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
