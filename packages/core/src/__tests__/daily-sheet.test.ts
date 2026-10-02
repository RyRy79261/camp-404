import { describe, expect, it } from "vitest";
import { TEAM_DEFAULT_LABELS, Team } from "@camp404/types";
import {
  GENERAL_ROWS,
  SHEET_UNNAMED,
  allergyGroups,
  dishesFor,
  firstNameOf,
  groupSlotsByTeam,
  mealPlanDayOf,
  sheetNames,
  type SheetShiftType,
  type SheetSlot,
} from "../daily-sheet";

// The daily site sheet (#249): one day's shift slots grouped by team, first
// names only, the Kitchen's dishes and allergy line.

const DAY = "2027-04-28";
const NEXT = "2027-04-29";
const TEAMS = Team.options.map((key) => ({
  key,
  label: TEAM_DEFAULT_LABELS[key],
}));

const type = (
  id: string,
  team: string,
  name: string,
  start: number,
  places = 2,
): SheetShiftType => ({
  id,
  team,
  name,
  startMinute: start,
  durationMinutes: 60,
  places,
});

const slot = (
  id: string,
  typeId: string,
  day = DAY,
  status = "open",
): SheetSlot => ({ id, typeId, day, status });

const names = new Map([
  ["u1", "Sipho"],
  ["u2", "Naledi"],
  ["u3", "Tumi"],
]);
const nameOf = (id: string) => names.get(id) ?? "?";

describe("groupSlotsByTeam", () => {
  const types = [
    type("t-gen", "power_and_lighting", "Generator watch", 6 * 60, 3),
    type("t-cook", "kitchen", "Dinner cooks", 17 * 60),
    type("t-bfast", "kitchen", "Breakfast cooks", 7 * 60),
    type("t-bins", "sanitation_and_water", "Bins", 15 * 60),
    type("t-new", "a_team_added_later", "Something new", 9 * 60, 1),
  ];

  it("puts each team's tasks for the day in its own section, in team order and time order", () => {
    const sections = groupSlotsByTeam({
      day: DAY,
      types,
      slots: [
        slot("s-cook", "t-cook"),
        slot("s-gen", "t-gen"),
        slot("s-bfast", "t-bfast"),
        slot("s-bins", "t-bins"),
        // Another day's slot is not on this day's sheet.
        slot("s-gen-next", "t-gen", NEXT),
      ],
      signups: [
        { slotId: "s-bfast", userId: "u1" },
        { slotId: "s-bfast", userId: "u2" },
        { slotId: "s-gen", userId: "u3" },
        { slotId: "s-gen-next", userId: "u1" },
      ],
      teams: TEAMS,
      nameOf,
    });
    expect(sections.map((s) => s.team)).toEqual([
      "kitchen",
      "power_and_lighting",
      "sanitation_and_water",
    ]);
    expect(sections.map((s) => s.label)).toEqual([
      "Kitchen",
      "Power and Lighting",
      "Sanitation and MOOP",
    ]);
    const kitchen = sections[0]!;
    expect(kitchen.tasks.map((t) => t.name)).toEqual([
      "Breakfast cooks",
      "Dinner cooks",
    ]);
    expect(kitchen.tasks[0]).toMatchObject({
      timeText: "07:00–08:00",
      names: ["Sipho", "Naledi"],
      blanks: 0,
    });
    // Nobody yet: two blank lines to write on.
    expect(kitchen.tasks[1]).toMatchObject({ names: [], blanks: 2 });
    const power = sections[1]!;
    expect(power.tasks).toHaveLength(1);
    expect(power.tasks[0]).toMatchObject({ names: ["Tumi"], blanks: 2 });
  });

  it("leaves off a day marked not needed, and a team with no task that day", () => {
    const sections = groupSlotsByTeam({
      day: DAY,
      types,
      slots: [
        slot("s-cook", "t-cook", DAY, "not_needed"),
        slot("s-bins", "t-bins"),
        slot("s-gen", "t-gen", NEXT),
      ],
      signups: [],
      teams: TEAMS,
      nameOf,
    });
    expect(sections.map((s) => s.team)).toEqual(["sanitation_and_water"]);
  });

  it("gives a team the settings do not name a section of its own, after the others", () => {
    const sections = groupSlotsByTeam({
      day: DAY,
      types,
      slots: [slot("s-new", "t-new"), slot("s-bins", "t-bins")],
      signups: [],
      teams: TEAMS,
      nameOf,
    });
    expect(sections.map((s) => [s.team, s.label])).toEqual([
      ["sanitation_and_water", "Sanitation and MOOP"],
      ["a_team_added_later", "A team added later"],
    ]);
  });

  it("runs the day from 06:00: a midnight watch is the day's last task", () => {
    const watches = [
      type("w0", "power_and_lighting", "Night watch", 0, 3),
      type("w6", "power_and_lighting", "Morning watch", 6 * 60, 3),
      type("w18", "power_and_lighting", "Evening watch", 18 * 60, 3),
    ];
    const [power] = groupSlotsByTeam({
      day: DAY,
      types: watches,
      slots: [slot("a", "w0"), slot("b", "w6"), slot("c", "w18")],
      signups: [],
      teams: TEAMS,
      nameOf,
    });
    expect(power!.tasks.map((t) => t.timeText)).toEqual([
      "06:00–07:00",
      "18:00–19:00",
      "00:00–01:00",
    ]);
  });

  it("includes a team asked for even with no task (the Kitchen on a menu day)", () => {
    const sections = groupSlotsByTeam({
      day: DAY,
      types,
      slots: [slot("s-bins", "t-bins")],
      signups: [],
      teams: TEAMS,
      nameOf,
      include: ["kitchen"],
    });
    expect(sections.map((s) => [s.team, s.tasks.length])).toEqual([
      ["kitchen", 0],
      ["sanitation_and_water", 1],
    ]);
  });

  it("follows the camp's own team order and labels", () => {
    const sections = groupSlotsByTeam({
      day: DAY,
      types,
      slots: [slot("s-bins", "t-bins"), slot("s-cook", "t-cook")],
      signups: [],
      teams: [
        { key: "sanitation_and_water", label: "MOOP crew" },
        { key: "kitchen", label: "Kitchen" },
      ],
      nameOf,
    });
    expect(sections.map((s) => s.label)).toEqual(["MOOP crew", "Kitchen"]);
  });
});

describe("names on the sheet", () => {
  it("prints the first name only", () => {
    expect(firstNameOf("Sipho Dlamini")).toBe("Sipho");
    expect(firstNameOf("  Naledi   van der Merwe ")).toBe("Naledi");
    expect(firstNameOf("someone@example.com")).toBe(SHEET_UNNAMED);
    expect(firstNameOf("")).toBe(SHEET_UNNAMED);
    expect(firstNameOf(null)).toBe(SHEET_UNNAMED);
  });

  it("adds a surname initial only when two people share a first name", () => {
    const map = sheetNames([
      { userId: "a", name: "Sam Mokoena" },
      { userId: "b", name: "Sam Pillay" },
      { userId: "c", name: "Kyle Jacobs" },
      // The same member twice is still one person.
      { userId: "c", name: "Kyle Jacobs" },
    ]);
    expect(map.get("a")).toBe("Sam M.");
    expect(map.get("b")).toBe("Sam P.");
    expect(map.get("c")).toBe("Kyle");
    // No surname is printed in full.
    for (const name of map.values()) {
      expect(name).not.toMatch(/Mokoena|Pillay|Jacobs/);
    }
  });

  it("takes a whole character for the initial, not half of one", () => {
    const map = sheetNames([
      { userId: "a", name: "Sam 𝒵ulu" },
      { userId: "b", name: "Sam Pillay" },
    ]);
    expect(map.get("a")).toBe("Sam 𝒵.");
  });
});

describe("allergyGroups", () => {
  const people = new Map([
    ["a", "Thandi"],
    ["b", "Kyle"],
    ["c", "Aisha"],
    ["d", "Megan"],
    ["e", "Ben"],
  ]);
  it("lists each allergy once with the first names of who has it, severe first", () => {
    const groups = allergyGroups(
      [
        { userId: "a", allergies: "No egg", isAnaphylactic: false },
        { userId: "b", allergies: " no  egg ", isAnaphylactic: false },
        { userId: "c", allergies: "Gluten free", isAnaphylactic: false },
        { userId: "d", allergies: "Nuts", isAnaphylactic: true },
        { userId: "e", allergies: null, isAnaphylactic: false },
      ],
      (id) => people.get(id) ?? "?",
    );
    expect(groups).toEqual([
      { text: "Nuts", severe: true, names: ["Megan"] },
      { text: "Gluten free", severe: false, names: ["Aisha"] },
      { text: "No egg", severe: false, names: ["Thandi", "Kyle"] },
    ]);
  });

  it("keeps a severe flag with no words", () => {
    expect(
      allergyGroups(
        [{ userId: "a", allergies: "  ", isAnaphylactic: true }],
        (id) => people.get(id) ?? "?",
      ),
    ).toEqual([{ text: "Severe allergy", severe: true, names: ["Thandi"] }]);
  });

  it("reads the dietary pick-list over the old words, one entry per food, intolerances left off", () => {
    expect(
      allergyGroups(
        [
          {
            userId: "a",
            allergies: "peanuts maybe",
            isAnaphylactic: false,
            foods: [
              { food: "peanuts", reaction: "anaphylaxis" },
              { food: "milk", reaction: "intolerance" },
              { food: "sesame", reaction: "allergy" },
            ],
          },
          {
            userId: "b",
            allergies: null,
            isAnaphylactic: false,
            foods: [{ food: "sesame", reaction: "allergy" }],
          },
          {
            userId: "c",
            allergies: "Shellfish",
            isAnaphylactic: false,
            foods: null,
          },
          { userId: "d", allergies: "Nuts", isAnaphylactic: true, foods: [] },
        ],
        (id) => people.get(id) ?? "?",
      ),
    ).toEqual([
      { text: "Peanuts", severe: true, names: ["Thandi"] },
      { text: "Sesame", severe: false, names: ["Thandi", "Kyle"] },
      { text: "Shellfish", severe: false, names: ["Aisha"] },
    ]);
  });
});

describe("the day's dishes", () => {
  it("finds the meal plan's day from its first day on site", () => {
    expect(mealPlanDayOf("2027-04-26", "2027-04-26", 11)).toBe(1);
    expect(mealPlanDayOf("2027-04-28", "2027-04-26", 11)).toBe(3);
    expect(mealPlanDayOf("2027-04-25", "2027-04-26", 11)).toBeNull();
    expect(mealPlanDayOf("2027-05-07", "2027-04-26", 11)).toBeNull();
    expect(mealPlanDayOf("2027-04-28", null, 11)).toBeNull();
  });

  it("lists breakfast and dinner dishes in menu order, never lunch", () => {
    const titles = new Map([
      ["r1", "Shakshuka"],
      ["r2", "Bobotie"],
      ["r3", "Yellow rice"],
      ["r4", "Sandwiches"],
    ]);
    const meals = dishesFor(
      3,
      [
        { day: 3, meal: "dinner", position: 2, recipeId: "r3" },
        { day: 3, meal: "dinner", position: 1, recipeId: "r2" },
        { day: 3, meal: "breakfast", position: 1, recipeId: "r1" },
        { day: 3, meal: "lunch", position: 1, recipeId: "r4" },
        { day: 4, meal: "breakfast", position: 1, recipeId: "r4" },
      ],
      (id) => titles.get(id) ?? null,
    );
    expect(meals).toEqual([
      { meal: "breakfast", dishes: ["Shakshuka"] },
      { meal: "dinner", dishes: ["Bobotie", "Yellow rice"] },
    ]);
    expect(dishesFor(null, [], () => null)).toEqual([]);
  });

  it("gives the General page about twenty rows", () => {
    expect(GENERAL_ROWS).toBe(20);
  });
});
