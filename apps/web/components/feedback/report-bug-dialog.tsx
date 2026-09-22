"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
import { Textarea } from "@camp404/ui/components/textarea";
import { Label } from "@camp404/ui/components/label";
import {
  Bug,
  Check,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { cn } from "@camp404/ui/lib/utils";
import { RecorderPanel } from "../voice/recorder-panel";
import { useDictationToggle } from "../voice/use-dictation-toggle";
import { useVoiceSupported } from "../voice/use-voice-recorder";
import { ReportDiagnosticsPanel } from "./report-diagnostics";
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
 * action — nothing is stored in our DB. Drawn as the AfrikaBurn reporter
 * (header, body and footer bands; type cards; dictation beside the label),
 * with our voice RecorderPanel. The
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
  const [result, setResult] = React.useState<Extract<
    FeedbackResult,
    { ok: true }
  > | null>(null);
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
            typeof window !== "undefined"
              ? window.location.pathname
              : undefined,
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
        className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-[600px]"
        style={result && sentHeight ? { minHeight: sentHeight } : undefined}
      >
        {result ? (
          <div className="flex flex-col gap-4 p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
                Report filed
              </DialogTitle>
              <DialogDescription className="leading-relaxed">
                {result.number > 0
                  ? `Issue #${result.number} was created on GitHub. Thanks!`
                  : "Thanks — your report was sent."}
              </DialogDescription>
            </DialogHeader>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {result.number > 0
                ? `View issue #${result.number}`
                : "Open the tracker"}
            </a>
            <div className="mt-auto flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader className="gap-1 p-5 pr-12 text-left">
              <DialogTitle className="text-lg font-extrabold">
                {kind === "bug" ? "Report a bug" : "Request a feature"}
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                This opens a GitHub issue on our public tracker — please
                don&rsquo;t include personal details.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 border-t border-border p-5">
              {/* Kind toggle */}
              <div
                role="group"
                aria-label="Report type"
                className="flex flex-col gap-2 sm:flex-row sm:gap-3"
              >
                <KindOption
                  selected={kind === "bug"}
                  onSelect={() => setKind("bug")}
                  icon={Bug}
                  label="Bug"
                  description="Something is broken or behaving oddly."
                />
                <KindOption
                  selected={kind === "feature"}
                  onSelect={() => setKind("feature")}
                  icon={Lightbulb}
                  label="Feature"
                  description="Something is missing or could work better."
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-2">
                <div className="flex min-h-9 items-center justify-between gap-3">
                  <Label
                    htmlFor="feedback-description"
                    className="font-semibold"
                  >
                    {kind === "bug"
                      ? "What went wrong?"
                      : "What would you like to see?"}
                  </Label>
                  {/* Voice dictation — appends to the description. Hidden in
                      a browser that cannot record. */}
                  {voiceSupported && !dictation.dictating && (
                    <DictatePill
                      ref={dictation.pillRef}
                      onActivate={dictation.open}
                    />
                  )}
                </div>
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
                {voiceSupported && dictation.dictating && (
                  // No promptKey: the transcribe route has no bug-report
                  // prompt, and free-form feedback doesn't benefit from one.
                  // Dictation runs with the generic (unbiased) transcription.
                  <RecorderPanel
                    onTranscript={appendTranscript}
                    onDismiss={dictation.close}
                  />
                )}
              </div>

              {/* Improve with AI — only when the server has a Claude key. */}
              {aiAvailable && (
                <AckRow
                  id="feedback-use-ai"
                  checked={useAi}
                  onCheckedChange={(c) => setUseAi(c === true)}
                  rowClassName="rounded-lg border-border bg-card"
                >
                  <span className="block font-semibold">Improve with AI</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Restructures your report into a clear title and steps before
                    filing.
                  </span>
                </AckRow>
              )}

              {/* Diagnostics: off until the member ticks it, and then they see
                  every line that will be sent. */}
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <AckRow
                  id="feedback-attach-diagnostics"
                  checked={attached !== null}
                  onCheckedChange={(c) =>
                    setAttached(c === true ? collectDiagnostics() : null)
                  }
                  rowClassName="border-0 bg-transparent p-0 hover:bg-transparent"
                >
                  <span className="block font-semibold">
                    Attach device details and recent errors
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Helps find the fault. You see everything that is sent below.
                  </span>
                </AckRow>
                {attached && (
                  <ReportDiagnosticsPanel diagnostics={attached} defaultOpen />
                )}
              </div>

              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border p-4 max-sm:flex-col-reverse max-sm:items-stretch">
              <p className="flex items-center gap-2 text-xs text-muted-foreground max-sm:justify-center">
                <LinkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                You&rsquo;ll get the issue link once it&rsquo;s filed.
              </p>
              <div className="flex items-center gap-2.5 max-sm:flex-row-reverse">
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="max-sm:flex-1"
                >
                  {isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  )}
                  {isPending ? "Sending…" : "Send report"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One report type, as a selectable card (the AfrikaBurn reporter's). */
function KindOption({
  selected,
  onSelect,
  icon: Icon,
  label,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof Bug;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex-1 rounded-lg border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/10"
          : "border-input bg-card hover:border-muted-foreground/40",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              selected ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden
          />
          <span className="text-sm font-bold text-foreground">{label}</span>
        </span>
        <span
          aria-hidden
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary bg-primary" : "border-input",
          )}
        >
          {selected && (
            <Check
              className="h-3 w-3 text-primary-foreground"
              strokeWidth={3}
            />
          )}
        </span>
      </span>
      <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
        {description}
      </span>
    </button>
  );
}
