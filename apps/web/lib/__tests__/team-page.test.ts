import { describe, expect, it } from "vitest";
import type { CalendarDay } from "../calendar-view";
import type { TaskCard } from "../task-board";
import { buildTeamPage, TEAM_EVENT_LIMIT } from "../team-page";

// A team's page: its people split into leads and members, its events with
// their day, and its open tasks.

const PEOPLE = [
  {
    id: "lead",
    displayName: "Lee",
    handle: null,
    rank: "member",
    isLead: true,
  },
  {
    id: "cap",
    displayName: "Cap",
    handle: "cap",
    rank: "captain",
    isLead: false,
  },
  { id: "mem", displayName: "Mo", handle: null, rank: "member", isLead: false },
] as const;

function card(id: string, team: string | null, status: TaskCard["status"]) {
  return { id, team, status } as TaskCard;
}

function day(key: string, relative: string, ids: string[]): CalendarDay {
  return {
    key,
    date: `Date ${key}`,
    relative,
    items: ids.map((id) => ({
      id,
      title: id,
      time: "All day",
      location: null,
      team: null,
    })),
  };
}

function page(over: Partial<Parameters<typeof buildTeamPage>[0]> = {}) {
  return buildTeamPage({
    viewerId: "mem",
    people: [...PEOPLE],
    days: [],
    cards: [],
    team: "kitchen",
    ...over,
  });
}

describe("buildTeamPage", () => {
  it("puts leads and members apart, and says where the viewer stands", () => {
    const model = page();
    expect(model.leads.map((p) => p.id)).toEqual(["lead"]);
    expect(model.members.map((p) => p.id)).toEqual(["cap", "mem"]);
    expect(model.viewer).toEqual({ onTeam: true, leads: false });
    expect(page({ viewerId: "lead" }).viewer).toEqual({
      onTeam: true,
      leads: true,
    });
    expect(page({ viewerId: "stranger" }).viewer).toEqual({
      onTeam: false,
      leads: false,
    });
  });

  it("keeps the team's open tasks only: not Done, not another team's", () => {
    const model = page({
      cards: [
        card("todo", "kitchen", "open"),
        card("doing", "kitchen", "in_progress"),
        card("done", "kitchen", "done"),
        card("theirs", "finance", "open"),
        card("camp", null, "open"),
      ],
    });
    expect(model.tasks.map((t) => t.id)).toEqual(["todo", "doing"]);
  });

  it("names each event's day, Today and Tomorrow in words", () => {
    const model = page({
      days: [
        day("2026-09-23", "Today", ["a"]),
        day("2026-09-24", "Tomorrow", ["b"]),
        day("2026-10-01", "In 8 days", ["c"]),
      ],
    });
    expect(model.events.map((e) => [e.item.id, e.day])).toEqual([
      ["a", "Today"],
      ["b", "Tomorrow"],
      ["c", "Date 2026-10-01"],
    ]);
    expect(model.eventsMore).toBe(0);
  });

  it(`lists at most ${TEAM_EVENT_LIMIT} events and counts the rest`, () => {
    const ids = Array.from({ length: TEAM_EVENT_LIMIT + 3 }, (_, n) => `e${n}`);
    const model = page({ days: [day("2026-10-01", "In 8 days", ids)] });
    expect(model.events).toHaveLength(TEAM_EVENT_LIMIT);
    expect(model.eventsMore).toBe(3);
  });
});
