"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { CodeDisplay } from "@camp404/ui/components/code-display";
import { IconBadge } from "@camp404/ui/components/icon-badge";
import { cn } from "@camp404/ui/lib/utils";
import { openReportProblem } from "@/components/feedback/report-problem";
import { authClient } from "@/lib/auth-client";

// What an error boundary shows (board S22): what happened, the trace to quote,
// and three ways on: Report, Try again, and a way back. `standalone` fills the
// screen (the app's root boundary); `inline` sits in a section's page area, so
// a failed captain, tools or questionnaire page keeps the app around it and
// offers the section's own way back.

export interface ErrorRecoveryProps {
  error: Error & { digest?: string };
  reset: () => void;
  frame: "standalone" | "inline";
  /** Where the way back goes. @default "/" */
  backHref?: string;
  /** @default "Back to camp" */
  backLabel?: string;
}

export function ErrorRecovery({
  error,
  reset,
  frame,
  backHref = "/",
  backLabel = "Back to camp",
}: ErrorRecoveryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The reporter only opens for someone signed in (the S22 error board draws
  // a Report button beside Reload).
  const { data: session } = authClient.useSession();
  useEffect(() => {
    // Surface it for diagnostics; the digest correlates with the server log.
    console.error(error);
    // Move focus to the heading so screen-reader / keyboard users are told the
    // segment was swapped for an error state (the failed node they were on is
    // gone, so focus would otherwise fall back to <body> silently).
    headingRef.current?.focus();
  }, [error]);

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-lg flex-col items-center gap-6 px-4 text-center",
        frame === "standalone"
          ? "min-h-[100dvh] justify-center py-12"
          : "py-16",
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <IconBadge size="lg" tone="destructive" className="mb-2">
          <TriangleAlert aria-hidden />
        </IconBadge>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          Something went sideways.
        </h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error tripped us up. Try again &mdash; if it keeps
          happening, let a camp captain know.
        </p>
        {error.digest && (
          // Trace code: correlates this error with the server logs. Quote it
          // when reporting so a captain can find the matching entry.
          <CodeDisplay
            aria-label="Error trace"
            code={`Trace: ${error.digest}`}
            className="mt-1 self-center border-0 bg-muted text-xs text-muted-foreground"
          />
        )}
      </div>
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
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </main>
  );
}
