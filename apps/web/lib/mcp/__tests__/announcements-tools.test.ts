// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import { DRAFT_NOT_YOURS, DRAFT_PUBLISHED } from "@camp404/db/broadcasts";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";
import {
  NOT_YOUR_PIN,
  NOT_YOUR_TEAM,
} from "@/app/(console)/captains/announcements/audience-copy";

vi.mock("next/server", () => ({ after: () => undefined }));

import { registerAnnouncementsTools } from "../tools/announcements";

// Announcement drafts and pins over the connector (tools/announcements.ts),
// against real Postgres (PGlite) through the real handlers: the page's gate
// (a captain, or a lead to a team they lead), drafts as their author's own,
// nothing sent, and a pin's compare-and-set and audit row.

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerAnnouncementsTools({
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

const member = () => makeUser(h.db(), { approvalStatus: "approved" });
const captain = () =>
  makeUser(h.db(), { approvalStatus: "approved", rank: "captain" });
async function kitchenLead() {
  const user = await member();
  await makeMembership(h.db(), {
    userId: user.id,
    team: "kitchen",
    isLead: true,
  });
  return user;
}

async function broadcast(id: string) {
  const [row] = await h
    .db()
    .select()
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.id, id));
  return row!;
}

describe("save_announcement_draft and update_announcement_draft", () => {
  it("saves a draft, changes only what is given, and sends nothing", async () => {
    const cap = await captain();
    const saved = await call(
      "save_announcement_draft",
      { title: "Gate times", body: "Gates open at 9." },
      cap.id,
    );
    const id = saved.data!.id as string;
    expect(saved.data).toMatchObject({
      presentation: "acknowledge",
      audienceLabel: "Everyone in camp",
    });
    // Its "Also post in Telegram" mark is kept across an edit.
    await h
      .db()
      .update(schema.broadcasts)
      .set({ telegramOnPublish: true, pinOnPublish: true })
      .where(eq(schema.broadcasts.id, id));
    await call(
      "update_announcement_draft",
      { id, body: "Gates open at 10." },
      cap.id,
    );
    const row = await broadcast(id);
    expect(row).toMatchObject({
      title: "Gate times",
      body: "Gates open at 10.",
      publishedAt: null,
      telegramOnPublish: true,
      pinOnPublish: true,
    });
    expect(await h.db().select().from(schema.notificationDeliveries)).toEqual(
      [],
    );
  });

  it("lets a lead write only to a team they lead", async () => {
    const lead = await kitchenLead();
    expect(
      await call(
        "save_announcement_draft",
        { title: "Hi", body: "All", audience: { scope: "everyone" } },
        lead.id,
      ),
    ).toEqual({ error: NOT_YOUR_TEAM });
    const ok = await call(
      "save_announcement_draft",
      {
        title: "Hi",
        body: "Cooks",
        audience: { scope: "team", team: "kitchen" },
      },
      lead.id,
    );
    expect(ok.data).toMatchObject({
      audience: { scope: "team", team: "kitchen" },
    });
    expect(
      await call(
        "update_announcement_draft",
        { id: ok.data!.id, audience: { scope: "team", team: "structures" } },
        lead.id,
      ),
    ).toEqual({ error: NOT_YOUR_TEAM });
  });

  it("refuses someone else's draft and a published one, in the page's words", async () => {
    const cap = await captain();
    const other = await captain();
    const saved = await call(
      "save_announcement_draft",
      { title: "Mine", body: "Words" },
      cap.id,
    );
    const id = saved.data!.id as string;
    expect(
      await call(
        "update_announcement_draft",
        { id, title: "Theirs" },
        other.id,
      ),
    ).toEqual({ error: DRAFT_NOT_YOURS });
    await h
      .db()
      .update(schema.broadcasts)
      .set({ publishedAt: new Date() })
      .where(eq(schema.broadcasts.id, id));
    expect(
      await call("update_announcement_draft", { id, title: "Late" }, cap.id),
    ).toEqual({ error: DRAFT_PUBLISHED });
    expect((await broadcast(id)).title).toBe("Mine");
  });

  it("refuses a plain member at the gate", async () => {
    const plain = await member();
    const res = await call(
      "save_announcement_draft",
      { title: "Hi", body: "x" },
      plain.id,
    );
    expect(res.error).toMatch(/^Only a team lead or a captain can do this\./);
  });
});

describe("set_announcement_pinned", () => {
  it("pins a published announcement once, audited, and unpins it", async () => {
    const cap = await captain();
    const saved = await call(
      "save_announcement_draft",
      { title: "Rules", body: "Read them." },
      cap.id,
    );
    const id = saved.data!.id as string;
    expect(
      await call("set_announcement_pinned", { id, pinned: true }, cap.id),
    ).toMatchObject({ error: expect.stringMatching(/publish/i) });
    await h
      .db()
      .update(schema.broadcasts)
      .set({ publishedAt: new Date() })
      .where(eq(schema.broadcasts.id, id));

    const pinned = await call(
      "set_announcement_pinned",
      { id, pinned: true },
      cap.id,
    );
    expect(pinned.data).toMatchObject({ pinned: true });
    expect((await broadcast(id)).pinnedBy).toBe(cap.id);
    // The compare-and-set: a second pin finds it pinned already.
    const again = await call(
      "set_announcement_pinned",
      { id, pinned: true },
      cap.id,
    );
    expect(again.error).toMatch(/already pinned/);
    await call("set_announcement_pinned", { id, pinned: false }, cap.id);
    expect((await broadcast(id)).pinnedAt).toBeNull();
    const audit = await h
      .db()
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog);
    expect(audit.map((r) => r.action).sort()).toEqual([
      "announcement.pinned",
      "announcement.unpinned",
    ]);
  });

  it("refuses a lead's pin on a camp-wide announcement", async () => {
    const cap = await captain();
    const lead = await kitchenLead();
    const saved = await call(
      "save_announcement_draft",
      { title: "Rules", body: "Read them." },
      cap.id,
    );
    const id = saved.data!.id as string;
    await h
      .db()
      .update(schema.broadcasts)
      .set({ publishedAt: new Date() })
      .where(eq(schema.broadcasts.id, id));
    expect(
      await call("set_announcement_pinned", { id, pinned: true }, lead.id),
    ).toEqual({ error: NOT_YOUR_PIN });
    expect((await broadcast(id)).pinnedAt).toBeNull();
  });
});

describe("list_announcements", () => {
  it("lists everyone's for a captain and only a lead's own for a lead", async () => {
    const cap = await captain();
    const lead = await kitchenLead();
    await call("save_announcement_draft", { title: "Camp", body: "x" }, cap.id);
    await call(
      "save_announcement_draft",
      {
        title: "Cooks",
        body: "x",
        audience: { scope: "team", team: "kitchen" },
      },
      lead.id,
    );
    const all = await call("list_announcements", {}, cap.id);
    const own = await call("list_announcements", {}, lead.id);
    const titles = (r: typeof all) =>
      (r.data!.announcements as { title: string }[]).map((a) => a.title).sort();
    expect(titles(all)).toEqual(["Camp", "Cooks"]);
    expect(titles(own)).toEqual(["Cooks"]);
  });
});
