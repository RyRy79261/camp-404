import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type * as ImageLib from "@/lib/image";

vi.mock("@/app/feedback/actions", () => ({ submitFeedbackAction: vi.fn() }));
vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof ImageLib>()),
  downscaleForUpload: vi.fn(),
}));

import { ReportBugDialog } from "@/components/feedback/report-bug-dialog";
import { submitFeedbackAction } from "@/app/feedback/actions";
import { SCREENSHOT_UPLOAD, downscaleForUpload } from "@/lib/image";

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

  // #313: one screenshot, uploaded to Camp 404 first, then named in the report.
  describe("a screenshot", () => {
    const PNG = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    function attach(file: File) {
      fireEvent.change(screen.getByLabelText("Screenshot file"), {
        target: { files: [file] },
      });
    }

    it("refuses a file that is not a PNG, JPG or WebP picture", () => {
      render(<ReportBugDialog open onOpenChange={() => {}} />);
      attach(new File(["x"], "notes.pdf", { type: "application/pdf" }));
      expect(screen.getByRole("alert").textContent).toMatch(/PNG, JPG or WebP/);
      expect(screen.queryByRole("img", { name: "Your screenshot" })).toBeNull();
    });

    it("makes a picture over 4 MB smaller before it is sent", async () => {
      URL.createObjectURL = vi.fn(() => "blob:local-preview");
      const small = new File([PNG], "big.webp", { type: "image/webp" });
      vi.mocked(downscaleForUpload).mockResolvedValueOnce(small);
      render(<ReportBugDialog open onOpenChange={() => {}} />);
      const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
        type: "image/png",
      });
      attach(big);
      await waitFor(() =>
        expect(
          screen.getByRole("img", { name: "Your screenshot" }),
        ).toBeTruthy(),
      );
      expect(downscaleForUpload).toHaveBeenCalledWith(big, SCREENSHOT_UPLOAD);
      expect(screen.getByText("big.webp")).toBeTruthy();
    });

    it("refuses a picture still over 4 MB once made smaller", async () => {
      const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", {
        type: "image/png",
      });
      vi.mocked(downscaleForUpload).mockResolvedValueOnce(big);
      render(<ReportBugDialog open onOpenChange={() => {}} />);
      attach(big);
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toMatch(/over 4 MB/),
      );
      expect(screen.queryByRole("img", { name: "Your screenshot" })).toBeNull();
    });

    it("says the picture is too big when Vercel refuses the upload", async () => {
      URL.createObjectURL = vi.fn(() => "blob:local-preview");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 413,
          json: async () => {
            throw new SyntaxError("not JSON");
          },
        })),
      );
      render(<ReportBugDialog open onOpenChange={() => {}} />);
      attach(new File([PNG], "Screenshot.png", { type: "image/png" }));
      fillAndSend();
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toMatch(/over 4 MB/),
      );
      vi.unstubAllGlobals();
    });

    it("shows the picture as private, uploads it, then names it in the report", async () => {
      URL.createObjectURL = vi.fn(() => "blob:local-preview");
      URL.revokeObjectURL = vi.fn();
      const fetchFn = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          screenshotId: "6f1c1d8e-2b1a-4c55-9a77-0d3c1f6b9e21",
        }),
      }));
      vi.stubGlobal("fetch", fetchFn);
      vi.mocked(submitFeedbackAction).mockResolvedValue({
        ok: true,
        number: 412,
        url: "https://github.com/RyRy79261/camp-404/issues/412",
        screenshotKept: true,
      });
      render(<ReportBugDialog open onOpenChange={() => {}} />);
      attach(new File([PNG], "Screenshot.png", { type: "image/png" }));

      const preview = screen.getByRole("img", { name: "Your screenshot" });
      // Blanked in the desktop's last-seen copy of a background window.
      expect(preview.hasAttribute("data-os-private")).toBe(true);
      expect(screen.getByText(/Kept private\./)).toBeDefined();

      fillAndSend();
      await waitFor(() =>
        expect(screen.getByText("Report filed")).toBeDefined(),
      );
      expect(fetchFn).toHaveBeenCalledWith(
        "/api/uploads/report-screenshot",
        expect.objectContaining({ method: "POST" }),
      );
      expect(vi.mocked(submitFeedbackAction).mock.lastCall?.[0]).toMatchObject({
        screenshotId: "6f1c1d8e-2b1a-4c55-9a77-0d3c1f6b9e21",
      });
      expect(
        screen.getByText(/Your screenshot is not on GitHub\./),
      ).toBeDefined();
      vi.unstubAllGlobals();
    });

    it("does not file the report when the picture fails to upload", async () => {
      URL.createObjectURL = vi.fn(() => "blob:local-preview");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          json: async () => ({
            error: "Too many uploads. Wait a few minutes and try again.",
          }),
        })),
      );
      vi.mocked(submitFeedbackAction).mockClear();
      render(<ReportBugDialog open onOpenChange={() => {}} />);
      attach(new File([PNG], "Screenshot.png", { type: "image/png" }));
      fillAndSend();
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toMatch(
          /Too many uploads/,
        ),
      );
      expect(submitFeedbackAction).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
