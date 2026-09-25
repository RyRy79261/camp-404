"use client";

import { useId, useState } from "react";
import type { JoinSiteContent } from "@camp404/types";
import { BUDGET_LINES } from "@/lib/content";
import {
  feeFromBudget,
  formatRands,
  formatUsdLabel as usd,
  parseRands,
  tierFor,
} from "@/lib/fee";
import { useJoinData } from "../join-data";
import { FeeScale } from "./fee-scale";
import { Eyebrow, WinBody } from "./ui";

function verdict(fee: number, FEE: JoinSiteContent["fee"]): string {
  const tier = tierFor(fee, FEE.tiers);
  if (!tier) return FEE.subsidy.note;
  return tier.note ? `${tier.name}. ${tier.note}` : `${tier.name}.`;
}

// "Budget your Burn": set a total, take off the other costs, and see what
// is left for the camp fee. Nothing here is sent anywhere.
export function FeeWindow() {
  const id = useId();
  const FEE = useJoinData().content.fee;
  const formatUsdLabel = (rands: number) =>
    usd(rands, FEE.usdRate.randsPerDollar);
  const SPEND_MAX = Math.max(1, ...FEE.spend.map((s) => s.rands));
  const [budget, setBudget] = useState("");
  const [costs, setCosts] = useState<Record<string, string>>({});
  const fee = feeFromBudget(
    parseRands(budget),
    BUDGET_LINES.map((l) => parseRands(costs[l.key] ?? "")),
  );

  const field =
    "w-full border-b border-os-line bg-transparent px-1 py-1 font-mono text-sm text-os-fg outline-none placeholder:text-os-muted/50 focus:border-os-primary focus-visible:outline-none";

  return (
    <WinBody>
      <FeeScale />
      <p>{FEE.intro}</p>
      <p className="font-mono text-[11px] uppercase text-os-muted">
        Tent fee (optional): {FEE.tentFee}
      </p>

      <section
        aria-labelledby={`${id}-calc`}
        className="space-y-3 border border-os-primary/60 bg-os-bg/60 p-4"
      >
        <Eyebrow id={`${id}-calc`}>Budget your Burn</Eyebrow>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase text-os-fg">
            My whole Burn budget (R)
          </span>
          <input
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="10000"
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {BUDGET_LINES.map((l) => (
            <label key={l.key} className="block space-y-1">
              <span className="font-mono text-[11px] uppercase text-os-fg">
                − {l.label}
              </span>
              <input
                inputMode="numeric"
                value={costs[l.key] ?? ""}
                onChange={(e) =>
                  setCosts((c) => ({ ...c, [l.key]: e.target.value }))
                }
                placeholder="0"
                aria-describedby={`${id}-${l.key}`}
                className={field}
              />
              <span
                id={`${id}-${l.key}`}
                className="block text-[11px] text-os-muted"
              >
                {l.hint}
              </span>
            </label>
          ))}
        </div>
        <output
          aria-live="polite"
          className="block border-t border-os-line pt-3"
        >
          <span className="font-mono text-[11px] uppercase text-os-muted">
            Left for your camp fee
          </span>
          <span className="block font-pixel text-3xl text-os-fg">
            {formatRands(fee)}{" "}
            <span className="font-mono text-sm text-os-muted">
              {formatUsdLabel(fee)}
            </span>
          </span>
          <span className="block text-os-primary">{verdict(fee, FEE)}</span>
        </output>
      </section>

      <p className="text-os-muted">{FEE.guidance}</p>

      <section aria-labelledby={`${id}-spend`} className="space-y-2">
        <Eyebrow id={`${id}-spend`}>Where it goes</Eyebrow>
        <ul className="space-y-1.5">
          {FEE.spend.map((s) => (
            <li key={s.what} className="space-y-0.5">
              <div className="flex justify-between gap-3 text-xs">
                <span>{s.what}</span>
                <span className="font-mono text-os-muted">
                  {formatRands(s.rands)}
                </span>
              </div>
              <div
                aria-hidden
                className="h-1.5 bg-os-accent"
                style={{ width: `${(s.rands / SPEND_MAX) * 100}%` }}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-os-muted">{FEE.spendNote}</p>
      </section>
      <blockquote className="border-l-2 border-os-primary pl-3 text-xs italic text-os-muted">
        “{FEE.quote}”
      </blockquote>
    </WinBody>
  );
}
