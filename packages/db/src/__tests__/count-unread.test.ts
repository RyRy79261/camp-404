import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { QUESTIONNAIRE_REF_TYPE } from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { countUnread } from "../broadcasts";
import * as schema from "../schema";

// The notices half of the inbox badge. A questionnaire send delivers a notice
// AND leaves the form waiting, and the badge adds both halves, so the caller
// names the waiting sends and their own notice is left out: one form counts
// once. The exclusion is a WHERE clause, so it is tested against PGlite, where
// a NULL-unsafe NOT(...) would silently drop every delivery with no ref.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function deliver(
  db: DB,
  userId: string,
  ref: { refType: string | null; refId: string | null },
  readAt: Date | null = null,
) {
  await db.insert(schema.notificationDeliveries).values({
    userId,
    title: "Notice",
    body: "Notice body",
    channel: "in_app",
    presentation: "feed",
    kind: "announcement",
    refType: ref.refType,
    refId: ref.refId,
    readAt,
  });
}

const NO_REF = { refType: null, refId: null };

describe("countUnread", () => {
  const h = useTestDb();

  it("leaves out the notice of a questionnaire the caller counts as waiting", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const waiting = randomUUID();
    const answered = randomUUID();
    await deliver(db, member.id, NO_REF);
    await deliver(db, member.id, {
      refType: QUESTIONNAIRE_REF_TYPE,
      refId: waiting,
    });
    await deliver(db, member.id, {
      refType: QUESTIONNAIRE_REF_TYPE,
      refId: answered,
    });
    // Read, so never counted.
    await deliver(db, member.id, NO_REF, new Date());

    expect(await countUnread(member.id)).toBe(3);
    // The waiting form's notice drops out; the plain notice (no ref at all)
    // and the notice of a form already answered still count.
    expect(
      await countUnread(member.id, { exceptActivationIds: [waiting] }),
    ).toBe(2);
    expect(await countUnread(member.id, { exceptActivationIds: [] })).toBe(3);
  });

  it("only excludes questionnaire notices, not another ref with the same id", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    const id = randomUUID();
    await deliver(db, member.id, { refType: "broadcast", refId: id });
    await deliver(db, other.id, {
      refType: QUESTIONNAIRE_REF_TYPE,
      refId: id,
    });

    expect(await countUnread(member.id, { exceptActivationIds: [id] })).toBe(1);
    expect(await countUnread(other.id, { exceptActivationIds: [id] })).toBe(0);
  });
});
