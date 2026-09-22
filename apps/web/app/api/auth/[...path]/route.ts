import { toNextJsHandler } from "better-auth/next-js";
import { auth, authMayServe } from "@camp404/auth";

// Self-hosted Better Auth, mounted in this app's own process (@camp404/auth).
// It serves the whole auth surface at /api/auth/*: sign-in and sign-up, the
// session, the Google callback, password reset, email verification, two-factor
// and passkeys. There is no middleware step any more: under Neon Auth a proxy
// had to swap an OAuth "verifier" for a cookie, and the callback here sets the
// cookie itself.

const handler = toNextJsHandler(auth);

/**
 * A Vercel deployment without BETTER_AUTH_SECRET answers 503 instead of
 * minting sessions signed with the public placeholder (see `authMayServe`).
 */
function closed(): Response {
  return Response.json(
    {
      message:
        "Sign-in is switched off on this deployment until BETTER_AUTH_SECRET is set.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request): Promise<Response> {
  if (!authMayServe(process.env)) return closed();
  return handler.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  if (!authMayServe(process.env)) return closed();
  return handler.POST(request);
}
