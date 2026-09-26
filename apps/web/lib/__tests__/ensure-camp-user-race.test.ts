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
import type * as Activations from "@camp404/db/activations";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { ensureCampUser, getPendingRequiredActions } from "../users";

// Stall the gate seed on demand, to open the window between the row and its
// gate that a concurrent request could fall into.
const hold = vi.hoisted(() => ({
  gate: null as Promise<void> | null,
  reached: false,
}));
vi.mock("@camp404/db/activations", async (importOriginal) => {
  const actual = await importOriginal<typeof Activations>();
  return {
    ...actual,
    ensureRequiredAction: async (
      ...args: Parameters<typeof actual.ensureRequiredAction>
    ) => {
      if (hold.gate) {
        hold.reached = true;
        await hold.gate;
      }
      return actual.ensureRequiredAction(...args);
    },
  };
});

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
    hold.gate = null;
    hold.reached = false;
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

  it("never lets another request find the founder's row without its gate", async () => {
    // The first request stalls where it seeds the gate (after the row is
    // in). A second request meanwhile finds the row, returns it at once, and
    // reads the gates the ladder would. It must see the burner profile: if the
    // row could be seen before its gate, that request let the founder past
    // onboarding.
    let release!: () => void;
    hold.gate = new Promise<void>((r) => (release = r));
    const first = ensureCampUser(FOUNDER);
    await vi.waitFor(() => expect(hold.reached).toBe(true));

    const second = await ensureCampUser(FOUNDER);
    const pending = await getPendingRequiredActions(second.id);
    release();
    await first;

    expect(pending.map((a) => a.actionKey)).toEqual(["burner_profile"]);
  });
});
