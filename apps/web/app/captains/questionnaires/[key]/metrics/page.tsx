import { ClipboardList } from "lucide-react";
import { aggregateQuestions } from "@camp404/core";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { StatTile } from "@camp404/ui/components/stat-tile";
import { MetricCard, OrphanCard } from "./metric-card";
import { ReminderButton } from "./reminder-button";
import {
  emptyStateFor,
  loadResults,
  respondentsOf,
  summarise,
} from "./results-data";
import {
  ResultsLocked,
  ResultsShell,
  ResultsUnpublished,
} from "./results-shell";

export const dynamic = "force-dynamic";

// Metrics (docs/questionnaire-builder.md §7.1–7.2) — the aggregate view of one
// questionnaire in one year. Captain-only: the gate and the read both live in
// loadResults, so a non-captain's request never fetches an answer.
//
// Per-CYCLE by construction. The read filters on (definitionKey, cycle) and
// never on activationId — see the header of packages/db/src/questionnaire-
// results.ts for why filtering by activation silently blanks an earlier send.
//
// The aggregation is `aggregateQuestions` from @camp404/core — the same engine
// behind the CSV export and the response viewer, and the only place the four
// robustness properties are enforced. Notably it collapses every `other:<typed
// text>` answer into ONE counted row: an "Other…" box is free text, and free
// text does not belong in a histogram label.
export default async function MetricsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { key } = await params;
  const { cycle } = await searchParams;
  const access = await loadResults(key, cycle);

  if (!access.ok) {
    return access.reason === "locked" ? (
      <ResultsLocked questionnaireKey={key} />
    ) : (
      <ResultsUnpublished questionnaireKey={key} />
    );
  }

  const view = access.view;
  const respondents = respondentsOf(view);
  const summary = summarise(view);
  const empty = emptyStateFor(view, respondents.length);
  const results = aggregateQuestions(
    view.questions,
    respondents.map((r) => r.responses),
  );

  return (
    <ResultsShell view={view} viewName="metrics">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          compact
          label="Answered"
          value={summary.respondents}
          icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />}
        />
        <StatTile compact label="Still to answer" value={summary.outstanding} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {summary.sent > 0
          ? `Sent to ${summary.sent} ${summary.sent === 1 ? "member" : "members"}${
              summary.completionPercent === null
                ? ""
                : ` · ${summary.completionPercent}% complete`
            }.`
          : "Reach isn't recorded for this send."}
        {summary.inProgress > 0 &&
          ` ${summary.inProgress} started and haven't finished — their part-answers aren't counted below.`}
        {/*
          §7.1: required_actions keeps one row per (member, questionnaire), so a
          re-send overwrites the previous send's reach in place. The answers
          survive — the count of who was asked does not.
        */}
        {summary.reachIsPartial &&
          " Some answers here came from an earlier send this year, which the numbers above can't account for."}
      </p>

      {/*
        §7.4: the nudge, and only while a send is actually OPEN. A closed send
        expired its pending gates, so there is nobody left holding an obligation
        to be reminded of — offering the button there would promise an action
        that can only refuse.
      */}
      {view.activeActivation?.status === "open" && (
        <ReminderButton
          activationId={view.activeActivation.id}
          outstanding={summary.outstanding}
        />
      )}

      {empty ? (
        <EmptyState
          className="mt-6"
          icon={<ClipboardList className="h-5 w-5" aria-hidden />}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {results.questions.map((result) => (
            <MetricCard key={result.questionId} result={result} />
          ))}
          {/* Property 2: answers whose question was deleted after the fact are
              listed after the live questions rather than dropped. */}
          {results.orphans.map((orphan) => (
            <OrphanCard key={orphan.questionId} orphan={orphan} />
          ))}
        </div>
      )}
    </ResultsShell>
  );
}
