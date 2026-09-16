"use client";

import { ErrorRecovery } from "@/components/error-recovery";

// An error in a tools page is caught here, not at the root, so the recovery sits in
// the page area and its way back stays in this section.
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
      backHref="/tools"
      backLabel="Back to tools"
    />
  );
}
