import { z } from "zod";
import { Currency } from "./money";

// join.camp-404.com's words, one document per burn year (join_site_content).
// Captains edit it section by section in the app; the join site reads it.
// DEFAULT_JOIN_CONTENT is the copy the owner approved in PR #283, so a year
// with no saved row reads exactly as the site did before it was editable.
// Year-dependent words (the year itself, the Burn's dates) are not here: the
// site takes them from the camp's year in Camp settings.

const Line = z.string().trim().min(1, "Write something here.").max(600);
const Lines = z.array(Line).max(20);
const Short = z.string().trim().min(1, "Write something here.").max(120);

export const GIFT_ICONS = [
  "orphanage",
  "breakfast",
  "lounge",
  "meow",
  "flames",
  "art",
] as const;
export const GiftIcon = z.enum(GIFT_ICONS);
export type GiftIcon = z.infer<typeof GiftIcon>;

export const JoinGift = z.object({
  icon: GiftIcon,
  name: Short,
  text: Line,
});
export type JoinGift = z.infer<typeof JoinGift>;

export const JoinScheduleEntry = z.object({
  when: Short,
  what: Line,
  allHands: z.boolean().optional(),
});
export type JoinScheduleEntry = z.infer<typeof JoinScheduleEntry>;

/** Whole rands, as every money figure in the camp. */
const Rands = z.number().int().min(0).max(10_000_000);

export const JoinFeeTier = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  name: Short,
  rands: Rands,
  note: Line.optional(),
});
export type JoinFeeTier = z.infer<typeof JoinFeeTier>;

export const JoinSections = {
  readme: z.object({
    heading: Short,
    paragraphs: Lines,
    warning: Line,
    quote: Line,
    steps: Lines,
  }),
  teams: z.object({
    intro: Line,
    outro: Lines,
  }),
  gifts: z.object({
    intro: Line,
    primary: z.array(JoinGift).max(8),
    secondary: z.array(JoinGift).max(8),
  }),
  map: z.object({
    where: Short,
    lines: Lines,
  }),
  crew: z
    .object({
      /** The camp runs from `min` people and has room for `max`. */
      capacity: z.object({
        min: z.number().int().min(1).max(500),
        max: z.number().int().min(1).max(500),
      }),
      counting: Line,
    })
    .refine((c) => c.capacity.min <= c.capacity.max, {
      message: "The minimum cannot be more than the full camp.",
      path: ["capacity", "min"],
    }),
  schedule: z.object({
    datesNote: Line,
    before: z.array(JoinScheduleEntry).max(20),
    onSite: z.array(JoinScheduleEntry).max(20),
    after: z.array(JoinScheduleEntry).max(20),
    shiftsIntro: Line,
    shifts: Lines,
    proactive: Line,
  }),
  fee: z.object({
    currency: Currency,
    /** A dollar label's rate, as a captain typed it. Never a stored amount. */
    usdRate: z.object({
      randsPerDollar: z.number().positive().max(1000),
      asOf: Short,
    }),
    tiers: z.array(JoinFeeTier).min(1).max(8),
    subsidy: z.object({ name: Short, note: Line }),
    scaleIntro: Line,
    tentFee: Short,
    intro: Line,
    spend: z.array(z.object({ what: Short, rands: Rands })).max(12),
    spendNote: Line,
    guidance: Line,
    quote: Line,
  }),
  perks: z.object({
    summary: Lines,
    files: z
      .array(
        z.object({
          file: z
            .string()
            .trim()
            .regex(/^[A-Z0-9_]{1,12}\.[A-Z0-9]{1,4}$/, "Like LOUNGE.TXT."),
          name: Short,
          paragraphs: Lines,
        }),
      )
      .max(8),
  }),
  truck: z.object({ entries: Lines }),
  apply: z.object({ body: Line, invite: Short, button: Short }),
} as const;

export type JoinSectionKey = keyof typeof JoinSections;
export const JOIN_SECTION_KEYS = Object.keys(JoinSections) as JoinSectionKey[];

export const JoinSiteContent = z.object(JoinSections);
export type JoinSiteContent = z.infer<typeof JoinSiteContent>;
export type JoinSection<K extends JoinSectionKey> = JoinSiteContent[K];

export const DEFAULT_JOIN_CONTENT: JoinSiteContent = {
  readme: {
    heading: "Camp 404 is a place for the lost.",
    paragraphs: [
      "As a theme camp we provide a public space, a public service, a functional part of Tankwa Town: dedicated infrastructure for the gifting economy.",
      "Camp 404 will always be a place for the lost. Weary burners who need a rest, or real emergencies, like people having trouble in their camp who need a place to stay.",
      "Our mission is to help people suspend their disbelief and share our idea of fun. We're a wacky bunch of misfits who love nonsense and shenanigans: games, tomfoolery, the bizarre and the hilarious.",
    ],
    warning:
      "Camp 404 is not appropriate for children, or for adults who don't act like children.",
    quote:
      "Camp 404 is the lost clutter of imagination. A place of uncertainty. Where are we? What's going on? How did we get here? Why did we get here? It's in our blanket fort of opportunity that we embrace the Error Codes of life so that we can explore all of our lost expressions and confused intentions. We create safety, comfort and acceptance - for everyone and everything.",
    steps: [
      "Get an invite code from someone in Camp 404.",
      "Sign up in the Camp 404 app and enter your code.",
      "Answer a few questions, pay your camp fee and join the team(s) you want to work with.",
    ],
  },
  teams: {
    intro:
      "Teams conceptualise, organise, build and run a public space. Every member joins at least one team.",
    outro: [
      "Prep takes MONTHS; the final weeks are the most intense. In the desert EVERYONE builds and packs up, and EVERYONE does shift work.",
      "You get out what you put in. If that's too much, that's okay: you don't have to join a theme camp to go to AfrikaBurn.",
    ],
  },
  gifts: {
    intro: "What Camp 404 gives to Tankwa Town.",
    primary: [
      {
        icon: "orphanage",
        name: "The orphanage",
        text: "A home for stray Burners in need of care.",
      },
      {
        icon: "breakfast",
        name: "Daily vegan breakfast",
        text: "Public breakfast every day, and snacks in the lounge.",
      },
      {
        icon: "lounge",
        name: "The lounge",
        text: "Comfort and entertainment: a safe space to rest, relax, connect and have fun.",
      },
      {
        icon: "flames",
        name: "Dance of 1000 Flames",
        text: "The main fire performance of the Burn. We manage and coordinate it.",
      },
    ],
    secondary: [
      {
        icon: "meow",
        name: "Now Now Meow Meow",
        text: "Our Mutant Vehicle, by Kyle & Robyn.",
      },
      {
        icon: "art",
        name: "Artworks & activities",
        text: "Something big and burnable, and always space for more: slam poetry, carrot readings, How to be a Duck workshops.",
      },
    ],
  },
  map: {
    where: "Block 3/4-ish · Street A",
    lines: [
      "We're on the 3ish/4ish block, on Street A.",
      "A row of toilets directly behind us.",
      "A semi-loud area, but the back (sleeping) borders a sand dune.",
      "Not a sound camp. The lounge sound points away from sleeping, with a long distance between.",
      "Bring earplugs or noise-cancelling headphones anyway.",
    ],
  },
  crew: {
    capacity: { min: 30, max: 50 },
    counting: "Counting starts when members answer. You could be one of them.",
  },
  schedule: {
    datesNote:
      "Below is how the 2026 Burn ran; our own dates are to be confirmed.",
    before: [
      { when: "Nov / Dec", what: "Kick-off, about six months out." },
      {
        when: "Months before",
        what: "About one meeting per team per month. Cape Town craft, storage and hang-out days.",
      },
      {
        when: "Week before",
        what: "Final shopping. Packing the truck.",
        allHands: true,
      },
    ],
    onSite: [
      { when: "21 April", what: "Core crew sets up the stretch tents." },
      {
        when: "22–25 April",
        what: "Everyone arrives, no later than the Saturday.",
      },
      { when: "26 April", what: "Set-up day.", allHands: true },
      { when: "27 April", what: "The Burn starts." },
    ],
    after: [
      { when: "Sunday", what: "Prep for strike." },
      { when: "Monday", what: "Strike and pack.", allHands: true },
      { when: "Tuesday", what: "Final clear and MOOP sign-off." },
      {
        when: "Tuesday 5 May",
        what: "Unpack into storage in Cape Town.",
        allHands: true,
      },
    ],
    shiftsIntro: "During the Burn: rostered shifts, ideally 3–4 each.",
    shifts: [
      "Breakfast (~11) and dinner (~5): prep, cook, serve, refill water, the snack table.",
      "Kitchen cleaning after each meal: surfaces, dishes, bins, compost, and walking the duck (emptying the grey water).",
      "Ice collection with the camp card.",
      "MOOP: everyone, all the time.",
      "Generator (experienced only).",
    ],
    proactive:
      "BE PROACTIVE. Leave camp better than you found it, whether that's fixing some fairy lights, cleaning up a mess or staging a coup to overthrow the chef.",
  },
  fee: {
    currency: "ZAR",
    usdRate: { randsPerDollar: 16, asOf: "September 2026" },
    tiers: [
      { key: "essential", name: "Essential", rands: 3_500 },
      { key: "reasonable", name: "Reasonable", rands: 6_000 },
      {
        key: "ideal",
        name: "Ideal",
        rands: 8_000,
        note: "Where we hope most people can land.",
      },
      {
        key: "perfect",
        name: "Perfect World",
        rands: 16_000,
        note: "More helps subsidise the starving artists.",
      },
    ],
    subsidy: {
      name: "Subsidy",
      note: "South African, a student, or short on cash? Pay what you can: nothing is okay. Ask the Comms & HR team.",
    },
    scaleIntro:
      "A floating scale, not a fixed fee. Slide to see where you land.",
    tentFee: "TBC",
    intro:
      "Pay what you can afford. Paying doesn't make the camp appear: you still help build it.",
    spend: [
      { what: "Shade", rands: 100_000 },
      { what: "Kitchen: 2 vegan meals a day, snacks, water", rands: 50_000 },
      { what: "Transport & storage", rands: 100_000 },
      { what: "24/7 power & lights", rands: 10_000 },
      { what: "Decor", rands: 10_000 },
    ],
    spendNote: "Plus gifts and artworks. The finances are fully transparent.",
    guidance:
      "Start from what you'd spend on food for about 10 days, plus your usual camping basics (R2,000–R8,000). Or set your total Burn budget and fill it in: ticket, petrol, extras, gifts, then the camp fee.",
    quote:
      "A Burn usually costs me R5–10K… we have at least one person paying nothing, and at least two paying a lot. It's relative, it's flexible, it's up to you.",
  },
  perks: {
    summary: [
      "Two vegan meals a day (brunch and “lupper”) and snacks",
      "A full kitchen and braai",
      "Sheltered sleeping",
      "A public lounge",
      "A public service to give",
      "A dope AF team of absolute nonsense humans",
    ],
    files: [
      {
        file: "LOUNGE.TXT",
        name: "The lounge",
        paragraphs: [
          "Open 24/7 to anyone: hang out, nap, games, activities, mischief, vegan snacks.",
          "Not a sound or party camp. Downtempo, ambient, liquid, groovy tunes you CAN dance to but don't HAVE TO. The Ministry of Vibes makes the space.",
        ],
      },
      {
        file: "KITCHEN.TXT",
        name: "The kitchen",
        paragraphs: [
          "A stretch tent, two deep freezes, gas stoves, equipment, basics and a braai.",
          "Bring your own cutlery, bowl, plate and cup (cups with handles), a cooler box, coffee gear, drinks and personal snacks.",
          "A vegan kitchen. Animal products only on your own equipment or the fire, sealed properly in the freezers.",
        ],
      },
      {
        file: "SLEEPING.TXT",
        name: "Sleeping",
        paragraphs: [
          "A 20 × 30 m stretch tent over the camping area.",
          "Bring your own tent (or rent through 404), mattress, blankets for hot and cold, a pillow (or rent), shade cloth or a ground sheet to share, a doormat blanket and a tent light.",
        ],
      },
    ],
  },
  truck: {
    entries: [
      "One big truck carries the camp: infrastructure, furniture, freezers, gas, decor.",
      "A couple of trailers, towed by members' own cars, carry everything else.",
      "The Transport & Travel team makes sure everyone and everything has a ride.",
    ],
  },
  apply: {
    body: "Joining happens in the Camp 404 app. You need an invite code: ask someone in the camp for one.",
    invite: "[✓] YOU WILL NEED: AN INVITE CODE",
    button: "SIGN UP",
  },
};

/**
 * What each team does, by team key, from the Notion intro page (2026-09-25).
 * The join site shows the camp config's own description first; these fill the
 * gap until a captain writes one.
 */
export const DEFAULT_TEAM_DESCRIPTIONS: Readonly<Record<string, string>> = {
  communications_and_hr:
    "Applications, tickets, messaging, the flow of information.",
  finance: "Fees, budgeting, accounts.",
  structures: "Shade, flooring, furniture, sleeping gear rental.",
  health_and_safety: "First aid, extinguishers, Tankwa Town regulations.",
  kitchen: "Menu and recipes, equipment, shopping and storage, cooking shifts.",
  water: "Clean and grey water, plumbing, water shifts.",
  sanitation_and_water: "Cleaning, waste, MOOP shifts.",
  ministry_of_vibes: "Lounge decor and aesthetic.",
  ministry_of_memes:
    "Memetic influence in Tankwa Town, onboarding, camp culture.",
  power_and_lighting: "Generator and fuel, the grid, lights, genie shifts.",
  sound: "The lounge sound system and DJ gear.",
  art_and_activities:
    "Art, the lounge activity and DJ schedule, breakfast vibes.",
  mutant_vehicle: "Build, transport, running, garage.",
  transport_and_logistics: "Truck and trailer rental, packing, lifts.",
};

/**
 * Read a stored document: each section that fails its schema falls back to
 * the default on its own, so one bad section never blanks the whole site.
 */
export function resolveJoinContent(raw: unknown): JoinSiteContent {
  const stored =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_JOIN_CONTENT } as Record<string, unknown>;
  for (const key of JOIN_SECTION_KEYS) {
    const parsed = JoinSections[key].safeParse(stored[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as JoinSiteContent;
}
