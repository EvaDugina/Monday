import type { Category, CategoryOption, Task } from '../types';
import { getUrgency } from './urgency';

interface ExportTasksPngOptions {
  categories: CategoryOption[];
  tasksByCategory: Record<Category, Task[]>;
  exportedAt?: Date;
}

interface TaskLayout {
  meta: string[];
  task: Task;
  titleLines: string[];
  height: number;
}

interface CategoryLayout {
  category: CategoryOption;
  tasks: TaskLayout[];
  height: number;
}

const CANVAS_WIDTH = 1200;
const PAGE_PADDING = 48;
const CONTENT_WIDTH = CANVAS_WIDTH - PAGE_PADDING * 2;
const HEADER_HEIGHT = 112;
const CATEGORY_HEADER_HEIGHT = 44;
const CATEGORY_GAP = 28;
const TASK_GAP = 10;
const TASK_PADDING_X = 18;
const TASK_PADDING_Y = 14;
const TASK_TITLE_LINE_HEIGHT = 25;
const TASK_META_HEIGHT = 22;
const EMPTY_ROW_HEIGHT = 40;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatFilenameStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(
    date.getMinutes(),
  )}`;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const pieces = context.measureText(word).width > maxWidth ? splitLongWord(context, word, maxWidth) : [word];

    for (const piece of pieces) {
      const nextLine = currentLine ? `${currentLine} ${piece}` : piece;

      if (currentLine && context.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = piece;
      } else {
        currentLine = nextLine;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function splitLongWord(context: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = '';

  for (const char of word) {
    const next = `${current}${char}`;

    if (current && context.measureText(next).width > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

function getTaskMeta(task: Task): string[] {
  const meta: string[] = [];
  const urgency = getUrgency(task.deadline);

  if (task.pinned) {
    meta.push('закреплено');
  }

  if (task.urgent) {
    meta.push('срочно');
  }

  if (urgency.label) {
    meta.push(urgency.label);
  }

  return meta;
}

function measureLayout(
  context: CanvasRenderingContext2D,
  categories: CategoryOption[],
  tasksByCategory: Record<Category, Task[]>,
): { categories: CategoryLayout[]; height: number } {
  context.font = '20px "Segoe UI", Arial, sans-serif';

  const categoryLayouts = categories.map((category) => {
    const tasks = tasksByCategory[category.key] ?? [];
    const taskLayouts = tasks.map((task) => {
      const titleLines = wrapText(context, task.title, CONTENT_WIDTH - TASK_PADDING_X * 2);
      const meta = getTaskMeta(task);
      const height =
        TASK_PADDING_Y * 2 + titleLines.length * TASK_TITLE_LINE_HEIGHT + (meta.length > 0 ? TASK_META_HEIGHT : 0);

      return {
        height,
        meta,
        task,
        titleLines,
      };
    });
    const tasksHeight =
      taskLayouts.length > 0
        ? taskLayouts.reduce((sum, task) => sum + task.height, 0) + TASK_GAP * Math.max(0, taskLayouts.length - 1)
        : EMPTY_ROW_HEIGHT;

    return {
      category,
      height: CATEGORY_HEADER_HEIGHT + tasksHeight,
      tasks: taskLayouts,
    };
  });
  const contentHeight =
    categoryLayouts.reduce((sum, category) => sum + category.height, 0) +
    CATEGORY_GAP * Math.max(0, categoryLayouts.length - 1);

  return {
    categories: categoryLayouts,
    height: Math.ceil(PAGE_PADDING + HEADER_HEIGHT + contentHeight + PAGE_PADDING),
  };
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number) {
  context.fillText(text, Math.round(x), Math.round(y));
}

function drawChip(context: CanvasRenderingContext2D, label: string, x: number, y: number, color: string): number {
  context.font = '600 13px "Segoe UI", Arial, sans-serif';
  const width = Math.ceil(context.measureText(label).width) + 18;
  roundedRect(context, x, y, width, 22, 5);
  context.fillStyle = color;
  context.fill();
  context.fillStyle = '#37352f';
  drawText(context, label, x + 9, y + 15);

  return width;
}

function drawTask(context: CanvasRenderingContext2D, layout: TaskLayout, color: string, x: number, y: number) {
  roundedRect(context, x, y, CONTENT_WIDTH, layout.height, 8);
  context.fillStyle = '#f8f9fa';
  context.fill();
  context.strokeStyle = '#e9ecef';
  context.lineWidth = 1;
  context.stroke();

  roundedRect(context, x, y, 5, layout.height, 4);
  context.fillStyle = color;
  context.fill();

  context.font = '20px "Segoe UI", Arial, sans-serif';
  context.fillStyle = '#37352f';

  let cursorY = y + TASK_PADDING_Y + 19;
  for (const line of layout.titleLines) {
    drawText(context, line, x + TASK_PADDING_X, cursorY);
    cursorY += TASK_TITLE_LINE_HEIGHT;
  }

  if (layout.meta.length === 0) {
    return;
  }

  let chipX = x + TASK_PADDING_X;
  const chipY = cursorY - 2;

  for (const meta of layout.meta) {
    const chipColor = meta === 'срочно' ? '#fdebec' : meta === 'закреплено' ? '#fff3bf' : '#edf2ff';
    const chipWidth = drawChip(context, meta, chipX, chipY, chipColor);
    chipX += chipWidth + 8;
  }
}

function drawExport(
  context: CanvasRenderingContext2D,
  layout: CategoryLayout[],
  width: number,
  height: number,
  exportedAt: Date,
) {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#37352f';
  context.font = '700 34px "Segoe UI", Arial, sans-serif';
  drawText(context, 'MONDAY - активные задачи', PAGE_PADDING, 62);

  context.fillStyle = '#787774';
  context.font = '16px "Segoe UI", Arial, sans-serif';
  const timestamp = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(exportedAt);
  drawText(context, `Экспортировано: ${timestamp}`, PAGE_PADDING, 92);

  let cursorY = PAGE_PADDING + HEADER_HEIGHT;

  for (const categoryLayout of layout) {
    const { category, tasks } = categoryLayout;

    context.fillStyle = category.color;
    roundedRect(context, PAGE_PADDING, cursorY + 7, 16, 16, 4);
    context.fill();

    context.fillStyle = '#37352f';
    context.font = '700 24px "Segoe UI", Arial, sans-serif';
    drawText(context, category.label, PAGE_PADDING + 28, cursorY + 24);

    context.fillStyle = '#787774';
    context.font = '15px "Segoe UI", Arial, sans-serif';
    const countLabel = `${tasks.length} ${tasks.length === 1 ? 'задача' : tasks.length >= 2 && tasks.length <= 4 ? 'задачи' : 'задач'}`;
    const countWidth = context.measureText(countLabel).width;
    drawText(context, countLabel, CANVAS_WIDTH - PAGE_PADDING - countWidth, cursorY + 24);

    cursorY += CATEGORY_HEADER_HEIGHT;

    if (tasks.length === 0) {
      context.fillStyle = '#f8f9fa';
      roundedRect(context, PAGE_PADDING, cursorY, CONTENT_WIDTH, EMPTY_ROW_HEIGHT, 8);
      context.fill();
      context.fillStyle = '#787774';
      context.font = '16px "Segoe UI", Arial, sans-serif';
      drawText(context, 'Нет открытых задач', PAGE_PADDING + 18, cursorY + 25);
      cursorY += EMPTY_ROW_HEIGHT;
    } else {
      for (const taskLayout of tasks) {
        drawTask(context, taskLayout, category.color, PAGE_PADDING, cursorY);
        cursorY += taskLayout.height + TASK_GAP;
      }
      cursorY -= TASK_GAP;
    }

    cursorY += CATEGORY_GAP;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;

    function settleWithDataUrl() {
      if (settled) {
        return;
      }

      try {
        settled = true;
        resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to render PNG'));
      }
    }

    const timeoutId = window.setTimeout(settleWithDataUrl, 1000);

    canvas.toBlob((blob) => {
      if (settled) {
        return;
      }

      window.clearTimeout(timeoutId);

      if (blob) {
        settled = true;
        resolve(blob);
      } else {
        settleWithDataUrl();
      }
    }, 'image/png');
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',');
  const mimeType = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportTasksAsPng({
  categories,
  tasksByCategory,
  exportedAt = new Date(),
}: ExportTasksPngOptions): Promise<string> {
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');

  if (!measuringContext) {
    throw new Error('Canvas is not available');
  }

  const measured = measureLayout(measuringContext, categories, tasksByCategory);
  const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(CANVAS_WIDTH * scale);
  canvas.height = Math.ceil(measured.height * scale);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not available');
  }

  context.scale(scale, scale);
  drawExport(context, measured.categories, CANVAS_WIDTH, measured.height, exportedAt);

  const filename = `monday-tasks-${formatFilenameStamp(exportedAt)}.png`;
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, filename);

  return filename;
}
