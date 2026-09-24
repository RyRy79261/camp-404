"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import { recipePath } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { MAX_PLATES } from "@camp404/types";
import { proofreadPlatesAction } from "../actions";

// The plate count a recipe in the book is shown at (the owner, 2026-09-24:
// "Have there be a selector for the number of meals, present a button if it
// needs to be proof read, present an indicator if its already verified"; then
// "a number input would be better" than a dropdown). One row: "Plates", a
// number box, and beside it one of four things for the count typed:
//
//  - a stored result: "Verified", an indicator, not a control;
//  - Claude is still writing it: "With Claude…";
//  - no result, for a captain or a Kitchen lead: "Proofread for N plates"
//    (each run costs money; the owner's decision 2A). The action and the
//    write check the reviewer and the count again, and a count with a result
//    is never run twice;
//  - no result, for anyone else: "Not proofread yet".
//
// Typing a count goes to ?plates=N: the count lives in the page address, so it
// can be shared, and the server draws it. Food does
// not scale by multiplying, so a count is proofread by Claude for the SAME
// version (its result is stored against the version) and never makes a new
// one. A failed click says why in a toast. A count asked for in the address
// that is not ready says where it stands under the row.

/**
 * Why a count that is not ready has no result, when the row beside the
 * selector cannot say it: only a failed run. "Not proofread yet" and "With
 * Claude…" already sit beside the selector, so they are not repeated here.
 */
function failureFor(
  asked: number,
  open: readonly number[],
  failed: readonly { plates: number; error: string }[],
): string | null {
  if (open.includes(asked)) return null;
  const lastFailure = failed.find((f) => f.plates === asked);
  return lastFailure
    ? `The last run for ${platesLabel(asked)} failed: ${lastFailure.error}`
    : null;
}

export function PlateBar({
  recipeId,
  versionId,
  ready,
  open,
  failed = [],
  shown,
  asked,
  canRun,
}: {
  recipeId: string;
  versionId: string;
  /** Every count the version has a result for. */
  ready: readonly number[];
  /** Counts Claude is still working on. */
  open: readonly number[];
  /** Counts whose newest run failed and that have no result: why. */
  failed?: readonly { plates: number; error: string }[];
  /** The count the page shows. */
  shown: number;
  /** A count asked for in the address that is not ready, or null. */
  asked: number | null;
  /** A captain or a Kitchen lead, who may ask Claude for a count. */
  canRun: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(String(asked ?? shown));
  const typed = Number(draft);
  // A whole count the server accepts, or null while the box holds anything else.
  const chosen =
    Number.isInteger(typed) && typed >= 1 && typed <= MAX_PLATES ? typed : null;

  const href = (plates: number) => `${recipePath(recipeId)}?plates=${plates}`;

  // The count lives in the page address, so the server draws that count.
  // Typing waits a moment before it moves, so "45" does not stop at "4".
  useEffect(() => {
    if (chosen === null || chosen === (asked ?? shown)) return;
    const timer = setTimeout(() => router.replace(href(chosen)), 400);
    return () => clearTimeout(timer);
  }, [chosen]);

  function proofread(plates: number) {
    startTransition(async () => {
      const result = await proofreadPlatesAction({
        recipeId,
        versionId,
        plates,
        rerun: false,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Claude is proofreading ${platesLabel(plates)}`);
      router.push(href(plates));
    });
  }

  let state: React.ReactNode;
  if (chosen === null) {
    state = (
      <span className="text-sm text-muted-foreground">
        Type 1 to {MAX_PLATES}
      </span>
    );
  } else if (ready.includes(chosen)) {
    state = (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <Check className="h-4 w-4" aria-hidden />
        Verified
      </span>
    );
  } else if (open.includes(chosen)) {
    state = (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        With Claude…
      </span>
    );
  } else if (canRun) {
    state = (
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => proofread(chosen)}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Sparkles aria-hidden />
        )}
        Proofread for {platesLabel(chosen)}
      </Button>
    );
  } else {
    state = (
      <span className="text-sm text-muted-foreground">Not proofread yet</span>
    );
  }

  const failure = asked === null ? null : failureFor(asked, open, failed);

  return (
    <div
      data-plate-bar=""
      className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3.5 sm:px-4 sm:py-3.5"
    >
      <nav
        aria-label="Plate count"
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2"
      >
        <label
          htmlFor="plate-count"
          className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
        >
          Plates
        </label>
        <Input
          id="plate-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PLATES}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-24 tabular-nums"
        />
        {state}
      </nav>
      {asked !== null ? (
        <p role="status" className="text-sm text-foreground">
          {failure ? `${failure} ` : null}
          <span className="text-muted-foreground">
            Showing {platesLabel(shown)}.
          </span>
        </p>
      ) : null}
    </div>
  );
}
