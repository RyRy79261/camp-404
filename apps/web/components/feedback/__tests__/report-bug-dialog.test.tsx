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
});
