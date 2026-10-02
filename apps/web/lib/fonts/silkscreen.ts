import localFont from "next/font/local";

// The 404 OS pixel face: window titles, icon labels, taskbar, buttons,
// headings (web and join layouts both use it the same way).
//
// Self-hosted (apps/web/fonts/silkscreen/, provenance in its README)
// rather than `next/font/google`, so `next build` makes no Google Fonts
// request. Silkscreen is not a variable font, so these are its only two
// weights — the same ones the `next/font/google` calls asked for.
export const silkscreenFont = localFont({
  src: [
    {
      path: "../../fonts/silkscreen/silkscreen-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/silkscreen/silkscreen-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-silkscreen",
  display: "swap",
});
