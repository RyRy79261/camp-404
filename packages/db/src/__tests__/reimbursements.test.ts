import { describe, expect, it } from "vitest";
import { UnknownCurrencyError } from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { submitReimbursement } from "../reimbursements";
import * as schema from "../schema";

// Lodging a claim: any member may, in a currency the camp takes. Amounts and
// account details here are made up.

describe("submitReimbursement", () => {
  const h = useTestDb();

  const claim = (submitterId: string, currency: string) => ({
    submitterId,
    team: "kitchen" as const,
    amount: "12.34",
    currency: currency as never,
    accountType: "international" as const,
    accountDetailsEncrypted: "ciphertext",
    description: "Tape",
    receiptBlobUrl: "https://example.com/receipt.jpg",
  });

  it("stores a claim in EUR as submitted", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const result = await submitReimbursement(claim(member.id, "EUR"));
    expect(result.status).toBe("submitted");

    const rows = await db.select().from(schema.reimbursements);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.id,
      submitterId: member.id,
      amount: "12.34",
      currency: "EUR",
      accountDetailsEncrypted: "ciphertext",
      itemPhotoBlobUrl: null,
    });
  });

  it("refuses GBP or a lower-case code, and writes no row", async () => {
    const db = h.db();
    const member = await makeUser(db);
    for (const currency of ["GBP", "eur", " ZAR"]) {
      await expect(
        submitReimbursement(claim(member.id, currency)),
      ).rejects.toThrow(UnknownCurrencyError);
    }
    expect(await db.select().from(schema.reimbursements)).toEqual([]);
  });
});
