import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

// Reads the session cookie set moments earlier by the proxy verifier
// exchange; cannot be statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Bare /auth landing — the path Neon Auth's social callback returns to
 * after Google OAuth (with `?neon_auth_session_verifier=…`). The proxy
 * middleware (`auth.middleware`) runs on /auth before this page does,
 * exchanges the verifier for a real session cookie, and only then is
 * this server component called. Without this page sitting at /auth,
 * Next would 404 the post-OAuth landing.
 *
 * We forward authenticated users to home (which routes them onward to
 * /signup/required or /onboarding/questionnaire as needed). Anyone
 * landing here without a session goes to the sign-in form.
 */
export default async function AuthRootPage() {
  const user = await getAuthenticatedUser();
  if (user) redirect("/");
  redirect("/auth/sign-in");
}
