import type { drizzle } from "drizzle-orm/pglite";
import { encrypt } from "@camp404/db/crypto";
import * as schema from "@camp404/db/schema";

// The camp every eval case is spoken into (#356): one seeded state with fixed
// ids, so a recorded model answer (which names ids it read) replays exactly
// in CI. Members include the look-alikes the "no mistakes" bar is about:
// Gecko Naidoo and Gekko Naidoo (one sound, two people), and Thandi Mokoena
// and Thandi Botha (one first name). Dates: today is Tuesday 6 October 2026;
// the Burn is Monday 26 April to Sunday 2 May 2027.

type DB = ReturnType<typeof drizzle<typeof schema>>;

/** A fixed, valid v4-shaped uuid for row `n` of kind `k` (1-9). */
export const fixed = (k: number, n: number) =>
  `0000000${k}-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const PEOPLE = {
  ryno: { id: fixed(1, 1), name: "Ryno Steyn", rank: "captain" as const },
  mpho: { id: fixed(1, 2), name: "Mpho Dlamini", rank: "captain" as const },
  gecko: { id: fixed(1, 3), name: "Gecko Naidoo" },
  gekko: { id: fixed(1, 4), name: "Gekko Naidoo" },
  thandiM: { id: fixed(1, 5), name: "Thandi Mokoena" },
  thandiB: { id: fixed(1, 6), name: "Thandi Botha" },
  spotty: { id: fixed(1, 7), name: "Spotty van Wyk" },
  priya: { id: fixed(1, 8), name: "Priya Pillay" },
  jonno: { id: fixed(1, 9), name: "Jonno Smith" },
  lerato: { id: fixed(1, 10), name: "Lerato Khumalo" },
  pieter: { id: fixed(1, 11), name: "Pieter de Villiers" },
  ayesha: { id: fixed(1, 12), name: "Ayesha Patel" },
  sipho: { id: fixed(1, 13), name: "Sipho Ndlovu" },
  kat: { id: fixed(1, 14), name: "Kat Jacobs" },
  ben: { id: fixed(1, 15), name: "Ben Ferreira" },
  zanele: { id: fixed(1, 16), name: "Zanele Mthembu" },
} as const;

/** The captain who speaks every case. */
export const SPEAKER = PEOPLE.ryno;

type Team = (typeof schema.teamEnum.enumValues)[number];

const MEMBERSHIPS: { who: keyof typeof PEOPLE; team: Team; lead?: boolean }[] = [
  { who: "ryno", team: "structures" },
  { who: "mpho", team: "kitchen" },
  { who: "spotty", team: "kitchen", lead: true },
  { who: "priya", team: "kitchen" },
  { who: "gekko", team: "kitchen" },
  { who: "gecko", team: "structures" },
  { who: "jonno", team: "structures", lead: true },
  { who: "thandiM", team: "art_and_activities" },
  { who: "thandiB", team: "health_and_safety" },
  { who: "lerato", team: "ministry_of_vibes" },
  { who: "pieter", team: "power_and_lighting" },
  { who: "ayesha", team: "finance", lead: true },
  { who: "sipho", team: "sanitation_and_water" },
  { who: "ben", team: "transport_and_logistics" },
  { who: "zanele", team: "health_and_safety", lead: true },
];

export const BURN_DAYS = [
  "2027-04-26",
  "2027-04-27",
  "2027-04-28",
  "2027-04-29",
  "2027-04-30",
  "2027-05-01",
  "2027-05-02",
] as const;

export const SHIFT_TYPES = [
  { key: "breakfastCooks", name: "Breakfast cooks", team: "kitchen", start: 7 * 60, minutes: 120, places: 4 },
  { key: "breakfastWashUp", name: "Breakfast wash-up", team: "kitchen", start: 9 * 60, minutes: 60, places: 2 },
  { key: "dinnerCooks", name: "Dinner cooks", team: "kitchen", start: 17 * 60, minutes: 120, places: 4 },
  { key: "dinnerWashUp", name: "Dinner wash-up", team: "kitchen", start: 19 * 60 + 30, minutes: 60, places: 2 },
  { key: "moop", name: "MOOP sweep", team: "sanitation_and_water", start: 10 * 60, minutes: 60, places: 3 },
  { key: "generator", name: "Generator check", team: "power_and_lighting", start: 8 * 60, minutes: 30, places: 1 },
  { key: "bar", name: "Bar shift", team: "ministry_of_vibes", start: 21 * 60, minutes: 120, places: 3 },
] as const;

export type ShiftKey = (typeof SHIFT_TYPES)[number]["key"];

/** The slot of shift `key` on burn day `day` (YYYY-MM-DD). */
export function slot(key: ShiftKey, day: string): string {
  const t = SHIFT_TYPES.findIndex((s) => s.key === key);
  const d = BURN_DAYS.indexOf(day as (typeof BURN_DAYS)[number]);
  if (t < 0 || d < 0) throw new Error(`No slot ${key} on ${day}`);
  return fixed(3, (t + 1) * 100 + d + 1);
}

export const TASKS = {
  shadeCloth: { id: fixed(4, 1), title: "Buy 30 m of shade cloth", team: "structures", status: "in_progress" },
  shopping: { id: fixed(4, 2), title: "Kitchen shopping list", team: "kitchen", status: "open" },
  showerPump: { id: fixed(4, 3), title: "Fix the shower pump", team: "sanitation_and_water", status: "open" },
  truck: { id: fixed(4, 4), title: "Book the truck", team: "transport_and_logistics", status: "open" },
  ledStrips: { id: fixed(4, 5), title: "Order LED strips", team: "power_and_lighting", status: "in_progress" },
  ledBulbs: { id: fixed(4, 6), title: "Order LED bulbs", team: "power_and_lighting", status: "open" },
  campSign: { id: fixed(4, 7), title: "Design the camp sign", team: "art_and_activities", status: "done" },
  dome: { id: fixed(4, 8), title: "Paint the dome", team: "structures", status: "open" },
} as const;

export const CLAIMS = {
  gasBottles: { id: fixed(5, 1), who: "gecko", team: "kitchen", description: "Gas bottles, 2 × 9 kg", cents: 124_000, status: "submitted" },
  cableTies: { id: fixed(5, 2), who: "gekko", team: "structures", description: "Cable ties and rope", cents: 35_000, status: "submitted" },
  spices: { id: fixed(5, 3), who: "thandiM", team: "kitchen", description: "Spices and oil", cents: 48_050, status: "submitted" },
  firewood: { id: fixed(5, 4), who: "thandiM", team: "kitchen", description: "Firewood", cents: 60_000, status: "submitted" },
  deposit: { id: fixed(5, 5), who: "jonno", team: "structures", description: "Shade cloth deposit", cents: 150_000, status: "submitted" },
  fairyLights: { id: fixed(5, 6), who: "lerato", team: "ministry_of_vibes", description: "Fairy lights", cents: 89_900, status: "submitted" },
  generator: { id: fixed(5, 7), who: "pieter", team: "power_and_lighting", description: "Generator service", cents: 250_000, status: "approved" },
  printerInk: { id: fixed(5, 8), who: "ryno", team: "finance", description: "Printer ink", cents: 30_000, status: "submitted" },
  toiletPaper: { id: fixed(5, 9), who: "sipho", team: "sanitation_and_water", description: "Toilet paper in bulk", cents: 72_000, status: "submitted" },
} as const;

/** Seed the eval camp into an empty database. */
export async function seedEvalCamp(db: DB): Promise<void> {
  await db.insert(schema.users).values(
    Object.values(PEOPLE).map((p) => ({
      id: p.id,
      authUserId: `auth-${p.id}`,
      displayName: p.name,
      rank: "rank" in p ? p.rank : ("member" as const),
      approvalStatus: "approved" as const,
    })),
  );
  await db.insert(schema.teamMemberships).values(
    MEMBERSHIPS.map((m) => ({
      userId: PEOPLE[m.who].id,
      team: m.team,
      isLead: m.lead ?? false,
      cycle: 1,
    })),
  );
  await db.insert(schema.campParticipations).values(
    Object.values(PEOPLE).map((p) => ({
      userId: p.id,
      cycle: 1,
      status: "accepted" as const,
      intent: "yes" as const,
    })),
  );
  await db.insert(schema.logisticsPhases).values([
    { cycle: 1, phase: "pack", startDate: "2027-04-17", endDate: "2027-04-18", place: "storage unit" },
    { cycle: 1, phase: "travel", startDate: "2027-04-21", endDate: "2027-04-21" },
    { cycle: 1, phase: "build", startDate: "2027-04-22", endDate: "2027-04-25", place: "on site" },
    { cycle: 1, phase: "burn", startDate: "2027-04-26", endDate: "2027-05-02" },
    { cycle: 1, phase: "strike", startDate: "2027-05-03", endDate: "2027-05-04", place: "on site" },
    { cycle: 1, phase: "unpack", startDate: "2027-05-08", endDate: "2027-05-08", place: "storage unit" },
  ]);
  await db.insert(schema.logisticsAttendance).values([
    { cycle: 1, phase: "pack", userId: SPEAKER.id, answer: "going" },
    { cycle: 1, phase: "strike", userId: SPEAKER.id, answer: "maybe" },
    { cycle: 1, phase: "build", userId: PEOPLE.jonno.id, answer: "going" },
    { cycle: 1, phase: "build", userId: PEOPLE.gecko.id, answer: "going" },
    { cycle: 1, phase: "build", userId: PEOPLE.priya.id, answer: "maybe" },
  ]);
  for (const [t, type] of SHIFT_TYPES.entries()) {
    const typeId = fixed(2, t + 1);
    await db.insert(schema.shiftTypes).values({
      id: typeId,
      cycle: 1,
      team: type.team,
      name: type.name,
      startMinute: type.start,
      durationMinutes: type.minutes,
      places: type.places,
    });
    await db.insert(schema.shiftSlots).values(
      BURN_DAYS.map((day) => ({ id: slot(type.key, day), typeId, day })),
    );
  }
  await db.insert(schema.shiftSignups).values([
    { slotId: slot("dinnerCooks", "2027-04-29"), userId: SPEAKER.id },
    { slotId: slot("breakfastCooks", "2027-04-28"), userId: PEOPLE.spotty.id },
    { slotId: slot("breakfastCooks", "2027-04-28"), userId: PEOPLE.priya.id },
    { slotId: slot("breakfastWashUp", "2027-04-28"), userId: PEOPLE.gekko.id },
    { slotId: slot("generator", "2027-04-26"), userId: PEOPLE.pieter.id },
  ]);
  await db.insert(schema.tasks).values(
    Object.values(TASKS).map((t) => ({
      id: t.id,
      title: t.title,
      team: t.team,
      status: t.status,
      createdByUserId: PEOPLE.mpho.id,
      assigneeId: t.id === TASKS.showerPump.id ? PEOPLE.sipho.id : null,
      dueAt: t.id === TASKS.shopping.id ? new Date("2026-10-07T08:00:00+02:00") : null,
      completedAt: t.status === "done" ? new Date("2026-10-01T10:00:00Z") : null,
    })),
  );
  await db.insert(schema.reimbursements).values(
    Object.values(CLAIMS).map((c, i) => ({
      id: c.id,
      submitterId: PEOPLE[c.who].id,
      cycle: 1,
      team: c.team,
      amountCents: c.cents,
      currency: "ZAR",
      spentOn: "2026-10-01",
      accountType: "sa" as const,
      accountDetailsEncrypted: encrypt(JSON.stringify({ bank: "Test", account: `000${i}` })),
      description: c.description,
      status: c.status,
      createdAt: new Date(`2026-10-0${1 + (i % 5)}T09:00:00Z`),
      ...(c.status === "approved"
        ? { approverId: PEOPLE.mpho.id, approvedAt: new Date("2026-10-04T09:00:00Z") }
        : {}),
    })),
  );
  await db.insert(schema.teamBudgets).values([
    { team: "kitchen", cycle: 1, currency: "ZAR", amountCents: 500_000 },
    { team: "structures", cycle: 1, currency: "ZAR", amountCents: 800_000 },
  ]);
  for (let i = 0; i < 3; i += 1) {
    await db.insert(schema.notificationDeliveries).values({
      userId: SPEAKER.id,
      title: `Notice ${i + 1}`,
      body: "A camp notice.",
      channel: "in_app",
      presentation: "feed",
    });
  }
}

/** The camp calendar's events (Google's, stubbed in the eval). */
export const CALENDAR_EVENTS = [
  {
    id: "ev1",
    title: "Build-week planning call",
    start: "2026-10-07T19:00:00+02:00",
    allDay: false,
    location: "Online",
    teamTag: null,
  },
  {
    id: "ev2",
    title: "Kitchen - Menu tasting",
    start: "2026-10-10",
    allDay: true,
    location: "Mpho's house",
    teamTag: "kitchen",
  },
];
