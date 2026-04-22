import { useEffect, useState } from 'react';
import ArchiveList from './components/ArchiveList';
import CategorySection from './components/CategorySection';
import CreateTaskModal from './components/CreateTaskModal';
import Header from './components/Header';
import TaskDetailsModal from './components/TaskDetailsModal';
import { loadTasks, saveTasks } from './storage';
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

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [screen, setScreen] = useState<Screen>(() => getScreenFromPath(window.location.pathname));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    saveTasks(tasks);
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

  const openTasks = tasks.filter((task) => task.status === 'open');
  const archiveTasks = [...tasks]
    .filter((task) => task.status === 'closed')
    .sort((left, right) => (right.closedAt ?? '').localeCompare(left.closedAt ?? ''));
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && task.status === 'open') ?? null;

  function navigateToScreen(nextScreen: Screen) {
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

  return (
    <div className="app">
      <div className="app__inner">
        <Header
          screen={screen}
          onToggleScreen={() => navigateToScreen(screen === 'active' ? 'archive' : 'active')}
          onCreate={() => setCreateModalOpen(true)}
        />

        {screen === 'active' ? (
          <main className="screen">
            <div className="sections">
              {CATEGORIES.map((category) => {
                const tasksForCategory = openTasks.filter((task) => task.category === category.key);

                return (
                  <CategorySection
                    key={category.key}
                    category={category.key}
                    label={category.label}
                    tasks={tasksForCategory}
                    onCreate={(title) =>
                      createTask({
                        title,
                        description: '',
                        category: category.key,
                        deadline: { kind: 'none' },
                      })
                    }
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
