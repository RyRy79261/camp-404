<div align="center">
  <img src="apps/web/app/icon.svg" alt="Camp 404" width="96" height="96">
  <h1>Camp 404</h1>
  <p><strong>The lost clutter of imagination.</strong><br>
  A calm command centre for a chaotic desert.</p>
</div>

Camp 404 is a theme camp at AfrikaBurn. This repo is the camp's own
operations app: one place for its 30 to 80 members to sign up, say whether
they are coming, pay their dues, find a lift, and run their team's work, and
for captains to keep applications, tickets, money and notices in order. It is
an internal tool, not a social network.

Signed-in members work in **404 OS**, a retro desktop in the browser: each
tool is a program in its own window, and a phone gets a home screen instead.
The public recruiting site, [join.camp-404.com](https://join.camp-404.com),
wears the same desktop and needs no sign-in.

<p align="center">
  <img src="apps/web/public/inkblot/neon-404.jpg" alt="The camp's neon 404 sign at night in the Tankwa Karoo" width="480">
</p>

## What is in it

- **For every member:** the desktop and Today, the inbox and announcements,
  My forms (including their own ticket, DDT and WAP), My dues (pledge, send
  proof, see the balance), My gear (the tent, mattress and bedding they need
  from the camp, and who shares their tent), My lift, Tasks, the Calendar, the Roster and Family
  tree, About Camp 404, and each team's program and meetings. Themes include
  Calm, High contrast and Colour-blind safe.
- **Team tools, which every member may read:** Power (loads, fuel, the fuel
  log, the grid plan, generator readiness), Transport (cars, lifts and
  trailers), Inventory (the camp's gear: suggest a change, pledge, book), the
  Lounge (offer an activity or a DJ set), Camp layout (the site plan),
  Logistics (the year's pack, travel, build, burn, strike and unpack days,
  written onto the camp's Google Calendar), and the Kitchen's recipes and meal
  plan. A captain or a lead of the team that owns a tool edits it.
- **For captains (and leads, where the owner said so):** Applications (who is
  coming, the DDT and WAP), Payments and dues (with the Finance leads), Gear
  rental (the year's catalogue, confirming orders from camp stock or the
  supplier, and the tent list; captains only), Announcements, the questionnaire builder, the member panel (including how
  long a member stays), Camp settings, the Join site editor, the Audit log and
  System status.
- **One public page:** a captain may turn on a neighbour link
  (`/neighbours/<token>`) that shows other camps our site plan and arrival
  counts per day, and nothing typed inside the camp.

The product vision is in [`docs/brief.md`](docs/brief.md). Planned work that
is not built yet is in GitHub issues and open pull requests, not here.

## Workspace

A Turborepo with pnpm workspaces (Node 22 or newer, pnpm 10).

| Path                                                   | What it is                                                |
| ------------------------------------------------------ | --------------------------------------------------------- |
| [`apps/web`](apps/web/README.md)                       | The console: Next.js 16, React 19, Tailwind v4            |
| [`apps/join`](apps/join/README.md)                     | join.camp-404.com, the recruiting site                    |
| [`apps/admin-cli`](apps/admin-cli/README.md)           | A Node CLI for seeding and invite codes on a dev database |
| [`apps/mobile`](apps/mobile/README.md)                 | The Capacitor shell for iOS and Android (deferred)        |
| [`packages/core`](packages/core/README.md)             | Domain rules with no I/O: access, privacy, money, …       |
| [`packages/db`](packages/db/README.md)                 | Drizzle schema, migrations and every query                |
| [`packages/auth`](packages/auth/README.md)             | Self-hosted Better Auth: passwords, passkeys, two-factor  |
| [`packages/os`](packages/os/README.md)                 | The 404 OS window engine                                  |
| [`packages/games`](packages/games/README.md)           | The desktop's games and cats                              |
| [`packages/ui`](packages/ui/README.md)                 | Shared components (shadcn/ui) and the design tokens       |
| [`packages/types`](packages/types/README.md)           | Zod schemas and shared types                              |
| [`packages/ai-prompts`](packages/ai-prompts/README.md) | Versioned prompt templates                                |
| [`packages/telegram`](packages/telegram/README.md)     | The Telegram bot client; outbound is built but off        |
| `packages/eslint-config`, `packages/typescript-config` | Shared lint and TypeScript settings                       |

```mermaid
flowchart TB
  subgraph apps
    direction LR
    mobile["apps/mobile<br/>Capacitor shell"]
    web["apps/web<br/>the console, camp-404.com"]
    join["apps/join<br/>join.camp-404.com"]
    cli["apps/admin-cli"]
  end
  subgraph packages["packages (apps/web imports all of them)"]
    direction TB
    ui["ui"] & os["os"] & games["games"] & auth["auth"] & telegram["telegram"] & prompts["ai-prompts"]
    db["db"]
    core["core"]
    types["types"]
  end
  web --> packages
  mobile -. wraps the web export .-> web
  join --> os & games & db & types
  cli --> db & types
  games -. CSS order only .-> os
  ui --> core
  auth --> db
  telegram --> db
  prompts --> types
  db --> core
  core --> types
```

`@camp404/os` never imports `@camp404/games`. How a request travels, the
member gate, sign-in, the data model and the notice pipeline are drawn in
[`docs/architecture.md`](docs/architecture.md).

## Quickstart

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in what you need; most services stay off without keys

# A local Postgres and Neon proxy in Docker (ports 54322 and 4444)
pnpm db:local:up
pnpm db:local:migrate

# The console on http://localhost:3000
NEON_LOCAL_PROXY=1 \
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/main \
pnpm --filter @camp404/web dev

# The join site on http://localhost:3404
pnpm --filter @camp404/join dev

# The CI gate: run it before you push
pnpm turbo run lint typecheck test build
```

- To change the schema, edit `packages/db/src/schema.ts` and run
  `pnpm --filter @camp404/db db:generate`. Never hand-write a migration; see
  [`AGENTS.md`](AGENTS.md#database--read-this-before-touching-the-schema).
- The Playwright suites and how CI runs them are in
  [`apps/web/tests/e2e/README.md`](apps/web/tests/e2e/README.md).
- Components have a Storybook: `pnpm --filter @camp404/ui storybook`.
- `pnpm db:local:down` stops the database; its data volume stays.

## How it runs

- **Hosting.** Both apps deploy to Vercel in `fra1` (Frankfurt), beside the
  Neon Postgres database. The web app's `vercel-build` runs the migrations
  before `next build`, so every deploy applies pending migrations, and a data
  fix ships as a migration too.
- **Sign-in.** Self-hosted Better Auth with passwords, passkeys, two-factor and
  Google. A preview signs in with Google through production.
- **No cron jobs.** The camp is on Vercel's free plan. Notices, reminders and
  upkeep run after the action that caused them, or on a page load, in
  `after()` (`apps/web/lib/background-work.ts`).
- **CI.** Pull requests must pass one required check, `ci-pass`, which waits
  for lint, typecheck, unit tests, the build, the migrations on a Neon branch,
  the Playwright suites (the web app's against a production build), a
  dependency audit and commitlint.

## Security and POPIA

- ID and passport numbers and bank details are encrypted column by column
  (AES-256-GCM, `packages/db/src/crypto.ts`). The app never stores passport
  images, card numbers or CVVs.
- Privacy classes are enforced on the server (`packages/core/src/privacy.ts`),
  and reads of private data are recorded in the audit log.
- A member can delete their account. What must stay for the camp's records
  becomes a `Lost Cat #N` stub.
- To report a vulnerability, see [`SECURITY.md`](SECURITY.md).

## Docs

- [`AGENTS.md`](AGENTS.md): the rulebook for agents and people, with the
  owner's rulings. Read it before you change anything.
- [`docs/architecture.md`](docs/architecture.md): the diagrams.
- [`docs/design-system.md`](docs/design-system.md): the tokens and components.
- [`docs/specs`](docs/specs) and [`docs/plans`](docs/plans): designs, each with
  a status line at the top.
- [`DEFERRED.md`](DEFERRED.md): work left for later on purpose.

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
