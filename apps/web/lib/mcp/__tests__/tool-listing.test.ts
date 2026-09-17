// @vitest-environment node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerCampMcpTools } from "../server";

// Every tool the camp registers lists over a real MCP client, input schema
// included. This is what Claude reads to learn a tool's arguments, so a schema
// the SDK cannot turn into JSON Schema (the builder definition is a deep Zod
// type) would break the whole connector, not one tool.

describe("MCP tool listing", () => {
  it("lists every tool with a JSON Schema for its input", async () => {
    const server = new McpServer({ name: "camp-404-test", version: "0.0.0" });
    registerCampMcpTools(server);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of [
      "whoami",
      "assign_team_membership",
      "list_reimbursements",
      "set_team_budget",
      "create_document",
      "create_questionnaire_draft",
      "update_questionnaire_draft",
      "add_car_rider",
    ]) {
      expect(names).toContain(name);
    }
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
    }
    const draft = tools.find((t) => t.name === "update_questionnaire_draft")!;
    // A definition is the unified questionnaire model, and only that: one
    // object schema, so every client loads it into its context once.
    const definition = (
      draft.inputSchema.properties as Record<
        string,
        { type?: string; anyOf?: unknown; properties?: Record<string, unknown> }
      >
    ).definition;
    expect(definition?.anyOf).toBeUndefined();
    expect(definition?.type).toBe("object");
    expect(Object.keys(definition?.properties ?? {})).toEqual([
      "version",
      "title",
      "pages",
    ]);

    await client.close();
    await server.close();
  });
});
