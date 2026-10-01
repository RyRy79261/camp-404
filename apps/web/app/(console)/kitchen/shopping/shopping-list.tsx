"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import { UNREACHABLE } from "@/lib/recipe-copy";
import { setShoppingTicksAction } from "./actions";

// The shopping list's body (#245, the owner's layout A): a filter over the
// lines, then one card per shop area with "Tick all", each line with its
// tick, its name, its amount and, in a few words, where it comes from; the
// line opens to show each recipe and meal it adds up. Ticks are shared by the
// whole camp and any member may tick: a tick shows at once and is saved
// behind it; a refused one comes back unticked with a toast. A line ticked at
// another amount than the list needs now reads as not bought, and says what
// it was ticked at.

export interface ShoppingLineView {
  key: string;
  name: string;
  amount: string;
  /** "Day 1 dinner, Day 2 dinner" or "5 meals"; empty for a snack. */
  summary: string;
  sources: {
    meal: string;
    title: string;
    plates: string;
    amount: string;
    href: string;
  }[];
  ticked: boolean;
  /** The amount it was ticked at, when that is not what the list needs now. */
  tickedWhen: string | null;
}

export interface ShoppingGroupView {
  id: string;
  label: string;
  lines: ShoppingLineView[];
}

export function ShoppingListView({
  groups,
  canTick,
}: {
  groups: readonly ShoppingGroupView[];
  canTick: boolean;
}) {
  const [query, setQuery] = useState("");
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        lines: g.lines.filter((l) => l.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.lines.length > 0);
  }, [groups, query]);

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
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        aria-label="Filter the list"
        placeholder="Filter the list"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="page-sm:max-w-xs"
      />
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing matches.</p>
      )}
      {shown.map((group) => {
        const all = group.lines.every((l) => ticked[l.key]);
        const some = group.lines.some((l) => ticked[l.key]);
        const groupBusy = group.lines.some((l) => busy[l.key]);
        return (
          <section
            key={group.id}
            aria-labelledby={`group-${group.id}`}
            className="rounded-xl border bg-card text-card-foreground shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <h2 id={`group-${group.id}`} className="text-sm font-semibold">
                {group.label}
              </h2>
              {canTick && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    aria-label={`Tick all ${group.label}`}
                    checked={all ? true : some ? "indeterminate" : false}
                    disabled={groupBusy}
                    onCheckedChange={() => set(group.lines, !all)}
                  />
                  Tick all
                </label>
              )}
            </div>
            <ul className="divide-y">
              {group.lines.map((line) => {
                const done = Boolean(ticked[line.key]);
                return (
                  <li
                    key={line.key}
                    className="flex items-start gap-3 px-4 py-2.5 text-sm"
                  >
                    {canTick && (
                      <Checkbox
                        className="mt-0.5"
                        aria-label={line.name}
                        checked={done}
                        disabled={busy[line.key]}
                        onCheckedChange={(v) => set([line], v === true)}
                      />
                    )}
                    <LineBody line={line} done={done} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
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

function LineBody({ line, done }: { line: ShoppingLineView; done: boolean }) {
  const head = (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 page-md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
      <span
        className={
          done
            ? "break-words text-muted-foreground line-through"
            : "break-words"
        }
      >
        {line.name}
      </span>
      <span className="text-right tabular-nums page-md:text-left">
        {line.amount}
      </span>
      {line.summary && (
        <span className="col-span-2 text-xs text-muted-foreground page-md:col-span-1 page-md:text-sm">
          {line.summary}
          {line.sources.length > 0 && (
            <ChevronDown
              className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-open:rotate-180"
              aria-hidden
            />
          )}
        </span>
      )}
      {line.tickedWhen !== null && (
        <span className="col-span-2 text-xs text-muted-foreground page-md:col-span-3">
          Ticked when it was {line.tickedWhen || "no amount"}
        </span>
      )}
    </span>
  );
  if (line.sources.length === 0) {
    return <div className="min-w-0 flex-1">{head}</div>;
  }
  return (
    <details className="group min-w-0 flex-1">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {head}
      </summary>
      <ul
        aria-label={`Where the ${line.name} comes from`}
        className="mt-2 flex flex-col gap-1 border-l-2 pl-3 text-xs text-muted-foreground"
      >
        {line.sources.map((s, i) => (
          <li key={i} className="flex flex-wrap gap-x-2">
            <span>{s.meal}</span>
            <span>·</span>
            <Link href={s.href} className="text-foreground hover:underline">
              {s.title}
            </Link>
            <span>
              for {s.plates}: {s.amount}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
