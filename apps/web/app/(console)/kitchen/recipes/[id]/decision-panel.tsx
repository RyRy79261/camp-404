"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquareWarning, Pencil, X } from "lucide-react";
import { RECIPE_TEXT_MAX } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { decideRecipeAction, resubmitRecipeAction } from "../actions";

// The Decision card's controls, from AfrikaBurn's registration decision
// panel: Approve, Ask for changes and Reject, the last two behind a dialog
// that asks for the reason the member will read. Rendered only for a Kitchen
// lead or a captain (the page decides; the action and the write check again).
// A problem shows where it happened: in the dialog, or under the buttons.

type Reasoned = "request_changes" | "reject";

const COPY: Record<
  Reasoned,
  { title: string; description: string; label: string; confirm: string }
> = {
  request_changes: {
    title: "Ask for changes",
    description:
      "Say what should change. The member reads this, edits the recipe and sends it back.",
    label: "What should change",
    confirm: "Send it back",
  },
  reject: {
    title: "Reject this recipe",
    description:
      "Say why it doesn't suit the camp. The member reads this. A rejected recipe stays rejected.",
    label: "Why it is rejected",
    confirm: "Reject",
  },
};

export function DecisionPanel({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"approve" | Reasoned | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Reasoned | null>(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  function approve() {
    setError(null);
    setBusy("approve");
    startTransition(async () => {
      const result = await decideRecipeAction({
        recipeId,
        decision: "approve",
      });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Recipe approved");
      router.refresh();
    });
  }

  function confirm() {
    if (!dialog) return;
    const text = reason.trim();
    if (!text) {
      setDialogError(
        dialog === "reject"
          ? "Say why it is rejected."
          : "Say what should change.",
      );
      return;
    }
    setDialogError(null);
    setBusy(dialog);
    const input =
      dialog === "reject"
        ? { recipeId, decision: "reject" as const, reason: text }
        : { recipeId, decision: "request_changes" as const, note: text };
    startTransition(async () => {
      const result = await decideRecipeAction(input);
      setBusy(null);
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      toast.success(
        dialog === "reject" ? "Recipe rejected" : "Sent back for changes",
      );
      setDialog(null);
      setReason("");
      router.refresh();
    });
  }

  function open(which: Reasoned) {
    setError(null);
    setDialogError(null);
    setReason("");
    setDialog(which);
  }

  const copy = dialog ? COPY[dialog] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={approve}>
          {busy === "approve" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Check aria-hidden />
          )}
          Approve
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => open("request_changes")}
        >
          <MessageSquareWarning aria-hidden />
          Ask for changes
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => open("reject")}
        >
          <X aria-hidden />
          Reject
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && !pending && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.description}</DialogDescription>
          </DialogHeader>
          <Field
            label={copy?.label ?? ""}
            htmlFor="decision-reason"
            error={dialogError}
          >
            <Textarea
              id="decision-reason"
              value={reason}
              rows={5}
              maxLength={dialog === "reject" ? 500 : 1000}
              disabled={pending}
              onChange={(e) => {
                setReason(e.target.value);
                setDialogError(null);
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant={dialog === "reject" ? "destructive" : "default"}
              disabled={pending}
              onClick={confirm}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {copy?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The submitter's edit after a reviewer asked for changes. */
export function EditAndResubmit({
  recipeId,
  title: initialTitle,
  text: initialText,
  suitabilityNote: initialNote,
  aiConsent: initialConsent,
}: {
  recipeId: string;
  title: string;
  text: string | null;
  suitabilityNote: string | null;
  /** Whether the member's own earlier tick stands, to start the box from. */
  aiConsent: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText ?? "");
  const [note, setNote] = useState(initialNote ?? "");
  const [aiConsent, setAiConsent] = useState(initialConsent);
  const [error, setError] = useState<string | null>(null);

  function send() {
    if (!title.trim()) {
      setError("Give the recipe a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resubmitRecipeAction({
        recipeId,
        title,
        text,
        suitabilityNote: note,
        aiConsent,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Recipe sent back for review");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Pencil aria-hidden />
        Edit and resubmit
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !pending && setOpen(o)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit and resubmit</DialogTitle>
            <DialogDescription>
              Make the changes that were asked for. It goes back to the Kitchen
              leads as a suggestion.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="Recipe name" htmlFor="resubmit-title">
              <Input
                id="resubmit-title"
                value={title}
                maxLength={120}
                disabled={pending}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Field label="Recipe text" htmlFor="resubmit-text">
              <Textarea
                id="resubmit-text"
                value={text}
                rows={8}
                maxLength={RECIPE_TEXT_MAX}
                disabled={pending}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Field
              label="Why it suits the camp"
              htmlFor="resubmit-note"
              help="Never sent to Claude."
            >
              <Textarea
                id="resubmit-note"
                value={note}
                rows={3}
                maxLength={1000}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <AckRow
              checked={aiConsent}
              onCheckedChange={(v) => setAiConsent(v === true)}
              disabled={pending}
            >
              A captain or a Kitchen lead may send this recipe&apos;s text to
              Claude to turn it into a recipe
            </AckRow>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={send}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Resubmit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
