"use client";

// PROTOTYPE: the floating bar that flips between desktop variants. Never
// shown in a production build.

import { useEffect } from "react";

export function PrototypeSwitcher<K extends string>({
  variants,
  current,
  onChange,
}: {
  variants: Record<K, string>;
  current: K;
  onChange: (key: K) => void;
}) {
  const keys = Object.keys(variants) as K[];
  const index = keys.indexOf(current);
  const step = (d: number) =>
    onChange(keys[(index + d + keys.length) % keys.length]!);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable], [role=dialog]"))
        return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed top-14 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-1 rounded-full bg-white px-2 py-1 font-sans text-xs text-black shadow-lg ring-1 ring-black/20">
      <button
        type="button"
        onClick={() => step(-1)}
        className="rounded-full px-2 py-1 hover:bg-black/10"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-36 text-center font-medium">
        {current} ({variants[current]})
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        className="rounded-full px-2 py-1 hover:bg-black/10"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}
