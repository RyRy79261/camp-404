import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/feedback/actions", () => ({ submitFeedbackAction: vi.fn() }));

import { ReportBugDialog } from "@/components/feedback/report-bug-dialog";
import { submitFeedbackAction } from "@/app/feedback/actions";

function fillAndSend(text = "It broke") {
  fireEvent.change(screen.getByLabelText(/what went wrong/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
}

describe("ReportBugDialog", () => {
  it("surfaces an inline error when the action transport rejects", async () => {
    // The action returns a typed result in practice, but the action *call* can
    // reject (network/runtime). handleSubmit must catch it, not stick.
    vi.mocked(submitFeedbackAction).mockRejectedValue(new Error("network"));
    render(<ReportBugDialog open onOpenChange={() => {}} />);
    fillAndSend();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/couldn't send/i),
    );
  });

  it("renders an inline error for a returned {ok:false}", async () => {
    vi.mocked(submitFeedbackAction).mockResolvedValue({
      ok: false,
      error: "Please sign in to send feedback.",
    });
    render(<ReportBugDialog open onOpenChange={() => {}} />);
    fillAndSend();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/sign in/i),
    );
  });

  it("shows the Improve-with-AI toggle only when aiAvailable", () => {
    const { rerender } = render(
      <ReportBugDialog open onOpenChange={() => {}} />,
    );
    expect(screen.queryByText(/improve with ai/i)).toBeNull();
    rerender(<ReportBugDialog open onOpenChange={() => {}} aiAvailable />);
    expect(screen.getByText(/improve with ai/i)).toBeDefined();
  });

  it("shows the success state with the issue link on ok", async () => {
    vi.mocked(submitFeedbackAction).mockResolvedValue({
      ok: true,
      number: 7,
      url: "https://github.com/RyRy79261/camp-404/issues/7",
    });
    render(<ReportBugDialog open onOpenChange={() => {}} />);
    fillAndSend();
    await waitFor(() => expect(screen.getByText("Report filed")).toBeDefined());
    expect(
      screen.getByRole("link", { name: /view issue #7/i }).getAttribute("href"),
    ).toBe("https://github.com/RyRy79261/camp-404/issues/7");
  });

  it("starts the description with the text it was opened with", () => {
    render(
      <ReportBugDialog
        open
        onOpenChange={() => {}}
        defaultDescription="Trace: abc123"
      />,
    );
    expect(
      (screen.getByLabelText(/what went wrong/i) as HTMLTextAreaElement).value,
    ).toBe("Trace: abc123");
  });

  it("sends no diagnostics unless the member ticks the box", async () => {
    vi.mocked(submitFeedbackAction).mockResolvedValue({
      ok: false,
      error: "stop",
    });
    render(<ReportBugDialog open onOpenChange={() => {}} />);
    expect(screen.queryByText(/No recent errors in this tab/)).toBeNull();
    fillAndSend();
    await waitFor(() => expect(submitFeedbackAction).toHaveBeenCalled());
    expect(
      vi.mocked(submitFeedbackAction).mock.calls.at(-1)![0],
    ).not.toHaveProperty("diagnostics");
  });

  it("shows every attached line once ticked, and sends exactly those", async () => {
    vi.mocked(submitFeedbackAction).mockResolvedValue({
      ok: false,
      error: "stop",
    });
    render(<ReportBugDialog open onOpenChange={() => {}} />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Attach device details and recent errors/,
      }),
    );
    // "You see everything that is sent below" is a promise, so assert the panel
    // is actually SHOWING, not merely rendered. getByText matches inside a
    // `hidden` container (@testing-library/dom's text query filters only on
    // `ignore`), so the two getByText calls below would pass on a collapsed
    // panel — this is the assertion that would not.
    const panel = screen.getByRole("button", { name: /What this attaches/ });
    expect(panel.getAttribute("aria-expanded")).toBe("true");
    const body = document.getElementById(panel.getAttribute("aria-controls")!)!;
    expect(body.hidden).toBe(false);

    expect(screen.getByText("Browser")).toBeTruthy();
    expect(screen.getByText("No recent errors in this tab.")).toBeTruthy();
    // …and they are inside the panel that was just proved open.
    expect(body.contains(screen.getByText("Browser"))).toBe(true);

    fillAndSend();
    await waitFor(() => expect(submitFeedbackAction).toHaveBeenCalled());
    const sent = vi.mocked(submitFeedbackAction).mock.calls.at(-1)![0] as {
      diagnostics: { environment: { label: string }[]; errors: unknown[] };
    };
    expect(sent.diagnostics.environment.map((f) => f.label)).toContain(
      "Browser",
    );
    expect(sent.diagnostics.errors).toEqual([]);
  });
});
