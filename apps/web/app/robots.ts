import type { MetadataRoute } from "next";

// The console is for members: a search engine may read the landing page and
// the public notices (privacy, terms), and nothing that is only a machine's or
// a member's (the API, print views, the Claude connector). Pages that say
// noindex themselves are NOT disallowed here, or a crawler would never fetch
// them to read it and could still list the bare URL: the sign-in pages
// (app/auth/layout.tsx) and a neighbour's shared link (app/neighbours/[token]).
// Modelled on the guide's robots.ts. There is no sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/print/", "/mcp/"],
    },
  };
}
