import { NextResponse } from "next/server";
import { z } from "zod";
import {
  findUserByAuthId,
  getBurnerProfileByUserId,
} from "@camp404/db/burner-profile";
import { getAuthenticatedUser } from "@/lib/auth";
import { hasCampAccess, isApproved } from "@/lib/users";
import { mcpAccessError, type McpAccessDenial } from "@/lib/mcp/access";
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
  code_challenge_method: z.enum(["S256"]).default("S256"),
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
    return redirectError(params.redirect_uri, "invalid_scope", params.state);
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
  if (denied) return denialResponse(denied);

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
  if (denied) return denialResponse(denied);

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
// HTML helpers. This route emits raw HTML outside the Next/React/Tailwind
// shell, so the console's tokens are resolved inline as a :root block (kept in
// sync with packages/ui globals.css: the AfrikaBurn surfaces wearing the Camp
// 404 magenta accent) and the lucide glyphs are inlined as SVG. The page is the
// console's auth card: an icon circle and eyebrow over one card. Montserrat
// can't be loaded here, so it keeps a system stack.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Inlined lucide paths: user, shield, lock, triangle-alert (sized by CSS).
const ICON = {
  user: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  shield: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`,
  lock: `<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  alert: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
} as const;

type IconName = keyof typeof ICON;

function svgIcon(inner: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Human-facing copy for the (currently single) MCP scope.
const SCOPE_COPY: Record<string, string> = {
  "mcp:user": "Read your basic profile",
};

const THEME_STYLE = `
  :root {
    --background: #17191b;
    --foreground: #f4f0e8;
    --card: #1f2326;
    --card-foreground: #f4f0e8;
    --muted: #262b2f;
    --muted-foreground: #adb6b3;
    --border: #323a3f;
    --primary: oklch(0.72 0.2 345);
    --primary-foreground: #17191b;
    --accent: oklch(0.72 0.2 345);
    --accent-soft: oklch(0.72 0.2 345 / 0.15);
    --radius: 0.75rem;
    --radius-control: 0.375rem;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; padding: 3rem 1.5rem;
    display: flex; align-items: center; justify-content: center;
    background: var(--background); color: var(--foreground);
    font: 500 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .shell { width: 100%; max-width: 24rem; display: flex; flex-direction: column; gap: 1rem; }
  .mark { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; }
  .mark-icon {
    width: 3rem; height: 3rem; border-radius: 9999px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft); color: var(--accent);
  }
  .mark-icon svg { width: 1.25rem; height: 1.25rem; }
  .eyebrow {
    margin: 0; font-family: var(--mono); font-size: 0.75rem;
    text-transform: uppercase; letter-spacing: 0.3em; color: var(--accent);
  }
  h1.title {
    margin: 0; font-size: 1.5rem; line-height: 2rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.01em; color: var(--card-foreground);
  }
  .card {
    background: var(--card); color: var(--card-foreground);
    border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;
  }
  .muted { color: var(--muted-foreground); }
  .identity { display: flex; gap: 0.625rem; align-items: center; }
  .avatar {
    width: 2rem; height: 2rem; border-radius: 9999px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft); color: var(--accent);
  }
  .avatar svg, .scope-icon svg { width: 1rem; height: 1rem; }
  .identity-name { font-size: 0.875rem; font-weight: 600; color: var(--card-foreground); }
  .req-row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .req-row .label { font-size: 0.875rem; color: var(--muted-foreground); }
  .req-row .value { font-size: 0.875rem; font-weight: 600; color: var(--card-foreground); }
  .scope-row {
    display: flex; gap: 0.75rem; align-items: center; padding: 0.75rem;
    border-radius: 0.5rem; background: var(--muted);
  }
  .scope-icon {
    width: 2.25rem; height: 2.25rem; border-radius: 0.5rem; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft); color: var(--accent);
  }
  .scope-text { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
  .scope-name { font-family: var(--mono); font-size: 0.75rem; color: var(--card-foreground); }
  .scope-desc { font-size: 0.75rem; color: var(--muted-foreground); }
  form { margin: 0; }
  .btn-row { display: flex; gap: 0.75rem; }
  .btn {
    flex: 1; height: 2.75rem; padding: 0 1rem; border-radius: var(--radius-control);
    font-family: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: 1px solid;
  }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn-primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
  .btn-outline { background: var(--background); color: var(--foreground); border-color: var(--border); }
  .gate-text { font-size: 0.875rem; color: var(--muted-foreground); margin: 0; }
  .err-title {
    margin: 0; font-size: 1.125rem; line-height: 1.75rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.01em;
  }
  .card.tight { gap: 0.375rem; }
  .err-desc { margin: 0; font-size: 0.875rem; color: var(--muted-foreground); }
`;

function htmlDoc(title: string, icon: IconName, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${THEME_STYLE}</style>
</head>
<body><main class="shell">
  <div class="mark">
    <span class="mark-icon">${svgIcon(ICON[icon])}</span>
    <p class="eyebrow">Camp 404</p>
  </div>
  ${inner}
</main></body>
</html>`;
}

function htmlResponse(status: number, html: string): NextResponse {
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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
    .join("\n      ");

  const scopeDesc = SCOPE_COPY[opts.scope] ?? "Access your camp data";

  const inner = `
    <div class="card">
      <h1 class="title">Connect Claude</h1>
      <div class="identity">
        <span class="avatar">${svgIcon(ICON.user)}</span>
        <span class="identity-name">Signed in as ${escapeHtml(opts.displayName)}</span>
      </div>
      <div class="req-row">
        <span class="label">Requesting access</span>
        <span class="value">${escapeHtml(opts.clientName)}</span>
      </div>
      <div class="scope-row">
        <span class="scope-icon">${svgIcon(ICON.shield)}</span>
        <span class="scope-text">
          <span class="scope-name">${escapeHtml(opts.scope)}</span>
          <span class="scope-desc">${escapeHtml(scopeDesc)}</span>
        </span>
      </div>
      <form method="POST" action="/api/mcp/oauth/authorize">
      ${hiddenInputs}
        <div class="btn-row">
          <button type="submit" name="action" value="deny" class="btn btn-outline">Deny</button>
          <button type="submit" name="action" value="approve" class="btn btn-primary">Approve</button>
        </div>
      </form>
    </div>`;

  return htmlResponse(
    200,
    htmlDoc(`Connect ${opts.clientName} — Camp 404`, "shield", inner),
  );
}

/** The 403 gate card (pending_approval), under a lock. */
function gateCardHtml(description: string): NextResponse {
  const inner = `
    <div class="card">
      <h1 class="title">Connect Claude</h1>
      <p class="gate-text">${escapeHtml(description)}</p>
    </div>`;
  return htmlResponse(
    403,
    htmlDoc("Approval needed — Camp 404", "lock", inner),
  );
}

/** Route a gate denial: pending_approval is the lock card; the other gate
 * failures fall back to the generic themed error page. */
function denialResponse(denied: McpAccessDenial): NextResponse {
  if (denied.error === "pending_approval") {
    return gateCardHtml(denied.description);
  }
  return errorPage(403, denied.error, denied.description);
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

function buildRedirectUrl(
  base: string,
  params: Record<string, string>,
): string {
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
  const pretty = error.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const inner = `
    <div class="card tight">
      <h1 class="err-title">${escapeHtml(pretty)}</h1>
      <p class="err-desc">${escapeHtml(description)}</p>
    </div>`;
  return htmlResponse(status, htmlDoc(`${pretty} — Camp 404`, "alert", inner));
}
