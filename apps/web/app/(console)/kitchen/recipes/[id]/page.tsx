import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Lock, SquarePen } from "lucide-react";
import {
  auditActionLabel,
  canApproveRecipe,
  canRunProofread,
  mealPlanPlateCounts,
  sectionText,
} from "@camp404/core";
import {
  MAX_PLATES,
  SOURCE_SECTIONS,
  type DraftReport,
  type RecipeStatus,
  type SourceSection,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import type { OpenRun } from "@/components/recipes/proofread-questions";
import { RecipeReader } from "@/components/recipes/recipe-reader";
import { RecipeStatusBadge } from "@/components/recipes/recipe-status-badge";
import { captainPageGate } from "@/lib/captain-gate";
import { getMealPlan } from "@/lib/meal-plan";
import { RECIPES_PATH, recipeEditPath, recipePath } from "@/lib/recipe-copy";
import {
  SOURCE_LABEL,
  formatDay,
  formatDuration,
  formatWhen,
  platesLabel,
} from "@/lib/recipe-labels";
import {
  getPlateCount,
  getProofreadProgress,
  getRecipeDetail,
  listRecipeSources,
  resetStaleRuns,
  type PlateCountDetail,
  type RecipeDetail,
  type RecipeRunDetail,
  type RecipeSourceHistoryEntry,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import { DecisionPanel, EditAndResubmit } from "./decision-panel";
import { PlateBar } from "./plate-bar";
import { ProofreadButton } from "./proofread-button";
import {
  AcceptProofread,
  AddLesson,
  RetypeText,
  StartVariation,
} from "./recipe-actions";
import { RecipeTabs, type RecipeTab } from "./recipe-tabs";

export const dynamic = "force-dynamic";

// Run proofreading's after() work runs inside this page's time budget.
export const maxDuration = 300;

export const metadata = { title: "Recipe — Camp 404" };

// One recipe (#243), in two layouts.
//
// IN THE BOOK (an accepted version), two tabs (the owner's sketch,
// 2026-09-24), the choice in the address (?tab=history) so a link and a
// reload keep it:
//  - Recipe, first: only the refined recipe. The plate chips (plate-bar.tsx,
//    one per distinct count in this year's meal plan), the ingredients beside
//    the method and the cook notes (components/recipes/recipe-reader.tsx), and
//    "How this was scaled". The count shown is in the address (?plates=45)
//    and drawn here on the server: a count with a stored result shows its
//    amounts; one without shows the version's own count and says so. Food
//    does not scale by multiplying, so nothing here does any maths on an
//    amount.
//  - History: where it came from with the original text, every recipe
//    version and every source version (each opens in place, read only),
//    Claude's reports, the lessons learned and the activity log.
//
// BEFORE THE BOOK: composed like the AfrikaBurn console's registration
// review: a breadcrumb, the heading with the status and a meta line, a main
// column with Claude's recipe and the original, and a sticky rail with the
// Decision and History cards.
//
// In both, the heading carries "Edit source" and "Send for proofreading"
// (proofread-button.tsx) for a Kitchen lead or a captain; while Claude's
// questions wait for an answer, the second is "Claude needs more details —
// answer here". The run is read here, on the server, so that survives leaving
// and coming back.
//
// WHO SEES WHAT, decided here on the server:
//  - the member who suggested it, a Kitchen lead or a captain see it at any
//    status; every other approved member sees it only once it has an accepted
//    version, and then only the book's parts (no working text, no note, no
//    source versions, no unaccepted proofread). Anyone else gets a 404, as if
//    it did not exist.
//  - the Decision buttons, "Edit source", "Send for proofreading" and the
//    "Proofread for N" chips render for a Kitchen lead or a captain (sending
//    to Claude is theirs too, the owner's decision 2A). The actions and the
//    writes check again. There is no daily limit and no run counter.
//  - Claude's reports and unaccepted drafts render for a Kitchen lead or a
//    captain only; the original text, the source versions and the member's
//    note for them and the submitter. What is not rendered here never reaches
//    the browser.

/** The statuses a run may be queued from (the queue's rule). */
const QUEUEABLE: readonly RecipeStatus[] = [
  "approved",
  "proofread",
  "accepted",
];

/** The statuses whose working text a reviewer may retype (the write's rule). */
const RETYPABLE: readonly RecipeStatus[] = [
  "suggested",
  "approved",
  "proofread",
];

/** A count from the address: a whole number from 1 to MAX_PLATES, or null. */
function platesParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,4}$/.test(raw)) return null;
  const plates = Number(raw);
  return plates >= 1 && plates <= MAX_PLATES ? plates : null;
}

/** The tab in the address; anything else is the recipe. */
function tabParam(value: string | string[] | undefined): RecipeTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "history" ? "history" : "recipe";
}

/** Claude's report, for the Kitchen's reviewers only. */
function ReportLists({
  heading,
  report,
}: {
  heading: string;
  report: DraftReport;
}) {
  if (report.changed.length === 0 && report.unsure.length === 0) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <h3 className="font-medium">{heading}</h3>
        <p className="text-muted-foreground">Nothing changed or unsure.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium">{heading}</h3>
      {report.changed.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Changed
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.changed.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {report.unsure.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Unsure
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.unsure.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Claude's recipe from an older draft run still waiting in `proofread`, read
 * only at the plates it was written for, to accept as written. A source run
 * writes its version straight into the book, so only these legacy drafts
 * reach here. Reviewers only.
 */
function DraftArticle({
  detail,
  run,
  nextVersion,
}: {
  detail: RecipeDetail;
  run: RecipeRunDetail;
  nextVersion: number;
}) {
  return (
    <Card role="article" aria-labelledby="recipe-draft">
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle id="recipe-draft" className="text-base">
            Claude&apos;s recipe
          </CardTitle>
          <CardDescription>
            {run.draft
              ? `Written for ${platesLabel(run.draft.recipe.plates)}. Accepting saves it as version ${nextVersion}.`
              : "This run's answer is in an older shape and cannot be accepted. A captain or a Kitchen lead can send it again."}
          </CardDescription>
        </div>
        {run.draft && (
          <div className="flex flex-wrap items-start gap-2">
            <AcceptProofread recipeId={detail.id} runId={run.id} />
          </div>
        )}
      </CardHeader>
      {run.draft && (
        <CardContent className="flex flex-col gap-8">
          {run.draft.recipe.summary && (
            <p className="text-sm text-muted-foreground">
              {run.draft.recipe.summary}
            </p>
          )}
          <RecipeReader
            recipe={run.draft.recipe}
            idPrefix="draft"
            layout="stacked"
          />
          <ReportLists heading="Claude's report" report={run.draft.report} />
        </CardContent>
      )}
    </Card>
  );
}

function Rail({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card role="article" aria-labelledby={id} className={className}>
      <CardHeader>
        <CardTitle id={id} className="text-base">
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function OriginalCard({
  detail,
  canRetype,
}: {
  detail: RecipeDetail;
  canRetype: boolean;
}) {
  return (
    <Card role="article" aria-labelledby="recipe-original">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle id="recipe-original" className="text-base">
            Original
          </CardTitle>
          <CardDescription>
            As it was suggested
            {detail.textAuthorId !== detail.submitterId
              ? ", with the text retyped by a Kitchen reviewer"
              : ""}
            .
          </CardDescription>
        </div>
        {canRetype && <RetypeText recipeId={detail.id} text={detail.text} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {detail.sourceUrl && (
          <a
            href={detail.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 break-all text-accent hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {detail.sourceUrl}
          </a>
        )}
        {detail.text ? (
          <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">
            {detail.text}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No text yet. The server never opens the link, so a Kitchen lead or a
            captain pastes the recipe in before it can be proofread.
          </p>
        )}
        {detail.suitabilityNote && (
          <div>
            <p className="font-medium">Why it suits the camp</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {detail.suitabilityNote}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function decisionText(detail: RecipeDetail, reviewer: boolean): string {
  switch (detail.status) {
    case "suggested":
      return reviewer
        ? "Approving sends nothing anywhere: sending it to Claude is a separate step."
        : "Waiting for a Kitchen lead or a captain to decide.";
    case "changes_requested":
      return `Sent back to ${detail.submitterName ?? "the member"} for changes.`;
    case "rejected":
      return "Rejected. A rejected recipe stays rejected.";
    case "accepted":
      return "Approved and in the recipe book.";
    default:
      return "Approved.";
  }
}

type HistoryItem = {
  key: string;
  what: string;
  who: string | null;
  when: Date;
};

function historyOf(detail: RecipeDetail): HistoryItem[] {
  const run = detail.latestRun;
  return [
    {
      key: "suggested",
      what: "Suggested",
      who: detail.submitterName,
      when: detail.createdAt,
    },
    ...detail.history.map((h, i) => ({
      key: `audit-${i}`,
      what: auditActionLabel(h.action),
      who: h.actorName,
      when: h.createdAt,
    })),
    ...(run && run.finishedAt && run.outcome !== "queued"
      ? [
          {
            key: "run",
            what:
              run.outcome === "succeeded"
                ? run.questions?.length
                  ? "Claude asked questions"
                  : "Claude wrote it as a recipe"
                : run.outcome === "failed"
                  ? "Claude's run failed"
                  : "Sent to Claude",
            who: null,
            when: run.finishedAt,
          },
        ]
      : []),
  ].sort((a, b) => a.when.getTime() - b.when.getTime());
}

function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((h) => (
        <li key={h.key} className="text-sm">
          <div className="font-medium">{h.what}</div>
          <div className="text-xs text-muted-foreground">
            {h.who ? `${h.who} · ` : ""}
            {formatWhen(h.when)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function VariationOf({ detail }: { detail: RecipeDetail }) {
  if (!detail.variantOfRecipeId) return null;
  return (
    <p className="text-sm text-muted-foreground">
      A variation of{" "}
      <Link
        href={recipePath(detail.variantOfRecipeId)}
        className="text-accent hover:underline"
      >
        another recipe
      </Link>
      .
    </p>
  );
}

const SOURCE_SECTION_TITLES: Record<SourceSection, string> = {
  ingredients: "Ingredients",
  equipment: "Equipment",
  steps: "Steps",
  notes: "Notes",
};

/** The recipe's newest run on the recipe itself, for the heading's button. */
function openRunOf(
  progress: Awaited<ReturnType<typeof getProofreadProgress>>,
): OpenRun | null {
  if (!progress || progress.kind === "plates") return null;
  return {
    runId: progress.runId,
    stage: progress.stage,
    outcome: progress.outcome,
    questions: progress.questions,
  };
}

/**
 * "Edit source" and "Send for proofreading" (or, while Claude waits for
 * answers, "Claude needs more details — answer here"), then the status.
 */
function HeadingActions({
  detail,
  canEdit,
  canSend,
  run,
}: {
  detail: RecipeDetail;
  canEdit: boolean;
  /** A captain or a Kitchen lead, on a recipe a run may be sent for. */
  canSend: boolean;
  run: OpenRun | null;
}) {
  return (
    <>
      {canEdit && (
        <Button asChild variant="outline">
          <Link href={recipeEditPath(detail.id)}>
            <SquarePen aria-hidden />
            Edit source
          </Link>
        </Button>
      )}
      {canSend && <ProofreadButton recipeId={detail.id} run={run} />}
      <RecipeStatusBadge status={detail.status} />
    </>
  );
}

/** Every recipe version, newest first; each opens in place to be read. */
function VersionList({
  versions,
  currentId,
}: {
  versions: RecipeDetail["versions"];
  currentId: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {versions.map((v) => (
        <li key={v.id} className="py-2.5 text-sm">
          <details>
            <summary className="flex cursor-pointer list-none flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-accent hover:underline">
                  Version {v.version}
                </span>
                {v.id === currentId && <Badge variant="success">Current</Badge>}
                <span className="text-muted-foreground">
                  · {platesLabel(v.plates)}
                </span>
              </span>
              {v.reason && (
                <span className="text-muted-foreground">{v.reason}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {v.authorName ?? "A former member"} · {formatDay(v.createdAt)}
              </span>
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <RecipeReader
                recipe={v.recipe}
                idPrefix={`version-${v.version}`}
                layout="stacked"
              />
              {v.scalingNotes.length > 0 && (
                <div>
                  <p className="font-medium">How this was scaled</p>
                  <ul className="mt-1 list-disc space-y-1 break-words pl-5">
                    {v.scalingNotes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Every version of the recipe's source, newest first, each readable. */
function SourceVersionList({
  sources,
}: {
  sources: RecipeSourceHistoryEntry[];
}) {
  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">No source yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {sources.map((source) => (
        <li key={source.id} className="py-2.5 text-sm">
          <details>
            <summary className="flex cursor-pointer list-none flex-col gap-0.5">
              <span className="font-medium text-accent hover:underline">
                Source version {source.version}
              </span>
              <span className="text-xs text-muted-foreground">
                {source.authorName ?? "A former member"} ·{" "}
                {formatDay(source.createdAt)}
                {source.serves !== null
                  ? ` · Serves ${platesLabel(source.serves)}`
                  : ""}
              </span>
            </summary>
            <div className="mt-3 flex max-h-[32rem] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
              {SOURCE_SECTIONS.map((key) => {
                const text = sectionText(source.sections[key]);
                return text ? (
                  <div key={key}>
                    <p className="font-medium">{SOURCE_SECTION_TITLES[key]}</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {text}
                    </p>
                  </div>
                ) : null;
              })}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Where the recipe came from: the suggestion, the link, the original text. */
function WhereItCameFrom({
  detail,
  privileged,
}: {
  detail: RecipeDetail;
  privileged: boolean;
}) {
  return (
    <Rail id="recipe-source" title="Where it came from">
      <p className="text-sm text-muted-foreground">
        Suggested by {detail.submitterName ?? "a former member"} ·{" "}
        {SOURCE_LABEL[detail.source]} · {formatDay(detail.createdAt)}
      </p>
      {detail.sourceUrl && (
        <a
          href={detail.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 break-all text-sm text-accent hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {detail.sourceUrl}
        </a>
      )}
      {privileged && (
        <details className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Original text
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {detail.text ? (
              <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap">
                {detail.text}
              </div>
            ) : (
              <p className="text-muted-foreground">No text.</p>
            )}
            {detail.suitabilityNote && (
              <div>
                <p className="font-medium">Why it suits the camp</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {detail.suitabilityNote}
                </p>
              </div>
            )}
          </div>
        </details>
      )}
    </Rail>
  );
}

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const reviewer = canApproveRecipe(rank, leadTeams);
  // Captains and Kitchen leads send recipes to Claude (the owner's decision
  // 2A).
  const canRun = canRunProofread(rank, leadTeams);

  // No cron: a run that stopped, or was queued and never started, is handed
  // back every time a Kitchen page loads, before the recipe is read.
  await resetStaleRuns(new Date());
  const detail = await getRecipeDetail(id);
  if (!detail) notFound();
  const isSubmitter = detail.submitterId === campUser.id;
  // The submitter and the Kitchen's reviewers see a recipe at every status;
  // every other member only once it is in the book.
  const privileged = isSubmitter || reviewer;
  if (!privileged && detail.acceptedVersionId === null) notFound();

  const current = detail.currentVersion;
  const run = detail.latestRun;
  const reviewing =
    reviewer && detail.status === "proofread" && run?.outcome === "succeeded";
  // "Edit source" opens the source editor, for the Kitchen's reviewers: in the
  // book once the recipe is accepted, before it while it is approved or
  // proofread. The editor page and its send check again.
  const canEdit =
    reviewer &&
    (current
      ? detail.status === "accepted"
      : detail.status === "approved" || detail.status === "proofread");
  // "Send for proofreading" wherever a run may be queued, and while one is
  // with Claude (the button then spins and follows it).
  const canSend =
    canRun &&
    (QUEUEABLE.includes(detail.status) ||
      detail.status === "queued" ||
      detail.status === "analysing");
  const openRun = canSend
    ? openRunOf(await getProofreadProgress(detail.id))
    : null;
  const actions = (
    <HeadingActions
      detail={detail}
      canEdit={canEdit}
      canSend={canSend}
      run={openRun}
    />
  );
  const history = historyOf(detail);

  if (current) {
    // --- In the book: two tabs. --------------------------------------------
    const tab = tabParam(query.tab);
    const recipe = current.recipe;
    const ready = detail.plateCounts.map((c) => c.plates);
    const wanted = platesParam(query.plates);
    const total = formatDuration(recipe.totalTimeMinutes);
    const meta = [
      `Written for ${platesLabel(current.plates)}`,
      `Version ${current.version}`,
      total ? `Total ${total}` : null,
    ].filter((m): m is string => m !== null);

    const heading = (
      <div className="flex flex-col gap-2">
        <PageHeading
          eyebrow="Kitchen / Recipes"
          title={detail.title}
          description={recipe.summary ?? undefined}
          actions={actions}
        />
        <p className="-mt-4 text-sm text-muted-foreground tabular-nums">
          {meta.join(" · ")}
        </p>
        <VariationOf detail={detail} />
      </div>
    );

    if (tab === "history") {
      const sources = privileged ? await listRecipeSources(detail.id) : [];
      const countReports = reviewer
        ? await Promise.all(
            detail.plateCounts
              .filter((c) => c.source === "proofread")
              .map((c) => getPlateCount(current.id, c.plates)),
          )
        : [];
      const reports = reviewer
        ? [
            ...detail.versions.map((v) =>
              v.report
                ? { heading: `Version ${v.version}`, report: v.report }
                : null,
            ),
            ...countReports.map((c) =>
              c?.report
                ? {
                    heading: `Version ${current.version}, for ${platesLabel(c.plates)}`,
                    report: c.report,
                  }
                : null,
            ),
          ].filter((r): r is { heading: string; report: DraftReport } => !!r)
        : [];

      return (
        <div className="flex min-w-0 flex-col gap-8">
          {heading}
          <RecipeTabs recipeId={detail.id} tab="history" plates={wanted} />

          {reviewing && run ? (
            <DraftArticle
              detail={detail}
              run={run}
              nextVersion={current.version + 1}
            />
          ) : null}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <WhereItCameFrom detail={detail} privileged={privileged} />

            <Rail
              id="recipe-versions"
              title="Recipe versions"
              description="Every version, newest first. Open one to read it."
            >
              <VersionList versions={detail.versions} currentId={current.id} />
              {reviewer && (
                <div>
                  <StartVariation recipeId={detail.id} title={detail.title} />
                </div>
              )}
            </Rail>

            {privileged && (
              <Rail
                id="recipe-source-versions"
                title="Source versions"
                description="Every version of the text Claude reads, newest first. Open one to read it."
              >
                <SourceVersionList sources={sources} />
              </Rail>
            )}

            {reports.length > 0 && (
              <Rail
                id="recipe-report"
                title="Claude's reports"
                description="What Claude changed and was unsure of. For the Kitchen's reviewers."
              >
                {reports.map((r) => (
                  <ReportLists
                    key={r.heading}
                    heading={r.heading}
                    report={r.report}
                  />
                ))}
              </Rail>
            )}

            <Rail
              id="recipe-lessons"
              title="Lessons learned"
              description="What the kitchen learned cooking it, by burn year. Anyone in camp can add one."
            >
              {detail.lessons.length > 0 && (
                <ul className="flex flex-col divide-y divide-border">
                  {detail.lessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex flex-col gap-0.5 py-2.5 text-sm"
                    >
                      <span className="whitespace-pre-wrap">{l.body}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.authorName ?? "A former member"} · Burn {l.cycle} ·{" "}
                        {formatDay(l.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <AddLesson recipeId={detail.id} />
            </Rail>

            <Rail id="recipe-activity" title="Activity">
              <HistoryList items={history} />
            </Rail>
          </div>
        </div>
      );
    }

    // --- The Recipe tab: the refined recipe, at the count in the address. --
    const shown =
      wanted !== null && ready.includes(wanted) ? wanted : current.plates;
    const asked = wanted !== null && !ready.includes(wanted) ? wanted : null;
    const [count, plan]: [
      PlateCountDetail | null,
      Awaited<ReturnType<typeof getMealPlan>>,
    ] = await Promise.all([getPlateCount(current.id, shown), getMealPlan()]);
    const countNotes =
      count && count.source === "proofread"
        ? { plates: shown, notes: count.notes, pots: count.pots }
        : null;

    return (
      <div className="flex min-w-0 flex-col gap-8">
        {heading}
        <RecipeTabs recipeId={detail.id} tab="recipe" plates={wanted} />

        <PlateBar
          key={`${shown}-${asked ?? ""}`}
          recipeId={detail.id}
          versionId={current.id}
          counts={mealPlanPlateCounts(plan.days)}
          ready={ready}
          open={detail.openPlateRuns}
          failed={detail.failedPlateRuns}
          shown={shown}
          asked={asked}
          canRun={canRun}
        />

        <RecipeReader
          recipe={recipe}
          amounts={count?.lines}
          count={countNotes}
        />

        {current.scalingNotes.length > 0 && (
          <section
            aria-labelledby="recipe-scaling"
            className="flex min-w-0 flex-col gap-4"
          >
            <div className="flex items-center gap-3 border-b border-border pb-2">
              <h2
                id="recipe-scaling"
                className="font-mono text-xs uppercase tracking-[0.25em] text-accent"
              >
                How this was scaled
              </h2>
            </div>
            <ul className="list-disc space-y-1 break-words pl-5 text-sm">
              {current.scalingNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // --- Before the book: the review layout. --------------------------------
  const meta = [
    `Suggested by ${detail.submitterName ?? "a former member"}`,
    SOURCE_LABEL[detail.source],
    formatDay(detail.createdAt),
  ];

  return (
    <div>
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href={RECIPES_PATH} className="hover:text-foreground">
          Recipes
        </Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        <span className="text-foreground">{detail.title}</span>
      </nav>

      <PageHeading
        title={detail.title}
        description={meta.join(" · ")}
        actions={actions}
      />
      <div className="-mt-3 mb-6 flex flex-col gap-2">
        <VariationOf detail={detail} />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {reviewing && run ? (
            <DraftArticle detail={detail} run={run} nextVersion={1} />
          ) : null}
          <OriginalCard
            detail={detail}
            canRetype={
              reviewer && !reviewing && RETYPABLE.includes(detail.status)
            }
          />
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-6 lg:sticky lg:top-6 lg:w-[360px]">
          <Rail
            id="recipe-decision"
            title="Decision"
            description={decisionText(detail, reviewer)}
            className="border-accent/40"
          >
            {detail.status === "suggested" && reviewer && (
              <DecisionPanel recipeId={detail.id} />
            )}
            {detail.status === "changes_requested" &&
              privileged &&
              detail.changesNote && (
                <p className="text-sm">
                  <span className="font-medium">What to change:</span>{" "}
                  <span className="whitespace-pre-wrap text-muted-foreground">
                    {detail.changesNote}
                  </span>
                </p>
              )}
            {detail.status === "changes_requested" && isSubmitter && (
              <div>
                <EditAndResubmit
                  recipeId={detail.id}
                  title={detail.title}
                  text={detail.text}
                  suitabilityNote={detail.suitabilityNote}
                  aiConsent={
                    detail.textAuthorId === detail.submitterId &&
                    detail.blockedReason === null
                  }
                />
              </div>
            )}
            {detail.status === "rejected" &&
              privileged &&
              detail.rejectionReason && (
                <p className="text-sm">
                  <span className="font-medium">Why:</span>{" "}
                  <span className="whitespace-pre-wrap text-muted-foreground">
                    {detail.rejectionReason}
                  </span>
                </p>
              )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Every decision is logged to the audit trail.
            </p>
          </Rail>

          <Rail id="recipe-history" title="History">
            <HistoryList items={history} />
          </Rail>
        </aside>
      </div>
    </div>
  );
}
