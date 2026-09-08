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
import { advanceCycleAction } from "../actions";

// The rollover surface: plan → confirm → receipt (spec §8.2/§8.4). The server
// page hands in planRollover()'s output; this island owns the confirm form and
// keeps the executed report on screen afterwards.
//
// Two things about this screen are load-bearing rather than decorative:
//
//   • "Nothing else changes" is rendered as prominently as the change lists.
//     That is where a captain's fear lives, and burying it is what makes a
//     button frightening.
//   • Confirmation is typing the new year's name back — the type-the-repo-name
//     pattern. It is hard to do by accident, and because the string IS the
//     label being saved it is not ceremony for its own sake.

// The plan/report shapes, kept as local structural types (like the team
// editor's TeamRow) so this client island never imports the DB package. The
// server page and the action conform to them by assignment.

export type CycleView = {
  number: number;
  label: string;
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
  from: CycleView;
  toNumber: number;
  reGate: RolloverEntryView[];
  carriesOver: RolloverEntryView[];
  notSent: RolloverEntryView[];
  duesPaidCount: number;
  untouched: readonly string[];
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

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
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

export function RolloverPanel({ plan }: { plan: RolloverPlanView }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetDues, setResetDues] = useState(true);
  const [announce, setAnnounce] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RolloverReportView | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmedLabel = label.trim();
  const announcementReady =
    !announce || (announceTitle.trim() !== "" && announceBody.trim() !== "");
  const canAdvance =
    trimmedLabel !== "" && confirm.trim() === trimmedLabel && announcementReady;

  function advance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceCycleAction({
        label,
        confirm,
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
      toast.success(`The camp is now in ${result.report.to.label}`);
      // Re-read the plan behind the receipt, so dismissing it shows the new
      // state rather than the one that was just executed.
      router.refresh();
    });
  }

  function startOver() {
    setReport(null);
    setLabel("");
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
            The camp is now in <strong>{report.to.label}</strong>. Nothing was
            deleted — every previous year&apos;s answers are still readable.
          </span>
        </Alert>

        <Card className="flex flex-col gap-3 p-4">
          <SectionHeader
            as="h2"
            title="What just happened"
            description={`${report.plan.from.label} is closed. ${report.to.label} is now the year everything new is filed under.`}
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
      {error && (
        <Alert variant="error">
          <TriangleAlert aria-hidden />
          <span>{error}</span>
        </Alert>
      )}

      <Card className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">
            You&apos;re in {plan.from.label}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          That&apos;s year {plan.from.number}. Starting a new year makes it year{" "}
          {plan.toNumber}. Everything below is what would happen — nothing has
          changed yet.
        </p>
      </Card>

      <PlanSection
        title="Will be asked again"
        summary={`Each one starts on a blank form. Everyone's ${plan.from.label} answers stay readable.`}
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
            description="Name the new year, then type the name again to confirm. That name is what everyone will see."
          />

          <InputField
            label="Name the new year"
            helper="For example 2027, or AfrikaBurn 2027."
            value={label}
            maxLength={60}
            autoFocus
            onChange={(event) => setLabel(event.target.value)}
          />

          <InputField
            label={
              trimmedLabel
                ? `Type ${trimmedLabel} again to confirm`
                : "Type the name again to confirm"
            }
            value={confirm}
            maxLength={60}
            disabled={trimmedLabel === ""}
            onChange={(event) => setConfirm(event.target.value)}
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
              Start {trimmedLabel || "the new year"}
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
