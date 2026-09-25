"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { INKBLOT } from "@/lib/content";
import {
  addEntry,
  cleanInitials,
  formatRun,
  loadBoard,
  qualifies,
  saveBoard,
  type Entry,
} from "@/lib/leaderboard";
import { CAT_FRAMES } from "../inkblot-cat";
import { COLOURS, type Sprite } from "../inkblot-sprites";

/** A pixel sprite as crisp SVG squares, for the page around the canvas. */
function SpriteSvg({
  sprite,
  className,
}: {
  sprite: Sprite;
  className?: string;
}) {
  const w = Math.max(...sprite.map((r) => r.length));
  return (
    <svg
      viewBox={`0 0 ${w} ${sprite.length}`}
      shapeRendering="crispEdges"
      aria-hidden
      className={className}
    >
      {sprite.flatMap((row, y) =>
        [...row].map((c, x) => {
          const fill = COLOURS[c as keyof typeof COLOURS];
          return c === "." || !fill ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={fill}
            />
          );
        }),
      )}
    </svg>
  );
}

const CROWN: Sprite = ["Y..Y..Y", "YY.Y.YY", "YYYYYYY", "YMYYYMY", "YYYYYYY"];

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 173) % 2400,
  duration: 1800 + ((i * 97) % 1600),
  colour: [COLOURS.M, COLOURS.B, COLOURS.W, COLOURS.Y, COLOURS.G][i % 5]!,
  size: 4 + (i % 3) * 2,
}));

// The win screen (owner, 2026-09-25: "very extra", GOODEST BOI, and a
// leaderboard for speed of chaos).
export function InkblotWin({
  seconds,
  knocked,
  onAgain,
}: {
  seconds: number;
  knocked: number;
  onAgain: () => void;
}) {
  const id = useId();
  const [board, setBoard] = useState<Entry[] | null>(null);
  const [initials, setInitials] = useState("");
  const [mine, setMine] = useState<Entry | null>(null);

  const initialsRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => setBoard(loadBoard()), []);

  const canEnter = board !== null && !mine && qualifies(board, seconds);

  // Focus the next thing to do without scrolling the crowned cat away.
  useEffect(() => {
    if (board === null) return;
    (canEnter ? initialsRef.current : againRef.current)?.focus({
      preventScroll: true,
    });
    root.current?.scrollTo({ top: 0 });
  }, [board, canEnter]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const name = cleanInitials(initials) || "???";
    const entry = { name, seconds, at: new Date().toISOString() };
    const next = addEntry(board ?? [], entry);
    saveBoard(next);
    setBoard(next);
    setMine(entry);
  }

  return (
    <div
      ref={root}
      data-inkblot-win
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="absolute inset-0 z-10 overflow-y-auto bg-[oklch(0.1_0.02_295/0.86)] px-4 py-3 text-center"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="inkblot-confetti absolute -top-3 block"
            style={
              {
                left: `${c.left}%`,
                width: c.size,
                height: c.size,
                background: c.colour,
                animationDelay: `${c.delay}ms`,
                animationDuration: `${c.duration}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-md flex-col items-center gap-2">
        {/* The goodest boi, crowned, in a spotlight. */}
        <div className="relative grid place-items-center pt-2">
          <div
            aria-hidden
            className="absolute inset-x-[-2.5rem] bottom-[-0.5rem] top-0 rounded-full bg-[radial-gradient(closest-side,oklch(0.65_0.27_340/0.55),transparent)]"
          />
          {/* Jinn's head is on the right of his 17-pixel frame (columns
              8–14, ears on row 4), so the crown moves right and down onto
              it: at 4 px a pixel, 12 px right and onto the ear tips. */}
          <SpriteSvg
            sprite={CROWN}
            className="inkblot-bounce relative z-10 h-5 w-auto translate-x-3"
          />
          <SpriteSvg
            sprite={CAT_FRAMES.idle[0]!}
            className="inkblot-bounce relative -mt-[16px] h-16 w-auto"
          />
        </div>
        <h3
          id={`${id}-title`}
          aria-label={INKBLOT.winTitle}
          className="camp404-chromatic font-pixel text-4xl uppercase leading-none sm:text-5xl"
        >
          {[...INKBLOT.winTitle].map((ch, i) => (
            <span
              key={i}
              aria-hidden
              className="inkblot-wave inline-block"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {ch === " " ? " " : ch}
            </span>
          ))}
        </h3>
        <p className="font-pixel text-[10px] uppercase tracking-widest text-os-muted">
          {INKBLOT.winLine}
        </p>

        <div className="mt-1 border-2 border-os-primary bg-os-bg px-5 py-2 shadow-[4px_4px_0_0_var(--color-os-accent)]">
          <p className="font-pixel text-[10px] uppercase tracking-widest text-os-accent">
            Speed of chaos
          </p>
          <p className="font-pixel text-3xl text-os-fg">{formatRun(seconds)}</p>
          <p className="font-mono text-[11px] uppercase text-os-muted">
            {knocked} things on the floor
          </p>
        </div>

        {canEnter && (
          <form onSubmit={save} className="flex flex-col items-center gap-2">
            <label
              htmlFor={`${id}-initials`}
              className="inkblot-blink font-pixel text-xs uppercase text-os-primary"
            >
              New record! Enter your initials
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-initials`}
                ref={initialsRef}
                autoComplete="off"
                maxLength={3}
                value={initials}
                onChange={(e) => setInitials(cleanInitials(e.target.value))}
                className="w-28 border-2 border-os-fg bg-os-bg px-2 py-1 text-center font-pixel text-2xl uppercase tracking-[0.4em] text-os-fg outline-none focus-visible:border-os-primary"
              />
              <button
                type="submit"
                className="border-2 border-os-fg bg-os-fg px-3 font-pixel text-xs uppercase text-os-bg shadow-[3px_3px_0_0_var(--color-os-primary)] hover:bg-os-primary hover:text-os-primary-fg"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <section aria-labelledby={`${id}-board`} className="w-full">
          <h4
            id={`${id}-board`}
            className="mb-1 font-pixel text-xs uppercase tracking-widest text-os-accent"
          >
            ★ Hall of fame ★
          </h4>
          {board && board.length > 0 ? (
            <ol className="border border-os-line bg-os-bg/80 font-pixel text-xs uppercase">
              {board.map((e, i) => {
                const me =
                  mine !== null &&
                  e.at === mine.at &&
                  e.seconds === mine.seconds;
                return (
                  <li
                    key={`${e.at}-${i}`}
                    className={`grid grid-cols-[2.5rem_1fr_auto] gap-2 px-3 py-1 ${
                      me
                        ? "inkblot-blink bg-os-primary text-os-primary-fg"
                        : "text-os-fg"
                    } ${i === 0 && !me ? "text-os-primary" : ""}`}
                  >
                    <span className="text-left">
                      {i === 0 ? "👑" : `${i + 1}.`}
                    </span>
                    <span className="text-left tracking-[0.3em]">{e.name}</span>
                    <span>{formatRun(e.seconds)}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="font-mono text-xs uppercase text-os-muted">
              No records yet.
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-os-muted">
            {INKBLOT.boardNote}
          </p>
        </section>

        <button
          type="button"
          ref={againRef}
          onClick={onAgain}
          className="mt-1 border-2 border-os-primary bg-os-primary px-5 py-2 font-pixel text-sm uppercase text-os-primary-fg shadow-[4px_4px_0_0_var(--color-os-fg)] hover:bg-os-fg hover:text-os-bg"
        >
          {INKBLOT.againButton}
        </button>
      </div>
    </div>
  );
}
