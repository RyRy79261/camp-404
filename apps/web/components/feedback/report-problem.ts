// Opening the report dialog from anywhere in the app (owner's call,
// 2026-09-16: a "Report a problem" item on /profile and on the error page, no
// floating button). The dialog lives once in the root layout (FeedbackGate);
// an entry point asks it to open with an event, so no provider has to wrap the
// whole tree. FeedbackGate listens only while someone is signed in.

export const REPORT_PROBLEM_EVENT = "camp404:report-problem";

export interface ReportProblemRequest {
  /** Text to start the description with, e.g. an error's trace code. */
  description?: string;
}

export function openReportProblem(request: ReportProblemRequest = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ReportProblemRequest>(REPORT_PROBLEM_EVENT, {
      detail: request,
    }),
  );
}
