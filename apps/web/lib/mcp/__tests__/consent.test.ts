import { describe, expect, it } from "vitest";
import type { McpScopeRows } from "@camp404/db/mcp";
import { canSeeIdDocuments } from "@/lib/mcp/consent";
import { resolveMcpScope } from "@/lib/mcp/scope";

const SELF_ID = "00000000-0000-0000-0000-0000000000aa";
const OTHER_ID = "00000000-0000-0000-0000-0000000000bb";

function buildScope(
  overrides: {
    id?: string;
    rank?: "captain" | "member";
    aiDataConsent?: boolean;
  } = {},
) {
  const rows: McpScopeRows = {
    user: {
      id: overrides.id ?? SELF_ID,
      rank: overrides.rank ?? "member",
      aiDataConsent: overrides.aiDataConsent ?? false,
    },
    teamMemberships: [],
    driverIntent: false,
  };
  return resolveMcpScope(rows);
}

describe("canSeeIdDocuments", () => {
  it("self always sees own ID docs regardless of consent or rank", () => {
    const scope = buildScope({ id: SELF_ID, rank: "member" });
    expect(
      canSeeIdDocuments(scope, { id: SELF_ID, aiDataConsent: false }),
    ).toBe(true);
  });

  it("captain + consenting subject -> visible", () => {
    const scope = buildScope({ id: SELF_ID, rank: "captain" });
    expect(
      canSeeIdDocuments(scope, { id: OTHER_ID, aiDataConsent: true }),
    ).toBe(true);
  });

  it("captain + non-consenting subject -> hidden", () => {
    const scope = buildScope({ id: SELF_ID, rank: "captain" });
    expect(
      canSeeIdDocuments(scope, { id: OTHER_ID, aiDataConsent: false }),
    ).toBe(false);
  });

  it("non-captain caller never sees other users' ID docs even with consent", () => {
    const scope = buildScope({ id: SELF_ID, rank: "member" });
    expect(
      canSeeIdDocuments(scope, { id: OTHER_ID, aiDataConsent: true }),
    ).toBe(false);
  });
});
