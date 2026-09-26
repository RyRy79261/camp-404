// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The founder's first page load sends several requests at once, and each one
// reaches ensureCampUser with no camp row yet. They all used to insert, and
// every one after the first failed on the unique auth_user_id ("Failed query:
// insert into users" in the e2e-db logs), throwing that request onto an error
// page. Real Postgres (PGlite) here, because the fix is the ON CONFLICT.
//
// PGlite has one connection, so the statements of two concurrent calls queue
// one after another: both reads run (no row), then both inserts, and the
// second insert meets the first one's row. That is the race, not a sequential
// replay of it.

import { eq } from "drizzle-orm";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { ensureCampUser } from "../users";

const FOUNDER = {
  id: "auth-founder",
  primaryEmail: "founder@example.com",
  displayName: "Founder",
  emailVerified: true,
};

describe("ensureCampUser for a founder account", () => {
  const h = useTestDb();

  beforeEach(() => {
    vi.stubEnv("E2E_TEST_MODE", "");
    vi.stubEnv("FOUNDER_EMAILS", FOUNDER.primaryEmail);
    vi.stubEnv("GOD_EMAILS", FOUNDER.primaryEmail);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function rowsFor(authUserId: string) {
    return h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, authUserId));
  }

  it("creates one row when two first requests arrive together", async () => {
    const [a, b] = await Promise.all([
      ensureCampUser(FOUNDER),
      ensureCampUser(FOUNDER),
    ]);

    const rows = await rowsFor(FOUNDER.id);
    expect(rows).toHaveLength(1);
    expect(a.id).toBe(rows[0]!.id);
    expect(b.id).toBe(rows[0]!.id);
    expect(a.approvalStatus).toBe("approved");

    // Both requests leave the burner-profile gate in place, once.
    const gates = await h
      .db()
      .select()
      .from(schema.requiredActions)
      .where(eq(schema.requiredActions.userId, rows[0]!.id));
    expect(gates.map((g) => g.actionKey)).toEqual(["burner_profile"]);
  });

  it("hands back the existing row on a later request", async () => {
    const first = await ensureCampUser(FOUNDER);
    const again = await ensureCampUser(FOUNDER);
    expect(again.id).toBe(first.id);
    expect(await rowsFor(FOUNDER.id)).toHaveLength(1);
  });
});
