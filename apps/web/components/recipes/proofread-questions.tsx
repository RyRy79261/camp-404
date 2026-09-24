"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { cn } from "@camp404/ui/lib/utils";
import {
  answerProofreadQuestionsAction,
  proofreadProgressAction,
} from "@/app/(console)/kitchen/recipes/actions";
import { UNREACHABLE } from "@/lib/recipe-copy";

// What the source editor, the recipe page and "Adjust with Claude" share
// about a run sent to Claude (#243, Kitchen): the run as the page read it on
// the server, the poll that follows it once a second until it settles, the
// loading panel with the stages the worker writes, and the dialog with
// Claude's questions, whose answer queues the next round. Both pages read the
// run on load, so questions left unanswered are still there after leaving and
// coming back.

/** How often a page asks where its run is. */
export const POLL_MS = 1_000;

export type RunStage = "sending" | "reading" | "checking" | "saving";
type Outcome = "queued" | "running" | "succeeded" | "failed";

/** The recipe's newest run on the recipe itself, as the server read it. */
export interface OpenRun {
  runId: string;
  stage: RunStage | null;
  outcome: Outcome;
  questions: string[] | null;
}

export const QUESTIONS_TITLE =
  "Claude needs more before it can write this recipe";

/** How a polled run ended. */
export type Settled =
  | { kind: "written" }
  | { kind: "questions"; questions: string[] }
  | { kind: "failed"; error: string };

/** Whether a run the page read is still with Claude. */
export function isOpen(run: OpenRun | null): boolean {
  return run?.outcome === "queued" || run?.outcome === "running";
}

/** Claude's questions on a run the page read, or null when it asked none. */
export function pendingQuestions(run: OpenRun | null): string[] | null {
  return run?.outcome === "succeeded" && run.questions?.length
    ? run.questions
    : null;
}

/**
 * Poll the run in `runIdRef` (the recipe's newest when it is empty) while
 * `active`, one request at a time, and stop as soon as it settles. A dropped
 * request is asked again on the next tick.
 */
export function useRunPoll({
  recipeId,
  runIdRef,
  active,
  onStage,
  onSettled,
}: {
  recipeId: string;
  runIdRef: { current: string };
  active: boolean;
  onStage: (stage: RunStage | null) => void;
  onSettled: (settled: Settled) => void;
}): void {
  // The latest callbacks, so a re-render does not restart the poll.
  const handlers = useRef({ onStage, onSettled });
  useEffect(() => {
    handlers.current = { onStage, onSettled };
  });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (settled: Settled) => {
      stopped = true;
      handlers.current.onSettled(settled);
    };
    const tick = async () => {
      let result: Awaited<ReturnType<typeof proofreadProgressAction>>;
      try {
        // The run this page started (or found open on load): a failure can
        // point the recipe back at an older run, whose success is not ours.
        result = await proofreadProgressAction({
          recipeId,
          ...(runIdRef.current ? { runId: runIdRef.current } : {}),
        });
      } catch {
        if (!stopped) timer = setTimeout(tick, POLL_MS);
        return;
      }
      if (stopped) return;
      if (!result.ok) return settle({ kind: "failed", error: result.error });
      const progress = result.data;
      if (
        progress === null ||
        progress.outcome === "queued" ||
        progress.outcome === "running"
      ) {
        if (progress) handlers.current.onStage(progress.stage);
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      if (progress.outcome === "failed") {
        return settle({
          kind: "failed",
          error: progress.error ?? "The run failed. Try again.",
        });
      }
      if (progress.questions?.length) {
        return settle({ kind: "questions", questions: progress.questions });
      }
      settle({ kind: "written" });
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, recipeId, runIdRef]);
}

/** The panel's rows: the stages the worker writes, in order. */
const STAGES: { stage: RunStage; label: string }[] = [
  { stage: "sending", label: "Sending the recipe" },
  { stage: "reading", label: "Claude is reading it" },
  { stage: "checking", label: "Checking the structure" },
  { stage: "saving", label: "Saving" },
];

/** Which row is under way: a queued run, or one not yet staged, is sending. */
function stageIndex(stage: RunStage | null): number {
  if (stage === null) return 0;
  return Math.max(
    0,
    STAGES.findIndex((s) => s.stage === stage),
  );
}

/** The loading panel: only the stage the worker last wrote on the run. */
export function ProofreadingPanel({ stage }: { stage: RunStage | null }) {
  const at = stageIndex(stage);
  return (
    <Card role="status" aria-live="polite" aria-label="Proofreading">
      <CardContent className="p-4">
        <ol className="flex flex-col gap-2 text-sm">
          {STAGES.map((row, i) => (
            <li
              key={row.stage}
              className={cn(
                "flex items-center gap-2",
                i > at && "text-muted-foreground",
              )}
              aria-current={i === at ? "step" : undefined}
            >
              {i < at ? (
                <Check className="h-4 w-4 text-primary" aria-hidden />
              ) : i === at ? (
                <Spinner size="sm" label="Under way:" />
              ) : (
                <span className="h-4 w-4" aria-hidden />
              )}
              <span>{row.label}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function QuestionList({ questions }: { questions: string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm">
      {questions.map((q, i) => (
        <li key={i} className="break-words">
          {q}
        </li>
      ))}
    </ol>
  );
}

/**
 * Claude's questions and the answer box. Send answer queues the next round
 * (which carries the whole exchange) and hands its run to `onAnswered`.
 */
export function ProofreadQuestionsDialog({
  open,
  onOpenChange,
  recipeId,
  runId,
  questions,
  closeLabel,
  onAnswered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  /** The run that asked. */
  runId: string;
  questions: string[];
  closeLabel: string;
  onAnswered: (runId: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);

  async function send() {
    if (!answer.trim()) {
      setError("Write your answer.");
      return;
    }
    setAnswering(true);
    setError(null);
    let result: Awaited<ReturnType<typeof answerProofreadQuestionsAction>>;
    try {
      result = await answerProofreadQuestionsAction({
        recipeId,
        runId,
        answer,
      });
    } catch {
      setError(UNREACHABLE);
      return;
    } finally {
      setAnswering(false);
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnswer("");
    onAnswered(result.data.runId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{QUESTIONS_TITLE}</DialogTitle>
        </DialogHeader>
        <QuestionList questions={questions} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="proofread-answer" className="text-sm font-medium">
            Your answer
          </label>
          <Textarea
            id="proofread-answer"
            rows={5}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "proofread-answer-error" : undefined}
          />
          {error && (
            <p
              id="proofread-answer-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
          <Button onClick={send} disabled={answering}>
            Send answer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
