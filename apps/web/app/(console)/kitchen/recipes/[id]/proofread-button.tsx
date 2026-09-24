"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion, Send } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  ProofreadQuestionsDialog,
  isOpen,
  pendingQuestions,
  useRunPoll,
  type OpenRun,
} from "@/components/recipes/proofread-questions";
import { ANSWER_QUESTIONS_LABEL, UNREACHABLE } from "@/lib/recipe-copy";
import { proofreadRecipeAction } from "../actions";

// The recipe page's "Send for proofreading" (the owner's sketch, 2026-09-24),
// for a captain or a Kitchen lead; the page renders it for no one else, and
// the action checks again. Claude reads the recipe's newest source as it
// stands, for the largest count in the meal plan, and revises the book's
// version (or writes the first one), or asks questions first.
//
// While the recipe's newest run waits for answers, the button is "Claude
// needs more details — answer here" and opens the questions dialog. The page
// reads the run on the server, so this holds after leaving and coming back.
// While a run is with Claude the button spins and the page polls the run;
// when Claude has written the recipe the page reloads from the server. A
// failure says why in a toast, and the button comes back.

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "questions"; runId: string; questions: string[] };

function initialPhase(run: OpenRun | null): Phase {
  if (isOpen(run)) return { kind: "running" };
  const questions = pendingQuestions(run);
  return questions && run
    ? { kind: "questions", runId: run.runId, questions }
    : { kind: "idle" };
}

export function ProofreadButton({
  recipeId,
  run,
}: {
  recipeId: string;
  /** The recipe's newest run on the recipe itself, as the server read it. */
  run: OpenRun | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(run));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const runIdRef = useRef(run?.runId ?? "");

  useRunPoll({
    recipeId,
    runIdRef,
    active: phase.kind === "running",
    onStage: () => {},
    onSettled: (settled) => {
      if (settled.kind === "questions") {
        setPhase({
          kind: "questions",
          runId: runIdRef.current,
          questions: settled.questions,
        });
        setDialogOpen(true);
        return;
      }
      setPhase({ kind: "idle" });
      if (settled.kind === "failed") toast.error(settled.error);
      router.refresh();
    },
  });

  async function send() {
    setSending(true);
    let result: Awaited<ReturnType<typeof proofreadRecipeAction>>;
    try {
      result = await proofreadRecipeAction({ recipeId });
    } catch {
      toast.error(UNREACHABLE);
      return;
    } finally {
      setSending(false);
    }
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    runIdRef.current = result.data.runId;
    setPhase({ kind: "running" });
  }

  if (phase.kind === "running" || sending) {
    return (
      <Button disabled>
        <Spinner size="sm" label="Under way:" />
        Claude is proofreading
      </Button>
    );
  }

  if (phase.kind === "questions") {
    return (
      <>
        <Button onClick={() => setDialogOpen(true)}>
          <MessageCircleQuestion aria-hidden />
          {ANSWER_QUESTIONS_LABEL}
        </Button>
        <ProofreadQuestionsDialog
          key={phase.runId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          recipeId={recipeId}
          runId={phase.runId}
          questions={phase.questions}
          closeLabel="Answer later"
          onAnswered={(next) => {
            runIdRef.current = next;
            setDialogOpen(false);
            setPhase({ kind: "running" });
          }}
        />
      </>
    );
  }

  return (
    <Button onClick={send}>
      <Send aria-hidden />
      Send for proofreading
    </Button>
  );
}
