import { auth } from "@/lib/neon-auth";

// Neon Auth's verifier-to-cookie exchange runs ONLY inside this proxy.
// Without it, social sign-in returns the user with a session_verifier in
// the URL but no session cookie ever gets set. Don't remove this.
//
// Matcher is scoped to /auth/* so the exchange runs on the OAuth return
// trip; protected routes do their own session check in their server
// components via getAuthenticatedUser().
export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  matcher: ["/auth", "/auth/:path*"],
};
