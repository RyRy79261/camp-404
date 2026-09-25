import { describe, expect, it } from "vitest";
import {
  parseTeamTag,
  readTeamEvent,
  teamEventName,
  teamEventTitle,
  teamForTag,
} from "../calendar-titles";

// The camp calendar's naming convention (owner, 2026-09-24: "Calendar naming
// convention: 'Power Team - General meeting'") and reading a title back.

const TEAMS = [
  { key: "kitchen", label: "Kitchen" },
  { key: "power_and_lighting", label: "Power and Lighting" },
  { key: "finance", label: "Finance" },
  { key: "a_team", label: "The A Team" },
];

describe("teamEventTitle", () => {
  it("writes '<Team label> Team - <title>'", () => {
    expect(teamEventTitle("Power and Lighting", "General meeting")).toBe(
      "Power and Lighting Team - General meeting",
    );
    expect(teamEventTitle("Kitchen", "  Briefing ")).toBe(
      "Kitchen Team - Briefing",
    );
  });

  it("does not double a label that already ends in Team", () => {
    expect(teamEventName("The A Team")).toBe("The A Team");
    expect(teamEventName("Power team")).toBe("Power team");
    // "Teams" and "Steam" are not the word Team.
    expect(teamEventName("Steam")).toBe("Steam Team");
    expect(teamEventTitle("The A Team", "Van wash")).toBe(
      "The A Team - Van wash",
    );
  });

  it("leaves a whole-camp event's title as typed", () => {
    expect(teamEventTitle(null, " Build day ")).toBe("Build day");
  });
});

describe("parseTeamTag", () => {
  it("takes a [Tag] prefix off the title, trimmed", () => {
    expect(parseTeamTag("[Kitchen] Briefing")).toEqual({
      tag: "Kitchen",
      title: "Briefing",
    });
    expect(parseTeamTag("  [ art car ]   Wash day ")).toEqual({
      tag: "art car",
      title: "Wash day",
    });
    expect(parseTeamTag("Build day")).toEqual({
      tag: null,
      title: "Build day",
    });
    expect(parseTeamTag("[] Nothing")).toEqual({
      tag: null,
      title: "[] Nothing",
    });
    expect(parseTeamTag("Meet at [Gate]")).toEqual({
      tag: null,
      title: "Meet at [Gate]",
    });
    expect(parseTeamTag(undefined)).toEqual({ tag: null, title: "" });
  });
});

describe("teamForTag", () => {
  it("finds a team by key or label, trimmed and in any case", () => {
    expect(teamForTag("kitchen", TEAMS)?.key).toBe("kitchen");
    expect(teamForTag(" power AND lighting ", TEAMS)?.key).toBe(
      "power_and_lighting",
    );
    expect(teamForTag("Cuisine", TEAMS)).toBeNull();
    expect(teamForTag(null, TEAMS)).toBeNull();
  });
});

describe("readTeamEvent", () => {
  it("reads an app-made event: its team from the property, the prefix off", () => {
    expect(
      readTeamEvent(
        "Power and Lighting Team - General meeting",
        "power_and_lighting",
        TEAMS,
      ),
    ).toEqual({ team: TEAMS[1], title: "General meeting" });
  });

  it("reads the convention typed in Google, with no property", () => {
    expect(readTeamEvent("Kitchen Team - Stock take", null, TEAMS)).toEqual({
      team: TEAMS[0],
      title: "Stock take",
    });
    // Any case, and an en or em dash.
    expect(readTeamEvent("kitchen team – Prep", null, TEAMS)).toEqual({
      team: TEAMS[0],
      title: "Prep",
    });
    expect(readTeamEvent("The A Team — Van wash", null, TEAMS)).toEqual({
      team: TEAMS[3],
      title: "Van wash",
    });
  });

  it("still reads the first convention, '[Team] title'", () => {
    expect(readTeamEvent("[Finance] Budget", "Finance", TEAMS)).toEqual({
      team: TEAMS[2],
      title: "Budget",
    });
    // The property wins over a tag that names another team.
    expect(readTeamEvent("[Kitchen] Briefing", "finance", TEAMS)).toEqual({
      team: TEAMS[2],
      title: "Briefing",
    });
  });

  it("keeps every word of a prefix that names no team", () => {
    expect(readTeamEvent("[Cancelled] Burn night", "Cancelled", TEAMS)).toEqual(
      { team: null, title: "[Cancelled] Burn night" },
    );
    expect(readTeamEvent("Early Team - notes", null, TEAMS)).toEqual({
      team: null,
      title: "Early Team - notes",
    });
    // A team's name without the separator is part of the title.
    expect(readTeamEvent("Kitchen Team dinner", null, TEAMS)).toEqual({
      team: null,
      title: "Kitchen Team dinner",
    });
    // An app-made event keeps a "[Cancelled]" the author added.
    expect(
      readTeamEvent("[Cancelled] Kitchen Team - Prep", "kitchen", TEAMS),
    ).toEqual({ team: TEAMS[0], title: "[Cancelled] Kitchen Team - Prep" });
  });

  it("leaves a title that is only a prefix whole", () => {
    expect(readTeamEvent("Kitchen Team - ", "kitchen", TEAMS)).toEqual({
      team: TEAMS[0],
      title: "Kitchen Team -",
    });
  });

  it("does not strip another team's name from a team's event", () => {
    // Its property says Kitchen; the Finance prefix is the author's text.
    expect(readTeamEvent("Finance Team - Budget", "kitchen", TEAMS)).toEqual({
      team: TEAMS[0],
      title: "Finance Team - Budget",
    });
  });
});
