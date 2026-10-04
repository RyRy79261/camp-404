import {
  guideChapterIsPublic,
  toPublicChapter,
  type PublicGuideChapter,
} from "@camp404/core";
import type { DutyCard } from "@camp404/types";

// The chapters the guide app serves under E2E_TEST_MODE=1 (Playwright), in
// place of the database. They are RAW rows, as a published version is stored,
// with the switches that decide whether each is public; they reach the pages
// through the same rule (guideChapterIsPublic) and the same cut
// (toPublicChapter) as the database's rows do. So the canary below, inside a
// members-only part, proves the cut on every page the e2e loads: break
// publicMarkdown and tests/e2e/guide.spec.ts goes red.

/** Written only inside members-only parts and private chapters. */
export const CANARY = "CANARY-7f3a91";

interface FixtureRow {
  slug: string;
  title: string;
  category: string;
  team: string | null;
  kind: "chapter" | "duty_card";
  markdown: string;
  card: DutyCard | null;
  version: number;
  publishedAt: Date;
  cycleReviewed: number | null;
  published: boolean;
  membersOnly: boolean;
}

const PUBLIC_SECTIONS = new Set(["before_you_come", "on_site", "kitchen"]);

const at = (iso: string) => new Date(`${iso}T10:00:00+02:00`);

const TANKWA = `The drive is part of the burn. It is also where most of our camp's broken weekends start: a cut tyre, a trailer that sways, a car that runs dry an hour from anywhere. Most of it is avoidable.

## Tickets and passes

Every person in the car needs their own ticket, and every car needs a vehicle pass. Both live in your AfrikaBurn account; download them before you leave Cape Town, because there is no signal for the last two hours of the drive. AfrikaBurn's own [Survival Guide](https://www.afrikaburn.org/survival-guide/) has the gate's full list.

- **Ticket**: one per person, on your phone or printed.
- **Vehicle pass**: one per car. A trailer does not need its own.
- **ID**: the gate matches your ticket to it.

## Car checks before you leave

Do these the weekend before, not the morning of. A tyre shop closes at one on a Saturday.

1. Two spare tyres if you can, one at the very least, and the jack that fits your car. Try the jack once at home.
2. Oil, coolant and brake fluid at the full mark.
3. A full tank at Ceres. After that, plan as if there is no more fuel until you are home.
4. Water in the car for everyone in it: five litres each for the road alone.

> **If you break down,** stay with the car, put the hazards on, and wait. Someone always comes along the road; it is busy all week.

:::members
## The convoy plan

${CANARY} We leave together on the Tuesday: meet at the fuel station in Ceres at 07:00. The convoy lead drives last and carries the camp's spare tyre and the radio; channel 3 is ours.
:::

## The dirt road

The last stretch is a long gravel road. It is wide and looks easy, and that is the trap: the corrugations and the sharp stones cut tyres at speed. Keep under 60 km/h, give the car in front room for its dust, and slow right down when a car comes the other way.

Most of us let a little air out of the tyres for the gravel. Ask your tyre shop what suits your car and load, and pump them up again on the tar on the way home.

## Towing a trailer

Heavy things go low and over the axle; nothing heavy at the back. Strap every load twice, and check the straps at the first stop: gravel loosens them in the first half hour.

- Trailer tyres need the same checks as the car's, and a spare of their own.
- Lights and number plate clean before the gate: the gate checks them.
- Drive slower than you think: a trailer that sways on gravel does not come back.

## Arriving at camp

Drive in at walking pace once you are past the gate, with your lights on. Park where the build lead points, not where it looks free: the layout is drawn before anyone arrives, and a car in the wrong place blocks a structure.

Unload your own things first, then help with the camp's. Read the [sleeping area](/guide/the-sleeping-area) chapter before you put up a tent.`;

const EVENING: DutyCard = {
  subRoles: [
    { name: "Dishes", min: 2, max: 3 },
    { name: "Surfaces and floor", min: 1, max: 2 },
    { name: "Grey water", min: 1, max: 1 },
    { name: "Shift lead", min: 1, max: 1 },
  ],
  steps: [
    "Put the food away first: everything covered, labelled with today's date, into the fridge or the dry box.",
    "Scrape plates into the food-waste bucket, then wash up in the three tubs: wash, rinse, sanitise.",
    "Wipe every surface with the spray from the red bottle, and leave it to dry.",
    "Sweep the floor towards the door, and pick up anything that is not dust.",
    "Carry the grey-water tub to the evaporation pond. Strain it first.",
    "Close both fridge lids and check the latch.",
  ],
  hardRules: [
    "Never pour grey water on the ground or into the burn barrel.",
    "Never leave food out overnight: it brings flies by eight in the morning.",
    "Gas off at the bottle, not only at the burner.",
  ],
  checklist: [
    "Fridge lids latched",
    "Gas off at the bottle",
    "Grey-water tub empty and upside down",
    "Bins closed, lids weighted",
    "Lights off except the path light",
  ],
  askRole: "the Kitchen lead",
};

const ROWS: FixtureRow[] = [
  {
    slug: "getting-to-the-tankwa",
    title: "Getting to the Tankwa",
    category: "before_you_come",
    team: null,
    kind: "chapter",
    markdown: TANKWA,
    card: null,
    version: 6,
    publishedAt: at("2026-09-28"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: false,
  },
  {
    slug: "packing-list",
    title: "Packing list",
    category: "before_you_come",
    team: null,
    kind: "chapter",
    markdown:
      "Pack for heat in the day, cold at night, and dust always.\n\n- A hat\n- Goggles\n- A warm jacket",
    card: null,
    version: 3,
    publishedAt: at("2026-09-21"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: false,
  },
  {
    slug: "the-sleeping-area",
    title: "The sleeping area",
    category: "on_site",
    team: null,
    kind: "chapter",
    markdown: "Quiet hours run from two in the afternoon until five.",
    card: null,
    version: 2,
    publishedAt: at("2026-09-21"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: false,
  },
  {
    slug: "power-etiquette",
    title: "Power etiquette",
    category: "on_site",
    team: "power_and_lighting",
    kind: "chapter",
    markdown:
      "The generator is shared. Ask before you plug in anything that heats.",
    card: null,
    version: 1,
    publishedAt: at("2026-09-30"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: false,
  },
  {
    slug: "evening-clean-up",
    title: "Evening clean-up",
    category: "kitchen",
    team: "kitchen",
    kind: "duty_card",
    markdown:
      "The sanitiser is one capful in the third tub. Change all three tubs when the rinse water goes cloudy.",
    card: EVENING,
    version: 4,
    publishedAt: at("2026-10-02"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: false,
  },
  // Kept members only inside a public section.
  {
    slug: "kitchen-and-fridge-rules",
    title: "Kitchen and fridge rules",
    category: "kitchen",
    team: "kitchen",
    kind: "chapter",
    markdown: `${CANARY} The fridge code is on the door.`,
    card: null,
    version: 2,
    publishedAt: at("2026-09-28"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: true,
  },
  // In a private section.
  {
    slug: "medical-plan",
    title: "Medical plan",
    category: "safety",
    team: null,
    kind: "chapter",
    markdown: `${CANARY} The medic's tent is by the gate.`,
    card: null,
    version: 1,
    publishedAt: at("2026-09-21"),
    cycleReviewed: 2027,
    published: true,
    membersOnly: false,
  },
  // Taken off the guide.
  {
    slug: "old-gate-times",
    title: "Old gate times",
    category: "before_you_come",
    team: null,
    kind: "chapter",
    markdown: `${CANARY} The gate opens at six.`,
    card: null,
    version: 1,
    publishedAt: at("2026-09-01"),
    cycleReviewed: 2026,
    published: false,
    membersOnly: false,
  },
];

/** The fixture chapters the public may read, cut as the database's are. */
export function fixturePublicChapters(): PublicGuideChapter[] {
  return ROWS.filter((row) =>
    guideChapterIsPublic({
      published: row.published,
      sectionPublic: PUBLIC_SECTIONS.has(row.category),
      membersOnly: row.membersOnly,
    }),
  )
    .map(toPublicChapter)
    .filter((c): c is PublicGuideChapter => c !== null);
}

export const FIXTURE_TEAM_LABELS: Readonly<Record<string, string>> = {
  kitchen: "Kitchen",
  power_and_lighting: "Power",
};
