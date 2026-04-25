import { GripVertical, RotateCw } from 'lucide-react';
import type { Task } from '../types';
import { getUrgency } from '../utils/urgency';

interface TaskItemProps {
  task: Task;
  isDragging?: boolean;
  isClosing?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onOpen: () => void;
  onQuickClose?: () => void;
}

function TaskItem({
  task,
  isDragging = false,
  isClosing = false,
  onDragStart,
  onDragEnd,
  onOpen,
  onQuickClose,
}: TaskItemProps) {
  const urgency = getUrgency(task.deadline);

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (isClosing) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-monday-task-id', task.id);
    event.dataTransfer.setData('application/x-monday-task-category', task.category);
    event.dataTransfer.setData('text/plain', task.id);
    onDragStart?.();
  }

  function handleActivationKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isClosing) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      className={`task-card${isDragging ? ' task-card--dragging' : ''}${isClosing ? ' task-card--closing' : ''}`}
      data-category={task.category}
    >
      {onQuickClose && (
        <button
          type="button"
          role="checkbox"
          aria-checked="false"
          className="task-card__checkbox"
          onClick={onQuickClose}
          aria-label="Закрыть задачу"
          title="Закрыть задачу"
          disabled={isClosing}
        />
      )}

      <div
        className="task-card__main"
        role="button"
        tabIndex={isClosing ? -1 : 0}
        aria-disabled={isClosing || undefined}
        onClick={isClosing ? undefined : onOpen}
        onKeyDown={handleActivationKey}
      >
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
      </div>

      <div
        className="task-card__drag-handle has-tooltip has-tooltip--end"
        data-tooltip="Перетащите, чтобы сменить раздел, или нажмите чтобы открыть"
        title="Перетащите, чтобы сменить раздел, или нажмите чтобы открыть"
        draggable={!isClosing}
        role="button"
        tabIndex={isClosing ? -1 : 0}
        aria-label="Открыть задачу или перетащить в другой раздел"
        data-dragging={isDragging || undefined}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={isClosing ? undefined : onOpen}
        onKeyDown={handleActivationKey}
      >
        <GripVertical size={15} strokeWidth={1.75} aria-hidden="true" />
      </div>
    </article>
  );
}

export default TaskItem;
