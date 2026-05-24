import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendMcpAuditLog } from "@camp404/db/mcp";
import { getCampUserIdFromAuth } from "./auth";
import { getMcpScope } from "./scope";

/**
 * Single entry point that registers every tool the camp MCP server
 * exposes. Future phases append more `server.registerTool(...)` calls
 * here (or split into per-domain files that are imported and called
 * from this function).
 */
export function registerCampMcpTools(server: McpServer): void {
  registerWhoami(server);
}

// ---------------------------------------------------------------------------
// Identity: whoami
// ---------------------------------------------------------------------------

function registerWhoami(server: McpServer): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Returns the current camp user's identity and capability snapshot — rank (captain or member), team memberships, which of those they lead, whether they have registered intent to drive, and their AI-data-consent flag. The first tool to call when starting a session.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const started = Date.now();
      const campUserId = getCampUserIdFromAuth(extra.authInfo);
      const clientId = extra.authInfo?.clientId ?? "unknown";

      if (!campUserId) {
        await appendMcpAuditLog({
          campUserId: "00000000-0000-0000-0000-000000000000",
          clientId,
          tool: "whoami",
          argsJson: null,
          outcome: "error",
          errorMessage: "Missing campUserId on auth info",
          durationMs: Date.now() - started,
        });
        return errorContent("Token is missing a camp user binding.");
      }

      const scope = await getMcpScope(campUserId);
      if (!scope) {
        await appendMcpAuditLog({
          campUserId,
          clientId,
          tool: "whoami",
          argsJson: null,
          outcome: "error",
          errorMessage: "No camp user row for token's campUserId",
          durationMs: Date.now() - started,
        });
        return errorContent(
          "Your camp profile no longer exists — sign in to the app and complete signup before reconnecting.",
        );
      }

      await appendMcpAuditLog({
        campUserId,
        clientId,
        tool: "whoami",
        argsJson: null,
        outcome: "success",
        durationMs: Date.now() - started,
      });

      return textContent({
        campUserId: scope.campUserId,
        rank: scope.rank,
        isCaptain: scope.isCaptain,
        isDriver: scope.isDriver,
        memberTeams: scope.memberTeams,
        leadTeams: scope.leadTeams,
        aiDataConsent: scope.aiDataConsent,
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Tool result helpers
// ---------------------------------------------------------------------------

function textContent(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
