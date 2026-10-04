import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOL_CAPABILITIES } from "./capabilities";
import { registerAdminTools } from "./tools/admin";
import { registerDocumentTools } from "./tools/documents";
import { registerIdentityTools } from "./tools/identity";
import { registerLiftTools } from "./tools/lifts";
import { registerPeopleTools } from "./tools/people";
import { registerProfileTools } from "./tools/profile";
import { registerQuestionnaireTools } from "./tools/questionnaires";
import { registerRecipeTools } from "./tools/recipes";
import { registerReimbursementTools } from "./tools/reimbursements";
import { registerTeamTools } from "./tools/teams";

/**
 * What the connector tells the agent at initialize, before any tool call: what
 * the camp is, the ladder, the privacy and money rules, and that some things
 * are the website's alone. Short on purpose: the per-person detail comes from
 * what_can_i_do.
 */
export const SERVER_INSTRUCTIONS = [
  "Camp 404 is a theme camp at AfrikaBurn, the regional Burning Man event in South Africa. This connector is its internal operations tool for 30 to 80 people: profiles, the roster, teams, transport, the Survival Guide, questionnaires, recipes and claims.",
  "You act as the signed-in person, with exactly their access on the website and never more. Call what_can_i_do first: it says their rank, the teams they lead, the tools they may use, and what they can only do on the website, with links.",
  "Ranks: member < team lead < captain. Leading any team this year makes someone a team lead everywhere in the app; which team they lead only decides who they can address, never what they can see.",
  "Privacy: never ask for, or repeat to anyone else, another person's ID number, bank details, emergency contacts or medical and dietary details. Read safety data (emergency contacts, allergies) only when it is needed, because every read of someone else's private data is recorded with the reader's name.",
  "Money is in South African rands (ZAR) only. Amounts come back in whole cents: 123450 is R1,234.50.",
  "Some things are website-only on purpose, because they cannot be undone or they reach many people at once: approving people and ranks, announcements and questionnaire sends, moving money (payments, marking claims paid, budgets), sending recipes to Claude, putting the guide on the public site, deleting or archiving, camp settings and a new year, invite codes, and uploads. Do not try to work around this: send the person to the page what_can_i_do links to.",
  "When a tool refuses, it says why in one sentence. Repeat it plainly; do not retry with other arguments to get round it.",
].join("\n\n");

/**
 * The server each tool file registers on: every tool must have an entry in
 * TOOL_CAPABILITIES (./capabilities), which says who may call it. Registering
 * one without throws, and each description starts with that audience, so the
 * listing tells the agent who may use a tool before it tries.
 */
export function withCapabilities(server: McpServer): McpServer {
  return {
    registerTool: ((
      name: string,
      config: { description?: string },
      cb: unknown,
    ) => {
      const capability = TOOL_CAPABILITIES[name];
      if (!capability) {
        throw new Error(`MCP tool ${name} has no entry in TOOL_CAPABILITIES`);
      }
      return server.registerTool(
        name,
        {
          ...config,
          description: `Who: ${capability.gate.who}. ${config.description ?? capability.does}`,
        } as never,
        cb as never,
      );
    }) as McpServer["registerTool"],
  } as unknown as McpServer;
}

/**
 * The camp's MCP surface. Each `register*Tools(server)` lives in its own
 * file under `./tools/`, one file per domain, and registers through
 * withCapabilities.
 */
export function registerCampMcpTools(server: McpServer): void {
  const described = withCapabilities(server);

  registerIdentityTools(described);
  registerProfileTools(described);
  registerPeopleTools(described);
  registerTeamTools(described);
  registerRecipeTools(described);
  registerDocumentTools(described);
  registerReimbursementTools(described);
  registerAdminTools(described);
  registerQuestionnaireTools(described);
  registerLiftTools(described);
}
