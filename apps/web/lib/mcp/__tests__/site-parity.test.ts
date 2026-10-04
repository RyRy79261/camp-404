// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
import type * as Audit from "@camp404/db/audit";
import type * as Forms from "@/lib/forms";
import { encrypt } from "@camp404/db/crypto";
import { getMenuDietaryFor } from "@camp404/db/dietary";
import {
  ALREADY_SEATED,
  IS_DRIVING,
  NOT_YOUR_CAR,
  SEATS_BELOW_RIDERS,
} from "@camp404/db/transport";
import { useTestDb } from "../../../../../packages/db/src/__tests__/_harness";
import {
  makeDriverProfile,
  makeMembership,
  makeUser,
} from "../../../../../packages/db/src/__tests__/_factories";

// The Claude connector against real Postgres (PGlite), checked against what
// the website does (owner, 2026-10-04: "the SAME access as the signed-in
// person … the SAME WAY the website does"). Each case calls the real tool
// handler as a signed-in person and reads the database afterwards.

process.env.PGCRYPTO_KEY = "test-pgcrypto-key-at-least-16-chars";

// Reads of someone else's private data are recorded after the response
// (lib/audit.ts, through next/server's `after`). Collected here, so a test can
// tell a row written BEFORE the answer from one written after it.
const afterTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));
// The audit write is real, with a switch to make it fail.
const auditFails = vi.hoisted(() => ({ on: false }));
vi.mock("@camp404/db/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof Audit>();
  return {
    ...actual,
    appendAuditEvent: async (event: Audit.AuditEvent) => {
      if (auditFails.on) throw new Error("audit store down");
      return actual.appendAuditEvent(event);
    },
  };
});

// My forms' Optional section reads builder questionnaires the test camp does
// not have; the list is stubbed so the tool's handling of it can be checked.
vi.mock("@/lib/forms", async (importOriginal) => ({
  ...(await importOriginal<typeof Forms>()),
  listOptionalForms: vi.fn(async () => []),
}));

import { listOptionalForms } from "@/lib/forms";
import { registerCampMcpTools } from "../server";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerCampMcpTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    authInfo: { clientId: "test", extra: { campUserId: as } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError
    ? { error: text }
    : {
        data: JSON.parse(text) as Record<string, unknown> & {
          rows?: unknown[];
        },
      };
}

async function flushAfter() {
  for (const task of afterTasks.splice(0)) await task();
}

const h = useTestDb();

beforeEach(() => {
  afterTasks.length = 0;
  auditFails.on = false;
});

const approved = (overrides: Partial<typeof schema.users.$inferInsert> = {}) =>
  makeUser(h.db(), { approvalStatus: "approved", ...overrides });

async function auditRows(action: string) {
  return h
    .db()
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

describe("people: the roster's rows and columns", () => {
  it("hides a declined sign-up from a member and a lead, never from a captain", async () => {
    const member = await approved();
    const lead = await approved();
    await makeMembership(h.db(), {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const captain = await approved({ rank: "captain" });
    const declined = await makeUser(h.db(), {
      displayName: "Declined Dee",
      approvalStatus: "rejected",
    });
    const pending = await makeUser(h.db(), {
      displayName: "Pending Pam",
      approvalStatus: "pending",
    });

    for (const viewer of [member, lead]) {
      const { data } = await call("list_users", {}, viewer.id);
      const ids = (data!.rows as { id: string }[]).map((r) => r.id);
      expect(ids).not.toContain(declined.id);
      // Applicants stay on the roster (owner, 2026-09-22).
      expect(ids).toContain(pending.id);
      expect(
        await call("get_user", { userId: declined.id }, viewer.id),
      ).toEqual({ error: "No user with that id." });
    }
    const { data } = await call("list_users", {}, captain.id);
    expect((data!.rows as { id: string }[]).map((r) => r.id)).toContain(
      declined.id,
    );
    expect(
      (await call("get_user", { userId: declined.id }, captain.id)).data,
    ).toMatchObject({ id: declined.id, approvalStatus: "rejected" });
  });

  it("lists no ID or bank numbers and no safety data, even for a captain with consent", async () => {
    const captain = await approved({ rank: "captain" });
    await approved({
      displayName: "Grace",
      aiDataConsent: true,
      passportEncrypted: encrypt("P1234567"),
      eftDetailsEncrypted: encrypt("FNB 123"),
      emergencyContacts: [
        { name: "Ada", phone: "+27 82 555 0000", relationship: "sister" },
      ],
    });
    const { data } = await call("list_users", {}, captain.id);
    const text = JSON.stringify(data);
    expect(text).not.toContain("P1234567");
    expect(text).not.toContain("FNB 123");
    expect(text).not.toContain("+27 82 555 0000");
    await flushAfter();
    expect(await h.db().select().from(schema.auditLog)).toEqual([]);
  });

  it("gives a team lead someone's emergency contacts on a one-person read, recorded as a lead's", async () => {
    const lead = await approved();
    await makeMembership(h.db(), {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await approved();
    const subject = await approved({
      emergencyContacts: [
        { name: "Ada", phone: "+27 82 555 0000", relationship: "sister" },
      ],
    });

    const asLead = await call("get_user", { userId: subject.id }, lead.id);
    expect(asLead.data!.emergencyContacts).toEqual([
      expect.objectContaining({ name: "Ada" }),
    ]);
    await flushAfter();
    expect(await auditRows("safety.emergency_contacts.view")).toEqual([
      expect.objectContaining({
        actorId: lead.id,
        target: subject.id,
        metadata: { basis: "team_lead", via: "mcp" },
      }),
    ]);

    const asMember = await call("get_user", { userId: subject.id }, member.id);
    expect(asMember.data).not.toHaveProperty("emergencyContacts");
  });
});

describe("people: one member's ID number", () => {
  async function setUp(consent = true) {
    const captain = await approved({ rank: "captain" });
    const subject = await approved({
      aiDataConsent: consent,
      saIdEncrypted: encrypt("9001015009087"),
    });
    return { captain, subject };
  }

  it("records the read BEFORE it answers, then gives the number", async () => {
    const { captain, subject } = await setUp();
    const result = await call(
      "get_member_id_number",
      { userId: subject.id },
      captain.id,
    );
    expect(result.data).toEqual({ idType: "sa_id", idNumber: "9001015009087" });
    // Nothing flushed: the row is already there.
    expect(await auditRows("member.id_document.viewed")).toEqual([
      expect.objectContaining({
        actorId: captain.id,
        target: subject.id,
        metadata: { basis: "captain", via: "mcp", idType: "sa_id" },
      }),
    ]);
  });

  it("shows nothing when the read can't be recorded", async () => {
    const { captain, subject } = await setUp();
    auditFails.on = true;
    const result = await call(
      "get_member_id_number",
      { userId: subject.id },
      captain.id,
    );
    expect(result.error).toMatch(/couldn't be recorded/);
    expect(JSON.stringify(result)).not.toContain("9001015009087");
  });

  it("is a captain's only, and only with the member's consent", async () => {
    const { captain, subject } = await setUp(false);
    const lead = await approved();
    await makeMembership(h.db(), {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    expect(
      await call("get_member_id_number", { userId: subject.id }, lead.id),
    ).toEqual({ error: "Only a captain can do this." });
    const refused = await call(
      "get_member_id_number",
      { userId: subject.id },
      captain.id,
    );
    expect(refused.error).toMatch(/hasn't allowed/);
    expect(refused.error).toMatch(/\/captains\/camp-management$/);
    expect(await auditRows("member.id_document.viewed")).toEqual([]);
  });
});

describe("dietary: the pick-list the Kitchen's check reads", () => {
  it("counts an allergy saved through Claude on the meal plan", async () => {
    const captain = await approved({ rank: "captain" });
    const thandi = await approved();
    await h.db().insert(schema.campParticipations).values({
      userId: thandi.id,
      cycle: 1,
      status: "accepted",
      intent: "yes",
    });

    const saved = await call(
      "update_my_dietary_requirements",
      {
        foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
        diets: ["vegan"],
      },
      thandi.id,
    );
    expect(saved.data).toMatchObject({
      foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
      diets: ["vegan"],
    });
    expect(await getMenuDietaryFor(captain.id)).toMatchObject({
      counts: {
        members: 1,
        allergies: [
          expect.objectContaining({
            food: "peanuts",
            count: 1,
            anaphylactic: 1,
          }),
        ],
      },
    });
    // The read tool returns the same shape.
    expect(
      (await call("get_my_dietary_requirements", {}, thandi.id)).data,
    ).toMatchObject({ foods: [{ food: "peanuts", reaction: "anaphylaxis" }] });
    // Health data stays out of the connector's own log.
    const [log] = await h
      .db()
      .select()
      .from(schema.mcpAuditLog)
      .where(eq(schema.mcpAuditLog.tool, "update_my_dietary_requirements"));
    expect(JSON.stringify(log!.argsJson)).not.toContain("peanuts");
  });

  it("refuses a food that isn't on the pick-list", async () => {
    const member = await approved();
    const result = await call(
      "update_my_dietary_requirements",
      { foods: [{ food: "peanut-ish", reaction: "allergy" }], diets: [] },
      member.id,
    );
    expect(result.error).toBeDefined();
  });
});

describe("transport: the Transport page's seat rules", () => {
  async function car(seats = 3) {
    const driver = await approved({ displayName: "Ada" });
    await makeDriverProfile(h.db(), { userId: driver.id });
    await h
      .db()
      .update(schema.driverProfiles)
      .set({ seatsOffered: seats })
      .where(eq(schema.driverProfiles.userId, driver.id));
    return driver;
  }

  it("refuses a second seat and a driver as a rider, in the page's words", async () => {
    const ada = await car();
    const cai = await car();
    const rider = await approved();
    expect(
      (await call("add_car_rider", { memberUserId: rider.id }, ada.id)).data,
    ).toMatchObject({ driverUserId: ada.id, seatsTaken: 1 });
    expect(
      await call("add_car_rider", { memberUserId: rider.id }, cai.id),
    ).toEqual({ error: ALREADY_SEATED });
    expect(
      await call("add_car_rider", { memberUserId: cai.id }, ada.id),
    ).toEqual({ error: IS_DRIVING });
  });

  it("lets a Transport & Logistics lead fill any car, and refuses a plain member", async () => {
    const ada = await car();
    const rider = await approved();
    const tran = await approved();
    await makeMembership(h.db(), {
      userId: tran.id,
      team: "transport_and_logistics",
      isLead: true,
    });
    const member = await approved();
    expect(
      await call(
        "add_car_rider",
        { memberUserId: rider.id, driverUserId: ada.id },
        member.id,
      ),
    ).toEqual({ error: NOT_YOUR_CAR });
    expect(
      (
        await call(
          "add_car_rider",
          { memberUserId: rider.id, driverUserId: ada.id },
          tran.id,
        )
      ).data,
    ).toMatchObject({ seatsTaken: 1 });
  });

  it("lets a rider see their car and leave it", async () => {
    const ada = await car();
    const rider = await approved();
    await call("add_car_rider", { memberUserId: rider.id }, ada.id);
    expect((await call("get_my_lift", {}, rider.id)).data).toMatchObject({
      role: "rider",
      driverName: "Ada",
    });
    expect((await call("list_car_riders", {}, rider.id)).data).toMatchObject({
      driverUserId: ada.id,
      riders: [{ userId: rider.id }],
    });
    expect((await call("remove_car_rider", {}, rider.id)).data).toMatchObject({
      driverUserId: ada.id,
      seatsTaken: 0,
    });
    expect((await call("get_my_lift", {}, rider.id)).data).toBeNull();
  });

  it("shows every member the cars, as the Transport page does", async () => {
    const ada = await car();
    const member = await approved();
    const { data } = await call("list_drivers", {}, member.id);
    expect(data!.rows).toEqual([
      expect.objectContaining({ driverUserId: ada.id, driverName: "Ada" }),
    ]);
    expect(JSON.stringify(data)).not.toContain("vehicleRegistration");
  });

  it("never lets a driver offer fewer seats than riders already in", async () => {
    const ada = await car(2);
    for (const rider of [await approved(), await approved()]) {
      await call("add_car_rider", { memberUserId: rider.id }, ada.id);
    }
    const profile = {
      version: "1",
      intendsToDrive: true,
      canOfferLifts: true,
      offroadExperienced: false,
      canTow: false,
    };
    expect(
      await call(
        "update_my_driver_profile",
        { ...profile, seatsOffered: 1 },
        ada.id,
      ),
    ).toEqual({ error: SEATS_BELOW_RIDERS });
    expect(
      (
        await call(
          "update_my_driver_profile",
          { ...profile, seatsOffered: 2 },
          ada.id,
        )
      ).data,
    ).toMatchObject({ seatsOffered: 2 });
  });
});

describe("what_can_i_do", () => {
  it("answers from the person's real rung", async () => {
    const member = await approved();
    const lead = await approved();
    await makeMembership(h.db(), {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const captain = await approved({ rank: "captain" });

    const asMember = (await call("what_can_i_do", {}, member.id)).data!;
    const asLead = (await call("what_can_i_do", {}, lead.id)).data!;
    const asCaptain = (await call("what_can_i_do", {}, captain.id)).data!;
    expect(asMember.you).toMatchObject({ rank: "camp_member", leadsTeams: [] });
    expect(asLead.you).toMatchObject({
      rank: "team_lead",
      leadsTeams: [expect.objectContaining({ key: "kitchen" })],
    });
    expect(asCaptain.you).toMatchObject({ rank: "captain" });
    const names = (d: typeof asMember) =>
      (d.areas as { tools: { name: string }[] }[]).flatMap((a) =>
        a.tools.map((t) => t.name),
      );
    expect(names(asMember)).not.toContain("create_document");
    expect(names(asLead)).toContain("create_document");
    expect(names(asCaptain)).toContain("list_audit_log");
  });
});

describe("you: required actions and your own history", () => {
  it("lists optional questionnaires beside the required ones, marked optional", async () => {
    const member = await approved();
    await h.db().insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Burner profile",
    });
    vi.mocked(listOptionalForms).mockResolvedValueOnce([
      {
        activationId: "00000000-0000-4000-8000-0000000000f1",
        title: "Theme ideas",
        description: "Open to every camp member.",
        started: false,
      },
    ]);
    const { data } = await call("list_my_required_actions", {}, member.id);
    expect(listOptionalForms).toHaveBeenCalledWith(member.id);
    expect(data!.count).toBe(1);
    expect(data!.optional).toEqual([
      expect.objectContaining({
        optional: true,
        title: "Theme ideas",
        url: expect.stringMatching(
          /\/questionnaires\/00000000-0000-4000-8000-0000000000f1$/,
        ),
      }),
    ]);
  });

  it("keeps skills and burn counts out of the connector's log", async () => {
    const member = await approved();
    await call(
      "update_my_history",
      { skills: ["arc welding"], previousAfrikaburns: 7 },
      member.id,
    );
    const [log] = await h
      .db()
      .select()
      .from(schema.mcpAuditLog)
      .where(eq(schema.mcpAuditLog.tool, "update_my_history"));
    expect(log!.argsJson).toEqual({
      fields: ["skills", "previousAfrikaburns"],
    });
  });
});
