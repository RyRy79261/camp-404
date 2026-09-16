# Sub-project A — PII-at-rest encryption (design)

**Date:** 2026-05-30
**Status:** Proposed — awaiting review
**Program:** Camp 404 audit remediation. This is sub-project **A** of the
sequenced program (A → B → C → E → D → F). It is the critical, foundational
piece; sub-project **F** (account deletion / "Lost Cat") depends on the
encrypted columns A populates.

## Problem

The primary member-intake path stores government ID numbers **in plaintext**.
`saveBurnerProfile` (`apps/web/app/onboarding/questionnaire/actions.ts`) and the
replay path `BURNER_PROFILE.save` (`apps/web/lib/forms.ts`) write the whole
questionnaire `responses` object — including `id.number` (SA ID / passport) —
verbatim into `burner_profiles.responses` (a JSONB column), on every save. The
encrypted columns `users.passport_encrypted` / `sa_id_encrypted` stay NULL for
normal signups; only the MCP `update_my_id_documents` tool ever populates them.

This is a concrete leak, not just at-rest exposure:

- MCP `get_my_burner_profile` returns the full `responses` (plaintext ID) to the
  AI agent; the consent stripper (`lib/mcp/consent.ts`) only strips the
  *encrypted* columns, so it does not catch the plaintext in `responses`.
- It directly violates the repo's own POPIA stance (`AGENTS.md` §Security:
  "Passport numbers, SA ID numbers … never store these plaintext").

## Access model (the decision that drives this)

> **Passport / SA-ID numbers are readable by the owner and by captains,
> encrypted at rest, and opaque to everyone else.**

This maps onto the existing symmetric column encryption (`apps/web/lib/crypto.ts`,
AES-256-GCM keyed off `PGCRYPTO_KEY`) with **decryption gated in code**:

| Reader | Allowed? | Channel |
|---|---|---|
| Owner (their own ID) | ✅ | Own profile / questionnaire replay (decrypt + merge back for edit); MCP `get_my_id_documents` (self-only, already correct) |
| Captain (any member) | ✅ | Member-detail page (in-app); MCP `people` tool (already decrypts — but cross-user MCP still honours the subject's `ai_data_consent` opt-in, per the existing schema comment) |
| Anyone else | ❌ | Encrypted at rest; never decrypted on their behalf |

The existing `users.ai_data_consent` opt-in is **unchanged**: it governs
surfacing a subject's ID to *other users' MCP/AI sessions*. In-app captain
access is governed by rank, per the directive above.

## Goals / non-goals

**Goals**
- No plaintext government ID number ever lands in `burner_profiles.responses`,
  `questionnaire_edits` (change-log), or any MCP response except the dedicated
  self/captain decrypt channels.
- Existing rows are scrubbed (backfilled into the encrypted columns + plaintext
  removed from `responses`).
- Owner and captains can still read/edit the ID through their existing surfaces.

**Non-goals (deferred / other sub-projects)**
- Server-side ID **format** validation (Luhn / passport pattern) — sub-project B.
- EFT / reimbursement bank details — already handled correctly via the encrypted
  column + MCP tools; out of scope here.
- DOB encryption — see decision below (kept in `responses`).

## Data model

**No schema change.** The target columns already exist
(`users.passport_encrypted`, `users.sa_id_encrypted`, both `text`, nullable).

- `id.number` (the sensitive value) — **moves out** of `responses`, encrypted
  into `users.passport_encrypted` or `users.sa_id_encrypted` depending on
  `id.type`. The *other* ID column is nulled (so switching document type moves
  the value rather than leaving a stale ciphertext).
- `id.type` (`passport` | `sa_id`) — **stays** in `responses`. It is not
  sensitive and the render/validation paths want it. (It is also derivable from
  which column is populated; keeping it explicit is simpler.)
- `birthday` (DOB) — **stays** in `responses` as ordinary profile data.
  **Decision:** DOB is not in `AGENTS.md`'s encrypted-PII class (passport / SA-ID
  / bank), is needed in cleartext for the "old enough to attend" check and
  birthday display, and was not part of the stated access directive. The stale
  note in `questionnaire.ts` that lumps DOB with passport will be corrected.
  *(Overridable — say so and we add a `dob_encrypted` column + the same
  owner/captain decrypt path.)*

## Affected surfaces

| Surface | File | Change |
|---|---|---|
| Onboarding save | `app/onboarding/questionnaire/actions.ts` | Extract `id.number` from responses → encrypt into the column for `id.type`, null the other; persist responses without `id.number`. |
| Replay save | `lib/forms.ts` (`BURNER_PROFILE.save`) | Same extract-encrypt-strip on the re-submit path. |
| Replay load | `lib/forms.ts` (`BURNER_PROFILE.load`) | Decrypt the column and **merge `id.number` back into responses** so the owner's replay form pre-fills. |
| Onboarding page prefill | `app/onboarding/questionnaire/page.tsx` | Reads via the load path; gets the merged value (owner only). |
| Change-log | `app/tools/forms/[key]/actions.ts` (`diffResponses` → `recordFormEdit`) | Exclude `id.number` from the diff so no plaintext enters `questionnaire_edits`. Optionally record a value-less "ID document updated" marker. |
| Captain member detail | `lib/member-detail.ts` | Decrypt the column and inject `id.number` into the per-question render (captain-only surface). |
| MCP `get_my_burner_profile` | `lib/mcp/tools/profile.ts` | Strip `id.number` from the returned `responses` (the dedicated `get_my_id_documents` is the ID channel). |
| MCP `update_my_burner_profile` | `lib/mcp/tools/profile.ts` | Strip `id.number` from incoming `responses` before persisting; if supplied, route it to the encrypted column (cannot re-introduce plaintext). |
| MCP `people` (captain) | `lib/mcp/tools/people.ts` | **No change** — already decrypts the columns; will now actually have data. |

A small shared helper (e.g. `lib/id-documents.ts`) will own
`extractAndEncryptId(responses) → { responses, passportEncrypted, saIdEncrypted }`
and `mergeDecryptedId(responses, userRow) → responses`, so every write/read path
uses one definition instead of duplicating the split logic.

## Crypto location + backfill

The encryption is **Node-side** (`crypto.ts`), so the backfill of existing rows
cannot be a drizzle SQL migration — it must run in Node.

**Decision:** move `encrypt` / `decrypt` / `decryptOrNull` from
`apps/web/lib/crypto.ts` into `@camp404/db` (`packages/db/src/crypto.ts`, exported
as `@camp404/db/crypto`) and re-point the four current import sites in `apps/web`
(`mcp/tools/profile.ts`, `people.ts`, `reimbursements.ts`, and the new write
paths). Rationale: the encrypted columns are a DB-domain concern, and this lets
the data-ops tool (`apps/admin-cli`, which already depends on `@camp404/db` and
uses the transactional pooled driver) own an **idempotent backfill command**:

- For each `burner_profiles` row with an `id.number` in `responses`: encrypt it
  into the matching `users` column (by `id.type`), then remove `id.number` from
  `responses`.
- Idempotent: skip rows whose `responses` no longer carry `id.number`. Safe to
  re-run. Runs under the pooled driver in a transaction.
- The operator runs it deliberately once against prod (it touches PII). Given the
  repo is Phase 0, this likely scrubs little/no live data, but it protects any
  seed/test rows and is the correct migration story.

*Alternative considered:* keep `crypto.ts` in `apps/web` and write the backfill as
an `apps/web` `tsx` script. Rejected — `admin-cli` is the documented home for data
ops, and sharing crypto via `@camp404/db` is cleaner for reuse (sub-project F also
operates on these columns).

## Error handling

- `encrypt`/`decrypt` already throw if `PGCRYPTO_KEY` is missing/short; the write
  paths surface that as a server error (it is a deploy-config failure, not user
  input). `decryptOrNull` swallows corrupt ciphertext → `null` (existing
  behaviour) so a bad row can't 500 a captain's roster view.
- If `id.number` is absent on a save (non-final / optional progress), the encrypt
  step is a no-op and the column is left unchanged.

## Testing (TDD)

Unit tests (vitest) written before the implementation:

1. `extractAndEncryptId`: given responses with `id.type=passport` + `id.number`,
   returns responses **without** `id.number` and a populated `passportEncrypted`;
   `sa_id` routes to `saIdEncrypted` and nulls the other.
2. Round-trip: `mergeDecryptedId(strip(...))` reproduces the original `id.number`
   for the owner.
3. Switching `id.type` moves the ciphertext and nulls the previous column.
4. `get_my_burner_profile` response contains **no** `id.number`.
5. `update_my_burner_profile` with `id.number` in the payload persists no
   plaintext in `responses`.
6. Change-log diff excludes `id.number` (no plaintext reaches `recordFormEdit`).
7. Backfill command is idempotent (second run is a no-op) and moves plaintext →
   encrypted column.

## Rollout

1. Land the code change (intake encrypts, reads decrypt for owner/captain, MCP
   hardened) + tests. New signups are clean from this point.
2. Deploy.
3. Run the `admin-cli` backfill once against prod to scrub any pre-existing rows.
4. Correct the stale PII note in `questionnaire.ts`.

Own PR against `claude/setup-camp-404-project-JbuIr`. CI gate
(`lint typecheck test build`) green before review.

## Open decisions for sign-off

1. **DOB stays plaintext in `responses`** (recommended) vs encrypt it too.
2. **Crypto moves to `@camp404/db`** + backfill as an `admin-cli` command
   (recommended) vs crypto stays in `apps/web` + backfill as an `apps/web` script.
