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
  // /auth/* covers the standard sign-in/sign-up round-trip. /mcp/connect
  // is the post-signin landing for the MCP OAuth flow — Better Auth lands
  // the user there with a session verifier appended, and the
  // verifier-to-cookie exchange has to run before the page's useSession
  // can see a logged-in state.
  matcher: ["/auth", "/auth/:path*", "/mcp/:path*"],
};
