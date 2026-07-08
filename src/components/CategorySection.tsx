import { Archive } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Category, CategoryOption, Task } from '../types';
import { MAX_CATEGORY_LABEL_LENGTH } from '../types';
import InlineCreator from './InlineCreator';
import TaskCardSkeleton from './TaskCardSkeleton';
import TaskItem from './TaskItem';

interface CategorySectionProps {
  category: Category;
  categories: CategoryOption[];
  color: string;
  label: string;
  tasks: Task[];
  isLoading?: boolean;
  draggedTaskId: string | null;
  draggedTaskCategory: Category | null;
  closingTaskIds: string[];
  isDropTarget: boolean;
  onDropTargetChange: (category: Category | null) => void;
  onCreate: (category: Category, title: string) => void;
  onCategoryArchive: (category: Category) => void;
  onCategoryColorChange: (category: Category, color: string) => void;
  onCategoryRename: (category: Category, label: string) => void;
  onTaskDragStart: (taskId: string) => void;
  onTaskDragEnd: () => void;
  onTaskDrop: (taskId: string, category: Category) => void;
  onTaskOpen: (taskId: string) => void;
  onQuickClose: (taskId: string) => void;
}

function CategorySection({
  category,
  categories,
  color,
  label,
  tasks,
  isLoading = false,
  draggedTaskId,
  draggedTaskCategory,
  closingTaskIds,
  isDropTarget,
  onDropTargetChange,
  onCreate,
  onCategoryArchive,
  onCategoryColorChange,
  onCategoryRename,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDrop,
  onTaskOpen,
  onQuickClose,
}: CategorySectionProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingLabel) {
      setDraftLabel(label);
    }
  }, [isEditingLabel, label]);

  useEffect(() => {
    if (isEditingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [isEditingLabel]);

  const categoryStyle = { '--category-color': color } as CSSProperties;

  function isTaskDragEvent(event: React.DragEvent<HTMLElement>): boolean {
    return event.dataTransfer.types.includes('application/x-monday-task-id') || draggedTaskId !== null;
  }

  function getSourceCategory(event: React.DragEvent<HTMLElement>): Category | null {
    const rawCategory = event.dataTransfer.getData('application/x-monday-task-category');

    if (rawCategory) {
      return rawCategory;
    }

    return draggedTaskCategory;
  }

  function startLabelEdit() {
    setDraftLabel(label);
    setIsEditingLabel(true);
  }

  function commitLabelEdit() {
    const trimmed = draftLabel.trim();

    if (trimmed && trimmed !== label) {
      onCategoryRename(category, trimmed);
    }

    setIsEditingLabel(false);
  }

  function cancelLabelEdit() {
    setDraftLabel(label);
    setIsEditingLabel(false);
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
      style={categoryStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="category-section__header">
        <h2
          className="category-section__title"
          onClick={() => {
            if (!isEditingLabel) {
              startLabelEdit();
            }
          }}
        >
          <button
            type="button"
            className="category-section__dot"
            aria-label="Сменить цвет категории"
            title="Сменить цвет категории"
            onClick={(event) => {
              event.stopPropagation();
              colorInputRef.current?.click();
            }}
          >
            <input
              ref={colorInputRef}
              className="category-section__color-input"
              type="color"
              value={color}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onCategoryColorChange(category, event.target.value)}
            />
          </button>
          {isEditingLabel ? (
            <input
              ref={labelInputRef}
              className="category-section__title-input"
              type="text"
              value={draftLabel}
              maxLength={MAX_CATEGORY_LABEL_LENGTH}
              onChange={(event) => setDraftLabel(event.target.value)}
              onBlur={commitLabelEdit}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitLabelEdit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelLabelEdit();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="category-section__title-button"
              onClick={(event) => {
                event.stopPropagation();
                startLabelEdit();
              }}
            >
              {label}
            </button>
          )}
        </h2>
        <span className="category-section__count">{tasks.length}</span>
        <button
          type="button"
          className="category-section__archive-button has-tooltip has-tooltip--end"
          data-tooltip="Переместить категорию в архив"
          aria-label="Переместить категорию в архив"
          title="Переместить категорию в архив"
          onClick={() => onCategoryArchive(category)}
        >
          <Archive size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>

      <div className="task-list">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isDragging={task.id === draggedTaskId}
              isClosing={closingTaskIds.includes(task.id)}
              categories={categories}
              onDragStart={onTaskDragStart}
              onDragEnd={onTaskDragEnd}
              onOpen={onTaskOpen}
              onQuickClose={onQuickClose}
              onTouchDragOver={onDropTargetChange}
              onTouchDrop={onTaskDrop}
            />
          ))
        ) : isLoading ? (
          <>
            <TaskCardSkeleton width="long" />
            <TaskCardSkeleton width="medium" />
            <TaskCardSkeleton width="short" />
          </>
        ) : null}
      </div>

      <InlineCreator placeholder="Название задачи..." onCreate={(title) => onCreate(category, title)} />
    </section>
  );
}

export default memo(CategorySection);
