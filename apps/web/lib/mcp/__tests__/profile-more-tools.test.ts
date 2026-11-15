// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import { makeUser } from "../../../../../packages/db/src/__tests__/_factories";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerProfileMoreTools } from "../tools/profile-more";

// The rest of the person's own profile over the connector (tools/
// profile-more.ts), against real Postgres (PGlite) through the real handlers:
// always the caller's own row, the Profile actions' limits and sentences, and
// never the photo.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerProfileMoreTools({
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

const member = () =>
  makeUser(h.db(), {
    approvalStatus: "approved",
    profileImageUrl: "https://blob.example/me.png",
  });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });

async function userRow(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id));
  return row!;
}

/** The member's answer this year (cycle 1: the camp has not named a year). */
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

describe("set_my_display_name", () => {
  it("changes the caller's own name and leaves the photo alone", async () => {
    const me = await member();
    const res = await call(
      "set_my_display_name",
      { displayName: "  Dee  " },
      me.id,
    );
    expect(res.data).toMatchObject({ displayName: "Dee" });
    const row = await userRow(me.id);
    expect(row.displayName).toBe("Dee");
    expect(row.profileImageUrl).toBe("https://blob.example/me.png");
  });

  it("refuses an empty or over-long name in the page's words", async () => {
    const me = await member();
    expect(
      await call("set_my_display_name", { displayName: " " }, me.id),
    ).toEqual({ error: "Display name can't be empty." });
    expect(
      await call("set_my_display_name", { displayName: "x".repeat(81) }, me.id),
    ).toEqual({ error: "Display name must be 80 characters or fewer." });
    expect((await userRow(me.id)).displayName).toBe(me.displayName);
  });
});

describe("update_my_camp_blurb", () => {
  it("keeps what is left out, and stores join off for a member", async () => {
    const me = await member();
    await call(
      "update_my_camp_blurb",
      { title: "Fire lead", blurb: "I light things." },
      me.id,
    );
    await call("update_my_camp_blurb", { blurb: "I light lamps." }, me.id);
    const row = await userRow(me.id);
    expect(row.campTitle).toBe("Fire lead");
    expect(row.campBlurb).toBe("I light lamps.");
    expect(row.showOnJoin).toBe(false);
    expect(
      await call("update_my_camp_blurb", { showOnJoin: true }, me.id),
    ).toEqual({
      error: "Only a captain's card is shown on join.camp-404.com.",
    });
  });

  it("lets a captain show their card, and keeps it shown on a later edit", async () => {
    const cap = await captain();
    await call(
      "update_my_camp_blurb",
      { title: "Captain", showOnJoin: true },
      cap.id,
    );
    await call("update_my_camp_blurb", { blurb: "Hi" }, cap.id);
    const row = await userRow(cap.id);
    expect(row.showOnJoin).toBe(true);
    expect(row.campBlurb).toBe("Hi");
  });

  it("refuses a title over its limit", async () => {
    const me = await member();
    expect(
      await call("update_my_camp_blurb", { title: "x".repeat(61) }, me.id),
    ).toEqual({ error: "Keep your title to 60 characters." });
  });
});

describe("set_my_ticket_status", () => {
  async function ticketOf(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.campTickets)
      .where(
        and(
          eq(schema.campTickets.userId, userId),
          eq(schema.campTickets.cycle, 1),
        ),
      );
    return row ?? null;
  }

  it("sets the caller's own ticket once they said they're coming", async () => {
    const me = await member();
    await says(me.id, "applied");
    const res = await call(
      "set_my_ticket_status",
      { ticketStatus: "has_ticket" },
      me.id,
    );
    expect(res.data).toMatchObject({ ticketStatus: "has_ticket" });
    expect((await ticketOf(me.id))?.ticketStatus).toBe("has_ticket");
    const read = await call("get_my_profile", {}, me.id);
    expect(read.data!.ticket).toMatchObject({
      ticketStatus: "has_ticket",
      mayRecord: true,
    });
  });

  it("refuses before an answer and after Not coming, in the page's words", async () => {
    const quiet = await member();
    const away = await member();
    await says(away.id, "not_attending");
    for (const who of [quiet, away]) {
      expect(
        await call(
          "set_my_ticket_status",
          { ticketStatus: "buying_own" },
          who.id,
        ),
      ).toEqual({
        error: "Say you're coming this year first, then add your ticket.",
      });
      expect(await ticketOf(who.id)).toBeNull();
    }
  });
});

describe("set_my_telegram_notices", () => {
  it("sets the caller's own choice", async () => {
    const me = await member();
    const res = await call(
      "set_my_telegram_notices",
      { notices: "all" },
      me.id,
    );
    expect(res.data).toMatchObject({ notices: "all", connected: false });
    expect((await userRow(me.id)).telegramNotices).toBe("all");
    const read = await call("get_my_profile", {}, me.id);
    expect(read.data!.telegram).toMatchObject({ notices: "all" });
  });
});
