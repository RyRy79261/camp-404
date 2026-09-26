import { describe, expect, it } from "vitest";
import { bootLog } from "../boot";
import { todayBurn } from "../today";

// The Today gadget's countdown card and the boot screen's lines: the member's
// and the camp's own facts, worked out in camp days (Johannesburg).

const YEAR = {
  year: 2027,
  name: "The Big Question",
  burnStart: "2027-04-26",
  burnEnd: "2027-05-02",
};

describe("todayBurn", () => {
  it("counts whole camp days to the first day, with the year and its name", () => {
    expect(todayBurn(YEAR, new Date("2027-04-01T10:00:00Z"))).toEqual({
      year: 2027,
      name: "The Big Question",
      start: "2027-04-26",
      end: "2027-05-02",
      daysTo: 25,
      dayOf: null,
      runUp: null,
    });
  });

  it("measures the run-up from last year's last day to this year's first", () => {
    // 2026-05-03 to 2027-04-26 is 358 days; on 2027-04-01, 333 are gone.
    const burn = todayBurn(
      YEAR,
      new Date("2027-04-01T10:00:00Z"),
      "2026-05-03",
    )!;
    expect(burn.runUp).toEqual({ days: 358, gone: 333 });
    // Before last year ended, or once this one starts, there is no run-up.
    expect(
      todayBurn(YEAR, new Date("2026-05-01T10:00:00Z"), "2026-05-03")!.runUp,
    ).toBeNull();
    expect(
      todayBurn(YEAR, new Date("2027-04-26T10:00:00Z"), "2026-05-03")!.runUp,
    ).toBeNull();
    // Without last year's dates, none either.
    expect(todayBurn(YEAR, new Date("2027-04-01T10:00:00Z"))!.runUp).toBeNull();
  });

  it("uses the camp's day: 22:30Z on the 25th is already day one", () => {
    const burn = todayBurn(YEAR, new Date("2027-04-25T22:30:00Z"))!;
    expect(burn.daysTo).toBeNull();
    expect(burn.dayOf).toBe(1);
  });

  it("names the day while the Burn runs, and neither after it", () => {
    expect(todayBurn(YEAR, new Date("2027-05-02T10:00:00Z"))!.dayOf).toBe(7);
    const after = todayBurn(YEAR, new Date("2027-05-03T10:00:00Z"))!;
    expect(after.daysTo).toBeNull();
    expect(after.dayOf).toBeNull();
  });

  it("has a year with no dates, and nothing before a year is named", () => {
    const bare = todayBurn({ year: 2027 }, new Date("2027-04-01T10:00:00Z"))!;
    expect(bare).toMatchObject({
      year: 2027,
      name: null,
      start: null,
      daysTo: null,
      dayOf: null,
    });
    expect(todayBurn(null, new Date())).toBeNull();
  });
});

describe("bootLog", () => {
  const facts = {
    name: "Nova Reyes",
    rank: "Captain",
    teams: 14,
    inbox: 3,
    year: 2027,
    daysTo: 212,
  };

  it("counts the two cats, signs the member in and welcomes them by first name", () => {
    const { lines, welcome } = bootLog(facts);
    expect(lines).toContainEqual({
      text: "Counting cats",
      ok: "2 (Jinn awake, Prince asleep)",
    });
    expect(lines).toContainEqual({
      text: "Signing in: Nova Reyes",
      ok: "Captain",
    });
    expect(lines).toContainEqual({ text: "Inbox", ok: "3 new" });
    expect(lines).toContainEqual({ text: "Loading teams", ok: "14 teams" });
    expect(lines.at(-1)).toEqual({ text: "AfrikaBurn 2027", ok: "212 days" });
    expect(welcome).toBe("Welcome back, Nova");
  });

  it("leaves the Burn line out with no dates, and says one day as one", () => {
    expect(
      bootLog({ ...facts, daysTo: null }).lines.map((l) => l.text),
    ).not.toContain("AfrikaBurn 2027");
    expect(bootLog({ ...facts, daysTo: 1 }).lines.at(-1)?.ok).toBe("1 day");
  });
});
