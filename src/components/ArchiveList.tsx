import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Category, CategoryOption, Task } from '../types';
import { formatDateTime } from '../utils/dates';
import { getUrgency } from '../utils/urgency';

interface ArchiveListProps {
  tasks: Task[];
  categories: CategoryOption[];
  archivedCategories: CategoryOption[];
  onDeleteCategory: (category: Category) => void;
  onRestore: (taskId: string) => void;
  onRestoreCategory: (category: Category) => void;
  onDelete: (taskId: string) => void;
}

function ArchiveList({
  tasks,
  categories,
  archivedCategories,
  onDeleteCategory,
  onRestore,
  onRestoreCategory,
  onDelete,
}: ArchiveListProps) {
  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.key, category.label])) as Record<Category, string>,
    [categories],
  );
  const categoryColors = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.key, category.color])) as Record<Category, string>,
    [categories],
  );
  const archivedCategoryKeys = useMemo(
    () => new Set(archivedCategories.map((category) => category.key)),
    [archivedCategories],
  );
  const tasksByArchivedCategory = useMemo(() => {
    const grouped = new Map<Category, Task[]>();

    for (const task of tasks) {
      if (!archivedCategoryKeys.has(task.category)) continue;
      grouped.set(task.category, [...(grouped.get(task.category) ?? []), task]);
    }

    return grouped;
  }, [archivedCategoryKeys, tasks]);
  const taskArchiveEntries = useMemo(
    () => tasks.filter((task) => !archivedCategoryKeys.has(task.category)),
    [archivedCategoryKeys, tasks],
  );

  function handleDelete(taskId: string) {
    const confirmed = window.confirm('Удалить задачу навсегда? Это действие необратимо.');
    if (!confirmed) {
      return;
    }
    onDelete(taskId);
  }

  function handleDeleteCategory(category: Category, label: string) {
    const confirmed = window.confirm(
      `Удалить категорию "${label}" и все ее задачи навсегда? Это действие необратимо.`,
    );
    if (!confirmed) {
      return;
    }
    onDeleteCategory(category);
  }

  if (taskArchiveEntries.length === 0 && archivedCategories.length === 0) {
    return <div className="empty-state">Архив пока пуст. Закрытые задачи появятся здесь.</div>;
  }

  return (
    <div className="archive-list">
      {archivedCategories.map((category) => {
        const categoryTasks = tasksByArchivedCategory.get(category.key) ?? [];

        return (
          <article
            key={category.key}
            className="archive-item archive-item--category"
            data-category={category.key}
            style={{ '--category-color': category.color } as CSSProperties}
          >
            <div className="archive-item__content">
              <div className="archive-item__topline">
                <span className="archive-item__dot" aria-hidden="true" />
                <span className="archive-item__category">Категория в архиве</span>
                {category.archivedAt && <span className="archive-item__time">{formatDateTime(category.archivedAt)}</span>}
              </div>

              <h3>{category.label}</h3>

              <p className="archive-item__description">
                {categoryTasks.length > 0
                  ? `${categoryTasks.length} задач внутри категории`
                  : 'В категории нет архивных задач'}
              </p>

              {categoryTasks.length > 0 && (
                <div className="archive-category__tasks" aria-label="Задачи категории">
                  {categoryTasks.slice(0, 3).map((task) => (
                    <span key={task.id} className="archive-category__task">
                      {task.title}
                    </span>
                  ))}
                  {categoryTasks.length > 3 && (
                    <span className="archive-category__task archive-category__task--more">
                      +{categoryTasks.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="archive-item__actions">
              <button type="button" className="button button--secondary" onClick={() => onRestoreCategory(category.key)}>
                Вернуть
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => handleDeleteCategory(category.key, category.label)}
              >
                Удалить
              </button>
            </div>
          </article>
        );
      })}

      {taskArchiveEntries.map((task) => {
        const urgency = getUrgency(task.deadline);

        return (
          <article
            key={task.id}
            className="archive-item"
            data-category={task.category}
            style={{ '--category-color': categoryColors[task.category] ?? '#868e96' } as CSSProperties}
          >
            <div className="archive-item__content">
              <div className="archive-item__topline">
                <span className="archive-item__dot" aria-hidden="true" />
                <span className="archive-item__category">{categoryLabels[task.category] ?? task.category}</span>
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
