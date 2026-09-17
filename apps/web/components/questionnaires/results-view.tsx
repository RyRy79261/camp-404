"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ClipboardList, Eye, FileWarning, Star } from "lucide-react";
import type {
  ChoiceRow,
  NumericAggregate,
  QuestionAggregate,
  QuestionKind,
  ResponseAggregate,
} from "@camp404/core";
import type { Question } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { cn } from "@camp404/ui/lib/utils";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  ResponseViewer,
  type ResponseAnswer,
  type ViewedResponse,
} from "@/components/questionnaires/response-viewer";

// Results, from AfrikaBurn's organiser console
// (apps/org/components/questionnaires/results-view.tsx): a Summary of
// per-question charts and an Individual table of who answered.
//
// Every number on this screen comes from @camp404/core's `aggregateQuestions`;
// nothing is counted here. This module only decides which shape each aggregate
// deserves — bar rows for choices, a histogram for a scale, a star distribution
// for a rating, buckets for times and years, per-row tallies for a grid.
//
// Where it departs from AfrikaBurn, it does so for privacy, and the engine
// enforces it rather than this view:
//   * Free text is a COUNT. AfrikaBurn lists every text answer under its
//     question; a `count` aggregate here carries no values, so there is nothing
//     to list. The answers stay readable one person at a time, by name, on the
//     Individual tab.
//   * "Other…" answers are one counted row. AfrikaBurn quotes each typed
//     "Other" answer back; the engine collapses them before they reach a view.
//   * A removed question's answers are counted, never shown.
//
// The CSV is built on the server (the export route), not in the browser as
// AfrikaBurn does, so it goes through the same captain gate as the page and
// carries the year column.

/** Where one member stands on the send being viewed. */
export type ResultStatus =
  | "completed"
  | "started"
  | "pending"
  | "waived"
  | "expired";

/** A column of the Individual table: a current question or a removed one. */
export interface ResultColumnView {
  id: string;
  label: string;
  removed: boolean;
}

/** One row of the Individual table. */
export interface ResultRowView {
  userId: string;
  name: string;
  status: ResultStatus;
  completedLabel: string;
  /** Answers as text, aligned with the columns; null with no finished answers. */
  answers: string[] | null;
  /** The definition version they answered. */
  version: string | null;
}

export type ResultsTab = "summary" | "individual";

const STATUS_STYLE: Record<
  ResultStatus,
  {
    label: string;
    variant: "success" | "warning" | "secondary" | "outline" | "default";
  }
> = {
  completed: { label: "Completed", variant: "success" },
  started: { label: "Started", variant: "default" },
  pending: { label: "Pending", variant: "warning" },
  waived: { label: "Waived", variant: "secondary" },
  expired: { label: "Expired", variant: "outline" },
};

/**
 * The chart badge on each question. A mapped type over every kind, so a new
 * kind is a compile error here rather than a card with no label.
 */
const KIND_LABEL: { [K in QuestionKind]: string } = {
  single_select: "Choice",
  multi_select: "Choice",
  toggle: "Choice",
  combobox: "Choice",
  scale: "Choice",
  boolean: "Yes / No",
  slider: "Slider",
  number: "Number",
  linear_scale: "Linear scale",
  rating: "Rating",
  short_text: "Text answers",
  long_text: "Text answers",
  date: "Date",
  email: "Email",
  phone: "Phone",
  image: "Image",
  file_link: "File link",
  time: "Dates & times",
  years: "Years",
  multi_choice_grid: "Grid",
  checkbox_grid: "Grid",
};

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

export interface ResultsViewProps {
  questionnaireKey: string;
  cycle: number;
  summary: ResponseAggregate;
  /** The current definition's questions — the scale labels and rating steps. */
  questions: readonly Question[];
  rows: readonly ResultRowView[];
  columns: readonly ResultColumnView[];
  /** The server's CSV export route for this questionnaire and year. */
  exportHref: string;
  /** Why there is nothing to show, or null when there are answers. */
  empty: { title: string; description: string } | null;
  /** The tab the page opened on (/metrics → Summary, /responses → Individual). */
  initialTab?: ResultsTab;
}

export function ResultsView({
  questionnaireKey,
  cycle,
  summary,
  questions,
  rows,
  columns,
  exportHref,
  empty,
  initialTab = "summary",
}: ResultsViewProps) {
  const [tab, setTab] = React.useState<ResultsTab>(initialTab);
  const base = `/captains/questionnaires/${questionnaireKey}` as const;

  function changeTab(next: string) {
    const value: ResultsTab = next === "individual" ? "individual" : "summary";
    setTab(value);
    // Each tab keeps its own URL, so a captain can link to either. The native
    // history call updates the address bar (and Next's router) without a
    // server round trip: both tabs are already on the page.
    try {
      window.history.replaceState(
        null,
        "",
        `${base}/${value === "summary" ? "metrics" : "responses"}?cycle=${cycle}`,
      );
    } catch {
      // A sandboxed frame may refuse history writes; the tab still switches.
    }
  }

  const respondents = rows.filter((row) => row.answers !== null).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          className="w-auto"
          aria-label="Results view"
          value={tab}
          onValueChange={changeTab}
          options={[
            { value: "summary", label: "Summary" },
            { value: "individual", label: "Individual" },
          ]}
        />
        <ExportCsvButton href={exportHref} disabled={respondents === 0} />
      </div>

      {tab === "summary" ? (
        <section aria-label="Summary">
          {empty ? (
            <ResultsEmpty empty={empty} />
          ) : (
            <div className="flex flex-col gap-4">
              <OrphanDisclosure orphans={summary.orphans} />
              {summary.questions.map((aggregate) => (
                <QuestionSummary
                  key={aggregate.questionId}
                  aggregate={aggregate}
                  question={questions.find(
                    (q) => q.id === aggregate.questionId,
                  )}
                  onShowIndividual={() => changeTab("individual")}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Individual">
          {rows.length === 0 ? (
            <ResultsEmpty
              empty={
                empty ?? {
                  title: "Nobody to show",
                  description: "Nobody was asked this questionnaire this year.",
                }
              }
            />
          ) : (
            <IndividualTable
              questionnaireKey={questionnaireKey}
              cycle={cycle}
              rows={rows}
              columns={columns}
            />
          )}
        </section>
      )}
    </div>
  );
}

function ResultsEmpty({
  empty,
}: {
  empty: { title: string; description: string };
}) {
  return (
    <EmptyState
      icon={<ClipboardList aria-hidden />}
      title={empty.title}
      description={empty.description}
    />
  );
}

function IndividualTable({
  questionnaireKey,
  cycle,
  rows,
  columns,
}: {
  questionnaireKey: string;
  cycle: number;
  rows: readonly ResultRowView[];
  columns: readonly ResultColumnView[];
}) {
  const [viewing, setViewing] = React.useState<ViewedResponse | null>(null);

  function memberHref(userId: string): Route {
    return `/captains/questionnaires/${questionnaireKey}/responses/${userId}?cycle=${cycle}`;
  }

  function open(row: ResultRowView) {
    if (!row.answers) return;
    const answers: ResponseAnswer[] = [];
    columns.forEach((column, i) => {
      const value = row.answers?.[i] ?? "";
      // A removed question only matters to the members who answered it.
      if (column.removed && !value) return;
      answers.push({
        id: column.id,
        label: column.label,
        value,
        removed: column.removed,
      });
    });
    setViewing({
      name: row.name,
      submittedLabel: row.completedLabel,
      version: row.version,
      answers,
      href: memberHref(row.userId),
    });
  }

  const tableColumns: ResponsiveColumn<ResultRowView>[] = [
    {
      id: "member",
      header: "Member",
      role: "title",
      cellClassName: "font-medium",
      cell: (row) =>
        row.answers ? (
          <Link
            href={memberHref(row.userId)}
            className="underline-offset-4 hover:underline"
          >
            {row.name}
          </Link>
        ) : (
          row.name
        ),
    },
    {
      id: "status",
      header: "Status",
      role: "badge",
      cell: (row) => {
        const style = STATUS_STYLE[row.status];
        return <Badge variant={style.variant}>{style.label}</Badge>;
      },
    },
    {
      id: "completed",
      header: "Submitted",
      cellClassName: "whitespace-nowrap text-muted-foreground",
      cell: (row) => row.completedLabel,
    },
    {
      id: "response",
      header: "Response",
      role: "actions",
      align: "right",
      cell: (row) =>
        row.answers ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-my-1.5"
            aria-label={`View ${row.name}’s response`}
            onClick={() => open(row)}
          >
            <Eye aria-hidden />
            View
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    // A column per question on a wide screen, so answers can be compared down
    // the page. A phone gets the View button instead of a card per answer.
    ...columns.map(
      (column, i): ResponsiveColumn<ResultRowView> => ({
        id: `answer:${column.id}`,
        header: column.removed ? `${column.label} (removed)` : column.label,
        mobileHidden: true,
        headClassName: "max-w-56 truncate",
        cellClassName: "max-w-56 truncate",
        cell: (row) => (row.answers ? row.answers[i] || "—" : ""),
      }),
    ),
  ];

  return (
    <>
      {/* A table in a card from md up (AfrikaBurn's), and a card per member
          on a phone. */}
      <ResponsiveDataTable
        columns={tableColumns}
        data={rows}
        getRowKey={(row) => row.userId}
        label="Answers"
        className="md:rounded-xl md:border md:bg-card md:shadow-sm"
      />
      <ResponseViewer
        response={viewing}
        onOpenChange={(isOpen) => {
          if (!isOpen) setViewing(null);
        }}
      />
    </>
  );
}

/**
 * Answers whose question no longer exists in the definition. The engine keeps
 * them rather than dropping them silently, so the author can see the data was
 * collected before they deleted the question. Counts only: with the question
 * gone, nothing proves an answer isn't free text.
 */
function OrphanDisclosure({
  orphans,
}: {
  orphans: ResponseAggregate["orphans"];
}) {
  if (orphans.length === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <FileWarning
        className="mt-0.5 h-5 w-5 shrink-0 text-warning"
        aria-hidden
      />
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-semibold text-foreground">
          {orphans.length === 1
            ? "1 question was removed after people answered it"
            : `${orphans.length} questions were removed after people answered them`}
        </p>
        <p className="text-muted-foreground">
          These answers are still stored against the response — they just have
          no question to chart any more. Each person&rsquo;s are on the
          Individual tab.
        </p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {orphans.map((o) => (
            <li key={o.questionId} className="text-xs">
              <span className="font-mono text-foreground">{o.questionId}</span>
              <span className="text-muted-foreground">
                {" "}
                — {o.answered} {o.answered === 1 ? "answer" : "answers"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function QuestionSummary({
  aggregate,
  question,
  onShowIndividual,
}: {
  aggregate: QuestionAggregate;
  question: Question | undefined;
  onShowIndividual: () => void;
}) {
  const multi = "multi" in aggregate && aggregate.multi;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Badge variant="outline" className="self-start">
              {KIND_LABEL[aggregate.kind]}
            </Badge>
            <h3 className="break-words text-base font-semibold">
              {aggregate.prompt}
            </h3>
          </div>
          {/* Percentages below are of the people who ANSWERED, so the skips
              sit beside them: "2 answered" can never pass for everyone. */}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {aggregate.answered} answered · {aggregate.skipped} skipped
            {multi && " · more than one answer each"}
          </span>
        </div>
        <AggregateChart
          aggregate={aggregate}
          question={question}
          onShowIndividual={onShowIndividual}
        />
      </CardContent>
    </Card>
  );
}

function AggregateChart({
  aggregate,
  question,
  onShowIndividual,
}: {
  aggregate: QuestionAggregate;
  question: Question | undefined;
  onShowIndividual: () => void;
}) {
  if (aggregate.answered === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody answered this question.
      </p>
    );
  }

  switch (aggregate.shape) {
    case "choice":
      return <ChoiceRows rows={aggregate.rows} />;

    case "numeric":
      return <NumericChart aggregate={aggregate} question={question} />;

    case "count":
      // Free text, email, phone, a date, an image or a link: counted, never
      // listed. The aggregate holds no values to list.
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            These answers aren&rsquo;t summarised, so nobody&rsquo;s words end
            up on a chart. Read them one person at a time.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onShowIndividual}
          >
            <Eye aria-hidden />
            See individual answers
          </Button>
        </div>
      );

    case "timeline":
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {aggregate.buckets.map((bucket) => (
              <BarRow
                key={bucket.value}
                label={bucket.value}
                count={bucket.count}
                percent={bucket.pct}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Earliest {aggregate.earliest ?? "—"} · latest{" "}
            {aggregate.latest ?? "—"}
          </p>
        </div>
      );

    case "grid":
      return (
        <div className="flex flex-col gap-4">
          {aggregate.rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {row.label}
                  {!row.known && <UnlistedFlag text="removed" />}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.answered} {row.answered === 1 ? "response" : "responses"}
                </span>
              </div>
              {row.answered === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody answered this row.
                </p>
              ) : (
                <ChoiceRows rows={row.cells} />
              )}
            </div>
          ))}
        </div>
      );
  }
}

function ChoiceRows({ rows }: { rows: readonly ChoiceRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <BarRow
          key={row.value}
          label={row.label}
          count={row.count}
          percent={row.pct}
          // A value the definition no longer declares keeps its row, under
          // what is actually stored, and says so.
          flag={row.known ? undefined : "unlisted"}
        />
      ))}
    </div>
  );
}

function NumericChart({
  aggregate,
  question,
}: {
  aggregate: NumericAggregate;
  question: Question | undefined;
}) {
  if (aggregate.samples === 0) {
    // People answered, but nothing parsed as a number. Saying "nobody answered"
    // would contradict the answered count above the chart.
    return (
      <p className="text-sm text-muted-foreground">
        {aggregate.unparsed} {aggregate.unparsed === 1 ? "answer" : "answers"},
        none of them a number. Nothing to average.
      </p>
    );
  }

  const unparsed = aggregate.unparsed > 0 && (
    <p className="text-xs text-muted-foreground">
      {aggregate.unparsed}{" "}
      {aggregate.unparsed === 1 ? "answer isn't" : "answers aren't"} a number
      and {aggregate.unparsed === 1 ? "isn't" : "aren't"} counted here.
    </p>
  );

  if (aggregate.kind === "rating") {
    const steps =
      question?.kind === "rating"
        ? question.steps
        : (aggregate.buckets.at(-1)?.value ?? 0);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {[...aggregate.buckets].reverse().map((bucket) => (
            <BarRow
              key={bucket.value}
              label={
                <span className="flex items-center gap-1">
                  <span className="tabular-nums">{bucket.value}</span>
                  <Star
                    className="h-3.5 w-3.5 fill-current text-warning"
                    aria-hidden
                  />
                  <span className="sr-only">
                    {bucket.value === 1 ? "star" : "stars"}
                  </span>
                </span>
              }
              count={bucket.count}
              percent={bucket.pct}
              flag={bucket.inRange ? undefined : "out of range"}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Average{" "}
          <span className="font-medium tabular-nums text-foreground">
            {aggregate.mean === null ? "—" : NUMBER.format(aggregate.mean)}
          </span>{" "}
          out of {steps}
        </p>
        {unparsed}
      </div>
    );
  }

  if (aggregate.kind === "linear_scale") {
    const scale = question?.kind === "linear_scale" ? question : null;
    const min = scale?.min ?? aggregate.min;
    const max = scale?.max ?? aggregate.max;
    return (
      <div className="flex flex-col gap-3">
        <Histogram buckets={aggregate.buckets} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{scale?.minLabel ? `${min} — ${scale.minLabel}` : min}</span>
          <span className="font-medium text-foreground">
            Average{" "}
            <span className="tabular-nums">
              {aggregate.mean === null ? "—" : NUMBER.format(aggregate.mean)}
            </span>
          </span>
          <span>{scale?.maxLabel ? `${max} — ${scale.maxLabel}` : max}</span>
        </div>
        {unparsed}
      </div>
    );
  }

  // A slider or a number: the spread, then where the answers landed.
  const stats: [string, number | null][] = [
    ["Lowest", aggregate.min],
    ["Average", aggregate.mean],
    ["Median", aggregate.median],
    ["Highest", aggregate.max],
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-border bg-muted/30 px-3 py-2"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {value === null ? "—" : NUMBER.format(value)}
            </dd>
          </div>
        ))}
      </dl>
      {aggregate.enumerated ? (
        <Histogram buckets={aggregate.buckets} />
      ) : (
        <div className="flex flex-col gap-2">
          {aggregate.buckets.map((bucket) => (
            <BarRow
              key={bucket.value}
              label={NUMBER.format(bucket.value)}
              count={bucket.count}
              percent={bucket.pct}
              flag={bucket.inRange ? undefined : "out of range"}
            />
          ))}
        </div>
      )}
      {unparsed}
    </div>
  );
}

function UnlistedFlag({ text }: { text: string }) {
  return (
    <Badge variant="outline" className="ml-2 align-middle">
      {text}
    </Badge>
  );
}

function BarRow({
  label,
  count,
  percent,
  flag,
}: {
  label: React.ReactNode;
  count: number;
  percent: number;
  flag?: string;
}) {
  // The label/value gutters are fixed at md+ so bars line up down the card. On
  // a 360px phone those same widths left the track invisible, so below md the
  // label goes full-width above the bar and the count sits beside it.
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
      <span
        className="truncate text-sm md:w-40 md:shrink-0"
        title={typeof label === "string" ? label : undefined}
      >
        {label}
        {flag && <UnlistedFlag text={flag} />}
      </span>
      <div className="flex items-center gap-2 md:contents">
        <div
          className="h-6 flex-1 overflow-hidden rounded-sm bg-muted"
          aria-hidden
        >
          <div
            className="h-full rounded-sm bg-accent motion-safe:transition-all"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground md:w-28">
          {count} · {percent}%
        </span>
      </div>
    </div>
  );
}

function Histogram({ buckets }: { buckets: NumericAggregate["buckets"] }) {
  const peak = buckets.reduce((max, b) => Math.max(max, b.count), 0) || 1;
  const outOfRange = buckets.some((b) => !b.inRange);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex items-end gap-2" style={{ height: 160 }}>
        {buckets.map((bucket) => (
          <li
            key={bucket.value}
            className="flex flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-xs tabular-nums text-muted-foreground">
              {bucket.count}
            </span>
            <div
              aria-hidden
              className={cn(
                "w-full rounded-t-sm bg-accent",
                bucket.count === 0 && "bg-muted",
              )}
              style={{
                height: `${Math.max(2, (bucket.count / peak) * 110)}px`,
              }}
              title={`${NUMBER.format(bucket.value)}: ${bucket.count} (${bucket.pct}%)`}
            />
            <span
              className={cn(
                "text-xs tabular-nums",
                !bucket.inRange && "font-semibold text-warning",
              )}
            >
              {NUMBER.format(bucket.value)}
              <span className="sr-only">
                {`: ${bucket.count} (${bucket.pct}%)`}
                {!bucket.inRange && ", out of range"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {outOfRange && (
        <p className="text-xs text-muted-foreground">
          Values in <span className="text-warning">amber</span> are outside the
          question&rsquo;s range.
        </p>
      )}
    </div>
  );
}
