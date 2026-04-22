export type Category = 'passion' | 'routine' | 'body' | 'projects';

export type Deadline =
  | { kind: 'none' }
  | { kind: 'date'; date: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'recurring'; mode: 'day' | 'week' | 'month'; weekday?: number };

export interface Task {
  id: string;
  title: string;
  description: string;
  category: Category;
  deadline: Deadline;
  urgent: boolean;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
}

export type Screen = 'active' | 'archive';
