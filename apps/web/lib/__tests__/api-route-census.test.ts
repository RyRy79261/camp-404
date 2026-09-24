import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every /api route declares how it is guarded, and the census checks the
// source still carries that guard. Sign-up is open, so "signed in" is anyone
// on the internet: a new route that forgets its gate is the easiest hole to
// ship, and this makes forgetting it a red test instead of a silent default.
//
// A static check, in the style of cron-stub.test.ts: it reads the files and
// runs none of them. It proves the guard is named in the route, not that it
// is called in the right place; the routes' own tests prove that.

/** How a route is guarded. */
type GuardClass =
  /** Vercel cron: `assertCron` checks the CRON_SECRET bearer. */
  | "cron"
  /** Only exists under E2E_TEST_MODE (`isE2ETestMode`), never on Vercel. */
  | "test-only"
  /** Any signed-in account. Rare: sign-up is open, so prefer camp-access. */
  | "session"
  /** A signed-in account that has redeemed an invite (`hasCampAccess`). */
  | "camp-access"
  /** A captain or team-lead surface (`captainActionGate`). */
  | "captain-gate"
  /** The MCP server: an OAuth bearer token (`withMcpAuth`). */
  | "bearer-mcp"
  /** An inbound webhook with a shared secret (`verifyWebhookSecret`). */
  | "webhook-secret"
  /** Open to anyone on purpose; the comment beside it says why. */
  | "public"
  /** Better Auth's own handler, closed without its secret (`authMayServe`). */
  | "auth-handler";

/** Route path (under app/api, without /route.ts) → its guard class. */
const ROUTE_GUARDS: Record<string, GuardClass> = {
  "auth/[...path]": "auth-handler",
  avatar: "camp-access",
  "cron/maintenance": "cron",
  "cron/manuals/generate": "cron",
  "cron/notifications/dispatch": "cron",
  "cron/notifications/email": "cron",
  "cron/notifications/push": "cron",
  "cron/notifications/reminders": "cron",
  "cron/telegram/dispatch": "cron",
  // A liveness probe: says the app is up and nothing else.
  health: "public",
  "mcp/[transport]": "bearer-mcp",
  // Consent: the code-issuing POST checks camp access and approval.
  "mcp/oauth/authorize": "camp-access",
  // OAuth dynamic client registration: open by the spec, IP rate-limited, and
  // redirect URIs are allow-listed.
  "mcp/oauth/register": "public",
  // OAuth token exchange: the caller proves itself with PKCE or a refresh
  // token, not a session. IP rate-limited.
  "mcp/oauth/token": "public",
  // OAuth discovery documents: static metadata.
  "mcp/well-known/oauth-authorization-server": "public",
  "mcp/well-known/oauth-protected-resource": "public",
  "notifications/acknowledge": "camp-access",
  "notifications/pending": "camp-access",
  "notifications/popups": "camp-access",
  "push/tokens": "camp-access",
  "telegram/webhook": "webhook-secret",
  "test/complete-onboarding": "test-only",
  "test/inspect": "test-only",
  "test/login": "test-only",
  "test/reset": "test-only",
  "test/seed-invite": "test-only",
  "test/seed-participation": "test-only",
  "test/seed-team": "test-only",
  "test/set-approval": "test-only",
  "test/set-rank": "test-only",
  "tools/invite/check": "camp-access",
  "uploads/avatar": "camp-access",
  "uploads/builder-image": "captain-gate",
  "uploads/questionnaire-image": "camp-access",
  "voice/transcribe": "camp-access",
};

/** The name each class must find in the route's source, if any. */
const REQUIRED_GUARD: Record<GuardClass, string | null> = {
  cron: "assertCron",
  "test-only": "isE2ETestMode",
  session: "getAuthenticatedUser",
  "camp-access": "hasCampAccess",
  "captain-gate": "captainActionGate",
  "bearer-mcp": "withMcpAuth",
  "webhook-secret": "verifyWebhookSecret",
  public: null,
  "auth-handler": "authMayServe",
};

const API_DIR = path.resolve(__dirname, "../../app/api");

/** `voice/transcribe` for every route.ts under app/api. */
function apiRoutes(): string[] {
  return (readdirSync(API_DIR, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file === "route.ts" || file.endsWith("/route.ts"))
    .map((file) => file.replace(/\/?route\.ts$/, ""))
    .sort();
}

const source = (route: string) =>
  readFileSync(path.join(API_DIR, route, "route.ts"), "utf8");

describe("the /api route census", () => {
  const routes = apiRoutes();

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes).toContain("voice/transcribe");
  });

  it("has classified every route", () => {
    const unclassified = routes.filter((route) => !(route in ROUTE_GUARDS));
    expect(
      unclassified,
      `app/api/{${unclassified.join(", ")}}/route.ts has no guard class. ` +
        "Add it to ROUTE_GUARDS in lib/__tests__/api-route-census.test.ts " +
        "with the class that says how it is protected (sign-up is open, so " +
        "a signed-in account alone is not a guard for anything that costs " +
        "money or reads camp data).",
    ).toEqual([]);
  });

  it("lists no route that no longer exists", () => {
    const stale = Object.keys(ROUTE_GUARDS).filter((r) => !routes.includes(r));
    expect(stale, "Remove these from ROUTE_GUARDS.").toEqual([]);
  });

  for (const [route, guard] of Object.entries(ROUTE_GUARDS)) {
    const needed = REQUIRED_GUARD[guard];
    if (!needed) continue;
    it(`${route} carries its ${guard} guard (${needed})`, () => {
      expect(
        source(route),
        `app/api/${route}/route.ts is classed '${guard}' but never names ${needed}.`,
      ).toContain(needed);
    });
  }

  it("checks the cron secret before a stub cron answers", () => {
    for (const [route, guard] of Object.entries(ROUTE_GUARDS)) {
      if (guard !== "cron") continue;
      const text = source(route);
      const stub = text.indexOf("cronStubResponse(");
      if (stub === -1) continue;
      expect(text.indexOf("assertCron(req)"), route).toBeGreaterThan(-1);
      expect(text.indexOf("assertCron(req)"), route).toBeLessThan(stub);
    }
  });
});
