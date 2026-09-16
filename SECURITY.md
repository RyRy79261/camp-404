# Security

This repository is public. **The app it builds is live.** It holds real camp
members' data: government ID and passport numbers, emergency contacts, allergy
and medical notes, payment records and captains' private notes. Read this before
you look for problems.

## Report a vulnerability privately

Use GitHub's private vulnerability reporting: the **Security** tab, then
**Report a vulnerability**. Only the maintainers can see that thread.

Do not open a public issue, pull request or discussion about a security
problem. If private reporting does not work, contact the repository owner and
say only that you have a security issue. Wait for a private channel before you
send details.

Please include:

- what an attacker could do, in one sentence
- the steps to reproduce it
- whether you think someone has already used it

This is a volunteer project. Expect a reply in days, not hours.

## Do not test against the live site

Everything at the deployed URL is **production**. There is no staging site. The
accounts are real people.

Run the app locally instead (`pnpm dev`, see `AGENTS.md`). The Playwright suite
runs with `E2E_TEST_MODE=1` and an in-memory store, with no real data in it.

Never do these on the live site:

- create accounts or redeem invite codes to test an idea
- try to read another person's data, even to prove that you can
- run scanners, fuzzers or load tests

If you see someone else's data by accident, stop, do not save it, and report it.

## In scope

Anything that lets someone:

- read personal data they must not read. `MEMBER_FIELD_READERS` in
  `packages/core/src/privacy.ts` is the rule for each field. ID numbers,
  payments and captain notes are captain-only; emergency contacts and allergy
  data are for the member, captains and team leads.
- act as another account, or raise their own rank (member, team lead, captain)
- get into the camp without an approved application
- send a message or questionnaire to people outside the audience they may send to
- get past account deletion, or the rule that the last captain cannot leave

Out of scope: missing headers with no shown impact, opinions on rate-limit
numbers, attacks that need a device that is already compromised, and actions a
captain is allowed to take.

## Known and accepted

- **The founder invite code is in this repo.** First-time setup creates the root
  invite code `meowzit` (`apps/web/lib/bootstrap.ts`). Anyone can read it. A
  sign-up with it lands as **pending**, needs a captain's approval, and the code
  stops after 100 uses. Knowing it gets you into the approval queue, not into
  the camp.
- **One encryption key, no rotation.** ID numbers and bank details are
  encrypted in Node with AES-256-GCM (`packages/db/src/crypto.ts`), not with the
  pgcrypto extension, under the key in `PGCRYPTO_KEY` (the name is historical).
  The key is never rotated: after a key change, old values cannot be read.

## For contributors

- **Never commit a secret** (`DATABASE_URL`, `PGCRYPTO_KEY`, `CRON_SECRET`, API
  keys, blob tokens). If you commit one, say so at once. A force-push does not
  remove it from copies other people already fetched.
- **Privacy is enforced on the server, not in the UI.** Hiding a control is not
  a boundary. A new surface that shows personal data needs a server check, from
  the field-access list in `packages/core/src/privacy.ts`.
- **Do not weaken a guard to make a test pass.** Many guards exist because a
  review found a specific hole. The comment above the guard usually says which.

## Repository settings

A pull request cannot set these. A maintainer sets them in **Settings**:

- **Branch protection on `main`:** require a pull request and require **one**
  status check, `ci-pass`. It is the last job in `.github/workflows/ci.yml`: it
  needs every other job and fails if any of them failed. Do not require the
  Vercel checks. They are external, and they fail for reasons outside the code
  (for example the Neon branch limit).
- **Private vulnerability reporting:** Settings → Security → enable.
- **Secret scanning and push protection:** on. Push protection blocks the push
  instead of warning after it.
- **Dependabot alerts:** on.
