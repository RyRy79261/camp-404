// @vitest-environment node
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { registerCampMcpTools, SERVER_INSTRUCTIONS } from "../server";

// Every tool the camp registers lists over a real MCP client, input schema
// included. This is what Claude reads to learn a tool's arguments, so a schema
// the SDK cannot turn into JSON Schema (the builder definition is a deep Zod
// type) would break the whole connector, not one tool. Every description
// starts with who may call the tool, and the website-only actions are not
// tools at all.

describe("MCP tool listing", () => {
  it("lists every tool with a JSON Schema for its input", async () => {
    const server = new McpServer(
      { name: "camp-404-test", version: "0.0.0" },
      { instructions: SERVER_INSTRUCTIONS },
    );
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
      "what_can_i_do",
      "assign_team_membership",
      "list_reimbursements",
      "create_document",
      "create_questionnaire_draft",
      "update_questionnaire_draft",
      "add_car_rider",
      "get_my_lift",
    ]) {
      expect(names).toContain(name);
    }
    // Website-only (owner, 2026-10-04), or dead.
    for (const name of [
      "set_team_budget",
      "mark_reimbursement_paid",
      "mark_reimbursement_reconciled",
      "complete_acknowledgement",
      // No ID numbers or bank details, for anyone (owner, 2026-10-05).
      "get_member_id_number",
      "get_claim_bank_details",
      "get_my_id_documents",
      "update_my_id_documents",
      "get_my_ai_consent",
      "set_my_ai_consent",
    ]) {
      expect(names).not.toContain(name);
    }
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.description).toMatch(/^Who: [^.]+\. \S/);
    }
    // The explainer the agent reads at initialize.
    expect(client.getInstructions()).toContain("what_can_i_do");
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
