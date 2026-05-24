import { describe, expect, it } from "vitest";
import type { McpScopeRows } from "@camp404/db/mcp";
import { canSeeIdDocuments, redactIdDocuments } from "@/lib/mcp/consent";
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

describe("redactIdDocuments", () => {
  const fullRow = {
    id: OTHER_ID,
    aiDataConsent: false,
    displayName: "Other",
    passportEncrypted: "pgp-blob",
    saIdEncrypted: "pgp-sa",
    eftDetailsEncrypted: "pgp-eft",
  };

  it("strips encrypted fields when not allowed", () => {
    const scope = buildScope({ id: SELF_ID, rank: "captain" });
    const out = redactIdDocuments(scope, fullRow);
    expect(out).not.toHaveProperty("passportEncrypted");
    expect(out).not.toHaveProperty("saIdEncrypted");
    expect(out).not.toHaveProperty("eftDetailsEncrypted");
    expect(out.displayName).toBe("Other");
  });

  it("keeps encrypted fields when allowed", () => {
    const consenting = { ...fullRow, aiDataConsent: true };
    const scope = buildScope({ id: SELF_ID, rank: "captain" });
    const out = redactIdDocuments(scope, consenting);
    expect(out.passportEncrypted).toBe("pgp-blob");
    expect(out.saIdEncrypted).toBe("pgp-sa");
    expect(out.eftDetailsEncrypted).toBe("pgp-eft");
  });

  it("keeps fields when subject is self, regardless of consent", () => {
    const selfRow = { ...fullRow, id: SELF_ID, aiDataConsent: false };
    const scope = buildScope({ id: SELF_ID, rank: "member" });
    const out = redactIdDocuments(scope, selfRow);
    expect(out.passportEncrypted).toBe("pgp-blob");
  });
});
