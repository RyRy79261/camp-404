"use client";

import { useId, useState } from "react";
import { FeeScaleTrack, feeScaleMax } from "@camp404/os";
import {
  formatRands,
  formatUsdLabel as usd,
  randsToMinor,
  tierFor,
} from "@/lib/fee";
import { useJoinData } from "../join-data";

// The camp fee as a floating scale: a subsidy zone, four marked tiers and a
// slider to see where an amount lands. It is a guide; nothing is sent. The
// track is @camp404/os's FeeScaleTrack, the same one the console's "What can
// you commit?" draws.
export function FeeScale() {
  const id = useId();
  const FEE = useJoinData().content.fee;
  const rate = FEE.usdRate.randsPerDollar;
  // The scale moves in whole rands; the label is worked out in cents.
  const formatUsdLabel = (rands: number) => usd(randsToMinor(rands), rate);
  const PERFECT = FEE.tiers[FEE.tiers.length - 1]!.rands;
  const ESSENTIAL = FEE.tiers[0]!.rands;
  // Room past the top tier, so its marker is not on the very edge.
  const SCALE_MAX = feeScaleMax(PERFECT);
  // Start on "ideal" when a tier has that name, else the middle tier.
  const IDEAL = (
    FEE.tiers.find((t) => t.key === "ideal") ??
    FEE.tiers[Math.floor(FEE.tiers.length / 2)]!
  ).rands;
  const [amount, setAmount] = useState(IDEAL);
  const tier = tierFor(randsToMinor(amount), FEE.tiers);
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

      <FeeScaleTrack
        id={`${id}-range`}
        rands={amount}
        onRandsChange={setAmount}
        max={SCALE_MAX}
        subsidyBelow={ESSENTIAL}
        subsidyName={FEE.subsidy.name}
        marks={FEE.tiers.map((t, i) => ({
          key: t.key,
          name: t.key === "ideal" ? `★ ${t.name}` : t.name,
          rands: t.rands,
          detail: `${formatRands(t.rands)} · ${formatUsdLabel(t.rands).replace("≈ ", "")}`,
          side: i % 2 === 0 ? "above" : "below",
          lit: t.key === "ideal",
        }))}
        label="What I could pay, in rands"
        valueText={`${formatRands(amount)}, ${formatUsdLabel(amount)}, ${label}`}
      />

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
        Dollar figures are a guide at R{FEE.usdRate.randsPerDollar} = US$1 (
        {FEE.usdRate.asOf}). We pay in rands.
      </p>
    </section>
  );
}
