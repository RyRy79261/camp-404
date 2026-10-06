import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { appendMcpAuditLog as dbAppendMcpAuditLog } from "@camp404/db/mcp";
import { getCampUserIdFromAuth } from "./auth";
import { refusalFor, TOOL_CAPABILITIES } from "./capabilities";
import { getMcpScope, type McpScope } from "./scope";

/**
 * The connector's audit row. In the E2E test store (voice drives these tools
 * in Playwright, #356) it is kept in memory; everywhere else, mcp_audit_log.
 */
async function appendMcpAuditLog(
  row: Parameters<typeof dbAppendMcpAuditLog>[0],
): Promise<void> {
  if (
    process.env.E2E_TEST_MODE === "1" &&
    process.env.E2E_DATABASE !== "real"
  ) {
    const { voiceTestStore } = await import("../test-store-voice");
    voiceTestStore.appendAudit({
      campUserId: row.campUserId,
      clientId: row.clientId,
      tool: row.tool,
      argsJson: (row.argsJson ?? null) as Record<string, unknown> | null,
      outcome: row.outcome,
      errorMessage: row.errorMessage ?? null,
    });
    return;
  }
  await dbAppendMcpAuditLog(row);
}

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
 *   3. Refuse, in the gate's own sentence, a caller the tool's entry in
 *      TOOL_CAPABILITIES does not allow (the same entry what_can_i_do
 *      reads, so the two cannot disagree).
 *   4. Run the handler under try/catch.
 *   5. Audit-log success or failure with duration + redacted args (a
 *      failure as auditErrorText: never a raw error's message).
 *   6. Stringify the result into a CallToolResult.
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
      "Your Camp 404 account isn't active right now — sign in to the app, then reconnect.",
    );
  }

  try {
    const capability = TOOL_CAPABILITIES[opts.toolName];
    if (!capability) {
      throw new Error(`MCP tool ${opts.toolName} has no capabilities entry`);
    }
    if (!capability.gate.allows(scope)) deny(refusalFor(capability));
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
      errorMessage: auditErrorText(err),
      durationMs: Date.now() - started,
    });
    return errorContent(message);
  }
}

/** A Postgres SQLSTATE: five digits or capital letters. */
function sqlState(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

/**
 * What the connector's log keeps of a failed call. A ToolError's message is
 * our own sentence, so it is kept. Anything else is reduced to its class and
 * Postgres code: a failed query's message carries the query's values (the
 * phone number or answers being saved), and the log is no place for them.
 */
export function auditErrorText(err: unknown): string {
  if (err instanceof ToolError) return err.message;
  if (!(err instanceof Error)) return "Thrown non-error";
  // DrizzleQueryError keeps the name "Error"; its class says more.
  const kind =
    err.name !== "Error" ? err.name : err.constructor?.name || err.name;
  const code = sqlState(err) ?? sqlState(err.cause);
  return code ? `${kind} (${code})` : kind;
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
