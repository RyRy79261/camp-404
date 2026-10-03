import { describe, expect, it } from "vitest";
import {
  AFRIKABURN_DATE_KINDS,
  ATTENDANCE_PHASES,
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_LABELS,
  Team,
} from "@camp404/types";
import {
  AFRIKABURN_DATES,
  AFRIKABURN_DATE_GROUPS,
  LOGISTICS_TEAM,
  afrikaburnDate,
  afrikaburnDateMayBeSkipped,
  afrikaburnEventTitle,
  attendanceAnswered,
  attendanceAskNotification,
  attendanceBoard,
  attendanceIsOpen,
  campOnSite,
  canAskForAttendance,
  canEditLogistics,
  canManageDeadlines,
  deadlineCalendarStep,
  isAskedForAttendance,
  logisticsCalendarStep,
  logisticsEventTitle,
} from "../logistics";
import { payloadLink } from "../notifications";

describe("campOnSite", () => {
  const days = (
    phase: "build" | "burn" | "strike" | "pack",
    startDate: string | null,
    endDate: string | null,
  ) => ({ phase, startDate, endDate });

  it("starts on the first Build day and runs to the last Strike day", () => {
    expect(
      campOnSite(
        [
          days("pack", "2027-04-17", "2027-04-17"),
          days("build", "2027-04-22", "2027-04-26"),
          days("burn", "2027-04-27", "2027-05-02"),
          days("strike", "2027-05-03", "2027-05-04"),
        ],
        30,
      ),
    ).toEqual({ firstDay: "2027-04-22", daysOnSite: 13 });
  });

  it("starts on the first Burn day with no Build days, and ends on the last Burn day with no Strike", () => {
    expect(
      campOnSite(
        [days("build", null, null), days("burn", "2027-04-27", "2027-05-02")],
        30,
      ),
    ).toEqual({ firstDay: "2027-04-27", daysOnSite: 6 });
    expect(campOnSite([days("build", "2027-04-22", "2027-04-24")], 30)).toEqual(
      { firstDay: "2027-04-22", daysOnSite: 3 },
    );
  });

  it("is null with no Build or Burn days, or with dates that are not days", () => {
    expect(campOnSite([], 30)).toBeNull();
    expect(
      campOnSite([days("strike", "2027-05-03", "2027-05-04")], 30),
    ).toBeNull();
    expect(
      campOnSite([days("build", "2027-02-30", "2027-03-02")], 30),
    ).toBeNull();
  });

  it("holds the count between 1 and the most a plan takes", () => {
    expect(
      campOnSite(
        [
          days("build", "2027-04-01", "2027-04-05"),
          days("strike", "2027-05-20", "2027-05-21"),
        ],
        30,
      ),
    ).toEqual({ firstDay: "2027-04-01", daysOnSite: 30 });
    // A Strike typed before the Build: at least Day 1.
    expect(
      campOnSite(
        [
          days("build", "2027-04-22", "2027-04-24"),
          days("strike", "2027-04-01", "2027-04-01"),
        ],
        30,
      ),
    ).toEqual({ firstDay: "2027-04-22", daysOnSite: 1 });
  });
});

describe("canEditLogistics", () => {
  it("names a real team", () => {
    expect(Team.options).toContain(LOGISTICS_TEAM);
  });

  it("lets a captain edit, whatever they lead", () => {
    expect(canEditLogistics("captain", [])).toBe(true);
  });

  it("lets a lead of Transport and Logistics edit", () => {
    expect(canEditLogistics("team_lead", [LOGISTICS_TEAM])).toBe(true);
    expect(canEditLogistics("team_lead", ["kitchen", LOGISTICS_TEAM])).toBe(
      true,
    );
  });

  it("refuses a lead of another team", () => {
    expect(canEditLogistics("team_lead", ["power_and_lighting"])).toBe(false);
    expect(canEditLogistics("team_lead", [])).toBe(false);
  });

  it("refuses a member, even one who names the team", () => {
    expect(canEditLogistics("camp_member", [LOGISTICS_TEAM])).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    expect(canEditLogistics("god", [LOGISTICS_TEAM])).toBe(false);
    expect(canEditLogistics("", [LOGISTICS_TEAM])).toBe(false);
  });
});

describe("logisticsEventTitle", () => {
  it("is plain: every phase is a whole-camp event (owner, 2026-09-30)", () => {
    expect(logisticsEventTitle("build")).toBe("Build");
    expect(logisticsEventTitle("strike")).toBe("Strike");
  });

  it("titles every phase with its own name and no team", () => {
    for (const phase of LOGISTICS_PHASES) {
      expect(logisticsEventTitle(phase)).toBe(LOGISTICS_PHASE_LABELS[phase]);
      expect(logisticsEventTitle(phase)).not.toMatch(/Team/);
    }
  });
});

describe("logisticsCalendarStep", () => {
  const days = { startDate: "2027-04-20", endDate: "2027-04-21" };
  const none = { startDate: null, endDate: null };

  it("puts a phase with days and its event", () => {
    expect(logisticsCalendarStep({ ...days, calendarEventId: "abc12" })).toBe(
      "put",
    );
  });

  it("removes the event of a phase whose days were cleared", () => {
    expect(logisticsCalendarStep({ ...none, calendarEventId: "abc12" })).toBe(
      "remove",
    );
  });

  it("does nothing with no days and no event", () => {
    expect(logisticsCalendarStep({ ...none, calendarEventId: null })).toBe(
      "none",
    );
  });

  it("does nothing without an event id to write under", () => {
    expect(logisticsCalendarStep({ ...days, calendarEventId: null })).toBe(
      "none",
    );
  });
});

describe("attendance", () => {
  it("asks about the phases that need hands: pack, build, strike, unpack", () => {
    expect([...ATTENDANCE_PHASES]).toEqual([
      "pack",
      "build",
      "strike",
      "unpack",
    ]);
  });

  it("lets only a captain ask everyone, failing closed", () => {
    expect(canAskForAttendance("captain")).toBe(true);
    expect(canAskForAttendance("team_lead")).toBe(false);
    expect(canAskForAttendance("camp_member")).toBe(false);
    expect(canAskForAttendance("god")).toBe(false);
  });

  it("asks who is coming: said Yes, or accepted", () => {
    expect(isAskedForAttendance("applied")).toBe(true);
    expect(isAskedForAttendance("accepted")).toBe(true);
    for (const status of ["maybe", "waitlisted", "not_attending"] as const) {
      expect(isAskedForAttendance(status)).toBe(false);
    }
    expect(isAskedForAttendance(null)).toBe(false);
  });

  it("takes answers until the phase's first day", () => {
    expect(attendanceIsOpen(null, "2027-04-24")).toBe(true);
    expect(attendanceIsOpen("2027-04-24", "2027-04-23")).toBe(true);
    expect(attendanceIsOpen("2027-04-24", "2027-04-24")).toBe(false);
    expect(attendanceIsOpen("2027-04-24", "2027-04-25")).toBe(false);
  });

  it("counts a member as answered when every open phase has an answer", () => {
    const all = new Set(ATTENDANCE_PHASES);
    expect(attendanceAnswered(new Set(["pack", "build", "strike"]), all)).toBe(
      false,
    );
    expect(attendanceAnswered(all, all)).toBe(true);
    // Pack has started: it is no longer owed.
    expect(
      attendanceAnswered(
        new Set(["build", "strike", "unpack"]),
        new Set(["build", "strike", "unpack"]),
      ),
    ).toBe(true);
  });

  it("builds the board: names per answer, and who is coming but silent", () => {
    const board = attendanceBoard(
      [
        { phase: "pack", userId: "b", name: "Bo", answer: "going" },
        { phase: "pack", userId: "a", name: "Al", answer: "going" },
        { phase: "pack", userId: "c", name: "Cy", answer: "maybe" },
        { phase: "build", userId: "a", name: "Al", answer: "cant" },
      ],
      [
        { userId: "a", name: "Al" },
        { userId: "d", name: "Di" },
        { userId: "b", name: "Bo" },
      ],
    );
    const pack = board.find((p) => p.phase === "pack")!;
    expect(pack.names).toEqual({
      going: ["Al", "Bo"],
      maybe: ["Cy"],
      cant: [],
    });
    expect(pack.notAnswered).toEqual(["Di"]);
    const build = board.find((p) => p.phase === "build")!;
    expect(build.names.cant).toEqual(["Al"]);
    expect(build.notAnswered).toEqual(["Bo", "Di"]);
    expect(board.map((p) => p.phase)).toEqual([...ATTENDANCE_PHASES]);
  });

  it("sends a notice that opens Logistics", () => {
    expect(
      payloadLink(attendanceAskNotification({ requiredActionId: null })),
    ).toBe("/logistics");
  });
});

describe("AfrikaBurn deadlines", () => {
  it("are kept by captains only, failing closed", () => {
    expect(canManageDeadlines("captain")).toBe(true);
    expect(canManageDeadlines("team_lead")).toBe(false);
    expect(canManageDeadlines("camp_member")).toBe(false);
    expect(canManageDeadlines("")).toBe(false);
  });

  it("put a dated one, remove a removed or undated one, and skip one with no event", () => {
    const id = "abc12";
    expect(
      deadlineCalendarStep({
        dueDate: "2027-01-15",
        removed: false,
        calendarEventId: id,
      }),
    ).toBe("put");
    expect(
      deadlineCalendarStep({
        dueDate: "2027-01-15",
        removed: true,
        calendarEventId: id,
      }),
    ).toBe("remove");
    expect(
      deadlineCalendarStep({
        dueDate: null,
        removed: false,
        calendarEventId: id,
      }),
    ).toBe("remove");
    expect(
      deadlineCalendarStep({
        dueDate: null,
        removed: false,
        calendarEventId: null,
      }),
    ).toBe("none");
  });
});

describe("AfrikaBurn's standard dates", () => {
  it("list every kind exactly once, in the owner's groups and order", () => {
    const kinds = AFRIKABURN_DATES.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...AFRIKABURN_DATE_KINDS].sort());
    const groups = AFRIKABURN_DATE_GROUPS.map((g) => g.key);
    expect(
      groups.map((g) =>
        AFRIKABURN_DATES.filter((d) => d.group === g).map((d) => d.name),
      ),
    ).toEqual([
      [
        "Form 1 registration opens",
        "Form 2 registration",
        "Registration closes",
      ],
      ["Art grant applications close"],
      ["WAP requests open", "WAP requests close", "WAPs sent out"],
      [
        "Ticket distribution opens",
        "DDT deadline",
        "Second DDT round",
        "Ticket distribution closes",
      ],
    ]);
    // In group order, so a page walks the list once.
    expect(AFRIKABURN_DATES.map((d) => groups.indexOf(d.group))).toEqual(
      [...AFRIKABURN_DATES.map((d) => groups.indexOf(d.group))].sort(),
    );
  });

  it("let only the second DDT round be skipped, failing closed", () => {
    expect(
      AFRIKABURN_DATES.filter((d) => d.mayBeSkipped).map((d) => d.kind),
    ).toEqual(["second_ddt_round"]);
    expect(afrikaburnDateMayBeSkipped("second_ddt_round")).toBe(true);
    expect(afrikaburnDateMayBeSkipped("ddt_deadline")).toBe(false);
    expect(afrikaburnDateMayBeSkipped("nope")).toBe(false);
    expect(afrikaburnDate("nope")).toBeUndefined();
    expect(afrikaburnDate("form_2")?.help).toBe(
      "Size, placement, sound, layout; art projects register here too.",
    );
  });

  it("title a calendar event AfrikaBurn: <name>, never twice", () => {
    expect(
      afrikaburnEventTitle({ kind: "registration_closes", title: "x" }),
    ).toBe("AfrikaBurn: Registration closes");
    expect(
      afrikaburnEventTitle({ kind: null, title: "Mutant vehicle forms" }),
    ).toBe("AfrikaBurn: Mutant vehicle forms");
    expect(
      afrikaburnEventTitle({ kind: null, title: "AfrikaBurn site opens" }),
    ).toBe("AfrikaBurn site opens");
    // An unknown key keeps its stored title.
    expect(afrikaburnEventTitle({ kind: "gone", title: "Old date" })).toBe(
      "AfrikaBurn: Old date",
    );
  });
});
