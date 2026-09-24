import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { buildAuthOptions } from "../config";
import {
  authConfigWarnings,
  isProjectPreviewOrigin,
  resolveOAuthProxy,
  type AuthEnv,
} from "../env";
import { OAUTH_PROXY_REFUSED, proxyDestination } from "../oauth-proxy";

// Google sign-in on a preview, run end to end: a real Better Auth instance for
// the preview and another for production, each on its OWN in-memory database,
// with only Google's token endpoint faked. Hosts are the real shapes, taken
// from the Vercel API on 2026-09-24.

const PROD = "https://www.camp-404.com";
const BRANCH =
  "https://camp-404-web-git-fix-oauth-previews-ryry79261s-projects.vercel.app";
const PROXY_SECRET = "proxy-secret-shared-by-prod-and-preview-0001";

const GOOGLE = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" };

const PROD_ENV: AuthEnv = {
  ...GOOGLE,
  VERCEL_ENV: "production",
  BETTER_AUTH_URL: PROD,
  VERCEL_URL: "camp-404-r8swlyzp9-ryry79261s-projects.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "camp-404.com",
  AUTH_APEX_DOMAIN: "camp-404.com",
  BETTER_AUTH_SECRET: "production-main-secret-0000000000000000",
  AUTH_OAUTH_PROXY_SECRET: PROXY_SECRET,
};

const PREVIEW_ENV: AuthEnv = {
  ...GOOGLE,
  VERCEL_ENV: "preview",
  VERCEL_URL: "camp-404-y0kcnxz7w-ryry79261s-projects.vercel.app",
  VERCEL_BRANCH_URL: new URL(BRANCH).host,
  VERCEL_PROJECT_PRODUCTION_URL: "camp-404.com",
  AUTH_APEX_DOMAIN: "camp-404.com",
  // A different main secret from production's: only the proxy one is shared.
  BETTER_AUTH_SECRET: "preview-main-secret-11111111111111111111",
  AUTH_OAUTH_PROXY_SECRET: PROXY_SECRET,
  AUTH_OAUTH_PROXY_URL: PROD,
};

const emptyDb = () =>
  ({
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
    twoFactor: [],
    passkey: [],
  }) as Record<
    | "user"
    | "session"
    | "account"
    | "verification"
    | "rateLimit"
    | "twoFactor"
    | "passkey",
    Record<string, unknown>[]
  >;
type Db = ReturnType<typeof emptyDb>;

function instance(env: AuthEnv, db: Db) {
  return betterAuth({ ...buildAuthOptions(env), database: memoryAdapter(db) });
}

function idToken(claims: Record<string, unknown>): string {
  const part = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "RS256", kid: "k" })}.${part(claims)}.sig`;
}

/** Google's token endpoint, faked. Records the redirect_uri it was sent. */
function fakeGoogle() {
  const redirectURIs: string[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://oauth2.googleapis.com/token")) {
      throw new Error(`unexpected fetch ${url}`);
    }
    const body = new URLSearchParams(String(init?.body ?? ""));
    redirectURIs.push(body.get("redirect_uri") ?? "");
    return new Response(
      JSON.stringify({
        access_token: "google-access",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid email profile",
        id_token: idToken({
          sub: "google-123",
          email: "member@example.com",
          email_verified: true,
          name: "A Member",
        }),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, redirectURIs };
}

async function startGoogleSignIn(
  auth: ReturnType<typeof instance>,
  origin: string,
) {
  const res = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    }),
  );
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const google = new URL(url);
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return {
    redirectURI: google.searchParams.get("redirect_uri"),
    state: google.searchParams.get("state")!,
    cookies,
  };
}

function googleCallback(
  auth: ReturnType<typeof instance>,
  origin: string,
  state: string,
  cookies = "",
  outcome = "code=the-code",
) {
  return auth.handler(
    new Request(
      `${origin}/api/auth/callback/google?${outcome}&state=${encodeURIComponent(state)}`,
      { headers: cookies ? { cookie: cookies } : {} },
    ),
  );
}

describe("Google sign-in on a preview", () => {
  let google: ReturnType<typeof fakeGoogle>;
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    google = fakeGoogle();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("without the proxy asks Google to call back the preview's own host, which Google refuses", async () => {
    const env = { ...PREVIEW_ENV, AUTH_OAUTH_PROXY_SECRET: undefined };
    const preview = instance(env, emptyDb());
    const { redirectURI } = await startGoogleSignIn(preview, BRANCH);
    // Not registered in Google Cloud, and a new one for every deployment.
    expect(redirectURI).toBe(
      "https://camp-404-y0kcnxz7w-ryry79261s-projects.vercel.app/api/auth/callback/google",
    );
  });

  it("goes through production's callback and signs in on the preview's own database", async () => {
    const previewDb = emptyDb();
    const prodDb = emptyDb();
    const preview = instance(PREVIEW_ENV, previewDb);
    const production = instance(PROD_ENV, prodDb);

    const start = await startGoogleSignIn(preview, BRANCH);
    expect(start.redirectURI).toBe(`${PROD}/api/auth/callback/google`);
    // The sealed state names the preview's own proxy callback, and nothing
    // else, as where production must send the member back.
    const destination = await proxyDestination(PROXY_SECRET, start.state);
    expect(destination).toBeTruthy();
    const sealed = new URL(destination!);
    expect(sealed.origin).toBe(BRANCH);
    expect(sealed.pathname).toBe("/api/auth/oauth-proxy-callback");

    // Google calls production back. Production swaps the code with ITS
    // redirect URI (Google insists they match) and sends the browser back to
    // the preview host the member started on. No state cookie rides along:
    // the preview's cookie lives on the preview's host.
    const back = await googleCallback(production, PROD, start.state);
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get("location")!);
    expect(location.origin).toBe(BRANCH);
    expect(location.pathname).toBe("/api/auth/oauth-proxy-callback");
    expect(google.redirectURIs).toEqual([`${PROD}/api/auth/callback/google`]);
    // Production wrote nothing: the preview need not share its database.
    expect(prodDb.user).toHaveLength(0);
    expect(prodDb.session).toHaveLength(0);
    expect(prodDb.account).toHaveLength(0);

    const done = await preview.handler(new Request(location));
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe("/");
    expect(done.headers.getSetCookie().join("\n")).toMatch(
      /camp404\.session_token=/,
    );
    expect(previewDb.user).toHaveLength(1);
    expect(previewDb.user[0]!.email).toBe("member@example.com");
    expect(previewDb.session).toHaveLength(1);
  });

  it("will not replay a sealed profile twice", async () => {
    const preview = instance(PREVIEW_ENV, emptyDb());
    const production = instance(PROD_ENV, emptyDb());
    const start = await startGoogleSignIn(preview, BRANCH);
    const back = await googleCallback(production, PROD, start.state);
    const location = back.headers.get("location")!;
    expect((await preview.handler(new Request(location))).status).toBe(302);

    const again = await preview.handler(new Request(location));
    expect(again.headers.get("location")).toMatch(/error=state_mismatch/);
  });

  it("brings a cancelled Google consent back to the preview's own sign-in form", async () => {
    const preview = instance(PREVIEW_ENV, emptyDb());
    const production = instance(PROD_ENV, emptyDb());
    const start = await startGoogleSignIn(preview, BRANCH);

    // The member presses Cancel on Google's consent screen.
    const back = await googleCallback(
      production,
      PROD,
      start.state,
      "",
      "error=access_denied",
    );
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe(
      `${BRANCH}/auth/sign-in?error=access_denied`,
    );
    expect(google.fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a production sign-in exactly as it was", async () => {
    const prodDb = emptyDb();
    const production = instance(PROD_ENV, prodDb);

    const start = await startGoogleSignIn(production, PROD);
    expect(start.redirectURI).toBe(`${PROD}/api/auth/callback/google`);
    // A plain state, not a proxy package.
    expect(await proxyDestination(PROXY_SECRET, start.state)).toBeUndefined();

    const back = await googleCallback(
      production,
      PROD,
      start.state,
      start.cookies,
    );
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe("/");
    expect(prodDb.session).toHaveLength(1);
  });

  it("never proxies a production sign-in, even from the bare apex", async () => {
    // camp-404.com is a trusted origin too; without the pin the plugin would
    // treat it as "not production" and proxy it.
    const production = instance(PROD_ENV, emptyDb());
    const start = await startGoogleSignIn(production, "https://camp-404.com");
    expect(start.redirectURI).toBe(`${PROD}/api/auth/callback/google`);
    expect(await proxyDestination(PROXY_SECRET, start.state)).toBeUndefined();
  });

  it("does not mount the profile-replay endpoint on production", async () => {
    const production = instance(PROD_ENV, emptyDb());
    const res = await production.handler(
      new Request(`${PROD}/api/auth/oauth-proxy-callback?callbackURL=%2F`),
    );
    expect(res.status).toBe(404);
  });

  it("refuses a sealed state that names a host outside this project's previews", async () => {
    const production = instance(PROD_ENV, emptyDb());
    const seal = (data: object) =>
      symmetricEncrypt({ key: PROXY_SECRET, data: JSON.stringify(data) });
    const forged = await seal({
      isOAuthProxy: true,
      state: "s",
      stateCookie: await seal({
        callbackURL:
          "https://camp-404-web-git-x-someone-else.vercel.app/api/auth/oauth-proxy-callback?callbackURL=%2F",
        codeVerifier: "v",
        expiresAt: Date.now() + 60_000,
      }),
    });

    const res = await googleCallback(production, PROD, forged);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/auth/sign-in?error=${OAUTH_PROXY_REFUSED}`,
    );
    // Refused before the code was ever exchanged.
    expect(google.fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a sealed state whose error page is outside this project's previews", async () => {
    const production = instance(PROD_ENV, emptyDb());
    const seal = (data: object) =>
      symmetricEncrypt({ key: PROXY_SECRET, data: JSON.stringify(data) });
    const forged = await seal({
      isOAuthProxy: true,
      state: "s",
      stateCookie: await seal({
        callbackURL: `${BRANCH}/api/auth/oauth-proxy-callback?callbackURL=%2F`,
        errorURL: "https://evil.example/phish",
        codeVerifier: "v",
        expiresAt: Date.now() + 60_000,
      }),
    });

    // A cancelled consent would otherwise send the browser to errorURL.
    const res = await googleCallback(
      production,
      PROD,
      forged,
      "",
      "error=access_denied",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/auth/sign-in?error=${OAUTH_PROXY_REFUSED}`,
    );
  });
});

describe("resolveOAuthProxy", () => {
  it("sets production up to answer proxied callbacks, and a preview to send them", () => {
    expect(resolveOAuthProxy(PROD_ENV)).toEqual({
      role: "production",
      productionURL: PROD,
      secret: PROXY_SECRET,
    });
    expect(resolveOAuthProxy(PREVIEW_ENV)).toEqual({
      role: "preview",
      productionURL: PROD,
      secret: PROXY_SECRET,
    });
  });

  it("stays off without every piece it needs, so a preview fails as it did before", () => {
    const off = (env: AuthEnv) =>
      expect(resolveOAuthProxy(env)).toBeUndefined();
    off({ ...PREVIEW_ENV, AUTH_OAUTH_PROXY_SECRET: undefined });
    off({ ...PREVIEW_ENV, AUTH_OAUTH_PROXY_SECRET: "too-short" });
    off({ ...PREVIEW_ENV, AUTH_OAUTH_PROXY_URL: undefined });
    off({ ...PREVIEW_ENV, AUTH_OAUTH_PROXY_URL: "http://www.camp-404.com" });
    off({ ...PREVIEW_ENV, AUTH_OAUTH_PROXY_URL: BRANCH });
    // No real main secret: the deployment fails closed (authMayServe).
    off({ ...PREVIEW_ENV, BETTER_AUTH_SECRET: undefined });
    off({ ...PREVIEW_ENV, GOOGLE_CLIENT_SECRET: undefined });
    // A deployment that is not one of this project's previews.
    off({
      ...PREVIEW_ENV,
      VERCEL_URL: "camp-404-y0kcnxz7w-someone.vercel.app",
    });
    // Never locally, and never on a production without a https base URL.
    off({ ...PREVIEW_ENV, VERCEL_ENV: undefined });
    off({
      ...PROD_ENV,
      BETTER_AUTH_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
      VERCEL_URL: undefined,
    });
  });

  it("warns on a preview where Google cannot finish, and not once it can", () => {
    const unset = { ...PREVIEW_ENV, AUTH_OAUTH_PROXY_SECRET: undefined };
    expect(authConfigWarnings(unset).join(" ")).toMatch(
      /AUTH_OAUTH_PROXY_SECRET/,
    );
    expect(authConfigWarnings(PREVIEW_ENV).join(" ")).not.toMatch(
      /AUTH_OAUTH_PROXY_SECRET/,
    );
  });
});

describe("isProjectPreviewOrigin", () => {
  it("accepts this project's deployment and branch hosts", () => {
    expect(isProjectPreviewOrigin(BRANCH)).toBe(true);
    expect(
      isProjectPreviewOrigin(
        "https://camp-404-y0kcnxz7w-ryry79261s-projects.vercel.app/api/auth/oauth-proxy-callback?callbackURL=%2F",
      ),
    ).toBe(true);
  });

  it("refuses every other host, including lookalikes", () => {
    for (const url of [
      "https://www.camp-404.com",
      "https://camp-404-web.vercel.app",
      "https://evil.vercel.app",
      "https://camp-404-web-git-main-someone-else.vercel.app",
      `${BRANCH}.evil.com`,
      "https://evil.com/camp-404-web-git-a-ryry79261s-projects.vercel.app",
      BRANCH.replace("https:", "http:"),
      `${BRANCH}:8443`,
      "https://x@camp-404-y0kcnxz7w-ryry79261s-projects.vercel.app",
      "https://camp-404-short-ryry79261s-projects.vercel.app",
      "not a url",
      undefined,
    ]) {
      expect(isProjectPreviewOrigin(url), url).toBe(false);
    }
  });
});
