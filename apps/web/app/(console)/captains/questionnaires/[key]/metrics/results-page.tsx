import { aggregateQuestions, CAMP_TIME_ZONE } from "@camp404/core";
import { Card, CardContent } from "@camp404/ui/components/card";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import {
  ResultsView,
  type ResultRowView,
  type ResultsTab,
} from "@/components/questionnaires/results-view";
import { audienceLabel, getTeamsConfig, teamLabelMap } from "@/lib/camp-config";
import { answerColumns, formatAnswer } from "../responses/answer-values";
import { responsesCsvHref } from "../responses/csv-export";
import { ReminderButton } from "./reminder-button";
import {
  emptyStateFor,
  loadResults,
  recipientsOf,
  respondentsOf,
  summarise,
  type ResultsSummary,
  type ResultsView as ResultsViewData,
} from "./results-data";
import {
  ResultsLocked,
  ResultsShell,
  ResultsUnpublished,
} from "./results-shell";

// One results page behind two addresses. /metrics opens on Summary and
// /responses on Individual (docs/questionnaire-builder.md §7.1–7.3); the tabs
// switch between them in place, as on AfrikaBurn's activation results page.
//
// Captain-only: the gate and the read both live in loadResults, so a
// non-captain's request never fetches an answer.
//
// Per-CYCLE by construction. The read filters on (definitionKey, cycle) and
// never on activationId — see the header of packages/db/src/questionnaire-
// results.ts for why filtering by activation silently blanks an earlier send.
//
// The aggregation is `aggregateQuestions` from @camp404/core, the only place
// the privacy rules are enforced: free text is counted and never listed, every
// "Other…" answer collapses into one row, and a removed question's answers are
// counted, never shown. The answers the Individual tab shows go through
// `formatAnswer`, the label path the CSV export also uses.

const COMPLETED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});

export async function ResultsPage({
  questionnaireKey,
  cycleParam,
  initialTab,
}: {
  questionnaireKey: string;
  cycleParam: string | undefined;
  initialTab: ResultsTab;
}) {
  const access = await loadResults(questionnaireKey, cycleParam);
  if (!access.ok) {
    return access.reason === "locked" ? (
      <ResultsLocked questionnaireKey={questionnaireKey} />
    ) : (
      <ResultsUnpublished questionnaireKey={questionnaireKey} />
    );
  }

  return <ResultsBody view={access.view} initialTab={initialTab} />;
}

/** The results of one loaded, captain-cleared view. */
async function ResultsBody({
  view,
  initialTab,
}: {
  view: ResultsViewData;
  initialTab: ResultsTab;
}) {
  const respondents = respondentsOf(view);
  const summary = summarise(view);
  const aggregate = aggregateQuestions(
    view.questions,
    respondents.map((r) => r.responses),
  );
  const columns = answerColumns(view.questions, respondents);
  const rows: ResultRowView[] = recipientsOf(view).map((recipient) => {
    const answered = recipient.respondent;
    return {
      userId: recipient.userId,
      name: recipient.name,
      status: recipient.status,
      completedLabel: answered ? COMPLETED.format(answered.completedAt) : "—",
      answers: answered
        ? columns.map((column) => formatAnswer(column, answered.responses))
        : null,
      version: answered?.definitionVersion ?? null,
    };
  });

  const active = view.activeActivation;
  // A team's label is camp config, so it is read only for a team send.
  const audience = active
    ? audienceLabel(
        active.scope,
        active.team,
        active.scope === "team"
          ? teamLabelMap(await getTeamsConfig())
          : undefined,
      )
    : null;

  return (
    <ResultsShell view={view} audience={audience}>
      {(active || summary.respondents > 0) && (
        <CompletionCard
          view={view}
          summary={summary}
          questionCount={view.questions.length}
        />
      )}
      <ResultsView
        questionnaireKey={view.key}
        cycle={view.cycle}
        summary={aggregate}
        questions={view.questions}
        rows={rows}
        columns={columns.map((column) => ({
          id: column.id,
          label: column.question ? column.label : column.id,
          removed: column.question === null,
        }))}
        exportHref={responsesCsvHref(view.key, view.cycle)}
        empty={emptyStateFor(view, respondents.length)}
        initialTab={initialTab}
      />
    </ResultsShell>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * AfrikaBurn's completion card: the rate, the bar, and what the numbers are
 * made of. Completion is over the send being viewed; waived and expired gates
 * leave the denominator (§7.1), so they are named here rather than vanishing.
 */
function CompletionCard({
  view,
  summary,
  questionCount,
}: {
  view: ResultsViewData;
  summary: ResultsSummary;
  questionCount: number;
}) {
  const pct = summary.completionPercent;
  const closed = summary.sent - summary.completed - summary.outstanding;
  const facts = [
    `${plural(summary.respondents, "answer", "answers")} summarised`,
    `${summary.outstanding} still to answer`,
    ...(closed > 0 ? [`${closed} closed without answering`] : []),
    `${plural(questionCount, "question", "questions")} in the current definition`,
  ];

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex shrink-0 flex-col">
          <span className="text-3xl font-semibold tabular-nums">
            {pct === null ? "—" : `${pct}%`}
          </span>
          <span className="text-xs text-muted-foreground">
            {summary.sent > 0
              ? `${summary.completed} of ${summary.completed + summary.outstanding} completed`
              : "Reach isn't recorded for this send."}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <ProgressBar
            value={pct ?? 0}
            label="Completion"
            className="h-2.5 [&>div]:bg-success"
          />
          <span className="text-xs text-muted-foreground">
            {facts.join(" · ")}
          </span>
          {(summary.inProgress > 0 || summary.reachIsPartial) && (
            <p className="text-xs text-muted-foreground">
              {summary.inProgress > 0 &&
                `${summary.inProgress} started and haven't finished — their part-answers aren't counted.`}
              {/*
                §7.1: required_actions keeps one row per (member, questionnaire),
                so a re-send overwrites the previous send's reach in place. The
                answers survive — the count of who was asked does not.
              */}
              {summary.reachIsPartial &&
                " Some answers here came from an earlier send this year, which the completion rate can't account for."}
            </p>
          )}
        </div>
        {/*
          §7.4: the nudge, and only while a send is actually OPEN. A closed send
          expired its pending gates, so there is nobody left holding an
          obligation to be reminded of.
        */}
        {view.activeActivation?.status === "open" && (
          <div className="shrink-0 lg:max-w-xs">
            <ReminderButton
              activationId={view.activeActivation.id}
              outstanding={summary.outstanding}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
