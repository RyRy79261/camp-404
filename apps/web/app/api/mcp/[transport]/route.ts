import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerCampMcpTools } from "@/lib/mcp/server";

// IMPORTANT: with basePath: "/api/mcp" + file at
// /api/mcp/[transport]/route.ts, the connector URL is /api/mcp/mcp
// (transport segment value = "mcp"). Looks wrong, is correct.
const baseHandler = createMcpHandler(
  (server) => registerCampMcpTools(server),
  { serverInfo: { name: "camp-404", version: "0.1.0" } },
  { basePath: "/api/mcp", disableSse: true },
);

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
