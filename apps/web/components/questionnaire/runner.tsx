"use client";

import * as React from "react";
import { Check, CloudOff, Loader2 } from "lucide-react";
import {
  isAnswerableBlock,
  pageQuestions,
  validateOne,
  type Question,
  type Questionnaire,
  type QuestionnaireResponses,
  type QuestionnaireResponseValue,
  type SaveResult,
} from "@camp404/types";
import {
  deriveProgress,
  isBlockVisible,
  nextPageId,
  pageById,
  presentationBlocks,
  presentationOptions,
  resolvePath,
  visibleBlocks,
} from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { cn } from "@camp404/ui/lib/utils";
import { QuestionField } from "./field";
import { ContentBlockView } from "./content-block";
import { useStepFocus } from "./use-step-focus";

// AfrikaBurn's questionnaire runner (`components/questionnaire/runner.tsx`) on
// Camp 404's kit. Every navigation and completeness decision is delegated to the
// @camp404/core questionnaire runtime — `nextPageId` (branching and `visibleIf`
// page skips), `deriveProgress` (progress + the branch-resolved path),
// `presentationBlocks`/`presentationOptions` (seeded, reload-stable shuffle) —
// so the client walks exactly the path the server re-derives at submit time.
// Content blocks render inline but are never answerable and never counted. A
// question, block or page hidden by its `visibleIf` is not shown, but its
// answer is kept and posted: the server keeps a valid hidden answer, so showing
// the question again restores what was typed.

const FORM_ERROR_KEY = "_form";
const ROOT_ERROR_KEY = "_root";
const SAVE_FAILED =
  "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.";
const AUTOSAVE_DEBOUNCE_MS = 700;
/** Past this many sections the rail names only the current one on screen. */
const COMPACT_RAIL_AFTER = 5;

/** Save the answers so far; `final` submits them. */
export type RunnerAction = (
  responses: QuestionnaireResponses,
  final: boolean,
) => Promise<SaveResult>;

interface RunnerProps {
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
  action: RunnerAction;
  /** The last page's button. */
  submitLabel?: string;
  /** Save (a draft) on every Next, and stay put when that save fails. */
  persistProgress?: boolean;
  /**
   * Save a draft shortly after the member stops typing, on the server, so a
   * half-filled questionnaire can be picked up on another device.
   */
  autosave?: boolean;
  /** Gate styling: show "N of M answered" instead of step progress. */
  answeredProgress?: boolean;
  /** Gate styling: full-width submit with no Back on a single-page form. */
  fullWidthSubmit?: boolean;
  /** Seed for the deterministic question/option shuffle. Stable per respondent
   * (e.g. `${activationId}:${userId}`) so the order never moves on reload. */
  shuffleSeed?: string;
  /**
   * Start at the first page on the member's path that still has a required
   * question unanswered, rather than at the top, when answers were saved.
   */
  resume?: boolean;
  /**
   * The author preview: nothing is saved, so image questions cannot upload and
   * do not hold up Next.
   */
  preview?: boolean;
  /**
   * Checks across answers that a single question's own rules cannot make (an
   * ID number against its type, a half-filled contact). Keyed by question id,
   * like the server's errors; only the current page's questions are held up.
   */
  checkAnswers?: (responses: QuestionnaireResponses) => Record<string, string>;
  /** Called on every answer change. */
  onResponsesChange?: () => void;
  /** Called after a successful final submit that did not navigate away. */
  onComplete?: () => void;
}

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "failed";

export function QuestionnaireRunner({
  questionnaire,
  initialResponses,
  action,
  submitLabel = "Submit",
  persistProgress = false,
  autosave = false,
  answeredProgress = false,
  fullWidthSubmit = false,
  shuffleSeed = "",
  resume = false,
  preview = false,
  checkAnswers,
  onResponsesChange,
  onComplete,
}: RunnerProps) {
  // The trail is the respondent's ACTUAL walk (branching means the page after
  // this one depends on the answers) — Back pops, Next pushes.
  const [trail, setTrail] = React.useState<string[]>(() =>
    startingTrail(questionnaire, initialResponses, resume),
  );
  const [responses, setResponses] =
    React.useState<QuestionnaireResponses>(initialResponses);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [isPending, startTransition] = React.useTransition();

  const currentPageId = trail[trail.length - 1];
  const headingRef = useStepFocus<HTMLHeadingElement>(
    `${trail.length}:${currentPageId ?? ""}`,
  );

  // --- Server draft autosave ---------------------------------------------
  // A draft save is serialised behind the one before it, so an older draft can
  // never land after a newer one, and a final submit waits for the queue, so a
  // draft can never land after the submit and reopen a finished response.
  const actionRef = React.useRef(action);
  React.useEffect(() => {
    actionRef.current = action;
  });
  const dirty = React.useRef(false);
  const timer = React.useRef<number | undefined>(undefined);
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const submitting = React.useRef(false);

  React.useEffect(() => {
    if (!autosave || !dirty.current) return;
    const snapshot = responses;
    const id = window.setTimeout(() => {
      dirty.current = false;
      setSaveState("saving");
      queue.current = queue.current.then(async () => {
        if (submitting.current) return;
        let ok: boolean;
        try {
          ok = (await actionRef.current(snapshot, false)).ok;
        } catch {
          ok = false;
        }
        // A newer edit owns the indicator now.
        if (!dirty.current) setSaveState(ok ? "saved" : "failed");
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    timer.current = id;
    return () => window.clearTimeout(id);
  }, [responses, autosave]);

  // --- Progress -------------------------------------------------------------
  // deriveProgress walks the BRANCH-RESOLVED path and counts answerable,
  // shown questions only (content blocks are excluded upstream).
  const progress = React.useMemo(
    () => deriveProgress(questionnaire, responses, currentPageId),
    [questionnaire, responses, currentPageId],
  );
  const totalSteps = Math.max(progress.pageCount, 1);
  const stepNumber = Math.min(Math.max(progress.pageIndex, 0) + 1, totalSteps);
  const percent =
    answeredProgress && progress.total > 0
      ? Math.round((progress.answered / progress.total) * 100)
      : Math.round((stepNumber / totalSteps) * 100);

  const nextStep = currentPageId
    ? nextPageId(questionnaire, currentPageId, responses)
    : null;
  const isLast = nextStep === null;
  const soloSubmit = fullWidthSubmit && isLast && trail.length === 1;

  const rail = React.useMemo(
    () => buildRail(questionnaire, progress.path),
    [questionnaire, progress.path],
  );

  const page = currentPageId ? pageById(questionnaire, currentPageId) : null;
  if (!page) return null;

  const blocks =
    page.kind === "questions"
      ? presentationBlocks(page, shuffleSeed).filter((block) =>
          isBlockVisible(block, responses),
        )
      : [];
  const shownQuestions = blocks.filter(isAnswerableBlock);

  function setResponse(id: string, value: QuestionnaireResponseValue) {
    setResponses((prev) => ({ ...prev, [id]: value }));
    dirty.current = true;
    if (autosave) setSaveState("unsaved");
    onResponsesChange?.();
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /** Client-side mirror of the server's per-question validation — the same
   * `validateOne` the server runs inside `validateSubmission`, so what passes
   * here passes there — over the questions shown on this page. */
  function validatePage(): boolean {
    const next: Record<string, string> = {};
    const across = checkAnswers?.(responses) ?? {};
    for (const q of shownQuestions) {
      if (preview && q.kind === "image") continue;
      const result = validateOne(q, responses[q.id]);
      if (!result.ok) {
        next[q.id] = result.error;
        continue;
      }
      const other = across[q.id];
      if (other) next[q.id] = other;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function persist(final: boolean, onOk: () => void) {
    // A pending draft save is dropped: this save carries the same answers.
    window.clearTimeout(timer.current);
    dirty.current = false;
    if (final) submitting.current = true;
    startTransition(async () => {
      try {
        await queue.current;
        const result = await action(responses, final);
        if (!result.ok) {
          submitting.current = false;
          setErrors(result.errors);
          // A server error on a question the respondent can't see is a dead
          // end — jump to the page that owns the first failing question.
          const target = pageOwningError(questionnaire, result.errors);
          if (target && target !== currentPageId) jumpTo(target);
          return;
        }
        if (autosave) setSaveState("saved");
        onOk();
      } catch {
        submitting.current = false;
        setErrors((prev) => ({ ...prev, [FORM_ERROR_KEY]: SAVE_FAILED }));
      }
    });
  }

  /** Rewind the trail to a page already walked, or walk the path up to it. */
  function jumpTo(pageId: string) {
    setTrail((prev) => {
      const at = prev.indexOf(pageId);
      if (at >= 0) return prev.slice(0, at + 1);
      const path = resolvePath(questionnaire, responses);
      const onPath = path.indexOf(pageId);
      return onPath >= 0 ? path.slice(0, onPath + 1) : [pageId];
    });
  }

  function handleNext() {
    if (!validatePage()) return;
    const target = nextStep;
    if (!target) return;
    const advance = () => setTrail((prev) => [...prev, target]);
    if (persistProgress) persist(false, advance);
    else advance();
  }

  function handleBack() {
    // A save failure belongs to the page it happened on.
    setErrors(withoutFormErrors);
    setTrail((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  function handleSubmit() {
    if (!validatePage()) return;
    persist(true, () => onComplete?.());
  }

  // A lone optional question with no answer yet (the profile photo page) says
  // "Skip" rather than "Next" — clearer that nothing is being captured.
  const lone = shownQuestions.length === 1 ? shownQuestions[0] : undefined;
  const skippable =
    !!lone && !isRequired(lone) && isEmptyAnswer(responses[lone.id]);

  const formError = errors[FORM_ERROR_KEY] ?? errors[ROOT_ERROR_KEY];
  const showProgress = answeredProgress || rail.length > 1;
  const compactRail = rail.length > COMPACT_RAIL_AFTER;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (isPending) return;
        if (isLast) handleSubmit();
        else handleNext();
      }}
      className="flex flex-col gap-6"
    >
      {showProgress && (
        <div className="flex flex-col gap-2">
          {rail.length > 1 && (
            <div className="flex items-center justify-between gap-3">
              <ol
                aria-label="Sections"
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
              >
                {rail.map((entry, i) => {
                  const state =
                    i < progress.pageIndex
                      ? "done"
                      : i === progress.pageIndex
                        ? "current"
                        : "upcoming";
                  return (
                    <li
                      key={entry.key}
                      aria-current={state === "current" ? "step" : undefined}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                          state === "current" &&
                            "border-primary bg-primary text-primary-foreground",
                          state === "done" &&
                            "border-primary bg-primary/15 text-primary",
                          state === "upcoming" &&
                            "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {state === "done" ? (
                          <>
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Done: </span>
                          </>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {/* Names are read out everywhere; on a phone, and on a
                          long form beside all but the current section, only
                          the numbers show, so the rail stays one line. */}
                      <span
                        className={cn(
                          "sr-only max-w-[12rem] truncate text-xs font-medium",
                          (!compactRail || state === "current") &&
                            "sm:not-sr-only",
                          state === "upcoming"
                            ? "text-muted-foreground"
                            : "text-foreground",
                        )}
                      >
                        {entry.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                Page {stepNumber} of {totalSteps}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>
              {answeredProgress
                ? `${progress.answered} of ${progress.total} answered`
                : `Step ${stepNumber} of ${totalSteps}`}
            </span>
            <span>{percent}%</span>
          </div>
          <ProgressBar
            value={percent}
            label="Questionnaire progress"
            className="h-1.5"
          />
        </div>
      )}

      {/* Keyed by step, so each page fades in (motion-safe). */}
      <div
        key={`${trail.length}:${page.id}`}
        className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      >
        {page.kind === "intro" ? (
          <div className="flex flex-col gap-3 py-4">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none"
            >
              {page.heading}
            </h2>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {page.body}
            </p>
          </div>
        ) : (
          <>
            <div>
              {rail.length > 1 && (
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                  Section {stepNumber} of {totalSteps}
                </p>
              )}
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-lg font-semibold outline-none"
              >
                {page.title || `Section ${stepNumber}`}
              </h2>
              {page.subtitle && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {page.subtitle}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-5">
              {blocks.map((block) =>
                isAnswerableBlock(block) ? (
                  <QuestionField
                    key={block.id}
                    question={block}
                    value={responses[block.id]}
                    error={errors[block.id]}
                    options={presentationOptions(block, shuffleSeed)}
                    onChange={(value) => setResponse(block.id, value)}
                    uploadsOff={preview}
                  />
                ) : (
                  <ContentBlockView key={block.id} block={block} />
                ),
              )}
            </div>
          </>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div
        className={cn(
          "flex items-center gap-3 border-t border-border pt-4",
          soloSubmit ? "" : "justify-between",
        )}
      >
        {!soloSubmit && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={trail.length <= 1 || isPending}
          >
            Back
          </Button>
        )}
        <div
          className={cn(
            "flex items-center gap-3",
            soloSubmit && "w-full flex-col-reverse sm:flex-row",
          )}
        >
          {autosave && <AutosaveIndicator state={saveState} />}
          <Button
            type="submit"
            disabled={isPending}
            className={soloSubmit ? "w-full sm:flex-1" : ""}
          >
            {isPending
              ? isLast
                ? "Submitting…"
                : "Saving…"
              : isLast
                ? submitLabel
                : skippable
                  ? "Skip"
                  : "Next"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Where the answers stand on the server. The words a screen reader hears are
 * the settled ones — "saved", "not saved" — not a "saving" on every pause.
 */
function AutosaveIndicator({ state }: { state: SaveState }) {
  // The live region is always mounted and never display:none (a region that
  // appears with its text is not announced); empty, it leaves the flex row, so
  // it takes no room.
  return (
    <span
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs text-muted-foreground empty:absolute"
    >
      {(state === "saving" || state === "unsaved") && (
        <span className="flex items-center gap-1.5" aria-hidden>
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          Saving…
        </span>
      )}
      {state === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-success" aria-hidden />
          Saved
        </>
      )}
      {state === "failed" && (
        <>
          <CloudOff className="h-3.5 w-3.5 text-destructive" aria-hidden />
          Not saved
        </>
      )}
    </span>
  );
}

/**
 * The walk to start on. Normally the first shown page. With `resume` and saved
 * answers, the path up to the first page still holding a required question
 * without a valid answer, so Back retraces it; a complete set starts at the top
 * (a re-read of carried-over answers is the point).
 */
function startingTrail(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses,
  resume: boolean,
): string[] {
  const path = resolvePath(questionnaire, responses);
  if (path.length === 0) return [];
  if (resume && Object.keys(responses).length > 0) {
    for (let i = 0; i < path.length; i++) {
      const page = pageById(questionnaire, path[i]!);
      if (!page) continue;
      const incomplete = visibleBlocks(page, responses)
        .filter(isAnswerableBlock)
        .some((q) => !validateOne(q, responses[q.id]).ok);
      if (incomplete) return path.slice(0, i + 1);
    }
  }
  return [path[0]!];
}

interface RailEntry {
  key: string;
  label: string;
}

/** Labels for the step rail: the branch-resolved pages. Re-derived from
 * `progress.path`, so a branch change reshapes it. */
function buildRail(
  questionnaire: Questionnaire,
  path: readonly string[],
): RailEntry[] {
  const out: RailEntry[] = [];
  path.forEach((pageId, i) => {
    const page = pageById(questionnaire, pageId);
    if (!page) return;
    const label = page.kind === "questions" ? page.title : page.heading;
    out.push({ key: pageId, label: label || `Section ${i + 1}` });
  });
  return out;
}

/** The page holding the first question the server rejected (so the runner can
 * surface an off-page validation error instead of silently swallowing it). */
function pageOwningError(
  questionnaire: Questionnaire,
  errors: Record<string, string>,
): string | null {
  const ids = new Set(
    Object.keys(errors).filter(
      (k) => k !== FORM_ERROR_KEY && k !== ROOT_ERROR_KEY,
    ),
  );
  if (ids.size === 0) return null;
  for (const page of questionnaire.pages) {
    if (pageQuestions(page).some((q) => ids.has(q.id))) return page.id;
  }
  return null;
}

function withoutFormErrors(
  errors: Record<string, string>,
): Record<string, string> {
  if (!(FORM_ERROR_KEY in errors) && !(ROOT_ERROR_KEY in errors)) return errors;
  const next = { ...errors };
  delete next[FORM_ERROR_KEY];
  delete next[ROOT_ERROR_KEY];
  return next;
}

function isRequired(question: Question): boolean {
  return "required" in question && question.required === true;
}

function isEmptyAnswer(value: QuestionnaireResponseValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}
