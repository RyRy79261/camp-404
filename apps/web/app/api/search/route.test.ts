import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Ctrl+K's camp entries (#326, step 2). The console's gate first (signed in,
// camp-active, approved), then the viewer's rank and lead teams decide the
// page rules the query applies. Bad input is refused before anything is read,
// and no answer is ever cached.

vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn() }));
vi.mock("@/lib/search", () => ({
  searchCamp: vi.fn(),
  resolveRecent: vi.fn(),
}));

import { GET } from "./route";
import { captainActionGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import { resolveRecent, searchCamp } from "@/lib/search";

const USER = "11111111-1111-4111-8111-111111111111";

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/search?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: USER } as never,
    rank: "camp_member",
  });
  vi.mocked(getLeadTeams).mockResolvedValue([]);
  vi.mocked(searchCamp).mockResolvedValue([]);
  vi.mocked(resolveRecent).mockResolvedValue([]);
});

describe("GET /api/search", () => {
  it("refuses a signed-out visitor and reads nothing", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Not signed in.",
    });
    const res = await get("q=pot");
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(searchCamp).not.toHaveBeenCalled();
  });

  it("refuses an applicant still waiting for approval", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Your account is still awaiting approval.",
    });
    const res = await get("q=pot");
    expect(res.status).toBe(403);
    expect(searchCamp).not.toHaveBeenCalled();
  });

  it("gates at the console's member rung", async () => {
    await get("q=pot");
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
  });

  it("refuses empty, too long, or missing text before the gate", async () => {
    for (const q of ["q=", "q=%20%20", `q=${"x".repeat(81)}`, "", "recent="]) {
      const res = await get(q);
      expect(res.status, q).toBe(400);
    }
    expect(captainActionGate).not.toHaveBeenCalled();
  });

  it("searches as a plain member: no lounge, no recipe review", async () => {
    vi.mocked(searchCamp).mockResolvedValue([
      {
        kind: "recipe",
        id: "r1",
        title: "Pot bread",
        detail: "20 plates",
        href: "/kitchen/recipes/r1",
      },
    ]);
    const res = await get("q=%20pot%20");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      entries: [
        {
          kind: "recipe",
          id: "r1",
          title: "Pot bread",
          detail: "20 plates",
          href: "/kitchen/recipes/r1",
        },
      ],
    });
    expect(searchCamp).toHaveBeenCalledWith(
      {
        userId: USER,
        rank: "camp_member",
        runsLounge: false,
        reviewsRecipes: false,
      },
      "pot",
    );
    expect(getLeadTeams).not.toHaveBeenCalled();
  });

  it("reads a lead's teams: a Kitchen lead reviews recipes, a Vibes lead runs the lounge", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      campUser: { id: USER } as never,
      rank: "team_lead",
    });
    vi.mocked(getLeadTeams).mockResolvedValue(["kitchen"]);
    await get("q=pot");
    expect(vi.mocked(searchCamp).mock.calls[0]![0]).toMatchObject({
      rank: "team_lead",
      reviewsRecipes: true,
      runsLounge: false,
    });
    vi.mocked(getLeadTeams).mockResolvedValue(["ministry_of_vibes"]);
    await get("q=pot");
    expect(vi.mocked(searchCamp).mock.calls[1]![0]).toMatchObject({
      reviewsRecipes: false,
      runsLounge: true,
    });
  });

  it("looks Recent up again, at most eight, of known kinds only", async () => {
    const res = await get("recent=recipe:r1,person:" + USER);
    expect(res.status).toBe(200);
    expect(resolveRecent).toHaveBeenCalledWith(expect.anything(), [
      { kind: "recipe", id: "r1" },
      { kind: "person", id: USER },
    ]);
    const nine = Array.from({ length: 9 }, (_, i) => `task:t${i}`).join(",");
    expect((await get(`recent=${nine}`)).status).toBe(400);
    expect((await get("recent=payment:p1")).status).toBe(400);
    expect((await get("recent=recipe:r1;drop")).status).toBe(400);
  });
});
