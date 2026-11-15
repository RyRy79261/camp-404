// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// The panel's notes read is recorded after the response (lib/audit.ts, through
// next/server's `after`): collected here and run on demand.
const afterTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));

import { registerCaptainPeopleTools } from "../tools/captain-people";

// Captains' notes and tickets over the connector (tools/captain-people.ts),
// against real Postgres (PGlite) through the real handlers: captains only,
// the pages' own writes and audit rows, the notes read recorded as the panel
// records it, and the ticket compare-and-set on the value seen.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCaptainPeopleTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    http: { authInfo: { clientId: "test", extra: { campUserId: as } } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : { data: JSON.parse(text) as Record<string, unknown> };
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- useTestDb is the PGlite harness, not a React Hook
const h = useTestDb();

beforeEach(() => {
  afterTasks.length = 0;
});

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });
async function lead() {
  const user = await member();
  await makeMembership(h.db(), {
    userId: user.id,
    team: "kitchen",
    isLead: true,
  });
  return user;
}

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

describe("add_member_note and list_member_notes", () => {
  it("adds a note for captains, audited by length, and reads it back recorded", async () => {
    const cap = await captain();
    const grace = await member();
    const res = await call(
      "add_member_note",
      { userId: grace.id, body: "  Strong welder.  " },
      cap.id,
    );
    expect(res.data).toMatchObject({ added: true });
    const notes = await h
      .db()
      .select()
      .from(schema.memberNotes)
      .where(eq(schema.memberNotes.userId, grace.id));
    expect(notes.map((n) => [n.body, n.authorId])).toEqual([
      ["Strong welder.", cap.id],
    ]);
    const added = await auditRows("member.note_added");
    expect(added.map((r) => r.metadata)).toEqual([{ length: 14 }]);
    // Adding answers with no notes, so no read is recorded.
    expect(afterTasks).toHaveLength(0);

    const read = await call("list_member_notes", { userId: grace.id }, cap.id);
    expect(read.data!.notes).toMatchObject([{ body: "Strong welder." }]);
    for (const task of afterTasks) await task();
    const viewed = await auditRows("member.notes.viewed");
    expect(viewed.map((r) => [r.actorId, r.target, r.metadata])).toEqual([
      [cap.id, grace.id, { count: 1 }],
    ]);
  });

  it("records no read when there is nothing to show", async () => {
    const cap = await captain();
    const grace = await member();
    const read = await call("list_member_notes", { userId: grace.id }, cap.id);
    expect(read.data!.notes).toEqual([]);
    expect(afterTasks).toHaveLength(0);
  });

  it("refuses a team lead, the member and a blank or unknown member", async () => {
    const cap = await captain();
    const grace = await member();
    const kitchenLead = await lead();
    for (const who of [kitchenLead, grace]) {
      for (const name of ["add_member_note", "list_member_notes"]) {
        const res = await call(name, { userId: grace.id, body: "x" }, who.id);
        expect(res.error).toMatch(/^Only a captain can do this\./);
      }
    }
    expect(
      await call("add_member_note", { userId: grace.id, body: " " }, cap.id),
    ).toEqual({ error: "Write the note first." });
    expect(
      await call(
        "add_member_note",
        { userId: "00000000-0000-4000-8000-000000000000", body: "Hi" },
        cap.id,
      ),
    ).toEqual({ error: "Member not found." });
    expect(await h.db().select().from(schema.memberNotes)).toEqual([]);
  });
});

describe("list_tickets and set_ticket_pass", () => {
  async function says(userId: string, status: "applied" | "not_attending") {
    await h
      .db()
      .insert(schema.campParticipations)
      .values({
        userId,
        cycle: 1,
        status,
        intent: status === "applied" ? "yes" : "no",
      });
  }

  it("sets a DDT on the value seen, audited, and refuses a stale one", async () => {
    const cap = await captain();
    const other = await captain();
    const grace = await member();
    const listed = await call("list_tickets", { userId: grace.id }, cap.id);
    expect(listed.data!.members).toMatchObject([
      { userId: grace.id, ddt: "none", wap: "not_needed" },
    ]);

    const res = await call(
      "set_ticket_pass",
      { userId: grace.id, pass: "ddt", from: "none", to: "allocated" },
      cap.id,
    );
    expect(res.data).toMatchObject({ pass: "ddt", value: "allocated" });
    const audit = await auditRows("ticket.pass_changed");
    expect(audit.map((r) => [r.actorId, r.target, r.metadata])).toEqual([
      [
        cap.id,
        grace.id,
        { cycle: 1, pass: "ddt", from: "none", to: "allocated" },
      ],
    ]);

    // Another captain who still saw "none".
    const stale = await call(
      "set_ticket_pass",
      { userId: grace.id, pass: "ddt", from: "none", to: "can_transfer" },
      other.id,
    );
    expect(stale.error).toMatch(/'s DDT changed while you were looking\./);
    const [row] = await h
      .db()
      .select()
      .from(schema.campTickets)
      .where(eq(schema.campTickets.userId, grace.id));
    expect(row!.ddt).toBe("allocated");
  });

  it("records a ticket status only for someone coming, in the page's words", async () => {
    const cap = await captain();
    const away = await member();
    const coming = await member();
    await says(away.id, "not_attending");
    await says(coming.id, "applied");
    expect(
      await call(
        "set_ticket_pass",
        { userId: away.id, pass: "ticket", from: "unknown", to: "has_ticket" },
        cap.id,
      ),
    ).toEqual({
      error:
        "They have to say Coming or Maybe before a ticket can be recorded.",
    });
    const ok = await call(
      "set_ticket_pass",
      { userId: coming.id, pass: "ticket", from: "unknown", to: "has_ticket" },
      cap.id,
    );
    expect(ok.data).toMatchObject({ value: "has_ticket" });
  });

  it("refuses a value that is not the pass's, and anyone but a captain", async () => {
    const cap = await captain();
    const grace = await member();
    const kitchenLead = await lead();
    expect(
      await call(
        "set_ticket_pass",
        { userId: grace.id, pass: "wap", from: "none", to: "issued" },
        cap.id,
      ),
    ).toEqual({
      error: "That isn't a WAP value. Read them with list_tickets.",
    });
    for (const name of ["list_tickets", "set_ticket_pass"]) {
      const res = await call(
        name,
        { userId: grace.id, pass: "wap", from: "not_needed", to: "issued" },
        kitchenLead.id,
      );
      expect(res.error).toMatch(/^Only a captain can do this\./);
    }
    expect(await auditRows("ticket.pass_changed")).toEqual([]);
  });
});
