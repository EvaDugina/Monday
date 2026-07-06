export interface BackgroundDecoration {
  id: string;
  name: string;
  src: string;
  left: number;
  top: number;
  width: number;
  opacity: number;
  rotation: number;
  depth: number;
}

interface BackgroundDecorationsProps {
  decorations: BackgroundDecoration[];
  pointerX: number;
  pointerY: number;
  scrollY: number;
}

function BackgroundDecorations({ decorations, pointerX, pointerY, scrollY }: BackgroundDecorationsProps) {
  if (decorations.length === 0) {
    return null;
  }

  return (
    <div className="background-decorations" aria-hidden="true">
      {decorations.map((decoration) => {
        const offsetX = pointerX * decoration.depth * 18;
        const offsetY = scrollY * decoration.depth * -0.08 + pointerY * decoration.depth * 14;

        return (
          <img
            key={decoration.id}
            className="background-decorations__image"
            src={decoration.src}
            alt=""
            draggable={false}
            style={{
              left: `${decoration.left}%`,
              opacity: decoration.opacity,
              top: `${decoration.top}%`,
              transform: `translate3d(${offsetX}px, ${offsetY}px, 0) rotate(${decoration.rotation}deg)`,
              width: `${decoration.width}px`,
            }}
          />
        );
      })}
    </div>
  );
}

export default BackgroundDecorations;
