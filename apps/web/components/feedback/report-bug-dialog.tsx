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
import { AckRow } from "@camp404/ui/components/checkbox";
import { Textarea } from "@camp404/ui/components/textarea";
import { Label } from "@camp404/ui/components/label";
import {
  Bug,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { RecorderPanel } from "../voice/recorder-panel";
import { useDictationToggle } from "../voice/use-dictation-toggle";
import { useVoiceSupported } from "../voice/use-voice-recorder";
import {
  submitFeedbackAction,
  type FeedbackResult,
} from "@/app/feedback/actions";
import {
  DESCRIPTION_MAX,
  type FeedbackKind,
  type ReportDiagnostics,
} from "@/lib/github-feedback";
import { collectDiagnostics } from "@/lib/client-errors";

interface ReportBugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: FeedbackKind;
  /** Whether the server has an ANTHROPIC_API_KEY — gates the AI toggle. */
  aiAvailable?: boolean;
  /** Text the description starts with (the error page passes its trace). */
  defaultDescription?: string;
}

/**
 * Bug / feature-request modal. Files a GitHub issue via the feedback server
 * action — nothing is stored in our DB. Layout copied from
 * RyRy79261/intake-tracker's report-bug dialog (minus its manual section and
 * diagnostics capture), adapted to our Dialog + voice RecorderPanel. The
 * "Improve with AI" toggle restructures the report server-side before filing.
 */
export function ReportBugDialog({
  open,
  onOpenChange,
  defaultKind = "bug",
  aiAvailable = false,
  defaultDescription = "",
}: ReportBugDialogProps) {
  const [kind, setKind] = React.useState<FeedbackKind>(defaultKind);
  const [description, setDescription] = React.useState("");
  const dictation = useDictationToggle();
  const voiceSupported = useVoiceSupported();
  const [dictated, setDictated] = React.useState(false);
  const [useAi, setUseAi] = React.useState(true);
  // What "Attach device details and recent errors" would send, captured when
  // the box is ticked. The panel shows exactly this, and exactly this is sent.
  const [attached, setAttached] = React.useState<ReportDiagnostics | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<
    Extract<FeedbackResult, { ok: true }> | null
  >(null);
  const [isPending, startTransition] = React.useTransition();

  // Reset on each closed→open transition.
  React.useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setDescription(defaultDescription);
    setAttached(null);
    dictation.setDictating(false);
    setDictated(false);
    setUseAi(true);
    setError(null);
    setResult(null);
  }, [open, defaultKind, defaultDescription]);

  function appendTranscript(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setDictated(true);
    setDescription((prev) => {
      const joiner = prev && !/\n\s*$/.test(prev) ? "\n" : "";
      return `${prev}${joiner}${cleaned}`.slice(0, DESCRIPTION_MAX);
    });
  }

  // The form's height when it was sent. The short "Report filed" panel keeps
  // it, so the dialog does not jump smaller under the pointer.
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [sentHeight, setSentHeight] = React.useState<number | null>(null);

  function handleSubmit() {
    setError(null);
    setSentHeight(contentRef.current?.offsetHeight ?? null);
    startTransition(async () => {
      try {
        const res = await submitFeedbackAction({
          kind,
          description,
          dictated,
          useAi: aiAvailable && useAi,
          ...(attached ? { diagnostics: attached } : {}),
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
      <DialogContent
        ref={contentRef}
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        style={result && sentHeight ? { minHeight: sentHeight } : undefined}
      >
        {result ? (
          <div className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
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
            <DialogFooter className="mt-auto">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
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

              {/* Voice dictation — appends to the description. Hidden in a
                  browser that cannot record. */}
              {!voiceSupported ? null : dictation.dictating ? (
                // No promptKey: the transcribe route has no bug-report prompt,
                // and free-form feedback doesn't benefit from one. Dictation
                // runs with the generic (unbiased) transcription.
                <RecorderPanel
                  onTranscript={appendTranscript}
                  onDismiss={dictation.close}
                />
              ) : (
                <DictatePill
                  ref={dictation.pillRef}
                  onActivate={dictation.open}
                  className="self-start"
                />
              )}

              {/* Improve with AI — only when the server has a Claude key. */}
              {aiAvailable && (
                <AckRow
                  id="feedback-use-ai"
                  checked={useAi}
                  onCheckedChange={(c) => setUseAi(c === true)}
                  rowClassName="rounded-md border border-[color:var(--color-border)] px-3"
                >
                  <span className="block font-medium">Improve with AI</span>
                  <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                    Restructures your report into a clear title and steps
                    before filing.
                  </span>
                </AckRow>
              )}

              {/* Diagnostics: off until the member ticks it, and then they see
                  every line that will be sent. No board draws this panel; it
                  reuses the AI toggle's row and a plain list. */}
              <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-border)] p-3">
                <AckRow
                  id="feedback-attach-diagnostics"
                  checked={attached !== null}
                  onCheckedChange={(c) =>
                    setAttached(c === true ? collectDiagnostics() : null)
                  }
                  rowClassName="py-0"
                >
                  <span className="block font-medium">
                    Attach device details and recent errors
                  </span>
                  <span className="block text-xs text-[color:var(--color-muted-foreground)]">
                    Helps find the fault. You see everything that is sent
                    below.
                  </span>
                </AckRow>
                {attached && <DiagnosticsList diagnostics={attached} />}
              </div>

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

/** Every line a report attaches, before it is sent. */
function DiagnosticsList({ diagnostics }: { diagnostics: ReportDiagnostics }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-[color:var(--color-muted-foreground)]">
        This goes on a public GitHub issue. Your name, email and account are
        never attached. Personal details found in these lines are removed
        first, but that can miss things.
      </p>
      <dl className="flex flex-col gap-1 rounded-md bg-[color:var(--color-muted)] p-2">
        {diagnostics.environment.map((field) => (
          <div key={field.label} className="flex gap-2">
            <dt className="w-20 shrink-0 font-semibold">{field.label}</dt>
            <dd className="min-w-0 flex-1 break-all font-mono">{field.value}</dd>
          </div>
        ))}
      </dl>
      {diagnostics.errors.length === 0 ? (
        <p>No recent errors in this tab.</p>
      ) : (
        <ul
          aria-label="Recent errors"
          className="flex flex-col gap-1 rounded-md bg-[color:var(--color-muted)] p-2 font-mono"
        >
          {diagnostics.errors.map((e, i) => (
            <li key={`${e.at}-${i}`} className="break-all">
              {e.source}: {e.message}
              {e.route ? ` (at ${e.route})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
