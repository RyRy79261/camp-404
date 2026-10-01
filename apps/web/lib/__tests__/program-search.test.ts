import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import type { ProgramId } from "../program-routes";
import { buildProgramManifest, type ProgramFacts } from "../programs";
import {
  RECENT_MAX,
  filterPrograms,
  isSearchShortcut,
  parseRecent,
  pushRecent,
  readRecent,
  recentPrograms,
  recentStorageKey,
  searchablePrograms,
  splitMatch,
  writeRecent,
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
    expect(hits[0]!.match).toEqual({ start: 5, length: 3 });
  });

  it("finds nothing for empty text or a name nobody has", () => {
    expect(filterPrograms(memberList(), "  ")).toEqual([]);
    expect(filterPrograms(memberList(), "zzz")).toEqual([]);
    expect(filterPrograms(memberList(), "audit")).toEqual([]);
    expect(names(filterPrograms(captainList(), "audit"))).toEqual([
      "Audit log",
    ]);
  });

  it("splits a name around its match for the highlight", () => {
    const [hit] = filterPrograms(memberList(), "ower");
    expect(splitMatch(hit!.program.label, hit!.match)).toEqual({
      before: "P",
      matched: "ower",
      after: "",
    });
    expect(splitMatch("Inbox", null)).toEqual({
      before: "Inbox",
      matched: "",
      after: "",
    });
  });
});

describe("Recent", () => {
  it("moves the newest to the front and keeps a few", () => {
    let recent: string[] = [];
    for (const id of ["a", "b", "c", "a", "d", "e", "f", "g"]) {
      recent = pushRecent(recent, id);
    }
    expect(recent).toEqual(["g", "f", "e", "d", "a"]);
    expect(recent).toHaveLength(RECENT_MAX);
  });

  it("reads anything malformed as none", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["power", 3, "", "power", "inbox"]')).toEqual([
      "power",
      "inbox",
    ]);
  });

  it("shows only programs the member may still open", () => {
    const list = memberList();
    const rows = recentPrograms(list, [
      pid("camp-settings"),
      pid("power"),
      "gone",
    ]);
    expect(rows.map((e) => e.program.id)).toEqual([pid("power")]);
  });

  it("is kept per member in this browser", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    writeRecent(storage, "u1", ["power"]);
    expect(readRecent(storage, "u1")).toEqual(["power"]);
    expect(readRecent(storage, "u2")).toEqual([]);
    expect([...store.keys()]).toEqual([recentStorageKey("u1")]);
    expect(readRecent(null, "u1")).toEqual([]);
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

  it("leaves a key something else already took", () => {
    expect(isSearchShortcut(key({ defaultPrevented: true }))).toBe(false);
  });
});
