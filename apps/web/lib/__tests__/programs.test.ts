import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS, setTeamArchived } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import type { ProgramId } from "../program-routes";
import {
  buildProgramManifest,
  manifestProgramIds,
  type ClientFolder,
  type ClientProgram,
  type ClientTeamFolder,
  type HealthFlag,
  type ManifestTray,
  type ProgramFacts,
  type ProgramManifest,
  type RegistryEntry,
} from "../programs";

// The program manifest, one fixture per profile (the design doc's personas).
// Every team key and rank comes from the enums the code uses (`Team`,
// `ViewerRank`), never a string literal, so a fixture cannot sit outside the
// vocabulary and pass for the wrong reason (AGENTS.md, "Verification").

const KITCHEN = Team.enum.kitchen;
const POWER = Team.enum.power_and_lighting;
const FINANCE = Team.enum.finance;
const COMMS = Team.enum.communications_and_hr;
const STRUCTURES = Team.enum.structures;
const SOUND = Team.enum.sound;

const MEMBER = ViewerRank.enum.camp_member;
const LEAD = ViewerRank.enum.team_lead;
const CAPTAIN = ViewerRank.enum.captain;

/** The camp's teams as a fresh camp seeds them. */
const TEAMS = DEFAULT_TEAMS;

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: MEMBER,
    memberships: [],
    teams: TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

/**
 * A program id, checked against `ProgramId`: `not.toContain` accepts any
 * string, so a misspelled or renamed id would pass for the wrong reason.
 */
const pid = (id: ProgramId): ProgramId => id;

const ids = (m: ProgramManifest) => [...manifestProgramIds(m)];
const folder = (m: ProgramManifest, id: string) =>
  m.folders.find((f) => f.id === id);
const teamFolder = (m: ProgramManifest, team: string) =>
  m.teamFolders.find((f) => f.team === team);

/** Every key anywhere in the manifest, however deep. */
function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, into));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      allKeys(v, into);
    }
  }
  return into;
}

describe("buildProgramManifest: version", () => {
  it("does not change with live counts (inbox, badges, health warnings)", () => {
    const quiet = buildProgramManifest(facts());
    const busy = buildProgramManifest(facts({ inbox: 7, healthWarnings: 2 }));
    expect(busy.version).toBe(quiet.version);
    const captain = buildProgramManifest(facts({ rank: CAPTAIN }));
    const captainBusy = buildProgramManifest(
      facts({ rank: CAPTAIN, inbox: 3, healthWarnings: 4 }),
    );
    expect(captainBusy.version).toBe(captain.version);
  });

  it("changes when what the member may open changes", () => {
    const lead = buildProgramManifest(
      facts({ rank: LEAD, memberships: [{ team: KITCHEN, isLead: true }] }),
    );
    const demoted = buildProgramManifest(
      facts({ memberships: [{ team: KITCHEN, isLead: false }] }),
    );
    expect(demoted.version).not.toBe(lead.version);
  });
});

describe("buildProgramManifest: the personas", () => {
  it("gives a pending applicant only the Inbox, Today and the balloon", () => {
    const m = buildProgramManifest(
      facts({ mode: "restricted", approved: false, inbox: 2 }),
    );
    expect(ids(m)).toEqual(["inbox"]);
    expect(m.folders).toEqual([]);
    expect(m.teamFolders).toEqual([]);
    // Nobody sees a pin before they are through the door, and the health
    // flag is for accepted members.
    expect(m.pins).toBe(false);
    expect(m.tray.health).toBeNull();
    expect(m.tray).toMatchObject({
      inbox: { count: 2 },
      today: true,
      balloon: "application_submitted",
    });
    expect(m.allowedChildren.sort()).toEqual(["announcement", "questionnaire"]);
  });

  it("gives a plain member the member programs and no Captains folder", () => {
    const m = buildProgramManifest(
      facts({ memberships: [{ team: STRUCTURES, isLead: false }] }),
    );
    expect(m.desktop).toEqual([
      { kind: "program", id: "inbox" },
      { kind: "program", id: "my-forms" },
      { kind: "program", id: "account" },
      { kind: "program", id: "invites" },
      { kind: "program", id: "tasks" },
      { kind: "program", id: "calendar" },
      { kind: "program", id: "roster" },
      { kind: "program", id: "meetings" },
      { kind: "program", id: "family-tree" },
      { kind: "program", id: "power" },
      { kind: "folder", id: "teams" },
      { kind: "folder", id: "kitchen" },
    ]);
    expect(folder(m, "captains")).toBeUndefined();
    expect(folder(m, "kitchen")?.programs.map((p) => p.id)).toEqual([
      "recipes",
      "meal-plan",
    ]);
    expect(m.pins).toBe(true);
    expect(m.allowedChildren).not.toContain(pid("results"));
    expect(m.allowedChildren).not.toContain(pid("edit-recipe"));
  });

  it("gives a plain member a coarse health flag with no detail in it", () => {
    const m = buildProgramManifest(facts({ healthWarnings: 3 }));
    expect(m.tray.health).toEqual({ status: "warning" });
    expect(Object.keys(m.tray.health!)).toEqual(["status"]);
    expect(buildProgramManifest(facts()).tray.health).toEqual({
      status: "ok",
    });
  });

  it("gives a captain the health details and the link to System status", () => {
    const m = buildProgramManifest(facts({ rank: CAPTAIN, healthWarnings: 2 }));
    expect(m.tray.health).toEqual({
      status: "warning",
      warnings: 2,
      href: "/captains/system",
    });
  });

  it("gives a Kitchen lead Recipe review and the lead programs, and no captain ones", () => {
    const m = buildProgramManifest(
      facts({ rank: LEAD, memberships: [{ team: KITCHEN, isLead: true }] }),
    );
    expect(folder(m, "kitchen")?.programs.map((p) => p.id)).toEqual([
      "recipes",
      "meal-plan",
      "recipe-review",
    ]);
    expect(folder(m, "captains")?.programs.map((p) => p.id)).toEqual([
      "questionnaires",
      "announcements",
      "new-event",
    ]);
    expect(m.allowedChildren).toContain("edit-recipe");
    expect(m.allowedChildren).toContain("send-questionnaire");
    expect(m.allowedChildren).not.toContain(pid("results"));
  });

  it("gives a Power lead no Recipe review, but the lead programs", () => {
    const m = buildProgramManifest(
      facts({ rank: LEAD, memberships: [{ team: POWER, isLead: true }] }),
    );
    expect(ids(m)).not.toContain(pid("recipe-review"));
    expect(m.allowedChildren).not.toContain(pid("edit-recipe"));
    expect(ids(m)).toContain("announcements");
    expect(teamFolder(m, POWER)?.programs.map((p) => p.id)).toEqual([
      `team:${POWER}`,
      "power",
    ]);
  });

  it("keeps the lead programs for a lead whose only led team is archived", () => {
    const archived = setTeamArchived({ teams: TEAMS }, SOUND, true).teams;
    const m = buildProgramManifest(
      facts({
        rank: LEAD,
        memberships: [{ team: SOUND, isLead: true }],
        teams: archived,
      }),
    );
    expect(folder(m, "captains")?.programs.map((p) => p.id)).toEqual([
      "questionnaires",
      "announcements",
      "new-event",
    ]);
    // Not in the Teams folder (active teams only), but still their team: the
    // team page opens for an archived team the config names.
    expect(ids(m)).not.toContain(`team:${SOUND}`);
    expect(teamFolder(m, SOUND)).toMatchObject({
      lead: true,
      programs: [{ id: `team:${SOUND}`, href: `/teams/${SOUND}` }],
    });
  });

  it("gives a captain every program, and captain-only children", () => {
    const m = buildProgramManifest(facts({ rank: CAPTAIN }));
    expect(folder(m, "captains")?.programs.map((p) => p.id)).toEqual([
      "questionnaires",
      "announcements",
      "new-event",
      "overview",
      "payments",
      "camp-settings",
      "join-site",
      "audit",
      "system",
    ]);
    expect(ids(m)).toContain("recipe-review");
    expect(m.allowedChildren).toEqual(
      expect.arrayContaining(["results", "respondent-answers", "new-meeting"]),
    );
  });

  it("gives My lift only to a member with a car or a seat", () => {
    expect(ids(buildProgramManifest(facts()))).not.toContain(pid("my-lift"));
    const m = buildProgramManifest(facts({ hasLift: true }));
    expect(m.programs.find((p) => p.id === "my-lift")).toMatchObject({
      label: "My lift",
      href: "/lift",
      group: "me",
    });
  });

  it("offers New meeting only to someone it would not lock out", () => {
    expect(buildProgramManifest(facts()).allowedChildren).not.toContain(
      pid("new-meeting"),
    );
    expect(
      buildProgramManifest(
        facts({ memberships: [{ team: STRUCTURES, isLead: false }] }),
      ).allowedChildren,
    ).toContain("new-meeting");
  });

  it("offers no New meeting to a member whose only team this year is archived", () => {
    // The page lists only ACTIVE teams, so it would show them a lock.
    const archived = setTeamArchived({ teams: TEAMS }, STRUCTURES, true).teams;
    expect(
      buildProgramManifest(
        facts({
          memberships: [{ team: STRUCTURES, isLead: false }],
          teams: archived,
        }),
      ).allowedChildren,
    ).not.toContain(pid("new-meeting"));
    // A captain still writes for the whole camp.
    expect(
      buildProgramManifest(facts({ rank: CAPTAIN, teams: archived }))
        .allowedChildren,
    ).toContain("new-meeting");
  });

  it("empties the lead programs after a year rollover, until captains reassign", () => {
    // Last year's lead has no memberships and no lead flag in the new year.
    const m = buildProgramManifest(facts({ rank: MEMBER, memberships: [] }));
    expect(folder(m, "captains")).toBeUndefined();
    expect(m.teamFolders).toEqual([]);
  });
});

describe("buildProgramManifest: held by a blocking questionnaire", () => {
  it("draws their icons with no badges, counts, pins, health or Today", () => {
    const m = buildProgramManifest(
      facts({
        mode: "held",
        rank: CAPTAIN,
        inbox: 4,
        healthWarnings: 2,
        memberships: [{ team: KITCHEN, isLead: true }],
      }),
    );
    expect(ids(m)).toContain("inbox");
    expect(m.teamFolders.map((f) => f.team)).toEqual([KITCHEN]);
    expect(allKeys(m).has("badge")).toBe(false);
    expect(m.pins).toBe(false);
    expect(m.tray).toEqual({
      inbox: null,
      health: null,
      today: false,
      balloon: null,
    });
    expect(m.taskbarPins).toEqual([]);
    expect(m.startMenu).toEqual([]);
    expect(m.allowedChildren).toEqual(["questionnaire"]);
  });

  it("gives a member held before approval the wallpaper only", () => {
    const m = buildProgramManifest(
      facts({ mode: "held", approved: false, inbox: 1 }),
    );
    expect(m.desktop).toEqual([]);
    expect(m.programs).toEqual([]);
    expect(m.folders).toEqual([]);
    expect(m.teamFolders).toEqual([]);
    expect(m.allowedChildren).toEqual(["questionnaire"]);
  });
});

describe("buildProgramManifest: team folders (decision 8)", () => {
  it("gives a member of two teams who leads one two folders, the led one first and tagged", () => {
    // Structures comes AFTER Kitchen in the camp's order, so only the
    // led-first rule can put it first.
    const m = buildProgramManifest(
      facts({
        rank: LEAD,
        memberships: [
          { team: KITCHEN, isLead: false },
          { team: STRUCTURES, isLead: true },
        ],
      }),
    );
    expect(
      m.teamFolders.map((f) => ({
        team: f.team,
        label: f.label,
        lead: f.lead,
      })),
    ).toEqual([
      { team: STRUCTURES, label: "Structures team", lead: true },
      { team: KITCHEN, label: "Kitchen team", lead: false },
    ]);
  });

  it("gives a Kitchen lead's Kitchen folder the team page and the Kitchen tools", () => {
    const m = buildProgramManifest(
      facts({ rank: LEAD, memberships: [{ team: KITCHEN, isLead: true }] }),
    );
    expect(teamFolder(m, KITCHEN)?.programs.map((p) => p.id)).toEqual([
      `team:${KITCHEN}`,
      "recipes",
      "meal-plan",
      "recipe-review",
    ]);
  });

  it("puts no Payments in the Finance folder of a Finance member who is not a captain", () => {
    const member = buildProgramManifest(
      facts({ memberships: [{ team: FINANCE, isLead: false }] }),
    );
    expect(teamFolder(member, FINANCE)?.programs.map((p) => p.id)).toEqual([
      `team:${FINANCE}`,
    ]);
    // A Finance LEAD is still not a captain (decision 13 A).
    const lead = buildProgramManifest(
      facts({ rank: LEAD, memberships: [{ team: FINANCE, isLead: true }] }),
    );
    expect(teamFolder(lead, FINANCE)?.programs.map((p) => p.id)).toEqual([
      `team:${FINANCE}`,
    ]);
    const captain = buildProgramManifest(
      facts({ rank: CAPTAIN, memberships: [{ team: FINANCE, isLead: false }] }),
    );
    expect(teamFolder(captain, FINANCE)?.programs.map((p) => p.id)).toEqual([
      `team:${FINANCE}`,
      "payments",
    ]);
  });

  it("shows a plain Comms member none of the lead or captain tools", () => {
    const m = buildProgramManifest(
      facts({ memberships: [{ team: COMMS, isLead: false }] }),
    );
    expect(teamFolder(m, COMMS)?.programs.map((p) => p.id)).toEqual([
      `team:${COMMS}`,
    ]);
  });

  it("lists every active team in the Teams folder for every approved member", () => {
    const m = buildProgramManifest(
      facts({ memberships: [{ team: FINANCE, isLead: false }] }),
    );
    const teams = folder(m, "teams")!.programs;
    expect(teams).toHaveLength(TEAMS.filter((t) => !t.archived).length);
    // Their own first, then the camp's order.
    expect(teams[0]).toMatchObject({ id: `team:${FINANCE}`, mine: true });
    expect(teams[1]).toMatchObject({ id: `team:${KITCHEN}` });
    expect(teams[1]).not.toHaveProperty("mine");
  });
});

// The registry fields that must never leave the server. A Record over the
// type's own keys, so a field added to RegistryEntry and not to ClientProgram
// (or one renamed) fails to compile here until this list names it.
const SERVER_ONLY: Record<
  Exclude<keyof RegistryEntry, keyof ClientProgram>,
  true
> = {
  place: true,
  rank: true,
  requires: true,
  applicants: true,
  perTeam: true,
};

// The client shapes, each a Record over the type's keys for the same reason.
const CLIENT_PROGRAM: Record<keyof ClientProgram, true> = {
  id: true,
  label: true,
  fileName: true,
  href: true,
  icon: true,
  group: true,
  folder: true,
  mine: true,
  badge: true,
};
const CLIENT_FOLDER: Record<keyof ClientFolder, true> = {
  id: true,
  label: true,
  icon: true,
  group: true,
  programs: true,
};
const CLIENT_TEAM_FOLDER: Record<keyof ClientTeamFolder, true> = {
  team: true,
  label: true,
  lead: true,
  programs: true,
};
const TRAY: Record<keyof ManifestTray, true> = {
  inbox: true,
  health: true,
  today: true,
  balloon: true,
};
const HEALTH: Record<keyof Extract<HealthFlag, { warnings: number }>, true> = {
  status: true,
  warnings: true,
  href: true,
};

describe("buildProgramManifest: what reaches the browser", () => {
  it("never carries a rank, a predicate or a reason", () => {
    const m = buildProgramManifest(
      facts({
        rank: CAPTAIN,
        memberships: [{ team: KITCHEN, isLead: true }],
        hasLift: true,
        inbox: 3,
        healthWarnings: 1,
      }),
    );
    const keys = allKeys(m);
    for (const forbidden of [...Object.keys(SERVER_ONLY), "reason"]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
    const values = JSON.stringify(m);
    for (const rank of ViewerRank.options) {
      expect(values).not.toContain(`"${rank}"`);
    }
    // Each object is its documented client shape and nothing more.
    const only = (obj: object, allowed: object, what: string) => {
      for (const key of Object.keys(obj)) {
        expect(Object.keys(allowed), `${what}.${key}`).toContain(key);
      }
    };
    const programs = [
      ...m.programs,
      ...m.folders.flatMap((f) => f.programs),
      ...m.teamFolders.flatMap((f) => f.programs),
    ];
    expect(programs.length).toBeGreaterThan(0);
    for (const p of programs) only(p, CLIENT_PROGRAM, "program");
    expect(m.folders.length).toBeGreaterThan(0);
    for (const f of m.folders) only(f, CLIENT_FOLDER, "folder");
    expect(m.teamFolders.length).toBeGreaterThan(0);
    for (const f of m.teamFolders) only(f, CLIENT_TEAM_FOLDER, "teamFolder");
    only(m.tray, TRAY, "tray");
    expect(m.tray.health).not.toBeNull();
    only(m.tray.health!, HEALTH, "tray.health");
    only(m.tray.inbox!, { count: true }, "tray.inbox");
  });

  it("puts the inbox count on the Inbox icon, and nothing when it is empty", () => {
    const busy = buildProgramManifest(facts({ inbox: 5 }));
    expect(busy.programs.find((p) => p.id === "inbox")?.badge).toBe(5);
    const quiet = buildProgramManifest(facts({ inbox: 0 }));
    expect(quiet.programs.find((p) => p.id === "inbox")).not.toHaveProperty(
      "badge",
    );
  });

  it("changes its version when what it shows changes, and only then", () => {
    const a = buildProgramManifest(facts());
    expect(buildProgramManifest(facts()).version).toBe(a.version);
    expect(buildProgramManifest(facts({ rank: CAPTAIN })).version).not.toBe(
      a.version,
    );
  });
});
