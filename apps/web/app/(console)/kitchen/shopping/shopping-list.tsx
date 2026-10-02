"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import { toast } from "@camp404/ui/components/toast";
import { FilterToggle, SearchField, TickGlyph } from "@/components/kitchen/kit";
import { FIELD_LABEL, QUIET_BUTTON } from "@/components/kitchen/labels";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { setShoppingTicksAction } from "./actions";
import { PriceEditor, PriceLine, type LinePrice } from "./price-editor";

// The shopping list's body (the owner's approved mock-up,
// design/approved-ks.html, Option A, 2026-10-01): one checklist with every
// shop area on one page. "Not counted yet" sits on top, then a filter by
// name and All / To buy / Bought, then a card per shop area with how much of
// it is bought and "Tick all" at the right of its heading. A tap anywhere on
// a line ticks it; the arrow at the far right opens where its amount comes
// from, each meal's amount lined up under the total.
//
// Ticks are shared by the whole camp and any member may tick: a tick shows
// at once and is saved behind it; a refused one comes back unticked with a
// toast. A line ticked at another amount than the list needs now reads as not
// bought, and says what it was ticked at.
//
// A captain or a Kitchen lead also sees each line's shop and price, in a grey
// line under its name, and edits them in the line's open panel (#245, the
// owner's Option A, 2026-10-02; price-editor.tsx). Every other member gets
// the list as it was: their lines carry no price at all.

export interface ShoppingSourceView {
  /** "Day 1 · Mon 26 Apr, dinner". */
  meal: string;
  title: string;
  /** "42 plates". */
  plates: string;
  amount: string;
  href: string;
}

export interface ShoppingLineView {
  key: string;
  name: string;
  amount: string;
  /** Each recipe and meal it adds up; empty for a snack. */
  sources: ShoppingSourceView[];
  ticked: boolean;
  /** The amount it was ticked at, when that is not what the list needs now. */
  tickedWhen: string | null;
  /** Its shop and price: only ever sent to a captain or a Kitchen lead. */
  price?: LinePrice;
}

export interface ShoppingGroupView {
  id: string;
  label: string;
  lines: ShoppingLineView[];
}

export interface NotCountedView {
  key: string;
  title: string;
  /** "Day 4 · Thu 29 Apr, dinner · 42 plates". */
  meta: string;
  href: string;
}

type Show = "all" | "todo" | "done";

/** The note on top: recipes the list cannot count yet. Open on a phone by tap. */
export function NotCountedBox({ items }: { items: readonly NotCountedView[] }) {
  const [open, setOpen] = useState(false);
  const many = `${items.length} recipe${items.length === 1 ? "" : "s"} not counted yet`;
  return (
    <section
      aria-label="Not counted yet: proofread first"
      className="mb-4 border border-warning/40 bg-warning/10 text-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="not-counted-list"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[16px_minmax(0,1fr)_16px] items-start gap-3 px-4 py-3 text-left page-md:hidden"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
        <span>
          <b className="block font-semibold">{many}</b>
          <span className="mt-1 block text-[13px] text-muted-foreground">
            Proofread them first: until then they add nothing to the list.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <div className="hidden grid-cols-[16px_minmax(0,1fr)] gap-3 px-4 pt-3 page-md:grid">
        <TriangleAlert className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
        <div>
          <h2 className="font-sans! text-sm font-semibold! tracking-normal! normal-case!">
            Not counted yet: proofread first
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            These recipes add nothing to the list until their plate count is
            proofread.
          </p>
        </div>
      </div>
      <ul
        id="not-counted-list"
        className={cn(
          "m-0 list-none px-4 pb-1 page-md:block page-md:pt-2 page-md:pr-4 page-md:pl-11",
          open ? "block" : "hidden",
        )}
      >
        {items.map((item) => (
          <li
            key={item.key}
            className="flex items-center justify-between gap-3 border-t border-warning/20 py-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.meta}</span>
            </span>
            <Link
              href={item.href}
              aria-label={`Open ${item.title}`}
              className="shrink-0 text-[13px] font-semibold text-primary hover:underline"
            >
              Open recipe
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShoppingListView({
  groups,
  canTick,
  above,
}: {
  groups: readonly ShoppingGroupView[];
  canTick: boolean;
  /** Drawn between the notes on top and the filter (the food cost box). */
  above?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>(() =>
    ticksOf(groups),
  );
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // A refreshed list (after any tick or menu change, here or by someone
  // else) is the truth: its ticks replace the ones shown, except a line
  // whose own tick is still being saved.
  const [seen, setSeen] = useState(groups);
  if (seen !== groups) {
    setSeen(groups);
    const fresh = ticksOf(groups);
    setTicked((t) => {
      for (const key of Object.keys(busy)) {
        if (busy[key] && key in t) fresh[key] = t[key]!;
      }
      return fresh;
    });
  }

  const allLines = groups.flatMap((g) => g.lines);
  const bought = allLines.filter((l) => ticked[l.key]).length;
  const counts = {
    all: allLines.length,
    todo: allLines.length - bought,
    done: bought,
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        group: g,
        lines: g.lines.filter(
          (l) =>
            (!q || l.name.toLowerCase().includes(q)) &&
            (show === "all" || (show === "done") === Boolean(ticked[l.key])),
        ),
      }))
      .filter((g) => g.lines.length > 0);
  }, [groups, query, show, ticked]);

  async function set(lines: readonly ShoppingLineView[], value: boolean) {
    const keys = lines.map((l) => l.key);
    const before = Object.fromEntries(keys.map((k) => [k, ticked[k] ?? false]));
    setTicked((t) => ({
      ...t,
      ...Object.fromEntries(keys.map((k) => [k, value])),
    }));
    setBusy((b) => ({
      ...b,
      ...Object.fromEntries(keys.map((k) => [k, true])),
    }));
    let error: string | null = null;
    try {
      const result = await setShoppingTicksAction({
        lines: lines.map((l) => ({ key: l.key, amount: l.amount })),
        ticked: value,
      });
      if (!result.ok) error = result.error;
    } catch {
      error = UNREACHABLE;
    }
    if (error) {
      setTicked((t) => ({ ...t, ...before }));
      toast.error(error);
    }
    setBusy((b) => ({
      ...b,
      ...Object.fromEntries(keys.map((k) => [k, false])),
    }));
  }

  return (
    <div className="flex flex-col">
      {above}
      <div className="mb-4 flex flex-col gap-3 page-md:flex-row page-md:items-end page-md:gap-4">
        <label className="flex min-w-0 flex-col gap-1.5 page-md:w-80">
          <span className={FIELD_LABEL}>Filter</span>
          <SearchField
            className="bg-[var(--color-choice,var(--color-background))]"
            label="Filter the list"
            placeholder="Ingredient name"
            value={query}
            onChange={setQuery}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Show</span>
          <FilterToggle
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "todo", label: "To buy", count: counts.todo },
              { value: "done", label: "Bought", count: counts.done },
            ]}
          />
        </div>
      </div>

      {shown.length === 0 && (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nothing matches.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {shown.map(({ group, lines }) => {
          const done = group.lines.filter((l) => ticked[l.key]).length;
          const all = done === group.lines.length;
          const groupBusy = group.lines.some((l) => busy[l.key]);
          return (
            <section
              key={group.id}
              aria-labelledby={`group-${group.id}`}
              className="border border-border bg-card"
            >
              {/* On a phone the area's heading stays at the top while its
                  lines scroll under it (the mock-up's phone). */}
              <div className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-border bg-card px-4 py-2 page-md:static">
                <h2
                  id={`group-${group.id}`}
                  className="text-[11px] tracking-[0.2em] uppercase"
                >
                  {group.label}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {done} of {group.lines.length} bought
                </span>
                {canTick && (
                  <button
                    type="button"
                    disabled={groupBusy}
                    aria-label={
                      all
                        ? `Untick all ${group.label}`
                        : `Tick all ${group.label}`
                    }
                    className={cn(QUIET_BUTTON, "ml-auto")}
                    onClick={() => set(group.lines, !all)}
                  >
                    {all ? "Untick all" : `Tick all ${group.lines.length}`}
                  </button>
                )}
              </div>
              <ul className="m-0 list-none p-0">
                {lines.map((line) => (
                  <Line
                    key={line.key}
                    line={line}
                    done={Boolean(ticked[line.key])}
                    busy={Boolean(busy[line.key])}
                    canTick={canTick}
                    open={Boolean(openKeys[line.key])}
                    onOpen={(o) =>
                      setOpenKeys((k) => ({ ...k, [line.key]: o }))
                    }
                    onTick={(v) => set([line], v)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ticksOf(
  groups: readonly ShoppingGroupView[],
): Record<string, boolean> {
  return Object.fromEntries(
    groups.flatMap((g) => g.lines.map((l) => [l.key, l.ticked])),
  );
}

/** The amount column: the same width on a line and under it. */
const AMOUNT = "w-20 page-md:w-28 shrink-0 text-right tabular-nums";

function Line({
  line,
  done,
  busy,
  canTick,
  open,
  onOpen,
  onTick,
}: {
  line: ShoppingLineView;
  done: boolean;
  busy: boolean;
  canTick: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onTick: (value: boolean) => void;
}) {
  const sourcesId = `sources-${line.key.replace(/[^a-z0-9]+/gi, "-")}`;
  const [price, setPrice] = useState(line.price);
  const [seenPrice, setSeenPrice] = useState(line.price);
  if (seenPrice !== line.price) {
    // A refreshed list is the truth for the grey line.
    setSeenPrice(line.price);
    setPrice(line.price);
  }
  const opens = line.sources.length > 0 || price !== undefined;
  const name = (
    <span className="min-w-0 text-[15px] leading-snug font-medium page-md:text-sm">
      <span className={cn(done && "text-muted-foreground line-through")}>
        {line.name}
      </span>
      {line.tickedWhen !== null && (
        <span className="mt-1 block text-xs font-medium text-warning">
          Ticked when it was {line.tickedWhen || "no amount"}.
          {line.amount ? ` The list now needs ${line.amount}.` : ""}
        </span>
      )}
      {price && <PriceLine price={price} />}
    </span>
  );
  const amount = (
    <span
      className={cn(
        AMOUNT,
        "text-[15px] whitespace-nowrap page-md:text-sm",
        done ? "font-medium text-muted-foreground" : "font-bold",
      )}
    >
      {line.amount}
    </span>
  );
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_48px] border-t border-border first:border-t-0 page-md:grid-cols-[minmax(0,1fr)_40px]">
      {canTick ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={line.amount ? `${line.name}, ${line.amount}` : line.name}
          disabled={busy}
          onClick={() => onTick(!done)}
          className="grid min-h-14 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 py-3 pl-4 text-left hover:bg-foreground/[0.04] disabled:cursor-progress page-md:min-h-12 page-md:grid-cols-[20px_minmax(0,1fr)_auto]"
        >
          <span
            aria-hidden
            className={cn(
              "grid h-6 w-6 place-items-center border-2 page-md:h-5 page-md:w-5",
              done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground",
            )}
          >
            {done && <TickGlyph className="h-3.5 w-3.5" />}
          </span>
          {name}
          {amount}
        </button>
      ) : (
        <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 pl-4">
          {name}
          {amount}
        </div>
      )}
      {opens ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={sourcesId}
          aria-label={
            price
              ? `Shop, price and where it comes from: ${line.name}`
              : `Where the ${line.name} comes from`
          }
          onClick={() => onOpen(!open)}
          className={cn(
            "grid place-items-center text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
            open && "text-primary",
          )}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      ) : (
        <span aria-hidden />
      )}
      {opens && open && (
        <div
          id={sourcesId}
          className="col-span-2 mr-12 mb-3 ml-4 border-l-2 border-input pl-3 page-md:mr-10 page-md:ml-12"
        >
          {price && (
            <PriceEditor
              lineKey={line.key}
              name={line.name}
              price={price}
              onSaved={setPrice}
            />
          )}
          {line.sources.length === 0 ? (
            <p className="py-1 text-[13px] text-muted-foreground">
              A snack: it is on the list as it is, not from a recipe.
            </p>
          ) : (
            <>
              <span className={cn(FIELD_LABEL, "block pb-1")}>Comes from</span>
              <ul
                aria-label={`Where the ${line.name} comes from`}
                className="m-0 list-none p-0"
              >
                {line.sources.map((s, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-t border-border py-2 text-[13px]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={s.href}
                        className="font-semibold hover:text-primary hover:underline"
                      >
                        {s.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {s.meal}
                        <span className="hidden page-md:inline"> · </span>
                        <span className="block page-md:inline">{s.plates}</span>
                      </span>
                    </span>
                    <span className={cn(AMOUNT, "font-medium")}>
                      {s.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}
