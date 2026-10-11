import { petPortraitRects } from "./portraits";

// A pet's picture as an SVG of pixel rectangles. No hooks and no "use
// client": a server component draws it, so a card's picture costs the browser
// no script. Decorative: the card beside it names the pet.

export interface PetPortraitProps {
  /** The pet's stored key; a key with no picture draws nothing. */
  moduleKey: string;
  className?: string;
}

export function PetPortrait({ moduleKey, className }: PetPortraitProps) {
  const art = petPortraitRects(moduleKey);
  if (!art) return null;
  return (
    <svg
      viewBox={`0 0 ${art.width} ${art.height}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
      className={className}
      data-pet-portrait={moduleKey}
    >
      {art.rects.map((r) => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={1}
          fill={r.fill}
        />
      ))}
    </svg>
  );
}
