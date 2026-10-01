"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MealOfTheDay } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { toast } from "@camp404/ui/components/toast";
import { Spin, TickGlyph } from "@/components/kitchen/kit";
import { mealName } from "@/components/kitchen/labels";
import { recipePath, UNREACHABLE } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { proofreadPlatesAction } from "../recipes/actions";
import { removeMenuItemAction } from "./actions";
import { RecipePicker, type PickerRecipe } from "./recipe-picker";

// One meal of the meal plan for a Kitchen lead or a captain (the owner's
// approved mock-up, design/approved-kmp.html, Option A, 2026-10-01): the
// meal's plates, then each recipe on its own line with where its plate count
// stands in a fixed column, and "+ Add a recipe", which opens the recipe
// picker. A meal with no plates says so instead. On a phone the status sits
// under the recipe's name and the × stays on the right.
//
// Each change is a one-tap change: a refusal shows as a toast, and only the
// control used is busy.

/** A recipe on a meal, as the page read it for the meal's saved plates. */
export interface MenuLine {
  id: string;
  day: number;
  meal: MealOfTheDay;
  recipeId: string;
  title: string;
  /** The recipe's book version, or null when it has left the book. */
  versionId: string | null;
  /** A count for the meal's plates is there. */
  verified: boolean;
  /** Claude is working on that count. */
  withClaude: boolean;
}

const CHIP =
  "inline-flex h-7 items-center gap-2 justify-self-start px-2 text-xs font-semibold whitespace-nowrap";

function LineStatus({ line, plates }: { line: MenuLine; plates: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (line.verified) {
    return (
      <span className={cn(CHIP, "bg-success/15 text-success")}>
        <TickGlyph />
        Verified
      </span>
    );
  }
  if (line.withClaude || pending) {
    return (
      <span className={cn(CHIP, "bg-foreground/5 text-muted-foreground")}>
        <Spin />
        With Claude…
      </span>
    );
  }
  if (!line.versionId) {
    return (
      <span className={cn(CHIP, "bg-foreground/5 text-muted-foreground")}>
        Not in the book
      </span>
    );
  }
  const versionId = line.versionId;
  return (
    <button
      type="button"
      className={cn(
        CHIP,
        "border border-primary bg-transparent text-foreground hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
      onClick={() =>
        startTransition(async () => {
          let result: Awaited<ReturnType<typeof proofreadPlatesAction>>;
          try {
            result = await proofreadPlatesAction({
              recipeId: line.recipeId,
              versionId,
              plates,
              rerun: false,
            });
          } catch {
            toast.error(UNREACHABLE);
            return;
          }
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Claude is proofreading ${platesLabel(plates)}`);
          router.refresh();
        })
      }
    >
      Proofread for {platesLabel(plates)}
    </button>
  );
}

function RemoveButton({ line }: { line: MenuLine }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Take ${line.title} off ${mealName(line.day, line.meal)}`}
      disabled={pending}
      className="col-start-2 row-span-2 row-start-1 grid h-8 w-8 place-items-center self-center text-xl leading-none text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 page-md:col-start-3 page-md:row-span-1 page-md:h-7 page-md:w-7"
      onClick={() =>
        startTransition(async () => {
          let result: Awaited<ReturnType<typeof removeMenuItemAction>>;
          try {
            result = await removeMenuItemAction({ itemId: line.id });
          } catch {
            toast.error(UNREACHABLE);
            return;
          }
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {pending ? <Spin /> : <span aria-hidden>×</span>}
    </button>
  );
}

/**
 * One meal's recipes for an editor. `plates` is the meal's SAVED count: the
 * one a recipe is proofread for and the list reads. `platesControl` is the
 * plates box the editor draws above them.
 */
export function MenuCell({
  day,
  dayLabel,
  meal,
  plates,
  lines,
  allLines,
  book,
  platesControl,
}: {
  day: number;
  /** "Day 3 · Sat 24 Apr", for the picker's heading. */
  dayLabel: string;
  meal: MealOfTheDay;
  plates: number;
  lines: readonly MenuLine[];
  /** Every recipe on the menu, for the picker's "Also on". */
  allLines: readonly MenuLine[];
  book: readonly PickerRecipe[];
  platesControl: ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const row = "flex min-h-10 items-center border-t border-border/60";
  return (
    <>
      {platesControl}
      <ul
        aria-label={`Recipes for ${mealName(day, meal)}`}
        className="mt-2 flex flex-col"
      >
        {lines.map((line) => (
          <li
            key={line.id}
            className="grid min-h-10 grid-cols-[minmax(0,1fr)_32px] items-center gap-x-2 gap-y-1 border-t border-border/60 py-2 page-md:grid-cols-[minmax(0,1fr)_160px_28px] page-md:py-1"
          >
            <Link
              href={`${recipePath(line.recipeId)}?plates=${plates}`}
              className="col-start-1 row-start-1 min-w-0 break-words text-sm font-medium leading-5 hover:text-primary hover:underline"
            >
              {line.title}
            </Link>
            <span className="col-start-1 row-start-2 page-md:col-start-2 page-md:row-start-1">
              {plates > 0 ? <LineStatus line={line} plates={plates} /> : null}
            </span>
            <RemoveButton line={line} />
          </li>
        ))}
        {plates > 0 ? (
          <li className={row}>
            <button
              type="button"
              aria-label={`Add a recipe to ${mealName(day, meal)}`}
              className="h-7 text-[13px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() => setPicking(true)}
            >
              + Add a recipe
            </button>
          </li>
        ) : lines.length === 0 ? (
          <li className={cn(row, "text-[13px] text-muted-foreground")}>
            No {meal} this day. Set plates to add a recipe.
          </li>
        ) : null}
      </ul>
      {plates > 0 && (
        <RecipePicker
          open={picking}
          onOpenChange={setPicking}
          day={day}
          dayLabel={dayLabel}
          meal={meal}
          plates={plates}
          book={book}
          onMeal={lines}
          allLines={allLines}
        />
      )}
    </>
  );
}
