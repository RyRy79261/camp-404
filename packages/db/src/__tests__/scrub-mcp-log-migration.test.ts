import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import * as schema from "../schema";

// 0100: the Claude connector's log held raw query errors, with the values
// being saved, and erasure left a member's log rows as they were. The
// migration clears both from rows already stored. The harness has run it on
// an empty database; the test stores rows and runs its SQL, twice.

describe("0100_scrub_mcp_log_values", () => {
  const h = useTestDb();
  const SQL = readFileSync(
    new URL("../../migrations/0100_scrub_mcp_log_values.sql", import.meta.url),
    "utf8",
  );
  const run = async () => {
    for (const statement of SQL.split("--> statement-breakpoint")) {
      await h.client().exec(statement);
    }
  };

  async function log(
    userId: string,
    errorMessage: string | null,
    argsJson: Record<string, unknown> | null = { count: 1 },
  ) {
    const [row] = await h
      .db()
      .insert(schema.mcpAuditLog)
      .values({
        userId,
        clientId: "client-1",
        tool: "update_my_emergency_contacts",
        argsJson,
        outcome: errorMessage === null ? "success" : "error",
        errorMessage,
      })
      .returning({ id: schema.mcpAuditLog.id });
    return row!.id;
  }

  const read = async (id: string) => {
    const [row] = await h
      .db()
      .select()
      .from(schema.mcpAuditLog)
      .where(eq(schema.mcpAuditLog.id, id));
    return row!;
  };

  it("clears raw query values and an erased member's rows, and keeps the rest", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const erased = await makeUser(db, { sanitised: true });
    const leak = await log(
      member.id,
      'Failed query: update "users" set "emergency_contacts" = $1\nparams: [{"phone":"+27 82 555 0199"}]',
    );
    const refusal = await log(member.id, "Only a captain can do this.");
    const fine = await log(member.id, null);
    const theirs = await log(erased.id, "Only a captain can do this.", {
      fields: ["bio.statement"],
    });

    await run();
    await run();

    expect((await read(leak)).errorMessage).toBe("DrizzleQueryError");
    expect(await read(refusal)).toMatchObject({
      errorMessage: "Only a captain can do this.",
      argsJson: { count: 1 },
    });
    expect((await read(fine)).argsJson).toEqual({ count: 1 });
    expect(await read(theirs)).toMatchObject({
      tool: "update_my_emergency_contacts",
      argsJson: null,
      errorMessage: null,
    });
  });
});
