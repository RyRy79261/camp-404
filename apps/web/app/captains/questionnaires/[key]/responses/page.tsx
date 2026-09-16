import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import {
  emptyStateFor,
  loadResults,
  memberName,
  outstandingFor,
  respondentsOf,
  summarise,
} from "../metrics/results-data";
import {
  ResultsLocked,
  ResultsShell,
  ResultsUnpublished,
} from "../metrics/results-shell";
import { answerColumns, formatAnswer } from "./answer-values";
import { responsesCsvHref } from "./csv-export";
import { ExportCsvButton } from "@/components/export-csv-button";

export const dynamic = "force-dynamic";

const COMPLETED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});

// Responses (docs/questionnaire-builder.md §7.3) — one row per member who
// finished the form this year, a column per question, and the CSV. The
// individual half of the same data /metrics aggregates; captain-only, because
// this is the surface where the answers have names on them.
//
// The CSV is built by the export route (./export/route.ts) when a captain
// presses Export, through the shared builder in @camp404/core, the same one
// that owns the label path this table renders through. So there is no second
// escaper to drift, and no file is built on a render nobody downloads.
export default async function ResponsesPage({
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
  const columns = answerColumns(view.questions, respondents);
  const outstanding = outstandingFor(view);

  return (
    <ResultsShell view={view} viewName="responses" wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {summary.respondents}{" "}
          {summary.respondents === 1 ? "answer" : "answers"}
          {summary.inProgress > 0 && ` · ${summary.inProgress} unfinished`}
        </p>
        <ExportCsvButton
          href={responsesCsvHref(view.key, view.cycle)}
          disabled={respondents.length === 0}
        />
      </div>

      {empty ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" aria-hidden />}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        <div className="rounded-xl border bg-card/40">
          {/* Table brings its own horizontal scroll container — a column per
              question outgrows a phone by design, and scrolling it sideways
              beats truncating somebody's answer. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Completed</TableHead>
                {columns.map((column) => (
                  <TableHead key={column.id} className="max-w-56 truncate">
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {respondents.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/captains/questionnaires/${view.key}/responses/${r.userId}?cycle=${view.cycle}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {COMPLETED.format(r.completedAt)}
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell key={column.id} className="max-w-56 truncate">
                      {formatAnswer(column, r.responses) || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {outstanding.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">
            Still to answer ({outstanding.length})
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {outstanding.map((r) => (
              <li
                key={r.userId}
                className="rounded-full border px-3 py-1 text-sm text-muted-foreground"
              >
                {memberName(r.displayName)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </ResultsShell>
  );
}
