import { useEffect, useState } from 'react';
import type { Deadline, Task } from '../types';
import DeadlineEditor from './DeadlineEditor';

interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

function TaskDetailsModal({ task, onClose, onSave, onArchive, onDelete }: TaskDetailsModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<Deadline>({ kind: 'none' });
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!task) {
      return;
    }

    setTitle(task.title);
    setDescription(task.description);
    setDeadline(task.deadline);
    setUrgent(task.urgent);
  }, [task]);

  useEffect(() => {
    if (!task) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [task, onClose]);

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
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2>Задача</h2>

          <button type="button" className="button button--ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="modal__body">
          <label className="form-field">
            <span className="form-label">Название</span>
            <input
              className="text-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Описание</span>
            <textarea
              className="text-input text-input--textarea"
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Срок</span>
            <DeadlineEditor value={deadline} onChange={setDeadline} />
          </label>

          <label className="form-field form-field--inline">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(event) => setUrgent(event.target.checked)}
            />
            <span className="form-label">Отметить как срочную</span>
          </label>
        </div>

        <div className="modal__footer">
          <div className="modal__footer-group">
            <button type="button" className="button button--danger" onClick={() => onDelete(currentTask.id)}>
              Удалить навсегда
            </button>
            <button type="button" className="button button--secondary" onClick={() => onArchive(currentTask.id)}>
              Закрыть в архив
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
