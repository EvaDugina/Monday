import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface BackgroundDecoration {
  anchor?: 'center';
  id: string;
  imageId?: string;
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
  onDecorationResize: (id: string, nextDecoration: Pick<BackgroundDecoration, 'height' | 'left' | 'top' | 'width'>) => void;
}

interface DragState {
  grabOffsetX: number;
  grabOffsetY: number;
  id: string;
  pointerId: number;
}

type ResizeHandle = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

interface ResizeState {
  handle: ResizeHandle;
  startHeight: number;
  id: string;
  layerHeight: number;
  layerLeft: number;
  layerTop: number;
  layerWidth: number;
  pointerId: number;
  rotation: number;
  startCenterX: number;
  startCenterY: number;
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
const DEFAULT_DECORATION_ASPECT = 0.66;
const RESIZE_HANDLES: ResizeHandle[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rotateVector(x: number, y: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function toLocalDelta(x: number, y: number, degrees: number): { x: number; y: number } {
  return rotateVector(x, y, -degrees);
}

function getRenderedHeight(decoration: Pick<BackgroundDecoration, 'height' | 'width'>, naturalAspect?: number): number {
  const naturalHeight = naturalAspect && naturalAspect > 0 ? decoration.width * naturalAspect : undefined;
  const rawHeight = naturalHeight ?? decoration.height ?? decoration.width * DEFAULT_DECORATION_ASPECT;

  return Math.max(1, Math.round(rawHeight));
}

function getCornerControlPosition(
  handle: ResizeHandle,
  width: number,
  height: number,
  rotation: number,
): { left: number; top: number } {
  const xSign = handle.endsWith('left') ? -1 : 1;
  const ySign = handle.startsWith('top') ? -1 : 1;
  const offset = rotateVector((xSign * width) / 2, (ySign * height) / 2, rotation);

  return {
    left: width / 2 + offset.x,
    top: height / 2 + offset.y,
  };
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
  onDecorationResize,
}: BackgroundDecorationsProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [selectedDecorationId, setSelectedDecorationId] = useState<string | null>(null);
  // Natural aspect ratio (height / width) of each decoration's loaded image, keyed by id.
  const [naturalAspects, setNaturalAspects] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isEditing) {
      setSelectedDecorationId(null);
      return;
    }

    if (selectedDecorationId && !decorations.some((decoration) => decoration.id === selectedDecorationId)) {
      setSelectedDecorationId(null);
    }
  }, [decorations, isEditing, selectedDecorationId]);

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

    setSelectedDecorationId(decoration.id);
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
  }

  function handleResizePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    decoration: BackgroundDecoration,
    handle: ResizeHandle,
  ): void {
    if (!isEditing || event.button !== 0) {
      return;
    }

    // Height follows the image's true aspect ratio so the resize box matches the visible picture.
    const layerMetrics = getLayerMetrics(layerRef.current);
    const startWidth = Math.max(decoration.width, MIN_DECORATION_WIDTH);
    const startHeight = Math.max(getRenderedHeight(decoration, naturalAspects[decoration.id]), MIN_DECORATION_HEIGHT);
    const startTopPx = layerMetrics.top + (decoration.top / 100) * layerMetrics.height;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedDecorationId(decoration.id);
    setResizeState({
      handle,
      id: decoration.id,
      layerHeight: layerMetrics.height,
      layerLeft: layerMetrics.left,
      layerTop: layerMetrics.top,
      layerWidth: layerMetrics.width,
      pointerId: event.pointerId,
      rotation: decoration.rotation,
      startCenterX: layerMetrics.left + layerMetrics.width / 2 + decoration.left,
      startCenterY: startTopPx + startHeight / 2,
      startHeight,
      startWidth,
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLButtonElement>, decoration: BackgroundDecoration): void {
    if (!resizeState || resizeState.id !== decoration.id || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const delta = toLocalDelta(
      event.clientX - resizeState.startX,
      event.clientY - resizeState.startY,
      resizeState.rotation,
    );
    const deltaX = delta.x;
    const deltaY = delta.y;
    const rawWidth =
      resizeState.handle === 'top-left' || resizeState.handle === 'bottom-left'
        ? resizeState.startWidth - deltaX
        : resizeState.startWidth + deltaX;
    const rawHeight =
      resizeState.handle === 'top-left' || resizeState.handle === 'top-right'
        ? resizeState.startHeight - deltaY
        : resizeState.startHeight + deltaY;
    const minScale = Math.max(
      MIN_DECORATION_WIDTH / resizeState.startWidth,
      MIN_DECORATION_HEIGHT / resizeState.startHeight,
    );
    const nextScale = Math.max(rawWidth / resizeState.startWidth, rawHeight / resizeState.startHeight, minScale);
    const nextWidth = Math.round(resizeState.startWidth * nextScale);
    const nextHeight = Math.round(resizeState.startHeight * nextScale);
    const oppositeStartX =
      resizeState.handle === 'top-left' || resizeState.handle === 'bottom-left'
        ? resizeState.startWidth / 2
        : -resizeState.startWidth / 2;
    const oppositeStartY =
      resizeState.handle === 'top-left' || resizeState.handle === 'top-right'
        ? resizeState.startHeight / 2
        : -resizeState.startHeight / 2;
    const oppositeNextX =
      resizeState.handle === 'top-left' || resizeState.handle === 'bottom-left'
        ? nextWidth / 2
        : -nextWidth / 2;
    const oppositeNextY =
      resizeState.handle === 'top-left' || resizeState.handle === 'top-right'
        ? nextHeight / 2
        : -nextHeight / 2;
    const startAnchorOffset = rotateVector(oppositeStartX, oppositeStartY, resizeState.rotation);
    const nextAnchorOffset = rotateVector(oppositeNextX, oppositeNextY, resizeState.rotation);
    const anchorX = resizeState.startCenterX + startAnchorOffset.x;
    const anchorY = resizeState.startCenterY + startAnchorOffset.y;
    const nextCenterX = anchorX - nextAnchorOffset.x;
    const nextCenterY = anchorY - nextAnchorOffset.y;
    const nextTopEdge = nextCenterY - nextHeight / 2;
    const nextLeft = Math.round(nextCenterX - resizeState.layerLeft - resizeState.layerWidth / 2);
    const nextTop = Number((((nextTopEdge - resizeState.layerTop) / resizeState.layerHeight) * 100).toFixed(2));

    event.preventDefault();
    event.stopPropagation();
    onDecorationResize(decoration.id, {
      height: nextHeight,
      left: nextLeft,
      top: nextTop,
      width: nextWidth,
    });
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
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>, decorationId: string): void {
    const image = event.currentTarget;

    if (!image.naturalWidth || !image.naturalHeight) {
      return;
    }

    const aspect = image.naturalHeight / image.naturalWidth;
    setNaturalAspects((current) =>
      current[decorationId] === aspect ? current : { ...current, [decorationId]: aspect },
    );
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
        const isSelected = selectedDecorationId === decoration.id;
        const showControls = isEditing && (isSelected || isDragging || isResizing);
        // Render the box at the image's true aspect ratio so controls sit on the visible picture.
        const aspect = naturalAspects[decoration.id];
        const renderedHeight = getRenderedHeight(decoration, aspect);
        const deletePosition = getCornerControlPosition(
          'top-right',
          decoration.width,
          renderedHeight,
          decoration.rotation,
        );

        return (
          <div
            key={decoration.id}
            className={`background-decorations__item${isEditing ? ' background-decorations__item--editing' : ''}${
              isDragging ? ' background-decorations__item--dragging' : ''
            }${isResizing ? ' background-decorations__item--resizing' : ''}${
              isSelected ? ' background-decorations__item--selected' : ''
            } background-decorations__item--sized`}
            style={{
              left: `calc(50% + ${decoration.left}px)`,
              height: `${renderedHeight}px`,
              opacity: Math.max(decoration.opacity, 0.78),
              top: `${decoration.top}%`,
              transform: 'translateX(-50%)',
              width: `${decoration.width}px`,
            }}
            onPointerCancel={handlePointerEnd}
            onPointerDown={(event) => handlePointerDown(event, decoration)}
            onPointerMove={(event) => handlePointerMove(event, decoration)}
            onPointerUp={handlePointerEnd}
          >
            <div
              className="background-decorations__frame"
              style={{ transform: `rotate(${decoration.rotation}deg)` }}
            >
              <img
                className="background-decorations__image"
                src={decoration.src}
                alt=""
                draggable={false}
                onLoad={(event) => handleImageLoad(event, decoration.id)}
              />
              {showControls && (
                <span className="background-decorations__size-label">
                  {Math.round(decoration.width)} x {Math.round(renderedHeight)}
                </span>
              )}
            </div>
            {showControls && (
              <>
                <button
                  type="button"
                  className="background-decorations__delete has-tooltip"
                  style={{ left: `${deletePosition.left}px`, top: `${deletePosition.top}px` }}
                  aria-label={`Удалить ${decoration.name}`}
                  data-tooltip="Удалить изображение"
                  title="Удалить изображение"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDecorationDelete(decoration.id);
                  }}
                >
                  <X size={15} strokeWidth={2} aria-hidden="true" />
                </button>
                {RESIZE_HANDLES.map((handle) => {
                  const position = getCornerControlPosition(handle, decoration.width, renderedHeight, decoration.rotation);

                  return (
                    <button
                      key={handle}
                      type="button"
                      className={`background-decorations__resize background-decorations__resize--${handle} has-tooltip`}
                      style={{ left: `${position.left}px`, top: `${position.top}px` }}
                      aria-label={`Пропорционально изменить размер ${decoration.name}`}
                      data-tooltip="Изменить размер"
                      title="Изменить размер"
                      onPointerCancel={handleResizePointerEnd}
                      onPointerDown={(event) => handleResizePointerDown(event, decoration, handle)}
                      onPointerMove={(event) => handleResizePointerMove(event, decoration)}
                      onPointerUp={handleResizePointerEnd}
                    />
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default BackgroundDecorations;
