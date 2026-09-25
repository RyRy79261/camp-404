import type { ReactNode } from "react";
import type { GiftIcon } from "@camp404/types";

// Line-art icons for GIFTS.EXE on a 64 × 64 grid, in the desktop icons' style.
// Now Now Meow Meow is drawn from a photo of the real vehicle (owner,
// 2026-09-25): a low faceted wedge with big wheels and swept fins at the back.

const PATHS: Record<GiftIcon, ReactNode> = {
  orphanage: (
    <>
      <path d="M10 30L32 12l22 18" />
      <path d="M15 26v26h34V26" />
      <path d="M24 34l3-4 3 4h4l3-4 3 4v6c0 4-4 7-8 7s-8-3-8-7z" />
      <path d="M29 40h0M35 40h0" strokeWidth={2.5} />
    </>
  ),
  breakfast: (
    <>
      <path d="M10 32h44c0 11-10 19-22 19S10 43 10 32z" />
      <path d="M22 51h20" />
      <path d="M32 30c0-8 6-13 14-13 0 8-6 13-14 13z" />
      <path d="M32 30c-2-5-6-8-12-8 0 5 4 8 12 8z" />
      <path d="M18 18c-2-3 2-5 0-8M24 16c-2-3 2-5 0-8" />
    </>
  ),
  lounge: (
    <>
      <path d="M12 32v-8a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v8" />
      <path d="M8 32h48v12H8zM12 44v6M52 44v6" />
      <path d="M17 32v-4h13v4M34 32v-4h13v4" />
      <path d="M40 12l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z" />
    </>
  ),
  meow: (
    <>
      {/* body: pointed nose left, windscreen, open cockpit, raised tail */}
      <path d="M4 40l3-6 14-4 7-7 12-1 5 3 6-1 6 3v8l-3 6H6z" />
      {/* the swept rear fins, like a cat's ears */}
      <path d="M42 25l6-15 3 11" />
      <path d="M49 24l11-14-3 14" />
      {/* facets and the grille */}
      <path d="M21 30l5 10M28 23l5 6 12-1M36 22l-3 7" />
      <path d="M5 37h5M5 40h6" />
      {/* seat in the cockpit */}
      <path d="M36 29v-5l3-2" />
      <circle cx="16" cy="45" r="6" />
      <circle cx="16" cy="45" r="2" />
      <circle cx="49" cy="45" r="7" />
      <circle cx="49" cy="45" r="2.5" />
    </>
  ),
  // After AfrikaBurn's figure with raised arms (owner, 2026-09-25), without
  // its roots: a body holding a fringed bar overhead.
  flames: (
    <>
      <path d="M21 17h22v4H21z" />
      <path d="M23 17v-3M27 17v-3M31 17v-3M35 17v-3M39 17v-3" />
      <path d="M26 31c-4-1-7-4-6-9l2-1" />
      <path d="M38 31c4-1 7-4 6-9l-2-1" />
      <path d="M26 29h12l-2 13 3 9H25l3-9z" />
    </>
  ),
  art: (
    <>
      <path d="M32 8c6 8 11 12 11 21a11 11 0 0 1-22 0c0-6 3-9 6-12 1 4 3 6 5 6 0-6-2-9 0-15z" />
      <path d="M28 34c0-3 2-5 4-7 2 2 4 4 4 7a4 4 0 0 1-8 0z" />
      <path d="M20 50l6-10h12l6 10zM16 54h32" />
    </>
  ),
};

export function GiftIconSvg({
  icon,
  className,
}: {
  icon: GiftIcon;
  className?: string;
}) {
  return (
    <svg
      viewBox={icon === "meow" ? "0 4 64 50" : "0 0 64 64"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[icon]}
    </svg>
  );
}
