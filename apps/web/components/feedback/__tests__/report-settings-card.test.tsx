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
import { FEEDBACK_UNAVAILABLE_MESSAGE } from "@/lib/integration-config";
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
    render(<ReportSettingsCard filing="no_token" />);
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

  it("quotes the message the send would actually come back with, per reason", () => {
    // The two reasons need different fixes from a captain, so the card must
    // not quote one wording for both. Read from the same constant the server
    // action returns, so this cannot go green against retyped copy.
    const { rerender } = render(<ReportSettingsCard filing="no_token" />);
    expect(
      screen.getByText(FEEDBACK_UNAVAILABLE_MESSAGE.no_token, { exact: false }),
    ).toBeTruthy();
    expect(
      screen.queryByText(FEEDBACK_UNAVAILABLE_MESSAGE.bad_repo, {
        exact: false,
      }),
    ).toBeNull();

    rerender(<ReportSettingsCard filing="bad_repo" />);
    expect(
      screen.getByText(FEEDBACK_UNAVAILABLE_MESSAGE.bad_repo, { exact: false }),
    ).toBeTruthy();
    expect(
      screen.queryByText(FEEDBACK_UNAVAILABLE_MESSAGE.no_token, {
        exact: false,
      }),
    ).toBeNull();
    expect(screen.getByText(/owner\/name form/)).toBeTruthy();
  });

  it("does not promise a flagged report is held back before it is published", () => {
    // screenReport sets needsHuman on ANY flag and the action files the issue
    // immediately either way — only the AI pass is skipped. Copy that says a
    // report is "held for a person instead" would be a promise the filing code
    // does not keep.
    render(<ReportSettingsCard repo="a/b" aiAvailable />);
    const ai = screen.getByText(/sent to Claude/);
    expect(ai.textContent).toMatch(/skipped/);
    expect(ai.textContent).toMatch(/needs-human/);
    expect(ai.textContent).toMatch(/still filed straight away/);
    expect(ai.textContent).not.toMatch(/holds the whole report/);
    // and the three things that actually trigger the skip, not just one:
    expect(ai.textContent).toMatch(/speaks to whoever reads it/);
    expect(ai.textContent).toMatch(/asks for data to be sent on/);
    expect(ai.textContent).toMatch(/somebody else.s details/);
  });

  it("claims no more about the tracker than the app can know", () => {
    // Nothing in the code proves the configured repo is public, so the card
    // must scope the claim to whoever can read THAT repository.
    render(<ReportSettingsCard repo="camp404-ops/internal-triage" />);
    const info = screen.getByText(/A report becomes a GitHub issue/);
    expect(info.textContent).toMatch(
      /Anyone who can read that repository can read your report/,
    );
    expect(info.textContent).not.toMatch(/The camp repo is public/);
  });

  it("mentions the AI pass only where it can happen", () => {
    const { rerender } = render(<ReportSettingsCard repo="a/b" />);
    expect(screen.queryByText(/sent to Claude/)).toBeNull();
    rerender(<ReportSettingsCard repo="a/b" aiAvailable />);
    expect(screen.getByText(/sent to Claude/)).toBeTruthy();
  });
});
