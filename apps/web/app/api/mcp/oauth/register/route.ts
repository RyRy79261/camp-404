import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_SCOPE,
  isAllowedRedirectUri,
  isAllowedScope,
  registerBoundedClient,
  registrationAddressKey,
} from "@/lib/mcp/oauth";
import { rateLimiter, getClientIp } from "@/lib/rate-limit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** A real registration is a few hundred bytes. */
const MAX_REGISTER_BODY_BYTES = 16 * 1024;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 512;
const MAX_SCOPE_LENGTH = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Registration attempts allowed per address (an IPv6 /64), per minute and per
 * day. Registration is open to anyone (RFC 7591); these, the size caps above,
 * the cap on stored clients nobody authorized (registerBoundedClient) and the
 * daily sweep of those (background-work.ts) keep its storage bounded. The
 * camp has one connector per person, so a day's allowance is far more than a
 * member ever uses.
 */
const REGISTER_LIMITS = {
  perAddressPerMinute: 20,
  perAddressPerDay: 50,
} as const;

const RegisterRequest = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z
    .array(z.string().max(MAX_REDIRECT_URI_LENGTH).url())
    .min(1)
    .max(MAX_REDIRECT_URIS),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic", "client_secret_post"])
    .default("none"),
  scope: z.string().max(MAX_SCOPE_LENGTH).optional(),
  // Other RFC 7591 fields are accepted-but-ignored; reject nothing on shape.
});

// RFC 7591 — Dynamic Client Registration. Unauthenticated by design.
// Hardening: redirect URIs must be on a known MCP-client domain (loopback,
// claude.ai, anthropic.com) — see briefing gotcha — otherwise reject 400.
export async function POST(req: Request) {
  const ip = registrationAddressKey(getClientIp(req.headers));
  for (const [key, limit, windowMs] of [
    [`mcp-register:${ip}`, REGISTER_LIMITS.perAddressPerMinute, 60_000],
    [`mcp-register-day:${ip}`, REGISTER_LIMITS.perAddressPerDay, DAY_MS],
  ] as const) {
    const limited = await rateLimiter.limit(key, { limit, windowMs });
    if (!limited.ok) return tooMany(limited.retryAfterSeconds);
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REGISTER_BODY_BYTES) {
    return tooLarge();
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return errorResponse("invalid_client_metadata", "Body must be JSON.");
  }
  // The header can be missing or wrong (a chunked body): the body decides.
  if (Buffer.byteLength(text, "utf8") > MAX_REGISTER_BODY_BYTES) {
    return tooLarge();
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
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

  const scope = parsed.data.scope?.trim() || DEFAULT_SCOPE;
  if (!isAllowedScope(scope)) {
    return errorResponse(
      "invalid_client_metadata",
      `Unknown scope. The one scope is ${DEFAULT_SCOPE}.`,
    );
  }

  // Storage stays bounded by pushing out the oldest client nobody
  // authorized, rather than by turning newcomers away.
  const client = await registerBoundedClient({
    clientName: parsed.data.client_name,
    redirectUris: [...new Set(parsed.data.redirect_uris)],
    tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method,
    scope,
  });
  if (!client) return tooMany(600);

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

function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "rate_limited",
      error_description: "Too many registration attempts.",
    },
    {
      status: 429,
      headers: { ...CORS_HEADERS, "retry-after": String(retryAfterSeconds) },
    },
  );
}

function tooLarge() {
  return NextResponse.json(
    {
      error: "invalid_client_metadata",
      error_description: "Registration body too large.",
    },
    { status: 413, headers: CORS_HEADERS },
  );
}
