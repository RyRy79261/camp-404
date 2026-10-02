import localFont from "next/font/local";

// The 404 OS body face. Used with its `variable` (web and join layouts) and
// with only its `className` (the signed-out landing page, which does not
// want a CSS var).
//
// Self-hosted (apps/web/fonts/inter/, provenance in its README) rather
// than `next/font/google`, so `next build` makes no Google Fonts request.
// The vendored file is the variable-weight woff2 (normal style only), the
// same one `next/font/google` served when no `weight` was given.
export const interFont = localFont({
  src: "../../fonts/inter/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
});
