# @camp404/guide

survival-guide.camp-404.com: the Survival Guide's public sections (#250). A
book to read and print, with no sign-in. Writing stays in the app
(`/guide`), where a captain puts a section on the public site.

- **What is public:** a chapter that is published, in a public section, and
  not kept members only. Its "Members only" parts are cut out in
  `@camp404/db/documents` before the page sees the text
  (`toPublicChapter` in `@camp404/core`, which fails closed). A slug that is
  not public gets the same 404 as one never used.
- **Data:** `lib/guide-data.ts`, the public reads only. Under
  `E2E_TEST_MODE=1` (never on Vercel) `lib/fixtures.ts` stands in, through
  the same rule and cut.
- **Freshness:** every page renders on request, `private, no-store`; no ISR.
- **Robots:** noindex (meta tag and `X-Robots-Tag`), crawling allowed, no
  sitemap.
- **Print:** the browser's dialog. A chapter prints on A4 with a running head
  and page numbers in the margin (Chromium; other browsers print without
  them); a duty card prints as the app's card (`@camp404/ui`'s
  `duty-card-print`), without "Used by".
- **Hosting:** its own Vercel project, root `apps/guide`, `fra1`, built only
  when it changed (`turbo-ignore` in `vercel.json`). One env var:
  `DATABASE_URL`.

```bash
pnpm --filter @camp404/guide dev        # http://localhost:3405
pnpm --filter @camp404/guide test       # Vitest
pnpm --filter @camp404/guide test:e2e   # Playwright, against next dev on fixtures
```
