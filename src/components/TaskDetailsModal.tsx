import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import type { Category, Deadline, Task } from '../types';
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '../types';
import DeadlineEditor from './DeadlineEditor';

interface CategoryOption {
  key: Category;
  label: string;
}

interface TaskDetailsModalProps {
  task: Task | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSave: (task: Task) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

interface Snapshot {
  title: string;
  description: string;
  category: Category;
  deadline: Deadline;
  urgent: boolean;
}

function takeSnapshot(task: Task): Snapshot {
  return {
    title: task.title,
    description: task.description,
    category: task.category,
    deadline: task.deadline,
    urgent: task.urgent,
  };
}

function isDirty(snapshot: Snapshot, current: Snapshot): boolean {
  return (
    snapshot.title.trim() !== current.title.trim() ||
    snapshot.description.trim() !== current.description.trim() ||
    snapshot.category !== current.category ||
    snapshot.urgent !== current.urgent ||
    JSON.stringify(snapshot.deadline) !== JSON.stringify(current.deadline)
  );
}

function TaskDetailsModal({ task, categories, onClose, onSave, onArchive, onDelete }: TaskDetailsModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('passion');
  const [deadline, setDeadline] = useState<Deadline>({ kind: 'none' });
  const [urgent, setUrgent] = useState(false);
  const titleId = useId();
  const modalRef = useModalFocusTrap(task !== null);
  const initialSnapshotRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    if (!task) {
      initialSnapshotRef.current = null;
      return;
    }

    setTitle(task.title);
    setDescription(task.description);
    setCategory(task.category);
    setDeadline(task.deadline);
    setUrgent(task.urgent);
    initialSnapshotRef.current = takeSnapshot(task);
  }, [task]);

  const handleClose = useCallback(() => {
    const snapshot = initialSnapshotRef.current;

    if (snapshot) {
      const current: Snapshot = { title, description, category, deadline, urgent };

      if (isDirty(snapshot, current)) {
        const shouldDiscard = window.confirm('Закрыть без сохранения изменений?');
        if (!shouldDiscard) {
          return;
        }
      }
    }

    onClose();
  }, [title, description, category, deadline, urgent, onClose]);

  useEffect(() => {
    if (!task) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [task, handleClose]);

  if (!task) {
    return null;
  }

  const currentTask = task;

  function handleSave() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSave({
      ...currentTask,
      title: trimmedTitle,
      description: description.trim(),
      category,
      deadline,
      urgent,
    });
    onClose();
  }

  function handleDelete() {
    const confirmed = window.confirm('Удалить задачу навсегда? Это действие необратимо.');
    if (!confirmed) {
      return;
    }
    onDelete(currentTask.id);
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id={titleId}>Задача</h2>

          <button type="button" className="button button--ghost" onClick={handleClose}>
            Закрыть
          </button>
        </div>

        <div className="modal__body">
          <div className="form-field">
            <div className="form-field__header">
              <span className="form-label">Название</span>
              <button
                type="button"
                className={`toggle-badge${urgent ? ' toggle-badge--active' : ''}`}
                aria-pressed={urgent}
                onClick={() => setUrgent((current) => !current)}
              >
                срочно
              </button>
            </div>
            <input
              className="text-input"
              type="text"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <label className="form-field">
            <span className="form-label">Описание</span>
            <textarea
              className="text-input text-input--textarea"
              rows={5}
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="form-field">
            <span className="form-label">Категория</span>
            <div className="category-picker">
              {categories.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`chip${category === option.key ? ' chip--active' : ''}`}
                  data-category={option.key}
                  onClick={() => setCategory(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <span className="form-label">Срок</span>
            <DeadlineEditor value={deadline} onChange={setDeadline} />
          </div>
        </div>

        <div className="modal__footer">
          <div className="modal__footer-group">
            <button type="button" className="button button--danger" onClick={handleDelete}>
              Удалить навсегда
            </button>
            <button type="button" className="button button--secondary" onClick={() => onArchive(currentTask.id)}>
              В архив
            </button>
          </div>

          <button type="button" className="button button--primary" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailsModal;
