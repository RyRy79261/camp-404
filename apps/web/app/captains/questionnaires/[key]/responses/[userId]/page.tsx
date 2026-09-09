import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge } from "@camp404/ui/components/badge";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import {
  cycleLabel,
  loadResults,
  respondentsOf,
} from "../../metrics/results-data";
import { ResultsLocked, ResultsUnpublished } from "../../metrics/results-shell";
import { answerColumns, formatAnswer } from "../answer-values";

export const dynamic = "force-dynamic";

const COMPLETED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// One member's answers to one questionnaire in one year (§7.3, "per-respondent
// detail view"). Same gate and same year resolution as the table it is reached
// from — a deep link into this page is captain-checked on its own, not on the
// strength of having come from the list.
export default async function RespondentPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; userId: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { key, userId } = await params;
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
  const respondent = respondentsOf(view).find((r) => r.userId === userId);
  const backHref = `/captains/questionnaires/${key}/responses?cycle=${view.cycle}`;
  const year = cycleLabel(view.cycle, view.currentCycle);

  const chrome = (children: ReactNode) => (
    <main className="mx-auto max-w-lg px-4 py-6">
      <GhostBack href={backHref} className="-ml-2 mb-4">
        All answers
      </GhostBack>
      {children}
    </main>
  );

  // A member with no finished answers IN THIS YEAR is not an error — they may
  // have answered a different year, or started and not finished. Say which year
  // came up empty rather than 404ing the whole page.
  if (!respondent) {
    return chrome(
      <EmptyState
        title="No answers this year"
        description={`This member hasn't finished ${view.title} in ${year}.`}
      />,
    );
  }

  // Only the columns this member actually has an answer in — the table's
  // orphan-column pass, narrowed to one person.
  const columns = answerColumns(view.questions, [respondent]);
  if (columns.length === 0) notFound();

  return chrome(
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold">{respondent.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.title} · {year} · finished{" "}
          {COMPLETED.format(respondent.completedAt)}
        </p>
        {respondent.definitionVersion && (
          <Badge variant="outline" className="mt-2">
            answered version {respondent.definitionVersion}
          </Badge>
        )}
      </header>

      <dl className="flex flex-col gap-4">
        {columns.map((column) => (
          <div key={column.id} className="rounded-xl border bg-card/40 p-4">
            <dt className="flex items-start justify-between gap-3 text-sm font-medium">
              <span className="min-w-0 flex-1 break-words">{column.label}</span>
              {!column.question && (
                <Badge variant="warning" className="shrink-0">
                  removed
                </Badge>
              )}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {formatAnswer(column, respondent.responses) || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </>,
  );
}
