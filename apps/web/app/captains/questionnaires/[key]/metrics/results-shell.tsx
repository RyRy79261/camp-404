import type { ReactNode } from "react";
import Link from "next/link";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GhostBack } from "@camp404/ui/components/ghost-back";
import { cycleLabel, type ResultsView } from "./results-data";
import { ResultsNav, type ResultsViewName } from "./results-nav";

// The page frame both results routes share: back link, title, year, and the
// view/year switch. Kept here beside the loader so /metrics and /responses can
// never drift into two different-looking versions of one surface.

const SENT_ON = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The frame with no data behind it — the locked / not-yet-published states. */
export function ResultsFrame({
  questionnaireKey,
  wide = false,
  children,
}: {
  questionnaireKey: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={`mx-auto px-4 py-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
      <GhostBack
        href={`/captains/questionnaires/${questionnaireKey}`}
        className="-ml-2 mb-4"
      >
        Editor
      </GhostBack>
      {children}
    </main>
  );
}

export function ResultsLocked({
  questionnaireKey,
}: {
  questionnaireKey: string;
}) {
  return (
    <ResultsFrame questionnaireKey={questionnaireKey}>
      <h1 className="mb-4 text-2xl font-bold">Results</h1>
      <CaptainLock message="Only captains can see questionnaire answers." />
    </ResultsFrame>
  );
}

export function ResultsUnpublished({
  questionnaireKey,
}: {
  questionnaireKey: string;
}) {
  return (
    <ResultsFrame questionnaireKey={questionnaireKey}>
      <h1 className="mb-4 text-2xl font-bold">Results</h1>
      <Alert variant="info">
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
    </ResultsFrame>
  );
}

/** The frame around real results, with the year and the send it describes. */
export function ResultsShell({
  view,
  viewName,
  wide = false,
  children,
}: {
  view: ResultsView;
  viewName: ResultsViewName;
  wide?: boolean;
  children: ReactNode;
}) {
  const active = view.activeActivation;
  const year = cycleLabel(view.cycle, view.currentCycle);
  const isPastYear =
    view.currentCycle !== null && view.cycle < view.currentCycle;

  return (
    <ResultsFrame questionnaireKey={view.key} wide={wide}>
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 break-words text-2xl font-bold">
            {view.title}
          </h1>
          <Badge variant={isPastYear ? "outline" : "default"} className="mt-1">
            {year}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {active
            ? `${active.status === "open" ? "Sent" : "Last sent"} ${SENT_ON.format(active.openedAt ?? active.createdAt)} · version ${active.version}`
            : `Not sent in ${year}.`}
        </p>
      </header>

      <div className="mb-5">
        <ResultsNav
          questionnaireKey={view.key}
          view={viewName}
          cycle={view.cycle}
          cycles={view.cycleOptions.map((c) => ({
            value: c,
            label: cycleLabel(c, view.currentCycle),
          }))}
        />
      </div>

      {/*
        The year namespace promises nothing is destroyed, so a past year is a
        first-class view rather than an error — but a captain who has followed a
        stale link should be told which year they are reading before they act on
        a number.
      */}
      {isPastYear && (
        <Alert variant="info" className="mb-4">
          <span>
            You&rsquo;re looking at {year}. These answers are kept as they were;
            this year&rsquo;s are under {view.currentCycle}.
          </span>
        </Alert>
      )}

      {children}
    </ResultsFrame>
  );
}
