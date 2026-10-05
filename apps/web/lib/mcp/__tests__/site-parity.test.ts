// @vitest-environment node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@camp404/db/schema";
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

// Reads of someone else's safety data are recorded after the response
// (lib/audit.ts, through next/server's `after`). Collected here and run on
// demand.
const afterTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));
// My forms' Optional section reads builder questionnaires the test camp does
// not have; the list is stubbed so the tool's handling of it can be checked.
vi.mock("@/lib/forms", async (importOriginal) => ({
  ...(await importOriginal<typeof Forms>()),
  listOptionalForms: vi.fn(async () => []),
}));

import { listOptionalForms } from "@/lib/forms";
import { QUESTIONNAIRE_VERSION } from "@/lib/questionnaire";
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

describe("you: the burner profile, saved the way My forms saves it", () => {
  const FIRST_DONE = new Date("2026-03-01T10:00:00.000Z");
  const ANSWERS = {
    birthday: "1990-01-15",
    phone: "+27 82 555 0100",
    country: "ZA",
    "id.type": "sa_id",
    "bio.statement": "Builder of things",
    "competency.cooking": "follow",
    "logistics.driving": "no",
    "logistics.onsite_before": "no",
    "logistics.onsite_after": "no",
    "history.afrikaburn_count": "0",
    "intent.this_year": "want",
  };
  const ADA = {
    name: "Ada Byron",
    phone: "+27 82 555 0199",
    relationship: "sister",
  };

  /** An approved member with a finished profile, held by a newer version. */
  async function finished() {
    const member = await approved({ emergencyContacts: [ADA] });
    await h.db().insert(schema.burnerProfiles).values({
      userId: member.id,
      version: "old",
      responses: ANSWERS,
      completedAt: FIRST_DONE,
    });
    await h.db().insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Burner profile",
      version: QUESTIONNAIRE_VERSION,
    });
    return member;
  }

  async function profileOf(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.burnerProfiles)
      .where(eq(schema.burnerProfiles.userId, userId));
    return row!;
  }

  async function gateOf(userId: string) {
    const [row] = await h
      .db()
      .select()
      .from(schema.requiredActions)
      .where(eq(schema.requiredActions.userId, userId));
    return row!;
  }

  it("changes only the patched answer, keeps the first completion, logs the change and clears the gate", async () => {
    const member = await finished();
    const { data, error } = await call(
      "update_my_burner_profile",
      { responses: { "bio.statement": "Welder now" } },
      member.id,
    );
    expect(error).toBeUndefined();
    expect(data!.saved).toBe(true);

    const row = await profileOf(member.id);
    expect(row.responses).toEqual({
      ...ANSWERS,
      "bio.statement": "Welder now",
    });
    expect(row.completedAt).toEqual(FIRST_DONE);
    // The questionnaire's own version, never one the caller picks.
    expect(row.version).toBe(QUESTIONNAIRE_VERSION);
    expect((await gateOf(member.id)).status).toBe("completed");
    // The contacts on the member's row are untouched.
    const [user] = await h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, member.id));
    expect(user!.emergencyContacts).toEqual([ADA]);
    const edits = await h
      .db()
      .select()
      .from(schema.questionnaireEdits)
      .where(eq(schema.questionnaireEdits.userId, member.id));
    expect(edits).toHaveLength(1);
    expect(edits[0]!.changes).toEqual([
      expect.objectContaining({
        fieldId: "bio.statement",
        from: "Builder of things",
        to: "Welder now",
      }),
    ]);
  });

  it("refuses a patch that leaves the profile incomplete, an empty patch and an unfinished profile, writing nothing", async () => {
    const member = await finished();
    const before = await profileOf(member.id);

    const cleared = await call(
      "update_my_burner_profile",
      { responses: { "bio.statement": "" } },
      member.id,
    );
    expect(cleared.error).toMatch(/required/i);
    const empty = await call(
      "update_my_burner_profile",
      { responses: {} },
      member.id,
    );
    expect(empty.error).toMatch(/^Nothing to change/);
    const badPhone = await call(
      "update_my_burner_profile",
      { responses: { "emergency.1.phone": "12" } },
      member.id,
    );
    expect(badPhone.error).toBeDefined();
    const future = await call(
      "update_my_burner_profile",
      { responses: { birthday: "2999-01-01" } },
      member.id,
    );
    expect(future.error).toContain("Date of birth can't be in the future.");

    expect(await profileOf(member.id)).toEqual(before);
    expect((await gateOf(member.id)).status).toBe("pending");

    // A profile never finished is finished on the website, not here.
    const starter = await approved();
    await h.db().insert(schema.burnerProfiles).values({
      userId: starter.id,
      version: "old",
      responses: ANSWERS,
    });
    const unfinished = await call(
      "update_my_burner_profile",
      { responses: { "bio.statement": "Hi" } },
      starter.id,
    );
    expect(unfinished.error).toMatch(
      /^Finish your burner profile on the website first: .*\/onboarding\/questionnaire$/,
    );
    expect((await profileOf(starter.id)).completedAt).toBeNull();
  });

  it("refuses the profile photo, which is uploaded on the website", async () => {
    const member = await finished();
    const { error } = await call(
      "update_my_burner_profile",
      { responses: { "profile.image": "https://example.test/me.png" } },
      member.id,
    );
    expect(error).toMatch(/^Profile photos are uploaded on the website/);
  });

  it("keeps the answers' values out of the connector's log", async () => {
    const member = await finished();
    await call(
      "update_my_burner_profile",
      { responses: { "bio.statement": "Welder now" } },
      member.id,
    );
    const [log] = await h
      .db()
      .select()
      .from(schema.mcpAuditLog)
      .where(eq(schema.mcpAuditLog.tool, "update_my_burner_profile"));
    expect(log!.argsJson).toEqual({ fields: ["bio.statement"] });
  });
});

describe("you: emergency contacts, by the burner profile's rules", () => {
  it("refuses a phone number the website's form would refuse", async () => {
    const member = await approved();
    const { error } = await call(
      "update_my_emergency_contacts",
      { contacts: [{ name: "Ada", phone: "12", relationship: "sister" }] },
      member.id,
    );
    expect(error).toBe("Enter a valid phone number");
    const [user] = await h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, member.id));
    expect(user!.emergencyContacts).toBeNull();
  });

  it("clears the list to nothing, as the burner profile's save does", async () => {
    const member = await approved({
      emergencyContacts: [
        { name: "Ada", phone: "+27 82 555 0199", relationship: "sister" },
      ],
    });
    const { error } = await call(
      "update_my_emergency_contacts",
      { contacts: [] },
      member.id,
    );
    expect(error).toBeUndefined();
    const [user] = await h
      .db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, member.id));
    expect(user!.emergencyContacts).toBeNull();
  });
});
