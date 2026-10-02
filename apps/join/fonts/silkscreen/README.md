# Silkscreen (self-hosted)

The 404 OS pixel face (window titles, icon labels, chrome), loaded by
`lib/fonts/silkscreen.ts` through `next/font/local` so `next build` never
fetches from Google Fonts.

- **Source:** `@fontsource/silkscreen@5.3.0` (npm), files
  `files/silkscreen-latin-{400,700}-normal.woff2`, copied unmodified —
  Silkscreen is not a variable font, so these are the only two weights it
  ships, matching the `weight: ["400", "700"]` the `next/font/google` calls
  used.
- **Licence:** SIL Open Font License 1.1 — `OFL.txt`, copied from the same
  package (the package's `LICENSE` file, which is the OFL text).
- **Subset:** latin only, the same subset the `next/font/google` calls used.

To update: take the same two files and the licence from a newer
`@fontsource/silkscreen` release, and change the version above.
