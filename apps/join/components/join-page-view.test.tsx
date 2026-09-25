import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JoinPageView } from "./join-page-view";

// The join site's page: the published text, and a clear way to sign up in
// every state, including when nothing is published or the read failed.

describe("JoinPageView", () => {
  it("shows the published page for its year, with Sign up above and below", () => {
    render(
      <JoinPageView
        read={{
          status: "published",
          cycle: 2026,
          markdown: "# The crew\n\nWe camp together.",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "How to join" }),
    ).toBeTruthy();
    expect(screen.getByText("For 2026")).toBeTruthy();
    // The text's own # is a section heading under the page's h1.
    expect(
      screen.getByRole("heading", { level: 2, name: "The crew" }),
    ).toBeTruthy();
    expect(screen.getByText("We camp together.")).toBeTruthy();

    const signUps = screen.getAllByRole("link", { name: "Sign up" });
    expect(signUps).toHaveLength(2);
    for (const link of signUps) {
      expect(link.getAttribute("href")).toBe(
        "https://camp-404.com/auth/sign-up",
      );
    }
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe("https://camp-404.com/auth/sign-in");
  });

  it("names no year when the camp has not set one", () => {
    render(
      <JoinPageView
        read={{ status: "published", cycle: null, markdown: "Hello" }}
      />,
    );
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByText(/^For /)).toBeNull();
  });

  it("says when this year's page is not up, and still offers Sign up", () => {
    render(<JoinPageView read={{ status: "none" }} />);
    expect(screen.getByText(/isn't up yet/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Sign up" })).toHaveLength(2);
    expect(screen.queryByText(/^For /)).toBeNull();
  });

  it("says the page didn't load when the read failed", () => {
    render(<JoinPageView read={{ status: "unavailable" }} />);
    expect(screen.getByText(/didn't load just now/)).toBeTruthy();
    expect(screen.queryByText(/isn't up yet/)).toBeNull();
  });

  it("links the policies on the console's domain", () => {
    render(<JoinPageView read={{ status: "none" }} />);
    expect(
      screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
    ).toBe("https://camp-404.com/privacy");
    expect(
      screen.getByRole("link", { name: "Terms" }).getAttribute("href"),
    ).toBe("https://camp-404.com/terms");
  });
});
