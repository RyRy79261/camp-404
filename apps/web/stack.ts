import "server-only";

import { StackServerApp } from "@stackframe/stack";

/**
 * Neon Auth (Stack) server app. Keys come from Neon Console → Auth →
 * Configuration. Session is stored in an HTTP-only cookie.
 *
 * Use in server components, route handlers, server actions:
 *   const user = await stackServerApp.getUser();
 *
 * The "build-placeholder" fallbacks let `next build` succeed without
 * secrets; any real request without the env vars set will fail loudly.
 */
// Stack validates projectId as a UUID — use a sentinel UUID for builds.
const PLACEHOLDER_UUID = "11111111-1111-4111-8111-111111111111";
const PLACEHOLDER_KEY = "build-placeholder";

export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
  projectId: process.env.NEXT_PUBLIC_STACK_PROJECT_ID ?? PLACEHOLDER_UUID,
  publishableClientKey:
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY ?? PLACEHOLDER_KEY,
  secretServerKey: process.env.STACK_SECRET_SERVER_KEY ?? PLACEHOLDER_KEY,
  urls: {
    signIn: "/handler/sign-in",
    signUp: "/handler/sign-up",
    afterSignIn: "/",
    afterSignUp: "/",
    afterSignOut: "/",
  },
});
