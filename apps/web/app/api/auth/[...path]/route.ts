import { auth } from "@/lib/neon-auth";

// Catch-all that proxies Better Auth's API surface: sign-in, sign-up,
// session, OAuth callbacks, etc. The OAuth verifier-to-cookie exchange
// itself runs in proxy.ts (auth.middleware) — without that, social
// sign-in returns the user with a session_verifier in the URL but no
// session cookie ever gets set.
export const { GET, POST } = auth.handler();
