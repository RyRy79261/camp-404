"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send } from "lucide-react";
import {
  SOURCE_SECTIONS,
  type RecipeSourceSections,
  type SourceDoc,
  type SourceSection,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Input } from "@camp404/ui/components/input";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { cn } from "@camp404/ui/lib/utils";
import { SourceSectionEditor } from "@/components/recipes/source-section-editor";
import { recipePath } from "@/lib/recipe-copy";
import {
  answerProofreadQuestionsAction,
  proofreadProgressAction,
  sendSourceForProofreadingAction,
} from "../../actions";

// The source editor's client half (#243, Kitchen): the Send button, the
// loading panel, Claude's questions and the four section editors. The panel
// shows only what the server returns: the stage the worker last wrote on the
// run, polled once a second. Nothing else moves on the client beyond the
// spinner.
//
//  - Send saves the source (a new version when it changed) and queues the run;
//    the button goes while the run is open.
//  - A run that wrote the recipe: it is in the book; open its page.
//  - A run that asked questions: a dialog with them, and an answer that queues
//    the next round. Closing it keeps the questions above the editor until the
//    next send.
//  - A run that failed: its sentence, where the panel was, and the button
//    comes back.
//  - A send the server refused (consent, a newer source, the daily cap) says
//    why above the sections.

/** How often the loading panel asks where the run is. */
export const POLL_MS = 1_000;

type Stage = "sending" | "reading" | "checking" | "saving";
type Outcome = "queued" | "running" | "succeeded" | "failed";

/** The recipe's newest run, as the page read it on the server. */
export interface OpenRun {
  runId: string;
  stage: Stage | null;
  outcome: Outcome;
  questions: string[] | null;
}

const SECTION_TITLES: Record<SourceSection, string> = {
  ingredients: "Ingredients",
  equipment: "Equipment",
  steps: "Steps",
  notes: "Notes",
};

/** The panel's rows: the stages the worker writes, in order. */
const STAGES: { stage: Stage; label: string }[] = [
  { stage: "sending", label: "Sending the recipe" },
  { stage: "reading", label: "Claude is reading it" },
  { stage: "checking", label: "Checking the structure" },
  { stage: "saving", label: "Saving" },
];

/** Which row is under way: a queued run, or one not yet staged, is sending. */
function stageIndex(stage: Stage | null): number {
  if (stage === null) return 0;
  return Math.max(
    0,
    STAGES.findIndex((s) => s.stage === stage),
  );
}

const QUESTIONS_TITLE = "Claude needs more before it can write this recipe";

/** A send or an answer that never reached the server (the network dropped). */
export const UNREACHABLE = "Could not reach the server. Try again.";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: Stage | null }
  | { kind: "questions"; runId: string; questions: string[] }
  | { kind: "failed"; error: string };

function initialPhase(run: OpenRun | null): Phase {
  if (!run) return { kind: "idle" };
  if (run.outcome === "queued" || run.outcome === "running") {
    return { kind: "running", stage: run.stage };
  }
  if (run.outcome === "succeeded" && run.questions?.length) {
    return { kind: "questions", runId: run.runId, questions: run.questions };
  }
  return { kind: "idle" };
}

function QuestionList({ questions }: { questions: string[] }) {
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

function ProofreadingPanel({ stage }: { stage: Stage | null }) {
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

export function SourceEditor({
  recipeId,
  title,
  basedOnSourceId,
  serves: initialServes,
  sections: initialSections,
  run,
}: {
  recipeId: string;
  title: string;
  basedOnSourceId: string | null;
  serves: number | null;
  sections: RecipeSourceSections;
  run: OpenRun | null;
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(basedOnSourceId);
  const [serves, setServes] = useState(
    initialServes === null ? "" : String(initialServes),
  );
  const sections = useRef<RecipeSourceSections>(initialSections);
  const [phase, setPhase] = useState<Phase>(() => initialPhase(run));
  const [dialogOpen, setDialogOpen] = useState(
    () => initialPhase(run).kind === "questions",
  );
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);

  const running = phase.kind === "running";

  // The run being polled, so its questions can be answered.
  const runIdRef = useRef(run?.runId ?? "");

  // Poll the run while it is open, one request at a time; stop as soon as it
  // settles.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (next: Phase) => {
      stopped = true;
      setPhase(next);
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
        // The network dropped a poll; ask again on the next tick.
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
        if (progress) setPhase({ kind: "running", stage: progress.stage });
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
        setAnswer("");
        setAnswerError(null);
        setDialogOpen(true);
        return settle({
          kind: "questions",
          runId: runIdRef.current,
          questions: progress.questions,
        });
      }
      stopped = true;
      router.push(recipePath(recipeId));
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, recipeId, router]);

  const onSectionChange = useCallback(
    (section: SourceSection) => (doc: SourceDoc) => {
      sections.current = { ...sections.current, [section]: doc };
    },
    [],
  );

  async function send() {
    setSending(true);
    setRefusal(null);
    const trimmed = serves.trim();
    let result: Awaited<ReturnType<typeof sendSourceForProofreadingAction>>;
    try {
      result = await sendSourceForProofreadingAction({
        recipeId,
        basedOnSourceId: sourceId,
        serves: trimmed === "" ? null : Number(trimmed),
        sections: sections.current,
      });
    } catch {
      setRefusal(UNREACHABLE);
      return;
    } finally {
      setSending(false);
    }
    if (!result.ok) {
      setRefusal(result.error);
      return;
    }
    setSourceId(result.data.sourceId);
    runIdRef.current = result.data.runId;
    setDialogOpen(false);
    setPhase({ kind: "running", stage: null });
  }

  async function sendAnswer() {
    if (phase.kind !== "questions") return;
    if (!answer.trim()) {
      setAnswerError("Write your answer.");
      return;
    }
    setAnswering(true);
    setAnswerError(null);
    let result: Awaited<ReturnType<typeof answerProofreadQuestionsAction>>;
    try {
      result = await answerProofreadQuestionsAction({
        recipeId,
        runId: phase.runId,
        answer,
      });
    } catch {
      setAnswerError(UNREACHABLE);
      return;
    } finally {
      setAnswering(false);
    }
    if (!result.ok) {
      setAnswerError(result.error);
      return;
    }
    runIdRef.current = result.data.runId;
    setDialogOpen(false);
    setAnswer("");
    setPhase({ kind: "running", stage: null });
  }

  const showSend = !running && !sending;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        eyebrow="Kitchen / Recipes"
        title={title}
        actions={
          showSend ? (
            <Button onClick={send}>
              <Send aria-hidden />
              Send for proofreading
            </Button>
          ) : undefined
        }
      />

      {phase.kind === "running" && <ProofreadingPanel stage={phase.stage} />}
      {phase.kind === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          {phase.error}
        </p>
      )}

      {phase.kind === "questions" && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">{QUESTIONS_TITLE}</h2>
          <QuestionList questions={phase.questions} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="serves" className="font-medium">
          Serves
        </label>
        <Input
          id="serves"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          className="w-24"
          value={serves}
          onChange={(e) => setServes(e.target.value)}
        />
        <span>plates</span>
        <span className="text-muted-foreground">
          (the size the source recipe is written for)
        </span>
      </div>

      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      )}

      {SOURCE_SECTIONS.map((section) => (
        <Card
          key={section}
          role="region"
          aria-labelledby={`source-${section}`}
          className="min-w-0"
        >
          <CardHeader className="p-4 pb-2">
            <CardTitle id={`source-${section}`} className="text-base">
              {SECTION_TITLES[section]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <SourceSectionEditor
              ariaLabel={SECTION_TITLES[section]}
              value={initialSections[section]}
              onChange={onSectionChange(section)}
            />
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{QUESTIONS_TITLE}</DialogTitle>
          </DialogHeader>
          {phase.kind === "questions" && (
            <QuestionList questions={phase.questions} />
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="proofread-answer" className="text-sm font-medium">
              Your answer
            </label>
            <Textarea
              id="proofread-answer"
              rows={5}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              aria-invalid={answerError ? true : undefined}
              aria-describedby={
                answerError ? "proofread-answer-error" : undefined
              }
            />
            {answerError && (
              <p
                id="proofread-answer-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {answerError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Close and edit the source
            </Button>
            <Button onClick={sendAnswer} disabled={answering}>
              Send answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
