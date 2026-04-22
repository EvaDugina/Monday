import { RotateCw } from 'lucide-react';
import type { Task } from '../types';
import { getUrgency } from '../utils/urgency';

interface TaskItemProps {
  task: Task;
  onOpen: () => void;
  onQuickClose?: () => void;
}

function TaskItem({ task, onOpen, onQuickClose }: TaskItemProps) {
  const urgency = getUrgency(task.deadline);

  return (
    <article className="task-card" data-category={task.category}>
      {onQuickClose && (
        <button
          type="button"
          className="task-card__checkbox"
          onClick={onQuickClose}
          aria-label="Закрыть задачу в архив"
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
    </article>
  );
}

export default TaskItem;
