import { useEffect, useId, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import type { Category, Deadline } from '../types';
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '../types';
import DeadlineEditor from './DeadlineEditor';

interface CategoryOption {
  key: Category;
  label: string;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  categories: CategoryOption[];
  defaultCategory: Category;
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    description: string;
    category: Category;
    deadline: Deadline;
    urgent: boolean;
  }) => void;
}

function CreateTaskModal({
  isOpen,
  categories,
  defaultCategory,
  onClose,
  onCreate,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [deadline, setDeadline] = useState<Deadline>({ kind: 'none' });
  const [urgent, setUrgent] = useState(false);
  const titleId = useId();
  const modalRef = useModalFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle('');
    setDescription('');
    setCategory(defaultCategory);
    setDeadline({ kind: 'none' });
    setUrgent(false);
  }, [defaultCategory, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onCreate({
      title: trimmedTitle,
      description: description.trim(),
      category,
      deadline,
      urgent,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal__header">
            <h2 id={titleId}>Новая задача</h2>

            <button type="button" className="button button--ghost" onClick={onClose}>
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
                autoFocus
                className="text-input"
                type="text"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например: выбрать врача"
              />
            </div>

            <label className="form-field">
              <span className="form-label">Описание</span>
              <textarea
                className="text-input text-input--textarea"
                rows={4}
                value={description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Необязательно"
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
            <button type="button" className="button button--secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="button button--primary">
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTaskModal;
