import { describe, expect, it } from "vitest";
import { buildHome, type HomeInput } from "../home";

// The home page shows what applies to this person and nothing else. Each case
// changes one fact about the member and checks the page follows it.

// 10:00 on Wed 23 Sep 2026 in Johannesburg.
const NOW = new Date("2026-09-23T08:00:00Z");

/** An inbox badge as getInboxBadge builds it. */
function inbox(notices: number, waiting: number): HomeInput["inbox"] {
  return { notices, waiting, total: notices + waiting };
}

/** The camp's teams by key, an archived one included. */
const TEAM_LABELS = {
  kitchen: "Kitchen",
  finance: "Finance",
  art: "Art Car",
  logistics: "Logistics",
};

function member(over: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    approval: "approved",
    firstName: "Nova",
    isCaptain: false,
    teams: [],
    pending: [],
    inbox: inbox(0, 0),
    myTasks: { items: [], total: 0 },
    lift: null,
    calendar: { status: "ok", events: [] },
    teamLabels: TEAM_LABELS,
    secured: true,
    ...over,
  };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

type MyTask = HomeInput["myTasks"]["items"][number];

/** One of the member's open tasks, as listMyOpenTasks returns it. */
function task(id: string, dueAt: Date | null, over: Partial<MyTask> = {}) {
  return {
    id,
    title: `Task ${id}`,
    status: "open" as const,
    team: null,
    dueAt,
    ...over,
  };
}

/** The member's tasks with `total` defaulting to how many are listed. */
function myTasks(items: MyTask[], total = items.length): HomeInput["myTasks"] {
  return { items, total };
}

describe("buildHome", () => {
  it("tells an applicant only that they are waiting, with no to-dos or events", () => {
    const home = buildHome(
      member({
        approval: "pending",
        pending: [
          {
            activationId: "a1",
            title: "Dietary",
            blocking: false,
            dueAt: null,
          },
        ],
        calendar: {
          status: "ok",
          events: [
            {
              id: "e1",
              title: "Build day",
              start: "2026-10-01",
              allDay: true,
              location: null,
              teamTag: null,
            },
          ],
        },
      }),
    );
    expect(home.waitingForApproval).toBe(true);
    expect(home.chips).toEqual(["Waiting for approval"]);
    expect(home.todos).toEqual([]);
    expect(home.upcoming).toEqual([]);
    expect(ids(home.modules)).toEqual(["announcements"]);
    expect(home.teams).toEqual([]);
    expect(home.checklist).toContainEqual({
      label: "Approved by a captain",
      done: false,
    });
    expect(home.allDone).toBe(false);
  });

  it("gives an approved member with nothing pending a clean, all-done page", () => {
    const home = buildHome(member());
    expect(home.waitingForApproval).toBe(false);
    expect(home.todos).toEqual([]);
    expect(home.allDone).toBe(true);
    expect(ids(home.modules)).toEqual(["announcements", "forms", "tasks"]);
  });

  it("lists forms to answer, soonest deadline first, and says how long is left", () => {
    const home = buildHome(
      member({
        pending: [
          {
            activationId: "later",
            title: "Later",
            blocking: false,
            dueAt: new Date("2026-10-03T10:00:00Z"),
          },
          {
            activationId: "none",
            title: "No deadline",
            blocking: false,
            dueAt: null,
          },
          {
            activationId: "soon",
            title: "Soon",
            blocking: false,
            dueAt: new Date("2026-09-24T10:00:00Z"),
          },
          {
            activationId: "late",
            title: "Late",
            blocking: false,
            dueAt: new Date("2026-09-20T10:00:00Z"),
          },
        ],
      }),
    );
    expect(home.todos.map((t) => [t.label, t.due, t.urgent])).toEqual([
      ["Late", "Overdue", true],
      ["Soon", "Due tomorrow", true],
      ["Later", "Due in 10 days", false],
      ["No deadline", null, false],
    ]);
    expect(home.checklist).toContainEqual({
      label: "Forms answered",
      done: false,
    });
    expect(home.allDone).toBe(false);
  });

  it("shows calendar events and your own travel together, soonest first", () => {
    const home = buildHome(
      member({
        calendar: {
          status: "ok",
          events: [
            {
              id: "e2",
              title: "Camp meeting",
              start: "2026-09-24T17:00:00Z",
              allDay: false,
              location: "Rondebosch",
              teamTag: null,
            },
            {
              id: "e1",
              title: "Build day",
              start: "2026-10-03",
              allDay: true,
              location: null,
              teamTag: null,
            },
          ],
        },
        lift: {
          role: "rider",
          driverName: "Ada",
          vehicle: "Toyota Hilux",
          departureCity: "Cape Town",
          arrivalAt: new Date("2026-09-30T06:00:00Z"),
          departureAt: null,
        },
      }),
    );
    expect(home.upcoming.map((u) => [u.title, u.when, u.relative])).toEqual([
      ["Camp meeting", "Thu 24 Sept · 19:00", "Tomorrow"],
      ["You arrive at camp", "Wed 30 Sept", "In 7 days"],
      ["Build day", "Sat 3 Oct", "In 10 days"],
    ]);
    expect(home.lift).toEqual({
      heading: "Your lift",
      lines: ["Riding with Ada", "Toyota Hilux", "From Cape Town"],
    });
  });

  describe("whose event", () => {
    function event(id: string, title: string, teamTag: string | null) {
      return {
        id,
        title,
        start: "2026-10-01T16:00:00Z",
        allDay: false,
        location: null,
        teamTag,
      };
    }

    const calendar: HomeInput["calendar"] = {
      status: "ok",
      events: [
        event("k", "Kitchen briefing", "kitchen"),
        event("f", "[Finance] Budget review", " finance "),
        event("a", "Art Car wash", "art car"),
        event("b", "Build day", null),
        event("x", "[Moon] Moon party", "Moon"),
      ],
    };

    const teamsOf = (home: ReturnType<typeof buildHome>) =>
      Object.fromEntries(home.upcoming.map((u) => [u.title, u.team]));

    it("marks the viewer's own team's event as theirs, and another team's with its name", () => {
      const home = buildHome(
        member({
          calendar,
          teams: [
            { key: "kitchen", label: "Kitchen", isLead: false, unread: 0 },
          ],
        }),
      );
      expect(teamsOf(home)).toEqual({
        "Kitchen briefing": { label: "Kitchen", mine: true },
        "Budget review": { label: "Finance", mine: false },
        // A tag matches a team's name as well as its key, in any case.
        "Art Car wash": { label: "Art Car", mine: false },
        // Untagged is camp-wide; a tag naming no team is not a team's.
        "Build day": null,
        "[Moon] Moon party": null,
      });
    });

    it("takes a tag off the title only when it names a team", () => {
      const home = buildHome(
        member({
          calendar: {
            status: "ok",
            events: [
              event("c", "[Cancelled] Burn night", "Cancelled"),
              event("t", "[TBC] Tasting", "kitchen"),
              event("k", "[kitchen] Clean up", "kitchen"),
              event("e", "[Kitchen]", "Kitchen"),
            ],
          },
          teams: [],
        }),
      );
      expect(home.upcoming.map((u) => u.title)).toEqual([
        // A bracket naming no team is the author's word, and stays.
        "[Cancelled] Burn night",
        // The team came from the property; the "[TBC]" still stays.
        "[TBC] Tasting",
        // A team's tag comes off: the badge says it.
        "Clean up",
        // Nothing but the tag: keep it rather than show an empty title.
        "[Kitchen]",
      ]);
    });

    it("reads the naming convention: 'Kitchen Team - Briefing' is Kitchen's Briefing", () => {
      const home = buildHome(
        member({
          calendar: {
            status: "ok",
            events: [
              // Made in the app: the property and the convention.
              event("k", "Kitchen Team - Briefing", "kitchen"),
              // Typed in Google: the convention alone.
              event("f", "Finance Team - Budget", null),
              // No such team: every word stays, camp-wide.
              event("e", "Early Team - Gate", null),
            ],
          },
          teams: [
            { key: "kitchen", label: "Kitchen", isLead: false, unread: 0 },
          ],
        }),
      );
      expect(teamsOf(home)).toEqual({
        Briefing: { label: "Kitchen", mine: true },
        Budget: { label: "Finance", mine: false },
        "Early Team - Gate": null,
      });
    });

    it("marks every team the viewer is on, led or not", () => {
      const home = buildHome(
        member({
          calendar,
          teams: [
            { key: "finance", label: "Finance", isLead: true, unread: 0 },
            { key: "art", label: "Art Car", isLead: false, unread: 0 },
          ],
        }),
      );
      expect(teamsOf(home)).toMatchObject({
        "Kitchen briefing": { mine: false },
        "Budget review": { mine: true },
        "Art Car wash": { mine: true },
      });
    });

    it("leaves travel unmarked", () => {
      const home = buildHome(
        member({
          lift: {
            role: "rider",
            driverName: "Ada",
            vehicle: "Toyota Hilux",
            departureCity: null,
            arrivalAt: new Date("2026-09-30T06:00:00Z"),
            departureAt: null,
          },
        }),
      );
      expect(home.upcoming.map((u) => u.team)).toEqual([null]);
    });
  });

  it("says when the calendar is not set up, instead of implying nothing is on", () => {
    expect(
      buildHome(member({ calendar: { status: "not_configured" } }))
        .calendarState,
    ).toBe("not_configured");
    expect(
      buildHome(member({ calendar: { status: "unavailable" } })).calendarState,
    ).toBe("unavailable");
  });

  it("gives a team lead the tiles to message, send a form and add an event; a member none", () => {
    const lead = buildHome(
      member({
        teams: [{ key: "kitchen", label: "Cuisine", isLead: true, unread: 0 }],
      }),
    );
    expect(lead.chips).toEqual(["Member", "Team lead"]);
    expect(ids(lead.modules)).toEqual([
      "announcements",
      "forms",
      "tasks",
      "message",
      "form",
      "event",
    ]);

    const crew = buildHome(
      member({
        teams: [{ key: "kitchen", label: "Cuisine", isLead: false, unread: 0 }],
      }),
    );
    expect(crew.chips).toEqual(["Member"]);
    expect(ids(crew.modules)).toEqual(["announcements", "forms", "tasks"]);
  });

  it("shows every team someone is on, the ones they lead first, each with its own count", () => {
    const home = buildHome(
      member({
        teams: [
          { key: "structures", label: "Structures", isLead: false, unread: 0 },
          {
            key: "sanitation_and_water",
            label: "Water",
            isLead: true,
            unread: 3,
          },
          { key: "kitchen", label: "Cuisine", isLead: true, unread: 1 },
        ],
      }),
    );
    expect(
      home.teams.map((t) => [t.label, t.isLead, t.unread, t.href]),
    ).toEqual([
      // Each opens its team's own page.
      ["Cuisine", true, 1, "/teams/kitchen"],
      ["Water", true, 3, "/teams/sanitation_and_water"],
      ["Structures", false, 0, "/teams/structures"],
    ]);
    // Leading two teams is still one set of tiles, not one per team.
    expect(ids(home.modules).filter((id) => id === "message")).toHaveLength(1);
  });

  it("shows a driver their car, riders and seats", () => {
    const home = buildHome(
      member({
        lift: {
          role: "driver",
          vehicle: "Land Rover Defender",
          seatsOffered: 3,
          riders: ["Ren", "Kai"],
          departureCity: null,
          arrivalAt: null,
          departureAt: null,
        },
      }),
    );
    expect(home.chips).toContain("Driver");
    expect(home.lift).toEqual({
      heading: "You're driving",
      lines: ["Land Rover Defender", "2 of 3 seats taken", "With Ren, Kai"],
    });
  });

  it("leaves the car card out entirely for someone in no car", () => {
    expect(buildHome(member()).lift).toBeNull();
  });

  it("gives a captain the camp overview as one shortcut, not the whole board", () => {
    const home = buildHome(member({ isCaptain: true }));
    expect(home.chips[0]).toBe("Captain");
    expect(ids(home.modules)).toEqual([
      "announcements",
      "forms",
      "tasks",
      "message",
      "form",
      "event",
      "overview",
    ]);
  });

  it("puts new announcements and waiting forms on their tiles, and nothing when there are none", () => {
    const busy = buildHome(
      member({
        inbox: inbox(3, 2),
        pending: [
          { activationId: "a", title: "A", blocking: false, dueAt: null },
          { activationId: "b", title: "B", blocking: false, dueAt: null },
        ],
      }),
    );
    expect(busy.modules.map((m) => [m.id, m.badge])).toEqual([
      ["announcements", 5],
      ["forms", 2],
      ["tasks", null],
    ]);
    expect(buildHome(member()).modules.map((m) => m.badge)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("shows the inbox total on the Notifications tile, the bell's number, not the notices alone", () => {
    const home = buildHome(
      member({
        inbox: inbox(5, 1),
        pending: [
          { activationId: "a", title: "A", blocking: false, dueAt: null },
        ],
      }),
    );
    // Named as the inbox it opens, and the count is said to be "waiting", not
    // "new": part of it may be forms, not announcements.
    expect(home.modules.find((m) => m.id === "announcements")).toMatchObject({
      label: "Notifications",
      badge: 6,
      badgeSays: "waiting",
    });
    // Waiting for approval, the tile still counts the waiting form.
    const waiting = buildHome(
      member({ approval: "pending", inbox: inbox(2, 1) }),
    );
    expect(waiting.modules).toEqual([
      expect.objectContaining({ id: "announcements", badge: 3 }),
    ]);
  });

  it("only lists sign-in security when it could be read", () => {
    expect(buildHome(member({ secured: false })).checklist).toContainEqual({
      label: "Sign-in secured",
      done: false,
    });
    expect(
      buildHome(member({ secured: null })).checklist.map((c) => c.label),
    ).not.toContain("Sign-in secured");
  });
  describe("your tasks", () => {
    it("lists dated tasks soonest first and undated ones after, each with its due label", () => {
      const home = buildHome(
        member({
          myTasks: myTasks([
            task("undated", null),
            task("later", new Date("2026-09-30T10:00:00Z")),
            task("tomorrow", new Date("2026-09-24T10:00:00Z"), {
              status: "in_progress",
            }),
            task("late", new Date("2026-09-21T10:00:00Z")),
          ]),
        }),
      );
      expect(
        home.tasks.map((t) => [t.id, t.due, t.urgent, t.doing, t.href]),
      ).toEqual([
        ["task:late", "Overdue", true, false, "/tasks"],
        ["task:tomorrow", "Due tomorrow", true, true, "/tasks"],
        ["task:later", "Due in 7 days", false, false, "/tasks"],
        ["task:undated", null, false, false, "/tasks"],
      ]);
      expect(home.tasks[0]?.label).toBe("Task late");
      expect(home.tasksMore).toBe(0);
    });

    it("shows at most five and counts the rest as more", () => {
      const items = Array.from({ length: 7 }, (_, i) =>
        task(`t${i}`, new Date(Date.UTC(2026, 9, 1 + i, 10))),
      );
      const home = buildHome(member({ myTasks: myTasks(items, 9) }));
      expect(ids(home.tasks)).toEqual([
        "task:t0",
        "task:t1",
        "task:t2",
        "task:t3",
        "task:t4",
      ]);
      expect(home.tasksMore).toBe(4);
    });

    it("has no card for a member with no tasks", () => {
      const home = buildHome(member());
      expect(home.tasks).toEqual([]);
      expect(home.tasksMore).toBe(0);
    });

    it("gives a member waiting for approval no tasks and no Tasks tile", () => {
      const home = buildHome(
        member({
          approval: "pending",
          myTasks: myTasks([task("a", null)], 3),
        }),
      );
      expect(home.tasks).toEqual([]);
      expect(home.tasksMore).toBe(0);
      expect(ids(home.modules)).not.toContain("tasks");
    });

    it("counts every open task of theirs on the Tasks tile, not just the ones shown", () => {
      const home = buildHome(
        member({ myTasks: myTasks([task("a", null), task("b", null)], 8) }),
      );
      expect(home.modules.find((m) => m.id === "tasks")).toEqual({
        id: "tasks",
        href: "/tasks",
        label: "Tasks",
        icon: "tasks",
        badge: 8,
        badgeSays: "yours",
      });
    });

    it("reads the deadline's day in camp time, not UTC, at midnight", () => {
      // 22:30 UTC on Wed 23 Sep is 00:30 on Thu 24 Sep in camp: due tomorrow.
      // 21:30 UTC is 23:30 on Wed in camp: due today.
      const home = buildHome(
        member({
          myTasks: myTasks([
            task("after", new Date("2026-09-23T22:30:00Z")),
            task("before", new Date("2026-09-23T21:30:00Z")),
          ]),
        }),
      );
      expect(home.tasks.map((t) => [t.id, t.due])).toEqual([
        ["task:before", "Due today"],
        ["task:after", "Due tomorrow"],
      ]);
    });
  });
});
