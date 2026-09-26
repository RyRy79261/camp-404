"use client";

import { useContext } from "react";
import { usePathname } from "next/navigation";
import { ErrorRecovery } from "@/components/error-recovery";
import { PROGRAM_TITLES, matchProgram } from "@/lib/program-routes";
import { DesktopSignalsContext } from "./held-screen";

/**
 * What a crashed page shows inside its desktop window (visual-language doc
 * 4.2): "Tasks stopped responding", named from the address, never from the
 * page's data. The desktop around it stays up, so the way back is the
 * desktop. Used by every error boundary under app/(console), because the
 * nearest boundary to a failing page wins.
 *
 * The console group also draws pages with no desktop (the signed-out landing
 * page, first-time setup, a rejected applicant, a held member's inbox): there
 * the error is the full-screen page the root boundary draws, since there is
 * no window and no desktop to go back to.
 */
export function WindowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const desktop = useContext(DesktopSignalsContext);
  const match = matchProgram(usePathname());
  if (!desktop) {
    return <ErrorRecovery frame="standalone" error={error} reset={reset} />;
  }
  const name =
    match && match.programId !== "desktop"
      ? PROGRAM_TITLES[match.programId]
      : null;
  return (
    <ErrorRecovery
      frame="inline"
      error={error}
      reset={reset}
      title={name ? `${name} stopped responding` : undefined}
      backHref="/"
      backLabel="Back to the desktop"
    />
  );
}
