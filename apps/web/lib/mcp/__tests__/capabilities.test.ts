import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { McpScopeRows } from "@camp404/db/mcp";
import {
  capabilitiesFor,
  TOOL_CAPABILITIES,
  WEBSITE_ONLY,
} from "../capabilities";
import { resolveMcpScope } from "../scope";
import { registerCampMcpTools, withCapabilities } from "../server";

// The capabilities answer (what_can_i_do), the refusals and the descriptions
// all come from TOOL_CAPABILITIES. This pins that the table and the registered
// tools are the same set, so a tool cannot be added without saying who may
// call it, and that each rung gets what the website gives it.

function registeredNames(): string[] {
  const names: string[] = [];
  registerCampMcpTools({
    registerTool: (name: string) => {
      names.push(name);
    },
  } as unknown as McpServer);
  return names;
}

function scopeOf(
  rank: "captain" | "member",
  memberships: McpScopeRows["teamMemberships"] = [],
  driverIntent = false,
) {
  return resolveMcpScope({
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      rank,
    },
    teamMemberships: memberships,
    driverIntent,
  });
}

function toolsFor(scope: ReturnType<typeof scopeOf>): string[] {
  return capabilitiesFor(scope).areas.flatMap((a) =>
    a.tools.map((t) => t.name),
  );
}

describe("TOOL_CAPABILITIES", () => {
  it("has exactly one entry per registered tool", () => {
    const names = registeredNames();
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(Object.keys(TOOL_CAPABILITIES).sort());
  });

  it("refuses to register a tool with no entry", () => {
    const server = withCapabilities({
      registerTool: () => undefined,
    } as unknown as McpServer);
    expect(() =>
      server.registerTool("not_a_tool", { description: "x" }, async () => ({
        content: [],
      })),
    ).toThrow(/no entry in TOOL_CAPABILITIES/);
  });
});

describe("capabilitiesFor", () => {
  it("gives a member the member tools and the member's website-only pages", () => {
    const caps = capabilitiesFor(scopeOf("member"));
    expect(caps.rank).toBe("camp_member");
    const tools = toolsFor(scopeOf("member"));
    expect(tools).toContain("update_my_dietary_requirements");
    expect(tools).toContain("add_car_rider");
    expect(tools).not.toContain("list_reimbursements");
    expect(tools).not.toContain("create_document");
    const pages = caps.areas.flatMap((a) => a.websiteOnly.map((w) => w.what));
    expect(pages).toContain("Make an invite code");
    expect(pages).not.toContain("Set a team's budget");
  });

  it("gives a lead of any team the team-lead tools", () => {
    const kitchen = toolsFor(
      scopeOf("member", [{ team: "kitchen", isLead: true }]),
    );
    expect(kitchen).toContain("create_document");
    expect(kitchen).toContain("approve_reimbursement");
    expect(kitchen).not.toContain("list_audit_log");
  });

  it("gives a captain every tool", () => {
    expect(toolsFor(scopeOf("captain")).sort()).toEqual(
      Object.keys(TOOL_CAPABILITIES).sort(),
    );
  });

  it("links each website-only action to a full address on the site", () => {
    const caps = capabilitiesFor(scopeOf("captain"));
    const urls = caps.areas.flatMap((a) => a.websiteOnly.map((w) => w.url));
    expect(urls.length).toBe(
      WEBSITE_ONLY.filter((w) => w.gate.allows(scopeOf("captain"))).length,
    );
    for (const url of urls) expect(url).toMatch(/^https?:\/\/[^/]+\/\S*/);
  });

  it("offers the car message only to someone driving this year", () => {
    const what = (driving: boolean) =>
      capabilitiesFor(scopeOf("member", [], driving)).areas.flatMap((a) =>
        a.websiteOnly.map((w) => w.what),
      );
    expect(what(true)).toContain("Write to everyone riding in your car");
    expect(what(false)).not.toContain("Write to everyone riding in your car");
  });
});
