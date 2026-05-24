import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth (Better Auth) server instance. Configure via:
 *   - NEON_AUTH_BASE_URL    — your Neon Auth API URL (Neon Console → Auth)
 *   - NEON_AUTH_COOKIE_SECRET — at least 32 chars (openssl rand -base64 32)
 *
 * Use from server components, route handlers, server actions:
 *   const { data: session } = await auth.getSession();
 *
 * The auth API handler and proxy/middleware re-use this same instance —
 * see app/api/auth/[...path]/route.ts and proxy.ts.
 */

// Build-time fallbacks let `next build` succeed without env vars. The
// secret must be ≥ 32 chars or createNeonAuth throws on import. Any real
// request without the env vars set will fail loudly when it hits the
// Neon Auth API.
const PLACEHOLDER_BASE_URL = "https://build-placeholder.neon-auth.invalid";
const PLACEHOLDER_COOKIE_SECRET =
  "build-placeholder-secret-build-placeholder-secret"; // 50 chars

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL ?? PLACEHOLDER_BASE_URL,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET ?? PLACEHOLDER_COOKIE_SECRET,
    // Lax (not strict — the default) so cross-site top-level navigations
    // — claude.ai → /api/mcp/oauth/authorize → /mcp/connect, etc. —
    // carry the session cookie. Strict drops the cookie on cross-site
    // GETs and breaks the OAuth round-trip.
    sameSite: "lax",
  },
});
