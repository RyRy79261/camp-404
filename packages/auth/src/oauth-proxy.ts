// Google sign-in on preview deployments: Better Auth's OAuth proxy, set up by
// resolveOAuthProxy (env.ts), plus one guard of our own.
//
// The guard. Production, handed a proxied callback, sends the browser (and a
// sealed copy of the member's Google profile) to whatever preview URL the
// sealed state names. Only a holder of the proxy secret can seal a state, so
// that is the real lock; the guard is the second one. It refuses any
// destination that is not one of this project's preview hosts, so a leaked
// secret still cannot have production post a profile to someone else's site.
//
// The guard reads the state package the way the plugin writes it (better-auth
// 1.6.25, plugins/oauth-proxy): `state` is the encrypted JSON
// `{ isOAuthProxy, state, stateCookie }`, and `stateCookie` is the encrypted
// JSON of the stored state, whose `callbackURL` is the preview's
// /oauth-proxy-callback. If a Better Auth upgrade changes that shape, the
// guard stops recognising proxy states and refuses nothing: the flow test in
// __tests__/oauth-proxy.test.ts goes red first.

import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { isProjectPreviewOrigin, type OAuthProxyMode } from "./env";

/** The error code the sign-in form receives when the guard refuses. */
export const OAUTH_PROXY_REFUSED = "oauth_proxy_refused";

async function decryptJSON(secret: string, data: unknown): Promise<unknown> {
  if (typeof data !== "string" || !data) return undefined;
  try {
    return JSON.parse(await symmetricDecrypt({ key: secret, data }));
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
  const pkg = (await decryptJSON(secret, state)) as
    | { isOAuthProxy?: unknown; stateCookie?: unknown }
    | undefined;
  if (!pkg || pkg.isOAuthProxy !== true) return undefined;
  const stored = (await decryptJSON(secret, pkg.stateCookie)) as
    | { callbackURL?: unknown; errorURL?: unknown }
    | undefined;
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
 * The plugins that carry Google sign-in across to a preview, or none. The
 * guard comes first: plugin hooks run in order, so it sees the callback
 * before the proxy acts on it.
 */
export function oauthProxyPlugins(mode: OAuthProxyMode | undefined) {
  if (!mode) return [];
  return [
    oauthProxyDestinationGuard(mode.secret),
    ...(mode.role === "preview" ? [oauthProxyPreviewErrorReturn()] : []),
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
 * Paths production must not mount. /oauth-proxy-callback turns a sealed
 * profile into a session; production never needs it (its own sign-ins are not
 * proxied), so it stays off there and the proxy secret cannot mint a
 * production session.
 */
export function oauthProxyDisabledPaths(
  mode: OAuthProxyMode | undefined,
): string[] {
  return mode?.role === "production" ? ["/oauth-proxy-callback"] : [];
}
