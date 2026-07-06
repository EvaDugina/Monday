import { GripVertical, Pin, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Category, Task } from '../types';
import { CATEGORIES, MAX_TITLE_LENGTH } from '../types';
import { triggerHaptic } from '../utils/haptic';
import { getUrgency } from '../utils/urgency';

const SWIPE_THRESHOLD = 96;
const SWIPE_MAX_OFFSET = 140;
const LONG_PRESS_MS = 280;
const LONG_PRESS_TOLERANCE = 8;

const KNOWN_CATEGORIES: Category[] = ['passion', 'routine', 'body', 'projects'];

function asCategory(value: string | null | undefined): Category | null {
  if (!value) return null;
  return (KNOWN_CATEGORIES as string[]).includes(value) ? (value as Category) : null;
}

function findCategoryUnder(x: number, y: number): Category | null {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    if (element instanceof HTMLElement && element.matches('[data-category]')) {
      const matched = asCategory(element.getAttribute('data-category'));
      if (matched) return matched;
    }
    if (element instanceof HTMLElement) {
      const ancestor = element.closest<HTMLElement>('.category-section[data-category]');
      if (ancestor) {
        const matched = asCategory(ancestor.getAttribute('data-category'));
        if (matched) return matched;
      }
    }
  }
  return null;
}

interface TaskItemProps {
  task: Task;
  isDragging?: boolean;
  isClosing?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onOpen: () => void;
  onQuickClose?: () => void;
  onSaveTitle?: (taskId: string, title: string) => void;
  onChangeCategory?: (taskId: string, category: Category) => void;
  onTouchDragOver?: (category: Category | null) => void;
  onTouchDrop?: (category: Category) => void;
}

function TaskItem({
  task,
  isDragging = false,
  isClosing = false,
  onDragStart,
  onDragEnd,
  onOpen,
  onQuickClose,
  onSaveTitle,
  onChangeCategory,
  onTouchDragOver,
  onTouchDrop,
}: TaskItemProps) {
  const urgency = getUrgency(task.deadline);
  const isWeeklyRecurring = task.deadline.kind === 'recurring' && task.deadline.mode === 'week';

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLSpanElement>(null);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isTouchDragging, setIsTouchDragging] = useState(false);

  const swipeStateRef = useRef<{ pointerId: number; startX: number; startY: number; locked: boolean | null } | null>(
    null,
  );
  const longPressStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    timer: number | null;
    active: boolean;
  } | null>(null);
  const justGesturedRef = useRef(false);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(task.title);
    }
  }, [task.title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (!isCategoryMenuOpen) return;

    function handleDocumentPointer(event: PointerEvent) {
      if (
        categoryMenuRef.current &&
        event.target instanceof Node &&
        !categoryMenuRef.current.contains(event.target)
      ) {
        setIsCategoryMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsCategoryMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCategoryMenuOpen]);

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

  function handleActivationKey(event: React.KeyboardEvent) {
    if (isClosing) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  }

  function startTitleEdit(event: React.MouseEvent) {
    if (isClosing || !onSaveTitle) return;
    event.stopPropagation();
    setDraftTitle(task.title);
    setIsEditingTitle(true);
  }

  function commitTitleEdit() {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== task.title && onSaveTitle) {
      onSaveTitle(task.id, trimmed);
      triggerHaptic('light');
    }
    setIsEditingTitle(false);
  }

  function cancelTitleEdit() {
    setDraftTitle(task.title);
    setIsEditingTitle(false);
  }

  function handleCategorySelect(nextCategory: Category) {
    if (onChangeCategory && nextCategory !== task.category) {
      onChangeCategory(task.id, nextCategory);
    }
    setIsCategoryMenuOpen(false);
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        '.task-card__checkbox, .task-card__drag-handle, .task-card__category-chip, .category-popover, .task-card__title-input, button, input, textarea, select, a, [role="menu"]',
      ),
    );
  }

  function handleCardPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return;
    if (isClosing || isEditingTitle || !onQuickClose) return;
    if (isInteractiveTarget(event.target)) return;

    swipeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      locked: null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleCardPointerMove(event: React.PointerEvent<HTMLElement>) {
    const state = swipeStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.locked === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      state.locked = Math.abs(dx) > Math.abs(dy);
      if (!state.locked) {
        swipeStateRef.current = null;
        setSwipeOffset(0);
        return;
      }
    }

    if (state.locked) {
      event.preventDefault();
      const offset = Math.max(Math.min(dx, 24), -SWIPE_MAX_OFFSET);
      setSwipeOffset(offset);
    }
  }

  function handleCardPointerUp(event: React.PointerEvent<HTMLElement>) {
    const state = swipeStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    const dx = event.clientX - state.startX;
    const wasLocked = state.locked === true;
    swipeStateRef.current = null;

    if (wasLocked) {
      justGesturedRef.current = true;
      if (dx <= -SWIPE_THRESHOLD && onQuickClose) {
        triggerHaptic('warning');
        onQuickClose();
      }
    }
    setSwipeOffset(0);
  }

  function handleCardPointerCancel() {
    swipeStateRef.current = null;
    setSwipeOffset(0);
  }

  function clearLongPressTimer() {
    const state = longPressStateRef.current;
    if (state?.timer !== null && state?.timer !== undefined) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function handleHandlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return;
    if (isClosing) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    longPressStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
      active: false,
    };

    const state = longPressStateRef.current;
    state.timer = window.setTimeout(() => {
      if (!state || !longPressStateRef.current || state !== longPressStateRef.current) return;
      state.active = true;
      onDragStart?.();
      setIsTouchDragging(true);
      triggerHaptic('medium');
    }, LONG_PRESS_MS);
  }

  function handleHandlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const state = longPressStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    if (!state.active) {
      const dist = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (dist > LONG_PRESS_TOLERANCE) {
        clearLongPressTimer();
        longPressStateRef.current = null;
      }
      return;
    }

    event.preventDefault();
    const next = findCategoryUnder(event.clientX, event.clientY);
    onTouchDragOver?.(next && next !== task.category ? next : null);
  }

  function handleHandlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const state = longPressStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    clearLongPressTimer();
    longPressStateRef.current = null;

    if (state.active) {
      const next = findCategoryUnder(event.clientX, event.clientY);
      onTouchDragOver?.(null);
      if (next && next !== task.category) {
        onTouchDrop?.(next);
      }
      onDragEnd?.();
      setIsTouchDragging(false);
      justGesturedRef.current = true;
    }
  }

  function handleHandlePointerCancel() {
    const state = longPressStateRef.current;
    clearLongPressTimer();
    longPressStateRef.current = null;
    if (state?.active) {
      onTouchDragOver?.(null);
      onDragEnd?.();
      setIsTouchDragging(false);
    }
  }

  const isSwipeRevealed = swipeOffset < -8;

  return (
    <article
      className={`task-card${isDragging || isTouchDragging ? ' task-card--dragging' : ''}${
        isClosing ? ' task-card--closing' : ''
      }${isSwipeRevealed ? ' task-card--swiping' : ''}`}
      data-category={task.category}
      role="button"
      tabIndex={isClosing || isEditingTitle ? -1 : 0}
      aria-disabled={isClosing || undefined}
      aria-label={`Открыть задачу: ${task.title}`}
      onClick={(event) => {
        if (justGesturedRef.current) {
          justGesturedRef.current = false;
          event.preventDefault();
          return;
        }
        if (isClosing || isEditingTitle) return;
        onOpen();
      }}
      onKeyDown={handleActivationKey}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerCancel}
      style={swipeOffset !== 0 ? { transform: `translate3d(${swipeOffset}px, 0, 0)` } : undefined}
    >
      {onQuickClose && (
        <button
          type="button"
          role="checkbox"
          aria-checked={isClosing}
          className="task-card__checkbox"
          onClick={(event) => {
            event.stopPropagation();
            onQuickClose();
          }}
          aria-label="Закрыть задачу"
          title="Закрыть задачу"
          disabled={isClosing}
        />
      )}

      <div className="task-card__headline">
        {onChangeCategory && (
          <span className="task-card__category-chip" ref={categoryMenuRef}>
            <button
              type="button"
              className="task-card__category-chip-button"
              data-category={task.category}
              aria-haspopup="menu"
              aria-expanded={isCategoryMenuOpen}
              aria-label="Сменить раздел"
              title="Сменить раздел"
              disabled={isClosing}
              onClick={(event) => {
                event.stopPropagation();
                setIsCategoryMenuOpen((value) => !value);
              }}
            />
            {isCategoryMenuOpen && (
              <div className="category-popover" role="menu" onClick={(event) => event.stopPropagation()}>
                {CATEGORIES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`category-popover__item${
                      option.key === task.category ? ' category-popover__item--active' : ''
                    }`}
                    role="menuitemradio"
                    aria-checked={option.key === task.category}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCategorySelect(option.key);
                    }}
                  >
                    <span className="category-popover__dot" data-category={option.key} aria-hidden="true" />
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}

        {task.pinned && (
          <Pin
            className="task-card__pin-icon"
            size={12}
            strokeWidth={2.2}
            aria-label="Закреплено"
          />
        )}

        {task.urgent && <span className="task-card__urgent-badge">СРОЧНО</span>}
        {isWeeklyRecurring && <span className="task-card__repeat-badge">ЕЖЕНЕДЕЛЬНО</span>}

        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            className="task-card__title task-card__title-input"
            type="text"
            value={draftTitle}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitleEdit}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitleEdit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelTitleEdit();
              }
            }}
          />
        ) : (
          <span
            className={`task-card__title${onSaveTitle ? ' task-card__title--editable' : ''}`}
            onClick={onSaveTitle ? startTitleEdit : undefined}
          >
            {task.title}
          </span>
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
        data-dragging={isDragging || isTouchDragging || undefined}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={(event) => {
          event.stopPropagation();
          if (justGesturedRef.current) {
            justGesturedRef.current = false;
            return;
          }
          if (!isClosing) onOpen();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          handleActivationKey(event);
        }}
        onPointerDown={handleHandlePointerDown}
        onPointerMove={handleHandlePointerMove}
        onPointerUp={handleHandlePointerUp}
        onPointerCancel={handleHandlePointerCancel}
      >
        <GripVertical size={15} strokeWidth={1.75} aria-hidden="true" />
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
    </article>
  );
}

export default TaskItem;
