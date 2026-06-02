import { NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeAuthCode,
  findClient,
  issueAccessToken,
  rotateRefreshToken,
  verifyClientSecret,
} from "@/lib/mcp/oauth";
import { rateLimiter, getClientIp } from "@/lib/rate-limit";

// RFC 6749 §5.1 requires no-store on every response, success or error.
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const RESPONSE_HEADERS = { ...NO_STORE_HEADERS, ...CORS_HEADERS };

const AuthCodeBody = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  code_verifier: z.string().min(1),
});

const RefreshBody = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
});

export async function POST(req: Request) {
  const limited = await rateLimiter.limit(
    `mcp-token:${getClientIp(req.headers)}`,
    { limit: 30, windowMs: 60_000 },
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", error_description: "Too many token requests." },
      {
        status: 429,
        headers: {
          ...RESPONSE_HEADERS,
          "retry-after": String(limited.retryAfterSeconds),
        },
      },
    );
  }
  const body = await readBody(req);
  if ("__error" in body) {
    return tokenError("invalid_request", "Body could not be parsed.");
  }

  // Per RFC the credentials can come either in the body or in
  // Authorization: Basic <base64(client_id:client_secret)>. Support both.
  const basic = parseBasicAuth(req.headers.get("authorization"));
  if (basic) {
    body.client_id ??= basic.clientId;
    body.client_secret ??= basic.clientSecret;
  }

  if (body.grant_type === "authorization_code") {
    return handleAuthCode(body);
  }
  if (body.grant_type === "refresh_token") {
    return handleRefresh(body);
  }
  return tokenError("unsupported_grant_type", "Unknown grant_type.");
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------------------

async function handleAuthCode(body: Record<string, unknown>) {
  const parsed = AuthCodeBody.safeParse(body);
  if (!parsed.success) {
    return tokenError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid authorization_code body.",
    );
  }

  const client = await findClient(parsed.data.client_id);
  if (!client) return tokenError("invalid_client", "Unknown client_id.");

  if (client.tokenEndpointAuthMethod !== "none") {
    if (
      !parsed.data.client_secret ||
      !verifyClientSecret(parsed.data.client_secret, client.clientSecretHash)
    ) {
      return tokenError("invalid_client", "Bad client credentials.");
    }
  }

  const consumed = await consumeAuthCode({
    code: parsed.data.code,
    clientId: parsed.data.client_id,
    redirectUri: parsed.data.redirect_uri,
    codeVerifier: parsed.data.code_verifier,
  });
  if (!consumed) {
    return tokenError(
      "invalid_grant",
      "Code is invalid, expired, already used, or doesn't match the supplied redirect_uri / code_verifier.",
    );
  }

  const tokens = await issueAccessToken({
    clientId: parsed.data.client_id,
    userId: consumed.userId,
    scope: consumed.scope,
  });

  return tokenResponse(tokens);
}

async function handleRefresh(body: Record<string, unknown>) {
  const parsed = RefreshBody.safeParse(body);
  if (!parsed.success) {
    return tokenError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid refresh_token body.",
    );
  }

  const client = await findClient(parsed.data.client_id);
  if (!client) return tokenError("invalid_client", "Unknown client_id.");

  if (client.tokenEndpointAuthMethod !== "none") {
    if (
      !parsed.data.client_secret ||
      !verifyClientSecret(parsed.data.client_secret, client.clientSecretHash)
    ) {
      return tokenError("invalid_client", "Bad client credentials.");
    }
  }

  const rotated = await rotateRefreshToken({
    refreshToken: parsed.data.refresh_token,
    clientId: parsed.data.client_id,
  });
  if (!rotated) {
    return tokenError(
      "invalid_grant",
      "Refresh token is invalid, expired, or already rotated.",
    );
  }

  return tokenResponse(rotated);
}

// ---------------------------------------------------------------------------

function tokenResponse(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string;
}) {
  return NextResponse.json(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      refresh_expires_in: tokens.refreshExpiresIn,
      scope: tokens.scope,
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}

function tokenError(error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400, headers: RESPONSE_HEADERS },
  );
}

/**
 * Empty body + `application/json` content-type throws SyntaxError on a
 * naive `request.json()` — fuzz-tested in intake-tracker, matched here.
 */
async function readBody(req: Request): Promise<Record<string, unknown> & { __error?: string }> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const text = await req.text();
      if (!text.trim()) return {};
      return JSON.parse(text) as Record<string, unknown>;
    }
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch (err) {
    return { __error: String(err) };
  }
}

function parseBasicAuth(
  header: string | null,
): { clientId: string; clientSecret: string } | null {
  if (!header || !header.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString(
      "utf8",
    );
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return {
      clientId: decoded.slice(0, idx),
      clientSecret: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}
