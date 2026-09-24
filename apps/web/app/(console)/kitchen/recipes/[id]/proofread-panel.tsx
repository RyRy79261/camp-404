"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { MAX_PLATES } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { runProofreadingAction } from "../actions";

// The "Turn into a recipe with Claude" button on one recipe, for a captain or
// a Kitchen lead (the owner's decision 2A); everyone else reads why there is
// no button. It queues a source run: Claude reads the recipe's newest source
// and writes it straight into the book, or asks questions first. The action
// and the write check the reviewer, the member's consent, the source and the
// camp's silent daily cap again; no run counter is shown.

export function ProofreadPanel({
  recipeId,
  rerun,
  blockedReason,
  initialNote = "",
  defaultPlates,
}: {
  recipeId: string;
  /** A proofread or accepted recipe runs again for a new version. */
  rerun: boolean;
  /** Why its text may not be sent, or null. */
  blockedReason: string | null;
  /** A Kitchen lead's request, to start the note from. */
  initialNote?: string;
  /** The largest meal's plates from Camp settings, or 40. */
  defaultPlates: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(initialNote);
  const [plates, setPlates] = useState(String(defaultPlates));
  const [error, setError] = useState<string | null>(null);

  function run(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await runProofreadingAction({
        recipeIds: [recipeId],
        note,
        plates: Number(plates),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Sent to Claude");
      setNote("");
      router.refresh();
    });
  }

  const label = rerun
    ? "Turn into a recipe again"
    : "Turn into a recipe with Claude";
  const blocked = blockedReason !== null;

  return (
    <form onSubmit={run} noValidate className="flex flex-col gap-3">
      {blockedReason && (
        <p className="text-sm text-muted-foreground">{blockedReason}</p>
      )}
      <Field
        label="Plates"
        htmlFor="proofread-plates"
        help="Claude writes every amount for this many plates."
      >
        <Input
          id="proofread-plates"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PLATES}
          step={1}
          value={plates}
          disabled={pending || blocked}
          className="w-32"
          onChange={(e) => setPlates(e.target.value)}
        />
      </Field>
      <Field
        label={rerun ? "What should Claude do differently?" : "Note for Claude"}
        htmlFor="proofread-note"
        help="Optional. Sent with the recipe's text."
      >
        <Textarea
          id="proofread-note"
          value={note}
          rows={2}
          maxLength={1000}
          disabled={pending || blocked}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || blocked}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Sparkles aria-hidden />
          )}
          {label}
        </Button>
      </div>
    </form>
  );
}
