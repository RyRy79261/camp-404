// Every word join.camp-404.com shows lives in this file, so next year's site
// is a one-file edit. Source: the Notion page "Intro to Camp 404", fetched
// 2026-09-25 (docs/join-site-brief.md), corrected by the owner the same day.
// Later, the main app's camp settings will drive some of this (owner,
// 2026-09-25; how is decided after this site is done). Until then it is
// plain constants, kept simple so each one can become a setting.

// Joining happens in the main app, never a Google Form (owner, 2026-09-25):
// sign up, then enter an invite code.
export const SIGNUP_URL = "https://camp-404.com/auth/sign-up";

// [CORRECTION 2026-09-25] The Notion page was written for the 2026 Burn,
// which is past. The owner chose to say 2027 and mark its dates TBC.
export const BURN_YEAR = 2027;

export const BOOT_LINES: readonly string[] = [
  "CAMP 404 OS v4.0.4",
  `TANKWA TOWN BUILD ${BURN_YEAR}`,
  "(C) A WACKY BUNCH OF MISFITS. NO RIGHTS RESERVED.",
  "",
  "CPU: 1x UNICYCLE-POWERED CORE ........ OK",
  "DUST FILTER .......................... CLOGGED",
  "VEGAN BREAKFAST DAEMON ............... OK",
  "LOUNGE CUSHIONS ...................... 404 FOUND",
  "MEMORY CHECK ......................... LOST",
  "LOCATING USER ........................ LOST",
  "",
];

export const BOOT_ERROR = "ERROR 404: YOU ARE HERE";

export const DESKTOP = {
  wordmark: "CAMP 404",
  tagline: `VERSION ${BURN_YEAR} — A PLACE FOR THE LOST`,
  footer: [
    "© CAMP 404. A THEME CAMP AT AFRIKABURN, TANKWA TOWN.",
    "THIS INTERFACE IS PART OF THE BLANKET FORT OF OPPORTUNITY.",
    "UNAUTHORISED FUN, TOMFOOLERY OR COUPS AGAINST THE CHEF ARE ENCOURAGED.",
  ],
  location: "Tankwa Town · AfrikaBurn",
  reboot: "[REBOOT]",
} as const;

export const README = {
  title: "README.TXT",
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
} as const;

export type TeamIcon =
  | "comms"
  | "finance"
  | "structures"
  | "safety"
  | "kitchen"
  | "water"
  | "sanitation"
  | "vibes"
  | "memes"
  | "power"
  | "art"
  | "mutant"
  | "transport";

export type Team = {
  /** Which pixel icon the TEAMS/ folder draws for it. */
  icon: TeamIcon;
  /** File name in the TEAMS/ folder, also what `ls teams` prints. */
  file: string;
  name: string;
  does: string;
  isNew?: boolean;
};

export const TEAMS_INTRO =
  "Teams conceptualise, organise, build and run a public space. Every member joins at least one team.";

export const TEAMS_OUTRO = [
  "Prep takes MONTHS; the final weeks are the most intense. In the desert EVERYONE builds and packs up, and EVERYONE does shift work.",
  "You get out what you put in. If that's too much, that's okay: you don't have to join a theme camp to go to AfrikaBurn.",
] as const;

export const TEAMS: readonly Team[] = [
  {
    icon: "comms",
    file: "COMMS_HR.TXT",
    name: "Communications & HR",
    does: "Applications, tickets, messaging, the flow of information.",
  },
  {
    icon: "finance",
    file: "FINANCE.XLS",
    name: "Finance",
    does: "Fees, budgeting, accounts.",
  },
  {
    icon: "structures",
    file: "STRUCTURES.DWG",
    name: "Structures",
    does: "Shade, flooring, furniture, sleeping gear rental.",
  },
  {
    icon: "safety",
    file: "SAFETY.SYS",
    name: "Safety",
    does: "First aid, extinguishers, Tankwa Town regulations.",
  },
  {
    icon: "kitchen",
    file: "KITCHEN.EXE",
    name: "Kitchen",
    does: "Menu and recipes, equipment, shopping and storage, cooking shifts.",
  },
  {
    icon: "water",
    file: "WATER.H2O",
    name: "Water",
    does: "Clean and grey water, plumbing, water shifts.",
  },
  {
    icon: "sanitation",
    file: "SANITATION.BAT",
    name: "Sanitation & MOOP",
    does: "Cleaning, waste, MOOP shifts.",
  },
  {
    icon: "vibes",
    file: "VIBES.CFG",
    name: "Ministry of Vibes",
    does: "Lounge decor and aesthetic.",
  },
  {
    icon: "memes",
    file: "MEMES.GIF",
    name: "Ministry of Memes",
    does: "Memetic influence in Tankwa Town, onboarding, camp culture.",
    isNew: true,
  },
  {
    icon: "power",
    file: "POWER.DRV",
    name: "Power, Lighting & Sound",
    does: "Generator and fuel, the grid, lights, DJ gear, genie shifts.",
  },
  {
    icon: "art",
    file: "ART.BMP",
    name: "Artworks & Activities",
    does: "Art, the lounge activity and DJ schedule, breakfast vibes.",
  },
  {
    icon: "mutant",
    file: "MUTANT.VEH",
    name: "Mutant Vehicle",
    does: "Build, transport, running, garage.",
  },
  {
    icon: "transport",
    file: "TRANSPORT.LOG",
    name: "Transport & Travel",
    does: "Truck and trailer rental, packing, lifts.",
  },
];

export type GiftIcon =
  | "orphanage"
  | "breakfast"
  | "lounge"
  | "meow"
  | "flames"
  | "art";
export type Gift = { icon: GiftIcon; name: string; text: string };

export const GIFTS = {
  title: "GIFTS.EXE",
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
  ] satisfies Gift[],
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
  ] satisfies Gift[],
} as const;

export const MAP = {
  title: "MAP.GPS",
  where: "Block 3/4-ish · Street A",
  lines: [
    "We're on the 3ish/4ish block, on Street A.",
    "A row of toilets directly behind us.",
    "A semi-loud area, but the back (sleeping) borders a sand dune.",
    "Not a sound camp. The lounge sound points away from sleeping, with a long distance between.",
    "Bring earplugs or noise-cancelling headphones anyway.",
  ],
} as const;

export type Captain = { name: string; role: string; bio: string };

/**
 * Where this year's members stand, from the app's "Coming this year?" answers
 * (camp_participations.status for the current burn year): accepted by a
 * captain, said Yes and waiting, or said Maybe. Each member counts once.
 * Counts only, never names. null until the main app feeds it (owner,
 * 2026-09-25: wired up once this site's presentation is settled).
 */
export type Headcount = { accepted: number; applied: number; maybe: number };

export const CREW = {
  title: "CREW.DB",
  captainsHeading: `This year's captains (${BURN_YEAR})`,
  headcountHeading: `Who's coming (${BURN_YEAR})`,
  headcountSource:
    "Counted from the “Coming this year?” question in the Camp 404 app.",
  counting: "Counting starts when members answer. You could be one of them.",
  minLabel: "Minimum to run",
  maxLabel: "Full camp",
  headcount: null as Headcount | null,
  // The owner's numbers, 2026-09-25: the camp runs from 30 and has room for 50.
  capacity: { min: 30, max: 50 },
  captains: [
    {
      name: "Ryan",
      role: "The Original Error Code",
      bio: "Consistently entropic, weaponised autism needing an excuse for unicycle powered productivity.",
    },
  ] satisfies Captain[],
} as const;

export type ScheduleEntry = { when: string; what: string; allHands?: boolean };

export const SCHEDULE = {
  title: "SCHEDULE.CAL",
  datesNote: `How the 2026 Burn ran. ${BURN_YEAR} dates to be confirmed.`,
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
  ] satisfies ScheduleEntry[],
  onSite: [
    { when: "21 April", what: "Core crew sets up the stretch tents." },
    {
      when: "22–25 April",
      what: "Everyone arrives, no later than the Saturday.",
    },
    { when: "26 April", what: "Set-up day.", allHands: true },
    { when: "27 April", what: "The Burn starts." },
  ] satisfies ScheduleEntry[],
  after: [
    { when: "Sunday", what: "Prep for strike." },
    { when: "Monday", what: "Strike and pack.", allHands: true },
    { when: "Tuesday", what: "Final clear and MOOP sign-off." },
    {
      when: "Tuesday 5 May",
      what: "Unpack into storage in Cape Town.",
      allHands: true,
    },
  ] satisfies ScheduleEntry[],
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
} as const;

export type BudgetLine = { key: string; label: string; hint: string };

export type FeeTier = {
  key: string;
  name: string;
  /** Whole rands. The dollar figure beside it is worked out, never stored. */
  rands: number;
  note?: string;
};

export const FEE = {
  title: "FEE.CALC",
  // The owner's sliding scale (2026-09-25): not a fixed fee. The owner set
  // the tiers in rands (R3,500 / R6,000 / R8,000 / R16,000, "the USD is
  // getting weaker"). The dollar figure is only a label, worked out at
  // `usdRate` ($1 = R16, the owner's) and rounded to $5. When the rate moves,
  // change `usdRate` alone. Later a camp setting in the main app sets it, as
  // the app's own foreign labels use a rate a captain typed.
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
  ] satisfies FeeTier[],
  subsidy: {
    name: "Subsidy",
    note: "South African, a student, or short on cash? Pay what you can: nothing is okay. Ask the Comms & HR team.",
  },
  scaleIntro: "A floating scale, not a fixed fee. Slide to see where you land.",
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
  calculator: [
    { key: "ticket", label: "Ticket", hint: "Your AfrikaBurn ticket" },
    { key: "travel", label: "Petrol & travel", hint: "Getting to Tankwa" },
    { key: "extras", label: "Extras", hint: "Drinks, treats, your own snacks" },
    { key: "gifts", label: "Gifts", hint: "Things you'll give away" },
  ] satisfies BudgetLine[],
} as const;

export const PERKS = {
  title: "PERKS/",
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
} as const;

export const TRUCK = {
  title: "TRUCK.LOG",
  entries: [
    "One big truck carries the camp: infrastructure, furniture, freezers, gas, decor.",
    "A couple of trailers, towed by members' own cars, carry everything else.",
    "The Transport & Travel team makes sure everyone and everything has a ride.",
  ],
} as const;

export const APPLY = {
  title: "APPLY.EXE",
  heading: `REQUEST ACCESS TO CAMP 404 (${BURN_YEAR})`,
  body: "Joining happens in the Camp 404 app. You need an invite code: ask someone in the camp for one.",
  invite: "[✓] YOU WILL NEED: AN INVITE CODE",
  button: "SIGN UP",
} as const;

/** Desktop icon labels, in desktop order. The label is also the window title. */
export const APP_LABELS = {
  readme: "README.TXT",
  teams: "TEAMS/",
  gifts: "GIFTS.EXE",
  map: "MAP.GPS",
  crew: "CREW.DB",
  schedule: "SCHEDULE.CAL",
  fee: "FEE.CALC",
  perks: "PERKS/",
  truck: "TRUCK.LOG",
  terminal: "TERMINAL",
  apply: "APPLY.EXE",
} as const;
