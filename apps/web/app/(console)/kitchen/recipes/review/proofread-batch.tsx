"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import {
  MAX_PLATES,
  MAX_PROOFREAD_BATCH,
  PlateCount,
  type Meal,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import type { ProofreadCandidate } from "@camp404/db/recipes";
import { RecipeStatusBadge } from "@/components/recipes/recipe-status-badge";
import { RUN_EXPLAINED, recipePath } from "@/lib/recipe-copy";
import { runProofreadingAction } from "../actions";

// The "Ready for Claude" card on the review page. Everyone who reaches it (a
// Kitchen lead or a captain) sees the approved recipes waiting, and gets the
// picker, the plate count, the note and the button (the owner's decision 2A).
// The page passes `run` for them, and the action and the write check again.
// Each picked recipe queues a source run: Claude reads its newest source and
// writes it straight into the book, or asks questions first. There is no
// daily limit. A refusal shows here, in the card, and a wrong plate count
// shows beside its field.

/** A meal with plates in the year's meal plan (its largest day). */
export interface MealPlates {
  meal: Meal;
  plates: number;
}

const MEAL_LABEL: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const OTHER = "other";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 sm:w-72";

function platesLabel(n: number): string {
  return `${n} plate${n === 1 ? "" : "s"}`;
}

export function ProofreadBatch({
  candidates,
  run,
}: {
  candidates: ProofreadCandidate[];
  /** The sender's controls; null for anyone else, who reads why instead. */
  run: {
    /** The meals whose plates are set, in meal order. */
    meals: MealPlates[];
    /** The largest count in this year's meal plan, or 40. */
    defaultPlates: number;
  } | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<string>(
    () => run?.meals.find((m) => m.plates === run.defaultPlates)?.meal ?? OTHER,
  );
  const [other, setOther] = useState(String(run?.defaultPlates ?? ""));
  const [platesError, setPlatesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosenMeal = run?.meals.find((m) => m.meal === choice);
  const otherPlates = PlateCount.safeParse(
    other.trim() === "" ? undefined : Number(other.trim()),
  );
  const plates = chosenMeal
    ? chosenMeal.plates
    : otherPlates.success
      ? otherPlates.data
      : null;

  function toggle(id: string, on: boolean) {
    setError(null);
    setPicked((list) =>
      on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (plates === null) {
      setPlatesError(
        otherPlates.success
          ? null
          : (otherPlates.error.issues[0]?.message ?? "Check the plates."),
      );
      return;
    }
    if (picked.length === 0) {
      setError("Pick a recipe to send to Claude.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runProofreadingAction({
        recipeIds: picked,
        note,
        plates,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const n = result.data.queued;
      toast.success(`Sent ${n} recipe${n === 1 ? "" : "s"} to Claude`);
      setPicked([]);
      setNote("");
      router.refresh();
    });
  }

  const columns: ResponsiveColumn<ProofreadCandidate>[] = [
    ...(run
      ? [
          {
            id: "pick",
            header: "Pick",
            hideHeader: true,
            cellClassName: "w-10",
            role: "badge" as const,
            cell: (c: ProofreadCandidate) => (
              <Checkbox
                aria-label={`Pick ${c.title}`}
                checked={picked.includes(c.id)}
                disabled={pending || c.blockedReason !== null}
                onCheckedChange={(v) => toggle(c.id, v === true)}
              />
            ),
          },
        ]
      : []),
    {
      id: "name",
      header: "Recipe",
      role: "title",
      cellClassName: "font-medium",
      cell: (c) => (
        <Link href={recipePath(c.id)} className="hover:text-accent">
          {c.title}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (c) => <RecipeStatusBadge status={c.status} />,
    },
    {
      id: "note",
      header: "Note",
      cellClassName: "text-xs text-muted-foreground",
      cell: (c) => (
        <span className="flex flex-col gap-1">
          {c.blockedReason ? (
            <span>{c.blockedReason}</span>
          ) : c.lastError ? (
            <span className="text-destructive">Last run: {c.lastError}</span>
          ) : c.status === "approved" ? (
            <span>Ready</span>
          ) : (
            <span>Run again for a new version</span>
          )}
          {c.rerunRequest && (
            <span className="text-foreground">
              {c.rerunRequest.byName ?? "A Kitchen lead"} asked for a re-run:{" "}
              {c.rerunRequest.note}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <Card role="article" aria-labelledby="ready-for-claude">
      <CardHeader>
        <CardTitle id="ready-for-claude" className="text-base">
          Ready for Claude
        </CardTitle>
        <CardDescription>
          Claude reads each recipe&apos;s source and writes it as a recipe for a
          number of plates: ingredients by category, steps with what each one
          uses, and practical notes. It goes straight into the book. Each run
          costs money, so only captains and Kitchen leads start one, at most{" "}
          {MAX_PROOFREAD_BATCH} at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approved recipe is waiting. A recipe shows here once a Kitchen
            lead or a captain approves it.
          </p>
        ) : !run ? (
          <ResponsiveDataTable
            columns={columns}
            data={candidates}
            getRowKey={(c) => c.id}
            label="Recipes ready for Claude"
          />
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <ResponsiveDataTable
              columns={columns}
              data={candidates}
              getRowKey={(c) => c.id}
              label="Recipes ready for Claude"
            />
            <Field
              label="Plates"
              htmlFor="claude-plates"
              help={
                plates === null
                  ? "Claude writes every amount for this many plates."
                  : `Claude writes every amount for ${platesLabel(plates)}.`
              }
            >
              <select
                id="claude-plates"
                className={selectClass}
                value={choice}
                disabled={pending}
                aria-describedby="claude-plates-help"
                onChange={(e) => {
                  setChoice(e.target.value);
                  setPlatesError(null);
                  setError(null);
                }}
              >
                {run.meals.map((m) => (
                  <option key={m.meal} value={m.meal}>
                    {MEAL_LABEL[m.meal]} · {platesLabel(m.plates)}
                  </option>
                ))}
                <option value={OTHER}>Other</option>
              </select>
            </Field>
            {choice === OTHER && (
              <Field
                label="Number of plates"
                htmlFor="claude-plates-other"
                help={`A whole number from 1 to ${MAX_PLATES}.`}
                error={platesError}
              >
                <Input
                  id="claude-plates-other"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PLATES}
                  step={1}
                  value={other}
                  disabled={pending}
                  className="w-32"
                  aria-invalid={platesError ? true : undefined}
                  aria-describedby={
                    platesError
                      ? "claude-plates-other-error"
                      : "claude-plates-other-help"
                  }
                  onChange={(e) => {
                    setOther(e.target.value);
                    setPlatesError(null);
                    setError(null);
                  }}
                />
              </Field>
            )}
            <Field
              label="Note for Claude"
              htmlFor="claude-note"
              help="Optional, e.g. “The last run used cups; use grams.” Sent with each recipe picked. A Kitchen lead's request is not sent unless you copy it here."
            >
              <Textarea
                id="claude-note"
                value={note}
                rows={2}
                maxLength={1000}
                disabled={pending}
                aria-describedby="claude-note-help"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles aria-hidden />
                )}
                Turn into recipes with Claude
              </Button>
              {picked.length > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {picked.length} picked
                </span>
              )}
            </div>
          </form>
        )}
        {!run && (
          <p className="text-sm text-muted-foreground">{RUN_EXPLAINED}</p>
        )}
      </CardContent>
    </Card>
  );
}
