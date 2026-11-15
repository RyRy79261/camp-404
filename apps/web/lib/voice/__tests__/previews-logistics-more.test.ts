// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../logistics", () => ({ listLogisticsPhases: vi.fn() }));

import { listLogisticsPhases } from "../../logistics";
import type { McpScope } from "../../mcp/scope";
import { LOGISTICS_MORE_PREVIEWS as P } from "../previews-logistics-more";

// Clearing a phase's days as a voice preview: what goes (the days, place and
// note) comes from the real row, and Do runs on the version read.

const SCOPE: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "captain",
  viewerRank: "captain",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: true,
};
const ctx = { scope: SCOPE, now: new Date() };

describe("clear_logistics_days preview", () => {
  it("shows what goes and runs on the version it read", async () => {
    vi.mocked(listLogisticsPhases).mockResolvedValue([
      {
        phase: "build",
        startDate: "2026-04-22",
        endDate: "2026-04-24",
        place: "Tankwa",
        note: "Shade cloth",
        version: 3,
      },
    ] as never);
    const p = await P.clear_logistics_days!(
      { phase: "build", expectedVersion: 1 },
      ctx,
    );
    expect(p.sentence).toBe("Clear Build's days (Wed 22 Apr – Fri 24 Apr)");
    expect(p.args.expectedVersion).toBe(3);
    expect(p.change).toEqual([
      "Place: “Tankwa” → (empty)",
      "Note: “Shade cloth” → (empty)",
    ]);
  });

  it("stops a phase with no days", async () => {
    vi.mocked(listLogisticsPhases).mockResolvedValue([]);
    const p = await P.clear_logistics_days!({ phase: "strike" }, ctx);
    expect(p.blocked).toBe("Strike has no days set.");
  });
});
