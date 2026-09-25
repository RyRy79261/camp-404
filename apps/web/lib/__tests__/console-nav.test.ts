import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMP_CONFIG,
  activeTeams,
  renameTeam,
  setTeamArchived,
} from "@camp404/db/camp-config";
import {
  CONSOLE_NAV,
  activeNavHref,
  consoleNavFor,
  navTeams,
  type NavNode,
} from "../console-nav";
import { POWER_FUEL_PATH, POWER_LOADS_PATH } from "../power-copy";

/** The nav as "Label" for a link and "Group: a, b | c" for a menu. */
function outline(nodes: NavNode[]): string[] {
  return nodes.map((n) =>
    n.kind === "link"
      ? n.label
      : `${n.label}: ${n.sections.map((s) => s.map((i) => i.label).join(", ")).join(" | ")}`,
  );
}

const TEAMS = navTeams(activeTeams(DEFAULT_CAMP_CONFIG), ["kitchen"]);

describe("consoleNavFor", () => {
  it("shows a member the member entries and no Captains menu", () => {
    expect(outline(consoleNavFor("camp_member"))).toEqual([
      "Home",
      "Tasks",
      "Calendar",
      "Camp: Roster, Family tree, Meetings, Power, Recipes",
      "Me: Profile, Notifications, My forms, Invite, Sign-in & security",
    ]);
  });

  it("gives a team lead a Captains menu with building and sending only", () => {
    expect(outline(consoleNavFor("team_lead")).at(-1)).toBe(
      "Captains: Questionnaires, Announcements",
    );
  });

  it("gives a captain the whole Captains menu, in order", () => {
    expect(outline(consoleNavFor("captain")).at(-1)).toBe(
      "Captains: Camp overview, Questionnaires, Announcements, Payments, Camp settings, Join site, Audit, System status",
    );
  });

  it("drops a menu the viewer has no entry in", () => {
    // No teams passed: the Teams menu has nothing, so it is not drawn.
    const labels = consoleNavFor("captain").map((n) => n.label);
    expect(labels).toContain("Captains");
    expect(labels).not.toContain("Teams");
    expect(consoleNavFor("camp_member").map((n) => n.label)).not.toContain(
      "Captains",
    );
  });

  it("puts the Teams menu after Calendar, the viewer's teams in their own section", () => {
    const nodes = consoleNavFor("camp_member", TEAMS);
    expect(nodes.map((n) => n.label).slice(0, 4)).toEqual([
      "Home",
      "Tasks",
      "Calendar",
      "Teams",
    ]);
    const teams = nodes[3];
    expect(teams?.kind === "group" && teams.sections[0]).toEqual([
      { href: "/teams/kitchen", label: "Kitchen" },
    ]);
  });

  it("sends the client labels and links only, never the rank bar", () => {
    for (const node of consoleNavFor("captain", TEAMS)) {
      const items = node.kind === "link" ? [node] : node.sections.flat();
      for (const item of items) {
        expect(
          Object.keys(item)
            .filter((k) => k !== "kind")
            .sort(),
        ).toEqual(["href", "label"]);
      }
    }
  });

  it("lights the Power entry on both power pages", () => {
    const hrefs = CONSOLE_NAV.flatMap((n) =>
      n.kind === "group" ? n.entries.map((e) => e.href) : [],
    );
    for (const path of [POWER_LOADS_PATH, POWER_FUEL_PATH]) {
      expect(activeNavHref(path, hrefs)).toBe("/power");
    }
  });
});

describe("navTeams", () => {
  it("lists every active team in the camp's order, the viewer's own first", () => {
    const { mine, others } = navTeams(activeTeams(DEFAULT_CAMP_CONFIG), [
      "finance",
      "kitchen",
    ]);
    // Their own teams keep the camp's order too.
    expect(mine.map((t) => t.label)).toEqual(["Kitchen", "Finance"]);
    expect(others.map((t) => t.label)).not.toContain("Kitchen");
    expect(others[0]).toEqual({
      href: "/teams/structures",
      label: "Structures",
    });
    expect(mine.length + others.length).toBe(DEFAULT_CAMP_CONFIG.teams.length);
  });

  it("takes a team out when a captain archives it", () => {
    const before = navTeams(activeTeams(DEFAULT_CAMP_CONFIG), []);
    expect(before.others.map((t) => t.href)).toContain("/teams/sound");
    const archived = setTeamArchived(DEFAULT_CAMP_CONFIG, "sound", true);
    const after = navTeams(activeTeams(archived), []);
    expect(after.others.map((t) => t.href)).not.toContain("/teams/sound");
  });

  it("shows a team under the name camp settings give it", () => {
    const renamed = renameTeam(DEFAULT_CAMP_CONFIG, "sound", "Sound System");
    const { others } = navTeams(activeTeams(renamed), []);
    expect(others).toContainEqual({
      href: "/teams/sound",
      label: "Sound System",
    });
  });

  it("leaves out a key the team page cannot open", () => {
    const { others } = navTeams([{ key: "not_a_team", label: "Nope" }], []);
    expect(others).toEqual([]);
  });
});

describe("activeNavHref", () => {
  const hrefs = ["/", "/profile", "/profile/security", "/tasks"];

  it("lights the longest matching entry", () => {
    expect(activeNavHref("/profile/security", hrefs)).toBe("/profile/security");
    expect(activeNavHref("/profile/edit", hrefs)).toBe("/profile");
  });

  it("lights Home only on Home", () => {
    expect(activeNavHref("/", hrefs)).toBe("/");
    expect(activeNavHref("/elsewhere", hrefs)).toBeNull();
  });

  it("does not light an entry on a path that only starts with its text", () => {
    expect(activeNavHref("/tasksfoo", hrefs)).toBeNull();
  });
});
