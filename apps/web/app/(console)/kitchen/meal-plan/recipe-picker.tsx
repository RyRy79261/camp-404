"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Clock3 } from "lucide-react";
import type { MealOfTheDay } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { toast } from "@camp404/ui/components/toast";
import {
  FilterToggle,
  SearchField,
  Spin,
  TickGlyph,
  useWideScreen,
} from "@/components/kitchen/kit";
import {
  FIELD_LABEL,
  PINK_BUTTON,
  PIXEL_LABEL,
  QUIET_BUTTON,
  formatCookTime,
  mealName,
} from "@/components/kitchen/labels";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { addMenuItemAction } from "./actions";
import type { MenuLine } from "./menu-cell";

// The recipe picker (the owner's approved mock-up, design/approved-rp.html,
// Option B, 2026-10-01): a dialog over the meal plan with the recipe book as
// a table. A search box and a filter on whether each recipe is proofread for
// this meal's plates sit above it; each row has the recipe and its summary,
// where its count for these plates stands, its time, the other meals it is
// on, and "Add to dinner". It stays open, so one dinner can take several
// recipes (dal, rice, salad), and a recipe added turns into "On dinner" in
// the same box. "On dinner: …" and Done sit at the foot. On a phone it is a
// full sheet and each row is a card, the way ResponsiveDataTable draws them.
//
// Adding is a one-tap change: a refusal is a toast, and only that row's
// button spins.

/** A recipe in the book, as the picker shows it (MenuBookRecipe). */
export interface PickerRecipe {
  id: string;
  title: string;
  summary: string | null;
  totalMinutes: number | null;
  /** Every plate count its book version has. */
  readyPlates: number[];
  /** Counts Claude is working on. */
  openPlates: number[];
}

type Filter = "all" | "ready" | "not";

type Standing =
  | { kind: "ready" }
  | { kind: "open" }
  | { kind: "not"; done: number[] };

const STANDING_ORDER: Record<Standing["kind"], number> = {
  ready: 0,
  not: 1,
  open: 2,
};

function standingFor(recipe: PickerRecipe, plates: number): Standing {
  if (recipe.readyPlates.includes(plates)) return { kind: "ready" };
  if (recipe.openPlates.includes(plates)) return { kind: "open" };
  return { kind: "not", done: recipe.readyPlates };
}

/** "Done for 20, 40 only", or that no count is done yet. */
function notDoneNote(done: readonly number[]): string {
  return done.length === 0
    ? "No plate count yet"
    : `Done for ${done.join(", ")} only`;
}

function StandingLabel({
  standing,
  plates,
}: {
  standing: Standing;
  plates: number;
}) {
  const head =
    standing.kind === "ready" ? (
      <span className="inline-flex items-center gap-1 text-[13px] leading-5 font-semibold whitespace-nowrap text-success">
        <TickGlyph />
        Proofread
      </span>
    ) : standing.kind === "open" ? (
      <span className="inline-flex items-center gap-1 text-[13px] leading-5 font-semibold whitespace-nowrap text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Proofreading now
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[13px] leading-5 font-semibold whitespace-nowrap text-warning">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Not proofread
      </span>
    );
  const sub =
    standing.kind === "ready"
      ? "Ready to cook"
      : standing.kind === "open"
        ? `Claude is on it for ${plates}`
        : notDoneNote(standing.done);
  return (
    <>
      {head}
      <span className="block truncate pl-[18px] text-xs leading-4 text-muted-foreground">
        {sub}
      </span>
    </>
  );
}

/** The phone card's badge: the same standing, in a box. */
function StandingBadge({ standing }: { standing: Standing }) {
  const [label, tone] =
    standing.kind === "ready"
      ? ["Proofread", "text-success"]
      : standing.kind === "open"
        ? ["Proofreading", "text-muted-foreground"]
        : ["Not proofread", "text-warning"];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center border border-current px-2 text-[11px] font-semibold whitespace-nowrap",
        tone,
      )}
    >
      {label}
    </span>
  );
}

/** "On dinner": the exact box the add button had, so nothing moves. */
function OnMeal({ meal, tall }: { meal: MealOfTheDay; tall?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-28 items-center justify-center gap-1 border border-success/45 text-xs font-semibold whitespace-nowrap text-success",
        tall ? "h-10" : "h-8",
      )}
    >
      <TickGlyph />
      On {meal}
    </span>
  );
}

export function RecipePicker({
  open,
  onOpenChange,
  day,
  dayLabel,
  meal,
  plates,
  book,
  onMeal,
  allLines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: number;
  /** "Day 3 · Wed 28 Apr". */
  dayLabel: string;
  meal: MealOfTheDay;
  /** The meal's saved plates. */
  plates: number;
  book: readonly PickerRecipe[];
  /** The recipes on this meal now. */
  onMeal: readonly MenuLine[];
  /** Every recipe on the menu, for "Also on". */
  allLines: readonly MenuLine[];
}) {
  const router = useRouter();
  const wide = useWideScreen();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  // Added here and not yet back from the refresh.
  const [added, setAdded] = useState<string[]>([]);
  const name = mealName(day, meal);

  const taken = useMemo(
    () => new Set([...onMeal.map((l) => l.recipeId), ...added]),
    [onMeal, added],
  );
  // Proofread for these plates first, then not proofread, then the ones
  // Claude is on now, each by name (the mock-up's order).
  const rows = useMemo(
    () =>
      book
        .map((recipe) => {
          const elsewhere = allLines.filter(
            (l) =>
              l.recipeId === recipe.id && !(l.day === day && l.meal === meal),
          );
          return {
            recipe,
            standing: standingFor(recipe, plates),
            alsoOn: elsewhere.map((l) => mealName(l.day, l.meal)),
          };
        })
        .sort(
          (a, b) =>
            STANDING_ORDER[a.standing.kind] - STANDING_ORDER[b.standing.kind] ||
            a.recipe.title.localeCompare(b.recipe.title),
        ),
    [book, allLines, day, meal, plates],
  );
  const counts = {
    all: rows.length,
    ready: rows.filter((r) => r.standing.kind === "ready").length,
    not: rows.filter((r) => r.standing.kind !== "ready").length,
  };
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" ||
          (filter === "ready") === (r.standing.kind === "ready")) &&
        (!q || r.recipe.title.toLowerCase().includes(q)),
    );
  }, [rows, query, filter]);
  const activeIndex = Math.min(active, Math.max(0, shown.length - 1));
  const onNames = [
    ...onMeal.map((l) => l.title),
    ...book
      .filter(
        (r) => added.includes(r.id) && !onMeal.some((l) => l.recipeId === r.id),
      )
      .map((r) => r.title),
  ];

  async function add(recipe: PickerRecipe) {
    if (taken.has(recipe.id) || adding) return;
    setAdding(recipe.id);
    let result: Awaited<ReturnType<typeof addMenuItemAction>>;
    try {
      result = await addMenuItemAction({ day, meal, recipeId: recipe.id });
    } catch {
      toast.error(UNREACHABLE);
      return;
    } finally {
      setAdding(null);
    }
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setAdded((a) => [...a, recipe.id]);
    router.refresh();
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = shown[activeIndex];
      if (row) void add(row.recipe);
    }
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setQuery("");
      setFilter("all");
      setActive(0);
      setAdded([]);
    }
  }

  const action = (recipe: PickerRecipe, tall?: boolean) =>
    taken.has(recipe.id) ? (
      <OnMeal meal={meal} tall={tall} />
    ) : (
      <button
        type="button"
        aria-label={`Add ${recipe.title} to ${name}`}
        disabled={adding !== null}
        className={cn(PINK_BUTTON, tall && "h-10")}
        onClick={() => add(recipe)}
      >
        {adding === recipe.id ? <Spin /> : `Add to ${meal}`}
      </button>
    );

  const empty = (
    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
      {book.length === 0
        ? "The recipe book is empty."
        : "No recipe in the book matches."}
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={cn(
          // The window's own colours, not the desktop's: it is the meal
          // plan's dialog (the mock-up draws it in the window's charcoal).
          "os-window-colours flex flex-col gap-4 border-input bg-background p-0 sm:max-w-[880px] sm:p-6",
          // A phone: a full sheet.
          "max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:gap-0 max-sm:border-0",
          "sm:max-h-[calc(100dvh-4rem)]",
        )}
      >
        <div className="pr-10 max-sm:px-4 max-sm:pt-4 max-sm:pb-3">
          <DialogTitle className="px-0 font-sans! text-lg leading-6 font-bold! tracking-normal! normal-case! max-sm:text-base sm:pl-0">
            Add recipes to {meal}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-5">
            {dayLabel} · {platesLabel(plates)}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3 max-sm:px-4 max-sm:pb-4 sm:flex-row sm:items-end sm:gap-4">
          <label className="flex min-w-0 flex-col gap-2 sm:flex-1">
            <span className={cn(FIELD_LABEL, "max-sm:sr-only")}>Search</span>
            <SearchField
              label="Search the recipe book"
              placeholder={
                wide ? "Recipe name" : `Search ${book.length} recipes by name`
              }
              value={query}
              onChange={(v) => {
                setQuery(v);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className={FIELD_LABEL}>For {platesLabel(plates)}</span>
            <FilterToggle
              label={`Filter by proofreading for ${platesLabel(plates)}`}
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setActive(0);
              }}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "ready", label: "Proofread", count: counts.ready },
                { value: "not", label: "Not proofread", count: counts.not },
              ]}
            />
          </div>
        </div>

        {wide ? (
          <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-card">
            {shown.length === 0 ? (
              empty
            ) : (
              <table
                aria-label={`The recipe book, for ${name}`}
                className="w-full table-fixed border-collapse text-sm leading-5"
              >
                <colgroup>
                  <col />
                  <col className="w-[172px]" />
                  <col className="w-[76px]" />
                  <col className="w-[148px]" />
                  <col className="w-[136px]" />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      "Recipe",
                      `For ${platesLabel(plates)}`,
                      "Time",
                      "Also on",
                    ].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={cn(
                          PIXEL_LABEL,
                          "h-10 border-b border-border px-3 text-left",
                          i === 2 && "text-right",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="border-b border-border">
                      <span className="sr-only">Add</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row, i) => {
                    const time = formatCookTime(row.recipe.totalMinutes);
                    return (
                      <tr
                        key={row.recipe.id}
                        aria-current={i === activeIndex ? "true" : undefined}
                        onMouseEnter={() => setActive(i)}
                        className={cn(
                          "border-t border-border first:border-t-0",
                          i === activeIndex &&
                            "bg-secondary/60 [&>td:first-child]:shadow-[inset_2px_0_0_var(--color-primary)]",
                        )}
                      >
                        <td className="p-3">
                          <div className="truncate font-semibold">
                            {row.recipe.title}
                          </div>
                          {row.recipe.summary && (
                            <div className="truncate text-xs leading-4 text-muted-foreground">
                              {row.recipe.summary}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <StandingLabel
                            standing={row.standing}
                            plates={plates}
                          />
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {time ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="truncate p-3">
                          {row.alsoOn.length > 0 ? (
                            <span title={row.alsoOn.join("; ")}>
                              {row.alsoOn[0]}
                              {row.alsoOn.length > 1 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  +{row.alsoOn.length - 1}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right">{action(row.recipe)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <ul
            aria-label={`The recipe book, for ${name}`}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4"
          >
            {shown.length === 0 && <li>{empty}</li>}
            {shown.map((row) => {
              const time = formatCookTime(row.recipe.totalMinutes);
              const dl = [
                ["Time", time ?? "—"],
                [
                  "Proofread for",
                  row.standing.kind === "ready"
                    ? platesLabel(plates)
                    : row.standing.kind === "open"
                      ? `Claude is on ${plates}`
                      : notDoneNote(row.standing.done),
                ],
                ["Also on", row.alsoOn.join("; ") || "—"],
              ] as const;
              return (
                <li
                  key={row.recipe.id}
                  className="flex flex-col gap-3 border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] leading-5 font-semibold">
                        {row.recipe.title}
                      </div>
                      {row.recipe.summary && (
                        <div className="mt-1 text-xs leading-4 text-muted-foreground">
                          {row.recipe.summary}
                        </div>
                      )}
                    </div>
                    <StandingBadge standing={row.standing} />
                  </div>
                  <dl className="m-0 flex flex-col gap-2">
                    {dl.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <dt className={FIELD_LABEL}>{k}</dt>
                        <dd className="m-0 text-right text-[13px] leading-5 tabular-nums">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex border-t border-border pt-3">
                    {action(row.recipe, true)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-4 text-sm leading-5 max-sm:border-t max-sm:border-border max-sm:bg-card max-sm:px-4 max-sm:py-3">
          <p className="m-0 min-w-0" aria-live="polite">
            <span className="text-muted-foreground">On {meal}: </span>
            <b className="font-semibold">
              {onNames.length > 0 ? onNames.join(", ") : "nothing yet"}
            </b>
          </p>
          <span className="flex shrink-0 items-center gap-6">
            {wide && (
              <span
                aria-hidden
                className="inline-flex items-center gap-4 text-xs text-muted-foreground"
              >
                <span className="inline-flex items-center gap-1">
                  <kbd className={KBD}>↑</kbd>
                  <kbd className={KBD}>↓</kbd>
                  move
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className={KBD}>Enter</kbd>
                  add
                </span>
              </span>
            )}
            <button
              type="button"
              className={cn(QUIET_BUTTON, "h-10 w-24 bg-transparent")}
              onClick={() => close(false)}
            >
              Done
            </button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const KBD =
  "inline-flex h-5 min-w-5 items-center justify-center border border-input px-1 font-sans text-[11px] font-semibold text-foreground";
