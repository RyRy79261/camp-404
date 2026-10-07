import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerCampMcpTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/server";

// IMPORTANT: the file is /api/mcp/[transport]/route.ts and the connector URL
// is /api/mcp/mcp (transport segment value = "mcp"). Looks wrong, is correct:
// connectors already hold that URL. mcp-handler 2 serves whatever route it is
// mounted on, so any other segment (the old /api/mcp/sse) answers 404 here,
// as it did under 1.x's basePath.
const CONNECTOR_PATH = "/api/mcp/mcp";

const mcpHandler = createMcpHandler((server) => registerCampMcpTools(server), {
  serverInfo: { name: "camp-404", version: "0.1.0" },
  // Returned at initialize: what the camp is and how to use the tools.
  instructions: SERVER_INSTRUCTIONS,
});

async function baseHandler(req: Request): Promise<Response> {
  if (new URL(req.url).pathname !== CONNECTOR_PATH) {
    return new Response("Not found", { status: 404 });
  }
  return mcpHandler(req);
}

const authedHandler = withMcpAuth(baseHandler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

// CORS is required because Claude.ai is a different origin. The
// WWW-Authenticate header needs to be readable cross-origin so the
// client can follow the resource_metadata hint after a 401.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

async function handle(req: Request): Promise<Response> {
  const res = await authedHandler(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle; // MCP session termination

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
