import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompletionHero } from "../completion-hero";

afterEach(cleanup);

describe("CompletionHero", () => {
  it("sends a member with nothing else required back to camp", () => {
    render(<CompletionHero variant="all-done" />);
    expect(
      screen.getByRole("heading", { name: "Questionnaire complete" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to camp" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.getByText("You’re all caught up.")).toBeTruthy();
  });

  it("points at the next required questionnaire and counts what is left", () => {
    render(
      <CompletionHero
        variant="more-required"
        pendingCount={2}
        nextHref="/questionnaires/next-1"
      />,
    );
    expect(
      screen.getByText("2 more required before you’re unlocked"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Start next questionnaire" })
        .getAttribute("href"),
    ).toBe("/questionnaires/next-1");
    expect(screen.queryByRole("link", { name: "Back to camp" })).toBeNull();
  });

  it("says 1 more in the singular", () => {
    render(
      <CompletionHero variant="more-required" pendingCount={1} nextHref="/q/1" />,
    );
    expect(screen.getByText("1 more required before you’re unlocked")).toBeTruthy();
  });
});
