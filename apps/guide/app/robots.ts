import type { MetadataRoute } from "next";

// Crawling is allowed so a search engine reads the noindex on every page and
// keeps nothing (owner, 2026-10-04). There is no sitemap.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
