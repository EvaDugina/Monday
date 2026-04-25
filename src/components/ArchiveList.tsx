import type { Category, Task } from '../types';
import { formatDateTime } from '../utils/dates';
import { getUrgency } from '../utils/urgency';

interface CategoryOption {
  key: Category;
  label: string;
}

interface ArchiveListProps {
  tasks: Task[];
  categories: CategoryOption[];
  onRestore: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

function ArchiveList({ tasks, categories, onRestore, onDelete }: ArchiveListProps) {
  const categoryLabels = Object.fromEntries(categories.map((category) => [category.key, category.label])) as Record<
    Category,
    string
  >;

  function handleDelete(taskId: string) {
    const confirmed = window.confirm('Удалить задачу навсегда? Это действие необратимо.');
    if (!confirmed) {
      return;
    }
    onDelete(taskId);
  }

  if (tasks.length === 0) {
    return <div className="empty-state">Архив пока пуст. Закрытые задачи появятся здесь.</div>;
  }

  return (
    <div className="archive-list">
      {tasks.map((task) => {
        const urgency = getUrgency(task.deadline);

        return (
          <article key={task.id} className="archive-item" data-category={task.category}>
            <div className="archive-item__content">
              <div className="archive-item__topline">
                <span className="archive-item__dot" aria-hidden="true" />
                <span className="archive-item__category">{categoryLabels[task.category]}</span>
                {task.closedAt && <span className="archive-item__time">{formatDateTime(task.closedAt)}</span>}
              </div>

              <h3>{task.title}</h3>

              {task.description && <p className="archive-item__description">{task.description}</p>}

              {urgency.label && <p className="archive-item__deadline">{urgency.label}</p>}
            </div>

            <div className="archive-item__actions">
              <button type="button" className="button button--secondary" onClick={() => onRestore(task.id)}>
                Вернуть
              </button>
              <button type="button" className="button button--danger" onClick={() => handleDelete(task.id)}>
                Удалить
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default ArchiveList;
