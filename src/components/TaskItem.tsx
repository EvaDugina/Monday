import { GripVertical, RotateCw } from 'lucide-react';
import type { Task } from '../types';
import { getUrgency } from '../utils/urgency';

interface TaskItemProps {
  task: Task;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onOpen: () => void;
  onQuickClose?: () => void;
}

function TaskItem({ task, isDragging = false, onDragStart, onDragEnd, onOpen, onQuickClose }: TaskItemProps) {
  const urgency = getUrgency(task.deadline);

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-monday-task-id', task.id);
    event.dataTransfer.setData('application/x-monday-task-category', task.category);
    event.dataTransfer.setData('text/plain', task.id);
    onDragStart?.();
  }

  return (
    <article className={`task-card${isDragging ? ' task-card--dragging' : ''}`} data-category={task.category}>
      {onQuickClose && (
        <button
          type="button"
          className="task-card__checkbox"
          onClick={onQuickClose}
          aria-label="Закрыть задачу"
        />
      )}

      <button type="button" className="task-card__main" onClick={onOpen}>
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

      <div
        className="task-card__drag-handle has-tooltip"
        data-tooltip="Перетащить задачу в другой раздел"
        draggable
        role="button"
        tabIndex={0}
        aria-label="Перетащить задачу в другой раздел"
        aria-grabbed={isDragging}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={15} strokeWidth={1.75} aria-hidden="true" />
      </div>
    </article>
  );
}

export default TaskItem;
