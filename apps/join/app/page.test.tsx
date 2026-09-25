import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import JoinPage from "./page";

// next/font runs only in Next's compiler.
vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "inter" }),
}));

// The placeholder until the owner's copy arrives: the heading, one line, and
// Sign up and Sign in pointing at the console.
describe("the join site's page", () => {
  it("says the page is coming and links to the console's sign-up and sign-in", () => {
    render(<JoinPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "How to join" }),
    ).toBeTruthy();
    expect(screen.getByText("The full page is coming soon.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign up" }).getAttribute("href"),
    ).toBe("https://camp-404.com/auth/sign-up");
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe("https://camp-404.com/auth/sign-in");
  });
});
