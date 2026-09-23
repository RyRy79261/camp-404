// THE Better Auth configuration for Camp 404, self-hosted in the web app's own
// process against our own database. It replaces managed Neon Auth (owner's
// call, 2026-09-22: "I would like two-factor and passkeys"), which cannot run
// either plugin.
//
// Adapted from the AfrikaBurn contributors app's @quagga/auth/config — the same
// options, minus what only a three-app deployment needs (a shared cookie
// domain) and minus AfrikaBurn's deletion-rescue hook (Camp 404 erases at
// once; there is no pending deletion to cancel).
//
// Boots with no env: it constructs with a placeholder secret and the database
// placeholder URL, so `next build` and an env-less local start never throw.
// Whether a request may actually be served is `authMayServe` (env.ts): a
// Vercel deployment without the real secret fails closed.

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import { createHttpDb, schema } from "@camp404/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@camp404/core";
import { sendAuthEmail } from "./email";
import {
  AUTH_RP_NAME,
  AUTH_SESSION,
  authConfigWarnings,
  canDeliverAuthEmail,
  isGoogleConfigured,
  resolveBaseURL,
  resolvePasskeyOrigins,
  resolvePasskeyRpID,
  resolveRateLimit,
  resolveRequireEmailVerification,
  resolveTrustedOrigins,
  resolveUseSecureCookies,
  type AuthEnv,
} from "./env";

/**
 * Placeholder secret (at least 32 characters) so the instance constructs
 * without a real one. It is public, so anything signed with it is worthless;
 * `authMayServe` refuses to serve with it on any deployment.
 */
const PLACEHOLDER_SECRET =
  "camp404-build-placeholder-better-auth-secret-00000000000";

/**
 * Assemble the betterAuth() options from an env bag. Pure apart from binding
 * the drizzle adapter to an HTTP database client (which opens no connection
 * until a query runs). Exported so tests can inspect what an env resolves to.
 */
export function buildAuthOptions(env: AuthEnv = process.env) {
  const baseURL = resolveBaseURL(env);
  const passkeyRpID = resolvePasskeyRpID(env);
  const passkeyOrigins = resolvePasskeyOrigins(env);
  const useSecureCookies = resolveUseSecureCookies(env);

  return {
    appName: "Camp 404",
    secret: env.BETTER_AUTH_SECRET?.trim() || PLACEHOLDER_SECRET,
    ...(baseURL ? { baseURL } : {}),
    // Absolute origins only — never a wildcard.
    trustedOrigins: resolveTrustedOrigins(env),
    // No outbound telemetry from an auth stack that holds member data.
    telemetry: { enabled: false },

    // The HTTP driver has no transactions, so `transaction` stays at its
    // default (false): operations run one after another, the documented
    // serverless-safe path.
    database: drizzleAdapter(createHttpDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
        twoFactor: schema.twoFactor,
        passkey: schema.passkey,
      },
    }),

    emailAndPassword: {
      enabled: true,
      // The same numbers the sign-up and reset forms check. Under Neon Auth
      // the server floor was the hosted default, lower than the form's.
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      requireEmailVerification: resolveRequireEmailVerification(env),
      // A reset signs every device out. Better Auth defaults this to false.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(env, { to: user.email, kind: "reset", url });
      },
      onPasswordReset: async ({ user }) => {
        await sendAuthEmail(env, {
          to: user.email,
          kind: "password-reset-completed",
        });
      },
    },

    emailVerification: {
      // Sent on sign-up only when there is a way to deliver it: a provider,
      // or the e2e capture file. It proves ownership (the GOD_EMAILS recovery
      // path needs a verified email) without blocking sign-in, unless the env
      // turns the gate on.
      sendOnSignUp: canDeliverAuthEmail(env),
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(env, { to: user.email, kind: "verify", url });
      },
    },

    // CHANGE-EMAIL STAYS OFF (AfrikaBurn's finding). Turning it on mounts an
    // endpoint that sends the confirmation to the NEW address only, which
    // turns a stolen session into a permanent account takeover. Nothing in
    // Camp 404 offers it; the endpoint must not exist either.
    user: {
      changeEmail: { enabled: false },
    },

    // Database sessions plus a short signed cookie cache. The numbers live in
    // env.ts so a screen that revokes sessions can state the real lag.
    session: {
      expiresIn: AUTH_SESSION.expiresInSeconds,
      updateAge: AUTH_SESSION.updateAgeSeconds,
      cookieCache: {
        enabled: true,
        maxAge: AUTH_SESSION.cookieCacheMaxAgeSeconds,
      },
    },

    // Google may link to an existing account with the same email: Google
    // proves the address, and a member who signed up with a password and
    // later presses "Continue with Google" means the same person.
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },

    ...(isGoogleConfigured(env)
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID!.trim(),
              clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
            },
          },
        }
      : {}),

    // Counters in the database so every serverless instance shares them.
    // In-memory storage is per-instance, which is no limit at all.
    rateLimit: {
      storage: "database",
      modelName: "rateLimit",
      ...resolveRateLimit(env),
    },

    // The two reasons for leaving Neon Auth. Neither is ever the ONLY way in:
    // the password (or Google) stays, so a lost phone or passkey is never a
    // dead end (recovery: password plus a backup code).
    plugins: [
      twoFactor({
        issuer: AUTH_RP_NAME,
        // The raw option stores backup codes in plain text. Encrypt them.
        backupCodeOptions: { storeBackupCodes: "encrypted" },
        // A Google-only or passkey-only member may still add a second factor.
        allowPasswordless: true,
      }),
      passkey({
        ...(passkeyRpID ? { rpID: passkeyRpID } : {}),
        rpName: AUTH_RP_NAME,
        ...(passkeyOrigins ? { origin: passkeyOrigins } : {}),
        // Discoverable credentials and user verification: one tap, no email
        // to type, for a camp that is mostly not technical.
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      }),
    ],

    advanced: {
      cookiePrefix: "camp404",
      ...(useSecureCookies === undefined ? {} : { useSecureCookies }),
      // Lax, not strict: the Claude connector's OAuth round trip is a
      // cross-site top-level navigation (claude.ai → /api/mcp/oauth/authorize
      // → /mcp/connect), and a strict cookie would not ride along.
      defaultCookieAttributes: { sameSite: "lax" },
    },
  } satisfies BetterAuthOptions;
}

/** Construct a Better Auth instance for an env, printing any warnings. */
export function createAuth(env: AuthEnv = process.env) {
  for (const warning of authConfigWarnings(env)) {
    console.warn(`[auth] ${warning}`);
  }
  return betterAuth(buildAuthOptions(env));
}

/** The app's one instance: the route handler and every session read use it. */
export const auth = createAuth();

/** The concrete Better Auth instance type. */
export type Auth = ReturnType<typeof createAuth>;
