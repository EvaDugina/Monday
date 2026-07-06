import { Maximize2, X } from 'lucide-react';
import { useRef, useState } from 'react';

export interface BackgroundDecoration {
  anchor?: 'center';
  id: string;
  name: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height?: number;
  opacity: number;
  rotation: number;
  depth: number;
}

interface BackgroundDecorationsProps {
  decorations: BackgroundDecoration[];
  isEditing: boolean;
  onDecorationDelete: (id: string) => void;
  onDecorationMove: (id: string, left: number, top: number) => void;
  onDecorationMoveEnd: () => void;
  onDecorationResize: (id: string, width: number, height: number) => void;
  onDecorationResizeEnd: () => void;
}

interface DragState {
  grabOffsetX: number;
  grabOffsetY: number;
  id: string;
  pointerId: number;
}

type ResizeHandle = 'bottom' | 'corner' | 'right';

interface ResizeState {
  handle: ResizeHandle;
  startHeight: number;
  id: string;
  pointerId: number;
  startWidth: number;
  startX: number;
  startY: number;
}

interface LayerMetrics {
  height: number;
  left: number;
  top: number;
  width: number;
}

const MIN_DECORATION_WIDTH = 96;
const MIN_DECORATION_HEIGHT = 72;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getLayerMetrics(layer: HTMLDivElement | null): LayerMetrics {
  const rect = layer?.getBoundingClientRect();
  const fallbackHeight = Math.max(
    window.innerHeight,
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );

  return {
    height: Math.max(rect && rect.height > 0 ? rect.height : fallbackHeight, 1),
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
    width: Math.max(rect && rect.width > 0 ? rect.width : window.innerWidth, 1),
  };
}

function BackgroundDecorations({
  decorations,
  isEditing,
  onDecorationDelete,
  onDecorationMove,
  onDecorationMoveEnd,
  onDecorationResize,
  onDecorationResizeEnd,
}: BackgroundDecorationsProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  if (decorations.length === 0) {
    return null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>, decoration: BackgroundDecoration): void {
    if (!isEditing || resizeState || event.button !== 0) {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLElement && target.closest('button')) {
      return;
    }

    const layerMetrics = getLayerMetrics(layerRef.current);
    const leftPx = layerMetrics.left + layerMetrics.width / 2 + decoration.left;
    const topPx = layerMetrics.top + (decoration.top / 100) * layerMetrics.height;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      grabOffsetX: event.clientX - leftPx,
      grabOffsetY: event.clientY - topPx,
      id: decoration.id,
      pointerId: event.pointerId,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>, decoration: BackgroundDecoration): void {
    if (!dragState || dragState.id !== decoration.id || dragState.pointerId !== event.pointerId) {
      return;
    }

    const layerMetrics = getLayerMetrics(layerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const maxLeft = layerMetrics.width / 2;
    const minLeft = -maxLeft;
    const minTop = -((rect.height / layerMetrics.height) * 100);
    const maxTop = 100;
    const nextLeft = clamp(
      event.clientX - layerMetrics.left - dragState.grabOffsetX - layerMetrics.width / 2,
      minLeft,
      maxLeft,
    );
    const nextTop = clamp(
      ((event.clientY - layerMetrics.top - dragState.grabOffsetY) / layerMetrics.height) * 100,
      minTop,
      maxTop,
    );

    event.preventDefault();
    onDecorationMove(decoration.id, Math.round(nextLeft), Number(nextTop.toFixed(2)));
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>): void {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragState(null);
    onDecorationMoveEnd();
  }

  function handleResizePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    decoration: BackgroundDecoration,
    handle: ResizeHandle,
  ): void {
    if (!isEditing || event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.closest<HTMLElement>('.background-decorations__frame')?.getBoundingClientRect();
    const fallbackHeight = decoration.height ?? decoration.width * 0.66;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeState({
      handle,
      id: decoration.id,
      pointerId: event.pointerId,
      startHeight: Math.max(decoration.height ?? rect?.height ?? fallbackHeight, MIN_DECORATION_HEIGHT),
      startWidth: Math.max(decoration.width, rect?.width ?? 0, MIN_DECORATION_WIDTH),
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLButtonElement>, decoration: BackgroundDecoration): void {
    if (!resizeState || resizeState.id !== decoration.id || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - resizeState.startX;
    const deltaY = event.clientY - resizeState.startY;
    const nextWidth =
      resizeState.handle === 'right' || resizeState.handle === 'corner'
        ? Math.max(MIN_DECORATION_WIDTH, resizeState.startWidth + deltaX)
        : resizeState.startWidth;
    const nextHeight =
      resizeState.handle === 'bottom' || resizeState.handle === 'corner'
        ? Math.max(MIN_DECORATION_HEIGHT, resizeState.startHeight + deltaY)
        : resizeState.startHeight;

    event.preventDefault();
    event.stopPropagation();
    onDecorationResize(decoration.id, Math.round(nextWidth), Math.round(nextHeight));
  }

  function handleResizePointerEnd(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    event.preventDefault();
    event.stopPropagation();
    setResizeState(null);
    onDecorationResizeEnd();
  }

  return (
    <div
      ref={layerRef}
      className={`background-decorations${isEditing ? ' background-decorations--editing' : ''}`}
      aria-hidden={!isEditing}
    >
      {decorations.map((decoration) => {
        const isDragging = dragState?.id === decoration.id;
        const isResizing = resizeState?.id === decoration.id;

        return (
          <div
            key={decoration.id}
            className={`background-decorations__item${isEditing ? ' background-decorations__item--editing' : ''}${
              isDragging ? ' background-decorations__item--dragging' : ''
            }${isResizing ? ' background-decorations__item--resizing' : ''}${
              decoration.height ? ' background-decorations__item--sized' : ''
            }`}
            style={{
              left: `calc(50% + ${decoration.left}px)`,
              height: decoration.height ? `${decoration.height}px` : undefined,
              opacity: Math.max(decoration.opacity, 0.78),
              top: `${decoration.top}%`,
              transform: `translateX(-50%) rotate(${decoration.rotation}deg)`,
              width: `${decoration.width}px`,
            }}
            onPointerCancel={handlePointerEnd}
            onPointerDown={(event) => handlePointerDown(event, decoration)}
            onPointerMove={(event) => handlePointerMove(event, decoration)}
            onPointerUp={handlePointerEnd}
          >
            <div className="background-decorations__frame">
              <img className="background-decorations__image" src={decoration.src} alt="" draggable={false} />
              {isEditing && (
                <>
                  <button
                    type="button"
                    className="background-decorations__delete has-tooltip"
                    aria-label={`Удалить ${decoration.name}`}
                    data-tooltip="Удалить изображение"
                    title="Удалить изображение"
                    onClick={() => onDecorationDelete(decoration.id)}
                  >
                    <X size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="background-decorations__resize background-decorations__resize--right has-tooltip"
                    aria-label={`Растянуть по ширине ${decoration.name}`}
                    data-tooltip="Растянуть по ширине"
                    title="Растянуть по ширине"
                    onPointerCancel={handleResizePointerEnd}
                    onPointerDown={(event) => handleResizePointerDown(event, decoration, 'right')}
                    onPointerMove={(event) => handleResizePointerMove(event, decoration)}
                    onPointerUp={handleResizePointerEnd}
                  />
                  <button
                    type="button"
                    className="background-decorations__resize background-decorations__resize--bottom has-tooltip"
                    aria-label={`Растянуть по высоте ${decoration.name}`}
                    data-tooltip="Растянуть по высоте"
                    title="Растянуть по высоте"
                    onPointerCancel={handleResizePointerEnd}
                    onPointerDown={(event) => handleResizePointerDown(event, decoration, 'bottom')}
                    onPointerMove={(event) => handleResizePointerMove(event, decoration)}
                    onPointerUp={handleResizePointerEnd}
                  />
                  <button
                    type="button"
                    className="background-decorations__resize background-decorations__resize--corner has-tooltip"
                    aria-label={`Изменить размер ${decoration.name}`}
                    data-tooltip="Изменить размер"
                    title="Изменить размер"
                    onPointerCancel={handleResizePointerEnd}
                    onPointerDown={(event) => handleResizePointerDown(event, decoration, 'corner')}
                    onPointerMove={(event) => handleResizePointerMove(event, decoration)}
                    onPointerUp={handleResizePointerEnd}
                  >
                    <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BackgroundDecorations;
