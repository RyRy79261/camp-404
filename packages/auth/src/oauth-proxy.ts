// Google sign-in on preview deployments: Better Auth's OAuth proxy, set up by
// resolveOAuthProxy (env.ts), plus guards of our own.
//
// The guard. Production, handed a proxied callback, sends the browser (and a
// sealed copy of the member's Google profile) to whatever preview URL the
// sealed state names. Only a holder of the proxy secret can seal a state, so
// that is the real lock; the guard is the second one. It refuses any
// destination that is not one of this project's preview hosts, so a leaked
// secret still cannot have production post a profile to someone else's site.
//
// The guard reads the state package the way the plugin writes it (better-auth
// 1.7.14, plugins/oauth-proxy): `state` is the JSON
// `{ isOAuthProxy, state, stateCookie }` sealed under the proxy secret's
// "oauth-proxy-package" key, and `stateCookie` is the JSON of the stored
// state, sealed under its "oauth-proxy-state" key, whose `callbackURL` is the
// preview's /callback/google/oauth-proxy. Since 1.7.7 each purpose has its own
// key derived from the proxy secret (the fix for GHSA-r4xp-prcw-77qf, where
// one key for every purpose let a sealed sign-in state pass for a sealed
// profile). If a Better Auth upgrade changes that shape, the guard stops
// recognising proxy states and refuses nothing: the flow test in
// __tests__/oauth-proxy.test.ts goes red first.

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { isProjectPreviewOrigin, type OAuthProxyMode } from "./env";

/** The error code the sign-in form receives when the guard refuses. */
export const OAUTH_PROXY_REFUSED = "oauth_proxy_refused";

/** What each sealed part of a proxied sign-in is sealed for. */
export type OAuthProxyPurpose =
  | "oauth-proxy-package"
  | "oauth-proxy-state"
  | "oauth-proxy-profile";

const encoder = new TextEncoder();

/**
 * The key the OAuth proxy plugin seals one purpose with: HKDF-SHA-256 over the
 * proxy secret, hex encoded, as better-auth's own `derivePurposeKey`
 * (crypto/purpose.ts, which it does not export). Web Crypto, so no new
 * dependency.
 */
export async function proxyPurposeKey(
  secret: string,
  purpose: OAuthProxyPurpose,
): Promise<string> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("better-auth:oauth-encryption:v1"),
      info: encoder.encode(`better-auth:${purpose}:v1`),
    },
    ikm,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

async function decryptJSON(
  secret: string,
  purpose: OAuthProxyPurpose,
  data: unknown,
): Promise<unknown> {
  if (typeof data !== "string" || !data) return undefined;
  try {
    const key = await proxyPurposeKey(secret, purpose);
    return JSON.parse(await symmetricDecrypt({ key, data }));
  } catch {
    return undefined;
  }
}

/**
 * Where a proxied callback would send the browser, or undefined when the
 * `state` is not an OAuth proxy package sealed with this secret (an ordinary
 * production sign-in, whose state is a plain random string).
 *
 * `errorURL` is where production sends a failure (a cancelled consent, a code
 * that will not swap): the preview's own sign-in form, when the preview set it.
 */
export async function proxyTargets(
  secret: string,
  state: unknown,
): Promise<{ callbackURL: string; errorURL?: string } | undefined | null> {
  const pkg = (await decryptJSON(secret, "oauth-proxy-package", state)) as
    | { isOAuthProxy?: unknown; stateCookie?: unknown }
    | undefined;
  if (!pkg || pkg.isOAuthProxy !== true) return undefined;
  const stored = (await decryptJSON(
    secret,
    "oauth-proxy-state",
    pkg.stateCookie,
  )) as { callbackURL?: unknown; errorURL?: unknown } | undefined;
  // A proxy package whose inner state will not open names no destination.
  // Null, so the guard refuses it rather than waving it through.
  if (typeof stored?.callbackURL !== "string") return null;
  if (stored.errorURL !== undefined && typeof stored.errorURL !== "string") {
    return null;
  }
  return {
    callbackURL: stored.callbackURL,
    ...(stored.errorURL ? { errorURL: stored.errorURL } : {}),
  };
}

/** The success destination alone; see proxyTargets. */
export async function proxyDestination(
  secret: string,
  state: unknown,
): Promise<string | undefined | null> {
  const targets = await proxyTargets(secret, state);
  return targets ? targets.callbackURL : targets;
}

/** Refuses a proxied callback bound for anywhere but this project's previews. */
export function oauthProxyDestinationGuard(secret: string): BetterAuthPlugin {
  return {
    id: "camp404-oauth-proxy-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/callback/:id",
          handler: createAuthMiddleware(async (ctx) => {
            const state =
              (ctx.query as { state?: unknown } | undefined)?.state ??
              (ctx.body as { state?: unknown } | undefined)?.state;
            const targets = await proxyTargets(secret, state);
            if (targets === undefined) return;
            // Both places production may send the browser must be previews:
            // the success destination, and the error one, which production
            // follows for a cancelled consent before any code is swapped.
            if (
              targets !== null &&
              isProjectPreviewOrigin(targets.callbackURL) &&
              (targets.errorURL === undefined ||
                isProjectPreviewOrigin(targets.errorURL))
            ) {
              return;
            }
            ctx.context.logger.error(
              "OAuth proxy: refused a callback bound for a host that is not one of this project's previews",
            );
            // Production's own sign-in form, never a URL the state names: a
            // refused state is untrusted, so following its errorURL would be
            // the open redirect this guard exists to close.
            const errorURL =
              ctx.context.options.onAPIError?.errorURL ?? "/auth/sign-in";
            throw ctx.redirect(`${errorURL}?error=${OAUTH_PROXY_REFUSED}`);
          }),
        },
      ],
    },
  };
}

/**
 * On a preview, makes a Google failure come back to the preview. Production
 * sends a cancelled consent or a failed code swap to the sealed state's
 * errorURL, and without one to its own relative `onAPIError.errorURL`, which
 * is production's sign-in form: the member would leave the preview they were
 * testing. So a sign-in that names no error page, or a relative one, gets the
 * absolute address of that page on this preview's own host. Only a trusted
 * request origin (the host the member is on) is used; otherwise the request
 * is left alone and a failure lands on production as before.
 */
export function oauthProxyPreviewErrorReturn(): BetterAuthPlugin {
  return {
    id: "camp404-oauth-proxy-error-return",
    hooks: {
      before: [
        {
          matcher: (ctx) => !!ctx.path?.startsWith("/sign-in/social"),
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { errorCallbackURL?: unknown } | undefined;
            if (!body || !ctx.request) return;
            const given = body.errorCallbackURL;
            const path =
              given === undefined
                ? (ctx.context.options.onAPIError?.errorURL ?? "/auth/sign-in")
                : given;
            if (
              typeof path !== "string" ||
              !path.startsWith("/") ||
              path.startsWith("//")
            ) {
              return;
            }
            const origin = new URL(ctx.request.url).origin;
            if (!ctx.context.isTrustedOrigin(origin)) return;
            body.errorCallbackURL = `${origin}${path}`;
          }),
        },
      ],
    },
  };
}

/**
 * The endpoints that turn a sealed profile into a session: since 1.7.7
 * /callback/:id/oauth-proxy, and the deprecated /oauth-proxy-callback that
 * calls it.
 */
export const OAUTH_PROXY_COMPLETION_PATHS: ReadonlySet<string> = new Set([
  "/callback/:id/oauth-proxy",
  "/oauth-proxy-callback",
]);

/**
 * On production, answers 404 on the profile-replay endpoints, so the proxy
 * secret cannot mint a production session (production's own sign-ins are
 * never proxied, so it never needs them). It matches the route, not the URL,
 * so no provider id or spelling of the path gets past it;
 * `oauthProxyDisabledPaths` is the first lock, on the literal paths.
 */
export function oauthProxyCompletionOff(): BetterAuthPlugin {
  return {
    id: "camp404-oauth-proxy-completion-off",
    hooks: {
      before: [
        {
          matcher: (ctx) => OAUTH_PROXY_COMPLETION_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async () => {
            throw new APIError("NOT_FOUND");
          }),
        },
      ],
    },
  };
}

/**
 * The plugins that carry Google sign-in across to a preview, or none. The
 * guard comes first: plugin hooks run in order, so it sees the callback
 * before the proxy acts on it.
 */
export function oauthProxyPlugins(mode: OAuthProxyMode | undefined) {
  if (!mode) return [];
  return [
    oauthProxyDestinationGuard(mode.secret),
    ...(mode.role === "preview"
      ? [oauthProxyPreviewErrorReturn()]
      : [oauthProxyCompletionOff()]),
    oAuthProxy({
      productionURL: mode.productionURL,
      secret: mode.secret,
      // Production pins its own URL as the current one, so the plugin never
      // proxies a production sign-in (it compares the two origins). A preview
      // leaves it to the request, which the plugin honours only for a trusted
      // origin: the branch host a member is actually on.
      ...(mode.role === "production" ? { currentURL: mode.productionURL } : {}),
    }),
  ];
}

/**
 * Paths production must not mount. /callback/google/oauth-proxy (and the
 * deprecated /oauth-proxy-callback) turn a sealed profile into a session;
 * production never needs them (its own sign-ins are not proxied), so they stay
 * off there and the proxy secret cannot mint a production session. Google is
 * the only provider; `oauthProxyCompletionOff` refuses the route whatever the
 * provider id.
 */
export function oauthProxyDisabledPaths(
  mode: OAuthProxyMode | undefined,
): string[] {
  return mode?.role === "production"
    ? ["/callback/google/oauth-proxy", "/oauth-proxy-callback"]
    : [];
}
