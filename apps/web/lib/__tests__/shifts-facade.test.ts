import { beforeEach, describe, expect, it, vi } from "vitest";

// The shift roster's facade (#248), over the E2E test store. What each viewer
// gets is decided on the server, never hidden in the UI:
//  - every member reads who is on a shift as "Dee M.", never an id;
//  - a lead of the shift's team and a captain get the ids (to take someone
//    off); a lead of another team does not;
//  - the fairness view reaches leads and captains only;
//  - the minimum's reminder is not shown to a member who said they are not
//    coming.

vi.mock("server-only", () => ({}));
vi.mock("../test-mode", () => ({ usesTestStore: () => true }));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => true }));
const place = vi.hoisted(() => ({ status: null as string | null }));
vi.mock("../participations", () => ({
  getMyParticipation: vi.fn(async () =>
    place.status ? { status: place.status } : null,
  ),
}));
vi.mock("../camp-config", async () => {
  const { testStore } = await import("../test-store");
  return {
    getCampSettings: async () => ({
      cycleNumber: testStore.currentCycleNumber(),
      teams: {
        teams: [
          {
            key: "kitchen",
            label: "Kitchen",
            order: 0,
            archived: false,
          },
          {
            key: "sanitation_and_water",
            label: "Sanitation and MOOP",
            order: 1,
            archived: false,
          },
        ],
      },
    }),
  };
});

import {
  getMyShifts,
  getShiftsView,
  saveShiftType,
  signUpForShift,
} from "../shifts";
import { testStore } from "../test-store";

function campDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(new Date(Date.now() + days * 86_400_000));
}

function person(
  id: string,
  name: string,
  rank: "captain" | "member" = "member",
) {
  return testStore.createUser({
    authUserId: id,
    displayName: name,
    inviteCode: null,
    rank,
  });
}

async function roster() {
  testStore.reset();
  place.status = null;
  const cap = person("cap", "Cap Tain", "captain");
  const san = person("san", "San Lead");
  testStore.seedTeamMembership({
    userId: san.id,
    team: "sanitation_and_water",
    isLead: true,
  });
  const kit = person("kit", "Kit Lead");
  testStore.seedTeamMembership({
    userId: kit.id,
    team: "kitchen",
    isLead: true,
  });
  const dee = person("dee", "Dee Member");
  expect(
    testStore.setLogisticsPhase({
      actorId: cap.id,
      phase: "burn",
      startDate: campDay(10),
      endDate: campDay(11),
      place: null,
      note: null,
      expectedVersion: 0,
      newEventId: "evt0001",
    }).ok,
  ).toBe(true);
  const saved = await saveShiftType(san.id, {
    team: "sanitation_and_water",
    name: "Morning clean",
    startMinute: 480,
    durationMinutes: 120,
    places: 2,
    note: null,
    expectedVersion: 0,
  });
  expect(saved).toEqual({ ok: true, daysAdded: 2 });
  const view = await getShiftsView({
    userId: dee.id,
    rank: "camp_member",
    ledTeams: [],
  });
  const slot = view.days[0]!.slots[0]!;
  expect((await signUpForShift(dee.id, { slotId: slot.id })).ok).toBe(true);
  return { cap, san, kit, dee, slotId: slot.id };
}

describe("getShiftsView", () => {
  beforeEach(() => {
    testStore.reset();
  });

  it("a member reads names only; the shift's lead and a captain get ids", async () => {
    const { cap, san, kit, dee, slotId } = await roster();
    const find = (v: Awaited<ReturnType<typeof getShiftsView>>) =>
      v.days.flatMap((d) => d.slots).find((s) => s.id === slotId)!;

    const asMember = await getShiftsView({
      userId: dee.id,
      rank: "camp_member",
      ledTeams: [],
    });
    expect(find(asMember)).toMatchObject({
      names: ["Dee M."],
      people: null,
      mine: true,
    });
    expect(JSON.stringify(asMember)).not.toContain(dee.id);
    expect(asMember.fairness).toBeNull();
    expect(asMember.members).toBeNull();
    expect(asMember.teams).toEqual([]);

    const asKitchen = await getShiftsView({
      userId: kit.id,
      rank: "team_lead",
      ledTeams: ["kitchen"],
    });
    expect(find(asKitchen).people).toBeNull();
    expect(find(asKitchen).type.canManage).toBe(false);
    expect(asKitchen.teams.map((t) => t.key)).toEqual(["kitchen"]);

    const asSanitation = await getShiftsView({
      userId: san.id,
      rank: "team_lead",
      ledTeams: ["sanitation_and_water"],
    });
    expect(find(asSanitation).people).toEqual([
      { userId: dee.id, name: "Dee M." },
    ]);

    const asCaptain = await getShiftsView({
      userId: cap.id,
      rank: "captain",
      ledTeams: [],
    });
    expect(find(asCaptain).people).toEqual([
      { userId: dee.id, name: "Dee M." },
    ]);
    expect(asCaptain.canAsk).toBe(true);
    expect(asCaptain.teams.map((t) => t.key)).toEqual([
      "kitchen",
      "sanitation_and_water",
    ]);
  });

  it("gives leads and captains the fairness view, counted by member", async () => {
    const { san, dee } = await roster();
    testStore.seedParticipation({ userId: dee.id, status: "applied" });
    const view = await getShiftsView({
      userId: san.id,
      rank: "team_lead",
      ledTeams: ["sanitation_and_water"],
    });
    expect(view.fairness).toEqual([
      { userId: dee.id, name: "Dee Member", count: 1, below: true },
    ]);
  });

  it("does not remind a member who said they are not coming", async () => {
    const { dee } = await roster();
    place.status = "applied";
    expect((await getMyShifts(dee.id)).reminder).toBe(
      "You're on 1 shift. The camp asks everyone for at least 3.",
    );
    place.status = "not_attending";
    expect((await getMyShifts(dee.id)).reminder).toBeNull();
    const view = await getShiftsView({
      userId: dee.id,
      rank: "camp_member",
      ledTeams: [],
    });
    expect(view.reminder).toBeNull();
    expect(view.myCount).toBe(1);
  });
});
