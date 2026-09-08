# Unit 12 — PII encryption, privacy toggles, retention, and deletion

**Donor:** quagga-portal / AfrikaBurn Contributors App
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Target:** Camp 404 `/home/ryan/repos/Personal/camp-404`
**Harvest date:** 2026-09-08. All `path:line` citations are donor-relative unless prefixed `camp-404/`.

---

## 0. Purpose and headline finding

This subsystem is the donor's answer to POPIA: *what is encrypted, who may read it, how long we keep it, and what "delete my account" actually does to the database.* It spans five concerns that the donor deliberately keeps separate:

1. **Encryption at rest** — AES-256-GCM under one `PGCRYPTO_KEY`, applied to SA ID / passport / medical notes (`packages/db/src/crypto.ts`).
2. **Privacy classes** — a two-tier, pure, server-enforced field taxonomy (`packages/core/src/privacy.ts`) plus the per-field public/private toggle UI it drives (`apps/web/components/privacy-toggles.tsx`, `packages/ui/src/components/switch.tsx` `variant="privacy"`).
3. **Read authorisation for safety data** — `canViewMedicalNotes` (`packages/core/src/medical-access.ts`) plus the audited resolver (`apps/web/lib/medical-access.ts`) and its **reader** (`apps/org/lib/medical-audit.ts`).
4. **Bounded retention** — the POPIA storage-limitation rule for gate-verification ID data (`packages/core/src/id-retention.ts`). **Pure rule only; NO production caller exists.**
5. **Deletion** — a 14-day grace state machine + guards (`packages/core/src/account-security.ts`), a pure sanitization *plan* (`packages/core/src/account-sanitization.ts`), the transactional *runner* (`apps/web/lib/account-sanitize.ts`), the sign-in cancellation (`packages/db/src/deletion.ts`), and a secret-gated cron route (`apps/web/app/api/account/deletion-sweep/route.ts`).

### The headline for Camp 404

**`packages/db/src/crypto.ts` is Camp 404's own file, re-exported with two additions.** Verified by direct comparison:

| | Donor `packages/db/src/crypto.ts` (113 lines) | Camp 404 `packages/db/src/crypto.ts` (79 lines) |
|---|---|---|
| Algorithm | `aes-256-gcm` | `aes-256-gcm` (identical) |
| `IV_LEN` / `TAG_LEN` | `12` / `16` | `12` / `16` (identical) |
| `KEY_SALT` | `"quagga-pgcrypto-v1"` | `"camp404-pgcrypto-v1"` |
| Key derivation | `scryptSync(raw, KEY_SALT, 32)`, module-cached | identical |
| Key guard | `!raw \|\| raw.length < 16` → throw naming `PGCRYPTO_KEY` | identical, same message |
| Stored format | `base64(iv ‖ tag ‖ ciphertext)` | identical |
| `encrypt` / `decrypt` / `decryptOrNull` | present | present (byte-equivalent bodies) |
| **`DecryptedField` + `decryptField`** | **present (crypto.ts:81–113)** | **ABSENT** |

So the port is not "adopt a crypto library"; it is "**adopt three additions to a file you already have**": the tri-state `DecryptedField`, the retention rule, and the deletion/sanitization plan-and-runner split. Everything else here is new surface for Camp 404 (privacy toggles, medical access class, grace-period deletion), and every one of those is auth-provider-agnostic.

---

## 1. File inventory (line counts verified with `wc -l`)

### 1.1 `packages/db` — storage-layer primitives

| Path | Lines | Role |
|---|---|---|
| `packages/db/src/crypto.ts` | 113 | AES-256-GCM helpers + `DecryptedField` tri-state |
| `packages/db/src/deletion.ts` | 204 | `cancelPendingDeletion` — the "just sign in" promise |
| `packages/db/src/schema.ts` (relevant blocks) | 2045 total | `burner_bios` :604–695, `profile_keys` :700–711, `users` :283–318, `audit_events` :1708–1738, `account_deletion_requests` :1910–1948, `email_change_requests` :1970–2020, `security_events` :2026–2045, `security_event_kind` enum :212–222 |
| `packages/db/src/__tests__/crypto.test.ts` | 134 (12 cases) | The `decryptField` contract |
| `packages/db/src/__tests__/deletion.test.ts` | 414 (19 cases) | Sign-in cancellation, incl. the uuid-vs-text id-space bug |
| `packages/db/src/__tests__/schema-invariants.test.ts` | 191 (8 cases) | `*_encrypted` column invariants |
| `packages/db/package.json` | — | exports are only `"."`, `"./schema"`, `"./crypto"` (:8–12) |

### 1.2 `packages/core` — the pure rules (no I/O, no env, no DB, no crypto)

| Path | Lines | Role |
|---|---|---|
| `packages/core/src/privacy.ts` | 127 | The two privacy classes + `enforcePrivacyFlags` / `privacyViolations` |
| `packages/core/src/medical-access.ts` | 142 | `canViewMedicalNotes`, `medicalAccessBasis`, `MEDICAL_VIEW_AUDIT_ACTION` |
| `packages/core/src/id-retention.ts` | 121 | `identifyPurgeableIdBios`, `buildIdPurgePatch`, `ID_RETENTION_GRACE_DAYS = 30` |
| `packages/core/src/account-sanitization.ts` | 351 | The "Lost Cat" plan: patches, preserved/purged/identity table lists, tombstone guard |
| `packages/core/src/account-security.ts` | 546 | Password policy, enumeration-safe copy, 14-day deletion state machine, deletion guards, 48h email-change machine |
| `packages/core/src/report-sanitize.ts` | 277 | Free-text redaction before a **public** GitHub issue |
| `packages/core/src/bio.ts` (privacy section) | 732 total | `BioPrivacyField` :131–142, `MEDICAL_AUDIENCE_NOTE` :156, `BIO_PRIVACY_FIELDS` :168–267, `defaultPrivacyFlags` :269–276, `initialPrivacyFlags` :291–300, `resolvePrivacyFlagsUpdate` :313–319, `publicBioView` :357–392 |
| `packages/core/src/security-notifications.ts` | — | `maskEmail` :161, `deletionRequestedEmail` :274, `deletionCancelledEmail` :289, `deletionCompletedEmail` :301, `deletionCancelledNotification` :120 |
| `packages/core/src/username.ts` | — | `UNNAMED_BURNER` :32, `publicMemberName` :250 (the tombstone-aware render fallback) |
| `packages/core/vitest.config.ts` | — | The **100% per-file coverage ratchet** on `privacy.ts`, `medical-access.ts`, `id-retention.ts`, `report-sanitize.ts`, `report-screen.ts`, `entitlements.ts` |

Core tests: `privacy.test.ts` 108 lines / 7 cases · `medical-access.test.ts` 205 / 15 · `id-retention.test.ts` 169 / 13 · `account-sanitization.test.ts` 254 / 20 · `account-security.test.ts` 538 / 45 · `report-sanitize.test.ts` 191 / 23.

### 1.3 `apps/web` — the participant app's application layer

| Path | Lines | Role |
|---|---|---|
| `apps/web/lib/crypto-guard.ts` | 19 | `isCryptoConfigured`, `safeEncrypt`, re-export of `decryptOrNull` / `decryptField` |
| `apps/web/lib/keys.ts` | 60 | ECDSA P-256 keypair gen + `fingerprintPublicKey` |
| `apps/web/lib/medical-access.ts` | 237 | `resolveMedicalNotesForViewer` — authorise → decrypt → audit via `after()` |
| `apps/web/lib/account-sanitize.ts` | 465 | `sanitizeAccount`, `sweepDueDeletions` — the only place app rows are erased |
| `apps/web/lib/account.ts` | 397 | `buildDeletionGuardContext` :142, `buildDeletionView` :309, `getDeletionRequest` :101 |
| `apps/web/lib/account-actions.ts` | 1054 | `requestAccountDeletion` :869, `cancelAccountDeletion` :1002 |
| `apps/web/lib/bio-store.ts` | ~640 | The encrypt-or-preserve write boundary (:288–366), `ensureProfileKeypair` (:493) |
| `apps/web/components/privacy-toggles.tsx` | 86 | The per-field public/private list control |
| `apps/web/app/(app)/account/delete/page.tsx` | 240 | The deletion consequences screen |
| `apps/web/app/(app)/account/delete/blocked-projects.ts` | 38 | Resolves blocked group ids → names/slugs for the transfer CTA |
| `apps/web/app/(app)/profile/actions.ts` | 55 | `updateBioAction`, `savePrivacyFlagsAction` |
| `apps/web/app/(app)/onboarding/actions.ts` | — | `saveOnboardingBioAction` (:14) |
| `apps/web/app/api/account/deletion-sweep/route.ts` | 149 | Cron/operator-triggered sweeper, secret-gated, fails closed |
| `apps/web/vercel.json` | 8 | The one cron: `/api/account/deletion-sweep` at `0 3 * * *` |
| `apps/web/vitest.config.ts` | — | Per-file 98/98/100/94 ratchets on `lib/medical-access.ts` and `lib/account-sanitize.ts`; `server-only` alias stub |

Web tests: `account-sanitize-runner.test.ts` 517 / 17 · `medical-access-resolver.test.ts` 308 / 11 · `bio-ciphertext-preservation.test.ts` 155 / 2 · `deletion-guards.test.ts` 194 / 13 · `account-deletion-context.test.ts` 323 / 19 · `lib-primitives.test.ts` (crypto-guard section :110–162).

### 1.4 `apps/org` — the console side (org-coupled; concept-only for Camp 404)

| Path | Lines | Role |
|---|---|---|
| `apps/org/lib/queries.ts` (:1346–1445) | 2100+ | `getRosterMemberDetail` — authorise-before-select, `decryptField` |
| `apps/org/lib/medical-audit.ts` | 239 | `canReadMedicalAccessLog`, `getMedicalAccessLog`, `getAuditTrail` — the reader half of the audit trail |
| `apps/org/lib/system-status.ts` (:394–425) | — | `encryptionCheck` — probes `PGCRYPTO_KEY` presence + length, never prints it |
| `apps/org/app/(console)/registrations/[id]/members/[userId]/page.tsx` (:154–205) | — | The medical-notes card incl. the **unreadable** `role="alert"` branch |
| `apps/org/lib/__tests__/roster-privacy.test.ts` | 120 / 6 | **Source-text** regression test that no roster carries medical |
| `apps/org/lib/__tests__/medical-audit-surface.test.ts` | 361 / 24 | Audit-log authorisation |

### 1.5 `packages/ui`

| Path | Role |
|---|---|
| `packages/ui/src/components/switch.tsx` | `variant="privacy"` + `hardLocked` — ON · PUBLIC / OFF · PRIVATE / ALWAYS PRIVATE (with `Lock`) |
| `packages/ui/src/components/field.tsx` | `privacyToggle?: React.ReactNode` label-row slot (:26–27, :60) |

### 1.6 E2E

`e2e/specs/new-burner/privacy-projection.spec.ts` (123) · `e2e/specs/anon/burner-profile-privacy.spec.ts` (166) · `e2e/specs/org-staff/medical-notes-access.spec.ts` (143) · `e2e/specs/god/god-sole-god-cannot-self-delete.spec.ts` · `e2e/personas/registry.ts:346–357` mirrors `HARD_LOCKED_PRIVATE_FIELDS`.

---

## 2. Capability list (exhaustive, each cited)

### Encryption at rest
- **C1.** AES-256-GCM symmetric encryption keyed by a single env var `PGCRYPTO_KEY`, scrypt-derived to 32 bytes with a *static* salt `"quagga-pgcrypto-v1"`, key cached in module state (`packages/db/src/crypto.ts:22–39`).
- **C2.** Stored format `base64(iv ‖ tag ‖ ciphertext)`, `iv = 12`, `tag = 16` — chosen so ciphertext fits an existing `text` column with **no migration** (`crypto.ts:17–18`, `schema.ts:596–599`).
- **C3.** Fresh IV per call, so two encryptions of the same plaintext differ (`crypto.test.ts:36–42`).
- **C4.** Explicit short-buffer rejection: `buf.length < IV_LEN + TAG_LEN + 1` → `"Ciphertext is too short to be valid."` (`crypto.ts:52–54`).
- **C5.** Key guard: missing or `< 16` chars throws a message *naming the env var* (`crypto.ts:30–36`). 15 chars is refused, 16 is accepted (`crypto.test.ts:127–133`).
- **C6.** `decryptOrNull(stored)` — the two-state collapse, correct for ID documents (`crypto.ts:76–84`).
- **C7. `decryptField(stored) → DecryptedField`** — the three-state read: `{state:"empty"}` / `{state:"ok", value}` / `{state:"unreadable", value:null}` (`crypto.ts:96–113`). This is the single most valuable delta versus Camp 404.
- **C8.** The unreadable branch **never logs the ciphertext** — asserted by a spy over `console.log|warn|error` (`crypto.ts:107`, `crypto.test.ts:96–105`).
- **C9.** `isCryptoConfigured()` / `safeEncrypt(plaintext)` — encrypt only when keyed, else return `null` so the caller drops rather than persists (`apps/web/lib/crypto-guard.ts:7–17`).
- **C10. Refuse, don't drop.** A bio save that *carries* medical notes or an ID number while `PGCRYPTO_KEY` is unset **throws with an operator-actionable message**, rather than silently discarding under a "Saved" toast (`apps/web/lib/bio-store.ts:288–306`).
- **C11. Never destroy ciphertext you merely could not read.** `encryptOrPreserve(incoming, stored)` keeps `unreadable` stored ciphertext when the incoming value is empty — because an empty form field carries no delete intent if the form never showed the old value (`bio-store.ts:308–366`).
- **C12.** Switching ID document type moves the value and nulls the other column, but still preserves an *unreadable* sibling ciphertext (`bio-store.ts:348–363`).
- **C13.** Schema invariant test: the set of `*_encrypted` columns is pinned to exactly `["sa_id_encrypted","passport_encrypted"]`; each must be `PgText` and **nullable**; and none may have a plaintext sibling column (`packages/db/src/__tests__/schema-invariants.test.ts:47–89`).
- **C14.** Server-side ECDSA P-256 keypair, raw public key + PKCS#8 private key base64 (`apps/web/lib/keys.ts:29–43`), and a human-comparable SHA-256 fingerprint truncated to 8 colon-separated hex pairs, e.g. `a1:b2:c3:d4:e5:f6:07:18` (`keys.ts:51–59`).
- **C15. Fail closed with no key**: `ensureProfileKeypair` mints **nothing** rather than writing a plaintext private key into a column named `encrypted_private_key` (`bio-store.ts:469–516`).
- **C16.** Operator-facing probe: `encryptionCheck` reports `"Not set"` / `"Set but too short"` (naming the actual length) / OK, and **never prints the key** (`apps/org/lib/system-status.ts:394–425`).

### Privacy classes and per-field toggles
- **C17.** `HARD_LOCKED_PRIVATE_FIELDS` — 7 members, no access path of any kind (`packages/core/src/privacy.ts:39–47`).
- **C18.** `SAFETY_VISIBLE_FIELDS` — exactly `["medical"]`: never public, but visible to a disclosed audience (`privacy.ts:57`).
- **C19.** `ALWAYS_PRIVATE_FIELDS` — the 8-member union, spread-derived so the two classes can never drift from the union (`privacy.ts:67–70`).
- **C20.** `isHardLockedPrivate` / `isSafetyVisibleField` / `isAlwaysPrivate` / `canBePublic` — O(1) `ReadonlySet` predicates (`privacy.ts:74–99`).
- **C21.** `enforcePrivacyFlags(flags)` — the last line before persistence; forces every always-private field to `false` regardless of input (`privacy.ts:108–116`).
- **C22.** `privacyViolations(flags)` — returns the fields a caller *illegally tried* to set public, for a loud error at the boundary before silent correction (`privacy.ts:123–127`).
- **C23.** `BIO_PRIVACY_FIELDS` — a 19-entry ordered registry (`key`, `label`, `locked`, `defaultPublic`, `lockReason?`) whose `locked` flag is **derived** from `ALWAYS_PRIVATE_FIELDS` via `.map((f) => ({...f, locked: ALWAYS_PRIVATE.has(f.key) || f.locked}))` (`packages/core/src/bio.ts:168–267`).
- **C24.** `MEDICAL_AUDIENCE_NOTE` — the single-sourced consent sentence, reused in the field label, the profile editor, the privacy review, and the questionnaire definition (`bio.ts:156–157`).
- **C25.** `defaultPrivacyFlags()` — non-locked fields take their `defaultPublic`; locked fields forced `false` (`bio.ts:269–276`).
- **C26.** `initialPrivacyFlags(raw?)` — INSERT path only: defaults ⊕ caller flags → `enforcePrivacyFlags` (`bio.ts:291–300`).
- **C27.** `resolvePrivacyFlagsUpdate(raw)` — **returns `{}` when the caller omits flags**, so a plain bio-text save cannot silently reset a user's deliberate private choices back to defaults (`bio.ts:313–319`; regression asserted at `packages/core/src/__tests__/bio.test.ts:84–98`).
- **C28.** `publicBioView(fields, privacyFlags, extras)` — a field appears only when `canBePublic(key) && privacyFlags[key] === true`. The `canBePublic` half is the last line of defence against a corrupted flag map. Takes the FULL bio so a caller cannot bypass the gate by pre-selecting (`bio.ts:357–392`).
- **C29.** The three ranger booleans share one privacy key `"ranger"` (`bio.ts:373`).
- **C30.** The **username is deliberately excluded** from the privacy registry — a globally unique handle cannot honestly be "private" because the availability check alone reveals it (`bio.ts:163–166`).
- **C31.** `PrivacyToggles` list UI — locked rows render disabled with a `Lock` glyph, a `lockReason` line, and a "Locked private" pill; unlocked rows render a `role="switch"` pill with `Eye`/`EyeOff` and an aria-label `"${label}: public|private"` (`apps/web/components/privacy-toggles.tsx:22–84`).
- **C32.** `Switch variant="privacy"` — caps status label `On · Public` / `Off · Private` / `Always private` (with `Lock`), `hardLocked` forces `isOn = false` and `disabled` (`packages/ui/src/components/switch.tsx:83–104`, `:52–58`).
- **C33.** `Field.privacyToggle` — a right-aligned label-row slot so a privacy switch can sit inline with any control (`packages/ui/src/components/field.tsx:26–27, :60`).
- **C34.** Two Zod boundaries: `z.record(z.string(), z.boolean())` for the dedicated privacy save, `.nullable()` for the bio save where `null` means "don't touch stored flags" (`apps/web/app/(app)/profile/actions.ts:10–12, :29–34`).

### Medical (safety-visible) access
- **C35.** `MedicalAccessContext` — the five facts a decision needs: `isSelf`, `actorOrgRole`, `actorOrgPersonalInformation?`, `actorLeadCampIds`, `subjectCampIds` (`packages/core/src/medical-access.ts:90–96`).
- **C36.** `canViewMedicalNotes(ctx)` — fail-closed: self → yes; org safety tier → yes; otherwise the lead-camp and subject-camp id sets must **intersect** (`medical-access.ts:114–122`).
- **C37.** `medicalAccessBasis(ctx) → "self" | "org_staff" | "camp_lead" | null` — recorded on the audit row so the trail says *why* access was allowed (`medical-access.ts:126–135`).
- **C38.** `MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view"` (`medical-access.ts:142`).
- **C39.** `isOrgStaffRole(role)` — `god | org_staff`; **`engineer` is deliberately absent** (`medical-access.ts:56–66`).
- **C40.** `resolveMedicalNotesForViewer({viewerUserId, subjectUserId, editionId}) → {visible, notes, unreadable}` — authorise first, decrypt second, audit third off the critical path via `next/server` `after()` (`apps/web/lib/medical-access.ts:37–96`).
- **C41.** Audit only an actual disclosure of *someone else's non-empty* notes: `if (!isSelf && notes)` (`apps/web/lib/medical-access.ts:79`).
- **C42.** The audit write **fails open** and is swallowed with a `console.error` — nobody waits on a log row to learn someone is diabetic (`apps/web/lib/medical-access.ts:70–92`).
- **C43.** Detail-view-only, one subject at a time — never a roster, list, card or export. Enforced by a **source-text regression test** (`apps/org/lib/__tests__/roster-privacy.test.ts:62–119`).
- **C44.** Authorise-before-select: the org query only *selects* the ciphertext column when `options.includeMedicalNotes` is true, so a refusal never loads plaintext into render scope (`apps/org/lib/queries.ts:1402–1418`, asserted at `roster-privacy.test.ts:96–112`).
- **C45.** The unreadable UI branch — a `role="alert"` destructive panel that says explicitly *"Do not treat this as 'no medical notes'"* and names `PGCRYPTO_KEY` (`apps/org/app/(console)/registrations/[id]/members/[userId]/page.tsx:170–192`).
- **C46.** The audit-log **reader**, gated on `canReadPersonalInformationIn(actor, "audit")` and **withheld whole** on refusal, because a list of `bio.medical.view` rows is a census of who has disclosed a health condition (`apps/org/lib/medical-audit.ts:72–93`, `:116–120`).
- **C47.** `MEDICAL_AUDIT_LOOKBACK_DAYS = 30`, `MEDICAL_AUDIT_ROW_CAP = 500`, `truncated` flag so the page can say the view is partial (`medical-audit.ts:29–32`, `:184–188`).
- **C48.** Subject names resolved in a **second** query over ids matching a UUID regex, because `audit_events.subject` is `text` and one malformed historical row would otherwise error the whole page (`medical-audit.ts:34–35`, `:148–172`).
- **C49.** The general audit trail hides `bio.medical.view` rows *and* the actor email from a caller without `read_personal_information` in the `audit` domain (`medical-audit.ts:211–233`).
- **C50.** **No thresholds, no profiling, no alerting** — deliberately a plain chronological record, because reading many members' notes in one sitting is what medic work looks like (`medical-audit.ts:100–105`; an enumeration detector was built and removed).

### Retention
- **C51.** `ID_RETENTION_GRACE_DAYS = 30` (`packages/core/src/id-retention.ts:40`).
- **C52.** `idRetentionExpiresAt(edition, graceDays?)` — parses `${endDate}T23:59:59.999Z` so an edition is never treated as expired on its final day, then adds `graceDays * 86_400_000` (`id-retention.ts:49–57`).
- **C53.** `isIdRetentionExpired(edition, now, graceDays?)` — strictly `>`, and **returns `false` on `NaN`** (malformed end date) — never purge on ambiguous input (`id-retention.ts:64–72`).
- **C54.** `bioHasIdData(bio)` — `saIdEncrypted !== null || passportEncrypted !== null` (`id-retention.ts:75–77`).
- **C55.** `buildIdPurgePatch() → {saIdEncrypted: null, passportEncrypted: null}` (`id-retention.ts:86–88`).
- **C56.** `identifyPurgeableIdBios({now, editions, bios, graceDays?})` — an edition present in `bios` but **absent from `editions` is treated as UNKNOWN and left alone** (`id-retention.ts:105–121`).
- **C57.** **The scheduled purge job does not exist.** Grep for every identifier in this module across the repo returns only the module, its test, `packages/core/src/index.ts:138–139`, `schema.ts:658` and `docs/accounts-security-spec.md:178–181`. The donor names this as a known gap: *"the automatic deletion of expired ID documents is written but not scheduled"* (`docs/technical-spec.md:437–438`).

### Deletion
- **C58.** `DELETION_GRACE_PERIOD_DAYS = 14`; `deletionGraceEndsAt(requestedAt)` = `+14 * 86_400_000` (`packages/core/src/account-security.ts:152–159`).
- **C59.** `DeletionPhase = "none" | "grace" | "due" | "cancelled" | "sanitized"`, resolved by `deletionPhase(request, now)` with `now >= graceEndsAt ⇒ "due"` (`account-security.ts:178–195`).
- **C60.** `deletionDaysRemaining` — `Math.ceil(ms / DAY_MS)`, floored at 0 (`account-security.ts:198–205`).
- **C61.** `canCancelDeletion` ⟺ phase is `"grace"`; `isSanitizationDue` ⟺ phase is `"due"` (`account-security.ts:211–228`).
- **C62.** `cancelDeletionOnSignIn` — refuses to silently rescue a `due` request, so a login cannot race the sweeper into a half-deleted state (`account-security.ts:239–257`).
- **C63.** Three deletion **blocks**, all returned at once rather than first-only: `sole_camp_lead` (with `groupIds`), `sole_org_god`, `no_sign_in_method` (`account-security.ts:299–307`, `:339–372`).
- **C64.** Three deletion **warnings** (non-blocking): `org_access_revoked`, `supplier_listing_released`, `supplier_onboarding_in_flight` (`account-security.ts:309–315`, `:374–406`).
- **C65.** `canUnlinkSignInMethod(count)` — the last-method guard reused by the unlink control (`account-security.ts:415–424`).
- **C66. `grace_ends_at` is STORED, not derived**, so a later policy change cannot retroactively shorten a promised window (`schema.ts:1898–1900`).
- **C67.** One LIVE request per user via a **partial** unique index `WHERE status = 'pending'` — so cancel-then-change-your-mind still works (`schema.ts:1942–1946`).
- **C68.** `cancelPendingDeletion({userId? | authUserId?, via, now?, context?})` — safe on every sign-in, never throws, resolves Better Auth's TEXT `user.id` into our UUID `users.id` **before** any keyed query (`packages/db/src/deletion.ts:43–107`).
- **C69.** The cancel UPDATE carries `status = 'pending'` in its own WHERE, making the update itself the concurrency guard against double-cancel (`deletion.ts:120–130`).
- **C70.** Cancel + audit commit in one transaction; the inbox notification and `security_events` row are **best-effort** and swallowed (`deletion.ts:115–195`).
- **C71.** The sanitization **plan** is pure: `buildSanitizationPlan({userId, at, bioCount?, membershipCount?})` returns `{userId, at, user, bio, preservedTables, purgedTables, identityTables, audit}` (`packages/core/src/account-sanitization.ts:244–272`).
- **C72.** `DEPARTED_BURNER_NAME = "Departed Burner"` (`account-sanitization.ts:24`).
- **C73.** `buildUserSanitizationPatch` → `{email: null, username: null, sanitizedAt: at}` — and **`authUserId` is deliberately left unchanged** so the tombstone stays findable by session resolvers (`account-sanitization.ts:26–71`).
- **C74.** `SANITIZED_BIO_NULL_FIELDS` — 14 columns (`account-sanitization.ts:85–110`).
- **C75.** `buildBioSanitizationPatch(at)` — nulls those 14 plus resets `skills: []`, `attendedYears: []`, `campHistory: null`, `volunteeringInterests: null`, `rangerTraining/rangerCurious/greenDotTraining: null`, `firstTime: false`, `privacyFlags: {}` (`account-sanitization.ts:121–159`). The array reset exists because *"welder who was at 2018/2019/2022 with Mad Hatters"* identifies one person even with the name gone (`account-sanitization.test.ts:75–84`).
- **C76.** Three table lists as **data**, so intent is testable: `SANITIZATION_PRESERVED_TABLES` (10), `SANITIZATION_PURGED_TABLES` (3), `SANITIZATION_IDENTITY_TABLES` (3) (`account-sanitization.ts:167–215`).
- **C77.** `isSanitized(user)` / `assertNotSanitized(user) → {ok:true} | {ok:false, reason}` — the resurrection guard, wired at every session resolver (`account-sanitization.ts:275–294`; call sites `apps/web/lib/session.ts:152`, `apps/org/lib/session.ts:167`, `apps/suppliers/lib/session.ts:273`, `packages/auth/src/account.ts:199`).
- **C78.** `publicMemberName(username, {sanitizedAt}?)` — the render-layer stub; falls back to `UNNAMED_BURNER = "Unnamed burner"` (`packages/core/src/username.ts:32, :250`). Moving the stub to the render layer is what lets erasure null the column outright.
- **C79.** `uncoveredHardLockedFields(patch)` — the completeness prover, mapping flag keys (`saId`, `passport`, `medical`) to column names (`saIdEncrypted`, `passportEncrypted`, `medicalNotes`) and returning what the patch fails to cover (`account-sanitization.ts:308–334`).
- **C80.** `patchLeaksAny(patch, forbidden)` — a test-facing leak detector: lowercases `JSON.stringify(patch)` and searches for any supplied personal value (`account-sanitization.ts:341–351`).
- **C81.** `sanitizeAccount(userId, requestId, now?)` — the runner. **All erasure writes in one pooled transaction**, so a partial POPIA erasure is impossible (`apps/web/lib/account-sanitize.ts:75–418`).
- **C82.** The runner **re-checks eligibility at the moment of erasure** with `signInMethodCount` forced to `1`, closing the two-sequential-gods hole. A caught account is left `pending` for the next sweep rather than failed or force-deleted (`account-sanitize.ts:119–162`).
- **C83.** Ordering inside the transaction: purge secrets → patch bios → hard-delete identity (`session`, then `account`, then `user`) → tombstone the `users` row **last** → mark the request `completed` (`account-sanitize.ts:198–252`).
- **C84.** Release what the account held for others: `suppliers.user_id → null`, `wrangler_assignments.wrangler_user_id → null` — because the schema's `ON DELETE SET NULL` can never fire when the row is deliberately kept (`account-sanitize.ts:254–293`).
- **C85.** Revoke console access: delete `org_role_assignments` by membership id, demote the org `memberships.role` to `"member"` but **keep the membership row** (`account-sanitize.ts:295–336`).
- **C86.** **Strip PII from the audit trail without destroying it** — a raw SQL `meta = meta - 'email' - 'contactEmail' - 'primaryEmail'` over rows where `actor_id = $1 OR subject = $1` (`account-sanitize.ts:338–355`). 32 such rows existed on the live database when this was found.
- **C87.** A second audit row `account.released_holdings` recording ids only (`account-sanitize.ts:371–387`), then the `account.sanitized` proof row (`:391–396`).
- **C88.** The farewell email is sent to the address **captured before the transaction**, because after erasure there is no address left (`account-sanitize.ts:176`, `:399–409`).
- **C89.** `sweepDueDeletions(now?, limit = 50)` — caps a single sweep so a backlog cannot blow a serverless timeout; per-row try/catch so one failure does not abort the rest (`account-sanitize.ts:429–465`).
- **C90.** The sweep route **refuses to run unauthenticated** — `ACCOUNT_SWEEP_SECRET` unset ⇒ 503 with a message; bearer compared with `timingSafeEqual` after a length check; accepts `ACCOUNT_SWEEP_SECRET` **or** Vercel's injected `CRON_SECRET` (`apps/web/app/api/account/deletion-sweep/route.ts:41–59`, `:102–121`).
- **C91.** A failed erasure is **not** a successful run: each failure is `console.error`'d and the response is **500**, so the scheduler's own alerting sees it (`route.ts:74–99`).
- **C92.** GET is the cron entry point; an unauthenticated GET is a status probe that erases nothing (`route.ts:123–149`).
- **C93.** Re-auth to request deletion, branching on what the account actually has: a password check via `signInEmail`, or — for a social-only account with no `credential` row — typing the account's own email address. The freshly minted re-auth session row is deleted immediately so a verified password leaves **zero session side effect** (`apps/web/lib/account-actions.ts:886–952`).
- **C94.** The deletion request and its `account.deletion_requested` audit row commit together (`account-actions.ts:966–981`).
- **C95.** The consequences UI renders two columns — *Erased for good* (5 items) and *Kept, but anonymised* (4 items) — explicitly derived from the core plan so the page and the sweeper cannot drift (`apps/web/app/(app)/account/delete/page.tsx:28–53`).
- **C96.** Every blocker is listed at once with a per-project "Transfer leadership · {name}" CTA (`delete/page.tsx:151–201`).
- **C97.** `maskEmail("alice@example.com") → "a…@example.com"` (`packages/core/src/security-notifications.ts:161–169`).

### Report redaction (adjacent but load-bearing PII control)
- **C98.** `sanitizeReportText(input, maxLength = 8000) → {text, redacted: RedactionKind[]}` (`packages/core/src/report-sanitize.ts:218–252`).
- **C99.** 8 `RedactionKind`s: `email | phone | id-number | card | date | uuid | ref-code | structured-data` (`report-sanitize.ts:44–52`).
- **C100.** Ordered rules — structured data first (a JSON blob contains every other pattern), then longest numeric first so a 13-digit SA ID is not eaten by the phone rule and escaping as `[phone]3` (`report-sanitize.ts:60–119`).
- **C101.** A **depth-counting brace scanner**, not a regex, so `{"name":"Alice","meta":{"x":1}}` is removed whole rather than only its inner object; `MAX_SPAN = 4_000` bounds it (`report-sanitize.ts:165–209`).
- **C102.** A single-pass `stripMarkup` that keeps an unterminated `<` as `&lt;` (because `Expected count < 10` is an ordinary log line), avoiding the quadratic backtracking CodeQL flagged in the original (`report-sanitize.ts:128–151`).
- **C103.** `rule.pattern.lastIndex = 0` reset before **and** between `test`/`replace` — a shared `/g` regex is stateful (`report-sanitize.ts:240–245`).
- **C104.** `describeRedactions(kinds)` says *"Recognised and removed"*, never *"anonymised"*, and states that redaction is pattern-based and fails open (`report-sanitize.ts:261–277`).

---

## 3. Data model (verbatim)

### 3.1 `burner_bios` — the PII-bearing table (`packages/db/src/schema.ts:604–695`)

```
id                     uuid            defaultRandom primaryKey
user_id                uuid            notNull → users.id  ON DELETE cascade
edition_id             uuid            notNull → editions.id ON DELETE cascade

display_name           text            (RETIRED per-edition playa name)
legal_name             text
home_city              text
bio                    text
skills                 jsonb $type<string[]>  notNull default []
attended_years         jsonb $type<number[]>  notNull default []   -- 2007–2026, never 2020/2021
first_time             boolean         notNull default false

contact_email          text
phone                  text            -- HARD-LOCKED, E.164, PLAINTEXT

onsite_contact_name    text            -- HARD-LOCKED, plaintext
onsite_contact_phone   text            -- HARD-LOCKED, plaintext
offsite_contact_name   text            -- HARD-LOCKED, plaintext
offsite_contact_phone  text            -- HARD-LOCKED, plaintext

medical_notes          text            -- SAFETY-VISIBLE + AES-256-GCM ciphertext (base64)
sa_id_encrypted        text            -- HARD-LOCKED + AES-256-GCM ciphertext
passport_encrypted     text            -- HARD-LOCKED + AES-256-GCM ciphertext

about                  text
camp_history           jsonb $type<CampHistoryEntry[]>
volunteering_interests jsonb $type<string[]>
ranger_training        boolean
ranger_curious         boolean
green_dot_training     boolean

privacy_flags          jsonb $type<Record<string, boolean>>  notNull default {}

version                text            notNull      -- BURNER_BIO_VERSION = "2027.2"
started_at             timestamp       notNull defaultNow
completed_at           timestamp
updated_at             timestamp       notNull defaultNow

uniqueIndex burner_bios_user_edition_idx  (user_id, edition_id)
index       burner_bios_edition_idx       (edition_id)
```

**Note the asymmetry:** phone and both emergency contacts are hard-locked but stored **plaintext**; only ID documents and medical notes are encrypted. Medical was moved *into* encryption on 26 Jul 2026 to fix "an earlier sensitivity inversion where lower-risk ID data was encrypted while medical was plaintext" (`schema.ts:594–597`). Because ciphertext is base64 in a `text` column, **that change needed no migration**.

### 3.2 `users` — the tombstone (`schema.ts:283–318`)

```
id             uuid       defaultRandom primaryKey
auth_user_id   text       notNull unique          -- Better Auth's TEXT id; NEVER rewritten by sanitization
email          text                                -- nulled by sanitization
username       text                                -- nulled by sanitization (frees the handle)
sanitized_at   timestamp                           -- THE TOMBSTONE
created_at     timestamp  notNull defaultNow

uniqueIndex users_username_lower_idx ON (lower(username))
```

There is deliberately **no database foreign key** from `users.auth_user_id` to `user.id` — the join stays logical precisely so the sanitizer can hard-delete the identity while the stub survives (`schema.ts:341–356`).

### 3.3 `profile_keys` (`schema.ts:700–711`)

```
user_id                uuid  primaryKey → users.id ON DELETE cascade
public_key             text  notNull            -- plaintext
encrypted_private_key  text  notNull            -- AES-256-GCM, or the row is never created
created_at             timestamp notNull defaultNow
```

### 3.4 `account_deletion_requests` (`schema.ts:1910–1948`)

```
id                  uuid        defaultRandom primaryKey
user_id             uuid        notNull → users.id ON DELETE cascade
status              account_deletion_status  notNull default 'pending'
requested_at        timestamp   notNull defaultNow
grace_ends_at       timestamp   notNull                -- STORED, not derived
cancelled_at        timestamp
completed_at        timestamp
requested_from_app  text                               -- 'web' | 'org' | 'suppliers', trail only
created_at          timestamp   notNull defaultNow
updated_at          timestamp   notNull defaultNow

index       account_deletion_requests_user_status_idx (user_id, status)
index       account_deletion_requests_due_idx         (status, grace_ends_at)
uniqueIndex account_deletion_requests_one_pending_idx (user_id) WHERE status = 'pending'
```

`AccountDeletionStatus` values used in code: `pending`, `cancelled`, `completed` (`account-security.ts:187–194`).

### 3.5 `security_events` (`schema.ts:2026–2045`) and `security_event_kind` (`schema.ts:212–222`)

```
security_event_kind = [
  "password_changed",
  "password_reset_completed",
  "session_revoked",
  "sessions_revoked_others",
  "email_change_requested",
  "email_change_confirmed",
  "email_change_revoked",
  "deletion_requested",
  "deletion_cancelled"
]

id          uuid       defaultRandom primaryKey
user_id     uuid       notNull → users.id ON DELETE cascade
kind        security_event_kind  notNull
ip          text                            -- personal data under POPIA; PURGED on erasure
user_agent  text                            -- ditto
created_at  timestamp  notNull defaultNow

index security_events_user_created_idx (user_id, created_at DESC)
```

### 3.6 `email_change_requests` (`schema.ts:1970–2020`) and `email_change_status` (`schema.ts:192–198`)

```
email_change_status = ["pending","confirmed","revoked","expired","cancelled"]

id                     uuid      defaultRandom primaryKey
user_id                uuid      notNull → users.id ON DELETE cascade
current_email          text      notNull
new_email              text      notNull
status                 email_change_status notNull default 'pending'
confirm_token_hash     text      notNull unique   -- SHA-256, NEVER plaintext
revoke_token_hash      text      notNull unique   -- SHA-256, NEVER plaintext
expires_at             timestamp notNull          -- requestedAt + 2h
confirmed_at           timestamp
revocable_until        timestamp                  -- confirmedAt + 48h, STORED
revoked_at             timestamp
provider_committed_at  timestamp                  -- the honesty flag
created_at / updated_at timestamp notNull defaultNow

index       email_change_requests_user_status_idx (user_id, status)
uniqueIndex email_change_requests_one_pending_idx (user_id) WHERE status = 'pending'
```

### 3.7 `audit_events` (`schema.ts:1708–1738`)

```
id          uuid        defaultRandom primaryKey
actor_id    uuid        → users.id ON DELETE set null
action      text        notNull
subject     text                                -- TEXT, holds ids of several row kinds
meta        jsonb $type<Record<string, unknown>>
created_at  timestamp   notNull defaultNow

index audit_events_actor_idx      (actor_id)
index audit_events_action_idx     (action)
index audit_events_subject_idx    (subject)        -- migration 0024
index audit_events_created_at_idx (created_at DESC) -- migration 0024
```

Migration 0024's comment is itself a useful artifact: it names the three hot readers that were scanning the whole append-only log, including *"POPIA erasure, which rewrites `meta` `WHERE actor_id = … OR subject = …` and had an index for the first half of that OR and none for the second"* (`schema.ts:1725–1735`).

**Audit `action` strings this subsystem writes:** `bio.medical.view`, `account.deletion_requested`, `account.deletion_cancelled`, `account.sanitized`, `account.released_holdings`.

### 3.8 Env vars

| Var | Read at | Behaviour |
|---|---|---|
| `PGCRYPTO_KEY` | `packages/db/src/crypto.ts:31` | ≥16 chars or throw; in `turbo.json:19` globalEnv |
| `ACCOUNT_SWEEP_SECRET` | `deletion-sweep/route.ts:56, 111, 130` | unset ⇒ sweeper disabled; **absent from turbo.json globalEnv and .env.example** |
| `CRON_SECRET` | `deletion-sweep/route.ts:57` | Vercel-injected bearer; **also absent from both** |

---

## 4. Public API surface (verbatim signatures)

### `@quagga/db/crypto`
```ts
export function encrypt(plaintext: string): string
export function decrypt(stored: string): string
export function decryptOrNull(stored: string | null | undefined): string | null
export type DecryptedField =
  | { state: "empty"; value: null }
  | { state: "ok"; value: string }
  | { state: "unreadable"; value: null }
export function decryptField(stored: string | null | undefined): DecryptedField
```

### `@quagga/db` (barrel, `packages/db/src/index.ts:14`)
```ts
export { cancelPendingDeletion, type CancelDeletionResult } from "./deletion";

export interface CancelDeletionResult { cancelled: boolean; email: string | null }

export async function cancelPendingDeletion(input: {
  userId?: string;
  authUserId?: string;
  via: "sign_in" | "explicit";
  now?: Date;
  context?: { ip: string | null; userAgent: string | null };
}): Promise<CancelDeletionResult>
```

### `@quagga/core` — `privacy.ts`
```ts
export const HARD_LOCKED_PRIVATE_FIELDS: readonly [
  "saId","passport","phone",
  "onsiteContactName","onsiteContactPhone",
  "offsiteContactName","offsiteContactPhone"
]
export type HardLockedField = (typeof HARD_LOCKED_PRIVATE_FIELDS)[number]
export const SAFETY_VISIBLE_FIELDS: readonly ["medical"]
export type SafetyVisibleField = (typeof SAFETY_VISIBLE_FIELDS)[number]
export const ALWAYS_PRIVATE_FIELDS: readonly [...HardLocked, ...SafetyVisible]  // 8 members
export type AlwaysPrivateField = (typeof ALWAYS_PRIVATE_FIELDS)[number]

export function isHardLockedPrivate(field: string): boolean
export function isSafetyVisibleField(field: string): boolean
export function isAlwaysPrivate(field: string): boolean
export function canBePublic(field: string): boolean
export function enforcePrivacyFlags(flags: Record<string, boolean>): Record<string, boolean>
export function privacyViolations(flags: Record<string, boolean>): AlwaysPrivateField[]
```

### `@quagga/core` — `medical-access.ts`
```ts
export function isOrgStaffRole(role: MembershipRole | null | undefined): boolean

export interface MedicalAccessContext {
  isSelf: boolean;
  actorOrgRole: MembershipRole | null;
  actorOrgPersonalInformation?: boolean;
  actorLeadCampIds: readonly string[];
  subjectCampIds: readonly string[];
}

export function canViewMedicalNotes(ctx: MedicalAccessContext): boolean
export type MedicalAccessBasis = "self" | "org_staff" | "camp_lead"
export function medicalAccessBasis(ctx: MedicalAccessContext): MedicalAccessBasis | null
export const MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view"
```

### `@quagga/core` — `id-retention.ts`
```ts
export interface RetentionEdition { id: string; endDate: string }   // ISO YYYY-MM-DD
export interface RetentionBio {
  id: string; editionId: string;
  saIdEncrypted: string | null; passportEncrypted: string | null;
}
export const ID_RETENTION_GRACE_DAYS = 30
export function idRetentionExpiresAt(edition: RetentionEdition, graceDays?: number): Date
export function isIdRetentionExpired(edition: RetentionEdition, now: Date, graceDays?: number): boolean
export function bioHasIdData(bio: RetentionBio): boolean
export interface IdPurgePatch { saIdEncrypted: null; passportEncrypted: null }
export function buildIdPurgePatch(): IdPurgePatch
export interface PurgeableIdBio { bioId: string; editionId: string }
export function identifyPurgeableIdBios(input: {
  now: Date;
  editions: readonly RetentionEdition[];
  bios: readonly RetentionBio[];
  graceDays?: number;
}): PurgeableIdBio[]
```

### `@quagga/core` — `account-sanitization.ts`
```ts
export const DEPARTED_BURNER_NAME = "Departed Burner"

export interface UserSanitizationPatch { email: null; username: null; sanitizedAt: Date }
export function buildUserSanitizationPatch(_userId: string, at: Date): UserSanitizationPatch

export const SANITIZED_BIO_NULL_FIELDS: readonly [
  "displayName","legalName","homeCity","bio","about",
  "contactEmail","phone",
  "onsiteContactName","onsiteContactPhone",
  "offsiteContactName","offsiteContactPhone",
  "medicalNotes","saIdEncrypted","passportEncrypted"
]
export type SanitizedBioNullField = (typeof SANITIZED_BIO_NULL_FIELDS)[number]
export type BurnerBioSanitizationPatch = Record<SanitizedBioNullField, null> & {
  skills: string[]; attendedYears: number[];
  campHistory: null; volunteeringInterests: null;
  rangerTraining: null; rangerCurious: null; greenDotTraining: null;
  firstTime: false; privacyFlags: Record<string, boolean>; updatedAt: Date;
}
export function buildBioSanitizationPatch(at: Date): BurnerBioSanitizationPatch

export const SANITIZATION_PRESERVED_TABLES: readonly [
  "memberships","member_role_assignments","questionnaire_responses",
  "required_actions","audit_events","supplier_document_acks",
  "supplier_declarations","registrations","section_reviews","notifications"
]
export const SANITIZATION_PURGED_TABLES: readonly [
  "profile_keys","email_change_requests","security_events"
]
export const SANITIZATION_IDENTITY_TABLES: readonly ["session","account","user"]

export interface SanitizationPlan {
  userId: string; at: Date;
  user: UserSanitizationPatch;
  bio: BurnerBioSanitizationPatch;
  preservedTables: readonly string[];
  purgedTables: readonly string[];
  identityTables: readonly string[];
  audit: { action: "account.sanitized"; subject: string; meta: Record<string, unknown> };
}
export function buildSanitizationPlan(input: {
  userId: string; at: Date; bioCount?: number; membershipCount?: number;
}): SanitizationPlan

export function isSanitized(user: { sanitizedAt?: Date | null }): boolean
export function assertNotSanitized(user: { sanitizedAt?: Date | null }):
  { ok: true } | { ok: false; reason: string }
export function uncoveredHardLockedFields(patch: Record<string, unknown>): string[]
export function patchLeaksAny(
  patch: Record<string, unknown>,
  forbidden: readonly (string | null | undefined)[],
): boolean
```

### `@quagga/core` — `account-security.ts` (deletion half)
```ts
export const DELETION_GRACE_PERIOD_DAYS = 14
export function deletionGraceEndsAt(requestedAt: Date): Date

export interface DeletionRequestState {
  status: AccountDeletionStatus; requestedAt: Date; graceEndsAt: Date;
  cancelledAt?: Date | null; completedAt?: Date | null;
}
export type DeletionPhase = "none" | "grace" | "due" | "cancelled" | "sanitized"
export function deletionPhase(request: DeletionRequestState | null | undefined, now: Date): DeletionPhase
export function deletionDaysRemaining(request: DeletionRequestState | null | undefined, now: Date): number
export function canCancelDeletion(request: DeletionRequestState | null | undefined, now: Date): boolean
export function isSanitizationDue(request: DeletionRequestState | null | undefined, now: Date): boolean
export type DeletionTransition =
  | { ok: true; status: AccountDeletionStatus; at: Date }
  | { ok: false; reason: string }
export function cancelDeletionOnSignIn(request: DeletionRequestState | null | undefined, now: Date): DeletionTransition

export interface LedProject { groupId: string; name: string; leadCount: number }
export interface DeletionGuardContext {
  ledProjects: readonly LedProject[];
  isOrgGod: boolean;
  orgGodCount: number;
  signInMethodCount: number;
  hasInFlightSupplierOnboarding?: boolean;
  orgRole?: string | null;
  claimedSupplierName?: string | null;
}
export type DeletionBlockCode = "sole_camp_lead" | "sole_org_god" | "no_sign_in_method"
export interface DeletionBlock { code: DeletionBlockCode; message: string; groupIds?: string[] }
export interface DeletionWarning {
  code: "supplier_onboarding_in_flight" | "org_access_revoked" | "supplier_listing_released";
  message: string;
}
export interface DeletionEligibility { ok: boolean; blocks: DeletionBlock[]; warnings: DeletionWarning[] }
export function assessDeletionEligibility(ctx: DeletionGuardContext): DeletionEligibility
export function canUnlinkSignInMethod(signInMethodCount: number): { ok: true } | { ok: false; reason: string }
```

### `@quagga/core` — `bio.ts` (privacy half)
```ts
export interface BioPrivacyField {
  key: string; label: string; locked: boolean;
  defaultPublic: boolean; lockReason?: string;
}
export const MEDICAL_AUDIENCE_NOTE: string
export const BIO_PRIVACY_FIELDS: readonly BioPrivacyField[]
export function defaultPrivacyFlags(): Record<string, boolean>
export function initialPrivacyFlags(rawPrivacyFlags?: Record<string, boolean>): Record<string, boolean>
export function resolvePrivacyFlagsUpdate(
  rawPrivacyFlags: Record<string, boolean> | undefined,
): { privacyFlags: Record<string, boolean> } | Record<string, never>
export interface PublicBioView { /* 14 fields, all nullable/empty-defaulted */ }
export function publicBioView(
  fields: BurnerBioFields,
  privacyFlags: Record<string, boolean>,
  extras?: BioExtras,
): PublicBioView
```

### `@quagga/core` — `report-sanitize.ts`
```ts
export type RedactionKind =
  "email" | "phone" | "id-number" | "card" | "date" | "uuid" | "ref-code" | "structured-data"
export interface RedactionResult { text: string; redacted: RedactionKind[] }
export function sanitizeReportText(input: string, maxLength?: number): RedactionResult
export function describeRedactions(kinds: readonly RedactionKind[]): string
```

### `apps/web/lib`
```ts
// crypto-guard.ts
export function isCryptoConfigured(): boolean
export function safeEncrypt(plaintext: string | null): string | null
export { decryptOrNull, decryptField }

// keys.ts
export interface GeneratedKeypair { publicKeyB64: string; privateKeyB64: string }
export async function generateProfileKeypair(): Promise<GeneratedKeypair>
export async function fingerprintPublicKey(publicKeyB64: string): Promise<string>

// medical-access.ts
export async function resolveMedicalNotesForViewer(input: {
  viewerUserId: string; subjectUserId: string; editionId: string;
}): Promise<{ visible: boolean; notes: string | null; unreadable: boolean }>

// account-sanitize.ts
export interface SanitizationOutcome {
  ok: boolean; userId: string; bioRows: number;
  membershipsPreserved: number; notified: boolean; error?: string;
}
export async function sanitizeAccount(userId: string, requestId: string, now?: Date): Promise<SanitizationOutcome>
export async function sweepDueDeletions(now?: Date, limit?: number): Promise<SanitizationOutcome[]>
```

### `apps/org/lib/medical-audit.ts`
```ts
export const MEDICAL_AUDIT_LOOKBACK_DAYS = 30
export interface MedicalReadRow {
  id: string; actorId: string | null; actorEmail: string | null;
  subjectId: string | null; subjectName: string | null;
  basis: MedicalAccessBasis | null; createdAt: Date;
}
export interface MedicalAccessLog { rows: MedicalReadRow[]; truncated: boolean; lookbackDays: number }
export function canReadMedicalAccessLog(actor: OrgActor): boolean
export async function getMedicalAccessLog(
  actor: OrgActor, options?: { lookbackDays?: number; limit?: number },
): Promise<MedicalAccessLog>
export interface AuditTrailRow { id: string; action: string; actorEmail: string | null; subject: string | null; createdAt: Date }
export async function getAuditTrail(actor: OrgActor, limit?: number): Promise<AuditTrailRow[]>
```

### `apps/web/components/privacy-toggles.tsx`
```tsx
interface PrivacyTogglesProps {
  fields: readonly BioPrivacyField[];
  flags: Record<string, boolean>;
  onChange: (key: string, isPublic: boolean) => void;
}
export function PrivacyToggles(props: PrivacyTogglesProps): JSX.Element
```

### `packages/ui/src/components/switch.tsx`
```tsx
export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "value"
> {
  variant?: "default" | "privacy";
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  hardLocked?: boolean;
}
```

---

## 5. UX behaviours

### 5.1 Privacy toggles (two shapes, both used)
- **List form (`PrivacyToggles`)** — the onboarding "Privacy" step and the questionnaire runner's privacy review render a bordered `<ul>` with `divide-y`. Each row: label (with a `Lock` glyph when locked), one line of explanatory copy, and either a "Locked private" pill or a toggle pill. Unlocked copy switches between *"Visible on your public profile."* and *"Only you and camps you join can see this."* Locked copy is the field's own `lockReason`, defaulting to *"Always private."* (`apps/web/components/privacy-toggles.tsx:23–84`). Consumed at `apps/web/components/onboarding/bio-flow.tsx:302` and `apps/web/components/questionnaire/runner.tsx:412`.
- **Inline form (`Switch variant="privacy"` inside `Field.privacyToggle`)** — the Details step puts a caps status label beside each control: `On · Public`, `Off · Private`, or `Always private` prefixed by a `Lock` icon. Locked switches are rendered with `hardLocked` and no handler at all (`bio-flow.tsx:545–561`).
- The onboarding flow **excludes** four legacy keys from the privacy review — `bio`, `skills`, `firstTime`, `contactEmail` — because the streamlined flow no longer collects them; their flags keep defaults and pre-existing values carry forward untouched (`bio-flow.tsx:113–124`).
- `STEPS = ["welcome","details","burns","privacy","done"]`; `EDIT_STEPS = ["details","burns","privacy"]` (`bio-flow.tsx:98–106`).

### 5.2 Medical notes on a member detail view
- Rendered only when `maySeeMedical`. Header: a `Stethoscope` icon + *"Medical notes"*, description *"{name} wrote these knowing their camp leads and AfrikaBurn's safety team can see them."* Three mutually exclusive bodies: the notes in a `whitespace-pre-wrap` panel; the **unreadable** `role="alert"` destructive panel; or the muted *"No medical notes on file for this member."* Footer with a `Lock` glyph: *"Never public, never listed or exported, encrypted at rest — and this view is recorded in the audit trail."* (`apps/org/app/(console)/registrations/[id]/members/[userId]/page.tsx:154–204`).

### 5.3 Delete account
- Two consequence columns rendered from constants derived from the core plan (`delete/page.tsx:40–53`):
  - **Erased for good:** "Your email address and password" · "Google and any other sign-in links" · "Phone number and emergency contacts" · "Your Burner Bio, ID document, skills and interests" · "Every active session and device".
  - **Kept, but anonymised:** `Camp memberships, re-labelled "Departed Burner"` · "Questionnaire answers, detached from you" · "Registration and review history the camp still needs" · "Audit history, to keep records intact".
- A "scheduled" card appears in phases `grace` and `due`. In `grace` it shows *"{n} day(s) left to change your mind. Nothing has been erased yet."* plus a `CancelDeletionButton`; in `due` it says the grace has elapsed and *"It can no longer be cancelled here."* (`delete/page.tsx:85–108`).
- Blockers card: `border-warning/40`, an `AlertTriangle`, a `Badge variant="warning"` reading "Blocks deletion", every block listed at once with the rationale *"you shouldn't discover the second one after fixing the first"*, and a per-project outline button `Transfer leadership · {name}` linking `/camps/{slug}` (`delete/page.tsx:151–201`).
- Warnings render as a plain "Worth knowing" card (`delete/page.tsx:203–216`).
- The confirmation copy branches on whether a `credential` provider exists: password field vs. type-your-own-email (`delete/page.tsx:70–76`, `:218–237`).
- Success message: `` `Scheduled. You have ${DELETION_GRACE_PERIOD_DAYS} days to change your mind — just sign in.` `` (`account-actions.ts:996`). Cancel message: `"Cancelled — nothing was erased."` (`account-actions.ts:1051`).

### 5.4 The three deletion emails (verbatim subjects)
- `"Your AfrikaBurn account is scheduled for deletion"` (`security-notifications.ts:274–288`)
- `"Your AfrikaBurn account deletion was cancelled"` — body opens *"Welcome back. Nothing was erased and your account is exactly as you left it."* (`:289–300`)
- `"Your AfrikaBurn account has been deleted"` — closes *"This is the last email we'll send to this address."* (`:301–314`)
- Timestamps in security notices are `ISO.slice(0,16).replace("T"," ") + " UTC"` — *"no locale surprises in a security notice"* (`:316–319`).

---

## 6. Validation and edge-case rules (digit-exact)

| Rule | Value | Cite |
|---|---|---|
| Cipher | `aes-256-gcm` | `crypto.ts:22` |
| IV length | 12 bytes | `crypto.ts:23` |
| GCM tag length | 16 bytes | `crypto.ts:24` |
| scrypt output | 32 bytes | `crypto.ts:37` |
| Key salt | `"quagga-pgcrypto-v1"` (static, no rotation path) | `crypto.ts:25` |
| Min key length | 16 characters (15 refused, 16 accepted) | `crypto.ts:32`; `crypto.test.ts:127–133` |
| Min ciphertext | `IV_LEN + TAG_LEN + 1 = 29` bytes | `crypto.ts:52` |
| Hard-locked fields | exactly **7** | `privacy.test.ts:31` |
| Safety-visible fields | exactly `["medical"]` | `privacy.test.ts:42` |
| Always-private union | exactly **8** | `privacy.test.ts:45` |
| Bio privacy registry | 19 entries | `bio.ts:168–267` |
| Bio version | `BURNER_BIO_VERSION = "2027.2"` | `bio.ts:143` |
| ID retention grace | **30 days** | `id-retention.ts:40` |
| Retention day boundary | `${endDate}T23:59:59.999Z` then `+ graceDays * 86_400_000`; comparison is strictly `>` | `id-retention.ts:55–56, :71` |
| Retention on malformed date | `NaN` ⇒ `false` (never purge) | `id-retention.ts:70` |
| Retention on unknown edition | bios left alone | `id-retention.ts:118–120` |
| Deletion grace | **14 days** = `14 * 24*60*60*1000` | `account-security.ts:152–158` |
| `due` boundary | `now.getTime() >= graceEndsAt.getTime()` | `account-security.ts:193` |
| Days remaining | `Math.ceil(ms / DAY_MS)`, floored at 0 | `account-security.ts:203–204` |
| Sole-lead block trigger | `leadCount <= 1` | `account-security.ts:345` |
| Sole-god block trigger | `isOrgGod && orgGodCount <= 1` | `account-security.ts:358` |
| Last-method block trigger | `signInMethodCount <= 0` | `account-security.ts:366` |
| Unlink guard | allowed only when `signInMethodCount > 1` | `account-security.ts:418` |
| Sanitization re-check override | `signInMethodCount: 1` forced | `account-sanitize.ts:153` |
| Sweep batch limit | 50 | `account-sanitize.ts:431` |
| Sweep cron schedule | `0 3 * * *` (03:00 UTC daily) | `apps/web/vercel.json` |
| Sweep failure response | HTTP **500** when any row failed | `route.ts:98` |
| Medical audit lookback | 30 days | `medical-audit.ts:29` |
| Medical audit row cap | 500 (`Math.min(options.limit ?? CAP, CAP)`) | `medical-audit.ts:32, :122–125` |
| Redaction max length | 8000 chars | `report-sanitize.ts:220` |
| Structured-data span cap | 4 000 chars | `report-sanitize.ts:165` |
| SA ID pattern | `/\b\d{13}\b/g`, applied **before** any phone rule | `report-sanitize.ts:78` |
| Intl phone pattern | `/\+\d[\d\s.()-]{5,18}\d/g` (consumes the whole number) | `report-sanitize.ts:91` |
| SA local phone pattern | `/\b0\d{2}[-.\s]?\d{3}[-.\s]?\d{4}\b/g` | `report-sanitize.ts:99` |
| Supplier ref pattern | `/\bSUP-\d{4}-\d{3,5}\b/g` **before** the generic `/\b[A-Z]{2,4}-[A-Z]?\d{3,4}\b/g` | `report-sanitize.ts:113–115` |
| Key fingerprint | SHA-256 hex, first 16 hex chars → 8 colon-separated pairs | `keys.ts:57–59` |
| Email-change confirm TTL | 2 hours | `account-security.ts:432` |
| Email-change revocation | 48 hours | `account-security.ts:435` |
| Password policy | min **15**, max **64**; bands: `>=24` strong, `>=18` good, else fair; NFKC-normalised, not trimmed | `account-security.ts:25–76` |

### Named edge cases worth stealing verbatim
1. **`unreadable` is not `empty`.** A rotated key must not blank a medical note into an affirmative "nothing on file" (`crypto.ts:69–74`, `:86–94`).
2. **Ciphertext preservation on save.** An empty incoming value is a deliberate clear *only when the form actually showed the old value* (`bio-store.ts:308–330`).
3. **Document-type switch preservation.** Switching passport↔SA-ID nulls the other column *unless* that column holds unreadable ciphertext (`bio-store.ts:348–363`).
4. **Refuse rather than drop.** No key + sensitive payload ⇒ throw, don't "Saved" (`bio-store.ts:288–306`).
5. **No plaintext lock box.** No key ⇒ no keypair at all (`bio-store.ts:469–516`).
6. **Two id spaces.** Better Auth's `user.id` is TEXT; ours is UUID. Passing `session.userId` straight in made Postgres refuse the comparison, the catch swallowed it, and cancellation returned "nothing to cancel" on **every** sign-in — a fix that shipped and was not a fix. The unit test missed it because it asserted only that the hook was *wired* (`packages/db/src/deletion.ts:48–62`).
7. **The two-sequential-gods hole.** Eligibility assessed at request time is not eligibility at erasure time (`account-sanitize.ts:119–145`).
8. **`ON DELETE SET NULL` never fires** when you deliberately keep the row (`account-sanitize.ts:254–280`).
9. **`meta` carried emails.** Audit rows written by god-bootstrap and supplier-overlap paths kept the address verbatim through erasure — 32 rows on the live DB (`account-sanitize.ts:338–348`).
10. **A `bio.medical.view` row only exists when the subject *has* notes**, so a named list of them is a disclosure census — hence the whole panel is withheld, not redacted (`medical-audit.ts:76–82`).
11. **More than one `org` group is permitted** by the schema (unique is on `(kind, name_normalized)`), and picking one non-deterministically **failed open**, granting medical access *through* an org group (`apps/web/lib/medical-access.ts:108–121`).
12. **Nested JSON.** `[[{][^[\]{}]{0,4000}[\]}]` matched only the inner object of `{"name":"Alice Hatter","meta":{"x":1}}` and published the name (`report-sanitize.ts:153–163`).
13. **Shared `/g` regexes are stateful** — `lastIndex` must be reset (`report-sanitize.ts:238–245`).
14. **Cancelled deletion's inbox link 404'd** in two of three apps because the payload's `/account` path exists only in `apps/web` — fixed by stamping `linkApp: "web"` (`packages/db/src/deletion.ts:156–182`).

---

## 7. Test coverage

**Total for this subsystem: 17 test files, ~4 200 lines, 298 assertions-as-cases** (counted with `grep -cE '^[[:space:]]*(it|test)\('`).

| File | Lines | Cases | What it pins |
|---|---|---|---|
| `packages/core/src/__tests__/privacy.test.ts` | 108 | 7 | Class membership counts (7/1/8), `enforcePrivacyFlags`, `privacyViolations` |
| `packages/core/src/__tests__/medical-access.test.ts` | 205 | 15 | Self/org/camp-lead/refusal matrix; `medical` is safety-visible not hard-locked; `canBePublic("medical") === false`; derives from `ALWAYS_PRIVATE_FIELDS` rather than hard-coding names |
| `packages/core/src/__tests__/id-retention.test.ts` | 169 | 13 | Boundary at end-of-day + 30d; `ID_RETENTION_GRACE_DAYS === 30`; unknown edition left alone |
| `packages/core/src/__tests__/account-sanitization.test.ts` | 254 | 20 | Every `SANITIZED_BIO_NULL_FIELDS` entry nulled; `uncoveredHardLockedFields(patch) === []`; `patchLeaksAny` over a realistic bio |
| `packages/core/src/__tests__/account-security.test.ts` | 538 | 45 | Password bands, enumeration-safe copy, deletion phases, all guards |
| `packages/core/src/__tests__/report-sanitize.test.ts` | 191 | 23 | Every rule, ordering, nested JSON |
| `packages/core/src/__tests__/bio.test.ts` | — | — | `BIO_PRIVACY_FIELDS` locked set **equals** `ALWAYS_PRIVATE_FIELDS` (:37–38, :546–547); an all-public flag map still yields an empty public projection (:224–232); `resolvePrivacyFlagsUpdate` omission (:84–98) |
| `packages/db/src/__tests__/crypto.test.ts` | 134 | 12 | Round-trip, fresh IV, short buffer, all three `DecryptedField` states, rotated key, **no ciphertext in any console call** |
| `packages/db/src/__tests__/deletion.test.ts` | 414 | 19 | Sign-in cancellation, the uuid/text id-space bug, concurrency |
| `packages/db/src/__tests__/schema-invariants.test.ts` | 191 | 8 | `*_encrypted` set is exactly 2, `PgText`, nullable, no plaintext sibling; guards against a vacuous sweep with `TABLES.length > 30` |
| `apps/web/lib/__tests__/account-sanitize-runner.test.ts` | 517 | 17 | What must NOT be erased; the erasure itself; farewell-email outcomes; sweep |
| `apps/web/lib/__tests__/medical-access-resolver.test.ts` | 308 | 11 | Context assembly, audit only on non-self non-empty reads |
| `apps/web/lib/__tests__/bio-ciphertext-preservation.test.ts` | 155 | 2 | The encrypt-or-preserve invariant |
| `apps/web/lib/__tests__/deletion-guards.test.ts` | 194 | 13 | Incl. *"sanitizeAccount re-assesses eligibility before it erases anything"* (:117) |
| `apps/web/lib/__tests__/account-deletion-context.test.ts` | 323 | 19 | `buildDeletionGuardContext` |
| `apps/org/lib/__tests__/roster-privacy.test.ts` | 120 | 6 | **Source-text** regression: no roster select/interface/component carries medical; detail uses `decryptField` not `decryptOrNull`; `canViewMedicalNotes(` appears *before* `getRosterMemberDetail(` in the page |
| `apps/org/lib/__tests__/medical-audit-surface.test.ts` | 361 | 24 | Audit log authorisation and withholding |

### Coverage ratchets (the practice, not just the numbers)
`packages/core/vitest.config.ts` sets global floors `lines 90 / statements 89 / functions 92 / branches 82`, then **per-file 100/100/100/100** on `src/report-sanitize.ts`, `src/report-screen.ts`, `src/medical-access.ts`, `src/privacy.ts`, `src/id-retention.ts`, `src/entitlements.ts`, under the comment *"THE PRIVACY AND SAFETY CORE — 100%, deliberately."* `apps/web/vitest.config.ts` sets globals `94/93/93/87` and per-file `98/98/100/94` on `lib/medical-access.ts` and `lib/account-sanitize.ts`. Both configs carry the same instruction: *"never lower one to make a build pass — the drop is the signal, and lowering the floor deletes it."*

### E2E
`e2e/specs/new-burner/privacy-projection.spec.ts:26–27` explicitly documents that the coercion is a persistence-layer property (`enforcePrivacyFlags` / `privacyViolations` wired at `bio-store.ts`) and the UI only makes it visible. `e2e/personas/registry.ts:346–357` mirrors the two classes for the persona fixtures.

---

## 8. Dependency footprint

**Zero third-party dependencies across the entire subsystem.**

| Module | Imports |
|---|---|
| `packages/db/src/crypto.ts` | `node:crypto` only (`createCipheriv`, `createDecipheriv`, `randomBytes`, `scryptSync`) |
| `packages/core/src/privacy.ts` | **nothing** |
| `packages/core/src/id-retention.ts` | **nothing** |
| `packages/core/src/report-sanitize.ts` | **nothing** |
| `packages/core/src/account-sanitization.ts` | `./privacy` only |
| `packages/core/src/account-security.ts` | `type { AccountDeletionStatus, EmailChangeStatus } from "@quagga/types"` (type-only) |
| `packages/core/src/medical-access.ts` | `type { MembershipRole } from "@quagga/types"` (type-only) — **the only donor-domain coupling in core here** |
| `apps/web/lib/keys.ts` | global WebCrypto (`crypto.subtle`) + `Buffer` — Node 22 |
| `apps/web/lib/crypto-guard.ts` | `server-only`, `@quagga/db/crypto` |
| `apps/web/lib/medical-access.ts` | `server-only`, `next/server` `after`, `drizzle-orm`, `@quagga/core`, local db + crypto-guard |
| `apps/web/lib/account-sanitize.ts` | `server-only`, `drizzle-orm`, `@quagga/core`, local db/config/email |
| `apps/web/components/privacy-toggles.tsx` | `react`, `lucide-react` (`Lock`, `Eye`, `EyeOff`), `@quagga/ui/lib/utils` `cn` |
| `packages/ui/src/components/switch.tsx` | `react`, `lucide-react` (`Lock`), `../lib/utils` — **deliberately not Radix** |
| `apps/web/app/api/account/deletion-sweep/route.ts` | `next/server`, `node:crypto` `timingSafeEqual` |

For Camp 404: `lucide-react` `Lock`/`Eye`/`EyeOff` all exist in the installed `lucide-react@1.16.0`. `after` from `next/server` is available on Next 16. The one API collision is `Switch` — Camp 404's is `@radix-ui/react-switch` with no `variant`/`hardLocked`, so the donor's privacy switch must land under a distinct name (e.g. `PrivacySwitch`).

---

## 9. AfrikaBurn / multi-tenant coupling

Ranked from clean to entangled.

### CLEAN — zero donor coupling (drop-in after a scope rename)
- `packages/db/src/crypto.ts` — the only donor-specific token is `KEY_SALT = "quagga-pgcrypto-v1"`. **Camp 404 must keep `"camp404-pgcrypto-v1"`** or every stored ciphertext becomes unreadable.
- `packages/core/src/report-sanitize.ts` — the only donor-shaped content is the `SUP-\d{4}-\d{3,5}` supplier-code rule (drop it) and the `[A-Z]{2,4}-[A-Z]?\d{3,4}` member-ref rule (Camp 404 has no ref codes; harmless either way). SA phone/ID patterns are correct for Camp 404's population.
- `apps/web/lib/keys.ts` — pure WebCrypto. (Camp 404 has no `profile_keys` table; this is only useful if you want QR attestations.)
- `apps/web/app/api/account/deletion-sweep/route.ts` — pure Next route + `timingSafeEqual`. Camp 404's crons use `assertCron` (`apps/web/lib/cron-auth.ts`), so re-target the auth check but keep the fail-closed shape and the 500-on-failure rule.
- `packages/ui/src/components/switch.tsx` `variant="privacy"` and `field.tsx`'s `privacyToggle` slot — tenant-agnostic (a grep for `groupId|orgId|tenant|MembershipRole|OrgPermissions` across the donor's whole `packages/ui/src` returns zero hits).

### LIGHT ADAPT — the shape is right, the field names are the donor's
- `packages/core/src/privacy.ts` — the *mechanism* (two classes, derived union, `enforcePrivacyFlags` at the persistence boundary, `canBePublic` at the projection boundary) ports unchanged. The *membership* must be re-derived from Camp 404's columns. Camp 404's equivalents live on `users` and `burner_profiles`: `passportEncrypted`, `saIdEncrypted`, `eftDetailsEncrypted`, `emergencyContacts` (jsonb, `camp-404/packages/db/src/schema.ts:279-282`), plus `dietary_requirements` and `driver_profiles`. Camp 404 has **no `privacy_flags` column anywhere** — this whole capability is greenfield and needs a migration.
- `packages/core/src/id-retention.ts` — the rule shape is edition-keyed (`RetentionEdition{id, endDate}`). Camp 404 has **no `editions` table**; it is single-burn. Collapse to a single `camp_settings`-derived event end date (or a `burn_end_date` on the singleton) and the rest of the module ports verbatim. `bioHasIdData` and `buildIdPurgePatch` need only column-name changes.
- `packages/core/src/account-sanitization.ts` — the plan/runner split, the three table lists, `uncoveredHardLockedFields` and `patchLeaksAny` all port. The *contents* of `SANITIZED_BIO_NULL_FIELDS`, `SANITIZATION_PRESERVED_TABLES` and `SANITIZATION_PURGED_TABLES` are donor tables. `SANITIZATION_IDENTITY_TABLES = ["session","account","user"]` is **Better-Auth-self-hosted-specific** — Camp 404 uses managed Neon Auth, where the upstream identity must be deleted through the provider (Camp 404's `DEFERRED.md:80-85` already records "delete the upstream Neon Auth identity manually on erasure" as an outstanding operator action). This is exactly the gap the donor's `identityTables` step closes for itself.
- `packages/core/src/account-security.ts` deletion half — `DeletionGuardContext.ledProjects` is group-keyed and `isOrgGod`/`orgGodCount` are the org tier. For Camp 404 these collapse to **one** guard: *the sole captain cannot self-delete* — which is precisely open issue **WP1 (#125)**, where `deleteOwnAccount` today permanently strands the camp because `/setup` latches shut after bootstrap (`camp-404/apps/web/app/profile/actions.ts:55`). The `DeletionBlock`/`DeletionWarning` shape (all blocks at once, each with a message the UI shows verbatim) ports unchanged.
- `apps/web/components/privacy-toggles.tsx` — one import to swap (`@quagga/core` → `@camp404/core`) and one CSS token (`border-success/40 bg-success/15 text-success` — Camp 404 has `--color-success` and `--color-success-foreground`, so it compiles).

### HEAVY ADAPT — coupled to the org tier
- `packages/core/src/medical-access.ts` — **`MedicalAccessContext.actorOrgPersonalInformation` is the org-roles-v1 resolver's answer**, and `actorOrgRole: MembershipRole` is the `god|org_staff|lead|admin|member|engineer` enum. The *predicate structure* is what to steal: self → yes; a named safety tier → yes; otherwise **set intersection between the actor's lead scopes and the subject's scopes**. In Camp 404 that collapses to: self → yes; `captain` → yes; a **team lead** whose `team_memberships.is_lead` team intersects the subject's teams → yes; plain member → no. The basis enum becomes `"self" | "captain" | "team_lead"`.
- `apps/web/lib/medical-access.ts` — the context-assembly half is entirely group/org queries. The *pattern* (authorise → decrypt → `after()` audit → return `{visible, notes, unreadable}`) is the portable part.
- `apps/org/lib/medical-audit.ts` — `canReadMedicalAccessLog(actor)` calls `canReadPersonalInformationIn(actor, "audit")` over the 8-key hardcoded org domain list. For Camp 404 this becomes `rank === "captain"`. The *reasoning* — a list of view-rows is a disclosure census, so withhold the panel whole rather than redacting a column — is fully portable, and Camp 404 has a completely unused `audit_log` table (`camp-404/packages/db/src/schema.ts:1180`) waiting for exactly this.
- `apps/org/lib/queries.ts:1402–1445` `getRosterMemberDetail` — group/edition keyed. The **authorise-before-select** trick (spread the column into the select object only when permitted) is the reusable part and is one line.

### LEAVE BEHIND
- Everything keyed on `editions` as "the root namespace" — `burner_bios` is user × edition, so the retention rule, the sanitization bio patch ("one row per edition") and the medical resolver's `editionId` parameter all carry a dimension Camp 404 does not have.
- `apps/suppliers` entirely, and the supplier-specific `DeletionWarning` codes.
- The `groups` indirection in `buildDeletionGuardContext`.
- The Better Auth `session`/`account`/`user` hard-delete step, as written.

### Camp 404's own baseline (what already exists, for orientation only)
- `camp-404/packages/db/src/crypto.ts` — identical minus `decryptField`.
- `camp-404/packages/db/src/id-documents.ts` (50 lines) — `ID_NUMBER_KEY = "id.number"`, `ID_TYPE_KEY = "id.type"`, `splitIdNumber`, `mergeIdNumber`, `idColumnsFor`. This is Camp 404's *own* asset with no donor counterpart, and `idColumnsFor` already implements the "switching document type moves the value rather than orphaning ciphertext" idea — but **without** the donor's unreadable-preservation guard.
- `camp-404/packages/db/src/account.ts` (130 lines) — `lostCatName(n) = "Lost Cat #N"`, `sanitisedUserPatch(userId, lostCatNumber, now)`, `sanitiseAccount(userId)`. Structural differences from the donor: (a) the patch **rewrites `authUserId` to `deleted:${userId}`** — exactly the re-animation hole the donor documents and rejects (`account-sanitization.ts:41–53`); (b) it **hard-deletes** 12 child tables rather than patching them; (c) it scrubs `reimbursements.accountDetailsEncrypted` to `""` (NOT NULL); (d) there is **no grace period, no request table, no audit row, no eligibility guard, no email, no sweeper**; (e) it is a hard no-op under `E2E_TEST_MODE` (`camp-404/apps/web/lib/account.ts:16`).
- `camp-404/apps/web/lib/env.ts` — `assertServerEnv` requires `PGCRYPTO_KEY` ≥16 chars at boot via `instrumentation.ts`, skipped under `E2E_TEST_MODE`. This is *stricter at boot* than the donor, which degrades gracefully instead. Both postures are defensible; the donor's per-write "refuse, don't drop" (C10) is the finer-grained version.

---

## 10. Verbatim excerpts — the five most valuable pieces

### 10.1 `decryptField` — the tri-state read (`packages/db/src/crypto.ts:66–113`)

The single highest-value addition for Camp 404. Copy it into `camp-404/packages/db/src/crypto.ts` unchanged.

```ts
/** Decrypt-or-null helper for nullable stored columns.
 *
 * COLLAPSES TWO DIFFERENT FACTS INTO `null`: "nothing was stored" and "something
 * was stored but could not be read". That is fine for an ID document, where the
 * page shows a field as absent either way. It is NOT fine for medical notes,
 * where `null` renders as the affirmative "no medical notes on file" — a
 * reassurance that must never be produced by a failed decrypt. Safety-critical
 * columns use `decryptField` below. */
export function decryptOrNull(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

/**
 * The three genuinely distinct outcomes of reading an encrypted column.
 *
 * `unreadable` is the one that matters: ciphertext is present but this process
 * cannot decrypt it — a wrong or rotated PGCRYPTO_KEY, or a pre-encryption
 * plaintext row. Callers on a safety path MUST surface it as "we cannot read
 * this", never as "there is nothing here".
 */
export type DecryptedField =
  | { state: "empty"; value: null }
  | { state: "ok"; value: string }
  | { state: "unreadable"; value: null };

const EMPTY_FIELD: DecryptedField = { state: "empty", value: null };

/** Decrypt a nullable column, distinguishing absent from unreadable. */
export function decryptField(
  stored: string | null | undefined,
): DecryptedField {
  if (!stored) return EMPTY_FIELD;
  try {
    return { state: "ok", value: decrypt(stored) };
  } catch {
    // Deliberately not logged with the ciphertext — this runs on a POPIA column.
    return { state: "unreadable", value: null };
  }
}
```

### 10.2 The privacy law — two classes, one derived union (`packages/core/src/privacy.ts:33–127`)

```ts
/**
 * Fields (as keyed in `burner_bios.privacy_flags`) that are ABSOLUTELY private
 * with no access path of any kind: id_number → `saId`, passport_number →
 * `passport`, `phone`, and both emergency contacts (on-site + off-site, each
 * split into name + phone).
 */
export const HARD_LOCKED_PRIVATE_FIELDS = [
  "saId",
  "passport",
  "phone",
  "onsiteContactName",
  "onsiteContactPhone",
  "offsiteContactName",
  "offsiteContactPhone",
] as const;

export const SAFETY_VISIBLE_FIELDS = ["medical"] as const;

/**
 * The union of both classes: every field that can NEVER be made public,
 * whichever class it belongs to. This is what the public-projection gate and the
 * flag-enforcement helpers iterate — so adding either class to a public view is
 * impossible by construction.
 */
export const ALWAYS_PRIVATE_FIELDS = [
  ...HARD_LOCKED_PRIVATE_FIELDS,
  ...SAFETY_VISIBLE_FIELDS,
] as const;

/** True when a field is allowed to be made public at all. */
export function canBePublic(field: string): boolean {
  return !isAlwaysPrivate(field);
}

/**
 * Coerce a privacy-flags map to a safe state: every always-private field (both
 * classes) is forced to `false` (private) regardless of what the caller
 * supplied. This is the last line before persistence — call it on every write of
 * `privacy_flags`. Safety-visible fields are forced private too: their audience
 * is decided at read time by the authz predicate, never by a stored "public" flag.
 */
export function enforcePrivacyFlags(
  flags: Record<string, boolean>,
): Record<string, boolean> {
  const safe: Record<string, boolean> = { ...flags };
  for (const field of ALWAYS_PRIVATE_FIELDS) {
    safe[field] = false;
  }
  return safe;
}

/**
 * Return the always-private fields a caller illegally tried to set public. Empty
 * array ⇒ the input is already compliant. Use for a loud error at the boundary
 * before `enforcePrivacyFlags` silently corrects it.
 */
export function privacyViolations(
  flags: Record<string, boolean>,
): AlwaysPrivateField[] {
  return ALWAYS_PRIVATE_FIELDS.filter((field) => flags[field] === true);
}
```

And the registry's self-enforcing tail, so the UI can never advertise a toggle the law forbids (`packages/core/src/bio.ts:267`):

```ts
].map((f) => ({ ...f, locked: ALWAYS_PRIVATE.has(f.key) || f.locked }));
```

with the double-gated projection (`bio.ts:363–366`):

```ts
  const show = (key: string): boolean =>
    canBePublic(key) && privacyFlags[key] === true;
```

### 10.3 Encrypt-or-preserve — never destroy ciphertext you merely could not read (`apps/web/lib/bio-store.ts:308–366`)

```ts
  // NEVER DESTROY CIPHERTEXT WE MERELY COULD NOT READ.
  //
  // `getBio` populates this form through `decryptOrNull`, which yields null both
  // when a field is genuinely empty AND when the stored ciphertext cannot be
  // decrypted (wrong or rotated PGCRYPTO_KEY, or a pre-encryption row). So a
  // burner whose medical notes were written under a different key opens their
  // profile, sees an empty medical box, changes their home city, saves — and the
  // save wrote null over ciphertext nobody could read but which was still the
  // only copy. Irreversible loss of the exact field a medic needs.
  //
  // The distinction that makes this safe: an empty incoming value is a
  // DELIBERATE CLEAR only when the form actually showed the old value. If the
  // stored value was unreadable, the form showed nothing, so "empty" carries no
  // intent and the ciphertext is preserved untouched. A readable value cleared
  // to empty still clears, as it must.
  const [priorRow] = await db()
    .select({
      medicalNotes: schema.burnerBios.medicalNotes,
      saIdEncrypted: schema.burnerBios.saIdEncrypted,
      passportEncrypted: schema.burnerBios.passportEncrypted,
    })
    .from(schema.burnerBios)
    .where(/* user × edition */)
    .limit(1);

  /** Encrypt the incoming value, or keep unreadable stored ciphertext intact. */
  function encryptOrPreserve(
    incoming: string | null,
    stored: string | null | undefined,
  ): string | null {
    const next = safeEncrypt(incoming);
    if (next !== null) return next;
    return decryptField(stored).state === "unreadable"
      ? (stored ?? null)
      : null;
  }

  const saIdEncrypted =
    fields.idType === "sa_id"
      ? encryptOrPreserve(fields.idNumber, priorRow?.saIdEncrypted)
      : // Switching document type must not silently strip the other one's
        // unreadable ciphertext either.
        decryptField(priorRow?.saIdEncrypted).state === "unreadable"
        ? (priorRow?.saIdEncrypted ?? null)
        : null;
```

Together with the refuse-don't-drop guard immediately above it (`bio-store.ts:288–306`):

```ts
  const carriesSensitive = Boolean(
    fields.medicalNotes || (fields.idNumber && fields.idType),
  );
  if (carriesSensitive && !isCryptoConfigured()) {
    throw new Error(
      "This site can't store medical notes or ID documents right now — its " +
        "encryption key isn't configured. Nothing was saved. Tell an organiser " +
        "(PGCRYPTO_KEY is missing); the rest of your bio will save once you " +
        "clear those fields.",
    );
  }
```

### 10.4 The sanitization plan — erase the person, keep the shape (`packages/core/src/account-sanitization.ts:1–19, 167–215`)

```ts
// Account sanitization — the Camp 404 "Lost Cat" precedent.
//
// docs/accounts-security-spec.md §Deletion: deleting an account is NEVER a row
// delete. After the 14-day grace period we ERASE the person and KEEP the shape:
// every personal field is nulled or replaced with a stub, while `memberships`,
// `questionnaire_responses`, `required_actions`, `supplier_document_acks` and
// `audit_events` keep pointing at a row that still exists. POPIA erasure is
// satisfied (no personal information remains) without shredding a camp's roster,
// an edition's response set, or the audit trail that proves who did what.
//
// Why not `ON DELETE CASCADE`? Because the cascade is exactly the damage: a
// burner leaving would silently delete their camp's membership history, their
// answers to a questionnaire the org is still analysing, and the audit events
// recording approvals they made as a lead. Referential integrity is a safety
// property here, not a database nicety.
//
// This module is PURE: it computes the patches to apply. The app performs the
// writes. Keeping it pure is what lets the tests prove — without a database —
// that no personal field survives and no foreign key is touched.

export const SANITIZATION_PRESERVED_TABLES = [
  "memberships",
  "member_role_assignments",
  "questionnaire_responses",
  "required_actions",
  "audit_events",
  "supplier_document_acks",
  "supplier_declarations",
  "registrations",
  "section_reviews",
  "notifications",
] as const;

export const SANITIZATION_PURGED_TABLES = [
  "profile_keys",
  "email_change_requests",
  "security_events",
] as const;

export const SANITIZATION_IDENTITY_TABLES = [
  "session",
  "account",
  "user",
] as const;
```

And the resurrection guard plus its rationale for keeping `authUserId` (`account-sanitization.ts:39–53, 274–294`) — this is the direct correction of Camp 404's current `authUserId: \`deleted:${userId}\`` rewrite:

```ts
 * `authUserId` is DELIBERATELY LEFT UNCHANGED. It is the key the session
 * resolvers look the row up by … so the tombstone MUST stay findable by that id
 * or the guard can never fire: an earlier design rewrote it to `deleted:<uuid>`,
 * which meant a returning session … looked up by the real id found NOTHING and
 * was silently minted a fresh, clean account — the "Lost Cat" re-animation hole.

export function isSanitized(user: { sanitizedAt?: Date | null }): boolean {
  return user.sanitizedAt != null;
}

/**
 * The resurrection guard. A sanitized account must never be handed back a
 * session: its memberships and roles survive for integrity, so re-adopting the
 * row would hand a stranger (or the same person, post-erasure) a camp lead's
 * permissions. Call it wherever a session is resolved.
 */
export function assertNotSanitized(user: {
  sanitizedAt?: Date | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!isSanitized(user)) return { ok: true };
  return {
    ok: false,
    reason:
      "This account was deleted. If that wasn't you, contact AfrikaBurn — we can't restore it from here.",
  };
}
```

### 10.5 The retention rule — POPIA storage limitation as a pure function (`packages/core/src/id-retention.ts:34–121`)

```ts
/**
 * Days AFTER an edition's end date before its ID data is purgeable. A small,
 * bounded grace: the gate is the purpose, but late arrivals, gate disputes and
 * access reconciliation can run a few weeks past the closing date. After this
 * window the data has no remaining lawful purpose and is purged.
 */
export const ID_RETENTION_GRACE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The instant an edition's ID data becomes purgeable: end of its `endDate` plus
 * the grace window. Uses the end of the end-date day (UTC) so an edition is never
 * treated as expired on its final day.
 */
export function idRetentionExpiresAt(
  edition: RetentionEdition,
  graceDays: number = ID_RETENTION_GRACE_DAYS,
): Date {
  // Parse the ISO date as UTC midnight, advance to the END of that day, then add
  // the grace window. `new Date("YYYY-MM-DD")` is parsed as UTC by spec.
  const endOfDay = new Date(`${edition.endDate}T23:59:59.999Z`).getTime();
  return new Date(endOfDay + graceDays * MS_PER_DAY);
}

/**
 * Whether an edition's ID retention window has elapsed as of `now` (i.e. its ID
 * data is purgeable). False for a malformed end date — never purge on ambiguous
 * input.
 */
export function isIdRetentionExpired(
  edition: RetentionEdition,
  now: Date,
  graceDays: number = ID_RETENTION_GRACE_DAYS,
): boolean {
  const expiresAt = idRetentionExpiresAt(edition, graceDays).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return now.getTime() > expiresAt;
}

/**
 * Identify the bios whose ID data is purgeable … An edition present in `bios`
 * but absent from `editions` is treated as UNKNOWN and its bios are left alone
 * (never purge without a confirmed expired edition).
 */
export function identifyPurgeableIdBios(input: {
  now: Date;
  editions: readonly RetentionEdition[];
  bios: readonly RetentionBio[];
  graceDays?: number;
}): PurgeableIdBio[] {
  const graceDays = input.graceDays ?? ID_RETENTION_GRACE_DAYS;
  const expiredEditionIds = new Set(
    input.editions
      .filter((e) => isIdRetentionExpired(e, input.now, graceDays))
      .map((e) => e.id),
  );

  return input.bios
    .filter((b) => expiredEditionIds.has(b.editionId) && bioHasIdData(b))
    .map((b) => ({ bioId: b.id, editionId: b.editionId }));
}
```

### 10.6 Bonus — the audit-log census argument (`apps/org/lib/medical-audit.ts:72–93`)

Short enough to quote whole, and the subtlest privacy reasoning in the donor.

```ts
/**
 * Whether this actor may read the medical-access log AT ALL.
 *
 * A `bio.medical.view` row is only ever written when the subject HAS notes
 * (… writes it inside `if (medicalNotes …)`), so a named list of these rows is a
 * census of which burners have disclosed a health condition — the exact bulk
 * exposure the member roster refuses to carry, arriving by the back door. It is
 * therefore personal information in its own right, and an actor who may not read
 * personal information may not read this panel. Redacting the actor column would
 * not help: the leak is the SUBJECT list.
 */
export function canReadMedicalAccessLog(actor: OrgActor): boolean {
  return canReadPersonalInformationIn(actor, "audit");
}
```

---

## 11. Notable engineering practices worth stealing even where the code is not

1. **Plan / runner split.** The *decision* about what to erase is a pure function in `@quagga/core`; the *writes* live in the app. That is what lets a DB-free unit test prove "no personal field survives and no foreign key is touched" (`account-sanitization.ts:17–19`).
2. **Table lists as data, not as code paths.** `SANITIZATION_PRESERVED_TABLES` / `PURGED_TABLES` / `IDENTITY_TABLES` make intent testable and reviewable (`account-sanitization.ts:161–215`).
3. **Completeness provers.** `uncoveredHardLockedFields` fails the build when someone adds a privacy class and forgets the erasure path; `patchLeaksAny` proves no personal value survives (`account-sanitization.ts:296–351`).
4. **Derive the UI's `locked` flag from the law**, never hand-maintain it (`bio.ts:267`); assert the two lists are equal in a test (`bio.test.ts:37–38`).
5. **Coverage ratchets pinned per file at 100% on the privacy/safety core**, with the explicit instruction never to lower one (`packages/core/vitest.config.ts`).
6. **Source-text regression tests** where a runtime test is impossible (`server-only` + DB). `roster-privacy.test.ts` parses `queries.ts` and asserts the *order* of two identifiers in a page file, catching a re-introduced leak in review rather than in production.
7. **Schema invariants as tests.** Pin the `*_encrypted` column set, its type, its nullability, and the absence of a plaintext sibling — *"adding a third `*_encrypted` column without wiring it through `encrypt`/`decryptField` passes lint, typecheck, build and every other test in the repo — and only surfaces as plaintext personal information in a live database"* (`schema-invariants.test.ts:47–52`).
8. **Guard against vacuous suites.** `expect(TABLES.length).toBeGreaterThan(30)` before any loop-based assertion (`schema-invariants.test.ts:38–44`); the donor's `AGENTS.md:216–259` names two more shapes of test that pass for the wrong reason.
9. **Fail closed on the destructive path, fail open on the emergency path.** The sweeper refuses to run without a secret; the medical audit write never blocks a read. Both are stated as deliberate trades in the code.
10. **Ordering invariants written in prose at the top of the function**, then implemented below — see `account-sanitize.ts:25–57`.
11. **Capture-before-erase.** The farewell address and `authUserId` are read *before* the transaction, because afterwards they are gone (`account-sanitize.ts:164–176`).
12. **Store, don't derive, a promised deadline** (`grace_ends_at`, `revocable_until`), so a policy change cannot retroactively shorten a window someone was already promised (`schema.ts:1898–1900`, `:1993`).
13. **Partial unique indexes for "one live X per user"** rather than a plain unique, so history survives and a second attempt is possible (`schema.ts:1942–1946`).
14. **Make the update its own concurrency guard** by putting the expected status in the WHERE (`packages/db/src/deletion.ts:120–130`).
15. **A failed background job must not look healthy.** Log each failure and answer non-2xx so the scheduler's alerting fires (`route.ts:74–99`).
16. **Probe, don't read back config.** The system panel reports whether a secret is set and how long it is, never its value; a unit test seeds every credential env var with a marker and asserts no marker survives into any rendered string (`apps/org/lib/system-status.ts:394–425`, `system-status.test.ts:35`).
17. **Honest copy as a hard rule.** *"Recognised and removed"*, never *"anonymised"* (`report-sanitize.ts:254–277`); *"Do not treat this as 'no medical notes'"* (`members/[userId]/page.tsx:181–190`).
18. **Single-source the consent sentence** so no surface can silently collect sensitive data without stating its audience (`MEDICAL_AUDIENCE_NOTE`, `bio.ts:145–157`).
19. **Comments that record the incident, not just the intent.** Almost every non-obvious branch in this subsystem carries the date, the person, and the failure it prevents. That is why this harvest could be digit-exact.

---

## 12. Known gaps in the donor (do not port the gap)

1. **The ID-retention purge job does not exist.** Only the pure rule + 13 tests. The donor says so itself at `docs/technical-spec.md:437–438` and `docs/accounts-security-spec.md:182–184`.
2. **No key rotation path.** One shared `PGCRYPTO_KEY` with a *static* scrypt salt means the key is fully determined by the env var; the donor's own review flags this and asks for versioned rotation (`docs/auth-platform-spec.md:290–292`, `:382–384`, `:487`).
3. **Nothing is watching for attacks** — no alerting on failed-login spikes (`docs/technical-spec.md:436–437`).
4. **`ACCOUNT_SWEEP_SECRET` and `CRON_SECRET` are read by real code but declared in neither `turbo.json` globalEnv nor `.env.example`** (`docs/simplification-audit.md:1218–1224`) — so the sweeper silently stays disabled on a fresh deploy.
5. **Phone and emergency contacts are hard-locked but stored plaintext.** The donor encrypted medical and ID only. If Camp 404 encrypts, `users.emergency_contacts` (jsonb, `camp-404/packages/db/src/schema.ts:279-282`) is the obvious next column — and WP5 (#129) wants that field surfaced to captains, which is precisely a `decryptField` + audit path.
6. **`decryptOrNull` is still used on the read path that populates the bio form** (`bio-store.ts:72, :96`), which is what made the ciphertext-preservation guard necessary in the first place. A cleaner design reads with `decryptField` throughout.
