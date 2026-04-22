import { GripVertical, RotateCw } from 'lucide-react';
import type { Task } from '../types';
import { getUrgency } from '../utils/urgency';

interface TaskItemProps {
  task: Task;
  isDragging?: boolean;
  isSelected?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onOpen: () => void;
  onQuickClose?: () => void;
}

function TaskItem({
  task,
  isDragging = false,
  isSelected = false,
  onDragStart,
  onDragEnd,
  onOpen,
  onQuickClose,
}: TaskItemProps) {
  const urgency = getUrgency(task.deadline);

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-monday-task-id', task.id);
    event.dataTransfer.setData('application/x-monday-task-category', task.category);
    event.dataTransfer.setData('text/plain', task.id);
    onDragStart?.();
  }

  return (
    <article
      className={`task-card${isDragging ? ' task-card--dragging' : ''}${isSelected ? ' task-card--selected' : ''}`}
      data-category={task.category}
    >
      {onQuickClose && (
        <button
          type="button"
          className="task-card__checkbox"
          onClick={onQuickClose}
          aria-label="Закрыть задачу в архив"
        />
      )}

      <button type="button" className="task-card__main" onClick={onOpen} title="Открыть задачу">
        <div className="task-card__headline">
          {task.urgent && <span className="task-card__urgent-badge">СРОЧНО</span>}
          <span className="task-card__title">{task.title}</span>
        </div>

        {task.description && <p className="task-card__description">{task.description}</p>}

        {urgency.label && (
          <div className="task-card__meta">
            {urgency.tone === 'recurring' && (
              <RotateCw className="task-card__meta-icon" size={13} strokeWidth={1.75} aria-hidden="true" />
            )}
            {(urgency.tone === 'urgent' || urgency.tone === 'soon') && (
              <span
                className={`task-card__meta-dot task-card__meta-dot--${urgency.tone}`}
                aria-hidden="true"
              />
            )}
            <span className={`task-card__deadline task-card__deadline--${urgency.tone}`}>
              {urgency.label}
            </span>
          </div>
        )}
      </button>

      <button
        type="button"
        className="task-card__drag-handle"
        draggable
        aria-label="Перетащить задачу в другой раздел"
        aria-grabbed={isDragging}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        title="Перетащить задачу в другой раздел"
      >
        <GripVertical size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </article>
  );
}

export default TaskItem;
