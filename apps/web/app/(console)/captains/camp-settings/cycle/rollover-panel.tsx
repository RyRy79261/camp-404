"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { AckRow } from "@camp404/ui/components/checkbox";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  advanceCycleAction,
  setCycleNameAction,
  setFoundingYearAction,
} from "../actions";

// The year surface: name the year → plan → confirm → receipt (spec §8.2/§8.4).
// The server page hands in planRollover()'s output; this island owns the two
// forms and keeps the executed report on screen afterwards.
//
// A year is a number, not a name. One integer is both the thing a captain reads
// ("you're in 2026") and the namespace stamped on every send and answer, which
// is why the confirm box takes the number rather than a label beside it.
//
// Three things about this screen are load-bearing rather than decorative:
//
//   • The first screen asks what year it is. Migration 0019 could only stamp a
//     sentinel on the rows that predate the year namespace, because a migration
//     cannot know the year; naming it is what adopts them.
//   • "Nothing else changes" is rendered as prominently as the change lists.
//     That is where a captain's fear lives, and burying it is what makes a
//     button frightening.
//   • Confirmation is typing the new year's number back — the type-the-name
//     pattern. It is hard to do by accident, and because the number IS the year
//     being saved it is not ceremony for its own sake.

// The plan/report shapes, kept as local structural types (like the team
// editor's TeamRow) so this client island never imports the DB package. The
// server page and the action conform to them by assignment.

export type CycleView = {
  year: number;
  startedAt: string;
  endedAt: string | null;
  /** The optional name beside the year. The number stays the key. */
  name?: string;
};

export type RolloverEntryView = {
  key: string;
  title: string;
  activationId: string | null;
  recipientCount: number;
  sendable: boolean;
};

export type RolloverPlanView = {
  /** Null on a camp that has never said what year it is. */
  from: CycleView | null;
  /** The obvious next year, prefilled into the input. Not the answer. */
  suggestedYear: number | null;
  reGate: RolloverEntryView[];
  carriesOver: RolloverEntryView[];
  notSent: RolloverEntryView[];
  duesPaidCount: number;
  untouched: readonly string[];
};

export type FoundingReportView = {
  year: number;
  activationsStamped: number;
  responsesStamped: number;
  teamMembershipsStamped: number;
  driverProfilesStamped: number;
  carSeatsStamped: number;
  teamBudgetsStamped: number;
  adopteesStamped: number;
  auditLogId: string;
};

export type ReGateResultView = {
  key: string;
  title: string;
  closedActivationId: string;
  newActivationId: string;
  gatesWritten: number;
};

export type RolloverReportView = {
  plan: RolloverPlanView;
  to: CycleView;
  reGated: ReGateResultView[];
  duesCleared: string[];
  announcementBroadcastId: string | null;
  auditLogId: string;
};

// The plausible range, restated here so the input can refuse a typo before a
// round-trip. The server is the authority — setFoundingYearAction and
// advanceCycleAction re-check every value against the same bounds.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
// Restated for the same reason: MAX_CYCLE_NAME_LENGTH in @camp404/db.
const MAX_NAME_LENGTH = 60;

/** Keep a year input to four digits, so it can only ever hold a year. */
function digits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function isYear(value: string): boolean {
  const year = Number(value);
  return value.length === 4 && year >= MIN_YEAR && year <= MAX_YEAR;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c" — the receipt reads as a sentence, not a table. */
function sentenceList(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The receipt for naming the founding year — shown until the page catches up.
 *
 * It enumerates EVERY count the founding transaction moved, not just the two
 * questionnaire ones: naming the year also adopts the year-scoped roster facts,
 * and on a camp that has been running those are the bulk of it. A receipt whose
 * whole job is "here is exactly what changed" must not undercount. Zero rows are
 * dropped so a brand-new camp gets a short sentence instead of a row of noughts.
 */
function FoundedNotice({ report }: { report: FoundingReportView }) {
  const counted: ReadonlyArray<readonly [number, string, string]> = [
    [report.activationsStamped, "send", "sends"],
    [report.responsesStamped, "answer", "answers"],
    [report.teamMembershipsStamped, "team place", "team places"],
    [report.driverProfilesStamped, "driver profile", "driver profiles"],
    [report.carSeatsStamped, "car seat", "car seats"],
    [report.teamBudgetsStamped, "team budget", "team budgets"],
    [report.adopteesStamped, "adoption slot", "adoption slots"],
  ];
  const moved = counted.filter(([count]) => count > 0);
  const total = moved.reduce((sum, [count]) => sum + count, 0);
  return (
    <Alert variant="success">
      <CircleCheck aria-hidden />
      <span>
        The camp is in <strong>{report.year}</strong>.{" "}
        {moved.length > 0
          ? `${sentenceList(
              moved.map(([count, one, many]) => plural(count, one, many)),
            )} already on file ${total === 1 ? "is" : "are"} now filed under it.`
          : "Everything from here is filed under it."}
      </span>
    </Alert>
  );
}

/** One bucket of the plan: a heading, a plain sentence, then the list. */
function PlanSection({
  title,
  summary,
  entries,
  showCounts = false,
  icon,
}: {
  title: string;
  summary: string;
  entries: RolloverEntryView[];
  showCounts?: boolean;
  icon: ReactNode;
}) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{`${title} (${entries.length})`}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="flex items-start gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
            >
              <span aria-hidden className="mt-0.5 shrink-0 text-accent">
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{entry.title}</span>
                {!entry.sendable && (
                  <span className="block text-xs text-muted-foreground">
                    Built into the app — nothing can send this one, so it stays
                    as it is.
                  </span>
                )}
              </span>
              {showCounts && (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {plural(entry.recipientCount, "member", "members")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The first screen: a camp that has never said what year it is. Confirming
 * writes the founding year AND stamps it onto everything already on file, in
 * one transaction — so it asks for the year the camp is in NOW, not the one it
 * is moving to.
 */
function FoundingYearForm({
  onFounded,
}: {
  onFounded: (report: FoundingReportView) => void;
}) {
  const router = useRouter();
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setFoundingYearAction({ year: Number(year) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onFounded(result.report);
      toast.success(`The camp is in ${result.report.year}`);
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">What year is it?</CardTitle>
        <CardDescription>
          Camp 404 files everything under a year — every questionnaire sent,
          every answer given. It doesn&apos;t know which year this is yet, so
          nothing else has one either. Tell it, and everything already on file
          is filed under that year.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InputField
          label="This year"
          wrapperClassName="max-w-xs"
          helper="Four digits, the year the camp is in right now. For example 2026."
          value={year}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          autoFocus
          onChange={(event) => setYear(digits(event.target.value))}
        />

        <p className="text-xs text-muted-foreground">
          Nothing is deleted and nobody is asked anything again. This only says
          which year the camp is in. Next year you come back here and say so.
        </p>

        {error && (
          <Alert variant="error">
            <TriangleAlert aria-hidden />
            <span>{error}</span>
          </Alert>
        )}

        <Button
          type="button"
          className="self-start"
          onClick={save}
          disabled={pending || !isYear(year)}
        >
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {isYear(year) ? `The camp is in ${year}` : "Type the year"}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The optional name beside the year the camp is in. A label only: saving it
 * files nothing under a different year, so it saves straight away.
 */
function YearNameEditor({ year, name }: { year: number; name: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trimmed = value.trim();
  const changed = trimmed !== (name ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setCycleNameAction({ year, name: trimmed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        result.name
          ? `${year} is now called ${result.name}`
          : `${year} has no name now`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-md flex-col gap-2">
      <InputField
        label={`Name for ${year} (optional)`}
        helper="For example the burn's theme. It shows beside the year. The year itself does not change."
        value={value}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="off"
        error={error ?? undefined}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={save}
        disabled={pending || !changed}
      >
        {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {trimmed === "" && name ? "Remove the name" : "Save the name"}
      </Button>
    </div>
  );
}

/** The plan, the confirm form, and the receipt — for a camp that has a year. */
function AdvanceYearPanel({
  plan,
  from,
  founded,
}: {
  plan: RolloverPlanView;
  from: CycleView;
  founded: FoundingReportView | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [year, setYear] = useState(
    plan.suggestedYear === null ? "" : String(plan.suggestedYear),
  );
  const [confirm, setConfirm] = useState("");
  const [resetDues, setResetDues] = useState(true);
  const [announce, setAnnounce] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RolloverReportView | null>(null);
  const [pending, startTransition] = useTransition();

  // A year only goes forwards. Refused here as well as on the server, because
  // catching it in the box is kinder than catching it in a round-trip.
  const tooEarly = isYear(year) && Number(year) <= from.year;
  const announcementReady =
    !announce || (announceTitle.trim() !== "" && announceBody.trim() !== "");
  const canAdvance =
    isYear(year) && !tooEarly && confirm === year && announcementReady;

  function advance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceCycleAction({
        year: Number(year),
        confirm: Number(confirm),
        // The year this plan was read in. If another captain moved the camp
        // since, the server refuses rather than advancing a second time.
        expectedFromYear: from.year,
        // The dues lever only exists when there is something to clear, so it
        // can never be sent as a stray true on a camp with no dues ledger.
        resetDues: plan.duesPaidCount > 0 ? resetDues : false,
        announcement: announce
          ? { title: announceTitle, body: announceBody }
          : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReport(result.report);
      setConfirming(false);
      toast.success(`The camp is now in ${result.report.to.year}`);
      // Re-read the plan behind the receipt, so dismissing it shows the new
      // state rather than the one that was just executed.
      router.refresh();
    });
  }

  function startOver() {
    setReport(null);
    setYear("");
    setConfirm("");
    setAnnounce(false);
    setAnnounceTitle("");
    setAnnounceBody("");
    router.refresh();
  }

  // --- The receipt (§8.4) --------------------------------------------------
  if (report) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <Alert variant="success">
          <CircleCheck aria-hidden />
          <span>
            The camp is now in <strong>{report.to.year}</strong>. Nothing was
            deleted — every previous year&apos;s answers are still readable.
          </span>
        </Alert>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">What just happened</CardTitle>
            <CardDescription>
              {report.plan.from
                ? `${report.plan.from.year} is closed. ${report.to.year} is now the year everything new is filed under.`
                : `${report.to.year} is now the year everything new is filed under.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 text-sm">
              {report.reGated.map((entry) => (
                <li key={entry.key} className="flex items-start gap-2">
                  <RefreshCw
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span>
                    <span className="font-medium">{entry.title}</span> — asked
                    again, {plural(entry.gatesWritten, "member", "members")}.
                    The old send is closed, not deleted.
                  </span>
                </li>
              ))}
              {report.reGated.length === 0 && (
                <li className="text-muted-foreground">
                  No questionnaire needed re-asking.
                </li>
              )}
              {report.duesCleared.length > 0 && (
                <li className="flex items-start gap-2">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span>
                    Dues ticks cleared for{" "}
                    {plural(report.duesCleared.length, "member", "members")}.
                  </span>
                </li>
              )}
              {report.announcementBroadcastId && (
                <li className="flex items-start gap-2">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span>An announcement went out to everyone.</span>
                </li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground">
              Receipt <span className="font-mono">{report.auditLogId}</span>
            </p>
          </CardContent>
        </Card>

        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={startOver}
        >
          Done
        </Button>
      </div>
    );
  }

  // --- The plan, and the confirm form beside it (§8.1/§8.2) ----------------
  return (
    <div className="flex flex-col gap-6">
      {founded && <FoundedNotice report={founded} />}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock aria-hidden className="size-4 text-accent" />
                You&apos;re in {from.year}
                {from.name ? ` (${from.name})` : ""}
              </CardTitle>
              <CardDescription>
                Everything sent and answered right now is filed under{" "}
                {from.year}. Starting a new year files it under the next one
                instead. Everything on this page is what would happen — nothing
                has changed yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <YearNameEditor year={from.year} name={from.name ?? null} />
            </CardContent>
          </Card>

          <PlanSection
            title="Will be asked again"
            summary={`Each one starts on a blank form. Everyone's ${from.year} answers stay readable.`}
            entries={plan.reGate}
            showCounts
            icon={<RefreshCw className="size-4" />}
          />

          <PlanSection
            title="Will stay as they are"
            summary="Anyone who already answered stays done. Anyone who hasn't is still being asked, exactly as they are today."
            entries={plan.carriesOver}
            icon={<Check className="size-4" />}
          />

          <PlanSection
            title="Not being asked right now"
            summary="Nothing happens to these. Send the ones you want yourself."
            entries={plan.notSent}
            icon={<Check className="size-4" />}
          />
        </div>

        <div className="flex flex-col gap-6">
          {/* As prominent as the change lists — deliberately. It heads the side
              column, level with the first of them. */}
          <Card className="border-success/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Nothing else changes</CardTitle>
              <CardDescription>
                Everything in this list is left exactly as it is.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {plan.untouched.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm">
                    <ShieldCheck
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {!confirming ? (
            <Button type="button" onClick={() => setConfirming(true)}>
              Start a new year
            </Button>
          ) : (
            <Card className="border-accent/40">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Start a new year</CardTitle>
                <CardDescription>
                  Type the year the camp is moving to, then type it again to
                  confirm.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <InputField
                  label="The new year"
                  helper={`Usually ${from.year + 1}. Type a later one if the camp skipped a burn.`}
                  error={
                    tooEarly
                      ? `The camp is already in ${from.year}. A new year has to be later.`
                      : undefined
                  }
                  value={year}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  autoFocus
                  onChange={(event) => setYear(digits(event.target.value))}
                />

                <InputField
                  label={
                    isYear(year) && !tooEarly
                      ? `Type ${year} again to confirm`
                      : "Type the year again to confirm"
                  }
                  value={confirm}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  disabled={!isYear(year) || tooEarly}
                  onChange={(event) => setConfirm(digits(event.target.value))}
                />

                {plan.duesPaidCount > 0 && (
                  <AckRow
                    id="reset-dues"
                    checked={resetDues}
                    onCheckedChange={(checked) =>
                      setResetDues(checked === true)
                    }
                  >
                    Clear the dues tick for{" "}
                    {plural(plan.duesPaidCount, "member", "members")}
                    <span className="block text-xs text-muted-foreground">
                      They&apos;ll show as unpaid for the new year. Who was
                      cleared is written into the receipt.
                    </span>
                  </AckRow>
                )}

                <div className="flex flex-col gap-3">
                  <AckRow
                    id="announce"
                    checked={announce}
                    onCheckedChange={(checked) => setAnnounce(checked === true)}
                  >
                    Also post an announcement to everyone
                    <span className="block text-xs text-muted-foreground">
                      It lands full-screen, and each person taps to acknowledge
                      it.
                    </span>
                  </AckRow>

                  {announce && (
                    <div className="flex flex-col gap-3">
                      <InputField
                        label="Announcement title"
                        value={announceTitle}
                        maxLength={120}
                        placeholder="A new year at Camp 404"
                        onChange={(event) =>
                          setAnnounceTitle(event.target.value)
                        }
                      />
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="announce-body">What it says</Label>
                        <Textarea
                          id="announce-body"
                          value={announceBody}
                          maxLength={2000}
                          placeholder="We've started a new year. A few questionnaires will ask you again — everything else is as you left it."
                          onChange={(event) =>
                            setAnnounceBody(event.target.value)
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <Alert variant="error">
                    <TriangleAlert aria-hidden />
                    <span>{error}</span>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={advance}
                    disabled={pending || !canAdvance}
                  >
                    {pending && (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    )}
                    Start {isYear(year) && !tooEarly ? year : "the new year"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setConfirming(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export function RolloverPanel({ plan }: { plan: RolloverPlanView }) {
  // Held here rather than in the founding form so it survives the branch flip:
  // router.refresh() lands a plan WITH a year, and the notice stays on screen
  // above the rollover plan instead of vanishing at the moment it's earned.
  const [founded, setFounded] = useState<FoundingReportView | null>(null);

  if (plan.from === null) {
    return founded ? (
      <FoundedNotice report={founded} />
    ) : (
      <FoundingYearForm onFounded={setFounded} />
    );
  }
  return <AdvanceYearPanel plan={plan} from={plan.from} founded={founded} />;
}
