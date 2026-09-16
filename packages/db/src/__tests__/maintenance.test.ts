import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { decrypt, encrypt } from "../crypto";
import { backfillIdEncryption, listLiveAuthUserIds } from "../maintenance";
import * as schema from "../schema";

// The daily upkeep on real Postgres: leftover plaintext ID numbers move into
// the encrypted columns (and never overwrite a newer encrypted value), and the
// live auth ids leave erased members out.

describe("backfillIdEncryption", () => {
  const h = useTestDb();

  beforeAll(() => {
    process.env.PGCRYPTO_KEY ??= "test-key-for-maintenance-suite";
  });

  async function profile(userId: string, responses: Record<string, unknown>) {
    await h
      .db()
      .insert(schema.burnerProfiles)
      .values({ userId, version: "v10", responses });
  }

  async function read(userId: string) {
    const [row] = await h
      .db()
      .select({
        responses: schema.burnerProfiles.responses,
        passport: schema.users.passportEncrypted,
        saId: schema.users.saIdEncrypted,
      })
      .from(schema.burnerProfiles)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.burnerProfiles.userId),
      )
      .where(eq(schema.burnerProfiles.userId, userId));
    return row!;
  }

  it("encrypts a leftover plaintext ID into the right column and strips it", async () => {
    const member = await makeUser(h.db());
    await profile(member.id, {
      "id.type": "sa_id",
      "id.number": "8001015009087",
      country: "ZA",
    });

    expect(await backfillIdEncryption()).toEqual({
      scanned: 1,
      migrated: 1,
      stripped: 0,
    });

    const row = await read(member.id);
    expect(row.responses).toEqual({ "id.type": "sa_id", country: "ZA" });
    expect(row.passport).toBeNull();
    expect(decrypt(row.saId!)).toBe("8001015009087");
  });

  it("keeps a newer encrypted ID and only strips the stale plaintext", async () => {
    const member = await makeUser(h.db(), {
      passportEncrypted: encrypt("NEW123456"),
    });
    await profile(member.id, {
      "id.type": "passport",
      "id.number": "OLD000000",
    });

    expect(await backfillIdEncryption()).toEqual({
      scanned: 1,
      migrated: 0,
      stripped: 1,
    });

    const row = await read(member.id);
    expect(row.responses).toEqual({ "id.type": "passport" });
    expect(decrypt(row.passport!)).toBe("NEW123456");
  });

  it("does nothing on a second run, or for profiles with no plaintext ID", async () => {
    const member = await makeUser(h.db());
    const other = await makeUser(h.db());
    await profile(member.id, {
      "id.type": "passport",
      "id.number": "A1234567",
    });
    await profile(other.id, { country: "ZA" });

    await backfillIdEncryption();
    expect(await backfillIdEncryption()).toEqual({
      scanned: 0,
      migrated: 0,
      stripped: 0,
    });
    expect((await read(other.id)).responses).toEqual({ country: "ZA" });
  });
});

describe("listLiveAuthUserIds", () => {
  const h = useTestDb();

  it("lists live accounts and leaves erased ones out", async () => {
    const live = await makeUser(h.db(), { authUserId: "auth-live" });
    await makeUser(h.db(), {
      authUserId: `deleted:${live.id}`,
      sanitised: true,
    });

    expect([...(await listLiveAuthUserIds())]).toEqual(["auth-live"]);
  });
});
