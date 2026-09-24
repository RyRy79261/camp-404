// @camp404/auth — Camp 404's self-hosted Better Auth (adapted from the
// AfrikaBurn contributors app's @quagga/auth).
//
//   Route handler, apps/web/app/api/auth/[...path]/route.ts:
//     export const { GET, POST } = toNextJsHandler(auth);
//   Server read (apps/web/lib/auth.ts):
//     await auth.api.getSession({ headers: await headers() });
//   Client (apps/web/lib/auth-client.ts): built per app, client-only.
//
// The pure env resolvers are also published as `@camp404/auth/env`, which
// reads how auth is configured without constructing an instance. (The captain
// System status page, /captains/system, does not import it: its Sign-in check
// in apps/web/lib/system-status.ts reads the same env names itself.)

export { auth, createAuth, buildAuthOptions, type Auth } from "./config";
export { sendAuthEmail, buildAuthEmail, type AuthEmailKind } from "./email";
export {
  AUTH_RP_NAME,
  AUTH_SESSION,
  authConfigWarnings,
  authMayServe,
  canDeliverAuthEmail,
  isAuthConfigured,
  isEmailProviderConfigured,
  isGoogleConfigured,
  isProjectPreviewOrigin,
  resolveAuthEmailCaptureFile,
  resolveBaseURL,
  resolveOAuthProxy,
  resolvePasskeyRpID,
  resolveTrustedOrigins,
  type AuthEnv,
  type OAuthProxyMode,
} from "./env";
