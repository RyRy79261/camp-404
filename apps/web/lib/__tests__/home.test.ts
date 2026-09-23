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

function member(over: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    approval: "approved",
    firstName: "Nova",
    isCaptain: false,
    teams: [],
    pending: [],
    inbox: inbox(0, 0),
    lift: null,
    calendar: { status: "ok", events: [] },
    secured: true,
    ...over,
  };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

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
    expect(ids(home.modules)).toEqual(["announcements", "forms"]);
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
            },
            {
              id: "e1",
              title: "Build day",
              start: "2026-10-03",
              allDay: true,
              location: null,
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

  it("says when the calendar is not set up, instead of implying nothing is on", () => {
    expect(
      buildHome(member({ calendar: { status: "not_configured" } }))
        .calendarState,
    ).toBe("not_configured");
    expect(
      buildHome(member({ calendar: { status: "unavailable" } })).calendarState,
    ).toBe("unavailable");
  });

  it("gives a team lead the tiles to message and send a form to their team; a member neither", () => {
    const lead = buildHome(
      member({
        teams: [{ key: "kitchen", label: "Cuisine", isLead: true, unread: 0 }],
      }),
    );
    expect(lead.chips).toEqual(["Member", "Team lead"]);
    expect(ids(lead.modules)).toEqual([
      "announcements",
      "forms",
      "message",
      "form",
    ]);

    const crew = buildHome(
      member({
        teams: [{ key: "kitchen", label: "Cuisine", isLead: false, unread: 0 }],
      }),
    );
    expect(crew.chips).toEqual(["Member"]);
    expect(ids(crew.modules)).toEqual(["announcements", "forms"]);
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
      ["Cuisine", true, 1, "/captains/camp-management?team=kitchen"],
      ["Water", true, 3, "/captains/camp-management?team=sanitation_and_water"],
      ["Structures", false, 0, "/captains/camp-management?team=structures"],
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
      "message",
      "form",
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
    ]);
    expect(buildHome(member()).modules.map((m) => m.badge)).toEqual([
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
});
