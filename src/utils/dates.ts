import type { Deadline } from '../types';

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const WEEKDAY_LABELS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getTodayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function compareIsoDates(left: string, right: string): number {
  return parseIsoDate(left).getTime() - parseIsoDate(right).getTime();
}

export function diffInCalendarDays(fromIso: string, toIso: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);

  return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay);
}

export function formatDate(value: string): string {
  return DATE_FORMATTER.format(parseIsoDate(value));
}

export function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return DATE_TIME_FORMATTER.format(date);
}

export function getWeekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? WEEKDAY_LABELS[1];
}

export function formatDeadline(deadline: Deadline): string | null {
  switch (deadline.kind) {
    case 'none':
      return null;
    case 'date':
      return deadline.date ? formatDate(deadline.date) : null;
    case 'range':
      if (deadline.from && deadline.to) {
        return `${formatDate(deadline.from)} - ${formatDate(deadline.to)}`;
      }

      if (deadline.from) {
        return formatDate(deadline.from);
      }

      if (deadline.to) {
        return formatDate(deadline.to);
      }

      return null;
    case 'recurring':
      if (deadline.mode === 'day') {
        return 'Каждый день';
      }

      if (deadline.mode === 'month') {
        return 'Каждый месяц';
      }

      return deadline.weekday === undefined
        ? 'Каждую неделю'
        : `Каждую неделю, ${getWeekdayLabel(deadline.weekday)}`;
    default:
      return null;
  }
}
