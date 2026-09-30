"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";
import type { MealOfTheDay } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import { recipePath, UNREACHABLE } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { proofreadPlatesAction } from "../recipes/actions";
import { addMenuItemAction, removeMenuItemAction } from "./actions";

// The recipes on one meal of the meal plan (#244, the owner's layout A,
// 2026-09-30): each on its own line, under the meal's plates, with where its
// plate count stands. The same one-count pattern the owner approved for the
// recipe page: "Verified" when Claude has proofread the recipe for the meal's
// plates, "With Claude…" while it does, and otherwise "Proofread for N" for a
// captain or a Kitchen lead (each run costs money) or "Not proofread yet" for
// everyone else. The shopping list reads only verified counts.
//
// A captain or a Kitchen lead adds a recipe with "+ Add a recipe", which opens
// a picker over the recipe book, and takes one off with its ×. Each is a
// one-tap change: a refusal shows as a toast, and only the control used spins.

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

/** A recipe in the book, for the picker. */
export interface BookRecipe {
  id: string;
  title: string;
}

const MEAL_WORD: Record<MealOfTheDay, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
};

/**
 * "Day 1, dinner": how the menu's controls name a meal. The comma keeps the
 * name apart from the plates box's own label ("Day 1 dinner").
 */
function mealName(day: number, meal: MealOfTheDay): string {
  return `Day ${day}, ${MEAL_WORD[meal]}`;
}

function LineStatus({
  line,
  plates,
  canEdit,
}: {
  line: MenuLine;
  plates: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (line.verified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Verified
      </span>
    );
  }
  if (line.withClaude) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        With Claude…
      </span>
    );
  }
  if (!canEdit || !line.versionId) {
    return (
      <span className="text-xs text-muted-foreground">Not proofread yet</span>
    );
  }
  const versionId = line.versionId;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      disabled={pending}
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
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Sparkles aria-hidden />
      )}
      Proofread for {plates}
    </Button>
  );
}

function RemoveButton({ line }: { line: MenuLine }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-my-1 h-8 w-8 shrink-0 text-muted-foreground"
      aria-label={`Take ${line.title} off ${mealName(line.day, line.meal)}`}
      disabled={pending}
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
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <X className="h-3.5 w-3.5" aria-hidden />
      )}
    </Button>
  );
}

function RecipePicker({
  open,
  onOpenChange,
  day,
  meal,
  plates,
  book,
  taken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: number;
  meal: MealOfTheDay;
  plates: number;
  book: readonly BookRecipe[];
  taken: readonly string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return book.filter(
      (r) => !taken.includes(r.id) && (!q || r.title.toLowerCase().includes(q)),
    );
  }, [book, taken, query]);
  const name = mealName(day, meal);

  async function add(recipe: BookRecipe) {
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
    toast.success(`${recipe.title} is on ${name}`);
    onOpenChange(false);
    setQuery("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a recipe to {name}</DialogTitle>
          <DialogDescription>{platesLabel(plates)}</DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          aria-label="Search the recipe book"
          placeholder="Search the recipe book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {book.length === 0
              ? "The recipe book is empty. A recipe shows here once it is in the book."
              : "No recipe in the book matches."}
          </p>
        ) : (
          <ul
            aria-label="Recipe book"
            className="-mx-2 flex max-h-72 flex-col overflow-y-auto"
          >
            {shown.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => add(recipe)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
                >
                  <span className="min-w-0 break-words">{recipe.title}</span>
                  {adding === recipe.id ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One meal's recipes, and for an editor "+ Add a recipe" when the meal has
 * plates saved. `plates` is the meal's SAVED count: the one a recipe is
 * proofread for and the list reads.
 */
export function MenuCell({
  day,
  meal,
  plates,
  lines,
  book,
  canEdit,
}: {
  day: number;
  meal: MealOfTheDay;
  plates: number;
  lines: readonly MenuLine[];
  book: readonly BookRecipe[];
  canEdit: boolean;
}) {
  const [picking, setPicking] = useState(false);
  if (lines.length === 0 && (!canEdit || plates <= 0)) return null;
  return (
    <div className="mt-2 flex flex-col gap-2 pl-[5.75rem] page-md:pl-0">
      {lines.length > 0 && (
        <ul
          aria-label={`Recipes for ${mealName(day, meal)}`}
          className="flex flex-col gap-2"
        >
          {lines.map((line) => (
            <li key={line.id} className="flex flex-col items-start gap-0.5">
              <span className="flex w-full items-start justify-between gap-1">
                <Link
                  href={`${recipePath(line.recipeId)}?plates=${plates}`}
                  className="min-w-0 break-words font-medium leading-snug hover:underline"
                >
                  {line.title}
                </Link>
                {canEdit && <RemoveButton line={line} />}
              </span>
              {plates > 0 && (
                <LineStatus line={line} plates={plates} canEdit={canEdit} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && plates > 0 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 self-start px-1.5 text-xs text-muted-foreground"
            aria-label={`Add a recipe to ${mealName(day, meal)}`}
            onClick={() => setPicking(true)}
          >
            <Plus aria-hidden />
            Add a recipe
          </Button>
          <RecipePicker
            open={picking}
            onOpenChange={setPicking}
            day={day}
            meal={meal}
            plates={plates}
            book={book}
            taken={lines.map((l) => l.recipeId)}
          />
        </>
      )}
    </div>
  );
}
