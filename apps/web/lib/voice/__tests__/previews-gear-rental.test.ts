// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../payments", () => ({ ledgerCycle: vi.fn(async () => 2026) }));
vi.mock("../../rental", () => ({
  getRentalOverview: vi.fn(),
  listRentalItems: vi.fn(),
}));

import { getRentalOverview, listRentalItems } from "../../rental";
import type { McpScope } from "../../mcp/scope";
import { rentalItemFingerprint } from "../../mcp/tools/gear-rental";
import { GEAR_RENTAL_PREVIEWS as P } from "../previews-gear-rental";

// The gear rental catalogue and tent labels as voice previews: the row comes
// from the real item or tent, and Do runs with the fingerprint and label the
// preview read.

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
const ITEM = {
  id: "22222222-2222-4222-8222-222222222222",
  cycle: 2026,
  name: "2-person tent",
  isTent: true,
  sleeps: 2,
  campPriceCents: 10_000,
  campStockCount: 2,
  supplierPriceCents: 25_000,
  currency: "ZAR",
  reserveCount: 0,
  reserveSource: "supplier" as const,
  archived: false,
};

describe("gear rental previews", () => {
  it("runs an item's change on the fingerprint it read", async () => {
    vi.mocked(listRentalItems).mockResolvedValue([ITEM]);
    const p = await P.update_rental_item!(
      { itemId: ITEM.id, fingerprint: "old", supplierPriceCents: 27_000 },
      ctx,
    );
    expect(p.sentence).toBe(
      "Change “2-person tent” in the gear rental catalogue",
    );
    expect(p.args.fingerprint).toBe(rentalItemFingerprint(ITEM));
    expect(p.change).toEqual([expect.stringMatching(/^supplierPriceCents: R/)]);
    vi.mocked(listRentalItems).mockResolvedValue([]);
    expect(
      (await P.update_rental_item!({ itemId: ITEM.id }, ctx)).blocked,
    ).toBe("That item isn't on the list any more.");
  });

  it("labels a tent from the label it read", async () => {
    vi.mocked(getRentalOverview).mockResolvedValue({
      tents: [
        {
          lineId: ITEM.id,
          itemName: "2-person tent",
          sleeps: 2,
          people: 1,
          tentLabel: "T1",
          source: "camp",
          ownerName: "Dee",
          sharers: [],
        },
      ],
    } as never);
    const p = await P.set_tent_label!(
      { lineId: ITEM.id, label: "T3", from: null },
      ctx,
    );
    expect(p.sentence).toBe("Label Dee's 2-person tent “T3”");
    expect(p.args.from).toBe("T1");
  });
});
