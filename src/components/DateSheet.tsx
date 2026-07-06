import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { compareIsoDates, formatDate, getTodayIsoDate, parseIsoDate, toIsoDate } from '../utils/dates';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

interface DateSheetProps {
  mode: 'single' | 'range';
  value: { date?: string; from?: string; to?: string };
  onChange: (next: { date?: string; from?: string; to?: string }) => void;
  onClose: () => void;
  title?: string;
}

function getMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const offsetToMonday = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offsetToMonday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return date;
  });
}

function formatMonthLabel(year: number, month: number): string {
  const label = MONTH_FORMATTER.format(new Date(year, month, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function DateSheet({ mode, value, onChange, onClose, title }: DateSheetProps) {
  const titleId = useId();
  const modalRef = useModalFocusTrap(true);

  const initialDate = useMemo(() => {
    const seed = mode === 'single' ? value.date : value.from || value.to;
    if (seed) {
      try {
        return parseIsoDate(seed);
      } catch {
        return new Date();
      }
    }
    return new Date();
  }, [mode, value.date, value.from, value.to]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [draftFrom, setDraftFrom] = useState<string | null>(value.from || null);
  const [draftTo, setDraftTo] = useState<string | null>(value.to || null);
  const [pendingPick, setPendingPick] = useState<'from' | 'to'>(value.from && !value.to ? 'to' : 'from');

  const lastValueRef = useRef(value);
  useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const todayIso = getTodayIsoDate();
  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function gotoPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((year) => year - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function gotoNextMonth() {
    if (viewMonth === 11) {
      setViewYear((year) => year + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function selectDay(date: Date) {
    const iso = toIsoDate(date);

    if (mode === 'single') {
      onChange({ date: iso });
      onClose();
      return;
    }

    if (pendingPick === 'from' || (draftFrom && draftTo)) {
      setDraftFrom(iso);
      setDraftTo(null);
      setPendingPick('to');
      onChange({ from: iso, to: '' });
      return;
    }

    if (!draftFrom) {
      setDraftFrom(iso);
      setPendingPick('to');
      onChange({ from: iso, to: '' });
      return;
    }

    if (compareIsoDates(iso, draftFrom) < 0) {
      const newFrom = iso;
      const newTo = draftFrom;
      setDraftFrom(newFrom);
      setDraftTo(newTo);
      onChange({ from: newFrom, to: newTo });
      onClose();
      return;
    }

    setDraftTo(iso);
    onChange({ from: draftFrom, to: iso });
    onClose();
  }

  function clearAndClose() {
    if (mode === 'single') {
      onChange({ date: '' });
    } else {
      onChange({ from: '', to: '' });
    }
    setDraftFrom(null);
    setDraftTo(null);
    onClose();
  }

  function isInRange(iso: string): boolean {
    if (mode !== 'range' || !draftFrom || !draftTo) return false;
    return compareIsoDates(iso, draftFrom) > 0 && compareIsoDates(iso, draftTo) < 0;
  }

  function isSelected(iso: string): boolean {
    if (mode === 'single') {
      return value.date === iso;
    }
    return iso === draftFrom || iso === draftTo;
  }

  const summary =
    mode === 'single'
      ? value.date
        ? formatDate(value.date)
        : 'Выберите дату'
      : draftFrom && draftTo
        ? `${formatDate(draftFrom)} – ${formatDate(draftTo)}`
        : draftFrom
          ? `с ${formatDate(draftFrom)} • выберите вторую дату`
          : 'Выберите начало диапазона';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal date-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id={titleId}>{title ?? (mode === 'single' ? 'Выберите дату' : 'Выберите диапазон')}</h2>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="modal__body date-sheet__body">
          <div className="date-sheet__summary">{summary}</div>

          <div className="date-sheet__nav">
            <button
              type="button"
              className="date-sheet__nav-button"
              aria-label="Предыдущий месяц"
              onClick={gotoPrevMonth}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="date-sheet__month">{formatMonthLabel(viewYear, viewMonth)}</span>
            <button
              type="button"
              className="date-sheet__nav-button"
              aria-label="Следующий месяц"
              onClick={gotoNextMonth}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="date-sheet__weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="date-sheet__grid">
            {grid.map((date) => {
              const iso = toIsoDate(date);
              const inMonth = date.getMonth() === viewMonth;
              const isToday = iso === todayIso;
              const selected = isSelected(iso);
              const inRange = isInRange(iso);
              const classes = [
                'date-sheet__day',
                inMonth ? '' : 'date-sheet__day--muted',
                isToday ? 'date-sheet__day--today' : '',
                selected ? 'date-sheet__day--selected' : '',
                inRange ? 'date-sheet__day--in-range' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  className={classes}
                  onClick={() => selectDay(date)}
                  aria-pressed={selected}
                  aria-label={formatDate(iso)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal__footer">
          <button type="button" className="button button--secondary" onClick={clearAndClose}>
            Очистить
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

export default DateSheet;
