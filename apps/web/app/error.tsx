"use client";

import { ErrorRecovery } from "@/components/error-recovery";

// Route-level error boundary: catches uncaught errors thrown while rendering a
// page or running a server action within the app tree. Keeps the user inside
// the shell with a way to recover (retry) or escape (home), instead of a raw
// crash screen. `reset()` re-renders the failed segment. The captain, tools and
// questionnaire sections have their own inline boundaries.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorRecovery frame="standalone" error={error} reset={reset} />;
}
