import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import type { ProgramId } from "../program-routes";
import { buildProgramManifest, type ProgramFacts } from "../programs";
import {
  GROUP_CAP,
  RECENT_MAX,
  RECENT_PREFIX_V1,
  filterPrograms,
  groupEntries,
  guideTextHref,
  isSearchShortcut,
  parseRecent,
  pushRecent,
  rankTitle,
  readRecent,
  recentRows,
  recentStorageKey,
  refKey,
  searchablePrograms,
  splitMarks,
  writeRecent,
  type RecentRef,
  type SearchEntry,
} from "../program-search";

// Ctrl+K program search (issue #326, step 1). Ranks and team keys come from
// the enums the code uses, and program ids are checked against ProgramId, so
// a fixture cannot sit outside the vocabulary (AGENTS.md, "Verification").

const MEMBER = ViewerRank.enum.camp_member;
const CAPTAIN = ViewerRank.enum.captain;
const KITCHEN = Team.enum.kitchen;
const pid = (id: ProgramId): string => id;

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: MEMBER,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

const memberList = () => searchablePrograms(buildProgramManifest(facts()));
const captainList = () =>
  searchablePrograms(buildProgramManifest(facts({ rank: CAPTAIN })));
const names = (hits: { program: { label: string } }[]) =>
  hits.map((h) => h.program.label);
const whereOf = (list: ReturnType<typeof memberList>, id: string) =>
  list.find((e) => e.program.id === id)?.where;

describe("searchablePrograms", () => {
  it("is every program the manifest lets the member open, once each", () => {
    const m = buildProgramManifest(facts());
    const list = searchablePrograms(m);
    const ids = list.map((e) => e.program.id);
    const opened = new Set([
      ...m.programs.map((p) => p.id),
      ...m.folders.flatMap((f) => f.programs.map((p) => p.id)),
    ]);
    expect(new Set(ids)).toEqual(opened);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("never offers a plain member a captain's program; a captain gets them", () => {
    const member = memberList().map((e) => e.program.id);
    // Present first: the member's own programs are there.
    expect(member).toContain(pid("power"));
    expect(member).toContain(pid("recipes"));
    for (const id of [
      pid("camp-settings"),
      pid("audit"),
      pid("overview"),
      pid("payments"),
    ]) {
      expect(member).not.toContain(id);
    }
    const captain = captainList().map((e) => e.program.id);
    expect(captain).toContain(pid("camp-settings"));
    expect(captain).toContain(pid("audit"));
  });

  it("names where each program lives: its folder, its team, else its group", () => {
    const list = captainList();
    expect(whereOf(list, pid("inbox"))).toBe("Me");
    expect(whereOf(list, pid("roster"))).toBe("Camp");
    expect(whereOf(list, pid("recipes"))).toBe("Kitchen");
    expect(whereOf(list, pid("camp-settings"))).toBe("Captains");
    // A team's own tool names the team, as camp settings call it.
    const power = DEFAULT_TEAMS.find(
      (t) => t.key === Team.enum.power_and_lighting,
    )!;
    expect(whereOf(list, pid("power"))).toBe(power.label);
    expect(whereOf(list, `team:${KITCHEN}`)).toBe("Teams");
  });
});

describe("filterPrograms", () => {
  it("matches anywhere in the name, ignoring case", () => {
    const hits = names(filterPrograms(memberList(), "PLAN"));
    expect(hits).toContain("Meal plan");
  });

  it("puts names that start with the text first, shorter first", () => {
    const hits = names(filterPrograms(memberList(), "pow"));
    expect(hits[0]).toBe("Power");
    expect(hits).toContain("Power and Lighting");
    // "po" is inside Transport; names that start with it come before.
    const po = names(filterPrograms(memberList(), "po"));
    expect(po.indexOf("Power")).toBeLessThan(po.indexOf("Transport"));
  });

  it("ranks a word's start before a match inside a word", () => {
    // "lay" starts a word in Camp layout; it is inside no other name first.
    const hits = filterPrograms(memberList(), "lay");
    expect(names(hits)[0]).toBe("Camp layout");
    expect(hits[0]!.marks).toEqual([{ start: 5, length: 3 }]);
  });

  it("finds nothing for empty text or a name nobody has", () => {
    expect(filterPrograms(memberList(), "  ")).toEqual([]);
    expect(filterPrograms(memberList(), "zzz")).toEqual([]);
    expect(filterPrograms(memberList(), "audit")).toEqual([]);
    expect(names(filterPrograms(captainList(), "audit"))).toEqual([
      "Audit log",
    ]);
  });

  it("needs every typed word", () => {
    expect(names(filterPrograms(memberList(), "meal plan"))).toEqual([
      "Meal plan",
    ]);
    expect(filterPrograms(memberList(), "meal zzz")).toEqual([]);
  });

  it("splits a name around its matches for the highlight", () => {
    const [hit] = filterPrograms(memberList(), "ower");
    expect(splitMarks(hit!.program.label, hit!.marks)).toEqual([
      { text: "P", hit: false },
      { text: "ower", hit: true },
    ]);
    expect(splitMarks("Inbox", [])).toEqual([{ text: "Inbox", hit: false }]);
  });
});

describe("rankTitle", () => {
  const rank = (title: string, q: string) => rankTitle(title, q)?.rank;

  it("orders the whole title, its start, a word's start, then anywhere", () => {
    expect(rank("Pot bread", "pot bread")).toBe(0);
    expect(rank("Pot bread", "pot")).toBe(1);
    expect(rank("Bring your own pot", "pot")).toBe(2);
    expect(rank("Spotty van Wyk", "pot")).toBe(3);
    expect(rank("Chakalaka", "pot")).toBeUndefined();
  });

  it("needs every word, in any order, and lights each", () => {
    const hit = rankTitle("Fuel cable reel, 50 m", "cab fuel");
    expect(hit?.rank).toBe(2);
    expect(hit?.marks).toEqual([
      { start: 0, length: 4 },
      { start: 5, length: 3 },
    ]);
    expect(rankTitle("Fuel can", "fuel cab")).toBeNull();
  });

  it("lights a word's start over an earlier match inside a word", () => {
    // "pot" is inside "Spotted" first, but starts the word "pots".
    expect(rankTitle("Spotted pots", "pot")?.marks).toEqual([
      { start: 8, length: 3 },
    ]);
  });
});

describe("groupEntries", () => {
  const entry = (
    kind: SearchEntry["kind"],
    title: string,
    id = title,
  ): SearchEntry => ({ kind, id, title, detail: "", href: `/${id}` });

  it("groups by kind, best row first, groups by their best row", () => {
    const groups = groupEntries(
      [
        entry("meeting", "Kitchen planning: pots"),
        entry("recipe", "Potato salad with mustard"),
        entry("recipe", "Pot bread"),
        entry("person", "Spotty van Wyk"),
        entry("recipe", "Potjiekos for 40"),
      ],
      "pot",
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Recipes",
      "Meetings",
      "People",
    ]);
    expect(groups[0]!.hits.map((h) => h.entry.title)).toEqual([
      "Pot bread",
      "Potjiekos for 40",
      "Potato salad with mustard",
    ]);
  });

  it("breaks a tie between groups by the kinds' fixed order", () => {
    const groups = groupEntries(
      [entry("person", "Pot person"), entry("chapter", "Pot chapter")],
      "pot",
    );
    expect(groups.map((g) => g.kind)).toEqual(["chapter", "person"]);
  });

  it("drops an earlier answer's rows the longer text no longer matches", () => {
    const groups = groupEntries(
      [entry("recipe", "Pot bread"), entry("recipe", "Potjiekos")],
      "potj",
    );
    expect(groups[0]!.hits.map((h) => h.entry.title)).toEqual(["Potjiekos"]);
  });

  it("shows a few a group before Show more", () => {
    expect(GROUP_CAP).toBe(3);
  });

  it("hands the words to the guide's own text search", () => {
    expect(guideTextHref(" pot & pan ")).toBe("/guide?q=pot%20%26%20pan");
  });
});

describe("Recent", () => {
  const program = (id: string): RecentRef => ({ kind: "program", id });

  it("moves the newest to the front and keeps a few", () => {
    let recent: RecentRef[] = [];
    for (const id of ["a", "b", "c", "a", "d", "e", "f", "g", "h", "i"]) {
      recent = pushRecent(recent, program(id));
    }
    expect(recent.map((r) => r.id)).toEqual([
      "i",
      "h",
      "g",
      "f",
      "e",
      "d",
      "a",
      "c",
    ]);
    expect(recent).toHaveLength(RECENT_MAX);
    // A program and an entry with the same id are two things.
    const mixed = pushRecent([program("x")], { kind: "recipe", id: "x" });
    expect(mixed.map(refKey)).toEqual(["recipe:x", "program:x"]);
  });

  it("reads anything malformed as none, and keeps no title", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(
      parseRecent(
        JSON.stringify([
          { kind: "program", id: "power" },
          { kind: "recipe", id: "r1", title: "Pot bread" },
          { kind: "spaceship", id: "x" },
          { kind: "program", id: "" },
          "inbox",
          { kind: "program", id: "power" },
        ]),
      ),
    ).toEqual([
      { kind: "program", id: "power" },
      { kind: "recipe", id: "r1" },
    ]);
  });

  it("shows only programs the member may still open, and entries the server returned", () => {
    const list = memberList();
    const found: SearchEntry = {
      kind: "recipe",
      id: "r1",
      title: "Pot bread",
      detail: "20 plates",
      href: "/kitchen/recipes/r1",
    };
    const rows = recentRows(
      list,
      [
        { kind: "recipe", id: "r1" },
        program(pid("camp-settings")),
        program(pid("power")),
        { kind: "recipe", id: "refused" },
        program("gone"),
      ],
      new Map([[refKey(found), found]]),
    );
    expect(
      rows.map((r) =>
        r.type === "program" ? r.program.program.id : r.entry.id,
      ),
    ).toEqual(["r1", pid("power")]);
  });

  it("is kept per member in this browser, ids only", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    writeRecent(storage, "u1", [
      program("power"),
      { kind: "recipe", id: "r1", title: "leak" } as RecentRef,
    ]);
    expect(readRecent(storage, "u1")).toEqual([
      program("power"),
      { kind: "recipe", id: "r1" },
    ]);
    expect(store.get(recentStorageKey("u1"))).not.toContain("leak");
    expect(readRecent(storage, "u2")).toEqual([]);
    expect([...store.keys()]).toEqual([recentStorageKey("u1")]);
    expect(readRecent(null, "u1")).toEqual([]);
  });

  it("moves step 1's program list over once", () => {
    const store = new Map<string, string>([
      [`${RECENT_PREFIX_V1}u1`, JSON.stringify(["power", "inbox"])],
    ]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    expect(readRecent(storage, "u1")).toEqual([
      program("power"),
      program("inbox"),
    ]);
    expect(store.has(`${RECENT_PREFIX_V1}u1`)).toBe(false);
    expect(JSON.parse(store.get(recentStorageKey("u1"))!)).toEqual([
      program("power"),
      program("inbox"),
    ]);
  });
});

describe("isSearchShortcut", () => {
  const key = (over: Partial<Parameters<typeof isSearchShortcut>[0]> = {}) => ({
    key: "k",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: document.body,
    ...over,
  });

  it("is Ctrl+K, or Cmd+K on a Mac", () => {
    expect(isSearchShortcut(key())).toBe(true);
    expect(isSearchShortcut(key({ key: "K" }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ ctrlKey: false }))).toBe(false);
    expect(isSearchShortcut(key({ key: "j" }))).toBe(false);
    expect(isSearchShortcut(key({ shiftKey: true }))).toBe(false);
  });

  it("works from a plain field, never from inside a rich-text editor", () => {
    const input = document.createElement("input");
    expect(isSearchShortcut(key({ target: input }))).toBe(true);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const inside = document.createElement("p");
    editor.appendChild(inside);
    expect(isSearchShortcut(key({ target: inside }))).toBe(false);
    const off = document.createElement("div");
    off.setAttribute("contenteditable", "false");
    expect(isSearchShortcut(key({ target: off }))).toBe(true);
  });

  it("waits while another dialog holds focus, but still shuts its own box", () => {
    const form = document.createElement("div");
    form.setAttribute("role", "dialog");
    const title = document.createElement("input");
    form.appendChild(title);
    expect(isSearchShortcut(key({ target: title }))).toBe(false);

    const search = document.createElement("div");
    search.setAttribute("data-os-search", "");
    const inner = document.createElement("div");
    inner.setAttribute("role", "dialog");
    const field = document.createElement("input");
    inner.appendChild(field);
    search.appendChild(inner);
    expect(isSearchShortcut(key({ target: field }))).toBe(true);
  });

  it("leaves a key something else already took", () => {
    expect(isSearchShortcut(key({ defaultPrevented: true }))).toBe(false);
  });
});
