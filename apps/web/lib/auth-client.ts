"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Neon Auth (Better Auth) client instance. Same-origin fetches to
 * /api/auth/* — no base URL needed.
 *
 * Use from client components:
 *   import { authClient } from "@/lib/auth-client";
 *   const { data: session } = authClient.useSession();
 *   await authClient.signIn.social({ provider: "google" });
 */
export const authClient = createAuthClient();
