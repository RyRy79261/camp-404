import type { ReactNode } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cycleLabel, type ResultsView } from "./results-data";
import { ResultsNav, type ResultsViewName } from "./results-nav";

// The page frame both results routes share, from the AfrikaBurn console's
// results page: the heading, the year and send badges, and the view/year switch. Kept
// here beside the loader so /metrics and /responses can never drift into two
// different-looking versions of one surface.

const SENT_ON = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});

const EYEBROW = "Questionnaires / Results";

/** The way to the editor, the heading's one action. */
function EditAction({ questionnaireKey }: { questionnaireKey: string }) {
  return (
    <Button asChild variant="outline">
      <Link href={`/captains/questionnaires/${questionnaireKey}`}>
        <Pencil aria-hidden />
        Edit questionnaire
      </Link>
    </Button>
  );
}

export function ResultsLocked({
  questionnaireKey,
}: {
  questionnaireKey: string;
}) {
  // Nothing about the questionnaire is read for a viewer below captain, so the
  // heading names the page, not the questionnaire. The editor link carries only
  // the key already in the URL; a lead may be this questionnaire's author.
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={EYEBROW}
        title="Results"
        actions={<EditAction questionnaireKey={questionnaireKey} />}
      />
      <CaptainLock message="Only captains can see questionnaire answers." />
    </div>
  );
}

export function ResultsUnpublished({
  questionnaireKey,
}: {
  questionnaireKey: string;
}) {
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={EYEBROW}
        title="Results"
        actions={<EditAction questionnaireKey={questionnaireKey} />}
      />
      <Alert variant="info" className="max-w-3xl">
        <span>
          This questionnaire has never been published, so nobody has been asked
          it yet.{" "}
          <Link
            href={`/captains/questionnaires/${questionnaireKey}`}
            className="font-medium underline"
          >
            Back to the editor
          </Link>
        </span>
      </Alert>
    </div>
  );
}

/** The frame around real results, with the year and the send it describes. */
export function ResultsShell({
  view,
  viewName,
  toolbar,
  children,
}: {
  view: ResultsView;
  viewName: ResultsViewName;
  /** Controls for this view, beside the view/year switch (e.g. the export). */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const active = view.activeActivation;
  const year = cycleLabel(view.cycle, view.currentCycle, view.cycleNames);
  const isPastYear =
    view.currentCycle !== null && view.cycle < view.currentCycle;
  const currentYear =
    view.currentCycle === null
      ? null
      : cycleLabel(view.currentCycle, view.currentCycle, view.cycleNames);

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={EYEBROW}
        title={view.title}
        description={
          active
            ? `${active.status === "open" ? "Sent" : "Last sent"} ${SENT_ON.format(active.openedAt ?? active.createdAt)} · version ${active.version}`
            : `Not sent in ${year}.`
        }
        actions={<EditAction questionnaireKey={view.key} />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant={isPastYear ? "outline" : "default"}>{year}</Badge>
        {active && (
          <Badge variant={active.status === "open" ? "success" : "outline"}>
            {active.status === "open" ? "Open" : "Closed"}
          </Badge>
        )}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ResultsNav
          questionnaireKey={view.key}
          view={viewName}
          cycle={view.cycle}
          cycles={view.cycleOptions.map((c) => ({
            value: c,
            label: cycleLabel(c, view.currentCycle, view.cycleNames),
          }))}
        />
        {toolbar}
      </div>

      {/*
        The year namespace promises nothing is destroyed, so a past year is a
        first-class view rather than an error — but a captain who has followed a
        stale link should be told which year they are reading before they act on
        a number.
      */}
      {isPastYear && (
        <Alert variant="info" className="mb-6">
          <span>
            You&rsquo;re looking at {year}. These answers are kept as they were;
            this year&rsquo;s are under {currentYear}.
          </span>
        </Alert>
      )}

      {children}
    </div>
  );
}
