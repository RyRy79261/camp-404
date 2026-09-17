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
    // A definition is the unified questionnaire model, or the builder's older
    // shape (still accepted and converted): either, as an object.
    const definition = (
      draft.inputSchema.properties as Record<
        string,
        { anyOf?: { type?: string; properties?: Record<string, unknown> }[] }
      >
    ).definition;
    expect(definition?.anyOf?.map((shape) => shape.type)).toEqual([
      "object",
      "object",
    ]);
    expect(
      definition?.anyOf?.map((shape) => Object.keys(shape.properties ?? {})),
    ).toEqual([
      ["version", "title", "pages"],
      ["version", "title", "pages"],
    ]);

    await client.close();
    await server.close();
  });
});
