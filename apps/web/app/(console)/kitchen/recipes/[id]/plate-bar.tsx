"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { recipePath } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { proofreadPlatesAction } from "../actions";

// The plate counts a recipe in the book is shown at (the owner's sketch,
// 2026-09-24): one chip for each distinct count in this year's meal plan.
// Food does not scale by multiplying, so a count is either proofread by
// Claude and stored, or not yet:
//
//  - a count with a stored result is a LINK (?plates=N) with a tick: the
//    count lives in the page address, so it can be shared, and the server
//    draws it;
//  - a count Claude is still writing is shown dimmed, "with Claude";
//  - a count with no result is "N · Proofread for N", a button for a captain
//    or a Kitchen lead only (each run costs money; the owner's decision 2A).
//    Everyone else does not see it. The action and the write check the
//    reviewer and the count again, and a count with a result is never run
//    twice.
//
// A failed click says why in a toast, and only the chip that was pressed
// spins. A count asked for in the address that is not ready says where it
// stands under the chips.

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";
const CHIP_OFF =
  "border-border bg-background text-foreground hover:border-foreground/40";

/** What the page says about a count that is not ready. */
function statusFor(
  asked: number,
  open: readonly number[],
  failed: readonly { plates: number; error: string }[],
): string {
  if (open.includes(asked)) {
    return `Claude is proofreading ${platesLabel(asked)}. Reload in a minute.`;
  }
  const lastFailure = failed.find((f) => f.plates === asked);
  if (lastFailure) {
    return `The last run for ${platesLabel(asked)} failed: ${lastFailure.error}`;
  }
  return `Not proofread for ${platesLabel(asked)} yet.`;
}

export function PlateBar({
  recipeId,
  versionId,
  counts,
  ready,
  open,
  failed = [],
  shown,
  asked,
  canRun,
}: {
  recipeId: string;
  versionId: string;
  /** The distinct plate counts in this year's meal plan, smallest first. */
  counts: readonly number[];
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
  const [pressed, setPressed] = useState<number | null>(null);

  const href = (plates: number) => `${recipePath(recipeId)}?plates=${plates}`;

  function proofread(plates: number) {
    setPressed(plates);
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

  const chips = counts.flatMap((plates) => {
    if (ready.includes(plates)) {
      const selected = plates === shown;
      return [
        <Link
          key={plates}
          href={href(plates)}
          aria-current={selected ? "page" : undefined}
          aria-label={`${platesLabel(plates)}, proofread`}
          className={cn(CHIP, selected ? CHIP_ON : CHIP_OFF)}
        >
          {plates}
          <Check className="h-3.5 w-3.5" aria-hidden />
        </Link>,
      ];
    }
    if (open.includes(plates)) {
      return [
        <span
          key={plates}
          aria-disabled="true"
          className={cn(CHIP, "border-dashed text-muted-foreground")}
        >
          {plates} · with Claude
        </span>,
      ];
    }
    if (!canRun) return [];
    const spinning = pending && pressed === plates;
    return [
      <button
        key={plates}
        type="button"
        disabled={pending}
        onClick={() => proofread(plates)}
        className={cn(
          CHIP,
          "border-dashed border-accent/60 text-foreground hover:border-accent disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {plates} ·{" "}
        {spinning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        )}
        Proofread for {plates}
      </button>,
    ];
  });

  if (chips.length === 0 && asked === null) return null;

  return (
    <div
      data-plate-bar=""
      className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3.5 sm:px-4 sm:py-3.5"
    >
      {chips.length > 0 && (
        <nav
          aria-label="Plate count"
          className="flex min-w-0 flex-wrap items-center gap-2"
        >
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Plates
          </span>
          {chips}
        </nav>
      )}
      {asked !== null ? (
        <p role="status" className="text-sm text-foreground">
          {statusFor(asked, open, failed)}{" "}
          <span className="text-muted-foreground">
            Showing {platesLabel(shown)}.
          </span>
        </p>
      ) : null}
    </div>
  );
}
