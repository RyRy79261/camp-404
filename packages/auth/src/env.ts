// Pure environment resolution for the Better Auth config.
//
// Adapted from the AfrikaBurn contributors app's @quagga/auth/env (the owner's
// direction, 2026-09-17: copy AfrikaBurn's systems and restyle). AfrikaBurn runs
// three apps under one apex and shares a session across them; Camp 404 is ONE
// app, so the cross-subdomain cookie is gone and the rest is kept.
//
// PURITY CONTRACT: no I/O, no better-auth import, no side effects. Everything
// here is a deterministic function of an env bag, so the derivations (base URL,
// trusted origins, passkey scope, the email-verification switch) are testable
// without a database or a running auth instance. config.ts consumes these.

/** The subset of process.env the auth config reads. All optional: the app
 * still boots, and `next build` still runs, with none of them set. */
export interface AuthEnv {
  BETTER_AUTH_SECRET?: string | undefined;
  /** The absolute origin people use in production, e.g. https://www.camp-404.com. */
  BETTER_AUTH_URL?: string | undefined;
  /**
   * The registrable domain the production site sits under (camp-404.com). When
   * set, and the app is served under it, passkeys are scoped to it, so one
   * passkey works on camp-404.com and www.camp-404.com alike.
   */
  AUTH_APEX_DOMAIN?: string | undefined;
  /** Vercel's own hosts, without a protocol. */
  VERCEL_URL?: string | undefined;
  VERCEL_BRANCH_URL?: string | undefined;
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  /** An email provider is what makes a reset link or a verification possible. */
  RESEND_API_KEY?: string | undefined;
  RESEND_FROM_EMAIL?: string | undefined;
  /** Opt in to gating sign-in on a verified email. Off unless set true. */
  BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION?: string | undefined;
  /** Optional rate-limit tuning. UNSET IN PRODUCTION — see resolveRateLimit. */
  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string | undefined;
  AUTH_RATE_LIMIT_MAX?: string | undefined;
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  NODE_ENV?: string | undefined;
  /** The e2e harness switch. The app refuses to boot with it on Vercel. */
  E2E_TEST_MODE?: string | undefined;
  /**
   * E2E only: auth emails are appended to this file instead of sent, so a
   * Playwright run can follow a reset link. Honoured only by
   * resolveAuthEmailCaptureFile.
   */
  AUTH_EMAIL_CAPTURE_FILE?: string | undefined;
}

/**
 * Session lifetime, in seconds. Database sessions plus a short signed cookie
 * cache: fast reads without giving up server-side revocation.
 *
 * `cookieCacheMaxAgeSeconds` is also the revocation lag: a session signed out
 * or revoked elsewhere keeps working here for up to this long, because the
 * check is a signature on a cookie rather than a database read. Any screen that
 * revokes sessions must state this number.
 */
export const AUTH_SESSION = {
  expiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  updateAgeSeconds: 60 * 60 * 24, // refreshed once a day
  cookieCacheMaxAgeSeconds: 300, // 5 minutes
} as const;

/** The name an authenticator app and a passkey prompt show for this account. */
export const AUTH_RP_NAME = "Camp 404";

function trimmed(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v ? v : undefined;
}

/** The configured apex domain, or undefined. A blank value counts as unset. */
export function resolveApexDomain(env: AuthEnv): string | undefined {
  return trimmed(env.AUTH_APEX_DOMAIN);
}

/** True when the signing secret is set. Without it sessions are worthless. */
export function isAuthConfigured(env: AuthEnv): boolean {
  return Boolean(trimmed(env.BETTER_AUTH_SECRET));
}

/**
 * Whether auth may serve a request at all. On any Vercel deployment it needs a
 * real secret: the placeholder is in this public repository, so a cookie
 * signed with it can be forged by anyone, and previews read the same database
 * as production. So a deployment without the secret FAILS CLOSED — nobody is
 * signed in, and the auth endpoints answer 503 — rather than accepting forged
 * sessions. Off Vercel (local dev, CI) the placeholder is allowed, because
 * nothing there holds real accounts.
 */
export function authMayServe(env: AuthEnv): boolean {
  return isAuthConfigured(env) || !trimmed(env.VERCEL_ENV);
}

/** True when an email provider is fully configured (key AND sender). */
export function isEmailProviderConfigured(env: AuthEnv): boolean {
  return Boolean(trimmed(env.RESEND_API_KEY) && trimmed(env.RESEND_FROM_EMAIL));
}

/**
 * The file auth emails are captured to instead of sent, or undefined.
 *
 * Honoured ONLY under the e2e harness (E2E_TEST_MODE=1) and ONLY off Vercel
 * (VERCEL_ENV unset or blank). Anywhere else it is refused outright, whatever
 * the path says: a file of working reset links on a deployment would be a
 * side door into every account. The app also refuses to boot with
 * E2E_TEST_MODE on Vercel, so this is the second of two locks, not the only one.
 */
export function resolveAuthEmailCaptureFile(env: AuthEnv): string | undefined {
  if (env.E2E_TEST_MODE !== "1") return undefined;
  if (trimmed(env.VERCEL_ENV)) return undefined;
  return trimmed(env.AUTH_EMAIL_CAPTURE_FILE);
}

/**
 * True when an auth email can reach someone: a real provider, or the e2e
 * capture file. What decides whether a reset or a verification is offered.
 */
export function canDeliverAuthEmail(env: AuthEnv): boolean {
  return (
    isEmailProviderConfigured(env) ||
    resolveAuthEmailCaptureFile(env) !== undefined
  );
}

/** True when Google sign-in is fully configured. */
export function isGoogleConfigured(env: AuthEnv): boolean {
  return Boolean(
    trimmed(env.GOOGLE_CLIENT_ID) && trimmed(env.GOOGLE_CLIENT_SECRET),
  );
}

function https(host: string | undefined): string | undefined {
  const h = trimmed(host);
  return h ? `https://${h}` : undefined;
}

/**
 * The base URL auth links and OAuth callbacks are built from.
 *
 * The explicit value first. Then, in production, Vercel's production host —
 * NOT `VERCEL_URL`, which in production is the one-off deployment host
 * (camp-404-abc123.vercel.app) that nobody visits: a reset link built from it
 * would land on a host where the member has no session, and Google would refuse
 * a callback it was never told about. A preview uses its own deployment host.
 * Undefined locally, so Better Auth reads the host from the request.
 */
export function resolveBaseURL(env: AuthEnv): string | undefined {
  const explicit = trimmed(env.BETTER_AUTH_URL);
  if (explicit) return explicit;
  if (env.VERCEL_ENV === "production") {
    return https(env.VERCEL_PROJECT_PRODUCTION_URL) ?? https(env.VERCEL_URL);
  }
  return https(env.VERCEL_URL);
}

/**
 * Whether cookies get the `Secure` flag, keyed off the ORIGIN we are served on
 * rather than NODE_ENV (AfrikaBurn's lesson: a production build served over
 * plain http — how an E2E run serves the app — silently drops `__Secure-`
 * cookies). Undefined keeps Better Auth's secure default; only an explicit
 * http:// base URL turns it off.
 */
export function resolveUseSecureCookies(env: AuthEnv): boolean | undefined {
  const baseURL = resolveBaseURL(env);
  if (!baseURL) return undefined;
  return baseURL.startsWith("https://") ? undefined : false;
}

/**
 * Optional rate-limit tuning, so a test deployment can raise the ceiling
 * without anyone reaching for `enabled: false`. `{}` when unset keeps Better
 * Auth's own defaults. Production must leave these unset.
 */
export function resolveRateLimit(env: AuthEnv): {
  window?: number;
  max?: number;
  customRules?: Record<string, { window: number; max: number }>;
} {
  const window = Number(env.AUTH_RATE_LIMIT_WINDOW_SECONDS);
  const max = Number(env.AUTH_RATE_LIMIT_MAX);
  const hasWindow = Number.isFinite(window) && window > 0;
  const hasMax = Number.isFinite(max) && max > 0;
  if (!hasWindow && !hasMax) return {};

  const out: {
    window?: number;
    max?: number;
    customRules?: Record<string, { window: number; max: number }>;
  } = {};
  if (hasWindow) out.window = window;
  if (hasMax) out.max = max;
  // Better Auth ships STRICTER built-in rules for the sensitive paths, and
  // those win over the global `max`, so raise them too.
  if (hasMax) {
    const rule = { window: hasWindow ? window : 60, max };
    out.customRules = {
      "/sign-up/email": rule,
      "/sign-in/email": rule,
      "/request-password-reset": rule,
      "/reset-password": rule,
    };
  }
  return out;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** True when the resolved base URL is served under the configured apex. */
export function isUnderApex(env: AuthEnv): boolean {
  const apex = resolveApexDomain(env);
  if (!apex) return false;
  const host = hostOf(resolveBaseURL(env));
  return host === apex || (host?.endsWith(`.${apex}`) ?? false);
}

/** Parse a loose boolean env value. Undefined when unset or unrecognised. */
export function parseBoolEnv(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(v)) return true;
  if (["false", "0", "off", "no"].includes(v)) return false;
  return undefined;
}

/**
 * Whether sign-in waits for a verified email. OFF unless explicitly turned on,
 * and never on without a provider (a gate nobody can pass is a lockout).
 *
 * Camp 404 differs from AfrikaBurn here on purpose. Under Neon Auth nobody was
 * ever asked to verify, so accounts that exist today are unverified; turning
 * the gate on by default would lock every one of them out on the day of the
 * switch. Invite codes and captain approval are this camp's front door.
 */
export function resolveRequireEmailVerification(env: AuthEnv): boolean {
  if (!isEmailProviderConfigured(env)) return false;
  return parseBoolEnv(env.BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION) === true;
}

/**
 * The WebAuthn Relying Party ID for passkeys. THE near-irreversible passkey
 * decision: a passkey is bound to this domain for life. Scoped to the apex when
 * the app is served under it (so camp-404.com and www.camp-404.com share one
 * passkey); undefined elsewhere (localhost, previews), where the plugin takes
 * the request's own host.
 */
export function resolvePasskeyRpID(env: AuthEnv): string | undefined {
  const apex = resolveApexDomain(env);
  return apex && isUnderApex(env) ? apex : undefined;
}

/**
 * The absolute origins auth accepts requests from: the base URL, every host
 * Vercel serves this deployment on, and the apex with and without `www.`.
 * Absolute only, never a wildcard (a wildcard callbackURL is a documented
 * account-takeover class).
 */
export function resolveTrustedOrigins(env: AuthEnv): string[] {
  const origins = new Set<string>();
  const add = (url: string | undefined) => {
    if (!url) return;
    try {
      origins.add(new URL(url).origin);
    } catch {
      /* ignore an unparseable value */
    }
  };
  add(resolveBaseURL(env));
  add(trimmed(env.BETTER_AUTH_URL));
  add(https(env.VERCEL_URL));
  add(https(env.VERCEL_BRANCH_URL));
  add(https(env.VERCEL_PROJECT_PRODUCTION_URL));
  const apex = resolveApexDomain(env);
  if (apex) {
    add(`https://${apex}`);
    add(`https://www.${apex}`);
  }
  return [...origins];
}

/**
 * The WebAuthn origins a passkey ceremony is checked against. Under the apex,
 * every trusted origin, so a passkey made on camp-404.com verifies on
 * www.camp-404.com. Elsewhere undefined: the plugin uses the request's origin.
 */
export function resolvePasskeyOrigins(env: AuthEnv): string[] | undefined {
  if (!isUnderApex(env)) return undefined;
  return resolveTrustedOrigins(env).filter((o) => {
    const apex = resolveApexDomain(env)!;
    const host = hostOf(o);
    return host === apex || (host?.endsWith(`.${apex}`) ?? false);
  });
}

/** Plain-words warnings for a misconfigured auth stack, printed at boot. */
export function authConfigWarnings(env: AuthEnv): string[] {
  const warnings: string[] = [];
  const isProd =
    env.VERCEL_ENV === "production" || env.NODE_ENV === "production";

  if (!isAuthConfigured(env)) {
    warnings.push(
      authMayServe(env)
        ? "BETTER_AUTH_SECRET is not set — signing with a public placeholder. " +
            "Fine for local work; never for a deployment."
        : "BETTER_AUTH_SECRET is not set on this deployment — sign-in is OFF " +
            "(fail closed) until it is.",
    );
  }
  if (isAuthConfigured(env) && !isEmailProviderConfigured(env)) {
    warnings.push(
      "No email provider (RESEND_API_KEY + RESEND_FROM_EMAIL) — a forgotten " +
        "password cannot be reset, because the link has no way to arrive.",
    );
  }
  if (isProd && isAuthConfigured(env) && !trimmed(env.BETTER_AUTH_URL)) {
    warnings.push(
      "BETTER_AUTH_URL is not set — auth links use Vercel's production host. " +
        "Set it to the address members actually visit.",
    );
  }
  return warnings;
}
