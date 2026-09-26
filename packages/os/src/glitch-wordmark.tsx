import type { CSSProperties } from "react";

/** The torn slices, each its own copy (styles.css says why). */
const TEARS = [
  "os-glitch-tear-a1",
  "os-glitch-tear-a2",
  "os-glitch-tear-a3",
  "os-glitch-tear-a4",
  "os-glitch-tear-a5",
  "os-glitch-tear-b1",
  "os-glitch-tear-b2",
  "os-glitch-tear-b3",
  "os-glitch-tear-b4",
] as const;

/**
 * The landing page's glitched "404", as Join draws it, set to any text and
 * size. Decorative: hidden from assistive tech (the page names itself in its
 * own heading), and its letters are five stacked copies a reader would hear
 * five times. The letters are drawn by CSS from `data-text`, not written
 * into the page, so a find in the page (or a test's getByText) never meets
 * them. Every layer moves in steps, a few jumps every few seconds.
 */
export function GlitchWordmark({
  text,
  size,
  className = "",
}: {
  text: string;
  /** A CSS length for the letters, e.g. "clamp(3rem, 7vw, 5.5rem)". */
  size: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-os-wordmark
      className={`os-glitch-shake relative select-none leading-none ${className}`}
      style={{ "--glitch-size": size } as CSSProperties}
    >
      <span className="os-glitch-base" data-text={text} />
      <span className="os-glitch-rgb os-glitch-magenta" data-text={text} />
      <span className="os-glitch-rgb os-glitch-cyan" data-text={text} />
      {TEARS.map((tear) => (
        <span
          key={tear}
          className={`os-glitch-tear ${tear}`}
          data-text={text}
        />
      ))}
    </div>
  );
}
