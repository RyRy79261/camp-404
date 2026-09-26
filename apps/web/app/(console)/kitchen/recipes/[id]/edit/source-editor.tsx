"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion, Send } from "lucide-react";
import { z } from "zod";
import {
  RecipeSourceSections,
  SOURCE_SECTIONS,
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
import { Input } from "@camp404/ui/components/input";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ProofreadQuestionsDialog,
  ProofreadingPanel,
  QUESTIONS_TITLE,
  QuestionList,
  isOpen,
  pendingQuestions,
  useRunPoll,
  type OpenRun,
  type RunStage,
} from "@/components/recipes/proofread-questions";
import { SourceSectionEditor } from "@/components/recipes/source-section-editor";
import {
  useDraftAutosave,
  useEditorDraft,
  type EditorDraft,
} from "@/components/os/editor-draft";
import {
  ANSWER_QUESTIONS_LABEL,
  UNREACHABLE,
  recipePath,
} from "@/lib/recipe-copy";
import { sendSourceForProofreadingAction } from "../../actions";

// The source editor's client half (#243, Kitchen): the Send button, the
// loading panel, Claude's questions and the four section editors. The panel
// shows only what the server returns: the stage the worker last wrote on the
// run, polled once a second (useRunPoll). Nothing else moves on the client
// beyond the spinner.
//
//  - Send saves the source (a new version when it changed) and queues the run;
//    the button goes while the run is open.
//  - A run that wrote the recipe: it is in the book; open its page.
//  - A run that asked questions: a dialog with them, and an answer that queues
//    the next round. While they wait for an answer, "Send for proofreading"
//    is replaced by "Claude needs more details — answer here", which opens
//    the dialog again (the owner, 2026-09-24), after a reload too: the page
//    reads the run on the server. Closing the dialog keeps the questions
//    above the editor; a change to the source brings Send back, because the
//    next send starts over from the new text.
//  - A run that failed: its sentence, where the panel was, and the button
//    comes back.
//  - A send the server refused (consent, a newer source) says why above the
//    sections.

export type { OpenRun };
export { POLL_MS } from "@/components/recipes/proofread-questions";

const SECTION_TITLES: Record<SourceSection, string> = {
  ingredients: "Ingredients",
  equipment: "Equipment",
  steps: "Steps",
  notes: "Notes",
};

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: RunStage | null }
  | { kind: "questions"; runId: string; questions: string[] }
  | { kind: "failed"; error: string };

function initialPhase(run: OpenRun | null): Phase {
  if (!run) return { kind: "idle" };
  if (isOpen(run)) return { kind: "running", stage: run.stage };
  const questions = pendingQuestions(run);
  if (questions) return { kind: "questions", runId: run.runId, questions };
  return { kind: "idle" };
}

/**
 * The source as typed, as an unsaved draft (components/os/editor-draft.tsx),
 * for the dirty guard. It names the source version it was typed over. Not
 * kept or restored while `restore` is off (below); the schema is what a
 * restore would check.
 */
const SourceDraft = z.object({
  basedOnSourceId: z.string().max(200).nullable(),
  serves: z.string().max(20),
  sections: RecipeSourceSections,
});
type SourceDraft = z.infer<typeof SourceDraft>;

type SourceEditorProps = {
  recipeId: string;
  title: string;
  basedOnSourceId: string | null;
  serves: number | null;
  sections: RecipeSourceSections;
  run: OpenRun | null;
};

/**
 * The source editor. Unsaved text asks before its window goes. Nothing is
 * kept or restored: PR C changes nothing inside a Kitchen page (plan section
 * 0), and a restored draft would need a note the owner has not approved.
 */
export function SourceEditor(props: SourceEditorProps) {
  const { basedOnSourceId, serves, sections } = props;
  const draft = useEditorDraft<SourceDraft>({
    editor: "recipe-source",
    restore: false,
    baseline: {
      basedOnSourceId,
      serves: serves === null ? "" : String(serves),
      sections,
    },
    parse: (raw) => {
      const parsed = SourceDraft.safeParse(raw);
      return parsed.success && parsed.data.basedOnSourceId === basedOnSourceId
        ? parsed.data
        : null;
    },
  });
  return <SourceEditorForm key={draft.generation} {...props} draft={draft} />;
}

function SourceEditorForm({
  recipeId,
  title,
  basedOnSourceId,
  run,
  draft,
}: SourceEditorProps & { draft: EditorDraft<SourceDraft> }) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(basedOnSourceId);
  const [serves, setServes] = useState(draft.start.serves);
  const initialSections = draft.start.sections;
  const sections = useRef<RecipeSourceSections>(initialSections);
  // The sections as typed, for the draft; the send reads the ref.
  const [typed, setTyped] = useState<RecipeSourceSections>(initialSections);
  const [phase, setPhase] = useState<Phase>(() => initialPhase(run));
  const [dialogOpen, setDialogOpen] = useState(
    () => initialPhase(run).kind === "questions",
  );
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The source changed since Claude asked: the next send starts over. A
  // restored draft is a change.
  const [edited, setEdited] = useState(draft.restored);
  const { saved } = useDraftAutosave(draft, {
    basedOnSourceId: sourceId,
    serves,
    sections: typed,
  });

  const running = phase.kind === "running";

  // The run being polled, so its questions can be answered.
  const runIdRef = useRef(run?.runId ?? "");

  useRunPoll({
    recipeId,
    runIdRef,
    active: running,
    onStage: (stage) => setPhase({ kind: "running", stage }),
    onSettled: (settled) => {
      if (settled.kind === "failed") {
        setPhase({ kind: "failed", error: settled.error });
      } else if (settled.kind === "questions") {
        setEdited(false);
        setDialogOpen(true);
        setPhase({
          kind: "questions",
          runId: runIdRef.current,
          questions: settled.questions,
        });
      } else {
        router.push(recipePath(recipeId));
      }
    },
  });

  const onSectionChange = useCallback(
    (section: SourceSection) => (doc: SourceDoc) => {
      sections.current = { ...sections.current, [section]: doc };
      setTyped(sections.current);
      setEdited(true);
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
    // Saved as a source version: nothing unsaved is left to keep.
    saved({
      basedOnSourceId: result.data.sourceId,
      serves,
      sections: sections.current,
    });
    runIdRef.current = result.data.runId;
    setDialogOpen(false);
    setEdited(false);
    setPhase({ kind: "running", stage: null });
  }

  function answered(runId: string) {
    runIdRef.current = runId;
    setDialogOpen(false);
    setPhase({ kind: "running", stage: null });
  }

  const waiting = phase.kind === "questions" && !edited;
  const action =
    running || sending ? undefined : waiting ? (
      <Button onClick={() => setDialogOpen(true)}>
        <MessageCircleQuestion aria-hidden />
        {ANSWER_QUESTIONS_LABEL}
      </Button>
    ) : (
      <Button onClick={send}>
        <Send aria-hidden />
        Send for proofreading
      </Button>
    );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading eyebrow="Kitchen / Recipes" title={title} actions={action} />

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
          onChange={(e) => {
            setServes(e.target.value);
            setEdited(true);
          }}
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

      {phase.kind === "questions" && (
        <ProofreadQuestionsDialog
          key={phase.runId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          recipeId={recipeId}
          runId={phase.runId}
          questions={phase.questions}
          closeLabel="Close and edit the source"
          onAnswered={answered}
        />
      )}
    </div>
  );
}
