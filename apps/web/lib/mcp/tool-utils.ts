import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { appendMcpAuditLog } from "@camp404/db/mcp";
import { getCampUserIdFromAuth } from "./auth";
import { getMcpScope, type McpScope } from "./scope";

/**
 * The context every tool handler receives after the scope + auth gate.
 * `clientId` is what we audit-log against; `scope` is the McpScope
 * snapshot resolved fresh for this call.
 */
export interface ToolCtx {
  scope: McpScope;
  clientId: string;
}

/**
 * Standard `extra` object shape passed by mcp-handler / the MCP SDK.
 * We only care about `authInfo` here.
 */
export interface ToolExtra {
  authInfo?: AuthInfo;
}

/**
 * Body wrapper every tool handler uses:
 *   1. Pull camp user id from auth info; bail with 401-equivalent error
 *      if missing.
 *   2. Resolve the McpScope; bail if no camp profile exists.
 *   3. Run the handler under try/catch.
 *   4. Audit-log success or failure with duration + redacted args.
 *   5. Stringify the result into a CallToolResult.
 *
 * Handlers may throw a {@link ToolError} for a controlled error reply
 * with a custom message; anything else gets wrapped as a generic
 * "Internal error" without leaking exception details to the caller.
 */
export async function runTool<T>(opts: {
  toolName: string;
  extra: ToolExtra;
  /** Redacted snapshot of input args for the audit log. Pass `null` for none. */
  argsForAudit: Record<string, unknown> | null;
  handler: (ctx: ToolCtx) => Promise<T>;
}): Promise<CallToolResult> {
  const started = Date.now();
  const campUserId = getCampUserIdFromAuth(opts.extra.authInfo);
  const clientId = opts.extra.authInfo?.clientId ?? "unknown";

  if (!campUserId) {
    return errorContent("Token is missing a camp user binding.");
  }

  const scope = await getMcpScope(campUserId);
  if (!scope) {
    await appendMcpAuditLog({
      campUserId,
      clientId,
      tool: opts.toolName,
      argsJson: opts.argsForAudit,
      outcome: "error",
      errorMessage: "No camp user row for token's campUserId",
      durationMs: Date.now() - started,
    });
    return errorContent(
      "Your camp profile no longer exists — complete signup in the app before reconnecting.",
    );
  }

  try {
    const result = await opts.handler({ scope, clientId });
    await appendMcpAuditLog({
      campUserId,
      clientId,
      tool: opts.toolName,
      argsJson: opts.argsForAudit,
      outcome: "success",
      durationMs: Date.now() - started,
    });
    return textContent(result);
  } catch (err) {
    const isControlled = err instanceof ToolError;
    const message = isControlled
      ? (err as ToolError).message
      : "Internal error.";
    await appendMcpAuditLog({
      campUserId,
      clientId,
      tool: opts.toolName,
      argsJson: opts.argsForAudit,
      outcome: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
    return errorContent(message);
  }
}

/**
 * Throw to send a specific error message back to the caller (e.g.
 * "permission denied", "not found"). Any other exception type is
 * masked to "Internal error" to avoid leaking implementation detail.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/** Shortcut for permission failures. */
export function deny(message = "Not permitted."): never {
  throw new ToolError(message);
}

/** Shortcut for "row not found" / "doesn't exist". */
export function notFound(message = "Not found."): never {
  throw new ToolError(message);
}

// ---------------------------------------------------------------------------
// CallToolResult shape helpers
// ---------------------------------------------------------------------------

export function textContent(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function errorContent(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// List-result conventions (proposal §"Cross-cutting rules")
// ---------------------------------------------------------------------------

export const MAX_LIST_ROWS = 5000;
export const MAX_DATE_RANGE_DAYS = 365;

/** Truncates an array to MAX_LIST_ROWS and tags the result. */
export function truncateList<T>(rows: T[]): {
  rows: T[];
  truncated: boolean;
  total: number;
} {
  if (rows.length > MAX_LIST_ROWS) {
    return {
      rows: rows.slice(0, MAX_LIST_ROWS),
      truncated: true,
      total: rows.length,
    };
  }
  return { rows, truncated: false, total: rows.length };
}
