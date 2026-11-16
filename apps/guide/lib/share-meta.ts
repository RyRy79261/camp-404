// The link preview's size and words, apart from its drawing (share-image.tsx,
// which loads next/og and the font), so a page's metadata can name it.

export const SHARE_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_ALT =
  "Four pixel cats round a campfire under the stars. Camp 404's Survival Guide.";

/**
 * The preview as an Open Graph image. A page that sets its own `openGraph`
 * (a chapter) replaces the layout's, image and all, so it names this again.
 */
export const SHARE_OG_IMAGE = {
  url: "/opengraph-image",
  ...SHARE_SIZE,
  alt: SHARE_ALT,
  type: "image/png",
} as const;
