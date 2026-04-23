import type { Category, Task } from '../types';
import InlineCreator from './InlineCreator';
import TaskItem from './TaskItem';

interface CategorySectionProps {
  category: Category;
  label: string;
  tasks: Task[];
  draggedTaskId: string | null;
  draggedTaskCategory: Category | null;
  closingTaskIds: string[];
  isDropTarget: boolean;
  onDropTargetChange: (category: Category | null) => void;
  onCreate: (title: string) => void;
  onTaskDragStart: (taskId: string) => void;
  onTaskDragEnd: () => void;
  onTaskDrop: (taskId: string, category: Category) => void;
  onTaskOpen: (taskId: string) => void;
  onQuickClose: (taskId: string) => void;
}

function CategorySection({
  category,
  label,
  tasks,
  draggedTaskId,
  draggedTaskCategory,
  closingTaskIds,
  isDropTarget,
  onDropTargetChange,
  onCreate,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDrop,
  onTaskOpen,
  onQuickClose,
}: CategorySectionProps) {
  function isTaskDragEvent(event: React.DragEvent<HTMLElement>): boolean {
    return event.dataTransfer.types.includes('application/x-monday-task-id') || draggedTaskId !== null;
  }

  function getSourceCategory(event: React.DragEvent<HTMLElement>): Category | null {
    const rawCategory = event.dataTransfer.getData('application/x-monday-task-category');

    if (rawCategory === 'passion' || rawCategory === 'routine' || rawCategory === 'body' || rawCategory === 'projects') {
      return rawCategory;
    }

    return draggedTaskCategory;
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    if (!isTaskDragEvent(event)) {
      return;
    }

    event.preventDefault();

    const sourceCategory = getSourceCategory(event);

    if (sourceCategory === category) {
      event.dataTransfer.dropEffect = 'none';
      onDropTargetChange(null);
      return;
    }

    event.dataTransfer.dropEffect = 'move';

    if (!isDropTarget) {
      onDropTargetChange(category);
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    if (isDropTarget) {
      onDropTargetChange(null);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    if (!isTaskDragEvent(event)) {
      return;
    }

    event.preventDefault();

    const sourceCategory = getSourceCategory(event);
    const taskId =
      event.dataTransfer.getData('application/x-monday-task-id') ||
      event.dataTransfer.getData('text/plain') ||
      draggedTaskId;

    onDropTargetChange(null);

    if (!taskId || sourceCategory === category) {
      onTaskDragEnd();
      return;
    }

    onTaskDrop(taskId, category);
    onTaskDragEnd();
  }

  return (
    <section
      className={`category-section${isDropTarget ? ' category-section--drop-target' : ''}`}
      data-category={category}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="category-section__header">
        <h2 className="category-section__title">
          <span className="category-section__dot" aria-hidden="true" />
          {label}
        </h2>
        <span className="category-section__count">{tasks.length}</span>
      </div>

      <div className="task-list">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isDragging={task.id === draggedTaskId}
              isClosing={closingTaskIds.includes(task.id)}
              onDragStart={() => onTaskDragStart(task.id)}
              onDragEnd={onTaskDragEnd}
              onOpen={() => onTaskOpen(task.id)}
              onQuickClose={() => onQuickClose(task.id)}
            />
          ))
        ) : (
          <div className="empty-state">Пока пусто. Добавьте первую задачу через поле ниже.</div>
        )}
      </div>

      <InlineCreator placeholder="Название задачи..." onCreate={onCreate} />
    </section>
  );
}

export default CategorySection;
