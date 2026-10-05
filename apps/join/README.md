# @camp404/join

join.camp-404.com, the "404 OS" recruiting site: a retro desktop where a
visitor reads about the camp and its teams, sees the dates, the fee and the
captains, plays INKBLOT, and follows "Apply" to sign up on camp-404.com. It
has no sign-in of its own.

- **Data:** it reads the words captains keep in the console's Join site
  program (`/captains/join-site`), the captains and this year's headcount,
  through `getJoinSitePublic` in `@camp404/db/join-site`
  (`lib/load-join-data.ts`).
- **Imports:** `@camp404/os` (the window engine and terminal),
  `@camp404/db`, `@camp404/types`, and from `@camp404/games` only
  `inkblot` and `inkblot/art` (`lib/games-boundary.test.ts`).
- **Look:** Join's palette is the 404 OS palette. It is never themed.
- **Hosting:** its own Vercel project, root `apps/join`, in `fra1`
  (`vercel.json`). It builds only when join or a package it imports changed
  (`scripts/vercel-ignore-build.sh`, the `ignoreCommand` in `vercel.json`), so
  a web-only or docs-only push does not deploy it.

```bash
pnpm --filter @camp404/join dev        # http://localhost:3404
pnpm --filter @camp404/join test       # Vitest
pnpm --filter @camp404/join test:e2e   # Playwright, against next dev
```
