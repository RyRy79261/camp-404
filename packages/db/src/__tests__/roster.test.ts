import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getCampMemberDetail } from "../roster";

// The government-ID columns are the most sensitive material in the schema, and
// getCampMemberDetail backs both a captain-gated read and a member-facing one.
// These run the REAL query against real Postgres, so they prove the ciphertext
// leaves the SELECT list by default — not that it is projected away afterwards.

describe("getCampMemberDetail — ID ciphertext", () => {
  const h = useTestDb();

  it("omits the ID ciphertext columns by default", async () => {
    const db = h.db();
    const user = await makeUser(db, {
      passportEncrypted: "CIPHER-P",
      saIdEncrypted: "CIPHER-S",
    });

    const detail = await getCampMemberDetail(user.id);

    expect(detail).not.toBeNull();
    // Absent keys, not null values: the columns never entered the query.
    expect(Object.keys(detail!)).not.toContain("passportEncrypted");
    expect(Object.keys(detail!)).not.toContain("saIdEncrypted");
    // And nothing else on the row smuggles them back in.
    expect(JSON.stringify(detail)).not.toContain("CIPHER");
  });

  it("includes them when the caller opts in with includeIdDocuments", async () => {
    const db = h.db();
    const user = await makeUser(db, {
      passportEncrypted: "CIPHER-P",
      saIdEncrypted: "CIPHER-S",
    });

    const detail = await getCampMemberDetail(user.id, {
      includeIdDocuments: true,
    });

    // The captain modal still gets its ID — guards against over-narrowing.
    expect(detail?.passportEncrypted).toBe("CIPHER-P");
    expect(detail?.saIdEncrypted).toBe("CIPHER-S");
  });

  it("treats an explicit includeIdDocuments: false as the default", async () => {
    const db = h.db();
    const user = await makeUser(db, {
      passportEncrypted: "CIPHER-P",
      saIdEncrypted: "CIPHER-S",
    });

    const detail = await getCampMemberDetail(user.id, {
      includeIdDocuments: false,
    });

    expect(JSON.stringify(detail)).not.toContain("CIPHER");
  });

  it("returns null for an unknown member", async () => {
    expect(
      await getCampMemberDetail("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });
});
