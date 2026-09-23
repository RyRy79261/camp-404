import { describe, expect, it } from "vitest";
import { buildHome, type HomeInput } from "../home";

// The home page shows what applies to this person and nothing else. Each case
// changes one fact about the member and checks the page follows it.

// 10:00 on Wed 23 Sep 2026 in Johannesburg.
const NOW = new Date("2026-09-23T08:00:00Z");

function member(over: Partial<HomeInput> = {}): HomeInput {
  return {
    now: NOW,
    approval: "approved",
    firstName: "Nova",
    isCaptain: false,
    teams: [],
    pending: [],
    unread: 0,
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
    expect(ids(home.shortcuts)).toEqual(["announcements"]);
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
    expect(ids(home.shortcuts)).toEqual(["announcements", "forms"]);
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

  it("gives a team lead their team and a way to message it; a member only their team", () => {
    const lead = buildHome(
      member({ teams: [{ key: "kitchen", label: "Cuisine", isLead: true }] }),
    );
    expect(lead.chips).toEqual(["Member", "Cuisine lead"]);
    expect(ids(lead.shortcuts)).toEqual([
      "announcements",
      "forms",
      "team:kitchen",
      "message",
      "form",
    ]);
    expect(lead.shortcuts.find((s) => s.id === "team:kitchen")?.href).toBe(
      "/captains/camp-management?team=kitchen",
    );

    const crew = buildHome(
      member({ teams: [{ key: "kitchen", label: "Cuisine", isLead: false }] }),
    );
    expect(ids(crew.shortcuts)).toEqual([
      "announcements",
      "forms",
      "team:kitchen",
    ]);
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
    expect(ids(home.shortcuts)).toEqual([
      "announcements",
      "forms",
      "message",
      "form",
      "overview",
    ]);
  });

  it("counts unread announcements on the shortcut", () => {
    const home = buildHome(member({ unread: 3 }));
    expect(home.shortcuts[0]).toMatchObject({ badge: 3, detail: null });
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
