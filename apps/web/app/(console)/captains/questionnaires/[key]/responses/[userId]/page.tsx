import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Card } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  cycleLabel,
  loadResults,
  respondentsOf,
} from "../../metrics/results-data";
import { ResultsLocked, ResultsUnpublished } from "../../metrics/results-shell";
import { answerColumns, formatAnswer } from "../answer-values";

export const dynamic = "force-dynamic";

export const metadata = { title: "A member's answers — Camp 404" };

const COMPLETED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});

// One member's answers to one questionnaire in one year (§7.3, "per-respondent
// detail view"), as a card of question-and-answer rows. Same gate and same year
// resolution as the table it is reached from — a deep link into this page is
// captain-checked on its own, not on the strength of having come from the list.
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
  const year = cycleLabel(view.cycle, view.currentCycle, view.cycleNames);

  // A detail page under a list the nav can't reach, so it carries the
  // AfrikaBurn console's breadcrumb (as on its registration detail page).
  const chrome = (children: ReactNode) => (
    <div className="flex flex-col">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href="/captains/questionnaires" className="hover:text-foreground">
          Questionnaires
        </Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        <Link href={backHref} className="hover:text-foreground">
          {view.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        <span className="text-foreground">{respondent?.name ?? "Member"}</span>
      </nav>
      {children}
    </div>
  );

  // A member with no finished answers IN THIS YEAR is not an error — they may
  // have answered a different year, or started and not finished. Say which year
  // came up empty rather than 404ing the whole page.
  if (!respondent) {
    return chrome(
      <>
        <PageHeading title="Answers" />
        <EmptyState
          title="No answers this year"
          description={`This member hasn't finished ${view.title} in ${year}.`}
        />
      </>,
    );
  }

  // Only the columns this member actually has an answer in — the table's
  // orphan-column pass, narrowed to one person.
  const columns = answerColumns(view.questions, [respondent]);
  if (columns.length === 0) notFound();

  return chrome(
    <>
      <PageHeading
        title={respondent.name}
        description={`${view.title} · ${year} · finished ${COMPLETED.format(respondent.completedAt)}`}
        actions={
          respondent.definitionVersion ? (
            <Badge variant="outline">
              answered version {respondent.definitionVersion}
            </Badge>
          ) : undefined
        }
      />

      <Card className="max-w-3xl">
        <dl className="flex flex-col divide-y divide-border">
          {columns.map((column) => (
            <div key={column.id} className="flex flex-col gap-1 p-5">
              <dt className="flex items-start justify-between gap-3 text-sm font-medium">
                <span className="min-w-0 flex-1 break-words">
                  {column.label}
                </span>
                {!column.question && (
                  <Badge variant="warning" className="shrink-0">
                    removed
                  </Badge>
                )}
              </dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {formatAnswer(column, respondent.responses) || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>,
  );
}
