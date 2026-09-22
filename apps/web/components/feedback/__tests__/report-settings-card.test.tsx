import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The card exists to answer "what does a report send?" without filing one. So
// the test that matters is that what it lists is what the reporter would
// actually attach — read from the same collector, not retyped here.

vi.mock("@/components/feedback/report-problem", () => ({
  openReportProblem: vi.fn(),
  REPORT_PROBLEM_EVENT: "camp404:report-problem",
}));

import { collectDiagnostics } from "@/lib/client-errors";
import { openReportProblem } from "@/components/feedback/report-problem";
import { ReportSettingsCard } from "../report-settings-card";

afterEach(cleanup);

function disclosure() {
  return screen.getByRole("button", { name: /What a bug report attaches/ });
}

describe("ReportSettingsCard", () => {
  it("lists exactly the fields the reporter would attach", () => {
    render(<ReportSettingsCard repo="RyRy79261/camp-404" />);
    const expected = collectDiagnostics().environment.map((f) => f.label);
    expect(expected.length).toBeGreaterThan(0);

    fireEvent.click(disclosure());
    for (const label of expected) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The count on the badge is the same number, not a guess.
    expect(screen.getByText(`${expected.length} FIELDS`)).toBeTruthy();
  });

  it("starts collapsed, so nobody is made to read it, and opens on demand", () => {
    render(<ReportSettingsCard repo="RyRy79261/camp-404" />);
    const toggle = disclosure();
    const bodyId = toggle.getAttribute("aria-controls")!;
    const body = document.getElementById(bodyId)!;

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);
  });

  it("names the tracker a report lands on", () => {
    render(<ReportSettingsCard repo="RyRy79261/camp-404" />);
    expect(screen.getByText("RyRy79261/camp-404")).toBeTruthy();
  });

  it("opens the reporter on the type that was pressed", () => {
    render(<ReportSettingsCard repo="RyRy79261/camp-404" />);
    fireEvent.click(screen.getByRole("button", { name: /Report a bug/ }));
    expect(openReportProblem).toHaveBeenLastCalledWith({ kind: "bug" });
    fireEvent.click(screen.getByRole("button", { name: /Request a feature/ }));
    expect(openReportProblem).toHaveBeenLastCalledWith({ kind: "feature" });
  });

  it("says so when the deployment cannot file anything, and offers no button", () => {
    render(<ReportSettingsCard filingEnabled={false} />);
    expect(screen.queryByRole("button", { name: /Report a bug/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Request a feature/ }),
    ).toBeNull();
    expect(
      screen.getByText(/Reporting isn.t switched on for this deployment/),
    ).toBeTruthy();
    // The disclosure is still there: it is the whole point of the card.
    expect(disclosure()).toBeTruthy();
  });

  it("mentions the AI pass only where it can happen", () => {
    const { rerender } = render(<ReportSettingsCard repo="a/b" />);
    expect(screen.queryByText(/sent to Claude/)).toBeNull();
    rerender(<ReportSettingsCard repo="a/b" aiAvailable />);
    expect(screen.getByText(/sent to Claude/)).toBeTruthy();
  });
});
