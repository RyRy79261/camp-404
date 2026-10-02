import Link from "next/link";
import type { DietaryCounts } from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";
import { PIXEL_LABEL } from "@/components/kitchen/labels";

// The counts box on the meal plan, for captains and Kitchen leads (the
// owner's Option A of design/kitchen-dietary.html, 2026-10-02): allergies,
// intolerances and preferences in three columns, from the dietary forms of
// the members coming this year. Counts only: the box is built from numbers
// worked out on the server and is never sent a name. "See who (recorded)"
// opens the daily site sheet, which names who has what and records the read.

const COLUMN =
  "text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function Column({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; count: number; note?: string }[];
}) {
  return (
    <div className="min-w-0">
      <h3 className={cn(COLUMN, "mb-1")}>{title}</h3>
      {rows.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-b-0"
            >
              <span>
                {r.label}
                {r.note && (
                  <span className="block text-xs font-semibold text-destructive">
                    {r.note}
                  </span>
                )}
              </span>
              <b className="tabular-nums">{r.count}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DietaryBox({
  counts,
  oldOnly,
  whoHref,
}: {
  counts: DietaryCounts;
  /** Members coming with only the old form's words: not counted. */
  oldOnly: number;
  whoHref: string;
}) {
  return (
    <section
      aria-label="Dietary"
      data-os-private
      className="mb-4 border border-border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className={cn(PIXEL_LABEL, "text-foreground")}>Dietary</h2>
        <span className="text-xs text-muted-foreground">
          From the dietary forms of the {counts.members} member
          {counts.members === 1 ? "" : "s"} coming this year. Counts only.
        </span>
        <Link
          href={whoHref}
          title="Opens the camp's allergy list. Your view is recorded."
          className="ml-auto text-xs font-semibold text-primary hover:underline"
        >
          See who (recorded)
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 page-md:grid-cols-3 page-md:gap-8">
        <Column
          title="Allergies"
          rows={counts.allergies.map((a) => ({
            key: a.food,
            label: a.label,
            count: a.count,
            note: a.anaphylactic ? `${a.anaphylactic} anaphylactic` : undefined,
          }))}
        />
        <Column
          title="Intolerances"
          rows={counts.intolerances.map((i) => ({
            key: i.food,
            label: i.label,
            count: i.count,
          }))}
        />
        <Column
          title="Preferences"
          rows={counts.preferences.map((p) => ({
            key: p.diet,
            label: p.label,
            count: p.count,
          }))}
        />
      </div>
      {oldOnly > 0 && (
        <p className="mt-3 text-xs text-warning">
          {oldOnly} member{oldOnly === 1 ? " has" : "s have"} only answered the
          old dietary form, so {oldOnly === 1 ? "is" : "are"} not counted here.
        </p>
      )}
    </section>
  );
}
