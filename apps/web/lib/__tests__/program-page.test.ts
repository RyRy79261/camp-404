import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerRank } from "@camp404/types";

// A page's gate read from its program's registry entry: the entry's rank goes
// to captainPageGate (mocked here, tested in captain-gate.test.ts), and its
// rule decides `allowed` on the same actor.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));

import { captainPageGate } from "@/lib/captain-gate";
import { programPage } from "../program-page";
import { PROGRAM_REGISTRY } from "../programs";

function viewer(rank: ViewerRank, ledTeams: string[], cleared: boolean) {
  vi.mocked(captainPageGate).mockResolvedValue({
    authUser: { id: "auth-1" },
    campUser: { id: "user-1" },
    rank,
    actor: { rank, ledTeams },
    cleared,
  } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("programPage", () => {
  it("asks captainPageGate for the bar the registry names", async () => {
    for (const entry of PROGRAM_REGISTRY) {
      viewer("captain", [], true);
      await programPage(entry.id);
      expect(captainPageGate).toHaveBeenLastCalledWith(entry.rank);
    }
  });

  it("allows a cleared viewer when the program has no rule", async () => {
    viewer("team_lead", ["kitchen"], true);
    expect(await programPage("questionnaires")).toMatchObject({
      cleared: true,
      allowed: true,
    });
  });

  it("never allows a viewer who is not cleared", async () => {
    viewer("camp_member", [], false);
    expect(await programPage("audit")).toMatchObject({
      cleared: false,
      allowed: false,
    });
  });

  it("asks the program's rule on the gate's actor", async () => {
    // Payments: MONEY_KEEPER, a captain or a Finance lead.
    viewer("team_lead", ["kitchen"], true);
    expect(await programPage("payments")).toMatchObject({
      cleared: true,
      allowed: false,
    });
    viewer("team_lead", ["finance"], true);
    expect(await programPage("payments")).toMatchObject({ allowed: true });
    viewer("captain", [], true);
    expect(await programPage("payments")).toMatchObject({ allowed: true });
  });

  it("refuses a lead of another team on Kitchen review and gear rental", async () => {
    viewer("team_lead", ["structures"], true);
    expect((await programPage("recipe-review")).allowed).toBe(false);
    expect((await programPage("edit-recipe")).allowed).toBe(false);
    expect((await programPage("gear-rental")).allowed).toBe(false);
    viewer("team_lead", ["kitchen"], true);
    expect((await programPage("recipe-review")).allowed).toBe(true);
  });

  it("lets any team's lead write the Survival Guide, never a member", async () => {
    viewer("team_lead", ["structures"], true);
    expect((await programPage("new-guide-chapter")).allowed).toBe(true);
    expect((await programPage("edit-guide-chapter")).allowed).toBe(true);
    viewer("camp_member", [], false);
    expect((await programPage("new-guide-chapter")).allowed).toBe(false);
  });
});
