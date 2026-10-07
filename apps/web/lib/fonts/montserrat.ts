import localFont from "next/font/local";

// Camp 404's sign-in / console brand face, exposed as --font-brand;
// globals.css falls through to it from --font-sans. Body 500, headings up
// to 800.
//
// Self-hosted (apps/web/fonts/montserrat/, provenance in its README)
// rather than `next/font/google`, so `next build` makes no Google Fonts
// request — a network blip there intermittently failed CI builds.
export const montserratFont = localFont({
  src: [
    {
      path: "../../fonts/montserrat/montserrat-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../fonts/montserrat/montserrat-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../fonts/montserrat/montserrat-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../fonts/montserrat/montserrat-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-brand",
  display: "swap",
  // Not preloaded: the root layout would preload all four files on every
  // route, and the console and the gate screens wear the 404 OS skin (Inter
  // and Silkscreen). Only pages outside the skin (sign-in and the legal
  // pages, for example) draw Montserrat, and `swap` shows them text while it
  // loads.
  preload: false,
});
