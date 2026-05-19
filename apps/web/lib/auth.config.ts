import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth config — split from auth.ts so it can be imported by middleware
 * (which runs on the edge and cannot pull in the Drizzle adapter).
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 15 },
  pages: { signIn: "/signin" },
  providers: [
    // Primary: magic-link email
    Nodemailer({
      server: process.env.AUTH_EMAIL_SERVER!,
      from: process.env.AUTH_EMAIL_FROM!,
    }),
    // Convenience: Google
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // CI/Agent: long-lived service token, scoped to test- prefixed data
    Credentials({
      id: "agent-token",
      name: "Agent Token",
      credentials: {
        token: { label: "Token", type: "password" },
      },
      authorize(credentials) {
        const expected = process.env.AUTH_AGENT_TOKEN;
        if (!expected || credentials?.token !== expected) return null;
        return {
          id: "agent",
          name: "CI Agent",
          email: "agent@camp-404.com",
          role: "agent" as const,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user) {
        token.role = (user as { role?: string }).role ?? "member";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/signin") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/webhooks") ||
        nextUrl.pathname.startsWith("/api/cron");
      if (isPublic) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
