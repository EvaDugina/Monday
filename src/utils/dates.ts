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

export interface DateQuickPreset {
  label: string;
  value: string;
}

export interface RangeQuickPreset {
  label: string;
  from: string;
  to: string;
}

function startOfCalendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function shiftCalendarDays(date: Date, amount: number): Date {
  const base = startOfCalendarDay(date);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + amount);
}

function getNextWeekday(date: Date, weekday: number, includeToday = true): Date {
  const base = startOfCalendarDay(date);
  let offset = (weekday - base.getDay() + 7) % 7;

  if (offset === 0 && !includeToday) {
    offset = 7;
  }

  return shiftCalendarDays(base, offset);
}

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getTodayIsoDate(now = new Date()): string {
  return toIsoDate(now);
}

export function getDateQuickPresets(now = new Date()): DateQuickPreset[] {
  const today = startOfCalendarDay(now);

  return [
    { label: 'сегодня', value: toIsoDate(today) },
    { label: 'завтра', value: toIsoDate(shiftCalendarDays(today, 1)) },
  ];
}

export function getRangeQuickPresets(now = new Date()): RangeQuickPreset[] {
  const today = startOfCalendarDay(now);
  const dayOfWeek = today.getDay();
  const weekendStart =
    dayOfWeek === 6 ? today : dayOfWeek === 0 ? getNextWeekday(today, 6, false) : getNextWeekday(today, 6, true);
  const weekendEnd = shiftCalendarDays(weekendStart, 1);
  const friday = getNextWeekday(today, 5, true);
  const sunday = getNextWeekday(today, 0, true);
  const nextMonday = getNextWeekday(today, 1, false);
  const nextSunday = shiftCalendarDays(nextMonday, 6);

  return [
    { label: 'сегодня-завтра', from: toIsoDate(today), to: toIsoDate(shiftCalendarDays(today, 1)) },
    { label: 'на выходных', from: toIsoDate(weekendStart), to: toIsoDate(weekendEnd) },
    { label: 'до пятницы', from: toIsoDate(today), to: toIsoDate(friday) },
    { label: 'на неделе', from: toIsoDate(today), to: toIsoDate(sunday) },
    { label: 'на следующей неделе', from: toIsoDate(nextMonday), to: toIsoDate(nextSunday) },
  ];
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
