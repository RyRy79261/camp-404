import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@camp404/ui",
    "@camp404/types",
    "@camp404/core",
    "@camp404/ai-prompts",
    "@camp404/os",
    "@camp404/games",
  ],
  typedRoutes: true,
  // next dev would write its own AGENTS.md and CLAUDE.md here; the repo's
  // AGENTS.md is the one guide.
  agentRules: false,
  // Download PDF (#249, app/print/pdf/route.ts) starts @sparticuz/chromium on
  // Vercel. Its Chromium is a set of compressed files the package reads at
  // run time, so they are named here for the route's function to carry them.
  outputFileTracingIncludes: {
    "/print/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  // `next dev`'s badge sits bottom-left, over the phone bottom bar's Home
  // button (404 OS, PR C), so Playwright's clicks there land on the badge.
  // Off for the E2E runs only; compile and runtime errors still show.
  ...(process.env.E2E_TEST_MODE === "1" ? { devIndicators: false } : {}),
  // Next's App Router refuses to route `.`-prefixed folders, so the
  // canonical `/.well-known/*` paths get rewritten into normal app
  // routes under /api/mcp/well-known/*.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/well-known/oauth-protected-resource",
      },
    ];
  },
};

export default config;
