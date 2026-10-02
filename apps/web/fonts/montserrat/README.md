# Montserrat (self-hosted)

Camp 404's sign-in / console brand face, loaded by `lib/fonts/montserrat.ts`
through `next/font/local` so `next build` never fetches from Google Fonts.

- **Source:** copied unmodified from
  `afrikaburn-contributors-app/packages/ui/fonts/montserrat/` (that repo's
  own vendoring of `@fontsource/montserrat@5.3.0`, files
  `files/montserrat-latin-{500,600,700,800}-normal.woff2`). Camp 404 needs
  the exact same four weights, so there was no need to re-download.
- **Licence:** SIL Open Font License 1.1 — `OFL.txt`, copied from the same
  source. Copyright 2011 The Montserrat Project Authors
  (https://github.com/JulietaUla/Montserrat).
- **Subset:** latin only, the same subset the `next/font/google` call used.

To update: take the same four files and the licence from a newer Fontsource
release (or from AfrikaBurn's copy if it updates first), and change the
version above.
