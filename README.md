# Camp 404

> A calm command centre for a chaotic desert.

Cross-platform camp management app for the Afrikaburn theme camp **Camp 404** — web + iOS + Android from a single Next.js codebase, wrapped by Capacitor for mobile.

See [`docs/brief.md`](docs/brief.md) for the full project brief (vision, architecture, features, POPIA, roadmap).

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Web:** Next.js 15 (App Router), React 19, Tailwind v4, shadcn/ui
- **Mobile:** Capacitor 8 wrapping the same Next.js static export
- **Database:** Neon Postgres + Drizzle ORM (HTTP + WebSocket drivers)
- **Auth:** Neon Auth (Stack) — hosted at `/handler/*`
- **AI:** Anthropic Claude Opus 4.7 (reasoning) + Haiku 4.5 (intent) + Groq Whisper Large v3 Turbo (voice)
- **Push:** Firebase Cloud Messaging (iOS, Android, Web Push)
- **Storage:** Vercel Blob
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
```

## Getting started

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in the variables you need

# Drizzle schema → SQL migrations
pnpm --filter @camp404/db db:generate
pnpm --filter @camp404/db db:migrate

# Dev (web only)
pnpm --filter @camp404/web dev

# Everything (lint, typecheck, test, build)
pnpm turbo run lint typecheck test build
```

## Mobile builds

See [`apps/mobile/README.md`](apps/mobile/README.md). App Store / Play submission is deferred per brief §11.

## Cron jobs

Scheduled from `apps/web/vercel.json`:

| Path | Schedule | Phase |
|---|---|---|
| `/api/cron/recipes/analyse` | daily 08:00 UTC | 3 |
| `/api/cron/manuals/generate` | daily 08:30 UTC | 4 |
| `/api/cron/notifications/reminders` | daily 09:00 UTC | 2 |

All cron endpoints require `Authorization: Bearer ${CRON_SECRET}`.

> Vercel's Hobby plan caps cron jobs at one run per day. Upgrade to Pro
> to run the recipe / manual jobs on a tighter schedule (e.g. every
> 15 min during the planning window) if needed.

## Security / POPIA

- Passport / SA ID numbers and EFT details are column-level encrypted with `pgcrypto`.
- We never store passport images, credit card numbers, or CVVs.
- Members can sanitise or fully delete their account; anonymised stub is renamed `Lost Cat #N` to preserve relational integrity.
- See brief §12 for the full data-protection model.

## Status

**Phase 0 — Setup.** Scaffold only; no runtime functionality wired up beyond `/api/health`.
Next: Phase 1 (Members & payments) — signup flow, T&Cs, Zapper invoice, account sanitisation.
