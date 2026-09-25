# Camp 404

> A calm command centre for a chaotic desert.

Cross-platform camp management app for the Afrikaburn theme camp **Camp 404** — web + iOS + Android from a single Next.js codebase, wrapped by Capacitor for mobile.

See [`docs/brief.md`](docs/brief.md) for the full project brief (vision, architecture, features, POPIA, roadmap).

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Web:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui
- **Mobile:** Capacitor 8 wrapping the same Next.js static export
- **Database:** Neon Postgres + Drizzle ORM (HTTP + WebSocket drivers)
- **Auth:** self-hosted Better Auth (`packages/auth`) with two-factor and passkeys — handler at `/api/auth/*`, screens at `/auth/*`, security settings at `/profile/security`
- **AI:** Anthropic Claude Opus 4.8 (reasoning) + Haiku 4.5 (intent) + Groq Whisper Large v3 Turbo (voice)
- **Push:** Firebase Cloud Messaging (iOS, Android, Web Push)
- **Storage:** Vercel Blob — used for [profile photos](docs/profile-photos.md), receipts, and voice memos
- **Payments:** TBD

## Layout

```
apps/
  web/        Next.js app (served on Vercel; statically exported for mobile)
  join/       Public join site, join.camp-404.com (its own Vercel project)
  mobile/     Capacitor host (iOS + Android)
  admin-cli/  Node CLI for data ops
packages/
  ui/         Shared shadcn/ui components
  db/         Drizzle schema + migrations
  types/      Zod schemas + shared TS types
  ai-prompts/ Versioned prompt templates
  eslint-config/
  typescript-config/
design/       Pencil (.pen) design sources — see docs/design-tooling.md
```

Design: [`docs/design-system.md`](docs/design-system.md) documents the
`@camp404/ui` tokens and components; [`docs/design-tooling.md`](docs/design-tooling.md)
covers the pencil.dev design-to-code workflow.

## Getting started

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in the variables you need

# Drizzle schema → SQL migrations
pnpm --filter @camp404/db db:generate
pnpm --filter @camp404/db db:migrate

# Dev (web only)
pnpm --filter @camp404/web dev

# Component Storybook (@camp404/ui)
pnpm --filter @camp404/ui storybook

# Everything (lint, typecheck, test, build)
pnpm turbo run lint typecheck test build
```

## Kitchen

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

## Mobile builds

See [`apps/mobile/README.md`](apps/mobile/README.md). App Store / Play submission is deferred per the project brief.

## Deploying

The web app deploys to Vercel. The `vercel-build` script in
`apps/web/package.json` runs `drizzle-kit migrate` before `next build`,
so every deploy applies any pending migrations to whichever database
`DATABASE_URL` points at. Vercel auto-detects `vercel-build` and runs it
in place of `build` — no project setting required, as long as the
project's Build Command field is left empty (or set to `next build`).

If you've set a custom Build Command in the Vercel dashboard, change it
to `pnpm vercel-build` (with the project's Root Directory at
`apps/web`) or fold `pnpm --filter @camp404/db db:migrate &&` into the
front of whatever command you use.

`drizzle-kit migrate` tracks applied migrations in the
`__drizzle_migrations` table, so it is safe to run on every deploy.

The join site (`apps/join`) is a second Vercel project. See
[`docs/deploy-join.md`](docs/deploy-join.md) for its setup. Each app's
`vercel.json` has an `ignoreCommand` (`turbo-ignore`), so a push builds a
preview only for the app it changes.

## Background work (no cron jobs)

The camp runs on Vercel's free plan, so nothing is scheduled:
`apps/web/vercel.json` has no `crons`. The work that used to run daily now
runs when people use the app, after the response (`apps/web/lib/background-work.ts`):

| Work                                                                                          | When it runs                                                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Announcement fan-out, push, email                                                             | Right after the action that wrote the notices, and on any page load for anything left queued or scheduled. |
| Questionnaire and task deadline reminders                                                     | On a page load, 09:00–21:00 camp time, deduped as before.                                                  |
| Upkeep: encrypt leftover plaintext ID numbers, delete orphan avatar folders (production only) | On a page load, once a day. Erasure also deletes the member's own folder at once.                          |

- The page-load run is guarded by a row in `action_rate_limit`, so it runs at
  most once every five minutes across every server.
- Push and email are skipped until Firebase and Resend are configured; their
  deliveries stay queued until then.
- Captains can read this list at `/captains/system`.

## Security / POPIA

- Passport / SA ID numbers and EFT details are column-level encrypted with `pgcrypto`.
- We never store passport images, credit card numbers, or CVVs.
- Members can sanitise or fully delete their account; anonymised stub is renamed `Lost Cat #N` to preserve relational integrity.
- See the project brief for the full data-protection model.

## Status

**Phase 0 — Setup.** Scaffold only; no runtime functionality wired up beyond `/api/health`.
Next: Phase 1 (Members & payments) — signup flow, T&Cs, Zapper invoice, account sanitisation.

## License

This project is licensed under the [Functional Source License, Version 1.1, with Apache 2.0 Future License (FSL-1.1-ALv2)](https://fsl.software/). See [LICENSE](LICENSE) for the full text.

**In plain language:**

- You can use, copy, modify, fork, and redistribute the code for **any purpose** — personal use, self-hosting, internal use at your camp or organization, education, research, or as part of professional services you provide — **except a Competing Use**. The LICENSE defines a Competing Use as making the Software available to others in a commercial product or service that (1) substitutes for the Software, (2) substitutes for any other product or service the licensor offers using the Software, or (3) offers the same or substantially similar functionality as the Software.
- Clause (3) stands on its own: a commercial product or service offering the same or substantially similar functionality is a Competing Use **even if the licensor does not currently offer a competing product or service**.
- **Every release auto-converts to Apache 2.0 on the second anniversary of its publication.** Each version carries its own clock, so older versions become fully open source on a rolling basis.

**Examples:**

- A camp member self-hosting their own copy to manage their own theme camp: allowed.
- A camp lead deploying it internally for their camp's members: allowed.
- A developer forking it, wiring up their own AI provider, and sharing it with a community: allowed.
- A company launching "CampManagerCloud" as a paid SaaS offering the same or substantially similar functionality as the Software: **not allowed** without a commercial license, whether or not the licensor currently offers a competing service.

### Commercial licensing

If your intended use is a Competing Use, or you're unsure whether it qualifies, please get in touch before deploying: **meowzit.eth@gmail.com**.
