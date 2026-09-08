# 22 — Directory, public profiles, field-level privacy

**Headline:** Take the donor's *pure* field-privacy law plus its three-state `decryptField`, and use them to close WP5 #129 — Camp 404 stores real safety data (`users.emergencyContacts`, `dietary_requirements.isAnaphylactic`/`allergies`) with **no web reader, no audience predicate, no audit row**, and a `decryptOrNull` that turns a key-rotation failure into a false all-clear.

**Camp 404 today:** It has a real, server-enforced two-shape roster fork (`PublicRosterRow` vs `RosterRow`, selected by `rosterForViewer`, `apps/web/lib/camp-roster.ts:21-56,263-271`) and an allowlist public projection (`presentPublicMember` → `bio.statement` + `ideas.this_year` only, `apps/web/lib/public-member.ts:12-13,35-41`). It has **nothing** below that: `packages/core/src/` holds 8 modules (access, family-tree, id-validation, invites, promotion, shake, text-redaction, text-utils) and zero hits repo-wide for `canBePublic|isAlwaysPrivate|HARD_LOCKED|privacyFlags`; `audit_log` (`packages/db/src/schema.ts:1180-1196`) has zero production consumers; `find apps -name loading.tsx` returns nothing.

**Do NOT port `/directory`.** The donor's `/directory` lists **camps, not people** — it deliberately has no browsable member list, because that is the bulk-exposure surface. Camp 404 already crossed that line (`/captains/camp-management` is open to every approved member — the gate is `hasCampAccess` + `isApproved`; `requireClearance(..., "captain")` only picks the projection, `page.tsx:24-51`). Nothing in §"directory" of the donor map applies.

## Take these

| # | Item | Verdict | Rec | Value | Effort | Donor path | Camp 404 destination | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | `decryptField` 3-state | PARTIAL | ADAPT | high | S | `packages/db/src/crypto.ts:95-113` | `packages/db/src/crypto.ts` | Only missing piece; rest of the file is byte-equivalent |
| 2 | `crypto-guard.ts` (`safeEncrypt`/`isCryptoConfigured`) | MISSING | COPY | high | S | `apps/web/lib/crypto-guard.ts` (19 lines) | `apps/web/lib/crypto-guard.ts` | Prereq for #8; today every `encrypt()` call site throws bare |
| 3 | `skeleton.tsx` kit (9 exports) | MISSING | COPY | high | S | `packages/ui/src/components/skeleton.tsx` (204 ln) | `packages/ui/src/components/skeleton.tsx` | Most literal drop-in in the donor; unblocks WP7 #131 |
| 4 | `privacy.ts` — the two never-public classes | MISSING | ADAPT | high | S | `packages/core/src/privacy.ts:39-127` | `packages/core/src/privacy.ts` (new) | Load-bearing boundary for everything else here |
| 5 | Safety-data access predicate | MISSING | ADAPT | high | S | `packages/core/src/medical-access.ts:90-142` | `packages/core/src/safety-access.ts` (new) | Camp 404 has the data and no rule for who reads it |
| 6 | `resolveMedicalNotesForViewer` shape | MISSING | ADAPT | high | M | `apps/web/lib/medical-access.ts:37-93` | `apps/web/lib/safety-data.ts` + `audit_log` | First writer for an already-built orphan table |
| 7 | Authorisation-as-a-parameter on the detail query | MISSING | INSPIRE | high | M | `apps/org/lib/queries.ts:1399-1447` | `packages/db/src/roster.ts`, `.../camp-management/actions.ts:192-206` | Today the full private row is fetched then narrowed in JS |
| 8 | `encryptOrPreserve` | PARTIAL | ADAPT | high | M | `apps/web/lib/bio-store.ts:338-363` | `apps/web/lib/users.ts`, `packages/db/src/id-documents.ts` | Unreadable ciphertext is currently nulled on the next unrelated save |
| 9 | `ErrorRecovery` frame variant + per-surface boundaries | PARTIAL | ADAPT | high | S | `apps/web/components/boundary/error-recovery.tsx`, `.../not-found-view.tsx` | `apps/web/app/error.tsx`, `not-found.tsx` + per-route | One boundary today ⇒ a captain-route query failure nukes the whole shell |
| 10 | `loading.tsx` discipline | MISSING | ADAPT | high | M | `apps/web/app/(app)/*/loading.tsx` | `apps/web/app/**/loading.tsx` | WP7 #131 headline; blocked on #3 |
| 11 | `PrivacyBadge` + `BioRow` on own profile | PARTIAL | ADAPT | medium | M | `apps/web/app/(app)/profile/page.tsx:41-98` | `apps/web/app/profile/page.tsx` | Makes the privacy model legible to its owner |
| 12 | `UNNAMED_BURNER` const + `initialsFrom` underscore split | PARTIAL | ADAPT | low | S | `packages/core/src/username.ts:32`, `bio.ts:395-407` | `packages/core/src/text-utils.ts:10-22` | "Unnamed burner" is repeated in 6 places today |

### 1 · Three-state decrypt (start here)
Camp 404's `packages/db/src/crypto.ts` is already the donor's file: `ALGO="aes-256-gcm"`, `IV_LEN=12`, `TAG_LEN=16`, `scryptSync(raw, KEY_SALT, 32)`, `base64(iv‖tag‖ciphertext)`, `PGCRYPTO_KEY` ≥16 chars. **Only `KEY_SALT` differs** (`"camp404-pgcrypto-v1"` vs `"quagga-pgcrypto-v1"`) and it must never change — it would invalidate every stored ciphertext. Add, do not replace:
```ts
export type DecryptedField =
  | { state: "empty";      value: null }
  | { state: "ok";         value: string }
  | { state: "unreadable"; value: null };
export function decryptField(stored: string | null | undefined): DecryptedField
```
`decryptOrNull` stays (5 modules call it: `lib/users.ts:424-425`, `mcp/tools/people.ts:140-142`, `mcp/tools/reimbursements.ts:95`, `mcp/tools/profile.ts:417-419`, `camp-management/actions.ts:152-153`). Migrate the *safety* readers only. The whole point: `null` currently means both "nothing stored" and "wrong key" — rendering "no allergies on file" from a config failure.

### 4 · The privacy law (pure, zero-import, ~90 lines)
Donor shape, verbatim in structure:
```ts
export const HARD_LOCKED_PRIVATE_FIELDS = [...] as const;  // no access path, ever
export const SAFETY_VISIBLE_FIELDS      = [...] as const;  // never public, defined audience
export const ALWAYS_PRIVATE_FIELDS = [...HARD_LOCKED, ...SAFETY_VISIBLE] as const;
isHardLockedPrivate / isSafetyVisibleField / isAlwaysPrivate / canBePublic
enforcePrivacyFlags(flags)  // force-writes false for every always-private key, last line before persistence
privacyViolations(flags)    // the illegal keys, for a loud boundary error
```
**Re-express the field set.** Camp 404's answers live in a generic `burner_profiles.responses` JSONB keyed by question id, so keys are question ids, not columns. HARD_LOCKED ≈ `id.number` (→ `users.passportEncrypted`/`saIdEncrypted`) and `eftDetailsEncrypted`. SAFETY_VISIBLE ≈ `users.emergencyContacts` (`schema.ts:279-282`) + `dietary_requirements.allergies` (`:405`) + `isAnaphylactic` (`:408`) — three keys where the donor had one (`medical`). Take the derivation trick from the registry too: `].map(f => ({ ...f, locked: ALWAYS_PRIVATE.has(f.key) || f.locked }))` so law and registry cannot drift. Derive the registry from `apps/web/lib/questionnaire.ts` (`QUESTIONNAIRE_VERSION = "2026.06.04-v9"`, 11 pages), never a hand-written list — a literal list drifts on every version bump.

### 5 + 6 · Who may read safety data, and the audit row
The donor's predicate de-orgs cleanly: drop `actorOrgRole`/`actorOrgPersonalInformation` (they exist only for the org/participant split — and `actorOrgPersonalInformation` is optional, so a Camp 404 caller that never passes it closes that branch by itself). Keep `isSelf` and the set intersection. Camp 404 context: `{ isSelf, isCaptain, actorLeadTeamKeys, subjectTeamKeys }`; basis becomes `"self" | "captain" | "team_lead"`. `isTeamLead` already exists (`packages/db/src/roster.ts:208`). Fail-closed, pure, no I/O — a natural 9th `packages/core` module, and the donor ships a 205-line test suite for it.

The resolver is the transferable design: **authorise first** (`if (!canView(ctx)) return { visible:false, notes:null, unreadable:false }`), **only then** select + decrypt, report `unreadable` as its own field, and write the audit row inside `after()` with the insert in a `try/catch` that only `console.error`s — deliberately fail-open, because nobody should wait on a log row to learn someone is anaphylactic. Skip the audit for self-reads and for empty fields (`if (!isSelf && notes)`). Camp 404's `audit_log` columns (`actorId`, `action` text, `target` text, `metadata` jsonb, indexed on actor + action) match the donor's usage exactly — and Camp 404 already ships the house pattern for the sibling table: `appendMcpAuditLog` in `packages/db/src/mcp.ts:68` ("Best-effort — never throws into the caller"). Reuse that shape rather than inventing one; it puts this below M. **Drop** the donor's ~140-line `buildMedicalAccessContext` (org-role/department resolution, no analogue). **Also drop** `apps/org/lib/medical-audit.ts` — see skip list.

### 7 + 8 · Make the SELECT the boundary; never null over ciphertext you couldn't read
`getPublicMemberProfileAction` (`camp-management/actions.ts:192-206`) calls `getCampMemberDetail(userId)` — the **full** row including `passportEncrypted`/`saIdEncrypted` — then narrows via `presentPublicMember`. The whole private record reaches server render scope on a *member's* request; the JS projection is the only thing between it and the wire. Donor fix: `getRosterMemberDetail(..., options: { includeMedicalNotes: boolean })` with a conditional select spread `...(options.includeMedicalNotes ? { medicalNotes: schema.burnerBios.medicalNotes } : {})` plus a separate `medicalNotesUnreadable: decrypted?.state === "unreadable"` return field. The caller must authorise *before* the fetch; on a refusal the column is never selected, never in the row, never in the RSC payload. Apply to `emergencyContacts` and the encrypted ID columns in `packages/db/src/roster.ts`.

`encryptOrPreserve(incoming, stored)` = `safeEncrypt(incoming) ?? (decryptField(stored).state === "unreadable" ? stored : null)`. Camp 404 already does the sibling structural thing (`idColumnsFor` in `packages/db/src/id-documents.ts:42-51` moves the value rather than orphaning ciphertext when the doc type switches) but has no preservation: today an unreadable ciphertext is reported absent and overwritten with null on the next save. Apply the same unreadable-preservation to the *other* ID column on a type switch. **Skip** the donor's request-time refuse-with-no-key throw — Camp 404 already fails at boot (`apps/web/lib/env.ts:20-26` + `instrumentation.ts:15-21`), which is better.

## Already covered in Camp 404
- Two-shape roster fork, server-enforced, discriminated-union, unit-tested — `apps/web/lib/camp-roster.ts:21-56,263-271`, `apps/web/lib/__tests__/camp-roster-public.test.ts`.
- Allowlist-not-denylist public projection, with the donor's own law already in its doc comment — `apps/web/lib/public-member.ts:30-41`.
- Neutral fallback (`"Unnamed burner"`, `member-detail.ts:181`, `camp-roster.ts:124`) and the deletion tombstone (`lostCatName` → `"Lost Cat #N"`, `packages/db/src/account.ts:11-13`). **Keep "Lost Cat", do not import "Departed Burner"** — two tombstone vocabularies is worse than either.
- The erasure plan itself: `sanitisedUserPatch` (`account.ts:21-42`) + `sanitiseAccount` (`:55-127`, 12 tables in one transaction). Only the *prover* (`uncoveredHardLockedFields`) is missing, and it only becomes expressible after #4.
- AES-256-GCM at rest — identical to the donor bar the salt.
- The bio flow: Camp 404's builder engine (14 question kinds, `visibleIf` with 10 ops, immutable versions) is strictly more capable than the donor's `BioFlow`; the donor's own docs say its questionnaire tables were ported *from* Camp 404.
- `slugify` (`packages/core/src/text-utils.ts:29-38`) is already the donor's `normalizeName` modulo `-` vs `""`.

## Deliberately skip
- **`/directory`** — a camp taxonomy for many camps. Camp 404 is one camp.
- **`camp-categories.ts`** — superseded by the 8-value `teamEnum` + the shipped relabel/archive editor (`packages/db/src/camp-config.ts`).
- **`medical-audit.ts` (the reader)** — built on an 8-domain org permission vocabulary. Camp 404 has two stored ranks and one camp; there is no caller who may read the trail but must be refused the medical subset. *But note the donor's warning: the audit write is fail-open with no rate limit, so the reader is what pays for that trade. At 30–80 people, `select * from audit_log` in a psql session is the reader.*
- **`profile_keys` / signing-key fingerprint** — used for nothing in the donor either.
- **`BioFlow`, `burns-step.tsx`, `attended-years` vocabulary** — re-importing a weaker fork of Camp 404's own engine; `AGENTS.md:108-129` rules the builder is the one sanctioned dynamic engine.
- **`name-dedupe.ts` trigram half** — exists to dedupe camp names; Camp 404 creates no named entities needing it.
- **`member-ref-code.ts`** — good fit in principle for EFT reconciliation (WP10 #134), but out of scope until a dues write path exists; `users.duesPaid` is read by nothing that writes it.
- **The donor's `Field` as the canonical wrapper** — Camp 404's `input-field.tsx:48` puts `role="alert"` on the error paragraph and the donor's `field.tsx` does not. Add `trailing?: React.ReactNode` to the existing label row instead.
- **Porting the donor `Switch` over Camp 404's** — Camp 404's is Radix and already used/tested. Add `variant`/`hardLocked` props (`isOn = hardLocked ? false : checked`) or ship a distinct `PrivacySwitch`.

## DB changes this unit implies
- `users.privacy_flags jsonb not null default '{}'` (or on `burner_profiles`) — the per-user flag map. Needs a single dedicated writer (donor: `savePrivacyFlags`), separate from the questionnaire save path, or `resolvePrivacyFlagsUpdate`'s "omitted map ⇒ empty patch" rule has nowhere to send a deliberate change.
- No new table for audit — `audit_log` (`schema.ts:1180-1196`) already exists and is unused. First actions: `safety.emergency_contacts.view`, `safety.allergies.view`; `metadata = { basis }`.
- If handles get real rules: either a `users.username` column or a `uniqueIndex on lower(telegram_handle)`. **The index is not free** — `telegramHandle` (`schema.ts:316`) has no constraint today and is denormalised from a free-text questionnaire answer, so it needs a dedupe/backfill migration first.
- Nothing else. No editions, no `burner_bios`, no `profile_keys`.

## Quick wins (effort S)
1. Copy `packages/db/src/crypto.ts:95-113` (`DecryptedField` + `decryptField`) into Camp 404's `packages/db/src/crypto.ts`, appended below `decryptOrNull`. Change nothing else in the file — especially not `KEY_SALT`. Test: an ok round-trip, an empty input, and a ciphertext encrypted under a different key ⇒ `unreadable`.
2. Copy `apps/web/lib/crypto-guard.ts` (19 lines) verbatim, retargeting the import to `@camp404/db/crypto`. Test: `safeEncrypt(null)` and `safeEncrypt("x")` with `PGCRYPTO_KEY` unset both return `null` rather than throwing.
3. Copy `packages/ui/src/components/skeleton.tsx` → `packages/ui/src/components/skeleton.tsx`. `cn` is byte-identical across both repos and every class (`bg-muted`, `border-border`, `bg-card/40`, `rounded-xl`) resolves against Camp 404's `@theme`. Add a `.stories.tsx` (house convention, 76 components deep) and run `pnpm format` — donor files are semicoloned. Test: `SkeletonRegion` renders `aria-busy` + `aria-live="polite"` + `data-loading="true"` once, bars `aria-hidden`.
4. Copy `packages/core/src/privacy.ts` → `packages/core/src/privacy.ts`, replace the field arrays with Camp 404 question ids, export from `packages/core/src/index.ts`. Port `packages/core/src/__tests__/privacy.test.ts` (108 lines) with it.
5. Add `UNNAMED_BURNER = "Unnamed burner"` to `packages/core/src/text-utils.ts` and replace the 6 repeated literals (`member-detail.ts:181`, `camp-roster.ts:124`, 3 test files). Same file: add `_` to `initialsFrom`'s split (`/[\s@._]+/`) so `dusty_prototype` → `DP` not `DU`.
6. Extract `apps/web/app/error.tsx`'s body into a shared `ErrorRecovery({ frame: "standalone" | "inline", title, description, error, reset })`; same for `not-found.tsx` → `NotFoundView`. Keep every Camp 404 detail (`IconBadge`, focused `tabIndex={-1}` heading, digest through `CodeDisplay`) — take only the shape. Then add `apps/web/app/captains/camp-management/error.tsx` with `frame="inline"` and surface copy that also says nothing was changed.

## Corrections applied
- **`name-dedupe.ts` — REFUTED.** `normalizeName` is *not* missing: `slugify` (`packages/core/src/text-utils.ts:29-38`) already does NFKD → strip marks → lowercase → collapse non-alphanumerics, differing only in emitting `-` instead of `""`. Verdict is PARTIAL, not MISSING; adding the donor function verbatim would put a second near-identical normaliser in the same file's neighbourhood. Recommendation downgraded to "reuse `slugify` or add a two-line variant beside it".
- **Skeleton kit is 9 exports, not 8** — `Skeleton`, `SkeletonRegion`, `SkeletonText`, `SkeletonHeading`, `SkeletonCard`, `SkeletonRow`, `SkeletonCardGrid`, `SkeletonField`, `SkeletonForm` (verified: 9 `export function` lines in a 204-line file).
- **`resolvePrivacyFlagsUpdate` is hard-blocked, not merely sequenced.** It calls `initialPrivacyFlags` → `defaultPrivacyFlags` → iterates the registry. Rec is ADAPT, not COPY, and it cannot land before #4. Its 14 lines of body (not "~30") only pay off alongside a dedicated `savePrivacyFlags` writer.
- **`ErrorRecovery`'s frame values are `"standalone" | "inline"`**, not `"page" | "inline"`. The same variant lives on `NotFoundView` (`boundary/not-found-view.tsx:18-20`) and Camp 404 has exactly one `not-found.tsx` too — the architectural fix applies to both.
- **Switch labels are title case in source** (`"On · Public"`, `"Off · Private"`, `"Always private"`); the caps appearance comes from a `uppercase` utility class.
- **`PrivacyToggles` does not depend on the Switch item** — it hand-rolls its own `<button role="switch">` and imports only lucide icons, `cn` and the field type. Its only blocker is #4. One of its sub-lines ("Only you and camps you join can see this.") is multi-tenant copy and must be rewritten.
- **`word-count.ts`: the 150-word soft cap is not in it.** `ABOUT_SOFT_WORD_CAP = 150` lives in `bio.ts:92`; the module's only exported constant is `CAMP_DESCRIPTION_WORD_LIMIT = 60`, which is also the *default parameter* of `isWithinWordLimit`/`wordsRemaining` — copying it unchanged silently gives every Camp 404 caller a 60-word default.
- **`bio-ciphertext-preservation.test.ts` is not mocked** — it runs the real save against a real DB and says so in its header. The claim that Camp 404's PGlite harness beats "the donor's mocked drizzle" mis-describes the donor; the recommendation (take the case list, run it on `packages/db/src/__tests__/_harness.ts`) survives and is strengthened.
- **The source-level `indexOf` ordering test targets the caller, not the query module** — the donor asserts over `registrations/[id]/members/[userId]/page.tsx`, so Camp 404's equivalent target is `apps/web/app/captains/camp-management/actions.ts`, not `packages/db/src/roster.ts`.
- Line-number fixes carried through: `getPublicMemberProfileAction` is `actions.ts:192-206`; the neutral fallback is `member-detail.ts:181`; `dietary_requirements` is `schema.ts:400-419` (allergies `:405`, `isAnaphylactic` `:408`) — the digest's `schema.ts:388-395` lands inside `burner_profiles`; `sanitisedUserPatch` is `account.ts:21-42`; `BIO_PRIVACY_FIELDS` is `bio.ts:168-278`; the "bespoke over generic" rule is `AGENTS.md:108-129`.

## Confidence notes
- **Spot-checked directly and confirmed:** absence of a privacy module and of `canBePublic|isAlwaysPrivate|HARD_LOCKED|privacyFlags` anywhere in Camp 404; absence of any skeleton component (76 UI components, `spinner.tsx` only); zero `loading.tsx`; exactly one `error.tsx` and one `not-found.tsx`; `crypto-guard`/`safeEncrypt` absent; `auditLog` referenced only by its own schema definition; `emergencyContacts` read/written only through MCP + nulled by the sanitiser; `getPublicMemberProfileAction` fetching the full detail then narrowing; `crypto.ts` identical to the donor's bar `KEY_SALT`; the donor's `privacy.ts`, `medical-access.ts`, `crypto-guard.ts`, `encryptOrPreserve` and `resolveMedicalNotesForViewer` sources.
- **Not individually verified by the adversarial pass** (treat as lower confidence, though the Camp 404 half of each was checked here): the `publicBioView` gate details, `checkUsernameAvailabilityAction`, `getPublicBurnerProfile`'s exact select list, `id-retention.ts`, and the `/burners/[id]` route specifics.
- **Untested assumption:** `after()` from `next/server` is assumed to behave the same in Camp 404's Next 16 setup. Confirm before relying on fail-open auditing.
- **Porting friction to expect:** `apps/web/vitest.config.ts` has no `server-only` alias stub (the donor's do), so any ported server module throws on import from a vitest test; `next.config.ts` sets `typedRoutes: true`, so donor `<Link href="/directory">`/`"/burners/…"` strings fail typecheck; `@camp404/db` exports 24 domain entry points, so a ported query module needs its own `exports` entry.
- The whole donor subsystem is keyed on `(userId, editionId)`. Camp 404 has no editions — every signature loses a parameter. Mechanical, but pervasive.
