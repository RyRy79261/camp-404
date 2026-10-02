import type { ReactNode } from "react";
import Link from "next/link";
import { formatMoney, type CostBar, type FoodCost } from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";
import { PIXEL_LABEL } from "@/components/kitchen/labels";

// The food cost on top of the shopping list, for captains and Kitchen leads
// only (the owner's Option A of design/kitchen-costing.html, 2026-10-02): the
// food cost (paid and estimated), the Kitchen team's one budget amount, what
// is left, and the cost per person per day; one bar, paid solid and
// estimates striped; and the lines with no price yet. The figures are worked
// out on the server (@camp404/core kitchen-costing); this only draws them.

const FIGURE_LABEL =
  "text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={FIGURE_LABEL}>{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

/** Stripes for the estimated part, in the accent colour. */
const STRIPES =
  "bg-[repeating-linear-gradient(135deg,var(--color-primary)_0_4px,transparent_4px_8px)]";

export function FoodCostBox({
  cost,
  budgetCents,
  budgetHref,
  perPersonDayCents,
  personDays,
  bar,
}: {
  cost: FoodCost;
  /** The Kitchen team's budget, or null when none is set. */
  budgetCents: number | null;
  budgetHref: string;
  perPersonDayCents: number | null;
  personDays: number;
  bar: CostBar | null;
}) {
  const left = budgetCents === null ? null : budgetCents - cost.totalCents;
  return (
    <section
      aria-label="Food cost"
      className="mb-4 border border-border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn(PIXEL_LABEL, "text-foreground")}>Food cost</h2>
        <span className="text-xs text-muted-foreground">
          Captains and Kitchen leads only
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 page-md:grid-cols-4">
        <Figure label="Food cost" value={formatMoney(cost.totalCents)}>
          {formatMoney(cost.paidCents)} paid
          <br />
          {formatMoney(cost.estimatedCents)} estimated
        </Figure>
        <Figure
          label="Kitchen budget"
          value={
            budgetCents === null
              ? "Not set"
              : formatMoney(budgetCents, "ZAR", { wholeRands: true })
          }
        >
          From{" "}
          <Link
            href={budgetHref}
            className="font-semibold text-primary hover:underline"
          >
            Budgets
          </Link>
        </Figure>
        <Figure label="Left" value={left === null ? "–" : formatMoney(left)}>
          After the food on the shopping list
        </Figure>
        <Figure
          label="Per person per day"
          value={
            perPersonDayCents === null ? "–" : formatMoney(perPersonDayCents)
          }
        >
          Over {personDays} person-day{personDays === 1 ? "" : "s"}
        </Figure>
      </div>
      {bar && (
        <>
          <div
            role="img"
            aria-label={`Food cost: ${bar.ofBudgetPercent}% of the budget`}
            className="relative mt-4 h-2 w-full bg-foreground/10"
          >
            <i
              className={cn("absolute inset-y-0 left-0", STRIPES)}
              style={{ width: `${bar.paidPercent + bar.estimatedPercent}%` }}
            />
            <i
              className="absolute inset-y-0 left-0 bg-primary"
              style={{ width: `${bar.paidPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="h-2.5 w-2.5 bg-primary" />
              Paid
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className={cn("h-2.5 w-2.5", STRIPES)} />
              Estimated
            </span>
            <span>{bar.ofBudgetPercent}% of the budget</span>
          </div>
        </>
      )}
      {cost.noPrice.length > 0 && (
        <p className="mt-2 text-[13px] text-warning">
          No price yet: {cost.noPrice.join(", ")}. The food cost is short by
          whatever they cost.
        </p>
      )}
    </section>
  );
}
