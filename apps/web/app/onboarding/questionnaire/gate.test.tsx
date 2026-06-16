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

import { QuestionnaireGate } from "./gate";

describe("QuestionnaireGate", () => {
  it("renders the interstitial with a Start CTA into the wizard", () => {
    render(
      <QuestionnaireGate
        title="Burner profile"
        questionCount={8}
        estimatedMinutes={3}
        startHref="/onboarding/questionnaire?start=1"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Before you go any further" }),
    ).toBeTruthy();
    expect(screen.getByText("Burner profile")).toBeTruthy();
    expect(screen.getByText(/8 questions/)).toBeTruthy();

    const start = screen.getByRole("link", { name: "Start questionnaire" });
    expect(start.getAttribute("href")).toBe(
      "/onboarding/questionnaire?start=1",
    );
    expect(screen.getByRole("link", { name: "Sign out" })).toBeTruthy();
  });
});
