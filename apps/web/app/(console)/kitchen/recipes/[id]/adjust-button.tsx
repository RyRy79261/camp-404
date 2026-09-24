"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircleQuestion, Sparkles } from "lucide-react";
import { ADJUST_INSTRUCTION_NEEDED } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  ProofreadQuestionsDialog,
  ProofreadingPanel,
  isOpen,
  useRunPoll,
  type OpenRun,
  type RunStage,
} from "@/components/recipes/proofread-questions";
import {
  ANSWER_QUESTIONS_LABEL,
  UNREACHABLE,
  recipePath,
} from "@/lib/recipe-copy";
import { adjustVersionAction } from "../actions";

// "Adjust with Claude" (the owner's option A, 2026-09-24), beside "Send for
// proofreading" on the recipe page and on each version's page, for a captain
// or a Kitchen lead; the page renders it for no one else, and the action
// checks again. It opens a dialog: "What should change?" and "Send to
// Claude". Claude writes the recipe's next version from THIS version and those
// words, and it becomes the current version in the book, as a proofread does.
//
// After the send the dialog shows the same loading panel as the source
// editor (the stages the worker writes on the run, polled once a second).
// Claude's questions open the same questions dialog as "Send for
// proofreading", and while they wait the button is "Claude needs more
// details — answer here". A finished run opens the recipe page (or reloads
// it, when that is where the button is). A failure says why in the dialog,
// with the words kept; with the dialog closed, in a toast.
//
// While another run on the recipe is with Claude (the page read it on the
// server), the button is disabled: a new run cannot be queued until that one
// settles, and "Send for proofreading" beside it follows that run.

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: RunStage | null }
  | { kind: "questions"; runId: string; questions: string[] };

export function AdjustButton({
  recipeId,
  versionId,
  version,
  run = null,
}: {
  recipeId: string;
  /** The version Claude changes. */
  versionId: string;
  /** Its number in the book, for the dialog's words. */
  version: number;
  /** The recipe's newest run on the recipe itself, as the server read it. */
  run?: OpenRun | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const runIdRef = useRef("");

  useRunPoll({
    recipeId,
    runIdRef,
    active: phase.kind === "running",
    onStage: (stage) => setPhase({ kind: "running", stage }),
    onSettled: (settled) => {
      if (settled.kind === "questions") {
        setPhase({
          kind: "questions",
          runId: runIdRef.current,
          questions: settled.questions,
        });
        setDialogOpen(false);
        setQuestionsOpen(true);
        return;
      }
      setPhase({ kind: "idle" });
      if (settled.kind === "failed") {
        // The words stay, so the reviewer can send them again.
        // useRunPoll keeps the latest handlers, so this is the dialog now.
        if (dialogOpen) setError(settled.error);
        else toast.error(settled.error);
        return;
      }
      setDialogOpen(false);
      setInstruction("");
      const recipePage = recipePath(recipeId);
      if (pathname === recipePage) router.refresh();
      else router.push(recipePage);
    },
  });

  async function send() {
    if (!instruction.trim()) {
      setError(ADJUST_INSTRUCTION_NEEDED);
      return;
    }
    setSending(true);
    setError(null);
    let result: Awaited<ReturnType<typeof adjustVersionAction>>;
    try {
      result = await adjustVersionAction({ recipeId, versionId, instruction });
    } catch {
      setError(UNREACHABLE);
      return;
    } finally {
      setSending(false);
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    runIdRef.current = result.data.runId;
    setPhase({ kind: "running", stage: null });
  }

  const running = phase.kind === "running";

  const trigger =
    phase.kind === "questions" ? (
      <Button variant="outline" onClick={() => setQuestionsOpen(true)}>
        <MessageCircleQuestion aria-hidden />
        {ANSWER_QUESTIONS_LABEL}
      </Button>
    ) : running ? (
      <Button variant="outline" onClick={() => setDialogOpen(true)}>
        <Spinner size="sm" label="Under way:" />
        Claude is adjusting
      </Button>
    ) : (
      <Button
        variant="outline"
        disabled={isOpen(run)}
        onClick={() => {
          setError(null);
          setDialogOpen(true);
        }}
      >
        <Sparkles aria-hidden />
        Adjust with Claude
      </Button>
    );

  return (
    <>
      {trigger}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust with Claude</DialogTitle>
            <DialogDescription>
              Claude writes the next version from version {version} and what you
              say should change. It becomes the current version in the book.
            </DialogDescription>
          </DialogHeader>
          {phase.kind === "running" ? (
            <ProofreadingPanel stage={phase.stage} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="adjust-instruction"
                className="text-sm font-medium"
              >
                What should change?
              </label>
              <Textarea
                id="adjust-instruction"
                rows={5}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={
                  error ? "adjust-instruction-error" : undefined
                }
              />
              {error && (
                <p
                  id="adjust-instruction-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {running ? "Close" : "Cancel"}
            </Button>
            {!running && (
              <Button onClick={send} disabled={sending}>
                {sending && <Spinner size="sm" label="Under way:" />}
                Send to Claude
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {phase.kind === "questions" && (
        <ProofreadQuestionsDialog
          key={phase.runId}
          open={questionsOpen}
          onOpenChange={setQuestionsOpen}
          recipeId={recipeId}
          runId={phase.runId}
          questions={phase.questions}
          closeLabel="Answer later"
          onAnswered={(next) => {
            runIdRef.current = next;
            setQuestionsOpen(false);
            setPhase({ kind: "running", stage: null });
            setDialogOpen(true);
          }}
        />
      )}
    </>
  );
}
