"use client";

import * as React from "react";
import {
  type BuilderPage,
  type BuilderQuestionnaire,
  type QuestionnaireResponses,
  type QuestionnaireResponseValue,
  evalVisibleIf,
  validateOne,
  visiblePages,
} from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { CloudOff, TriangleAlert } from "lucide-react";
import { QuestionField } from "./question";
import { ContentBlockRenderer } from "./content-block";
import { BlockingNotice, BlockingTopBar } from "./blocking-chrome";
import type { SaveResult } from "@camp404/types";

// The block-based runner for BUILDER questionnaires. It reuses the legacy
// wizard's chrome verbatim (blocking top bar + notice, the _form/_root error
// banner, Back/Continue, startTransition, the persistProgress branch and the
// (responses, final) action contract) and forks only the page/block loop: pages
// come from visiblePages() so branching hides/shows pages, each page renders its
// blocks (content blocks display-only, question blocks honoring their own
// visibleIf), and validation runs per-page over the visible question blocks.

const FORM_ERROR_KEY = "_form";
const ROOT_ERROR_KEY = "_root";
const SAVE_FAILED =
  "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.";

// The first visible page that still has an unsatisfied required (and visible)
// field — where the runner resumes on re-entry (spec §5). 0 when complete/empty.
function firstIncompletePage(
  q: BuilderQuestionnaire,
  responses: QuestionnaireResponses,
): number {
  const pages = visiblePages(q, responses);
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page) continue;
    for (const block of page.blocks) {
      if (block.kind !== "question") continue;
      if (block.visibleIf && !evalVisibleIf(block.visibleIf, responses)) continue;
      if (!validateOne(block.question, responses[block.question.id]).ok) {
        return i;
      }
    }
  }
  return 0;
}

interface BuilderWizardProps {
  questionnaire: BuilderQuestionnaire;
  initialResponses: QuestionnaireResponses;
  action: (responses: unknown, final: boolean) => Promise<SaveResult>;
  // false ⇒ advance locally without saving (preview / author check). true ⇒
  // persist on every Continue so a reload resumes where they left off.
  persistProgress?: boolean;
  onComplete?: () => void;
  submitLabel?: string;
  // "runner" shows the blocking chrome (used for a blocking required action);
  // "onboarding" shows a plain page-progress bar (used by the author preview).
  variant?: "onboarding" | "runner";
  title?: string;
}

export function BuilderWizard({
  questionnaire,
  initialResponses,
  action,
  persistProgress = true,
  onComplete,
  submitLabel = "Finish",
  variant = "runner",
  title,
}: BuilderWizardProps) {
  const [responses, setResponses] =
    React.useState<QuestionnaireResponses>(initialResponses);
  // Runner re-entry resumes at the first incomplete page (spec §5); preview /
  // onboarding (no persisted answers) start at the top.
  const [pageIndex, setPageIndex] = React.useState(() =>
    persistProgress && Object.keys(initialResponses).length > 0
      ? firstIncompletePage(questionnaire, initialResponses)
      : 0,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isPending, startTransition] = React.useTransition();

  // Visibility-aware page list, recomputed from the current answers. `visibleIf`
  // references only earlier fields, so the page the user is ON never changes
  // visibility from its own answers and the index stays valid.
  const pages = visiblePages(questionnaire, responses);
  const clampedIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[clampedIndex];
  const isLast = clampedIndex === pages.length - 1;

  // Progress never goes backward (Back, or a branch hiding a later page, must
  // not drop the bar below the furthest page reached).
  const maxStepRef = React.useRef(pageIndex + 1);

  if (!page) return null;

  function setResponse(id: string, value: QuestionnaireResponseValue) {
    setResponses((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function validateCurrentPage(p: BuilderPage): boolean {
    const next: Record<string, string> = {};
    for (const block of p.blocks) {
      if (block.kind !== "question") continue;
      if (block.visibleIf && !evalVisibleIf(block.visibleIf, responses)) continue;
      const result = validateOne(block.question, responses[block.question.id]);
      if (!result.ok) next[block.question.id] = result.error;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleNext() {
    if (!validateCurrentPage(page!)) return;
    if (!persistProgress) {
      setPageIndex(clampedIndex + 1);
      return;
    }
    startTransition(async () => {
      try {
        const result = await action(responses, false);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setPageIndex(clampedIndex + 1);
      } catch {
        setErrors((prev) => ({ ...prev, [FORM_ERROR_KEY]: SAVE_FAILED }));
      }
    });
  }

  function handleBack() {
    setPageIndex(Math.max(0, clampedIndex - 1));
  }

  function handleSubmit() {
    if (!validateCurrentPage(page!)) return;
    startTransition(async () => {
      try {
        const result = await action(responses, true);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        onComplete?.();
      } catch {
        setErrors((prev) => ({ ...prev, [FORM_ERROR_KEY]: SAVE_FAILED }));
      }
    });
  }

  const formError = errors[FORM_ERROR_KEY] ?? errors[ROOT_ERROR_KEY];
  const isRunner = variant === "runner";
  const current = clampedIndex + 1;
  const total = pages.length;
  maxStepRef.current = Math.max(maxStepRef.current, current);
  // Non-decreasing high-water mark, but clamped to the current visible-page count
  // so branching that hides pages can't render "Page 3 of 2" / >100%. One source
  // for both variants.
  const progressCurrent = Math.min(maxStepRef.current, total);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isLast) handleSubmit();
        else handleNext();
      }}
      className="flex flex-1 flex-col gap-6"
    >
      {isRunner ? (
        <>
          <BlockingTopBar
            title={title ?? questionnaire.title}
            current={progressCurrent}
            total={total}
            showProgress={total > 1}
          />
          <BlockingNotice />
        </>
      ) : (
        total > 1 && <BuilderProgress current={progressCurrent} total={total} />
      )}

      {formError && (
        <Alert variant="error">
          {formError === SAVE_FAILED ? (
            <CloudOff aria-hidden />
          ) : (
            <TriangleAlert aria-hidden />
          )}
          <span className="text-destructive">{formError}</span>
        </Alert>
      )}

      <section className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{page.title}</h2>
        {page.intro && (
          <p className="text-sm text-muted-foreground">{page.intro}</p>
        )}
      </section>

      <div className="flex flex-col gap-5">
        {page.blocks.map((block) => {
          if (block.kind === "question") {
            if (block.visibleIf && !evalVisibleIf(block.visibleIf, responses)) {
              return null;
            }
            const q = block.question;
            return (
              <QuestionField
                key={q.id}
                question={q}
                value={responses[q.id]}
                onChange={(v) => setResponse(q.id, v)}
                error={errors[q.id]}
              />
            );
          }
          return <ContentBlockRenderer key={block.id} block={block} />;
        })}
      </div>

      <div className="mt-auto flex items-center justify-between pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBack}
          disabled={clampedIndex === 0 || isPending}
        >
          Back
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : isLast ? submitLabel : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function BuilderProgress({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          Page {current} of {total}
        </span>
        <span className="font-mono text-xs text-accent">{pct}%</span>
      </div>
      <ProgressBar value={current} max={total} label="Questionnaire progress" />
    </div>
  );
}
