"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Button } from "@camp404/ui/components/button";
import { Textarea } from "@camp404/ui/components/textarea";
import { Label } from "@camp404/ui/components/label";
import {
  Bug,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
  Mic,
} from "lucide-react";
import { RecorderPanel } from "../voice/recorder-panel";
import {
  submitFeedbackAction,
  type FeedbackResult,
} from "@/app/feedback/actions";
import { DESCRIPTION_MAX, type FeedbackKind } from "@/lib/github-feedback";

interface ReportBugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: FeedbackKind;
}

/**
 * Bug / feature-request modal. Files a GitHub issue via the feedback server
 * action — nothing is stored in our DB. Layout copied from
 * RyRy79261/intake-tracker's report-bug dialog (minus its manual section, AI
 * toggle, and diagnostics capture), adapted to our Dialog + voice RecorderPanel.
 */
export function ReportBugDialog({
  open,
  onOpenChange,
  defaultKind = "bug",
}: ReportBugDialogProps) {
  const [kind, setKind] = React.useState<FeedbackKind>(defaultKind);
  const [description, setDescription] = React.useState("");
  const [dictating, setDictating] = React.useState(false);
  const [dictated, setDictated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<
    Extract<FeedbackResult, { ok: true }> | null
  >(null);
  const [isPending, startTransition] = React.useTransition();

  // Reset on each closed→open transition.
  React.useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setDescription("");
    setDictating(false);
    setDictated(false);
    setError(null);
    setResult(null);
  }, [open, defaultKind]);

  function appendTranscript(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setDictated(true);
    setDescription((prev) => {
      const joiner = prev && !/\n\s*$/.test(prev) ? "\n" : "";
      return `${prev}${joiner}${cleaned}`.slice(0, DESCRIPTION_MAX);
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await submitFeedbackAction({
          kind,
          description,
          dictated,
          route:
            typeof window !== "undefined" ? window.location.pathname : undefined,
        });
        if (res.ok) setResult(res);
        else setError(res.error);
      } catch {
        // The action itself returns a typed result, but the action *transport*
        // can still reject (network/runtime). Surface it instead of leaving the
        // user on a stuck spinner.
        setError("Couldn't send your report just now. Please try again.");
      }
    });
  }

  const canSubmit = description.trim().length > 0 && !isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let Escape / outside-click / X dismiss the dialog mid-send —
        // the request would complete against a closed dialog and the
        // result/error would be lost. (Cancel is already disabled while pending.)
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[color:var(--color-primary)]" />
                Report filed
              </DialogTitle>
              <DialogDescription>
                {result.number > 0
                  ? `Issue #${result.number} was created on GitHub. Thanks!`
                  : "Thanks — your report was sent."}
              </DialogDescription>
            </DialogHeader>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm text-sm text-[color:var(--color-primary)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-4 w-4" />
              {result.number > 0 ? `View issue #${result.number}` : "Open the tracker"}
            </a>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {kind === "bug" ? "Report a bug" : "Request a feature"}
              </DialogTitle>
              <DialogDescription>
                This opens a GitHub issue on our public tracker — please don&rsquo;t
                include personal details.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              {/* Kind toggle */}
              <div
                role="group"
                aria-label="Report type"
                className="flex gap-2"
              >
                <Button
                  type="button"
                  variant={kind === "bug" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-2"
                  aria-pressed={kind === "bug"}
                  onClick={() => setKind("bug")}
                >
                  <Bug className="h-4 w-4" />
                  Bug
                </Button>
                <Button
                  type="button"
                  variant={kind === "feature" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-2"
                  aria-pressed={kind === "feature"}
                  onClick={() => setKind("feature")}
                >
                  <Lightbulb className="h-4 w-4" />
                  Feature
                </Button>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feedback-description">
                  {kind === "bug"
                    ? "What went wrong?"
                    : "What would you like to see?"}
                </Label>
                <Textarea
                  id="feedback-description"
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                  rows={6}
                  maxLength={DESCRIPTION_MAX}
                  placeholder={
                    kind === "bug"
                      ? "What you did, what you expected, and what happened instead."
                      : "Describe the capability or improvement you have in mind."
                  }
                />
              </div>

              {/* Voice dictation — appends to the description */}
              {dictating ? (
                // No promptKey: the transcribe route has no bug-report prompt,
                // and free-form feedback doesn't benefit from one. Dictation
                // runs with the generic (unbiased) transcription.
                <RecorderPanel
                  onTranscript={appendTranscript}
                  onDismiss={() => setDictating(false)}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 self-start"
                  onClick={() => setDictating(true)}
                >
                  <Mic className="h-4 w-4" />
                  Dictate instead
                </Button>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)]/10 px-3 py-2 text-sm text-[color:var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPending ? "Sending…" : "Send report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
