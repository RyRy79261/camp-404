"use client";

import { useId, useState } from "react";
import { formatRands, formatUsdLabel as usd, tierFor } from "@/lib/fee";
import { useJoinData } from "../join-data";

// The camp fee as a floating scale: a subsidy zone, four marked tiers and a
// slider to see where an amount lands. It is a guide; nothing is sent.
export function FeeScale() {
  const id = useId();
  const FEE = useJoinData().content.fee;
  const rate = FEE.usdRate.randsPerDollar;
  const formatUsdLabel = (rands: number) => usd(rands, rate);
  const PERFECT = FEE.tiers[FEE.tiers.length - 1]!.rands;
  const ESSENTIAL = FEE.tiers[0]!.rands;
  // Room past the top tier, so its marker is not on the very edge.
  const SCALE_MAX = Math.round((PERFECT * 1.125) / 100) * 100;
  // Start on "ideal" when a tier has that name, else the middle tier.
  const IDEAL = (
    FEE.tiers.find((t) => t.key === "ideal") ??
    FEE.tiers[Math.floor(FEE.tiers.length / 2)]!
  ).rands;
  const pct = (rands: number) => `${(rands / SCALE_MAX) * 100}%`;
  const [amount, setAmount] = useState(IDEAL);
  const tier = tierFor(amount, FEE.tiers);
  const label = tier?.name ?? FEE.subsidy.name;
  const note = tier ? tier.note : FEE.subsidy.note;

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-4">
      <h3
        id={`${id}-h`}
        className="os-glow font-pixel text-lg uppercase leading-tight"
      >
        Camp fee: a sliding scale
      </h3>
      <p className="text-os-muted">{FEE.scaleIntro}</p>

      <output
        htmlFor={`${id}-range`}
        aria-live="polite"
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
      >
        <span className="font-pixel text-3xl text-os-fg">
          {formatRands(amount)}
        </span>
        <span className="font-mono text-sm text-os-muted">
          {formatUsdLabel(amount)}
        </span>
        <span
          className={`px-1.5 py-0.5 font-pixel text-[10px] uppercase ${
            tier
              ? "bg-os-primary text-os-primary-fg"
              : "bg-os-accent text-os-primary-fg"
          }`}
        >
          {label}
        </span>
        {note && <span className="basis-full text-sm text-os-fg">{note}</span>}
      </output>

      <div className="relative px-1 pb-14 pt-12">
        {/* The track: blue at the subsidy end, magenta at Perfect World. */}
        <div
          aria-hidden
          className="relative h-4 border border-os-line bg-gradient-to-r from-os-accent via-os-primary/70 to-os-primary"
        >
          <div
            className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.45)_0_4px,transparent_4px_8px)]"
            style={{ width: pct(ESSENTIAL) }}
          />
          <span className="absolute left-1 top-1/2 -translate-y-1/2 font-pixel text-[8px] uppercase text-os-fg">
            {FEE.subsidy.name}
          </span>
          <div
            className="absolute -top-1 bottom-[-4px] w-0.5 -translate-x-1/2 bg-os-fg shadow-[0_0_8px_var(--color-os-fg)]"
            style={{ left: pct(amount) }}
          />
        </div>

        {FEE.tiers.map((t, i) => {
          const above = i % 2 === 0;
          const ideal = t.key === "ideal";
          return (
            <div
              key={t.key}
              aria-hidden
              className={`absolute flex -translate-x-1/2 flex-col items-center text-center ${
                above
                  ? "bottom-[calc(100%-2.75rem)] flex-col-reverse"
                  : "top-[4.25rem]"
              }`}
              style={{ left: `calc(0.25rem + ${pct(t.rands)})` }}
            >
              <span
                className={`h-3 w-px ${ideal ? "bg-os-primary" : "bg-os-fg/60"}`}
              />
              <span
                className={`whitespace-nowrap font-pixel text-[9px] uppercase ${
                  ideal ? "text-os-primary" : "text-os-fg"
                }`}
              >
                {ideal && "★ "}
                {t.name}
              </span>
              <span className="hidden whitespace-nowrap font-mono text-[10px] text-os-muted sm:inline">
                {formatRands(t.rands)} ·{" "}
                {formatUsdLabel(t.rands).replace("≈ ", "")}
              </span>
            </div>
          );
        })}

        <label htmlFor={`${id}-range`} className="sr-only">
          What I could pay, in rands
        </label>
        <input
          id={`${id}-range`}
          type="range"
          min={0}
          max={SCALE_MAX}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-valuetext={`${formatRands(amount)}, ${formatUsdLabel(amount)}, ${label}`}
          className="os-range absolute inset-x-1 top-12 h-4 cursor-pointer"
        />
      </div>

      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {FEE.tiers.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              aria-pressed={tier?.key === t.key}
              onClick={() => setAmount(t.rands)}
              className={`w-full border px-2 py-1.5 text-left ${
                tier?.key === t.key
                  ? "border-os-primary bg-os-primary/15"
                  : "border-os-line hover:border-os-primary"
              }`}
            >
              <span className="block font-pixel text-[10px] uppercase">
                {t.name}
              </span>
              <span className="block font-mono text-xs">
                {formatRands(t.rands)}{" "}
                <span className="block text-os-muted">
                  {formatUsdLabel(t.rands)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[10px] uppercase text-os-muted">
        Dollar figures are a guide at R{FEE.usdRate.randsPerDollar} = $1 (
        {FEE.usdRate.asOf}). We pay in rands.
      </p>
    </section>
  );
}
