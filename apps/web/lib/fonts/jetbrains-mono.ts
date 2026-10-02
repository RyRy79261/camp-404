import localFont from "next/font/local";

// Camp 404's brand mono face, exposed as --font-brand-mono (eyebrows, data).
//
// Self-hosted (apps/web/fonts/jetbrains-mono/, provenance in its README)
// rather than `next/font/google`, so `next build` makes no Google Fonts
// request. The vendored file is the variable-weight woff2 (normal style
// only), the same one `next/font/google` served when no `weight` was given.
export const jetbrainsMonoFont = localFont({
  src: "../../fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-brand-mono",
  display: "swap",
});
