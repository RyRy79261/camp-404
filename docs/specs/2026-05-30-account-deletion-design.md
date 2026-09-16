# Sub-project F — Account deletion / "Lost Cat #N" (design + plan)

**Date:** 2026-05-30
**Status:** Proposed
**Program:** Camp 404 audit remediation, sub-project **F** — the last one. The documented POPIA right-to-erasure (`AGENTS.md`/`README`: "account deletion sanitises to a `Lost Cat #N` stub to preserve relational integrity"). Builds on A's encrypted columns (merged). No schema change — `sanitised`/`sanitisedAt`/`lost_cat_number` already exist, and audiences/rosters already filter `sanitised=false`.

## Approach — sanitise in place, don't hard-delete

A hard `DELETE` of the `users` row would break referral lineage and every audit/authorship FK. So erasure **anonymises the row in place** and removes the personal data hanging off it, keeping the row (and lineage) for relational integrity. Self-service (the data subject erases their own account); captain-initiated erasure is a deferred follow-up.

### The `sanitiseAccount(userId)` transaction (pooled driver, atomic)
1. **Next `lostCatNumber`** = `max(lost_cat_number) + 1` (computed in-tx).
2. **Anonymise the `users` row:** `displayName → "Lost Cat #N"`; null `profileImageUrl`, `passportEncrypted`, `saIdEncrypted`, `eftDetailsEncrypted`, `emergencyContacts`, `telegramHandle`, `telegramUserId`, `termsVersion`, `termsConsentedAt`; set `sanitised=true`, `sanitisedAt=now`, `lostCatNumber=N`; **sever `authUserId` → `deleted:<id>`** so the Neon Auth login no longer maps to this row (a re-login becomes a fresh, access-less user). Keep `id` + `inviteCode` (who invited them — lineage).
3. **Delete the personal owned rows** (CASCADE-owned `userId`, not auto-removed since the row is kept): `burner_profiles`, `dietary_requirements`, `driver_profiles`, `push_tokens`, `notification_deliveries`, `questionnaire_edits`, `required_actions`, `team_memberships`, `car_members`, `workshop_rsvps`, `broadcast_targets`, `questionnaire_activation_targets`.
4. **Scrub reimbursement bank PII:** `reimbursements.accountDetailsEncrypted` is `NOT NULL`, so set it to `''` for this user's rows (keeps the accounting record, removes the encrypted bank detail). The `userId` (`SET NULL` ref) stays pointing at the now-anonymised row.

**Kept for integrity:** the `users` row itself, `inviteCode`, the `invite_codes` they *created* (their referral subtree), and every `SET NULL` audit/authorship ref (broadcasts `senderId`, recipes `submitterId`, documents `authorId`, tasks, etc.) — all now resolve to "Lost Cat #N".

## Components
| File | Responsibility |
|---|---|
| `packages/db/src/account.ts` | NEW. Pure `lostCatName(n)` + `sanitisedUserPatch(userId, n, now)` (the `users` update object — unit-tested); `sanitiseAccount(userId)` pooled transaction (next number → patch → deletes → reimbursement scrub; `pool.end()` in finally). |
| `packages/db/package.json` | Add `"./account"` export. |
| `apps/web/lib/account.ts` | `server-only` facade: real → `sanitiseAccount`; E2E test mode → no-op stub (deletion isn't e2e-covered; no DB needed). |
| `apps/web/app/profile/delete/actions.ts` | NEW server action `deleteOwnAccount` — auth (`getAuthenticatedUserOrRedirect` + `ensureCampUser` + `hasCampAccess`), require an explicit confirmation field, call the facade, then `redirect("/auth/sign-out")`. |
| `apps/web/app/profile/edit/edit-form.tsx` (or a small `delete-account.tsx`) | A "Danger zone — delete my account" control behind a confirm checkbox, posting to the action. |
| tests | `lostCatName` + `sanitisedUserPatch` (pure: name format, nulls, severed auth, flags, number); facade test-mode no-op. |

## Decisions
- **Self-service only** (captain-initiated erasure deferred — note it). The data subject erasing their own account is the core POPIA right.
- **Sever `authUserId`** so the anonymised row can't be logged back into. The separate Neon Auth identity deletion is an operator action (out of this code's scope — noted).
- **Irreversible**, behind an explicit confirmation; the action signs the user out immediately.

## Safety / testing
- All multi-table work in one pooled transaction (`AGENTS.md`: atomic multi-statement work uses the pooled driver) with `pool.end()` in `finally`.
- Pure `sanitisedUserPatch`/`lostCatName` are unit-tested (the error-prone shape); the transaction is covered by typecheck + the pure tests + manual.
- Test mode: the facade no-ops so Playwright needs no DB.
- Idempotency: a second sanitise of an already-sanitised row is harmless (re-anonymises; `authUserId` already severed means it won't be reached via normal auth anyway).

## Deferred
- Captain-initiated erasure (camp-management action).
- Deleting the upstream Neon Auth identity (separate service / operator).
- A true hard-delete option (rejected — breaks lineage; the sanitise-stub is the documented design).
