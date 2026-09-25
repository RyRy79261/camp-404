// The site's own words: the boot screen, the desktop, the window labels, the
// headings around live data and INKBLOT.EXE. Everything a captain edits (each
// window's copy, the teams, the fee, the Burn's dates, the captains) comes
// from the camp's database instead: lib/join-data.ts, edited in the app at
// Captains → Join site (owner, 2026-09-25).

// Joining happens in the main app, never a Google Form (owner, 2026-09-25):
// sign up, then enter an invite code.
export const SIGNUP_URL = "https://camp-404.com/auth/sign-up";

export function bootLines(year: number): readonly string[] {
  return [
    "CAMP 404 OS v4.0.4",
    `TANKWA TOWN BUILD ${year}`,
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
}

export const BOOT_ERROR = "ERROR 404: YOU ARE HERE";

export const DESKTOP = {
  wordmark: "CAMP 404",
  tagline: (year: number) => `VERSION ${year} — A PLACE FOR THE LOST`,
  footer: [
    "© CAMP 404. A THEME CAMP AT AFRIKABURN, TANKWA TOWN.",
    "THIS INTERFACE IS PART OF THE BLANKET FORT OF OPPORTUNITY.",
    "UNAUTHORISED FUN, TOMFOOLERY OR COUPS AGAINST THE CHEF ARE ENCOURAGED.",
  ],
  location: "Tankwa Town · AfrikaBurn",
  reboot: "[REBOOT]",
} as const;

/** Headings around CREW.DB's live data. */
export const CREW_LABELS = {
  captainsHeading: (year: number) => `This year's captains (${year})`,
  headcountHeading: (year: number) => `Who's coming (${year})`,
  headcountSource:
    "Counted from the “Coming this year?” question in the Camp 404 app.",
  noCaptains: "Captains for this year are still being herded.",
  minLabel: "Minimum to run",
  maxLabel: "Full camp",
} as const;

export const APPLY_HEADING = (year: number) =>
  `REQUEST ACCESS TO CAMP 404 (${year})`;

/** The calculator's lines in FEE.CALC; a tool, not copy captains edit. */
export const BUDGET_LINES = [
  { key: "ticket", label: "Ticket", hint: "Your AfrikaBurn ticket" },
  { key: "travel", label: "Petrol & travel", hint: "Getting to Tankwa" },
  { key: "extras", label: "Extras", hint: "Drinks, treats, your own snacks" },
  { key: "gifts", label: "Gifts", hint: "Things you'll give away" },
] as const;

export const INKBLOT = {
  title: "INKBLOT.EXE",
  password: "jinn-is-best",
  unlocked: [
    "ACCESS GRANTED. Jinn is, in fact, best.",
    "Launching INKBLOT.EXE…",
  ],
  tagline: "You are a black cat. Everything on every surface must go.",
  controls: "← → move · ↑ or Space jump · ↓ hop down · X swipe · R restart",
  touch: "Use the buttons below to move, jump and swipe.",
  start: "Press any key or tap to start",
  winTitle: "GOODEST BOI",
  winLine: "Everything is on the floor.",
  boardNote: "Scores live in this browser only.",
  againButton: "Knock it all over again",
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
