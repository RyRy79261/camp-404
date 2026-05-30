import { NextResponse } from "next/server";
import { z } from "zod";
import {
  findUserByAuthId,
  getBurnerProfileByUserId,
} from "@camp404/db/burner-profile";
import { getAuthenticatedUser } from "@/lib/auth";
import { hasCampAccess, isApproved } from "@/lib/users";
import { mcpAccessError } from "@/lib/mcp/access";
import {
  DEFAULT_SCOPE,
  findClient,
  isAllowedScope,
  issueAuthCode,
} from "@/lib/mcp/oauth";

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const AuthorizeQuery = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.enum(["S256", "plain"]).default("S256"),
  scope: z.string().optional(),
  state: z.string().optional(),
});

type AuthorizeParams = z.infer<typeof AuthorizeQuery>;

function parseParams(searchParams: URLSearchParams) {
  return AuthorizeQuery.safeParse(Object.fromEntries(searchParams.entries()));
}

async function resolveClientOrError(params: AuthorizeParams) {
  const client = await findClient(params.client_id);
  if (!client) {
    return errorPage(400, "unknown_client", "Unknown client_id.");
  }
  if (!client.redirectUris.includes(params.redirect_uri)) {
    return errorPage(
      400,
      "invalid_redirect_uri",
      "redirect_uri does not match any URI registered for this client.",
    );
  }
  const scope = params.scope ?? DEFAULT_SCOPE;
  if (!isAllowedScope(scope)) {
    return redirectError(
      params.redirect_uri,
      "invalid_scope",
      params.state,
    );
  }
  return { client, scope };
}

// ---------------------------------------------------------------------------
// GET — render consent screen
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = parseParams(url.searchParams);
  if (!parsed.success) {
    return errorPage(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid authorize request.",
    );
  }

  const resolved = await resolveClientOrError(parsed.data);
  if (resolved instanceof NextResponse) return resolved;

  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    const next = `/api/mcp/oauth/authorize?${url.searchParams.toString()}`;
    return NextResponse.redirect(
      new URL(`/mcp/connect?next=${encodeURIComponent(next)}`, req.url),
    );
  }

  const campUser = await findUserByAuthId(authUser.id);
  if (!campUser) {
    return errorPage(
      403,
      "no_camp_account",
      "You're signed in, but you don't have a Camp 404 profile yet. Open the app and enter your invite code before connecting Claude.",
    );
  }

  // Mirror the app's own gate — a token must not be issued to a member who
  // lacks camp access, hasn't finished onboarding, or is awaiting captain
  // approval (each of which blocks them in the app itself).
  const profile = await getBurnerProfileByUserId(campUser.id);
  const denied = mcpAccessError({
    hasCampAccess: hasCampAccess(campUser, authUser.primaryEmail),
    profileComplete: !!profile?.completedAt,
    isApproved: isApproved(campUser, authUser.primaryEmail),
  });
  if (denied) return errorPage(403, denied.error, denied.description);

  return consentHtml({
    clientName: resolved.client.clientName,
    scope: resolved.scope,
    displayName: campUser.displayName ?? authUser.primaryEmail ?? "You",
    params: parsed.data,
  });
}

// ---------------------------------------------------------------------------
// POST — approve / deny
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return errorPage(400, "invalid_request", "Form body required.");
  }

  const action = form.get("action");
  const rebuilt = new URLSearchParams();
  for (const [k, v] of form.entries()) {
    if (k === "action") continue;
    if (typeof v === "string") rebuilt.append(k, v);
  }
  const parsed = parseParams(rebuilt);
  if (!parsed.success) {
    return errorPage(
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid authorize submission.",
    );
  }

  const resolved = await resolveClientOrError(parsed.data);
  if (resolved instanceof NextResponse) return resolved;

  if (action === "deny") {
    return htmlRedirect(
      buildRedirectUrl(parsed.data.redirect_uri, {
        error: "access_denied",
        ...(parsed.data.state ? { state: parsed.data.state } : {}),
      }),
    );
  }

  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return errorPage(401, "unauthenticated", "Session expired. Try again.");
  }
  const campUser = await findUserByAuthId(authUser.id);
  if (!campUser) {
    return errorPage(
      403,
      "no_camp_account",
      "No Camp 404 profile for this account.",
    );
  }

  const profile = await getBurnerProfileByUserId(campUser.id);
  const denied = mcpAccessError({
    hasCampAccess: hasCampAccess(campUser, authUser.primaryEmail),
    profileComplete: !!profile?.completedAt,
    isApproved: isApproved(campUser, authUser.primaryEmail),
  });
  if (denied) return errorPage(403, denied.error, denied.description);

  const code = await issueAuthCode({
    clientId: parsed.data.client_id,
    userId: campUser.id,
    redirectUri: parsed.data.redirect_uri,
    codeChallenge: parsed.data.code_challenge,
    codeChallengeMethod: parsed.data.code_challenge_method,
    scope: resolved.scope,
  });

  return htmlRedirect(
    buildRedirectUrl(parsed.data.redirect_uri, {
      code,
      ...(parsed.data.state ? { state: parsed.data.state } : {}),
    }),
  );
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function consentHtml(opts: {
  clientName: string;
  scope: string;
  displayName: string;
  params: AuthorizeParams;
}): NextResponse {
  const hiddenInputs = Object.entries(opts.params)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}">`,
    )
    .join("\n");

  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect ${escapeHtml(opts.clientName)} — Camp 404</title>
  <style>
    body { font: 14px/1.5 system-ui, sans-serif; margin: 0; min-height: 100dvh;
           display: flex; align-items: center; justify-content: center;
           background: #0a0a0a; color: #fafafa; }
    main { max-width: 28rem; padding: 1.5rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { margin: 0.5rem 0; color: #a3a3a3; }
    .scope { background: #171717; border: 1px solid #262626; border-radius: 6px;
             padding: 0.75rem 1rem; margin: 1rem 0; font-family: ui-monospace, monospace; }
    .row { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    button { flex: 1; padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid;
             font-size: 0.875rem; font-weight: 500; cursor: pointer; }
    .approve { background: #fafafa; color: #0a0a0a; border-color: #fafafa; }
    .deny    { background: transparent; color: #fafafa; border-color: #525252; }
  </style>
</head>
<body>
  <main>
    <h1>Connect ${escapeHtml(opts.clientName)} to Camp 404</h1>
    <p>Signed in as <strong>${escapeHtml(opts.displayName)}</strong>.</p>
    <p>${escapeHtml(opts.clientName)} is asking for permission to access your camp data through the MCP connector. It will be able to see and edit what you can see and edit in the app.</p>
    <div class="scope"><strong>Scope:</strong> ${escapeHtml(opts.scope)}</div>
    <form method="POST" action="/api/mcp/oauth/authorize">
      ${hiddenInputs}
      <div class="row">
        <button type="submit" name="action" value="deny"    class="deny">Deny</button>
        <button type="submit" name="action" value="approve" class="approve">Approve</button>
      </div>
    </form>
  </main>
</body>
</html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Document-level navigation via meta refresh + JS — required instead of
 * a 302 because CSP `form-action 'self'` silently drops cross-origin
 * redirects from POST handlers. Briefing gotcha #4.
 */
function htmlRedirect(target: string): NextResponse {
  const e = escapeHtml(target);
  const body = `<!doctype html><html><head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${e}">
</head><body>
  <p>Redirecting… <a href="${e}">Continue</a> if not redirected.</p>
  <script>window.location.replace(${JSON.stringify(target)});</script>
</body></html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function buildRedirectUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

function redirectError(
  redirectUri: string,
  error: string,
  state: string | undefined,
) {
  return htmlRedirect(
    buildRedirectUrl(redirectUri, {
      error,
      ...(state ? { state } : {}),
    }),
  );
}

function errorPage(
  status: number,
  error: string,
  description: string,
): NextResponse {
  const body = `<!doctype html><html><head>
  <meta charset="utf-8"><title>${escapeHtml(error)}</title>
  <style>body{font:14px/1.5 system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto;background:#0a0a0a;color:#fafafa}h1{margin:0 0 .5rem}p{color:#a3a3a3}</style>
</head><body>
  <h1>${escapeHtml(error)}</h1>
  <p>${escapeHtml(description)}</p>
</body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
