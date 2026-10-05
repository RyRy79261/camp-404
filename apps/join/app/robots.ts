import type { MetadataRoute } from "next";
import { JOIN_URL } from "@/lib/seo";

// The recruiting site is public and meant to be found: crawl all of it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${JOIN_URL}/sitemap.xml`,
  };
}
