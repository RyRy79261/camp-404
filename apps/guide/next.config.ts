import type { NextConfig } from "next";

// survival-guide.camp-404.com (#250): the Survival Guide's public sections,
// read from the camp's database on every request.
//
//  - No cache anywhere (owner, 2026-10-04): turning a section off, marking a
//    chapter members only or unpublishing it must take effect on the next
//    load, so every page is rendered on request (`force-dynamic`) and says
//    `private, no-store`. No ISR: a 60-second refresh would leave removed
//    words up.
//  - noindex (the X-Robots-Tag header here and a meta tag): search caches
//    outlive an unpublish. Crawling stays allowed so the tag is read.
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@camp404/types", "@camp404/core", "@camp404/ui"],
  typedRoutes: true,
  poweredByHeader: false,
  // next dev would write its own AGENTS.md and CLAUDE.md here; the repo's
  // AGENTS.md is the one guide.
  agentRules: false,
  ...(process.env.E2E_TEST_MODE === "1" ? { devIndicators: false } : {}),
  async headers() {
    return [
      {
        // Every page, but not Next's own hashed files.
        source: "/((?!_next/static|_next/image|fonts/).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default config;
