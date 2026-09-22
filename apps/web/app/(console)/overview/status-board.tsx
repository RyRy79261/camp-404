import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@camp404/ui/components/card";
import type {
  ReadinessFunnel,
  SendCompletion,
  TeamCoverageRow,
} from "./readiness";

// The captain Overview's status board, composed from AfrikaBurn's organiser
// console: `RegistrationFunnelCard` (apps/org/components/status-board/
// registration-funnel.tsx) drawn over Camp 404's member ladder, and the
// coverage rails (apps/org/components/status-board/coverage.tsx —
// `OfficerCoverageCard`'s head + headline + bar + legend, and
// `QuestionnaireCompletionCard` near enough verbatim) over the camp's teams and
// open sends.
//
// Presentational only: every figure arrives computed (./readiness), the bars
// are drawn FROM the numbers printed beside them, and a count the deployment
// cannot read renders as "not available here" rather than a zero. Zero states
// say what is actually true — "nobody has signed up yet" is not the same
// sentence as "we cannot read this".

/** AfrikaBurn's rail heading: title left, the count it is over on the right. */
function RailHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}

function LegendDot({ className }: { className: string }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      aria-hidden
    />
  );
}

/**
 * The member ladder as a funnel — AfrikaBurn's status-board funnel rows, one
 * labelled, measured bar per rung.
 *
 * Bars are a share of everyone signed up, so the ladder narrows left to right
 * down the page and the top bar is always full. Each row is direct-labelled
 * with its count, so the bar never carries a number of its own.
 */
export function ReadinessFunnelCard({ funnel }: { funnel: ReadinessFunnel }) {
  return (
    <Card className="h-full">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Is camp ready?</h2>
          <p className="text-xs text-muted-foreground">
            {funnel.total} member{funnel.total === 1 ? "" : "s"} signed up
          </p>
        </div>

        {funnel.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has signed up yet. The ladder fills in as members join.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {funnel.stages.map((stage) => {
                const known = stage.count !== null;
                const pct = known
                  ? Math.round((stage.count! / funnel.total) * 100)
                  : 0;
                return (
                  <li key={stage.key} className="flex items-center gap-3">
                    <span className="w-36 shrink-0">
                      <span className="block text-xs font-medium">
                        {stage.label}
                      </span>
                      <span className="block text-[0.65rem] text-muted-foreground">
                        {stage.hint}
                      </span>
                    </span>
                    <span className="h-5 flex-1 overflow-hidden rounded-md bg-muted">
                      {known && (
                        <span
                          className="block h-full rounded-md bg-ab-sage"
                          style={{
                            width: `${stage.count === 0 ? 0 : Math.max(pct, 2)}%`,
                          }}
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {known ? (
                        stage.count
                      ) : (
                        <span className="text-xs font-normal text-muted-foreground">
                          not available here
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Each stage counts the members who have cleared every stage above
              it.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Per-team coverage — AfrikaBurn's officer-coverage rail, over the camp's own
 * teams: the headline is how many teams have a lead, and each row opens the
 * roster already filtered to that team.
 *
 * A team with nobody on it keeps its row: the empty ones are the point.
 */
export function TeamCoverageCard({ rows }: { rows: TeamCoverageRow[] }) {
  const led = rows.filter((r) => r.hasLead).length;
  const pct = rows.length === 0 ? 0 : Math.round((led / rows.length) * 100);
  const empty = rows.filter((r) => r.members === 0).length;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <RailHead
          title="Team coverage"
          meta={`${rows.length} team${rows.length === 1 ? "" : "s"} this year`}
        />
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No teams are set up yet. Add them on the camp settings page.
          </p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tabular-nums">
                {led} / {rows.length}
              </span>
              <span className="text-xs text-muted-foreground">have a lead</span>
            </p>
            <span className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-ab-sage"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </span>
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-0"
                >
                  <Link
                    href={row.href}
                    className="text-sm font-medium underline-offset-4 hover:text-accent hover:underline"
                  >
                    {row.label}
                    {row.archived && (
                      <span className="ml-1.5 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </Link>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {row.members} member{row.members === 1 ? "" : "s"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <LegendDot
                        className={
                          row.hasLead ? "bg-ab-sage" : "bg-muted-foreground"
                        }
                      />
                      {row.hasLead
                        ? row.leads === 1
                          ? "Led"
                          : `${row.leads} leads`
                        : "No lead"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-auto text-xs text-muted-foreground">
              {empty === 0
                ? "Every team has someone on it."
                : `${empty} team${empty === 1 ? " has" : "s have"} nobody on it yet.`}{" "}
              ·{" "}
              <Link
                href="/captains/camp-settings"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Camp settings
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Completion for the sends that are collecting answers right now —
 * AfrikaBurn's `QuestionnaireCompletionCard`, with each row linking to that
 * questionnaire's results.
 *
 * "Answered out of reached" is reach NOW, not reach ever: `required_actions`
 * keeps one row per member per key, so a re-send overwrites the previous send's
 * gates. That is the same figure the results page prints.
 */
export function SendCompletionCard({ sends }: { sends: SendCompletion[] }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <RailHead
          title="Questionnaire completion"
          meta={`${sends.length} open send${sends.length === 1 ? "" : "s"}`}
        />
        {sends.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No questionnaires are open right now.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sends.map((send) => (
              <li key={send.activationId} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={send.href}
                    className="text-sm underline-offset-4 hover:text-accent hover:underline"
                  >
                    {send.title}
                  </Link>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {/* Two different nothings: a send that holds no gates at
                        all, and one whose gates have all been waived or
                        expired out of the denominator. */}
                    {send.sent === 0
                      ? "Reached nobody"
                      : send.eligible === 0
                        ? "Nobody left to answer"
                        : `${send.completed} / ${send.eligible} · ${send.completionPct}%`}
                  </span>
                </div>
                <span className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-ab-teal"
                    style={{ width: `${send.completionPct}%` }}
                    aria-hidden
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          <Link
            href="/captains/questionnaires"
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            Questionnaires
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
