import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAdminTools } from "./tools/admin";
import { registerDocumentTools } from "./tools/documents";
import { registerIdentityTools } from "./tools/identity";
import { registerPeopleTools } from "./tools/people";
import { registerProfileTools } from "./tools/profile";
import { registerQuestionnaireTools } from "./tools/questionnaires";
import { registerRecipeTools } from "./tools/recipes";
import { registerReimbursementTools } from "./tools/reimbursements";
import { registerTeamTools } from "./tools/teams";

/**
 * The camp's MCP surface. Each `register*Tools(server)` lives in its own
 * file under `./tools/`, one file per domain. Member-tier tools come first;
 * `./tools/admin` holds the captain-tier team, invite-code and audit tools and
 * `./tools/questionnaires` the drafting tools, each gated inside its handler on
 * the scope read fresh for the call.
 */
export function registerCampMcpTools(server: McpServer): void {
  registerIdentityTools(server);
  registerProfileTools(server);
  registerPeopleTools(server);
  registerTeamTools(server);
  registerRecipeTools(server);
  registerDocumentTools(server);
  registerReimbursementTools(server);
  registerAdminTools(server);
  registerQuestionnaireTools(server);
}
