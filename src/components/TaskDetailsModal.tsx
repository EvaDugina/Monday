import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import type { Deadline, Task } from '../types';
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '../types';
import DeadlineEditor from './DeadlineEditor';

interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

interface Snapshot {
  title: string;
  description: string;
  deadline: Deadline;
  urgent: boolean;
  pinned: boolean;
}

function takeSnapshot(task: Task): Snapshot {
  return {
    title: task.title,
    description: task.description,
    deadline: task.deadline,
    urgent: task.urgent,
    pinned: task.pinned ?? false,
  };
}

function isDirty(snapshot: Snapshot, current: Snapshot): boolean {
  return (
    snapshot.title.trim() !== current.title.trim() ||
    snapshot.description.trim() !== current.description.trim() ||
    snapshot.urgent !== current.urgent ||
    snapshot.pinned !== current.pinned ||
    JSON.stringify(snapshot.deadline) !== JSON.stringify(current.deadline)
  );
}

function TaskDetailsModal({ task, onClose, onSave, onArchive, onDelete }: TaskDetailsModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<Deadline>({ kind: 'none' });
  const [urgent, setUrgent] = useState(false);
  const [pinned, setPinned] = useState(false);
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
    setDeadline(task.deadline);
    setUrgent(task.urgent);
    setPinned(task.pinned ?? false);
    initialSnapshotRef.current = takeSnapshot(task);
  }, [task]);

  const handleClose = useCallback(() => {
    const snapshot = initialSnapshotRef.current;

    if (snapshot) {
      const current: Snapshot = { title, description, deadline, urgent, pinned };

      if (isDirty(snapshot, current)) {
        const shouldDiscard = window.confirm('Закрыть без сохранения изменений?');
        if (!shouldDiscard) {
          return;
        }
      }
    }

    onClose();
  }, [title, description, deadline, urgent, pinned, onClose]);

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
      deadline,
      urgent,
      pinned: pinned || undefined,
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
              <div className="form-field__badges">
                <button
                  type="button"
                  className={`toggle-badge toggle-badge--pin${pinned ? ' toggle-badge--active' : ''}`}
                  aria-pressed={pinned}
                  onClick={() => setPinned((current) => !current)}
                >
                  закрепить
                </button>
                <button
                  type="button"
                  className={`toggle-badge${urgent ? ' toggle-badge--active' : ''}`}
                  aria-pressed={urgent}
                  onClick={() => setUrgent((current) => !current)}
                >
                  срочно
                </button>
              </div>
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
