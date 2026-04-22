import type { Deadline } from '../types';
import { diffInCalendarDays, formatDeadline, getTodayIsoDate } from './dates';

export type UrgencyTone = 'none' | 'normal' | 'soon' | 'urgent' | 'recurring';

export interface UrgencyInfo {
  tone: UrgencyTone;
  label: string | null;
}

export function getUrgency(deadline: Deadline, todayIso = getTodayIsoDate()): UrgencyInfo {
  switch (deadline.kind) {
    case 'none':
      return { tone: 'none', label: null };
    case 'recurring':
      return { tone: 'recurring', label: formatDeadline(deadline) };
    case 'date': {
      if (!deadline.date) {
        return { tone: 'none', label: null };
      }

      const diff = diffInCalendarDays(todayIso, deadline.date);

      if (diff <= 0) {
        return { tone: 'urgent', label: formatDeadline(deadline) };
      }

      if (diff <= 2) {
        return { tone: 'soon', label: formatDeadline(deadline) };
      }

      return { tone: 'normal', label: formatDeadline(deadline) };
    }
    case 'range': {
      const anchor = deadline.from || deadline.to;

      if (!anchor) {
        return { tone: 'none', label: null };
      }

      const diff = diffInCalendarDays(todayIso, anchor);

      if (diff <= 0) {
        return { tone: 'urgent', label: formatDeadline(deadline) };
      }

      if (diff <= 2) {
        return { tone: 'soon', label: formatDeadline(deadline) };
      }

      return { tone: 'normal', label: formatDeadline(deadline) };
    }
    default:
      return { tone: 'none', label: null };
  }
}
