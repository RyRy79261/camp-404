import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

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

import {
  ReadinessFunnelCard,
  SendCompletionCard,
  TeamCoverageCard,
} from "../status-board";
import type {
  ReadinessFunnel,
  SendCompletion,
  TeamCoverageRow,
} from "../readiness";

afterEach(cleanup);

// The status board's three cards. What is under test is what a captain can
// believe from them: a bar is only drawn where there is a number, a rung the
// deployment cannot read says so, and every team — leaderless or empty —
// keeps its row and its way into the roster.

function funnel(over: Partial<ReadinessFunnel> = {}): ReadinessFunnel {
  return {
    total: 4,
    stages: [
      {
        key: "signed_up",
        label: "Signed up",
        count: 4,
        hint: "Has an account",
      },
      { key: "dues", label: "Dues paid", count: 1, hint: "Settled" },
    ],
    ...over,
  };
}

describe("ReadinessFunnelCard", () => {
  it("prints every rung's count beside its bar", () => {
    render(<ReadinessFunnelCard funnel={funnel()} />);

    expect(screen.getByText("4 members signed up")).toBeTruthy();
    const dues = screen.getByText("Dues paid").closest("li")!;
    expect(within(dues).getByText("1")).toBeTruthy();
    expect(
      screen.getByText(/Each stage counts the members who have cleared/),
    ).toBeTruthy();
  });

  it("says a rung is unreadable and draws NO bar for it", () => {
    const { container } = render(
      <ReadinessFunnelCard
        funnel={funnel({
          stages: [
            {
              key: "signed_up",
              label: "Signed up",
              count: 4,
              hint: "Has an account",
            },
            { key: "dues", label: "Dues paid", count: null, hint: "Settled" },
          ],
        })}
      />,
    );

    expect(screen.getByText("not available here")).toBeTruthy();
    // One bar for the rung that has a number, none for the rung that doesn't:
    // an empty bar would read as zero.
    expect(container.querySelectorAll(".bg-ab-sage")).toHaveLength(1);
  });

  it("an empty camp says so instead of drawing five empty bars", () => {
    const { container } = render(
      <ReadinessFunnelCard funnel={funnel({ total: 0 })} />,
    );

    expect(screen.getByText(/Nobody has signed up yet/)).toBeTruthy();
    expect(container.querySelectorAll(".bg-ab-sage")).toHaveLength(0);
  });
});

function coverageRow(over: Partial<TeamCoverageRow> = {}): TeamCoverageRow {
  return {
    key: "kitchen",
    label: "Kitchen",
    members: 6,
    leads: 1,
    hasLead: true,
    archived: false,
    href: "/captains/camp-management?team=kitchen",
    ...over,
  };
}

describe("TeamCoverageCard", () => {
  it("heads with how many teams have a lead, and links each team into the roster", () => {
    render(
      <TeamCoverageCard
        rows={[
          coverageRow(),
          coverageRow({
            key: "structures",
            label: "Structures",
            members: 4,
            leads: 0,
            hasLead: false,
            href: "/captains/camp-management?team=structures",
          }),
        ]}
      />,
    );

    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText("2 teams this year")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Structures/ });
    expect(link.getAttribute("href")).toBe(
      "/captains/camp-management?team=structures",
    );
    const structures = link.closest("li")!;
    expect(within(structures).getByText("No lead")).toBeTruthy();
    expect(within(structures).getByText("4 members")).toBeTruthy();
  });

  it("names the teams nobody is on", () => {
    render(
      <TeamCoverageCard
        rows={[
          coverageRow(),
          coverageRow({
            key: "structures",
            label: "Structures",
            members: 0,
            leads: 0,
            hasLead: false,
          }),
        ]}
      />,
    );

    expect(screen.getByText(/1 team has nobody on it yet/)).toBeTruthy();
  });

  it("marks a team that has been archived out from under its members", () => {
    render(<TeamCoverageCard rows={[coverageRow({ archived: true })]} />);
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("with no teams configured, points at camp settings rather than an empty bar", () => {
    const { container } = render(<TeamCoverageCard rows={[]} />);
    expect(screen.getByText(/No teams are set up yet/)).toBeTruthy();
    expect(container.querySelectorAll(".bg-ab-sage")).toHaveLength(0);
  });
});

function send(over: Partial<SendCompletion> = {}): SendCompletion {
  return {
    activationId: "act-1",
    questionnaireKey: "gear-check",
    title: "Gear check",
    sent: 5,
    completed: 2,
    eligible: 3,
    completionPct: 67,
    href: "/captains/questionnaires/gear-check/metrics",
    ...over,
  };
}

describe("SendCompletionCard", () => {
  it("shows answered out of reached, and opens that send's results", () => {
    render(<SendCompletionCard sends={[send()]} />);

    expect(screen.getByText("2 / 3 · 67%")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Gear check" }).getAttribute("href"),
    ).toBe("/captains/questionnaires/gear-check/metrics");
  });

  it("says a send reached nobody rather than printing 0 / 0 · 0%", () => {
    render(
      <SendCompletionCard
        sends={[send({ sent: 0, completed: 0, eligible: 0, completionPct: 0 })]}
      />,
    );

    expect(screen.getByText("Reached nobody")).toBeTruthy();
  });

  it("tells a send that reached nobody from one whose gates were all waived", () => {
    // It reached five people and every one of them left the denominator —
    // "Reached nobody" would be the wrong sentence, and "0 / 0" a wrong number.
    render(
      <SendCompletionCard
        sends={[send({ sent: 5, completed: 0, eligible: 0, completionPct: 0 })]}
      />,
    );

    expect(screen.getByText("Nobody left to answer")).toBeTruthy();
  });

  it("with nothing open, says nothing is open", () => {
    render(<SendCompletionCard sends={[]} />);
    expect(
      screen.getByText(/No questionnaires are open right now/),
    ).toBeTruthy();
    expect(screen.getByText("0 open sends")).toBeTruthy();
  });
});
