"use client";

import * as React from "react";
import type {
  Questionnaire,
  QuestionnairePage,
  QuestionnaireResponses,
  QuestionnaireResponseValue,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { QuestionField } from "./question";
import { validateIdNumber } from "@/lib/id-validation";
import type { SaveResult } from "@/app/onboarding/questionnaire/actions";

// Reserved error-map keys for a page-level (non-field) failure. `_form` is set
// by this component when a save action throws; `_root` is what server actions
// return for non-field failures (e.g. saveFormReplay's "Unknown form.",
// validateResponses' "Malformed response payload"). Both must render in the
// banner. Question ids are always dotted/namespaced (e.g. "id.number"), so
// these underscore keys can never collide with a real question.
const FORM_ERROR_KEY = "_form";
const ROOT_ERROR_KEY = "_root";
const SAVE_FAILED =
  "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.";

interface QuestionnaireWizardProps {
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
  action: (responses: unknown, final: boolean) => Promise<SaveResult>;
  // When false, page-to-page "Next" advances locally without calling the
  // save action — the form is only persisted once on the final submit. Used
  // by the replay flow so the change-log diff compares the stored answers
  // against the final edit, not against half-saved progress. Onboarding
  // leaves this true so a partially-filled signup survives a reload.
  persistProgress?: boolean;
  // Called after a successful final submit. Onboarding relies on the action
  // itself redirecting server-side, so it omits this; the replay flow uses
  // it to show a confirmation and refresh the change log in place.
  onComplete?: () => void;
  // Label for the final-page button (default "Finish").
  submitLabel?: string;
}

export function QuestionnaireWizard({
  questionnaire,
  initialResponses,
  action,
  persistProgress = true,
  onComplete,
  submitLabel = "Finish",
}: QuestionnaireWizardProps) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [responses, setResponses] =
    React.useState<QuestionnaireResponses>(initialResponses);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isPending, startTransition] = React.useTransition();

  const page = questionnaire.pages[pageIndex];
  const isLast = pageIndex === questionnaire.pages.length - 1;

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

  function validatePageLocally(p: QuestionnairePage): boolean {
    if (p.kind === "intro") return true;
    const next: Record<string, string> = {};
    for (const q of p.questions) {
      const v = responses[q.id];
      const missing = v === undefined || v === null || v === "";
      if (missing && "required" in q && q.required) {
        next[q.id] = "This question is required";
        continue;
      }
      // Cross-field: validate id.number against the chosen id.type.
      if (q.id === "id.number" && typeof v === "string" && v.length > 0) {
        const type = responses["id.type"];
        const result = validateIdNumber(
          typeof type === "string" ? type : null,
          v,
        );
        if (!result.ok) next[q.id] = result.error;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleNext() {
    if (!validatePageLocally(page!)) return;
    if (!persistProgress) {
      setPageIndex((i) => Math.min(i + 1, questionnaire.pages.length - 1));
      return;
    }
    startTransition(async () => {
      try {
        const result = await action(responses, false);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setPageIndex((i) => Math.min(i + 1, questionnaire.pages.length - 1));
      } catch {
        // A thrown action (DB outage, encryption misconfig, …) must not leave
        // the user stuck on the page with no feedback — surface a form-level
        // error and let them retry instead of silently swallowing it.
        setErrors((prev) => ({ ...prev, [FORM_ERROR_KEY]: SAVE_FAILED }));
      }
    });
  }

  function handleBack() {
    setPageIndex((i) => Math.max(0, i - 1));
  }

  function handleSubmit() {
    if (!validatePageLocally(page!)) return;
    startTransition(async () => {
      try {
        const result = await action(responses, true);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        // Onboarding's action redirects server-side, so code below never runs
        // there. The replay flow returns normally and uses onComplete to show
        // a confirmation and refresh the change log.
        onComplete?.();
      } catch {
        setErrors((prev) => ({ ...prev, [FORM_ERROR_KEY]: SAVE_FAILED }));
      }
    });
  }

  const isFullScreen =
    page.kind === "intro" ||
    (page.kind === "questions" &&
      page.questions.length === 1 &&
      (page.questions[0]?.kind === "scale" ||
        page.questions[0]?.kind === "long_text" ||
        page.questions[0]?.kind === "image"));

  // A lone optional question with no answer yet (e.g. the profile photo
  // page) lets the user move on with an explicit "Skip" rather than
  // "Next" — clearer that nothing is being captured.
  const lone =
    page.kind === "questions" && page.questions.length === 1
      ? page.questions[0]
      : undefined;
  const isSkippable =
    !!lone &&
    "required" in lone &&
    !lone.required &&
    (() => {
      const v = responses[lone.id];
      return v === undefined || v === null || v === "";
    })();
  const nextLabel = isSkippable ? "Skip" : "Next";

  // A page-level error from either the local catch (_form) or a server action
  // that returned a non-field failure (_root).
  const formError = errors[FORM_ERROR_KEY] ?? errors[ROOT_ERROR_KEY];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isLast) handleSubmit();
        else handleNext();
      }}
      className="flex flex-1 flex-col gap-6"
    >
      <ProgressBar current={pageIndex + 1} total={questionnaire.pages.length} />

      {formError && (
        <p
          role="alert"
          className="rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)]/10 px-3 py-2 text-sm text-[color:var(--color-destructive)]"
        >
          {formError}
        </p>
      )}

      {page.kind === "intro" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
          <h2 className="text-3xl font-bold leading-tight md:text-4xl">
            {page.heading}
          </h2>
          <p className="max-w-prose text-balance text-lg leading-relaxed text-[color:var(--color-muted-foreground)] md:text-xl">
            {page.body}
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{page.title}</h2>
            {page.subtitle && (
              <p className="text-sm text-[color:var(--color-muted-foreground)]">
                {page.subtitle}
              </p>
            )}
          </section>
          <div
            className={
              isFullScreen
                ? "flex flex-1 flex-col gap-5"
                : "flex flex-col gap-5"
            }
          >
            {page.questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={responses[q.id]}
                onChange={(v) => setResponse(q.id, v)}
                error={errors[q.id]}
                fullScreen={isFullScreen}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-auto flex items-center justify-between pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBack}
          disabled={pageIndex === 0 || isPending}
        >
          Back
        </Button>
        <Button type="submit" disabled={isPending}>
          {isLast ? submitLabel : nextLabel}
        </Button>
      </div>
    </form>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-muted)]">
        <div
          className="h-full bg-[color:var(--color-primary)] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-[color:var(--color-muted-foreground)]">
        Step {current} of {total}
      </p>
    </div>
  );
}
