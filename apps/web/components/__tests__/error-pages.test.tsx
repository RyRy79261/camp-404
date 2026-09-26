import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";
import ConsoleError from "@/app/(console)/error";
import QuestionnaireError from "@/app/(console)/questionnaires/error";
import ConsoleNotFound from "@/app/(console)/not-found";
import {
  DesktopSignalsContext,
  type DesktopSignals,
} from "@/components/os/held-screen";

const pathname = vi.hoisted(() => ({ value: "/tasks" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

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

const SIGNALS: DesktopSignals = {
  hold: () => {},
  open: () => {},
  closeLive: () => {},
};
/** A page inside the desktop: its signals are there. */
const onDesktop = {
  wrapper: ({ children }: { children: React.ReactNode }) => (
    <DesktopSignalsContext.Provider value={SIGNALS}>
      {children}
    </DesktopSignalsContext.Provider>
  ),
};

describe("console error boundaries (inside a desktop window)", () => {
  it("names the program that stopped, from the address alone", () => {
    pathname.value = "/tasks";
    const { unmount } = render(
      <ConsoleError error={new Error("boom")} reset={() => {}} />,
      onDesktop,
    );
    expect(
      screen.getByRole("heading", { name: "Tasks stopped responding" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to the desktop" })
        .getAttribute("href"),
    ).toBe("/");
    unmount();
    // A document's title never comes from its data.
    pathname.value = "/meetings/the-secret-meeting";
    render(
      <QuestionnaireError error={new Error("boom")} reset={() => {}} />,
      onDesktop,
    );
    expect(
      screen.getByRole("heading", { name: "Meeting stopped responding" }),
    ).toBeTruthy();
  });

  it("falls back to the plain sentence off a program", () => {
    pathname.value = "/";
    render(
      <ConsoleError error={new Error("boom")} reset={() => {}} />,
      onDesktop,
    );
    expect(
      screen.getByRole("heading", { name: "Something went sideways." }),
    ).toBeTruthy();
  });

  it("with no desktop drawn (the landing page, setup), is the full-screen page", () => {
    pathname.value = "/tasks";
    const bare = render(
      <ConsoleError error={new Error("boom")} reset={() => {}} />,
    );
    const root = render(
      <ErrorPage error={new Error("boom")} reset={() => {}} />,
    );
    expect(screen.queryByText("Tasks stopped responding")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Back to the desktop" }),
    ).toBeNull();
    // The same page the root boundary draws.
    expect(bare.container.innerHTML).toBe(root.container.innerHTML);
  });
});

describe("console not-found (inside a desktop window)", () => {
  it("says the page is not found and leads back to the desktop", () => {
    render(<ConsoleNotFound />);
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to the desktop" })
        .getAttribute("href"),
    ).toBe("/");
  });
});
