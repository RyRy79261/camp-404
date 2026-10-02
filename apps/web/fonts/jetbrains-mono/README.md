# JetBrains Mono (self-hosted)

Camp 404's brand mono face (eyebrows, data), loaded by
`lib/fonts/jetbrains-mono.ts` through `next/font/local` so `next build`
never fetches from Google Fonts.

- **Source:** `@fontsource-variable/jetbrains-mono@5.3.0` (npm), file
  `files/jetbrains-mono-latin-wght-normal.woff2`, copied unmodified. This is
  the variable-weight file (normal style only), matching the
  `next/font/google` call it replaces: no `weight` was given there, so Next
  served the full variable axis.
- **Licence:** SIL Open Font License 1.1 — `OFL.txt`, copied from the same
  package (the package's `LICENSE` file, which is the OFL text).
- **Subset:** latin only, the same subset the `next/font/google` call used.

To update: take the same file and licence from a newer
`@fontsource-variable/jetbrains-mono` release, and change the version above.
