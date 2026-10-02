import { ALLERGEN_LABELS, type FoodReactionEntry } from "@camp404/types";
import { PROGRAMME_DAY_START } from "./lounge";
import { shiftTimeText } from "./shifts";

// The daily site sheet (#249; the owner's layout, 2026-10-02: three columns,
// one section per team). Pure: no DB, no session, no next/*.
//
// THE OWNER'S RULINGS (2026-10-02). Each team manages its own usual daily
// tasks in Shifts (shift_types: team, name, start, length, places; a slot per
// day; sign-ups). The sheet puts one day's slots together, grouped by team:
// each row is the time, the task and the first names of who signed up, with a
// blank line for each open place and a done box. Only teams with a task that
// day get a section, and a team added later gets one by itself. No shift
// details on the sheet: they live on the duty cards. Kitchen's section adds
// the day's dishes (breakfast and dinner only, no plate counts) and the
// allergy line, with first names: the cooks act on them.

/** A shift type, as far as the sheet needs it. */
export interface SheetShiftType {
  id: string;
  team: string;
  name: string;
  startMinute: number;
  durationMinutes: number;
  places: number;
}

/** One day's slot of a shift type. "not_needed" slots are left off. */
export interface SheetSlot {
  id: string;
  typeId: string;
  day: string;
  status: string;
}

/** Who is on a slot, in sign-up order. */
export interface SheetSignup {
  slotId: string;
  userId: string;
}

/** One task line on the sheet. */
export interface SheetTask {
  slotId: string;
  /** "08:00–10:00" */
  timeText: string;
  name: string;
  /** First names of who signed up, in sign-up order. */
  names: string[];
  /** Open places, each a blank line to write a name on. */
  blanks: number;
}

/** One team's section: its tasks that day, in time order. */
export interface SheetTeamSection {
  team: string;
  label: string;
  tasks: SheetTask[];
}

/**
 * One day's tasks grouped by team, in the camp's team order (`teams`, as Camp
 * settings lists them); a team the order does not name (one added later, or
 * archived) comes after, by its key. Only teams with a needed task that day
 * appear, and the teams in `include` (the Kitchen on a day with a menu).
 * Within a team, by start time from 06:00 (a midnight watch comes last);
 * two at the same time keep the roster's order. `nameOf` gives each member's name as the sheet prints it.
 */
export function groupSlotsByTeam(input: {
  day: string;
  types: readonly SheetShiftType[];
  slots: readonly SheetSlot[];
  signups: readonly SheetSignup[];
  teams: readonly { key: string; label: string }[];
  nameOf: (userId: string) => string;
  include?: readonly string[];
}): SheetTeamSection[] {
  const types = new Map(input.types.map((t) => [t.id, t]));
  const byTeam = new Map<
    string,
    { task: SheetTask; start: number; order: number }[]
  >();
  input.slots.forEach((slot, order) => {
    if (slot.day !== input.day || slot.status !== "open") return;
    const type = types.get(slot.typeId);
    if (!type) return;
    const names = input.signups
      .filter((s) => s.slotId === slot.id)
      .map((s) => input.nameOf(s.userId));
    const list = byTeam.get(type.team) ?? [];
    list.push({
      task: {
        slotId: slot.id,
        timeText: shiftTimeText(type.startMinute, type.durationMinutes),
        name: type.name,
        names,
        blanks: Math.max(0, type.places - names.length),
      },
      // The camp's day runs from 06:00 (as the lounge programme's): a night
      // watch from midnight is the end of the day, not its start.
      start:
        type.startMinute < PROGRAMME_DAY_START
          ? type.startMinute + 24 * 60
          : type.startMinute,
      order: input.types.indexOf(type) * 10_000 + order,
    });
    byTeam.set(type.team, list);
  });

  for (const team of input.include ?? []) {
    if (!byTeam.has(team)) byTeam.set(team, []);
  }

  const rank = new Map(input.teams.map((t, i) => [t.key, i]));
  const labels = new Map(input.teams.map((t) => [t.key, t.label]));
  return [...byTeam.entries()]
    .sort(([a], [b]) => {
      const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.localeCompare(b);
    })
    .map(([team, rows]) => ({
      team,
      label: labels.get(team) ?? teamWords(team),
      tasks: rows
        .sort((a, b) => a.start - b.start || a.order - b.order)
        .map((r) => r.task),
    }));
}

/** A team key as words, for a team the camp's settings do not name. */
function teamWords(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  if (!words) return "Team";
  const [head, ...rest] = [...words];
  return head!.toUpperCase() + rest.join("");
}

// --- Names --------------------------------------------------------------------

/** The name a member is printed with when nothing else is known. */
export const SHEET_UNNAMED = "Camp member";

/** The first word of a display name; an email or no name is "Camp member". */
export function firstNameOf(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed || trimmed.includes("@") || trimmed === "Unnamed member") {
    return SHEET_UNNAMED;
  }
  return trimmed.split(/\s+/)[0]!;
}

/**
 * The name each member prints with on the sheet: the first name only (owner,
 * 2026-10-02), and a surname initial only where two different people share a
 * first name, so the two can be told apart (the print rule in the shell).
 * Nothing else about anyone.
 */
export function sheetNames(
  people: readonly { userId: string; name: string | null }[],
): Map<string, string> {
  const unique = new Map<string, string | null>();
  for (const p of people)
    if (!unique.has(p.userId)) unique.set(p.userId, p.name);
  const firstCount = new Map<string, number>();
  for (const name of unique.values()) {
    const first = firstNameOf(name);
    firstCount.set(first, (firstCount.get(first) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const [userId, name] of unique) {
    const first = firstNameOf(name);
    if (first === SHEET_UNNAMED || (firstCount.get(first) ?? 0) < 2) {
      out.set(userId, first);
      continue;
    }
    const words = (name ?? "").trim().split(/\s+/);
    const last = words.length > 1 ? words.at(-1)! : "";
    out.set(userId, last ? `${first} ${[...last][0]!.toUpperCase()}.` : first);
  }
  return out;
}

// --- Kitchen -------------------------------------------------------------------

/** A member's allergy facts (SAFETY_VISIBLE: team lead and up). */
export interface SheetAllergyFact {
  userId: string;
  allergies: string | null;
  isAnaphylactic: boolean;
  /**
   * The foods picked on the dietary pick-list (#245), when the member has
   * saved it: then they replace the old form's words. Null or absent: only
   * the old form's words are known.
   */
  foods?: readonly FoodReactionEntry[] | null;
}

/** One allergy and who has it, by first name. */
export interface SheetAllergy {
  /** As the first member who has it typed it; "Severe allergy" with no words. */
  text: string;
  severe: boolean;
  names: string[];
}

/**
 * The Kitchen's allergy line: each allergy once (the same words, any case),
 * with the first names of who has it. A severe (anaphylactic) allergy is its
 * own entry and comes first. A member with neither words nor the severe flag
 * is left off.
 */
export function allergyGroups(
  facts: readonly SheetAllergyFact[],
  nameOf: (userId: string) => string,
): SheetAllergy[] {
  const groups = new Map<string, SheetAllergy>();
  const add = (userId: string, text: string, severe: boolean) => {
    const key = `${severe ? 1 : 0}:${text.toLowerCase()}`;
    const group = groups.get(key) ?? { text, severe, names: [] };
    const name = nameOf(userId);
    if (!group.names.includes(name)) group.names.push(name);
    groups.set(key, group);
  };
  for (const f of facts) {
    if (f.foods) {
      // The pick-list: one entry per food someone is allergic to; an
      // intolerance is not an allergy and stays off this line.
      for (const { food, reaction } of f.foods) {
        if (reaction === "intolerance") continue;
        add(f.userId, ALLERGEN_LABELS[food], reaction === "anaphylaxis");
      }
      continue;
    }
    const words = (f.allergies ?? "").trim().replace(/\s+/g, " ");
    if (!words && !f.isAnaphylactic) continue;
    add(f.userId, words || "Severe allergy", f.isAnaphylactic);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.severe) - Number(a.severe) ||
      a.text.localeCompare(b.text, "en", { sensitivity: "base" }),
  );
}

/** The meals the sheet lists: the camp does no lunch (owner, 2026-10-01). */
export const SHEET_MEALS = ["breakfast", "dinner"] as const;
export type SheetMeal = (typeof SHEET_MEALS)[number];

/**
 * The meal plan's day number for a calendar day: day 1 is the plan's first
 * day on site. Null with no first day set, or a day outside the plan.
 */
export function mealPlanDayOf(
  day: string,
  firstDay: string | null,
  daysOnSite: number,
): number | null {
  if (!firstDay) return null;
  const a = Date.parse(`${firstDay}T00:00:00Z`);
  const b = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const n = Math.round((b - a) / 86_400_000) + 1;
  return n >= 1 && n <= daysOnSite ? n : null;
}

/**
 * The dishes on each meal of a meal-plan day, in the menu's order: the
 * recipe titles only (no plate counts on the sheet).
 */
export function dishesFor(
  planDay: number | null,
  items: readonly {
    day: number;
    meal: string;
    position: number;
    recipeId: string;
  }[],
  titleOf: (recipeId: string) => string | null,
): { meal: SheetMeal; dishes: string[] }[] {
  if (planDay === null) return [];
  return SHEET_MEALS.map((meal) => ({
    meal,
    dishes: items
      .filter((i) => i.day === planDay && i.meal === meal)
      .sort((a, b) => a.position - b.position)
      .map((i) => titleOf(i.recipeId))
      .filter((t): t is string => !!t),
  })).filter((m) => m.dishes.length > 0);
}

/** How many blank rows the General page has to write on. */
export const GENERAL_ROWS = 20;
