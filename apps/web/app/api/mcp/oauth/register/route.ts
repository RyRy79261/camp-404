import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAllowedRedirectUri,
  registerClient,
} from "@/lib/mcp/oauth";
import { rateLimiter, getClientIp } from "@/lib/rate-limit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const RegisterRequest = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic", "client_secret_post"])
    .default("none"),
  scope: z.string().optional(),
  // Other RFC 7591 fields are accepted-but-ignored; reject nothing on shape.
});

// RFC 7591 — Dynamic Client Registration. Unauthenticated by design.
// Hardening: redirect URIs must be on a known MCP-client domain (loopback,
// claude.ai, anthropic.com) — see briefing gotcha — otherwise reject 400.
export async function POST(req: Request) {
  const limited = await rateLimiter.limit(
    `mcp-register:${getClientIp(req.headers)}`,
    { limit: 20, windowMs: 60_000 },
  );
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        error_description: "Too many registration attempts.",
      },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "retry-after": String(limited.retryAfterSeconds),
        },
      },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_client_metadata", "Body must be JSON.");
  }

  const parsed = RegisterRequest.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_client_metadata",
      parsed.error.issues[0]?.message ?? "Invalid registration payload.",
    );
  }

  const badUri = parsed.data.redirect_uris.find(
    (u) => !isAllowedRedirectUri(u),
  );
  if (badUri) {
    return errorResponse(
      "invalid_redirect_uri",
      `Redirect URI not allow-listed: ${badUri}`,
    );
  }

  const client = await registerClient({
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
    tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method,
    scope: parsed.data.scope,
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      scope: client.scope,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    },
    { status: 201, headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function errorResponse(error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400, headers: CORS_HEADERS },
  );
}
