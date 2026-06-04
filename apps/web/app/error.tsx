"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { CodeDisplay } from "@camp404/ui/components/code-display";
import { IconBadge } from "@camp404/ui/components/icon-badge";

// Route-level error boundary: catches uncaught errors thrown while rendering a
// page or running a server action within the app tree. Keeps the user inside
// the shell with a way to recover (retry) or escape (home), instead of a raw
// crash screen. `reset()` re-renders the failed segment.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Surface it for diagnostics; the digest correlates with the server log.
    console.error(error);
    // Move focus to the heading so screen-reader / keyboard users are told the
    // segment was swapped for an error state (the failed node they were on is
    // gone, so focus would otherwise fall back to <body> silently).
    headingRef.current?.focus();
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">
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
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to camp</Link>
        </Button>
      </div>
    </main>
  );
}
