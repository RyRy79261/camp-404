import { beforeEach, describe, expect, it, vi } from "vitest";

// The seed and wipe commands, with the database writers mocked: what they
// refuse, and that the seed drives the app's writers for the whole plan.

const people = { all: 0, real: 0 };

vi.mock("@camp404/db/seed-support", () => ({
  countPeople: vi.fn(async () => ({ ...people })),
  wipeAllPublicTables: vi.fn(async () => {}),
}));
vi.mock("@camp404/db/bootstrap", () => ({
  bootstrapFirstCaptain: vi.fn(async () => ({
    ok: true,
    userId: "founder-id",
  })),
}));
vi.mock("@camp404/db/cycle-rollover", () => ({
  setFoundingYear: vi.fn(async () => ({ ok: true, report: {} })),
}));
vi.mock("@camp404/db/invite-codes", () => ({
  createInviteCode: vi.fn(async () => ({})),
}));
let userSeq = 0;
vi.mock("@camp404/db/burner-profile", () => ({
  createCampUser: vi.fn(async () => ({ id: `user-${++userSeq}` })),
  setUserApproval: vi.fn(async () => true),
  setUserRank: vi.fn(async () => {}),
  upsertBurnerProfile: vi.fn(async () => {}),
}));
vi.mock("@camp404/db/activations", () => ({
  completeBuilderResponse: vi.fn(async () => {}),
  ensureRequiredAction: vi.fn(async () => {}),
  getActivationById: vi.fn(async () => ({
    id: "act-1",
    questionnaireKey: "arrival-plans",
    version: "1",
    cycle: 2026,
  })),
  satisfyRequiredAction: vi.fn(async () => true),
}));
vi.mock("@camp404/db/payments", () => ({
  recordPayment: vi.fn(async () => ({})),
}));
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  insertDefinitionDraft: vi.fn(async () => {}),
}));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  publishDefinition: vi.fn(async () => ({
    ok: true,
    version: "1",
    change: "initial",
  })),
  sendActivation: vi.fn(async () => ({
    ok: true,
    activationId: "act-1",
    created: 25,
  })),
}));
vi.mock("@camp404/db/team-memberships", () => ({
  assignTeam: vi.fn(async () => ({ created: true, cycle: 2026 })),
  setLead: vi.fn(async () => ({ ok: true, changed: true })),
}));

import { completeBuilderResponse } from "@camp404/db/activations";
import { bootstrapFirstCaptain } from "@camp404/db/bootstrap";
import {
  createCampUser,
  setUserApproval,
  setUserRank,
} from "@camp404/db/burner-profile";
import { recordPayment } from "@camp404/db/payments";
import {
  publishDefinition,
  sendActivation,
} from "@camp404/db/questionnaire-lifecycle";
import { wipeAllPublicTables } from "@camp404/db/seed-support";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import { seedScenario, wipeSeededData } from "../seed";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "postgres://u:p@db.localtest.me:5432/main");
  people.all = 0;
  people.real = 0;
  userSeq = 0;
});

describe("seedScenario", () => {
  it("refuses production, a missing database and a database with people", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(seedScenario("small-camp")).rejects.toThrow(
      "VERCEL_ENV is production",
    );
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DATABASE_URL", "");
    await expect(seedScenario("small-camp")).rejects.toThrow(
      "DATABASE_URL is not set",
    );
    vi.stubEnv("DATABASE_URL", "postgres://u:p@db.localtest.me:5432/main");
    people.all = 3;
    await expect(seedScenario("small-camp")).rejects.toThrow(
      "already has 3 people",
    );
    expect(bootstrapFirstCaptain).not.toHaveBeenCalled();
  });

  it("drives the app's writers for the whole small camp", async () => {
    const log = await seedScenario("small-camp");
    expect(log).toEqual([
      "Founder Sam Founder, camp year 2026.",
      "35 members: 24 approved, 4 pending, 2 rejected, 5 still onboarding.",
      '"Arrival plans" sent to everyone; 12 answered.',
      "10 dues payments received.",
    ]);
    expect(createCampUser).toHaveBeenCalledTimes(35);
    expect(setUserApproval).toHaveBeenCalledTimes(26);
    expect(setUserRank).toHaveBeenCalledTimes(1);
    expect(assignTeam).toHaveBeenCalledTimes(24);
    expect(setLead).toHaveBeenCalledTimes(8);
    expect(publishDefinition).toHaveBeenCalledWith(
      "arrival-plans",
      "founder-id",
    );
    expect(sendActivation).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "everyone", blocking: false }),
    );
    expect(completeBuilderResponse).toHaveBeenCalledTimes(12);
    expect(recordPayment).toHaveBeenCalledTimes(10);
  });

  it("stops when a writer refuses", async () => {
    vi.mocked(publishDefinition).mockResolvedValueOnce({
      ok: false,
      errors: ["Broken."],
      issues: [],
    });
    await expect(seedScenario("small-camp")).rejects.toThrow("Broken.");
    expect(sendActivation).not.toHaveBeenCalled();
  });
});

describe("wipeSeededData", () => {
  it("refuses a database with anyone real, and empties a seeded one", async () => {
    people.all = 40;
    people.real = 1;
    await expect(wipeSeededData()).rejects.toThrow(
      "1 people here were not seeded",
    );
    expect(wipeAllPublicTables).not.toHaveBeenCalled();
    people.real = 0;
    await expect(wipeSeededData()).resolves.toBe(
      "Emptied 40 seeded people and everything they made.",
    );
    expect(wipeAllPublicTables).toHaveBeenCalledTimes(1);
  });
});
