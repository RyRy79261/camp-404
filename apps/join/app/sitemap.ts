import type { MetadataRoute } from "next";
import { JOIN_URL } from "@/lib/seo";

// One page: the desktop. Its windows are not pages of their own.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${JOIN_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
