"use client";

import { ErrorRecovery } from "@/components/error-recovery";

// An error in a tools page is caught here, not at the root, so the recovery sits in
// the page area, under the console header. The tools hub is gone (the nav leads
// to each tool), so the way back is Home.
export default function SectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorRecovery
      frame="inline"
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Back to overview"
    />
  );
}
