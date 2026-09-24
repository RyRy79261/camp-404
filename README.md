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

## Cron jobs

`apps/web/vercel.json` is the source of truth. It schedules seven jobs, each
once a day:

| Path                                | Schedule (UTC)             | What it does                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/maintenance`             | `30 7 * * *` (daily 07:30) | Encrypts any government ID number still stored as plaintext and, on the production deployment only, deletes profile photos and image answers of members with no camp account.                                                                                  |
| `/api/cron/recipes/analyse`         | `0 8 * * *` (daily 08:00)  | Not built: answers `status: "stub"` and does nothing. Will normalise pending recipes with Claude.                                                                                                                                                              |
| `/api/cron/manuals/generate`        | `30 8 * * *` (daily 08:30) | Not built: answers `status: "stub"` and does nothing. Will generate camp manuals.                                                                                                                                                                              |
| `/api/cron/notifications/reminders` | `0 9 * * *` (daily 09:00)  | Reminds members still pending on any open questionnaire send due within the next 48 hours, with the same 24-hour dedup as a captain's manual reminder. Also reminds the person responsible for a task the camp day before it is due and on the day, once each. |
| `/api/cron/notifications/dispatch`  | `15 9 * * *` (daily 09:15) | Fans out scheduled broadcasts whose `send_at` has arrived into per-member `notification_deliveries`. Immediate announcements still fan out at publish time.                                                                                                    |
| `/api/cron/notifications/push`      | `25 9 * * *` (daily 09:25) | Sends queued push deliveries to FCM through firebase-admin. Answers 503 without Firebase config.                                                                                                                                                               |
| `/api/cron/notifications/email`     | `35 9 * * *` (daily 09:35) | Emails the notices that must not be missed, through Resend. Answers 503 and touches nothing without Resend config.                                                                                                                                             |

- Every job needs `Authorization: Bearer ${CRON_SECRET}`.
- `/api/cron/telegram/dispatch` exists but is deliberately not scheduled:
  Telegram outbound stays off until the owner turns it on (see
  `DEFERRED.md`). Without a bot it answers `status: "not_configured"`.
- `apps/web/lib/__tests__/cron-stub.test.ts` checks the routes against
  `vercel.json`: it fails when a scheduled path has no route or a route is
  not scheduled (telegram excepted), and when the `SCHEDULED_JOBS` list in
  `apps/web/lib/cron-schedule.ts` drifts from it path by path and time by
  time.
- Captains can read the schedule at `/captains/system`. The app keeps no
  record of when a job last ran; Vercel's Cron Jobs tab for the project lists
  each run.
- A run with failures answers non-2xx, so the cron dashboard shows it.

> Vercel's Hobby plan caps cron jobs at one run per day. A tighter schedule
> (for example the recipe or manual jobs every 15 minutes during the planning
> window, once they are built) needs Pro.

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
