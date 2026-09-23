import { describe, expect, it } from "vitest";
import { CONSOLE_NAV, consoleNavFor } from "../console-nav";

describe("consoleNavFor", () => {
  it("shows a member only the member destinations", () => {
    expect(consoleNavFor("camp_member").map((i) => i.label)).toEqual([
      "Home",
      "Tasks",
      "Roster",
      "My forms",
      "Family tree",
      "Invite",
    ]);
  });

  it("adds building and sending for a team lead, but no captain pages", () => {
    const labels = consoleNavFor("team_lead").map((i) => i.label);
    expect(labels).toContain("Questionnaires");
    expect(labels).toContain("Announcements");
    expect(labels).not.toContain("Payments");
    expect(labels).not.toContain("Audit");
    expect(labels).not.toContain("Camp overview");
    expect(labels).not.toContain("System status");
  });

  it("gives the System status page to captains only", () => {
    expect(consoleNavFor("camp_member").map((i) => i.href)).not.toContain(
      "/captains/system",
    );
    expect(consoleNavFor("captain")).toContainEqual({
      href: "/captains/system",
      label: "System status",
    });
  });

  it("shows a captain everything, in bar order", () => {
    expect(consoleNavFor("captain").map((i) => i.href)).toEqual(
      CONSOLE_NAV.map((e) => e.href),
    );
  });

  it("sends the client labels and links only, never the rank bar", () => {
    for (const item of consoleNavFor("captain")) {
      expect(Object.keys(item).sort()).toEqual(["href", "label"]);
    }
  });
});
