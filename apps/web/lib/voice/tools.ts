import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TOOL_CAPABILITIES, type Area } from "../mcp/capabilities";
import type { McpScope } from "../mcp/scope";
import { registerCampMcpTools } from "../mcp/server";

// Voice (#356) uses the Claude connector's own tools: the same table
// (TOOL_CAPABILITIES), the same handlers, the same gates and the same audit
// row (mcp_audit_log, client "voice"). Nothing here decides who may do what.
// This file only records the handlers registerCampMcpTools registers and
// calls them as the signed-in captain, never as anyone else.
//
// A tool added to or removed from the connector is added to or removed from
// voice with it: there is no second list to drift.

/** The client id voice's calls are audited under in mcp_audit_log. */
export const VOICE_CLIENT_ID = "voice";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;

export interface VoiceTool {
  name: string;
  kind: "read" | "write";
  area: Area;
  /** The connector's description, "Who: …" first. */
  description: string;
  shape: z.ZodRawShape;
  handler: Handler;
}

let registry: Map<string, VoiceTool> | null = null;

/** Every connector tool, recorded once per process. */
export function voiceRegistry(): Map<string, VoiceTool> {
  if (registry) return registry;
  const tools = new Map<string, VoiceTool>();
  registerCampMcpTools({
    registerTool: (
      name: string,
      config: { description?: string; inputSchema?: z.ZodObject },
      handler: Handler,
    ) => {
      const capability = TOOL_CAPABILITIES[name];
      if (!capability) throw new Error(`No capability for ${name}`);
      tools.set(name, {
        name,
        kind: capability.kind,
        area: capability.area,
        description: shortDescription(config.description ?? capability.does),
        shape: config.inputSchema?.shape ?? {},
        handler,
      });
    },
  } as unknown as McpServer);
  registry = tools;
  return tools;
}

/**
 * The tools this person's gates allow, in the table's order (a fixed order,
 * so one set of areas is always the same bytes and its cache entry hits),
 * narrowed to `areas` when given (lib/voice/areas.ts).
 */
export function toolsFor(
  scope: McpScope,
  areas?: readonly Area[],
): VoiceTool[] {
  const all = voiceRegistry();
  return Object.entries(TOOL_CAPABILITIES)
    .filter(
      ([name, c]) =>
        all.has(name) &&
        c.gate.allows(scope) &&
        (!areas || areas.includes(c.area)),
    )
    .map(([name]) => all.get(name)!);
}

/** Longest tool description sent to Claude, in characters. */
const MAX_DESCRIPTION = 420;
/** Longest argument description. */
const MAX_ARG_DESCRIPTION = 100;

/**
 * A tool's description as Claude needs it: without the connector's "Who: …"
 * line (the server gates every call anyway), and cut at a sentence once it
 * passes MAX_DESCRIPTION.
 */
export function shortDescription(description: string): string {
  const text = description.replace(/^Who: [^.]*\.\s*/, "").trim();
  if (text.length <= MAX_DESCRIPTION) return text;
  const cut = text.slice(0, MAX_DESCRIPTION);
  const end = cut.lastIndexOf(". ");
  return end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/** Keys a read keeps even when null: what a compare-and-set reads back. */
const KEEP_NULL = new Set(["mine", "expected", "status", "from", "answer"]);

/**
 * A read's result as Claude gets it: no links (the panel links the page
 * itself), no empty values except the ones a compare-and-set needs.
 */
export function compactResult(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(compactResult);
  if (!data || typeof data !== "object") return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "url") continue;
    if (value === null && !KEEP_NULL.has(key)) continue;
    if (value === undefined) continue;
    out[key] = compactResult(value);
  }
  return out;
}

const STRIP = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "pattern",
  "default",
  "format",
  "minProperties",
  "maxProperties",
  "propertyNames",
]);

/** A JSON Schema without the keywords the Messages API refuses in a tool. */
function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRIP.has(key)) continue;
    out[key] =
      key === "description" && typeof value === "string"
        ? value.slice(0, MAX_ARG_DESCRIPTION)
        : clean(value);
  }
  return out;
}

/** A tool's input as JSON Schema, for Claude. */
export function inputJsonSchema(tool: VoiceTool): Record<string, unknown> {
  const schema = z.toJSONSchema(z.object(tool.shape), {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  const cleaned = clean(schema) as Record<string, unknown>;
  return { ...cleaned, type: "object" };
}

/**
 * A tool's arguments checked by its own schema, as the MCP SDK checks them
 * before a handler runs. A JSON null on an argument the tool takes as
 * optional (not nullable) reads as left out.
 */
export function parseArgs(
  tool: VoiceTool,
  raw: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "The arguments are not an object." };
  }
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = tool.shape[key] as z.ZodType | undefined;
    if (!field) continue;
    if (value === null && !field.safeParse(null).success) continue;
    input[key] = value;
  }
  const parsed = z.object(tool.shape).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue
        ? `${issue.path.join(".") || "arguments"}: ${issue.message}`
        : "The arguments do not fit the tool.",
    };
  }
  return { ok: true, args: parsed.data as Record<string, unknown> };
}

export type ToolCallResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Call one connector tool as `campUserId`, through its own handler: runTool
 * reads that person's scope fresh, refuses what their gate does not allow,
 * and writes the mcp_audit_log row under client "voice". The id is always
 * the signed-in person's own (the caller passes the session's), never one
 * Claude chose.
 */
export async function callTool(
  name: string,
  rawArgs: unknown,
  campUserId: string,
): Promise<ToolCallResult> {
  const tool = voiceRegistry().get(name);
  if (!tool) return { ok: false, error: `There is no tool called ${name}.` };
  const parsed = parseArgs(tool, rawArgs);
  if (!parsed.ok) return parsed;
  const result = await tool.handler(parsed.args, {
    http: {
      authInfo: {
        token: "",
        clientId: VOICE_CLIENT_ID,
        scopes: [],
        extra: { campUserId },
      },
    },
  });
  const text = result.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  if (result.isError) return { ok: false, error: text };
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: true, data: text };
  }
}
