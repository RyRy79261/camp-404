"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { openReportProblem } from "@/components/feedback/report-problem";
import { GateScreen } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

// What an error boundary shows: what happened, the trace to quote, and three
// ways on: Report, Try again, and a way back. `standalone` fills the screen as
// the AfrikaBurn organiser gate screen (the app's root boundary); `inline` is
// the console's page-level card, so a failed captain, tools or questionnaire
// page keeps the header and nav around it and offers the section's own way
// back.

export interface ErrorRecoveryProps {
  error: Error & { digest?: string };
  reset: () => void;
  frame: "standalone" | "inline";
  /** Where the way back goes. @default "/" */
  backHref?: string;
  /** @default "Back to camp" */
  backLabel?: string;
  /**
   * The heading, when the boundary can name what failed ("Tasks stopped
   * responding", inside a desktop window). @default "Something went sideways."
   */
  title?: string;
}

const TITLE = "Something went sideways.";
const DESCRIPTION =
  "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know.";

export function ErrorRecovery({
  error,
  reset,
  frame,
  backHref = "/",
  backLabel = "Back to camp",
  title = TITLE,
}: ErrorRecoveryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The reporter only opens for someone signed in.
  const { data: session } = authClient.useSession();
  useEffect(() => {
    // Surface it for diagnostics; the digest correlates with the server log.
    console.error(error);
    // Move focus to the heading so screen-reader / keyboard users are told the
    // segment was swapped for an error state (the failed node they were on is
    // gone, so focus would otherwise fall back to <body> silently).
    headingRef.current?.focus();
  }, [error]);

  // Trace code: correlates this error with the server logs. Quote it when
  // reporting so a captain can find the matching entry.
  const trace = error.digest ? (
    <p className="font-mono text-xs text-muted-foreground">
      Trace: {error.digest}
    </p>
  ) : null;

  const actions = (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {session && (
        <Button
          variant="outline"
          onClick={() =>
            openReportProblem({
              description: error.digest
                ? `The page showed an error. Trace: ${error.digest}\n\nWhat I was doing: `
                : "The page showed an error.\n\nWhat I was doing: ",
            })
          }
        >
          Report
        </Button>
      )}
      <Button onClick={reset}>
        <RotateCw aria-hidden />
        Try again
      </Button>
      <Button variant="outline" asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );

  if (frame === "inline") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <TriangleAlert className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight outline-none"
            >
              {title}
            </h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {DESCRIPTION}
            </p>
            {trace}
          </div>
          {actions}
        </CardContent>
      </Card>
    );
  }

  return (
    <GateScreen
      icon={<TriangleAlert aria-hidden />}
      eyebrow="Camp 404"
      title={title}
      description={DESCRIPTION}
      meta={trace}
      headingRef={headingRef}
    >
      {actions}
    </GateScreen>
  );
}
