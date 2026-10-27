"use client";

// The camp fee's floating scale, drawn once for both apps (camp fees sprint,
// owner 2026-10-27): the Join site's "Camp fee: a sliding scale" and the
// member's "What can you commit?" in the console. A track with a hatched
// subsidy zone, a needle where the amount lands, the scale's marks above and
// below it, and a native range input laid over the track so it stays
// keyboard- and screen-reader-native (its look is `.os-range` in styles.css).
//
// Presentational only: amounts are whole rands, and the caller formats them
// (each app has its own money rules) and says which marks sit where. Nothing
// here knows a fee, a pledge or a currency.

export interface FeeScaleMark {
  key: string;
  /** "Essential", "★ Recommended". */
  name: string;
  /** Where it sits, in whole rands. */
  rands: number;
  /** The small line under its name ("R3,500 · ≈ US$219"), wide screens only. */
  detail?: string;
  /** Above the track or below it. */
  side: "above" | "below";
  /** Drawn in the accent colour (the Join site's Ideal, the Recommended). */
  lit?: boolean;
}

export interface FeeScaleTrackProps {
  /** The range input's id (a page's own label may point at it). */
  id: string;
  /** The amount, whole rands. Past `max` the needle and thumb rest at the end. */
  rands: number;
  onRandsChange: (rands: number) => void;
  /** The scale's right end, whole rands. */
  max: number;
  /** The slider's step, whole rands. */
  step?: number;
  /** The hatched subsidy zone runs from 0 to here (the first mark). */
  subsidyBelow: number;
  /** The words on the subsidy zone ("Subsidy"). */
  subsidyName: string;
  marks: readonly FeeScaleMark[];
  /** The slider's accessible name. */
  label: string;
  /** What a screen reader hears for the value ("R 7 200, ≈ US$450, Ideal"). */
  valueText: string;
  disabled?: boolean;
}

export function FeeScaleTrack({
  id,
  rands,
  onRandsChange,
  max,
  step = 100,
  subsidyBelow,
  subsidyName,
  marks,
  label,
  valueText,
  disabled = false,
}: FeeScaleTrackProps) {
  const pct = (value: number) =>
    `${(Math.min(Math.max(value, 0), max) / max) * 100}%`;
  return (
    <div className="relative px-1 pb-14 pt-12">
      {/* The track: blue at the subsidy end, magenta at the top. */}
      <div
        aria-hidden
        className="relative h-4 border border-os-line bg-gradient-to-r from-os-accent via-os-primary/70 to-os-primary"
      >
        <div
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.45)_0_4px,transparent_4px_8px)]"
          style={{ width: pct(subsidyBelow) }}
        />
        <span className="absolute left-1 top-1/2 -translate-y-1/2 font-pixel text-[8px] uppercase text-os-fg">
          {subsidyName}
        </span>
        <div
          data-fee-needle
          className="absolute -top-1 bottom-[-4px] w-0.5 -translate-x-1/2 bg-os-fg shadow-[0_0_8px_var(--color-os-fg)]"
          style={{ left: pct(rands) }}
        />
      </div>

      {marks.map((m) => {
        const above = m.side === "above";
        return (
          <div
            key={m.key}
            aria-hidden
            className={`absolute flex -translate-x-1/2 flex-col items-center text-center ${
              above
                ? "bottom-[calc(100%-2.75rem)] flex-col-reverse"
                : "top-[4.25rem]"
            }`}
            style={{ left: `calc(0.25rem + ${pct(m.rands)})` }}
          >
            <span
              className={`h-3 w-px ${m.lit ? "bg-os-primary" : "bg-os-fg/60"}`}
            />
            <span
              className={`whitespace-nowrap font-pixel text-[9px] uppercase ${
                m.lit ? "text-os-primary" : "text-os-fg"
              }`}
            >
              {m.name}
            </span>
            {m.detail && (
              <span className="hidden whitespace-nowrap font-mono text-[10px] text-os-muted sm:inline">
                {m.detail}
              </span>
            )}
          </div>
        );
      })}

      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={Math.min(Math.max(rands, 0), max)}
        disabled={disabled}
        onChange={(e) => onRandsChange(Number(e.target.value))}
        aria-valuetext={valueText}
        className="os-range absolute inset-x-1 top-12 h-4 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}

/**
 * The scale's right end: an eighth past its top mark, to the nearest R100, so
 * the top mark is not on the very edge.
 */
export function feeScaleMax(topRands: number): number {
  return Math.max(100, Math.round((topRands * 1.125) / 100) * 100);
}
