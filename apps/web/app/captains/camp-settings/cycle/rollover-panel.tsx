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
import { Card } from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SectionHeader } from "@camp404/ui/components/section-header";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { advanceCycleAction, setFoundingYearAction } from "../actions";

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
    <Card className="flex flex-col gap-3 p-4">
      <SectionHeader
        as="h3"
        title={`${title} (${entries.length})`}
        description={summary}
      />
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-0.5 shrink-0 text-muted-foreground">
              {icon}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{entry.title}</span>
              {showCounts && (
                <span className="text-muted-foreground">
                  {" "}
                  — {plural(entry.recipientCount, "member", "members")}
                </span>
              )}
              {!entry.sendable && (
                <span className="block text-caption text-muted-foreground">
                  Built into the app — nothing can send this one, so it stays as
                  it is.
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
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
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="error">
          <TriangleAlert aria-hidden />
          <span>{error}</span>
        </Alert>
      )}

      <Card className="flex flex-col gap-4 p-4">
        <SectionHeader
          as="h2"
          title="What year is it?"
          description="Camp 404 files everything under a year — every questionnaire sent, every answer given. It doesn't know which year this is yet, so nothing else has one either. Tell it, and everything already on file is filed under that year."
        />

        <InputField
          label="This year"
          helper="Four digits, the year the camp is in right now. For example 2026."
          value={year}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          autoFocus
          onChange={(event) => setYear(digits(event.target.value))}
        />

        <p className="text-caption text-muted-foreground">
          Nothing is deleted and nobody is asked anything again. This only says
          which year the camp is in. Next year you come back here and say so.
        </p>

        <Button
          type="button"
          onClick={save}
          disabled={pending || !isYear(year)}
        >
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {isYear(year) ? `The camp is in ${year}` : "Type the year"}
        </Button>
      </Card>
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
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          <CircleCheck aria-hidden />
          <span>
            The camp is now in <strong>{report.to.year}</strong>. Nothing was
            deleted — every previous year&apos;s answers are still readable.
          </span>
        </Alert>

        <Card className="flex flex-col gap-3 p-4">
          <SectionHeader
            as="h2"
            title="What just happened"
            description={
              report.plan.from
                ? `${report.plan.from.year} is closed. ${report.to.year} is now the year everything new is filed under.`
                : `${report.to.year} is now the year everything new is filed under.`
            }
          />
          <ul className="flex flex-col gap-2 text-sm">
            {report.reGated.map((entry) => (
              <li key={entry.key} className="flex items-start gap-2">
                <RefreshCw
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span>
                  <span className="font-medium">{entry.title}</span> — asked
                  again, {plural(entry.gatesWritten, "member", "members")}. The
                  old send is closed, not deleted.
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
          <p className="text-caption text-muted-foreground">
            Receipt <span className="font-mono">{report.auditLogId}</span>
          </p>
        </Card>

        <Button type="button" variant="outline" onClick={startOver}>
          Done
        </Button>
      </div>
    );
  }

  // --- The plan, and the confirm form beneath it (§8.1/§8.2) ---------------
  return (
    <div className="flex flex-col gap-4">
      {founded && <FoundedNotice report={founded} />}

      {error && (
        <Alert variant="error">
          <TriangleAlert aria-hidden />
          <span>{error}</span>
        </Alert>
      )}

      <Card className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">You&apos;re in {from.year}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything sent and answered right now is filed under {from.year}.
          Starting a new year files it under the next one instead. Everything
          below is what would happen — nothing has changed yet.
        </p>
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

      {/* As prominent as the change lists above — deliberately. */}
      <Card className="flex flex-col gap-3 p-4">
        <SectionHeader
          as="h3"
          title="Nothing else changes"
          description="Everything in this list is left exactly as it is."
        />
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
      </Card>

      {!confirming ? (
        <Button type="button" onClick={() => setConfirming(true)}>
          Start a new year
        </Button>
      ) : (
        <Card className="flex flex-col gap-4 p-4">
          <SectionHeader
            as="h3"
            title="Start a new year"
            description="Type the year the camp is moving to, then type it again to confirm."
          />

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
            <div className="flex items-start gap-3">
              <Checkbox
                id="reset-dues"
                className="mt-0.5"
                checked={resetDues}
                onCheckedChange={(checked) => setResetDues(checked === true)}
              />
              <Label htmlFor="reset-dues" className="font-normal">
                Clear the dues tick for{" "}
                {plural(plan.duesPaidCount, "member", "members")}
                <span className="block text-caption text-muted-foreground">
                  They&apos;ll show as unpaid for the new year. Who was cleared
                  is written into the receipt.
                </span>
              </Label>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="announce"
                className="mt-0.5"
                checked={announce}
                onCheckedChange={(checked) => setAnnounce(checked === true)}
              />
              <Label htmlFor="announce" className="font-normal">
                Also post an announcement to everyone
                <span className="block text-caption text-muted-foreground">
                  It lands full-screen, and each person taps to acknowledge it.
                </span>
              </Label>
            </div>

            {announce && (
              <div className="flex flex-col gap-3 pl-7">
                <InputField
                  label="Announcement title"
                  value={announceTitle}
                  maxLength={120}
                  placeholder="A new year at Camp 404"
                  onChange={(event) => setAnnounceTitle(event.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="announce-body">What it says</Label>
                  <Textarea
                    id="announce-body"
                    value={announceBody}
                    maxLength={2000}
                    placeholder="We've started a new year. A few questionnaires will ask you again — everything else is as you left it."
                    onChange={(event) => setAnnounceBody(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

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
        </Card>
      )}
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
