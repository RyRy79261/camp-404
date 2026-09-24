"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { MAX_PLATES } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { Input } from "@camp404/ui/components/input";
import { SegmentedLinks } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import { recipePath } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { proofreadPlatesAction } from "../actions";

// The plate count a recipe is shown at (#243): Noble Notations' control bar
// (the muted band above the recipe with its "For" label and presets),
// restyled with Camp 404's tokens. Food does not scale by multiplying, so the
// presets are the counts Claude has already proofread for this version, each
// a LINK (?plates=N): the count lives in the page address, so it can be
// shared, and the server draws it. A count still with Claude is shown, but
// cannot be picked yet.
//
// A captain or a Kitchen lead may ask for another count (each run costs
// money, so nobody else can; the owner's decision 2A). A count that is
// already ready only navigates: the stored answer is read, never paid for
// twice. The action and the write check the reviewer, the silent daily cap and
// the count again; no run counter is shown.

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
  basePlates,
  ready,
  proofread,
  open,
  failed = [],
  shown,
  asked,
  canRun,
}: {
  recipeId: string;
  versionId: string;
  /** The plates the version is written for. */
  basePlates: number;
  /** Every count with a result, smallest first; the base among them. */
  ready: readonly number[];
  /** The counts Claude wrote (not the version's own), which may be re-run. */
  proofread: readonly number[];
  /** Counts Claude is still working on. */
  open: readonly number[];
  /** Counts whose newest run failed and that have no result: why. */
  failed?: readonly { plates: number; error: string }[];
  /** The count the page shows. */
  shown: number;
  /** A count asked for in the address that is not ready, or null. */
  asked: number | null;
  /** A captain or a Kitchen lead, who may ask Claude for another count. */
  canRun: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(asked === null ? "" : String(asked));
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const href = (plates: number) => `${recipePath(recipeId)}?plates=${plates}`;
  const typed = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isInteger(typed) &&
    typed >= 1 &&
    typed <= MAX_PLATES;

  function run(plates: number, rerun: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await proofreadPlatesAction({
        recipeId,
        versionId,
        plates,
        rerun,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Claude is proofreading ${platesLabel(plates)}`);
      router.push(href(plates));
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError(`Give a whole number of plates from 1 to ${MAX_PLATES}.`);
      return;
    }
    // A count with a result is read, not run again.
    if (ready.includes(typed)) {
      setError(null);
      router.push(href(typed));
      return;
    }
    run(typed, false);
  }

  async function rerun() {
    const ok = await confirm({
      title: `Proofread ${platesLabel(shown)} again?`,
      description: `Claude writes the amounts for ${platesLabel(shown)} again and replaces the ones stored.`,
      confirmLabel: "Proofread again",
    });
    if (ok) run(shown, true);
  }

  const options = [
    ...ready.map((plates) => ({
      value: String(plates),
      label: String(plates),
      href: href(plates),
    })),
    ...open
      .filter((plates) => !ready.includes(plates))
      .map((plates) => ({
        value: String(plates),
        label: `${plates}, with Claude`,
        href: href(plates),
        disabled: true,
      })),
  ];

  return (
    <div
      data-plate-bar=""
      className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3.5 sm:px-4 sm:py-3.5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Plates
          </span>
          <SegmentedLinks
            aria-label="Plate count"
            value={String(shown)}
            linkAs={Link}
            options={options}
            className="w-auto max-w-full flex-wrap bg-background/60"
          />
        </div>

        {canRun ? (
          <form
            onSubmit={submit}
            noValidate
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="plate-count" className="text-sm font-medium">
              Another count
            </label>
            <Input
              id="plate-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PLATES}
              step={1}
              value={value}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "plate-count-error" : undefined}
              className="w-24 bg-background"
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Sparkles aria-hidden />
              )}
              {valid ? `Proofread for ${platesLabel(typed)}` : "Proofread"}
            </Button>
            {proofread.includes(shown) && shown !== basePlates ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={rerun}
              >
                <RotateCcw aria-hidden />
                Proofread {platesLabel(shown)} again
              </Button>
            ) : null}
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            A captain or a Kitchen lead proofreads a new plate count, because
            each run costs money.
          </p>
        )}
      </div>

      {error ? (
        <p
          id="plate-count-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {asked !== null ? (
        <p role="status" className="text-sm text-foreground">
          {statusFor(asked, open, failed)}{" "}
          <span className="text-muted-foreground">
            Showing {platesLabel(shown)}.
          </span>
        </p>
      ) : null}
      {confirmDialog}
    </div>
  );
}
