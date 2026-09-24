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
 */
export async function proxyDestination(
  secret: string,
  state: unknown,
): Promise<string | undefined | null> {
  const pkg = (await decryptJSON(secret, state)) as
    | { isOAuthProxy?: unknown; stateCookie?: unknown }
    | undefined;
  if (!pkg || pkg.isOAuthProxy !== true) return undefined;
  const stored = (await decryptJSON(secret, pkg.stateCookie)) as
    | { callbackURL?: unknown }
    | undefined;
  // A proxy package whose inner state will not open names no destination.
  // Null, so the guard refuses it rather than waving it through.
  return typeof stored?.callbackURL === "string" ? stored.callbackURL : null;
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
            const destination = await proxyDestination(secret, state);
            if (destination === undefined) return;
            if (destination !== null && isProjectPreviewOrigin(destination)) {
              return;
            }
            ctx.context.logger.error(
              "OAuth proxy: refused a callback bound for a host that is not one of this project's previews",
            );
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
 * The plugins that carry Google sign-in across to a preview, or none. The
 * guard comes first: plugin hooks run in order, so it sees the callback
 * before the proxy acts on it.
 */
export function oauthProxyPlugins(mode: OAuthProxyMode | undefined) {
  if (!mode) return [];
  return [
    oauthProxyDestinationGuard(mode.secret),
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
