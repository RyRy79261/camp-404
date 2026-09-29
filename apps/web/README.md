# @camp404/web

The console at camp-404.com: a Next.js 16 app (App Router, React 19, Tailwind
v4) that draws the 404 OS desktop for signed-in members. Each tool is a
program window; the page for the focused window renders live inside it.

## Where things are

| Path                                          | What it holds                                                         |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `app/(console)/`                              | Every signed-in program, one folder per route, and its server actions |
| `app/auth/`, `app/signup/`, `app/onboarding/` | Sign-in, invite and first-form pages                                  |
| `app/api/`                                    | Route handlers: auth, uploads, push tokens, voice, webhooks, MCP      |
| `app/landing-hero.tsx`                        | The signed-out landing page, which keeps its own glitch design        |
| `components/os/`                              | The desktop shell (`desktop-shell.tsx`) around `@camp404/os`          |
| `lib/member-gate.ts`, `lib/captain-gate.ts`   | The page and action gates                                             |
| `lib/programs.ts`, `lib/program-routes.ts`    | The program registry and which window each URL opens                  |
| `lib/background-work.ts`                      | Everything that runs in `after()` instead of a cron job               |
| `lib/test-store.ts`                           | The in-memory store Playwright runs against (`E2E_TEST_MODE=1`)       |

A new page needs a row in `lib/program-routes.ts` and an entry in
`PROGRAM_REGISTRY` in `lib/programs.ts`; the drift tests fail until both
exist. The rules for pages (no `loading.tsx` in the console, one live window,
`data-os-private`, phones by CSS) are in [`AGENTS.md`](../../AGENTS.md).

## Run and test

```bash
pnpm --filter @camp404/web dev          # http://localhost:3000
pnpm --filter @camp404/web test         # Vitest: units and components
pnpm --filter @camp404/web test:e2e     # Playwright on the in-memory store
pnpm --filter @camp404/web test:e2e:db  # Playwright on a local Postgres
```

The Playwright suites are described in
[`tests/e2e/README.md`](tests/e2e/README.md). `vercel-build` runs the
migrations, then `next build`. The mobile build (`build:mobile`) is broken and
deferred; see [`apps/mobile`](../mobile/README.md).

### Kitchen routes

Recipes live under `/kitchen/recipes`, and read like
[Noble Notations](https://www.noble-notations.com)' recipe pages:

| Route                        | Who               | What it is                                                                                                 |
| ---------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `/kitchen/recipes`           | Every member      | The recipe book, and your own suggestions.                                                                 |
| `/kitchen/recipes/new`       | Every member      | Import a recipe by pasting its text (or dictating it).                                                     |
| `/kitchen/recipes/review`    | Kitchen reviewers | Suggestions to decide and approved recipes to send to Claude; older drafts wait here to be accepted.       |
| `/kitchen/recipes/[id]`      | Every member      | One recipe, once it is in the book (sooner for its submitter); `?plates=45` shows a proofread plate count. |
| `/kitchen/recipes/[id]/edit` | Kitchen reviewers | The source editor: edit what the recipe says and send it to Claude, who asks questions or writes it.       |

A Kitchen reviewer is a lead of the Kitchen team or a captain, and either may
start a Claude run (the owner's decision 2A). A run that succeeds goes
straight into the book. There is no daily limit on runs (the owner removed
it). A run stuck over 10 minutes is reset when a Kitchen page loads or the
source editor's loading panel polls.
