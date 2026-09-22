// Opening the report dialog from anywhere in the app (owner's call,
// 2026-09-16: an entry point on /profile and on the error page, no floating
// button; /profile's is now the "Bugs and feature requests" card's two typed
// buttons rather than a single "Report a problem" link). The dialog lives once
// in the root layout (FeedbackGate); an entry point asks it to open with an
// event, so no provider has to wrap the whole tree. FeedbackGate listens only
// while someone is signed in.

import type { FeedbackKind } from "@/lib/github-feedback";

export const REPORT_PROBLEM_EVENT = "camp404:report-problem";

export interface ReportProblemRequest {
  /** Text to start the description with, e.g. an error's trace code. */
  description?: string;
  /**
   * Which type the dialog opens on. The profile card offers "Report a bug"
   * and "Request a feature" as two separate entry points, so the one it opens
   * has to be the one that was pressed. Omitted, the dialog opens on "bug".
   */
  kind?: FeedbackKind;
}

export function openReportProblem(request: ReportProblemRequest = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ReportProblemRequest>(REPORT_PROBLEM_EVENT, {
      detail: request,
    }),
  );
}
