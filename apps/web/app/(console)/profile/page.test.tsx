import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipationStatus } from "@camp404/types";
import { INTENT_IMPLIED_BY_STATUS } from "@camp404/core";

// The profile's "This year" card: the member's own answer for this year, in
// their words, and the way to change it once there is one to change.

vi.mock("@/lib/member-gate", () => ({
  requireMemberPage: vi.fn(async () => ({
    authUser: { primaryEmail: "nova@example.com" },
    campUser: {
      id: "u1",
      displayName: "Nova",
      rank: "member",
      profileImageUrl: null,
    },
  })),
}));
vi.mock("@/lib/users", () => ({ isTeamLead: vi.fn(async () => false) }));
vi.mock("@/lib/payments", () => ({
  getMemberRefCode: vi.fn(async () => null),
  ledgerCycle: vi.fn(async () => 2027),
}));
vi.mock("@/lib/dues", () => ({
  getMemberDues: vi.fn(async () => ({
    balance: {
      chargedCents: 250_000,
      paidCents: 100_000,
      pendingCents: 0,
      refundedCents: 0,
      balanceCents: 150_000,
    },
  })),
}));
vi.mock("@/lib/participations", () => ({ getMyParticipation: vi.fn() }));
vi.mock("@/lib/integration-config", () => ({
  feedbackTracker: () => ({ ok: false, reason: "not_configured" }),
}));
vi.mock("@/components/auth/sign-out-link", () => ({
  SignOutLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/sign-out">{children}</a>
  ),
}));
vi.mock("@/components/feedback/report-settings-card", () => ({
  ReportSettingsCard: () => null,
}));
vi.mock("@/components/profile/profile-sections", () => ({
  ProfileSections: () => null,
}));

import { getMyParticipation } from "@/lib/participations";
import ProfilePage from "./page";

async function renderWith(status: ParticipationStatus | null) {
  vi.mocked(getMyParticipation).mockResolvedValue(
    status
      ? {
          cycle: 2027,
          status,
          intent: INTENT_IMPLIED_BY_STATUS[status],
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-02"),
        }
      : null,
  );
  render(await ProfilePage());
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("profile: Your dues", () => {
  it("says what the member owes, with the way to their dues", async () => {
    await renderWith("accepted");
    expect(screen.getByRole("heading", { name: "Your dues" })).toBeTruthy();
    expect(screen.getByText(/^You owe R\s1\s500,00\.$/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open My dues" }).getAttribute("href"),
    ).toBe("/dues");
  });
});

describe("profile: This year", () => {
  it.each<[ParticipationStatus, string]>([
    [
      "applied",
      "You said you're coming. The captains haven't confirmed places yet.",
    ],
    ["maybe", "You said maybe."],
    ["accepted", "You have a place at camp this year."],
    ["waitlisted", "You're on the waiting list."],
    ["not_attending", "You said you're not coming this year."],
  ])(
    "says %s in the member's words, with a way to change it",
    async (status, sentence) => {
      await renderWith(status);

      expect(screen.getByRole("heading", { name: "This year" })).toBeTruthy();
      expect(screen.getByText(sentence)).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "Change your answer" })
          .getAttribute("href"),
      ).toBe("/tools/forms/attendance");
      expect(getMyParticipation).toHaveBeenCalledWith("u1");
    },
  );

  it("asks nothing to change before the member has answered", async () => {
    await renderWith(null);

    expect(screen.getByRole("heading", { name: "This year" })).toBeTruthy();
    expect(screen.getByText("You haven't told us yet.")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Change your answer" }),
    ).toBeNull();
  });
});
