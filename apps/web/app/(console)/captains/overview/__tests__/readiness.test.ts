import { describe, expect, it } from "vitest";
import type { CampManagementMember } from "@camp404/db/roster";
import type { OpenSendGateRow } from "@camp404/db/questionnaire-results";
import type { TeamConfigEntry } from "@/lib/camp-config";
import type { TeamCoverage } from "@/lib/roster";
import { toRosterRow } from "@/lib/camp-roster";
import {
  deriveKpis,
  deriveReadinessFunnel,
  deriveSendCompletion,
  deriveTeamCoverage,
} from "../readiness";

// The four derivations behind the captain Overview's status board. They exist
// to keep the board honest: a figure the deployment cannot read must not render
// as a zero, a leaderless or empty team must stay visible, and the completion
// figures must come from @camp404/core's tally rather than a second sum.

function member(
  overrides: Partial<CampManagementMember> = {},
): CampManagementMember {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Dusty Boot",
    handle: null,
    rank: "member",
    approvalStatus: "approved",
    isLead: false,
    teams: [],
    duesPaid: false,
    membershipTier: "full",
    onboardingComplete: true,
    pendingRequiredActions: 0,
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: "ZA",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const rowsOf = (...members: CampManagementMember[]) => members.map(toRosterRow);

const ALL_KNOWN = { dues: true, actions: true };

function stage(
  funnel: ReturnType<typeof deriveReadinessFunnel>,
  key: string,
): number | null {
  const found = funnel.stages.find((s) => s.key === key);
  if (!found) throw new Error(`no stage ${key}`);
  return found.count;
}

describe("deriveReadinessFunnel", () => {
  it("counts each rung of the ladder over the whole camp", () => {
    const funnel = deriveReadinessFunnel(
      rowsOf(
        // The whole way down: profile, approved, clear, paid.
        member({ duesPaid: true }),
        // Approved and clear, but has not paid.
        member({ duesPaid: false }),
        // Approved, still owes a blocking questionnaire.
        member({ pendingRequiredActions: 2, duesPaid: true }),
        // Profile in, waiting on a captain.
        member({ approvalStatus: "pending" }),
        // Signed up, profile unfinished.
        member({ onboardingComplete: false, approvalStatus: "pending" }),
      ),
      ALL_KNOWN,
    );

    expect(funnel.total).toBe(5);
    expect(stage(funnel, "signed_up")).toBe(5);
    expect(stage(funnel, "profile")).toBe(4);
    expect(stage(funnel, "approved")).toBe(3);
    expect(stage(funnel, "clear")).toBe(2);
    expect(stage(funnel, "dues")).toBe(1);
  });

  it("is cumulative: a member who paid but is not approved never reaches the dues rung", () => {
    const funnel = deriveReadinessFunnel(
      rowsOf(member({ approvalStatus: "pending", duesPaid: true })),
      ALL_KNOWN,
    );

    expect(stage(funnel, "profile")).toBe(1);
    expect(stage(funnel, "approved")).toBe(0);
    // The rungs below approval are conjunctions of it, so they are 0 too — the
    // bars can only ever shrink down the ladder.
    expect(stage(funnel, "clear")).toBe(0);
    expect(stage(funnel, "dues")).toBe(0);
  });

  it("is cumulative upwards too: approving somebody does not finish their profile", () => {
    // A captain can approve a sign-up whose burner profile is still unfinished.
    // Counting them at "Approved" would put a later rung above an earlier one
    // and the funnel would widen halfway down.
    const funnel = deriveReadinessFunnel(
      rowsOf(
        member({
          onboardingComplete: false,
          approvalStatus: "approved",
          duesPaid: true,
        }),
      ),
      ALL_KNOWN,
    );

    expect(stage(funnel, "signed_up")).toBe(1);
    expect(stage(funnel, "profile")).toBe(0);
    expect(stage(funnel, "approved")).toBe(0);
    expect(stage(funnel, "dues")).toBe(0);
  });

  it("says a rung is unreadable rather than reporting zero for it", () => {
    const rows = rowsOf(member({ duesPaid: true }));

    const funnel = deriveReadinessFunnel(rows, { dues: false, actions: true });

    expect(stage(funnel, "clear")).toBe(1);
    expect(stage(funnel, "dues")).toBeNull();
  });

  it("an unreadable rung makes the rungs below it unreadable too", () => {
    // The payments ledger is readable, required_actions is not — and "dues
    // paid" means "paid AND nothing outstanding", so it cannot be answered.
    const funnel = deriveReadinessFunnel(rowsOf(member({ duesPaid: true })), {
      dues: true,
      actions: false,
    });

    expect(stage(funnel, "approved")).toBe(1);
    expect(stage(funnel, "clear")).toBeNull();
    expect(stage(funnel, "dues")).toBeNull();
  });

  it("an empty camp is five zeroes, not five nulls", () => {
    const funnel = deriveReadinessFunnel([], ALL_KNOWN);
    expect(funnel.total).toBe(0);
    expect(funnel.stages.map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
  });
});

function team(over: Partial<TeamConfigEntry> = {}): TeamConfigEntry {
  return {
    key: "kitchen",
    label: "Kitchen",
    order: 0,
    archived: false,
    ...over,
  };
}

function coverage(over: Partial<TeamCoverage> = {}): TeamCoverage {
  return {
    team: "kitchen" as TeamCoverage["team"],
    members: 3,
    leads: 1,
    cycle: 2027,
    ...over,
  };
}

describe("deriveKpis", () => {
  const kpi = (kpis: ReturnType<typeof deriveKpis>, key: string) => {
    const found = kpis.find((k) => k.key === key);
    if (!found) throw new Error(`no kpi ${key}`);
    return found;
  };

  it("counts what it can read, over the approved members", () => {
    const kpis = deriveKpis(
      rowsOf(
        member({ rank: "captain", duesPaid: true }),
        member({ duesPaid: true }),
        member(),
        member({ approvalStatus: "pending", onboardingComplete: true }),
      ),
      2,
      { dues: true },
    );

    expect(kpi(kpis, "members")).toMatchObject({ value: 3, hint: "1 captain" });
    expect(kpi(kpis, "pending")).toMatchObject({
      value: 1,
      hint: "Open the roster to decide",
    });
    expect(kpi(kpis, "dues")).toMatchObject({
      value: 2,
      hint: "of 3 approved",
    });
    expect(kpi(kpis, "sends")).toMatchObject({
      value: 2,
      hint: "Questionnaires collecting answers",
    });
  });

  it("has no figure at all where the fact cannot be read", () => {
    // The E2E test store's shape: every roster row says `duesPaid: false` and
    // the open-send list comes back empty, neither of which is a fact. A 0 here
    // reads as "nobody has paid" and "no questionnaire is open".
    const rows = rowsOf(member({ duesPaid: true }), member());
    const known = deriveKpis(rows, 0, { dues: true });
    const unknown = deriveKpis(rows, null, { dues: false });

    expect(kpi(unknown, "dues").value).toBeNull();
    expect(kpi(unknown, "dues").hint).toBe("The ledger cannot be read here");
    expect(kpi(unknown, "sends").value).toBeNull();
    expect(kpi(unknown, "sends").hint).toBe("Open sends cannot be read here");

    // The same rows, readable: a real 0 is still a 0, and says the true thing.
    expect(kpi(known, "dues").value).toBe(1);
    expect(kpi(known, "sends").value).toBe(0);
    expect(kpi(known, "sends").hint).toBe("No questionnaire is open");

    // The two cards that do not depend on either read are unaffected.
    expect(kpi(unknown, "members").value).toBe(2);
    expect(kpi(unknown, "pending").value).toBe(0);
  });
});

describe("deriveTeamCoverage", () => {
  it("keeps the camp's configured order and marks a team with no lead", () => {
    const rows = deriveTeamCoverage(
      [
        coverage({ team: "structures" as TeamCoverage["team"], leads: 0 }),
        coverage({ team: "kitchen" as TeamCoverage["team"], members: 5 }),
      ],
      [
        team({ key: "kitchen", label: "Cuisine", order: 1 }),
        team({ key: "structures", label: "Structures", order: 0 }),
      ],
    );

    expect(rows.map((r) => r.key)).toEqual(["structures", "kitchen"]);
    expect(rows[0]).toMatchObject({ members: 3, leads: 0, hasLead: false });
    expect(rows[1]).toMatchObject({
      label: "Cuisine",
      members: 5,
      hasLead: true,
    });
  });

  it("keeps a team nobody is on — the empty ones are the point", () => {
    const rows = deriveTeamCoverage([], [team(), team({ key: "structures" })]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ members: 0, leads: 0, hasLead: false });
  });

  it("links each row to the roster filtered to that team", () => {
    const [row] = deriveTeamCoverage([coverage()], [team()]);
    expect(row!.href).toBe("/captains/camp-management?team=kitchen");
  });

  it("drops an archived team nobody is on, but keeps one that still has members", () => {
    const rows = deriveTeamCoverage(
      [coverage({ team: "structures" as TeamCoverage["team"], members: 2 })],
      [
        team({ key: "kitchen", archived: true }),
        team({ key: "structures", order: 1, archived: true }),
      ],
    );

    expect(rows.map((r) => r.key)).toEqual(["structures"]);
    expect(rows[0]).toMatchObject({ archived: true, members: 2 });
  });

  it("shows a team the config does not name, with no link and no archived chip", () => {
    // A `teamEnum` value with no config entry: people are on it, so hiding it
    // would lose them. But the roster page validates `?team=` against the
    // configured teams, so a link would fall through to the UNFILTERED roster —
    // the captain would read the whole camp as this team's three people. And
    // nobody archived it, so it must not claim they did.
    const rows = deriveTeamCoverage(
      [coverage({ team: "ministry_of_memes" as TeamCoverage["team"] })],
      [team()],
    );

    expect(rows.map((r) => r.key)).toEqual(["kitchen", "ministry_of_memes"]);
    expect(rows[1]).toMatchObject({
      members: 3,
      archived: false,
      unconfigured: true,
      href: null,
    });
    // The configured team keeps its link and is not flagged.
    expect(rows[0]).toMatchObject({
      unconfigured: false,
      href: "/captains/camp-management?team=kitchen",
    });
  });
});

function gate(over: Partial<OpenSendGateRow> = {}): OpenSendGateRow {
  return {
    activationId: "act-1",
    questionnaireKey: "gear-check",
    title: "Gear check",
    cycle: 2027,
    status: "pending",
    ...over,
  };
}

describe("deriveSendCompletion", () => {
  it("counts answered out of eligible, leaving waived and expired out of the denominator", () => {
    const [send] = deriveSendCompletion([
      gate({ status: "completed" }),
      gate({ status: "completed" }),
      gate({ status: "pending" }),
      gate({ status: "waived" }),
      gate({ status: "expired" }),
    ]);

    expect(send).toMatchObject({
      title: "Gear check",
      sent: 5,
      completed: 2,
      // 2 completed + 1 pending; the waived and the expired row left.
      eligible: 3,
      completionPct: 67,
      cycle: 2027,
      href: "/captains/questionnaires/gear-check/metrics?cycle=2027",
    });
  });

  it("links a send to the results page FOR THE YEAR IT WAS SENT IN", () => {
    // A carry-over questionnaire's open send survives a rollover untouched
    // (advanceCycle's `carriesOver` bucket does nothing), so an open send
    // stamped 2026 in a 2027 camp is ordinary. The results page defaults to the
    // newest year, where that activation does not exist and no completion
    // figure is printed at all — so the year has to travel with the link.
    const [stale] = deriveSendCompletion([
      gate({ cycle: 2026, status: "completed" }),
    ]);

    expect(stale!.cycle).toBe(2026);
    expect(stale!.href).toBe(
      "/captains/questionnaires/gear-check/metrics?cycle=2026",
    );
  });

  it("keeps each open send apart", () => {
    const sends = deriveSendCompletion([
      gate({ status: "completed" }),
      gate({
        activationId: "act-2",
        questionnaireKey: "shifts",
        title: "Shifts",
        status: "pending",
      }),
    ]);

    expect(sends.map((s) => s.title)).toEqual(["Gear check", "Shifts"]);
    expect(sends[0]!.completionPct).toBe(100);
    expect(sends[1]!.completionPct).toBe(0);
  });

  it("lists a send that reached nobody at 0 of 0 rather than dropping it", () => {
    // The LEFT JOIN's no-gates row: a send exists, nothing hangs off it.
    const [send] = deriveSendCompletion([gate({ status: null })]);

    expect(send).toMatchObject({ sent: 0, eligible: 0, completionPct: 0 });
  });
});
