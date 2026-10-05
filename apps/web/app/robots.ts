import type { MetadataRoute } from "next";

// The console is for members: a search engine may read the landing page and
// the public notices (privacy, terms), and nothing that is only a machine's or
// a member's (the API, print views, the Claude connector, neighbours' links).
// The sign-in pages say noindex themselves (app/auth/layout.tsx). Modelled on
// the guide's robots.ts. There is no sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/print/", "/mcp/", "/neighbours/"],
    },
  };
}
