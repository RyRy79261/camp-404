import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Report a problem" and the error page's Report button open the one reporter
// in the layout, for a signed-in member only.

const session = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: session.data, isPending: false }) },
}));
vi.mock("@/components/feedback/use-shake-gesture", () => ({
  useShakeGesture: vi.fn(),
  motionPermissionNeeded: () => false,
  requestMotionPermission: vi.fn(),
}));
vi.mock("@/components/feedback/report-bug-dialog", () => ({
  ReportBugDialog: ({
    open,
    defaultDescription,
  }: {
    open: boolean;
    defaultDescription?: string;
  }) =>
    open ? <div role="dialog">{`prefill:${defaultDescription}`}</div> : null,
}));

import { FeedbackGate } from "@/app/feedback-gate";
import ErrorPage from "@/app/error";
import { ReportProblemLink } from "../report-problem-link";
import { openReportProblem } from "../report-problem";

beforeEach(() => {
  session.data = { user: { id: "u1" } };
});
afterEach(cleanup);

describe("report entry points", () => {
  it("opens the reporter from the profile link", () => {
    render(
      <>
        <FeedbackGate aiAvailable={false} />
        <ReportProblemLink />
      </>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(screen.getByRole("dialog").textContent).toBe("prefill:");
  });

  it("opens the reporter from the error page with the trace", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(
      <>
        <FeedbackGate aiAvailable={false} />
        <ErrorPage error={error} reset={() => {}} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "The page showed an error. Trace: abc123",
    );
  });

  it("offers no Report button and opens nothing when signed out", () => {
    session.data = null;
    render(
      <>
        <FeedbackGate aiAvailable={false} />
        <ErrorPage error={new Error("boom")} reset={() => {}} />
      </>,
    );
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    act(() => openReportProblem());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
