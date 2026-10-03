import "server-only";

import type { ParticipationStatus } from "@camp404/types";
import { InventoryItemInput } from "@camp404/types";
import { reachRank } from "@camp404/db/power";
import { testStore } from "./test-store";
import { inventoryStore } from "./test-store-inventory";
import { logisticsTestStore } from "./test-store-logistics";

// A camp's worth of rows for the prints round (#249) in the E2E test store:
// the burn timeline's phases and attendance answers, the members the
// captains accepted, the loading checklist's gear, and Transport's trailers
// and drivers, all from the approved mock-ups (design/prints-round.html,
// 2026-10-02). The seed-prints test route fills it for a spec or a screenshot
// run. Every write goes through the store's own rules as `actorId`, who must
// already be a captain, checked before anything is written. Throws on the
// first refused write.

type Result = { ok: true } | { ok: false; error: string };

function must<T extends Result>(
  step: string,
  result: T,
): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`${step}: ${result.error}`);
  return result as Extract<T, { ok: true }>;
}

const NAMES = [
  "Pat Kruger",
  "Sam Botha",
  "Lerato Mokoena",
  "Kyle Adams",
  "Ayesha Patel",
  "Sipho Dlamini",
  "Ben Nel",
  "Jess Smith",
  "Tumi Khumalo",
  "Megan van der Berg",
  "Chloe Jacobs",
  "Naledi Zulu",
];

/** Each phase's days: the mock-up's 2027 burn. */
const PHASES = [
  [
    "pack",
    "2027-04-17",
    "2027-04-17",
    "Storage unit, Ndabeni",
    "Load the trailer and the truck.",
  ],
  [
    "travel",
    "2027-04-21",
    "2027-04-21",
    "Cape Town to Tankwa",
    "Leave before 06:00; fuel up in Ceres.",
  ],
  [
    "build",
    "2027-04-22",
    "2027-04-24",
    "On site",
    "Shade and kitchen first, then the Dome.",
  ],
  ["burn", "2027-04-25", "2027-05-01", "On site", null],
  [
    "strike",
    "2027-05-02",
    "2027-05-03",
    "On site",
    "Nobody leaves before the MOOP sweep.",
  ],
  [
    "unpack",
    "2027-05-08",
    "2027-05-08",
    "Storage unit, Ndabeni",
    "Wash the kitchen crates before they go in.",
  ],
] as const;

/** Going and maybe per attendance phase, as counts of the members above. */
const ANSWERS = {
  pack: [7, 3],
  build: [9, 2],
  strike: [8, 2],
  unpack: [5, 2],
} as const;

/** [name, team, category, condition, quantity, unit, kg, custodian index]. */
const GEAR = [
  [
    "Shade cloth, 6 × 10 m",
    "structures",
    "structures",
    "good",
    4,
    "piece",
    48,
    null,
  ],
  [
    "Steel poles, 3 m",
    "structures",
    "structures",
    "good",
    24,
    "pole",
    130,
    null,
  ],
  [
    "Guy ropes and pegs",
    "structures",
    "structures",
    "good",
    2,
    "crate",
    35,
    null,
  ],
  ["Dome frame", "structures", "structures", "good", 1, "set", 210, null],
  ["Gas burners", "kitchen", "kitchen", "good", 4, "burner", 36, null],
  ["Potjies, 25 L", "kitchen", "kitchen", "needs_repair", 3, "pot", 54, null],
  [
    "Kitchen crates (pots, knives, utensils)",
    "kitchen",
    "kitchen",
    "good",
    6,
    "crate",
    90,
    null,
  ],
  ["Prep tables, folding", "kitchen", "kitchen", "good", 4, "table", 44, null],
  ["Chest freezer", "kitchen", "cooling", "good", 1, null, 45, 0],
  ["Cooler boxes", "kitchen", "cooling", "good", 5, "box", null, 2],
  [
    "Generator, 5.5 kVA",
    "power_and_lighting",
    "power",
    "good",
    1,
    null,
    78,
    null,
  ],
  [
    "Extension reels",
    "power_and_lighting",
    "power",
    "good",
    8,
    "reel",
    40,
    null,
  ],
  [
    "Festoon lights",
    "power_and_lighting",
    "power",
    "good",
    6,
    "set",
    null,
    null,
  ],
  ["Spare inverter", "power_and_lighting", "power", "broken", 1, null, 12, 1],
  [
    "Water drums, 210 L",
    "sanitation_and_water",
    "water_and_sanitation",
    "good",
    6,
    "drum",
    60,
    null,
  ],
  [
    "Grey water tank",
    "sanitation_and_water",
    "water_and_sanitation",
    "good",
    1,
    null,
    25,
    null,
  ],
  [
    "Shower bags",
    "sanitation_and_water",
    "water_and_sanitation",
    "good",
    10,
    "bag",
    null,
    null,
  ],
  ["Lounge rugs", "ministry_of_vibes", "decor", "good", 8, "rug", 64, null],
  ["Art: neon cat sign", "art_and_activities", "decor", "good", 1, null, 18, 4],
  ["Toolbox", "structures", "tools", "good", 1, null, 22, null],
] as const;

/** The seed writes every team's rows, so only a captain may run it. */
export const SEED_PRINTS_CAPTAINS_ONLY =
  "Only a captain can seed the prints example.";

export function seedPrintsExample(actorId: string): void {
  // Checked before the first write, so a refused seed leaves nothing behind.
  if (
    testStore.findUserById(actorId) === null ||
    reachRank(testStore.senderReach(actorId)) !== "captain"
  ) {
    throw new Error(SEED_PRINTS_CAPTAINS_ONLY);
  }
  const members = NAMES.map((name, i) => {
    const authUserId = `prints-seed-${i}`;
    const user =
      testStore.findUserByAuthId(authUserId) ??
      testStore.createUser({ authUserId, displayName: name, inviteCode: null });
    const status: ParticipationStatus =
      i < 10 ? "accepted" : i === 10 ? "applied" : "maybe";
    testStore.seedParticipation({ userId: user.id, status });
    return user;
  });

  for (const [phase, startDate, endDate, place, note] of PHASES) {
    const current = testStore
      .listLogisticsPhases()
      .find((r) => r.phase === phase);
    must(
      `phase ${phase}`,
      testStore.setLogisticsPhase({
        actorId,
        phase,
        startDate,
        endDate,
        place,
        note,
        expectedVersion: current?.version ?? 0,
        newEventId: `prints-seed-${phase}`,
      }),
    );
  }
  // Answers are open until a phase starts: answer as of New Year 2027.
  const before = new Date("2027-01-01T08:00:00Z");
  for (const [phase, [going, maybe]] of Object.entries(ANSWERS) as [
    keyof typeof ANSWERS,
    readonly [number, number],
  ][]) {
    members.forEach((m, i) => {
      const answer = i < going ? "going" : i < going + maybe ? "maybe" : "cant";
      must(
        `answer ${phase}`,
        logisticsTestStore.setMyAttendance({
          userId: m.id,
          phase,
          answer,
          expected: null,
          now: before,
        }),
      );
    });
  }

  // Four drivers, two of them towing.
  for (const [i, make] of [
    [0, "Toyota"],
    [3, "Nissan"],
    [5, "Ford"],
    [7, "VW"],
  ] as const) {
    testStore.seedDriverProfile({
      userId: members[i]!.id,
      vehicleMake: make,
      canTow: i !== 7,
      seatsOffered: 3,
    });
  }
  for (const [name, tow] of [
    ["Big Red", 0],
    ["Kitchen box trailer", 3],
    ["Long trailer", null],
  ] as const) {
    const { id } = must(
      `trailer ${name}`,
      testStore.addTrailer({ actorId, name, notes: null }),
    );
    if (tow !== null) {
      must(
        `tow ${name}`,
        testStore.setTrailerTow({
          actorId,
          trailerId: id,
          driverUserId: members[tow]!.id,
          expectedVersion: 0,
        }),
      );
    }
  }

  for (const [
    name,
    team,
    category,
    condition,
    quantity,
    unit,
    kg,
    at,
  ] of GEAR) {
    const input = InventoryItemInput.parse({
      name,
      team,
      category,
      condition,
      quantity,
      unit,
      weightKg: kg,
      location: at === null ? "storage_unit" : "custodian_home",
      custodianUserId: at === null ? null : members[at]!.id,
    });
    must(
      `item ${name}`,
      inventoryStore.addInventoryItem({ ...input, actorId }),
    );
  }
}
