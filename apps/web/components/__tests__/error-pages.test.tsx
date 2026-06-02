import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";

// Smoke tests for the recovery surfaces added alongside the onboarding fix.
// (global-error.tsx renders its own <html>/<body>, which jsdom's container
// can't host cleanly, so it's covered by manual/e2e rather than here.)

describe("not-found page", () => {
  it("offers a 'Back to camp' link home", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /back to camp/i });
    expect(link.getAttribute("href")).toBe("/");
  });
});

describe("error boundary page", () => {
  it("calls reset() when 'Try again' is clicked", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("keeps a 'Back to camp' escape hatch", () => {
    render(<ErrorPage error={new Error("boom")} reset={() => {}} />);
    expect(
      screen.getByRole("link", { name: /back to camp/i }).getAttribute("href"),
    ).toBe("/");
  });

  it("surfaces the digest as a trace code when present", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123xyz" });
    render(<ErrorPage error={error} reset={() => {}} />);
    expect(screen.getByText(/Trace: abc123xyz/)).toBeTruthy();
  });

  it("omits the trace code when there is no digest", () => {
    render(<ErrorPage error={new Error("boom")} reset={() => {}} />);
    expect(screen.queryByText(/Trace:/)).toBeNull();
  });
});
