import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocumentTools } from "./tools/documents";
import { registerIdentityTools } from "./tools/identity";
import { registerPeopleTools } from "./tools/people";
import { registerProfileTools } from "./tools/profile";
import { registerRecipeTools } from "./tools/recipes";
import { registerReimbursementTools } from "./tools/reimbursements";
import { registerTeamTools } from "./tools/teams";

/**
 * Member-tier MCP surface. Each `register*Tools(server)` lives in its
 * own file under `./tools/` — one file per domain. Captain-tier
 * admin tools (people writes, required actions, questionnaires,
 * reimbursement approvals, recipe review, document drafts) are
 * planned in a follow-up commit after the OAuth flow has been
 * smoke-tested against Claude.ai end-to-end.
 */
export function registerCampMcpTools(server: McpServer): void {
  registerIdentityTools(server);
  registerProfileTools(server);
  registerPeopleTools(server);
  registerTeamTools(server);
  registerRecipeTools(server);
  registerDocumentTools(server);
  registerReimbursementTools(server);
}
