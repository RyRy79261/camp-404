import { beforeEach, describe, expect, it, vi } from "vitest";

// The member ladder every member page walks. The users helpers are mocked; the
// order of the rungs and the redirect are what these assert.

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  getBurnerProfile: vi.fn(),
  getPendingRequiredActions: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
  syncOpenGates: vi.fn(),
}));

import { redirect } from "next/navigation";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  getPendingRequiredActions,
  hasCampAccess,
  isApproved,
  syncOpenGates,
} from "@/lib/users";
import { memberBlock, requireMemberPage } from "../member-gate";

const campUser = { id: "user-1" } as never;
const BLOCKING_SEND = {
  actionKey: "def_safety",
  blocking: true,
  type: "questionnaire",
  activationId: "act-1",
  title: "Safety",
  version: "1",
  dueAt: null,
  createdAt: new Date("2026-09-01T10:00:00Z"),
} as Awaited<ReturnType<typeof getPendingRequiredActions>>[number];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(getPendingRequiredActions).mockResolvedValue([]);
  vi.mocked(getBurnerProfile).mockResolvedValue({
    completedAt: new Date(),
  } as never);
  vi.mocked(isApproved).mockReturnValue(true);
});

describe("memberBlock", () => {
  it("lets a member through when every rung is clear", async () => {
    expect(await memberBlock(campUser, "a@example.com")).toBeNull();
  });

  it("sends someone with no invite to enter a code, before anything else", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    vi.mocked(getPendingRequiredActions).mockResolvedValue([BLOCKING_SEND]);

    expect(await memberBlock(campUser, null)).toEqual({
      reason: "invite",
      href: "/signup/required",
    });
    expect(syncOpenGates).not.toHaveBeenCalled();
  });

  it("sends a member with a blocking questionnaire to answer it", async () => {
    vi.mocked(getPendingRequiredActions).mockResolvedValue([BLOCKING_SEND]);
    vi.mocked(isApproved).mockReturnValue(false);

    expect(await memberBlock(campUser, null)).toEqual({
      reason: "questionnaire",
      href: "/questionnaires/act-1",
    });
  });

  it("hands a late joiner the gates of open sends before it reads them", async () => {
    const order: string[] = [];
    vi.mocked(syncOpenGates).mockImplementation(async () => {
      order.push("sync");
    });
    vi.mocked(getPendingRequiredActions).mockImplementation(async () => {
      order.push("read");
      return [];
    });

    await memberBlock(campUser, null);

    expect(syncOpenGates).toHaveBeenCalledWith("user-1");
    expect(order).toEqual(["sync", "read"]);
  });

  it("ignores an optional questionnaire", async () => {
    vi.mocked(getPendingRequiredActions).mockResolvedValue([
      { ...BLOCKING_SEND, blocking: false },
    ]);

    expect(await memberBlock(campUser, null)).toBeNull();
  });

  it("sends a member with no finished burner profile to onboarding", async () => {
    vi.mocked(getBurnerProfile).mockResolvedValue(null);
    vi.mocked(isApproved).mockReturnValue(false);

    expect(await memberBlock(campUser, null)).toEqual({
      reason: "onboarding",
      href: "/onboarding/questionnaire",
    });
  });

  it("holds an applicant behind approval last", async () => {
    vi.mocked(isApproved).mockReturnValue(false);

    expect(await memberBlock(campUser, null)).toEqual({
      reason: "approval",
      href: "/pending-approval",
    });
  });
});

describe("requireMemberPage", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "a@example.com",
      displayName: "A",
    });
    vi.mocked(ensureCampUser).mockResolvedValue(campUser);
  });

  it("returns the viewer when nothing blocks them", async () => {
    await expect(requireMemberPage()).resolves.toEqual({
      authUser: { id: "auth-1", primaryEmail: "a@example.com", displayName: "A" },
      campUser,
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to the first rung the viewer has not cleared", async () => {
    vi.mocked(getPendingRequiredActions).mockResolvedValue([BLOCKING_SEND]);

    await expect(requireMemberPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/questionnaires/act-1");
  });
});
