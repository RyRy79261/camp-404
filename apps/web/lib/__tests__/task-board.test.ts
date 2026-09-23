import { describe, expect, it } from "vitest";
import { campDayKey } from "@camp404/core";
import {
  deadlineFromDay,
  presentTask,
  type TaskRow,
  type Viewer,
} from "../task-board";

// What a card on the task board says, and which buttons it offers, for each
// kind of viewer. The actions check every button again; these rules only
// decide what the screen offers.

const NOW = new Date("2026-09-23T10:00:00Z"); // Wed 23 Sep, camp time

function row(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t1",
    title: "Count the float",
    description: null,
    team: "finance",
    status: "open",
    assigneeId: null,
    assigneeName: null,
    createdById: "author",
    createdByName: "Author",
    dueAt: null,
    completedAt: null,
    ...overrides,
  };
}

const member: Viewer = { id: "m", isCaptain: false, leadTeams: [] };
const labels = { finance: "Finance" };

function card(task: TaskRow, viewer: Viewer = member) {
  return presentTask(task, { viewer, now: NOW, teamLabels: labels });
}

describe("deadlineFromDay", () => {
  it("keeps the typed day as the camp day, late at night too", () => {
    for (const day of ["2026-09-23", "2026-12-31", "2027-01-01"]) {
      expect(campDayKey(deadlineFromDay(day))).toBe(day);
    }
  });
});

describe("presentTask deadlines", () => {
  const due = (day: string, status: TaskRow["status"] = "open") =>
    card(row({ dueAt: deadlineFromDay(day), status })).due;

  it("says overdue, today, tomorrow, soon and later", () => {
    expect(due("2026-09-22")).toEqual({
      label: "Overdue · Tue 22 Sept",
      tone: "overdue",
    });
    expect(due("2026-09-23")).toEqual({ label: "Due today", tone: "soon" });
    expect(due("2026-09-24")).toEqual({ label: "Due tomorrow", tone: "soon" });
    expect(due("2026-09-26")).toEqual({
      label: "Due Sat 26 Sept",
      tone: "soon",
    });
    expect(due("2026-09-27")).toEqual({
      label: "Due Sun 27 Sept",
      tone: "later",
    });
  });

  it("never calls a finished task overdue", () => {
    expect(due("2026-09-01", "done")).toEqual({
      label: "Was due Tue 1 Sept",
      tone: "done",
    });
  });

  it("shows no deadline when there is none", () => {
    expect(card(row()).due).toBeNull();
  });
});

describe("presentTask buttons", () => {
  it("gives a plain member nothing on someone else's task", () => {
    const c = card(row({ assigneeId: "other", assigneeName: "Other" }));
    expect([c.canMove, c.canRemove, c.mine]).toEqual([false, false, false]);
  });

  it("lets the person responsible move it, not remove it", () => {
    const c = card(row({ assigneeId: "m", assigneeName: "Me" }));
    expect([c.canMove, c.canRemove, c.mine]).toEqual([true, false, true]);
  });

  it("lets the author, the team's lead and a captain move and remove it", () => {
    const author = card(row({ createdById: "m" }));
    const lead = card(row(), {
      id: "l",
      isCaptain: false,
      leadTeams: ["finance"],
    });
    const otherLead = card(row(), {
      id: "o",
      isCaptain: false,
      leadTeams: ["kitchen"],
    });
    const captain = card(row({ team: null }), {
      id: "c",
      isCaptain: true,
      leadTeams: [],
    });
    for (const c of [author, lead, captain]) {
      expect([c.canMove, c.canRemove]).toEqual([true, true]);
    }
    expect([otherLead.canMove, otherLead.canRemove]).toEqual([false, false]);
  });

  it("names the team and says when nobody is responsible", () => {
    const c = card(row());
    expect(c.teamLabel).toBe("Finance");
    expect(c.assigneeName).toBeNull();
  });
});
