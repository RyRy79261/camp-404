import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next/link needs no router for static rendering; map it to a plain anchor.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { BlockingNotice, RunnerHeader } from "../questionnaire/blocking-chrome";

// A questionnaire that holds the app says so and offers only Sign out; an
// optional one says it is optional and can be left for later.
describe("RunnerHeader — required or optional", () => {
  it("holds the app for a blocking send: Required, the notice, Sign out", () => {
    render(
      <>
        <RunnerHeader title="Kitchen shift" blocking />
        <BlockingNotice />
      </>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Kitchen shift" }),
    ).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(
      screen.getByText(/can't use the rest of the app until this is finished/i),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Later" })).toBeNull();
  });

  it("does not claim an optional send locks the app", () => {
    render(<RunnerHeader title="Kitchen shift" blocking={false} />);
    expect(screen.getByText("Optional")).toBeTruthy();
    expect(screen.queryByText(/can't use the rest of the app/i)).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign out" })).toBeNull();
    // The escape goes back to the inbox, where the questionnaire stays listed.
    expect(
      screen.getByRole("link", { name: "Later" }).getAttribute("href"),
    ).toBe("/notifications");
  });
});
