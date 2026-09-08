# Unit 11 — Account + security UI surfaces (2FA, passkeys, sessions, re-auth, deletion)

HARVEST report. DONOR = `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app` (quagga-portal / AfrikaBurn Contributors App). TARGET = `/home/ryan/repos/Personal/camp-404`.
All paths below are **donor-repo-relative** unless stated otherwise. Every claim is cited `path:line`.

---

## 1. Purpose

This subsystem is the donor's complete **account-management-and-security product**: everything a signed-in human can do to their own identity, separate from anything the product does with them. It spans five concerns:

1. **Second factors** — TOTP two-factor enrolment/management + WebAuthn passkeys, both as fully-drawn UI flows.
2. **Session hygiene** — an active-session list with per-session and "everywhere-else" revocation, plus an append-only `security_events` feed.
3. **Credential management** — change password (with an injected NIST-derived policy), forgot/reset password, a "sign-in methods" list with a last-method guard.
4. **Identity change** — a 48h-revocable email-change state machine the donor owns end-to-end (tokens hashed, provider-commit stamped separately from confirmation).
5. **Account deletion** — a 14-day grace period, three server-side anti-lockout guards, and a sweeper that **sanitizes rather than deletes** (the donor's own comment names this "the Camp 404 'Lost Cat' precedent", `packages/core/src/account-sanitization.ts:1`).

**Why it matters to Camp 404.** The target baseline records: *"NO auth-adjacent security surfaces exist… a repo-wide grep for `passkey|two-factor|twoFactor|2fa|totp|webauthn|session list|revoke session|security event` returns ZERO files."* Every surface in this unit is greenfield in Camp 404. Critically, the entire `packages/ui` account suite is **dependency-injected and provider-agnostic** — there is **not one runtime `better-auth` import in `packages/ui`** (verified: the only auth coupling is a locally-declared structural interface at `packages/ui/src/components/account-auth-client.ts:31-56`). Camp 404 supplies one object matching `AccountAuthClient` plus its own server actions and the UI works. Separately, `@quagga/core`'s `account-security.ts` and `account-sanitization.ts` are **pure, zero-I/O, zero-env** modules that map straight onto `@camp404/core`'s existing purity contract.

**One direction-of-flow note that matters here.** The donor's sanitization module explicitly credits Camp 404 (`account-sanitization.ts:1`, `:23-24`). Camp 404 already ships `packages/db/src/account.ts` + `apps/web/lib/account.ts:deleteAccount` with a `Lost Cat #N` stub and a written-but-partial deletion spec (`docs/superpowers/specs/2026-05-30-account-deletion-design.md`). So the deletion half of this unit is a **re-import of a Camp 404 pattern that grew a 14-day grace period, a guard system, a sweeper and 771 lines of tests in the donor** — not a net-new import.

---

## 2. File inventory (with line counts)

### 2.1 `packages/ui` — the shared, provider-agnostic account suite (1,980 lines across 11 files)

| File | Lines | Client? | Portability |
|---|---:|---|---|
| `packages/ui/src/components/account-auth-client.ts` | 64 | type-only | drop-in |
| `packages/ui/src/components/account-shell.tsx` | 99 | server-safe | light-adapt |
| `packages/ui/src/components/account-capability-notice.tsx` | 55 | server-safe | drop-in |
| `packages/ui/src/components/account-change-password.tsx` | 167 | `"use client"` | light-adapt |
| `packages/ui/src/components/account-sign-in-methods.tsx` | 227 | `"use client"` | light-adapt |
| `packages/ui/src/components/account-two-factor.tsx` | 618 | `"use client"` | drop-in |
| `packages/ui/src/components/account-two-factor-challenge.tsx` | 137 | `"use client"` | drop-in |
| `packages/ui/src/components/account-passkeys.tsx` | 275 | `"use client"` | drop-in |
| `packages/ui/src/components/account-sessions.tsx` | 163 | `"use client"` | drop-in |
| `packages/ui/src/components/account-security-events.tsx` | 94 | server-safe | drop-in |
| `packages/ui/src/components/account-delete-elsewhere.tsx` | 81 | server-safe | **skip** (three-app artefact) |

Supporting primitives these files import (already in donor `packages/ui`, some missing from Camp 404):
`field.tsx` 74 · `password-input.tsx` 141 · `skeleton.tsx` 204 · `badge.tsx` 36 · `empty-state.tsx` 52 · `switch.tsx` 109 · `toast.tsx` 164 · `card.tsx` 85 · `input.tsx` 23 · `button.tsx` 57.

### 2.2 `packages/core` — the pure rules (930 lines across 4 files)

| File | Lines | Purity | Portability |
|---|---:|---|---|
| `packages/core/src/account-security.ts` | 546 | pure | drop-in *after cutting the org/group fields* |
| `packages/core/src/account-sanitization.ts` | 351 | pure | heavy-adapt (donor column names) |
| `packages/core/src/auth-capabilities.ts` | 269 | pure | light-adapt (pattern is the value) |
| `packages/core/src/security-events.ts` | 33 | pure | drop-in |
| `packages/core/src/security-notifications.ts` | 334 | pure | light-adapt (copy is AfrikaBurn-branded) |

### 2.3 `packages/auth` — reusable flow shapes (provider wiring in `config.ts` intentionally skipped)

| File | Lines | Notes |
|---|---:|---|
| `packages/auth/src/account.ts` | 525 | **the read side** — sessions, passkeys, 2FA flag, linked accounts, security log, `parseSetCookies`. Framework-free by design (`account.ts:19-22`). |
| `packages/auth/src/reauth.ts` | 31 | `AsyncLocalStorage` re-auth marker. Tiny, brilliant, drop-in. |
| `packages/auth/src/email.ts` | 163 | env-less Resend seam + `AuthEmailKind` envelope builder. |
| `packages/auth/src/env.ts` | 330 | `AUTH_SESSION` constants, `resolveRateLimit`, config-warning list. Mostly donor-specific. |
| `packages/auth/src/index.ts` | 64 | barrel; documents the `auth.api.*` surface at `:22-26`. |
| `packages/auth/src/config.ts` | 289 | **out of scope by instruction** — but `:85-192` (hooks) and `:226-256` (plugin options) carry portable *decisions*, harvested below. |

### 2.4 `packages/db` — account-owned tables and helpers

| File | Lines | Notes |
|---|---:|---|
| `packages/db/src/deletion.ts` | 204 | `cancelPendingDeletion` — the "just sign in" promise, kept. |
| `packages/db/src/rate-limit.ts` | 153 | `consumeRateLimit` + `rateLimitIp` — a fixed-window limiter for **server actions**, which never meet an HTTP limiter. |
| `packages/db/src/schema.ts` (account slice) | `:186-198`, `:212-222`, `:358-502`, `:505-568`, `:1910-2047` | enums + identity + 2FA/passkey + deletion/email-change/security-events tables. |

### 2.5 `apps/web` — the participant app's implementation (2,352 lines across 20 files)

| File | Lines |
|---|---:|
| `apps/web/lib/account-actions.ts` | 1054 |
| `apps/web/lib/account-sanitize.ts` | 465 |
| `apps/web/lib/account.ts` | 397 |
| `apps/web/lib/account-tokens.ts` | 38 |
| `apps/web/app/api/account/deletion-sweep/route.ts` | 149 |
| `apps/web/app/(app)/account/page.tsx` | 212 |
| `apps/web/app/(app)/account/security/page.tsx` | 123 |
| `apps/web/app/(app)/account/security/events.ts` | 57 |
| `apps/web/app/(app)/account/delete/page.tsx` | 240 |
| `apps/web/app/(app)/account/delete/blocked-projects.ts` | 38 |
| `apps/web/app/(app)/account/loading.tsx` | 39 |
| `apps/web/app/(app)/account/error.tsx` | 22 |
| `apps/web/components/account/account-shell.tsx` | 57 |
| `apps/web/components/account/capability-notice.tsx` | 32 |
| `apps/web/components/account/delete-account-form.tsx` | 181 |
| `apps/web/components/account/forgot-password-form.tsx` | 116 |
| `apps/web/components/account/reset-password-form.tsx` | 118 |
| `apps/web/components/account/security-factors.tsx` | 43 |
| `apps/web/components/account/session-list.tsx` | 26 |
| `apps/web/components/account/sign-in-methods.tsx` | 43 |

### 2.6 `apps/org` + `apps/suppliers` — the fork (the thing NOT to port)

`apps/org/lib/account.ts` 212 · `apps/org/lib/actions/account.ts` 215 · `apps/org/components/account/account-clients.tsx` 100 · `apps/org/components/account/account-shell.tsx` 55 · `apps/org/app/(account)/{layout,account/page,account/security/page,account/delete/page}.tsx` (197 for the manage page) — mirrored almost exactly by `apps/suppliers/…` (134 / 213 / 97 / 54 / 191). **Measured diff:** `apps/org/components/account/account-clients.tsx` vs `apps/suppliers/…` differ in exactly **two comment hunks** (`console`→`portal` wording, plus three deleted comment lines). Camp 404 is one app; take the `apps/web` variant only.

### 2.7 Tests (5,829 lines)

| File | Lines |
|---|---:|
| `packages/core/src/__tests__/account-security.test.ts` | 538 |
| `packages/core/src/__tests__/account-sanitization.test.ts` | 254 |
| `packages/core/src/__tests__/security-notifications.test.ts` | 187 |
| `packages/core/src/__tests__/auth-capabilities.test.ts` | 102 |
| `packages/core/src/__tests__/security-events.test.ts` | 23 |
| `packages/auth/src/__tests__/account-reads.test.ts` | 585 |
| `packages/auth/src/__tests__/env.test.ts` | 325 |
| `packages/auth/src/__tests__/auth-email.test.ts` | 264 |
| `packages/auth/src/__tests__/auth-hooks.test.ts` | 247 |
| `packages/auth/src/__tests__/set-cookies.test.ts` | 171 |
| `packages/auth/src/__tests__/account-display.test.ts` | 140 |
| `packages/auth/src/__tests__/deletion-hook.test.ts` | 107 |
| `apps/web/lib/__tests__/account-actions.test.ts` | 762 |
| `apps/web/lib/__tests__/account-sanitize-runner.test.ts` | 517 |
| `apps/web/lib/__tests__/account-deletion-context.test.ts` | 323 |
| `apps/org/lib/__tests__/account-surface.test.ts` | 535 |
| `apps/suppliers/lib/__tests__/account-actions.test.ts` | 334 |
| `apps/suppliers/lib/__tests__/portal-account.test.ts` | 223 |
| `apps/org/lib/__tests__/account-access-actions.test.ts` | 192 |

E2E (Playwright, `e2e/` workspace): `e2e/specs/new-burner/account-management.spec.ts` 189 · `e2e/specs/new-burner/passkeys.spec.ts` 130 · `e2e/specs/new-burner/password-reset.spec.ts` 90 · `e2e/specs/god/god-sole-god-cannot-self-delete.spec.ts` 78 · `e2e/specs/org-staff/account-suite.spec.ts` 182 · `e2e/specs/supplier/account-suite.spec.ts` 114.

---

## 3. Capability list (exhaustive, cited)

### Two-factor (TOTP)
- **Enrolment wizard, 4 steps**: turn on → confirm password (if the account has one) → scan QR / copy grouped setup key → verify 6-digit code → backup codes shown ONCE (`account-two-factor.tsx:34-38`).
- **QR rendering** via `react-qr-code`, `size={160}` on a white card (`account-two-factor.tsx:352-354`).
- **Manual setup key** extracted from the `otpauth://` URI's `secret` query param (`secretFromTotpUri`, `:43-50`) and grouped into 4-char blocks (`groupSecret`, `:53-55`) so it can be typed without errors.
- **Code input hardening**: `inputMode="numeric"`, `autoComplete="one-time-code"`, `pattern="[0-9]*"`, `maxLength={6}`, and an onChange that strips non-digits and slices to 6 (`:372-384`). Submit is disabled unless `code.length === 6` (`:395`).
- **Backup codes** rendered in a 2-column grid, copy + download + "I've saved them" (`:422-465`).
- **Copy that tells the truth** — `copyCodes` awaits `navigator.clipboard.writeText` and on failure shows an error and *leaves the codes on screen* (`:166-179`). The 14-line comment at `:151-165` records the incident: the old fire-and-forget flipped to "Copied ✓" unconditionally, the user pressed "I've saved them", and ten codes were gone forever.
- **Download** builds a `text/plain` Blob with a two-line header and one code per line, filename `afrikaburn-backup-codes.txt` (`:181-196`).
- **Manage when ON**: "Regenerate backup codes" (replaces the old set, `:216-240`) and "Turn off" (`:198-214`), each behind a password field when `requiresPassword`.
- **Regenerate reuses the backup panel with `totpUri` set to null** so no misleading QR appears (`:238`).
- **Sign-in second-factor challenge** with two routes through — 6-digit TOTP or a one-time backup code, switchable via a link ("Lost your authenticator? Use a backup code", `account-two-factor-challenge.tsx:126-134`), plus a "Trust this device for 30 days" checkbox (`:102-110`).

### Passkeys (WebAuthn)
- **List** with per-passkey name, a `deviceType` label mapping `"multiDevice"→"Synced"` / `"singleDevice"→"This device"` / else `"Passkey"`, and an `en-ZA` "added" date (`account-passkeys.tsx:169-177`, `formatDate` `:47-56`).
- **Add** with an optional name field (`maxLength={64}`, placeholder "My phone", `:205-212`); triggers the browser WebAuthn prompt.
- **Remove**, per-row, with a `busyId` spinner state (`:113-125`, `:180-188`).
- **Support detection is deferred to `useEffect`** — `supported` starts `null` and no verdict is rendered until the browser has actually been asked (`:82-85`). The 16-line comment at `:69-81` records why: the previous render-time check made the SSR HTML say "This browser doesn't support passkeys" to every visitor and caused a hydration mismatch.
- **Recovery honesty banner**: "A passkey is a faster way in, not your only one — your password stays active, so losing a device never locks you out." (`:267-271`).
- **Badge** shows `${n} set up` or `"None yet"` (`:145-147`).

### Sessions
- **Server-rendered list** with a device label, IP, relative "last seen", and a "This device" badge (`account-sessions.tsx:119-159`).
- **`relative()` formatter**: `<2 min → "Active now"`, `<60 min → "N minutes ago"`, `<24 h → "N hour(s) ago"`, else `"N day(s) ago"`; null/NaN → `"Last seen unknown"` (`:37-48`).
- **Two honest departures from the design mock**, both documented at `:15-21`: (1) show the IP, never a guessed city — *"an invented city is a security lie"*; (2) "Sign out everywhere **else**" keeps the current device signed in.
- **Revoke one** and **revoke others**, both injected as props (`onRevoke` / `onRevokeOthers`), both toasting the result (`:65-91`).
- **Empty state is not "nothing is signed in"** — it says *"We couldn't read your active sessions right now. That means the list is unavailable, not that nothing is signed in"* (`:112-117`).
- **`deviceLabel(userAgent)`** — coarse `${browser} on ${os}`, with the ordering caveat "Edge and Chrome both claim Safari" (`packages/auth/src/account.ts:367-392`).

### Security-event feed
- **Append-only log** rendered newest-first with a title, an optional detail body and a date (`account-security-events.tsx:65-85`).
- **Titles are resolved in `@quagga/core`, never stored** — `describeSecurityEvent` (`packages/core/src/security-events.ts:31-33`), so a wording change never needs a migration (`security-events.ts:5-8`).
- **The feed names what it does NOT contain** — the `note` prop, passed in per app, states that new-device sign-in alerts are not switched on (`apps/web/app/(app)/account/security/page.tsx:109-119`). Rationale at `account-security-events.tsx:20-24`: *"a security log that quietly omits a category trains the reader to trust a completeness it does not have."*
- **Detail body composed from the captured request context**: `deviceLabel(userAgent) · ip`, joined with `" · "`, null when neither exists (`apps/web/app/(app)/account/security/events.ts:38-43`).

### Password
- **One field, no confirm-twice**, show/hide toggle, paste allowed, length-based strength (`account-change-password.tsx:15-16`, policy at `packages/core/src/account-security.ts:15-22`).
- **`PasswordInput`** — `Eye`/`EyeOff` toggle with a **deliberate absence of `tabIndex={-1}`**, with a 7-line comment recording that it used to have one and removed the only reveal control from the tab order on every password field in all three apps (`packages/ui/src/components/password-input.tsx:90-96`).
- **Strength meter** bands: 0 chars → score 0, `<min` → 1 "Too short", `<20` → 2 "Fair", `<30` → 3 "Good", else 4 "Strong"; bar colours `bg-destructive` / `bg-warning` / `bg-primary` / `bg-success` (`password-input.tsx:21-27`, `packages/ui/src/lib/form-logic.ts passwordStrength`).
- **"Sign out my other devices"** toggle, **defaulting to ON** (`account-change-password.tsx:63`), with the honest sub-label "Recommended. This device stays signed in."
- **The policy is injected, not imported** — `assess` is a prop, so `@quagga/ui` cannot become a second, drifting definition of a good password (`:17-22`).
- **`idPrefix`** so two change-password forms can coexist on one page (`:58-59`).
- **Forgot password**: renders the confirmation **in place of the form rather than redirecting**, because a success-only redirect is itself an enumeration oracle (`apps/web/components/account/forgot-password-form.tsx:15-20`).
- **Reset password**: split so the form only exists with a token in hand — a missing token is a different screen, not a disabled state (`apps/web/components/account/reset-password-form.tsx:22-23`, `MissingToken` `:30-45`).

### Sign-in methods
- Three rows: **Password** (Active/Not set + "Change" toggle inlining the change form), **Google** (Connected/Not connected + a disabled "Unlink"), **Passkeys** (link to the Security page) — `account-sign-in-methods.tsx:112-217`.
- **"We don't record when it last changed"** — the password row shows the date the credential was *added* and says so explicitly (`:132`).
- **First-password is refused honestly**, not offered as a form that would always fail: *"our sign-in provider only exposes a 'change password' step, which needs a password to start from"* (`:138-143`, rationale `:19-22`).
- **Last-method note** switches copy at `methodCount <= 1` (`:108`, `:220-222`).

### Capability probe
- `AUTH_CAPABILITIES` is a 12-key machine-readable matrix (`packages/core/src/auth-capabilities.ts:103-216`), each entry carrying `key`, `support`, `method`, `reason`, optional `userMessage`, optional `pending` + `pendingMessage`.
- **`support` ≠ finished.** The `pending` flag exists because `emailChange` and `unlinkAccount` are both `supported` at the provider and both ship as permanently disabled buttons; without the flag the tooltip read `cap.userMessage`, which is `undefined` on a supported capability, so *"the control offered NO explanation at all"* (`:40-53`).
- `capabilityVerdict(cap)` returns `{ label: null }` when there is nothing to say, `"Not finished yet"` for supported-but-pending, and `"Not available yet"` otherwise (`:88-97`).
- `assertCapability(key)` is the **fail-closed** server gate (`:257-269`).

### Deletion
- **Consequence columns rendered from the actual sanitization plan**, not marketing copy — `apps/web/app/(app)/account/delete/page.tsx:29-32` states the two lists are `buildBioSanitizationPatch` + `SANITIZATION_PRESERVED_TABLES` written out in words. Literal lists at `:40-53`.
- **Two confirmation shapes**: password re-auth, or (for a Google-only account) typing your own email address (`delete-account-form.tsx:17-26`). The 3-line comment records that until 27 Jul 2026 only the first existed, so *POPIA erasure was unreachable* for every Google-only burner.
- **Three server-side blocks**, all returned at once: sole camp lead, sole org god, no sign-in method (`packages/core/src/account-security.ts:339-409`).
- **Three warnings** (not blocks): org access revoked, supplier listing released, supplier onboarding in flight (`:376-406`).
- **Blocked-project deep links** — the block carries only `groupIds` (core is pure), so the page resolves ids → slug for a "Transfer leadership · {name}" button (`blocked-projects.ts:8-13`, page `:179-195`).
- **Cancel button uses TWO transitions** — one for the action, one for `router.refresh()` called *synchronously* inside it, because `router.refresh()` only keeps a transition pending when called synchronously; the previous single-transition version made the button go idle while the grace banner was still on screen (`delete-account-form.tsx:145-181`, comment `:148-155`).
- **Sweeper route** at `POST|GET /api/account/deletion-sweep`, cron-scheduled `0 3 * * *` (`apps/web/vercel.json`).

---

## 4. Data model (verbatim)

### 4.1 Enums

```ts
// packages/db/src/schema.ts:186
export const accountDeletionStatusEnum = pgEnum("account_deletion_status", [
  "pending",
  "cancelled",
  "completed",
]);

// packages/db/src/schema.ts:192
export const emailChangeStatusEnum = pgEnum("email_change_status", [
  "pending",
  "confirmed",
  "revoked",
  "expired",
  "cancelled",
]);

// packages/db/src/schema.ts:212
export const securityEventKindEnum = pgEnum("security_event_kind", [
  "password_changed",
  "password_reset_completed",
  "session_revoked",
  "sessions_revoked_others",
  "email_change_requested",
  "email_change_confirmed",
  "email_change_revoked",
  "deletion_requested",
  "deletion_cancelled",
]);
```

Zod mirrors in `packages/types/src/accounts.ts` (133 lines total):
- `AccountDeletionStatus` `:27-31` — same 3 members.
- `EmailChangeStatus` `:44-50` — same 5 members.
- `AuthCapabilityKey` `:58-71` — **12 members**: `passwordChange, passwordReset, emailVerification, sessionList, sessionRevoke, emailChange, accountDeletion, linkedAccounts, unlinkAccount, twoFactor, backupCodes, passkeys`.
- `AuthCapabilitySupport` `:86-90` — `supported | client_only | unavailable` (`client_only` is retained-for-history and unused, `:78-81`).
- `SecurityEventKind` `:98-109` — **10 members** for OUTBOUND notifications: `password_changed, password_reset_completed, email_change_requested, email_change_completed, email_change_revoked, new_device_sign_in, session_revoked, deletion_requested, deletion_cancelled, deletion_completed`.
- `SecurityEventLogKind` `:122-132` — **9 members** for the LOG (note: no `new_device_sign_in`, no `email_change_completed`, no `deletion_completed`; but it HAS `sessions_revoked_others` and `email_change_confirmed`). **These two enums are deliberately different and are a real trap for a porter.**

### 4.2 `account_deletion_requests` (`schema.ts:1910-1948`)

```ts
id: uuid("id").defaultRandom().primaryKey(),
userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
status: accountDeletionStatusEnum("status").notNull().default("pending"),
requestedAt: timestamp("requested_at", { mode: "date" }).notNull().defaultNow(),
graceEndsAt: timestamp("grace_ends_at", { mode: "date" }).notNull(),
cancelledAt: timestamp("cancelled_at", { mode: "date" }),
completedAt: timestamp("completed_at", { mode: "date" }),
requestedFromApp: text("requested_from_app"),   // `web` | `org` | `suppliers` — trail only
createdAt, updatedAt: timestamp(..., { mode: "date" }).notNull().defaultNow(),
```
Indexes: `account_deletion_requests_user_status_idx (user_id, status)`; `account_deletion_requests_due_idx (status, grace_ends_at)` — the sweeper's query; `account_deletion_requests_one_pending_idx` **partial unique** on `user_id` `WHERE status = 'pending'` (`:1943-1946`).

Two encoded decisions: `grace_ends_at` is **stored, not derived**, so a later policy change cannot retroactively shorten a window someone was promised (`:1902-1905`); the unique index is partial so a burner who cancels can request again (`:1906-1908`).

### 4.3 `email_change_requests` (`schema.ts:1970-2013`)

```ts
id: uuid("id").defaultRandom().primaryKey(),
userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
currentEmail: text("current_email").notNull(),
newEmail: text("new_email").notNull(),
status: emailChangeStatusEnum("status").notNull().default("pending"),
confirmTokenHash: text("confirm_token_hash").notNull().unique(),   // SHA-256
revokeTokenHash: text("revoke_token_hash").notNull().unique(),     // SHA-256
expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
confirmedAt: timestamp("confirmed_at", { mode: "date" }),
revocableUntil: timestamp("revocable_until", { mode: "date" }),    // confirmedAt + 48h, STORED
revokedAt: timestamp("revoked_at", { mode: "date" }),
providerCommittedAt: timestamp("provider_committed_at", { mode: "date" }),
createdAt, updatedAt,
```
Indexes: `email_change_requests_user_status_idx (user_id, status)`; `email_change_requests_one_pending_idx` **partial unique** on `user_id` `WHERE status = 'pending'` — confirmed rows excluded so the 48h revocation history survives (`:2008-2011`).

**`providerCommittedAt` is the honesty field.** `:1994-1998`: *"Null on a `confirmed` row means the provider commit has not happened… the app must never present that as success."*

### 4.4 `security_events` (`schema.ts:2026-2047`)

```ts
id: uuid("id").defaultRandom().primaryKey(),
userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
kind: securityEventKindEnum("kind").notNull(),
ip: text("ip"),
userAgent: text("user_agent"),
createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
```
Index: `security_events_user_created_idx (user_id, created_at DESC)`.
`ip`/`user_agent` are personal data, so this table is one of the **purged** tables at sanitization (`schema.ts:2018-2024`; `account-sanitization.ts:188-192`).

### 4.5 Better Auth identity tables (donor-owned, adapter-shaped)

- `user` (`schema.ts:358-375`): `id text PK, name text NOT NULL, email text NOT NULL UNIQUE, emailVerified boolean NOT NULL default false, image text, twoFactorEnabled boolean NOT NULL default false, createdAt, updatedAt`.
- `session` (`:377-397`): `id text PK, expiresAt, token text NOT NULL UNIQUE, createdAt, updatedAt, ipAddress text, userAgent text, userId text NOT NULL → user.id ON DELETE CASCADE`; index `session_user_id_idx`.
- `account` (`:399-428`): `id, accountId, providerId, userId → user.id CASCADE, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password text, createdAt, updatedAt`; index `account_user_id_idx`.
- `verification` (`:430-446`): `id, identifier, value, expiresAt, createdAt, updatedAt`; index `verification_identifier_idx`.
- `rateLimit` → physical table `rate_limit` (`:462-467`): `id text PK, key text NOT NULL UNIQUE, count integer NOT NULL, lastRequest bigint NOT NULL`.
- `actionRateLimit` → `action_rate_limit` (`:490-502`): `key text PK, count integer NOT NULL, windowStart bigint NOT NULL`; index `action_rate_limit_window_start_idx`.
- `twoFactor` → `two_factor` (`:518-537`): `id text PK, secret text NOT NULL, backupCodes text NOT NULL, userId text NOT NULL → user.id CASCADE, verified boolean NOT NULL default true, failedVerificationCount integer NOT NULL default 0, lockedUntil timestamp`; indexes `two_factor_user_id_idx`, `two_factor_secret_idx`.
- `passkey` (`:547-568`): `id text PK, name text, publicKey text NOT NULL, userId text NOT NULL → user.id CASCADE, credentialID text NOT NULL, counter integer NOT NULL, deviceType text NOT NULL, backedUp boolean NOT NULL, transports text, createdAt timestamp default now, aaguid text`; indexes `passkey_user_id_idx`, `passkey_credential_id_idx`.

**The two-table identity split is the load-bearing design decision** (`schema.ts:331-357`): Better Auth's `user` (text PK) sits *beside* the app's `users` (uuid PK), joined **logically only** by `users.auth_user_id` — **there is deliberately NO database foreign key** between them. That absence is exactly what makes "hard-delete the identity, keep the app row as a tombstone" possible. Camp 404 has the same shape (`users.auth_user_id` → Neon Auth), so this is directly applicable.

Migrations of record (`docs/accounts-security-spec.md:354-359`): **0011** (`users.sanitized_at`, deletion + email-change requests), **0013** (Better Auth tables brought in-house), **0014** (`security_events`), **0015** (2FA + backup codes + passkeys), **0024** (`action_rate_limit`).

---

## 5. Public API surface (verbatim signatures)

### `packages/ui/src/components/account-auth-client.ts`

```ts
export type ClientResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message?: string | undefined } | null };

export interface TwoFactorEnableData { totpURI: string; backupCodes: string[]; }
export interface BackupCodesData { backupCodes: string[]; status?: boolean; }

export interface AccountAuthClient {
  twoFactor: {
    enable(input: { password?: string }): Promise<ClientResult<TwoFactorEnableData>>;
    verifyTotp(input: { code: string; trustDevice?: boolean }): Promise<ClientResult<unknown>>;
    verifyBackupCode(input: { code: string; trustDevice?: boolean }): Promise<ClientResult<unknown>>;
    disable(input: { password?: string }): Promise<ClientResult<unknown>>;
    generateBackupCodes(input: { password?: string }): Promise<ClientResult<BackupCodesData>>;
  };
  passkey: {
    addPasskey(input?: { name?: string; authenticatorAttachment?: "platform" | "cross-platform" }): Promise<ClientResult<unknown>>;
    deletePasskey(input: { id: string }): Promise<ClientResult<unknown>>;
  };
}

export function clientErrorMessage(
  error: { message?: string | undefined } | null,
  fallback: string,
): string;
```
Note the comment at `:9-11`: methods are declared as **methods (bivariant)** on purpose, so the real (wider) client is assignable without `any`.

### `packages/ui` component props

```ts
// account-shell.tsx:21-50
export interface AccountSectionLink { key: string; label: string; href: string; }
export function AccountShell(props: {
  sections: readonly AccountSectionLink[]; active: string; title: string;
  description: string; eyebrow?: string; note?: React.ReactNode;
  footer?: React.ReactNode; children: React.ReactNode;
}): JSX.Element;

// account-capability-notice.tsx:22-38
export interface CapabilityVerdict { label: string | null; message: string; }
export function AccountCapabilityNotice(props: { verdict: CapabilityVerdict; className?: string }): JSX.Element | null;

// account-two-factor.tsx:59-71
export interface AccountTwoFactorProps {
  client: AccountAuthClient; enabled: boolean; requiresPassword: boolean; onChanged?: () => void;
}
export function AccountTwoFactor(props: AccountTwoFactorProps): JSX.Element;

// account-two-factor-challenge.tsx:21-25
export interface AccountTwoFactorChallengeProps { client: AccountAuthClient; onVerified: () => void; }

// account-passkeys.tsx:33-45
export interface PasskeyRow { id: string; name: string | null; deviceType: string | null; createdAt: string | null; }
export interface AccountPasskeysProps { client: AccountAuthClient; passkeys: PasskeyRow[]; onChanged?: () => void; }

// account-sessions.tsx:26-61
export interface SessionView { token: string; label: string; ipAddress: string | null; lastSeen: string | null; current: boolean; }
export type SessionActionResult = { ok: true; message?: string } | { ok: false; error: string };
export function AccountSessions(props: {
  sessions: SessionView[];
  onRevoke: (token: string) => Promise<SessionActionResult>;
  onRevokeOthers: () => Promise<SessionActionResult>;
  onChanged?: () => void;
}): JSX.Element;

// account-security-events.tsx:26-49
export interface SecurityEventRow { id: string; title: string; body: string | null; createdAt: Date; }
export function AccountSecurityEvents(props: {
  events: readonly SecurityEventRow[]; note?: React.ReactNode; emptyDescription?: string;
}): JSX.Element;

// account-change-password.tsx:30-60
export interface PasswordAssessment { ok: boolean; error?: string | null; }
export type ChangePasswordResult = { ok: true; message?: string } | { ok: false; error: string };
export function AccountChangePassword(props: {
  minLength: number;
  assess: (password: string) => PasswordAssessment;
  onSubmit: (input: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => Promise<ChangePasswordResult>;
  onDone?: () => void; onChanged?: () => void; idPrefix?: string;
}): JSX.Element;

// account-sign-in-methods.tsx:31-55
export interface SignInMethodsProps {
  hasPassword: boolean; passwordAddedAt: string | null;
  googleEmail: string | null; googleLinked: boolean; methodCount: number;
  securityHref: string; unlinkNotice: string; passwordMinLength: number;
  assessPassword: (password: string) => PasswordAssessment;
  onChangePassword: (input: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => Promise<ChangePasswordResult>;
  onChanged?: () => void;
}

// account-delete-elsewhere.tsx:33-42
export function AccountDeleteElsewhere(props: { href: string; consequences: React.ReactNode; linkLabel?: string }): JSX.Element;
```

### `packages/core/src/account-security.ts`

```ts
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 64;
export type PasswordStrength = "too_short" | "fair" | "good" | "strong";
export interface PasswordAssessment {
  ok: boolean; strength: PasswordStrength; length: number; remaining: number; error: string | null;
}
export function assessPassword(password: string): PasswordAssessment;

export type EnumerationSafeSurface = "sign_in" | "sign_up" | "forgot_password" | "email_change_request";
export const ENUMERATION_SAFE_MESSAGES: Readonly<Record<EnumerationSafeSurface, string>>;
export function enumerationSafeMessage(surface: EnumerationSafeSurface): string;
export function enumerationSafeResponse(surface: EnumerationSafeSurface, _accountExisted: boolean): { message: string };
export function leaksAccountExistence(message: string): boolean;

export const DELETION_GRACE_PERIOD_DAYS = 14;
export function deletionGraceEndsAt(requestedAt: Date): Date;
export interface DeletionRequestState {
  status: AccountDeletionStatus; requestedAt: Date; graceEndsAt: Date;
  cancelledAt?: Date | null; completedAt?: Date | null;
}
export type DeletionPhase = "none" | "grace" | "due" | "cancelled" | "sanitized";
export function deletionPhase(request: DeletionRequestState | null | undefined, now: Date): DeletionPhase;
export function deletionDaysRemaining(request: DeletionRequestState | null | undefined, now: Date): number;
export function canCancelDeletion(request: DeletionRequestState | null | undefined, now: Date): boolean;
export function isSanitizationDue(request: DeletionRequestState | null | undefined, now: Date): boolean;
export type DeletionTransition =
  | { ok: true; status: AccountDeletionStatus; at: Date }
  | { ok: false; reason: string };
export function cancelDeletionOnSignIn(request: DeletionRequestState | null | undefined, now: Date): DeletionTransition;

export interface LedProject { groupId: string; name: string; leadCount: number; }
export interface DeletionGuardContext {
  ledProjects: readonly LedProject[];
  isOrgGod: boolean; orgGodCount: number; signInMethodCount: number;
  hasInFlightSupplierOnboarding?: boolean; orgRole?: string | null; claimedSupplierName?: string | null;
}
export type DeletionBlockCode = "sole_camp_lead" | "sole_org_god" | "no_sign_in_method";
export interface DeletionBlock { code: DeletionBlockCode; message: string; groupIds?: string[]; }
export interface DeletionWarning {
  code: "supplier_onboarding_in_flight" | "org_access_revoked" | "supplier_listing_released";
  message: string;
}
export interface DeletionEligibility { ok: boolean; blocks: DeletionBlock[]; warnings: DeletionWarning[]; }
export function assessDeletionEligibility(ctx: DeletionGuardContext): DeletionEligibility;
export function canUnlinkSignInMethod(signInMethodCount: number): { ok: true } | { ok: false; reason: string };

export const EMAIL_CHANGE_CONFIRM_TTL_HOURS = 2;
export const EMAIL_CHANGE_REVOCATION_HOURS = 48;
export function emailChangeExpiresAt(requestedAt: Date): Date;
export function emailChangeRevocableUntil(confirmedAt: Date): Date;
export interface EmailChangeState {
  status: EmailChangeStatus; expiresAt: Date; confirmedAt?: Date | null;
  revocableUntil?: Date | null; revokedAt?: Date | null; providerCommittedAt?: Date | null;
}
export type EmailChangePhase = "none" | "awaiting_confirm" | "expired" | "revocable" | "settled" | "revoked" | "cancelled";
export function emailChangePhase(request: EmailChangeState | null | undefined, now: Date): EmailChangePhase;
export function canConfirmEmailChange(request: EmailChangeState | null | undefined, now: Date): boolean;
export function canRevokeEmailChange(request: EmailChangeState | null | undefined, now: Date): boolean;
export function isEmailChangeEffective(request: EmailChangeState | null | undefined): boolean;
export function emailChangeHoursToRevoke(request: EmailChangeState | null | undefined, now: Date): number;
```

### `packages/core/src/account-sanitization.ts`

```ts
export const DEPARTED_BURNER_NAME = "Departed Burner";
export interface UserSanitizationPatch { email: null; username: null; sanitizedAt: Date; }
export function buildUserSanitizationPatch(_userId: string, at: Date): UserSanitizationPatch;
export const SANITIZED_BIO_NULL_FIELDS: readonly [...];   // 14 members, listed below
export type SanitizedBioNullField = (typeof SANITIZED_BIO_NULL_FIELDS)[number];
export type BurnerBioSanitizationPatch = Record<SanitizedBioNullField, null> & {
  skills: string[]; attendedYears: number[]; campHistory: null; volunteeringInterests: null;
  rangerTraining: null; rangerCurious: null; greenDotTraining: null; firstTime: false;
  privacyFlags: Record<string, boolean>; updatedAt: Date;
};
export function buildBioSanitizationPatch(at: Date): BurnerBioSanitizationPatch;
export const SANITIZATION_PRESERVED_TABLES: readonly [...];  // 10 members
export const SANITIZATION_PURGED_TABLES: readonly ["profile_keys", "email_change_requests", "security_events"];
export const SANITIZATION_IDENTITY_TABLES: readonly ["session", "account", "user"];
export interface SanitizationPlan {
  userId: string; at: Date; user: UserSanitizationPatch; bio: BurnerBioSanitizationPatch;
  preservedTables: readonly string[]; purgedTables: readonly string[]; identityTables: readonly string[];
  audit: { action: "account.sanitized"; subject: string; meta: Record<string, unknown> };
}
export function buildSanitizationPlan(input: {
  userId: string; at: Date; bioCount?: number; membershipCount?: number;
}): SanitizationPlan;
export function isSanitized(user: { sanitizedAt?: Date | null }): boolean;
export function assertNotSanitized(user: { sanitizedAt?: Date | null }): { ok: true } | { ok: false; reason: string };
export function uncoveredHardLockedFields(patch: Record<string, unknown>): string[];
export function patchLeaksAny(patch: Record<string, unknown>, forbidden: readonly (string | null | undefined)[]): boolean;
```

### `packages/core/src/auth-capabilities.ts`

```ts
export interface AuthCapability {
  key: AuthCapabilityKey; support: AuthCapabilitySupport; method: string | null;
  reason: string; userMessage?: string; pending?: true; pendingMessage?: string;
}
export function capabilityPendingMessage(cap: AuthCapability): string;
export function capabilityIsUsable(cap: AuthCapability): boolean;
export interface CapabilityVerdict { label: string | null; message: string; }
export function capabilityVerdict(cap: AuthCapability): CapabilityVerdict;
export const AUTH_CAPABILITIES: Readonly<Record<AuthCapabilityKey, AuthCapability>>;
export function isCapabilitySupported(key: AuthCapabilityKey): boolean;
export function isCapabilityUnavailable(key: AuthCapabilityKey): boolean;
export function capabilityUserMessage(key: AuthCapabilityKey): string | null;
export function unavailableCapabilities(): AuthCapability[];
export type CapabilityGuardResult = { ok: true } | { ok: false; message: string; support: AuthCapabilitySupport };
export function assertCapability(key: AuthCapabilityKey): CapabilityGuardResult;
```

### `packages/core/src/security-events.ts` + `security-notifications.ts`

```ts
export const SECURITY_EVENT_TITLES: Readonly<Record<SecurityEventLogKind, string>>;
export function describeSecurityEvent(kind: SecurityEventLogKind): string;

export const ACCOUNT_SECURITY_PATH = "/account/security";
export const ACCOUNT_PATH = "/account";
export function passwordChangedNotification(): NotificationPayload;
export function passwordResetCompletedNotification(): NotificationPayload;
export function emailChangeRequestedNotification(input: { newEmailMasked: string }): NotificationPayload;
export function emailChangeCompletedNotification(input: { newEmailMasked: string }): NotificationPayload;
export function emailChangeRevokedNotification(): NotificationPayload;
export function newDeviceSignInNotification(input: { deviceLabel: string; approximateLocation?: string | null }): NotificationPayload;
export function deletionRequestedNotification(input: { daysRemaining: number }): NotificationPayload;
export function deletionCancelledNotification(): NotificationPayload;
export function deletionCompletedNotification(): NotificationPayload;

export interface SecurityEmail { kind: SecurityEventKind; subject: string; text: string; }
export function maskEmail(email: string): string;
export function passwordChangedEmail(input: { when: Date }): SecurityEmail;
export function passwordResetCompletedEmail(input: { when: Date }): SecurityEmail;
export function emailChangeConfirmEmail(input: { confirmUrl: string; expiresInHours: number }): SecurityEmail;
export function emailChangeNotifyOldEmail(input: { newEmailMasked: string; revokeUrl: string; revocationHours: number }): SecurityEmail;
export function emailChangeCompletedEmail(input: { newEmailMasked: string; revokeUrl: string; revocationHours: number }): SecurityEmail;
export function emailChangeRevokedEmail(): SecurityEmail;
export function newDeviceSignInEmail(input: { deviceLabel: string; approximateLocation?: string | null; when: Date }): SecurityEmail;
export function deletionRequestedEmail(input: { daysRemaining: number; graceEndsAt: Date }): SecurityEmail;
export function deletionCancelledEmail(): SecurityEmail;
export function deletionCompletedEmail(): SecurityEmail;
export function securityMessageLeaks(message: SecurityEmail | NotificationPayload, forbidden: readonly (string | null | undefined)[]): boolean;
```

### `packages/auth/src/account.ts` + `reauth.ts`

```ts
export interface ParsedSetCookie {
  name: string; value: string;
  options: { path?: string; domain?: string; maxAge?: number; expires?: Date;
             httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" };
}
export function parseSetCookies(headers: Headers): ParsedSetCookie[];

export interface AccountUser { id: string; authUserId: string; email: string | null; }
export async function resolveAccountUser(authUserId: string, email: string | null): Promise<AccountUser | null>;

export async function recordSecurityEvent(headers: Headers, userId: string, kind: SecurityEventLogKind): Promise<void>;
export interface SecurityEventView { id: string; kind: SecurityEventLogKind; ip: string | null; userAgent: string | null; createdAt: Date; }
export async function listSecurityEvents(userId: string, limit = 10): Promise<SecurityEventView[]>;

export interface AccountSession {
  id: string; token: string; createdAt: Date | null; updatedAt: Date | null; expiresAt: Date | null;
  userAgent: string | null; ipAddress: string | null; current: boolean;
}
export async function listAccountSessions(headers: Headers): Promise<AccountSession[]>;
export function deviceLabel(userAgent: string | null): string;

export async function getTwoFactorEnabled(authUserId: string): Promise<boolean>;
export interface AccountPasskey { id: string; name: string | null; deviceType: string | null; createdAt: string | null; }
export async function listAccountPasskeys(headers: Headers): Promise<AccountPasskey[]>;

export interface LinkedAccount { id: string; providerId: string; createdAt: Date | null; }
export async function listLinkedAccounts(headers: Headers): Promise<LinkedAccount[]>;
export function describeSignInMethods(accounts: LinkedAccount[]): string | null;

// reauth.ts
export function withReauth<T>(fn: () => Promise<T>): Promise<T>;
export function isReauth(): boolean;
```

### `apps/web/lib/account-actions.ts` — the server actions

```ts
export type AccountActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function changePassword(raw: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }): Promise<AccountActionResult>;
export async function requestPasswordReset(raw: { email: string; redirectTo?: string }): Promise<AccountActionResult>;
export async function resetPassword(raw: { token: string; newPassword: string }): Promise<AccountActionResult>;
export async function revokeSession(raw: { token: string }): Promise<AccountActionResult>;
export async function revokeOtherSessions(): Promise<AccountActionResult>;
export async function requestEmailChange(raw: { newEmail: string }): Promise<AccountActionResult>;
export async function confirmEmailChange(raw: { token: string }): Promise<AccountActionResult>;
export async function revokeEmailChange(raw: { token: string }): Promise<AccountActionResult>;   // UNAUTHENTICATED by design
export async function requestAccountDeletion(raw: { password?: string; confirmEmail?: string }): Promise<AccountActionResult>;
export async function cancelAccountDeletion(): Promise<AccountActionResult>;
```

### `apps/web/lib/account.ts` / `account-sanitize.ts` / `account-tokens.ts`

```ts
export function accountCapabilities(): AuthCapability[];
export async function listAccountSessions(): Promise<AccountSession[]>;      // wraps the shared one with await headers()
export async function listAccountPasskeys(): Promise<AccountPasskey[]>;
export async function listLinkedAccounts(): Promise<LinkedAccount[]>;
export async function getDeletionRequest(userId: string): Promise<(DeletionRequestState & { id: string }) | null>;
export interface DeletionView { phase: DeletionPhase; daysRemaining: number; eligibility: DeletionEligibility; }
export async function buildDeletionGuardContext(userId: string): Promise<DeletionGuardContext>;
export async function buildDeletionView(userId: string, now: Date = new Date()): Promise<DeletionView>;
export interface EmailChangeView { phase: EmailChangePhase; newEmail: string | null; providerApplied: boolean; }
export async function getEmailChangeRequest(userId: string): Promise<(EmailChangeState & { id: string; newEmail: string }) | null>;
export async function buildEmailChangeView(userId: string, now: Date = new Date()): Promise<EmailChangeView>;
export async function applyAuthCookies(responseHeaders: Headers): Promise<void>;

export interface SanitizationOutcome {
  ok: boolean; userId: string; bioRows: number; membershipsPreserved: number; notified: boolean; error?: string;
}
export async function sanitizeAccount(userId: string, requestId: string, now: Date = new Date()): Promise<SanitizationOutcome>;
export async function sweepDueDeletions(now: Date = new Date(), limit = 50): Promise<SanitizationOutcome[]>;

export function newToken(): string;               // randomBytes(32).toString("base64url")
export function hashToken(token: string): string; // sha256 hex
export function tokensMatch(presented: string, storedHash: string): boolean;  // timingSafeEqual
```

### `packages/db`

```ts
export interface CancelDeletionResult { cancelled: boolean; email: string | null; }
export async function cancelPendingDeletion(input: {
  userId?: string; authUserId?: string; via: "sign_in" | "explicit"; now?: Date;
  context?: { ip: string | null; userAgent: string | null };
}): Promise<CancelDeletionResult>;

export const FORGOT_PASSWORD_MAX_PER_WINDOW = 3;
export const FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60;   // 900
export interface RateLimitVerdict { allowed: boolean; retryAfterSeconds: number; }
export async function consumeRateLimit(input: { key: string; max: number; windowSeconds: number; now?: Date }): Promise<RateLimitVerdict>;
export function rateLimitIp(headers: { get(name: string): string | null }): string;
```

---

## 6. Validation + edge-case rules (digit-exact)

### Password policy (`packages/core/src/account-security.ts:15-77`)
- `PASSWORD_MIN_LENGTH = 15` (NIST SP 800-63B-4, single-factor authenticator).
- `PASSWORD_MAX_LENGTH = 64`.
- **Normalisation is NFKC**; the value is **NOT trimmed** — a passphrase's spaces are real characters (`:47-48`, `:51`).
- **Length is counted by code points**: `[...normalized].length` — an emoji counts once, not twice (`:52`; test `account-security.test.ts:77`).
- Bands: `>= 24` → `"strong"`, `>= 18` → `"good"`, else `"fair"` (`:74-75`). *(Note: the UI meter in `password-input.tsx` uses different thresholds — `<20` Fair, `<30` Good, `>=30` Strong. **These two are not the same scale.**)*
- Too-short error text is pluralised: `` `A little longer — ${n} more character${n === 1 ? "" : "s"} to go.` `` (`:60-62`).
- Too-long error: `` `That's longer than we can store — keep it to 64 characters.` `` (`:71`).
- **No composition rules, no forced rotation, no confirm-twice field, no password hints, no knowledge-based recovery questions** (`:19-22`).

### Enumeration safety (`:79-146`)
Four literal messages (`:93-103`):
- `sign_in`: `"That email and password combination didn't work. Please try again."`
- `sign_up`: `"Check your inbox — if we can create that account, a confirmation link is on its way."`
- `forgot_password`: `"If that account exists, we've emailed a reset link. Check your inbox."`
- `email_change_request`: `"If that address can be used, we've emailed it a confirmation link."`

`leaksAccountExistence` blocklist, verbatim 12 phrases (`:132-145`): `"no account"`, `"not registered"`, `"doesn't exist"`, `"does not exist"`, `"unknown email"`, `"email not found"`, `"user not found"`, `"no user"`, `"already registered"`, `"already exists"`, `"already taken"`, `"account exists with"`.

### Deletion grace machine (`:148-257`)
- `DELETION_GRACE_PERIOD_DAYS = 14`; `DAY_MS = 24 * 60 * 60 * 1000`.
- **The exact boundary instant is `due`, not `grace`**: `now.getTime() >= request.graceEndsAt.getTime()` (`:193`; test `:171`).
- `deletionDaysRemaining` returns 0 for anything not `pending`; otherwise `Math.ceil(ms / DAY_MS)`, floored at 0 (`:198-205`).
- `cancelDeletionOnSignIn` **refuses to rescue a `due` request** — *"Signing in does NOT rescue it silently… the request must be resolved deliberately, not by a race between a login and the sweeper"* (`:246-255`, test `:225`).

### Deletion guards (`:339-409`)
- **Sole camp lead**: fires for every `ledProjects` entry with `leadCount <= 1`; message differs for 1 vs. N; carries `groupIds` (`:345-355`).
- **Sole org god**: `ctx.isOrgGod && ctx.orgGodCount <= 1` (`:358`).
- **No sign-in method**: `ctx.signInMethodCount <= 0` (`:366`).
- **Every block is returned at once**, never the first (`:328-331`, test `:396`).
- Warnings: `org_access_revoked` fires when `ctx.orgRole && ctx.orgRole !== "member"`; `supplier_listing_released` when `claimedSupplierName` is set; `supplier_onboarding_in_flight` when the flag is true.
- `canUnlinkSignInMethod` refuses at `signInMethodCount <= 1` (`:415-424`).

### Deletion guard **re-check at erasure time** (`apps/web/lib/account-sanitize.ts:119-162`)
The single most important edge case, with a worked example in the source (`:126-133`): two System managers each request deletion on consecutive days; both pass the create-time check (each sees the other still live) and the sweeper erases both, leaving zero. So `sanitizeAccount` re-runs `assessDeletionEligibility` immediately before erasing — with `signInMethodCount` **forced to 1** because that guard is about proving identity at request time, not at sweep time (`:147-154`). A caught account is **left `pending`**, not failed and not force-deleted (`:139-145`).

### Guard-context counting is tombstone-aware (`apps/web/lib/account.ts:158-241`)
Both the lead count and the god count `INNER JOIN users` and filter `sanitized_at IS NULL`. Comment at `:158-164`: sanitization *preserves* memberships, so without the filter a camp whose only other lead was a tombstone reported `leadCount = 2`. Comment at `:216-229` records the same for gods, plus the compounding bug: `bootstrapGod` re-creates a god membership for a deleted god still in `GOD_EMAILS`, inflating the count every cycle.

### Email change (`:426-546`)
- `EMAIL_CHANGE_CONFIRM_TTL_HOURS = 2`; `EMAIL_CHANGE_REVOCATION_HOURS = 48`; `HOUR_MS = 60 * 60 * 1000`.
- Phases: `none | awaiting_confirm | expired | revocable | settled | revoked | cancelled` (`:474-481`).
- A `pending` row past `expiresAt` reads as `expired` even though the stored status still says `pending` (`:495-498`).
- A `confirmed` row with **no** `revocableUntil` is `settled` immediately (`:500-502`).
- `isEmailChangeEffective` — **the honesty check** — requires `status === "confirmed"` AND `providerCommittedAt != null` (`:530-536`).
- `emailChangeHoursToRevoke` is `Math.ceil(ms / HOUR_MS)`, 0 when not confirmed or no window (`:539-545`).

### Tokens (`apps/web/lib/account-tokens.ts`)
- 256-bit CSPRNG, base64url: `randomBytes(32).toString("base64url")` (`:20-22`).
- Stored as **SHA-256 hex only** (`:25-27`). Plain SHA-256 is deliberate and justified: *"these are high-entropy random values, so there is no dictionary to attack and no need for a slow KDF"* (`:12-14`).
- `tokensMatch` compares digests with `timingSafeEqual` after a length check (`:33-37`).

### Rate limiting (`packages/db/src/rate-limit.ts`)
- `FORGOT_PASSWORD_MAX_PER_WINDOW = 3`, `FORGOT_PASSWORD_WINDOW_SECONDS = 900` (`:46-47`).
- `STALE_ROW_HORIZON_MS = 24h` (`:70`) — deliberately ~96× the longest window, because the sweep runs on the caller's clock and a tight horizon could delete another caller's live counter (`:62-69`).
- **One SQL statement** — a data-modifying CTE sweep plus `INSERT … ON CONFLICT DO UPDATE` — so concurrent lambdas cannot interleave (`:106-124`). The sweep **excludes the caller's own key** because a CTE delete and the INSERT share one snapshot (`:103-105`).
- **Fails OPEN** on a storage error, logged, deliberately: *"a limiter outage would turn into a hard outage of password reset rather than into abuse"* (`:74-77`).
- **Why it has its own table**: Better Auth's DB rate-limit storage runs `DELETE FROM rate_limit WHERE last_request < now - max(window, 10s, 60s)` — **an unfiltered sweep of the whole table** (verified in better-auth 1.6.25, `dist/api/rate-limiter/index.mjs`, `deleteExpiredRows`). Since donor rows store the *window start* in `last_request`, a 15-minute budget behaved as a 60-second one (`rate-limit.ts:13-35`, `schema.ts:452-461`, `:469-489`).
- `rateLimitIp` falls back to the literal `"unknown"` so an unattributable caller shares one bucket rather than escaping the limit (`:148-153`).

### Sweeper route auth (`apps/web/app/api/account/deletion-sweep/route.ts`)
- **Refuses entirely when `ACCOUNT_SWEEP_SECRET` is unset**, in both verbs (`:110-113`, `:130-138`). Comment `:17-22`: *"an unauthenticated endpoint that erases accounts is not a thing that should exist even briefly."*
- Accepts `Authorization: Bearer <ACCOUNT_SWEEP_SECRET>` **or** `<CRON_SECRET>` (Vercel Cron injects the latter and can only issue GETs) — `:50-59`.
- Comparison is `timingSafeEqual` after a length check (`:42-48`).
- **A failed erasure answers HTTP 500, not 200** — `:74-99`, with the incident: *"a POPIA erasure that had been failing every night for a fortnight looked exactly like a healthy cron entry."* Each failure is `console.error`'d individually.
- `sweepDueDeletions` caps at `limit = 50` per run so a backlog can't blow a serverless timeout (`account-sanitize.ts:429-432`).
- One account's throw does not abort the sweep (`:450-463`).

### Sanitization field lists (verbatim)

`SANITIZED_BIO_NULL_FIELDS` — 14 members (`account-sanitization.ts:85-110`):
```
displayName, legalName, homeCity, bio, about,
contactEmail, phone,
onsiteContactName, onsiteContactPhone, offsiteContactName, offsiteContactPhone,
medicalNotes,
saIdEncrypted, passportEncrypted
```
Plus resets: `skills: []`, `attendedYears: []`, `campHistory: null`, `volunteeringInterests: null`, `rangerTraining: null`, `rangerCurious: null`, `greenDotTraining: null`, `firstTime: false`, `privacyFlags: {}`, `updatedAt: at` (`:146-158`).

`SANITIZATION_PRESERVED_TABLES` — 10 members (`:167-178`):
```
memberships, member_role_assignments, questionnaire_responses, required_actions,
audit_events, supplier_document_acks, supplier_declarations, registrations,
section_reviews, notifications
```

`SANITIZATION_PURGED_TABLES` — 3 (`:188-192`): `profile_keys, email_change_requests, security_events`.

`SANITIZATION_IDENTITY_TABLES` — 3, **hard-deleted in this order** (`:211-215`): `session, account, user`.

`ALWAYS_PRIVATE_TO_COLUMN` mapping (`:308-317`), the bridge between privacy-flag names and column names:
```
saId → saIdEncrypted, passport → passportEncrypted, phone → phone,
onsiteContactName → onsiteContactName, onsiteContactPhone → onsiteContactPhone,
offsiteContactName → offsiteContactName, offsiteContactPhone → offsiteContactPhone,
medical → medicalNotes
```

**`authUserId` is deliberately LEFT UNCHANGED** by the user patch (`:41-53`). An earlier design rewrote it to `deleted:<uuid>`, and the result was the **"Lost Cat re-animation hole"**: a returning session (or one still served from the 5-minute cookie cache) looked the row up by the real id, found nothing, and was **silently minted a fresh clean account**. Keeping the id is what makes `assertNotSanitized` reachable.

### Sanitization write order (`apps/web/lib/account-sanitize.ts:26-57`, executed `:198-397`)
All of steps 2–8 run inside **one pooled transaction** (`withTransaction`), so a partial POPIA erasure is impossible. Order:
0. Re-check the anti-lockout guard.
1. Capture `email` + `authUserId` **before** the transaction.
2. Purge `profile_keys`, `email_change_requests`, `security_events`.
3. Patch every `burner_bios` row (one per edition).
4. Hard-delete `session` → `account` → `user` (explicit and in order, even though `user` would cascade).
5. Patch `users` **last** — `sanitized_at` is the tombstone, committed with the erasure it attests to; flip the request to `completed`.
6. Release held-on-behalf-of-others: `suppliers.user_id = NULL`, `wrangler_assignments.wrangler_user_id = NULL` (`:281-293`).
7. Revoke console access: delete `org_role_assignments` by membership id, demote the org membership to `member` (`:309-336`).
8. Strip PII keys out of the audit trail with a raw `UPDATE audit_events SET meta = meta - 'email' - 'contactEmail' - 'primaryEmail'` — **32 such rows were found on the live database** (`:338-355`).
9. Write `account.released_holdings` (ids only) and `account.sanitized` audit rows (`:371-396`).
10. **After** the transaction, send the farewell email to the captured address (`:399-409`).

The comment at `:51-57` records that the three `ON DELETE SET NULL` foreign keys the schema relied on **could never fire**, because keeping the `users` row is the whole design — the cascade had to be written out by hand.

### Re-auth for deletion (`apps/web/lib/account-actions.ts:880-946`)
- Which re-auth applies is decided **server-side from the linked providers**, never from what the client sent (`:894-900`).
- Google-only path: typed address must match `user.email` case-insensitively after trim (`:912-922`). The comment is explicit that this is **not a claim of cryptographic re-authentication** — what protects the account is the 14-day grace, which any sign-in cancels (`:903-909`).
- Password path: verified via `auth.api.signInEmail` wrapped in `withReauth(...)`. Better Auth **still persists a `session` row** even though no cookie is returned, so the freshly minted token is deleted immediately (`:924-947`). Comment `:927-932`: *"a token nobody transmitted is still a usable token."*
- Then: eligibility re-check, "already scheduled" check, and the request + audit row committed together (`:949-976`).

### Email-change revoke — the mirror (`account-actions.ts:719-843`)
The 20-line comment at `:719-742` records the defect: the old version flipped the row to `revoked`, wrote the security event, and said *"Reversed. Your sign-in email is back to what it was"* while `user.email` still held the attacker's address. *"A revocation that only revokes the paperwork is worse than no revocation at all, because it stops the person looking for real help."*
Now: **compare-and-set** on the previously-validated status (so two clicks of the same emailed link cannot restore twice, `:778-791`), address restored on both `user` and `users`, `emailVerified` set back to true by the same proof-of-control standard, and a **unique-violation branch** for "your previous address is now signing in to another account" (`:812-826`). A `pending` row is *stopped* ("Stopped. Your sign-in email is unchanged.") rather than *reversed* — `applied` is only true when `providerCommittedAt != null` (`:759-763`, `:838-842`).

### Better Auth session/cookie constants (`packages/auth/src/env.ts:56-60`)
```ts
export const AUTH_SESSION = {
  expiresInSeconds: 60 * 60 * 24 * 7,   // 7 days
  updateAgeSeconds: 60 * 60 * 24,       // refreshed once a day
  cookieCacheMaxAgeSeconds: 300,        // 5 minutes
} as const;
```
The 5-minute cookie cache is the honest caveat stated on every revocation surface: a revoked session can be honoured for up to that long (`env.ts:52-55`; `auth-capabilities.ts:139`).

### 2FA plugin options that matter (`packages/auth/src/config.ts:226-238`)
- `backupCodeOptions: { storeBackupCodes: "encrypted" }` — the comment calls the plaintext default a **"FOOTGUN GUARD"** (`:229-232`).
- `allowPasswordless: true` so Google-only accounts can still enrol a second factor (`:233-237`).
- Built-in lockout stays at its default: **10 failed codes → 15 minutes** (`:236`, `auth-capabilities.ts:198`, `docs/accounts-security-spec.md:87-89`).
- Passkey plugin: `authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" }` (`config.ts:250-253`).

### The `changeEmail` endpoint is OFF at the provider (`config.ts:117-141`)
`user: { changeEmail: { enabled: false } }`. The 24-line comment is one of the sharpest security notes in the donor: *"A disabled button does not close an HTTP endpoint."* `enabled: true` mounted `/api/auth/change-email` in all three apps and turned a stolen session into a **permanent account takeover** — post a new address, receive Better Auth's confirmation at that attacker-controlled address, click, done; the real owner is never emailed.

---

## 7. UX behaviours worth stealing

1. **Never claim something that did not happen.** Every action fails closed; `run()` wraps and `unstable_rethrow(err)` first so Next's `redirect()`/`notFound()` control-flow throws are not rendered as the literal string `"NEXT_REDIRECT"` to a user whose session expired (`account-actions.ts:88-104`). Camp 404's `DEFERRED.md` records the mirror-image open item ("result-object server actions still throw raw on DB errors").
2. **Book-keeping is never a gate.** `recordSecurityEvent` and `notifySecurity` are both fully swallowed: *"the change already happened; the log is a record, never a gate"* (`account-actions.ts:106-152`; `packages/auth/src/account.ts:208-233`).
3. **Every read degrades, none throws.** `packages/auth/src/account.ts:24-27`: *"An unreachable database or auth server must leave the security page rendering with an honest empty state — a blank page tells the reader nothing about their account, which on a security surface is worse than 'we couldn't load this'."* Every list function returns `[]`/`false`/`null` on error.
4. **The account routes sit OUTSIDE each app's own gate.** `apps/org/app/(account)/layout.tsx:19-44` and `docs/accounts-security-spec.md` both spell it out: *"An account that has just lost its console role is an account with a live session on a laptop somewhere, and telling its owner 'you may no longer sign that device out' is the opposite of the security posture this suite exists for."* Also an explicit exception to the blocking-questionnaire takeover. **Directly relevant to Camp 404**, whose `apps/web/app/page.tsx` gating spine would otherwise strand a pending/rejected member behind `/pending-approval` with no way to secure their account.
5. **Sections are props, not hardcoded** — `AccountShell` refuses to decide product policy for apps it cannot see (`account-shell.tsx:16-19`).
6. **Plain `<a>`, not `next/link`** in `packages/ui`, so the package takes no Next dependency; the cost (a full navigation between tabs) is named and accepted (`account-shell.tsx:10-14`).
7. **A `loading.tsx` that mirrors the shell.** The nav pill row is reproduced at real size (`h-7` pills inside `bg-muted p-1`) *because it is the one thing that does not change between tabs — a skeleton that dropped it would make every tab switch look like the whole page had gone away* (`apps/web/app/(app)/account/loading.tsx:7-16`). Camp 404 has **zero** `loading.tsx` files (WP7 #131).
8. **A scoped route error boundary** with recovery copy that says nothing was changed (`apps/web/app/(app)/account/error.tsx:14-21`). Camp 404 has exactly one error boundary repo-wide.
9. **The consequence lists on the delete page are generated from the sanitization plan**, so what the page promises and what the sweeper does cannot drift (`delete/page.tsx:29-32`).
10. **Two transitions for cancel** so the control is only idle when the screen matches the database (`delete-account-form.tsx:148-155`).
11. **`revalidatePath` after every mutating action** — `/account/security` for password/session changes, `/account` for email changes, `/account/delete` + `/account` for deletion.

---

## 8. Test coverage

**Contract-documenting unit tests, 2,143 lines in `packages/core` + `packages/auth` alone.** Highlights, by name (each is a portable spec):

`packages/core/src/__tests__/account-security.test.ts` (538 lines, 46 cases):
- `:40` "requires 15 characters and accepts 64"; `:49` "imposes NO composition rules"; `:56` "treats spaces as real characters rather than trimming them"; `:77` "counts astral characters once, not twice (emoji passphrases)"; `:87` "normalises to NFKC so the same typed passphrase measures the same everywhere".
- `:103` "returns an identical message whether or not the account existed"; `:117` "ships copy that never leaks account existence"; `:123` "detects the phrases that WOULD leak existence".
- `:155` "is 14 days, and grace ends exactly 14 days after the request"; `:171` "treats the exact boundary instant as due, not grace"; `:225` "REFUSES to rescue a request whose grace already elapsed".
- `:333` "BLOCKS a sole camp lead and names the camp to hand over"; `:371` "BLOCKS the sole org god from self-deleting"; `:396` "returns EVERY block at once rather than the first".
- `:445` "uses a short confirm TTL and a 48h revocation window"; `:516` "NEVER reports a change as effective without a provider commit".

`packages/core/src/__tests__/account-sanitization.test.ts` (254 lines): `:66` "erases EVERY hard-locked private field"; `:91` "leaks NOTHING from the original bio once applied"; `:131` "leaves authUserId UNTOUCHED so the tombstone stays findable"; `:154` "PRESERVES memberships, questionnaire responses and audit events"; `:185` "HARD-DELETES the Better Auth identity tables (session, account, user)"; `:232` "REFUSES to hand a session back to a sanitized account".

`packages/core/src/__tests__/auth-capabilities.test.ts` (102 lines): `:18` "covers every capability key exactly once"; `:65` "gives every non-supported capability honest user-facing copy"; `:76` "documents WHY for every capability"; `:97` "never returns ok for anything the matrix does not call supported". **This is a machine-checked doc-completeness gate — steal the pattern.**

`packages/core/src/__tests__/security-notifications.test.ts` (187 lines): `:72` "NEVER carry a hard-locked private field or a secret"; `:90` "never print a full email address in a notification body"; `:114` "phrases a REQUESTED email change without claiming anything changed"; `:155` "stamps a UTC timestamp rather than a locale-dependent one".

`apps/web/lib/__tests__/account-actions.test.ts` (762 lines): `:130` "rethrows a redirect instead of rendering NEXT_REDIRECT to a burner"; `:166` "FAILS CLOSED on a provider throw: generic message, no notification, no event"; `:250` "is rate limited IN PROCESS, because a server action never meets the HTTP limiter"; `:333` "stores only the token HASHES"; `:398` "gives ONE message for an unknown token and for a wrong-state one"; `:512` "PUTS THE ADDRESS BACK, not just the paperwork"; `:552` "REFUSES the second click of the same link — the compare-and-set"; `:698` "deletes the session the re-auth check minted, leaving no usable token"; `:734` "a failed security-event insert does not fail the action it records".

`apps/web/lib/__tests__/account-sanitize-runner.test.ts` (517 lines): `:162` "ERASES NOTHING for a cancelled, completed or still-in-grace request"; `:184` "LEAVES THE REQUEST PENDING when the anti-lockout guard still blocks"; `:303` "writes in order: secrets, bios, identity, then the tombstone LAST"; `:343` "PRESERVES memberships, responses and audit rows — the cascade would be the damage"; `:445` "mails the farewell only when an address was captured, and reports delivery honestly".

**Coverage ratchets** (Camp 404 has none of this — no `@vitest/coverage-v8` installed anywhere, no `thresholds` key in any of its 7 vitest configs):
- `packages/core/vitest.config.ts:99-104` — `src/account-security.ts`: lines 95, statements 94, functions 100, branches 92.
- `apps/web/vitest.config.ts:83-88` — `lib/account-sanitize.ts`: lines 98, statements 98, functions 100, branches 94. Rationale at `:69-76`: *"the only place application rows are erased, on a live product holding real phone numbers, emergency contacts and medical notes."*
- `apps/web/vitest.config.ts:10` include is `lib/**/__tests__/**/*.test.ts`; `:92-100` aliases `"server-only"` to `test/stubs/server-only.ts` — **Camp 404's `apps/web/vitest.config.ts` has no such alias**, so any ported `server-only` module needs that seam added first.

**E2E** — `e2e/specs/new-burner/account-management.spec.ts:1-23` documents its own assertion strategy against the 5-minute cookie cache: never assert "the other tab bounces to sign-in instantly" (flaky); assert instead that (a) the server-rendered session list shrinks and (b) the old password no longer authenticates while the new one does. `:36-51` explains why the test opens **three** sessions, not two: with one other device the test passed while the app was quietly broken (the rotated cookie was being dropped). That is exactly the class of test-quality lesson the donor's `AGENTS.md:216-259` warns about.

---

## 9. Dependency footprint

### New third-party packages a port would need
| Package | Version in donor | Where used | Notes |
|---|---|---|---|
| `react-qr-code` | `^2.2.0` | `account-two-factor.tsx:4` | **Only** dependency the 2FA card adds. Camp 404 has no QR library. |
| `better-auth` | `1.6.25` **exact** | `packages/auth` only | **NOT needed by the UI.** Camp 404's root `pnpm.overrides` pins `better-auth: ~1.4.18` (transitively under `@neondatabase/auth 0.4.1-beta`). |
| `@better-auth/passkey` | `1.6.25` | `packages/auth/src/config.ts` | Provider-side only. |
| `@simplewebauthn/server` | `^13.3.2` | `packages/auth` devDep | Provider-side only. |

Everything else the account suite touches is **already in Camp 404**: `react`, `lucide-react` (all icons used — `ShieldCheck, ShieldQuestion, Copy, Download, Check, Fingerprint, Trash2, Laptop, KeyRound, Info, ExternalLink, AlertTriangle, ArrowRight, Eye, EyeOff` — exist in the target's installed `lucide-react@1.16.0`), `zod`, `drizzle-orm`, `next`.

### Workspace-internal dependencies
- `packages/ui` account components import **only** `@quagga/ui` siblings + `lucide-react` + `react-qr-code`. **Zero** `@quagga/core`, `@quagga/types`, `@quagga/db`, `@quagga/auth` runtime imports. Verified across all 11 files.
- **Import-style inconsistency to normalise on port**: `account-two-factor.tsx`, `account-two-factor-challenge.tsx` and `account-passkeys.tsx` use *relative* sibling imports (`./badge`, `./button`, `./card`, `./field`, `./input`); `account-sessions.tsx`, `account-security-events.tsx`, `account-change-password.tsx`, `account-sign-in-methods.tsx`, `account-capability-notice.tsx`, `account-delete-elsewhere.tsx`, `account-shell.tsx` use the **self-referential specifier** `@quagga/ui/components/…` / `@quagga/ui/lib/utils`. Camp 404's `packages/ui` has **zero** `@camp404/*` imports today and uses relative paths throughout — a resolution path it has never exercised.
- `packages/core` account modules import only `@quagga/types` (type-only) and `./privacy` (for `ALWAYS_PRIVATE_FIELDS`).
- `packages/auth/src/account.ts` imports `@quagga/db` (`createHttpDb`, `schema`), `@quagga/core` (`isSanitized`), `@quagga/types`, and `./config` + `./env`. **Deliberately does not import `next/headers`** — the app passes `await headers()` in (`:19-22`).

### UI primitives Camp 404 must add or reconcile
| Donor component | Camp 404 status | Action |
|---|---|---|
| `field.tsx` (74 lines) | absent (has `input-field.tsx`, different) | port or map |
| `password-input.tsx` (141) | absent | port + `passwordStrength` from `lib/form-logic.ts` |
| `skeleton.tsx` (204, 9 exports) | absent | port — also unblocks WP7 |
| `switch.tsx` | present but **Radix**; donor's is a hand-rolled `<button role="switch">` | donor call site uses `checked` / `onCheckedChange` / `disabled` / `aria-label` (`account-change-password.tsx:135-140`) — **compatible with Camp 404's Radix Switch as-is** |
| `empty-state.tsx` | present, but takes `children`; donor's takes `action?: ReactNode` | `account-security-events.tsx:60-63` only passes `title` + `description` — **compatible** |
| `badge.tsx` | present; donor uses `variant="success" \| "outline" \| "destructive" \| "warning"` | verify Camp 404's badge has `success` + `warning` variants |
| `card.tsx`, `input.tsx`, `button.tsx`, `toast.tsx` | present, near-identical | drop-in |

### Env vars
`ACCOUNT_SWEEP_SECRET` (new), `CRON_SECRET` (Camp 404 already has it), `RESEND_API_KEY` (Camp 404 has no email provider at all), `NEXT_PUBLIC_APP_URL` (used to build confirm/revoke URLs, `account-actions.ts:531`), `AUTH_RATE_LIMIT_WINDOW_SECONDS` / `AUTH_RATE_LIMIT_MAX` (donor-specific).

---

## 10. AfrikaBurn / multi-tenant coupling — what must be collapsed

Rated by how much of the asset is affected.

### CLEAN — no tenancy coupling at all
- **The entire `packages/ui` account suite.** Verified by grep: zero `groupId|orgId|group_id|tenant|isOrg|MembershipRole` hits anywhere in donor `packages/ui/src`. The only AfrikaBurn-specific things are **copy strings**, all of them replaceable:
  - `account-shell.tsx:38` default note: `"One AfrikaBurn account, whichever door you come in by — participant, organiser or supplier."` — **must go**, it describes three apps.
  - `account-two-factor.tsx:184` download header `"AfrikaBurn Contributors — two-factor backup codes"` and `:193` filename `"afrikaburn-backup-codes.txt"`.
  - `account-two-factor.tsx:261-262` `"We never use SMS — SIM swaps are a real, common attack in South Africa."` (keep — Camp 404 is also South African).
  - `account-passkeys.tsx:141-142` `"One passkey works across all of AfrikaBurn's apps."` — collapse to one app.
  - `formatDate` uses `"en-ZA"` locale in `account-passkeys.tsx:51` and `account-security-events.tsx:34` and `account-sign-in-methods.tsx:127` — fine for Camp 404.
- **`packages/core/src/security-events.ts`** — 33 lines, no coupling, only the 9-member title map.
- **`packages/auth/src/reauth.ts`** — 31 lines, `AsyncLocalStorage` only.
- **`apps/web/lib/account-tokens.ts`** — 38 lines, `node:crypto` only.
- **`packages/db/src/rate-limit.ts`** — the only coupling is the `FORGOT_PASSWORD_*` constants' comment about "all three apps".

### LIGHT — a few fields to drop
- **`packages/core/src/account-security.ts`.** The password policy, enumeration messages, deletion grace machine and email-change machine are all clean. The coupling is confined to `DeletionGuardContext` (`:271-297`) and its consumers:
  - `ledProjects: readonly LedProject[]` where `LedProject { groupId, name, leadCount }` — **`groupId` is the multi-tenant field.** In Camp 404 there is one camp, so the "sole camp lead" guard becomes **"sole captain"**: `captain` is a stored `rankEnum` value, so the guard is `SELECT count(*) FROM users WHERE rank='captain' AND sanitised IS NULL`. This maps **exactly onto Camp 404's WP1 (#125) verified-open finding**: *"`deleteOwnAccount` does not block the sole captain, permanently stranding the camp because `/setup` latches shut after bootstrap"* (`apps/web/app/profile/actions.ts:55`). The donor's `sole_org_god` guard IS that fix, already written and tested.
  - `isOrgGod` / `orgGodCount` — collapse into the sole-captain guard above; do not port both.
  - `orgRole?: string | null` and the `org_access_revoked` warning — drop (no org tier).
  - `claimedSupplierName` + `hasInFlightSupplierOnboarding` and their two warnings — drop (no supplier population).
  - `DeletionBlockCode` becomes 2 members, not 3: `sole_captain | no_sign_in_method`. `DeletionWarning` may become empty or gain Camp-404 members.
- **`packages/core/src/security-notifications.ts`.** Structure is clean; all copy is AfrikaBurn-branded (`"— AfrikaBurn Contributors"` sign-off at `:152-153`, subjects like `"Your AfrikaBurn password was changed"`). `maskEmail` (`:161-168`) and `securityMessageLeaks` (`:324-334`) are pure and drop-in. `ACCOUNT_SECURITY_PATH`/`ACCOUNT_PATH` are just route literals.
- **`packages/auth/src/account.ts`.** `resolveAccountUser` (`:175-204`) does an insert-if-missing on `users` keyed by `authUserId` — Camp 404's `ensureCampUser` equivalent. `getTwoFactorEnabled` reads `schema.user.twoFactorEnabled` — Camp 404 does not own the Neon Auth `user` table, so this must be re-expressed against whatever Neon Auth exposes. Everything else (`parseSetCookies`, `deviceLabel`, `describeSignInMethods`, `recordSecurityEvent`, `listSecurityEvents`) is clean.

### HEAVY — rewrite around Camp 404's schema
- **`packages/core/src/account-sanitization.ts`.** The *structure* (patch/preserve/purge/identity table lists, the tombstone-last invariant, `assertNotSanitized`, `patchLeaksAny`) is exactly what Camp 404 wants. The *field names* are all donor: `burner_bios` columns (`displayName, legalName, homeCity, about, contactEmail, onsiteContactName, …, saIdEncrypted, passportEncrypted`) versus Camp 404's `burner_profiles` + `dietary_requirements` + `driver_profiles` + `users.emergency_contacts` (jsonb) + `packages/db/src/id-documents.ts`. `SANITIZATION_PRESERVED_TABLES` names 10 donor tables; Camp 404's equivalents are `team_memberships`, `questionnaire_responses`, `required_actions`, `notification_deliveries`, `broadcast_targets`, `car_members`, `workshop_rsvps`. And the donor also carries the **`edition_id` dimension** — `burner_bios` are user × edition, so the sanitizer patches N rows per account. Camp 404 has no editions: one row per account.
- **`apps/web/lib/account.ts:buildDeletionGuardContext`** (`:142-306`) is 165 lines of donor-schema SQL: `memberships`/`groups`/`suppliers`/`supplier_onboarding`/`editions`. Rewrite entirely; keep the **tombstone filter pattern** (`sanitized_at IS NULL` on every count) and the **worked-example comments**, which are the real value.
- **`apps/web/lib/account-sanitize.ts`** steps 6–7 (release supplier/wrangler, revoke org roles) — drop. Steps 0–5 and 8–10 port with renamed tables.
- **`apps/web/app/(app)/account/delete/blocked-projects.ts`** — resolves `groupIds` → slugs for "Transfer leadership" links. In a single camp there is nowhere to transfer *to* except promoting another member to captain, which Camp 404 already models as `captain_promotion_requests` (a two-sided handshake). The donor's block message would become *"You're the only captain. Promote someone else first"* with a link to `/captains/camp-management` — and that closes WP3 (#127) and WP1 (#125) at the same time.

### DROP ENTIRELY
- `packages/ui/src/components/account-delete-elsewhere.tsx` — exists only because three apps share one account and only one owns deletion.
- All of `apps/org/**` and `apps/suppliers/**` account files (~1,400 lines of near-duplicate). The donor's own `docs/simplification-audit.md:58-60` calls the `(account)` suite *"a fork carrying ~900 duplicated lines"*.
- The `AccountShell` default `note` prop copy.
- `AUTH_CAPABILITIES.emailChange` / `.unlinkAccount` `pendingMessage` copy, which names organisers and a console.

---

## 11. Verbatim excerpts — the five most valuable pieces

### 11.1 `AccountAuthClient` — the whole reason this suite is portable
`packages/ui/src/components/account-auth-client.ts:1-16, :30-56`

```ts
// Structural contract for the Better Auth CLIENT methods the shared account-
// security components call. It exists so @quagga/ui can host the 2FA + passkey UI
// for ALL THREE apps (participant, org, suppliers) without taking a hard runtime
// dependency on better-auth: each app passes its own `authClient` (built in
// lib/auth-client.ts with twoFactorClient() + passkeyClient()), and the real
// client structurally satisfies this interface.
//
// The shapes mirror @better-auth 1.6.25 (twoFactor + @better-auth/passkey client
// plugins). Methods are declared as METHODS (bivariant) so the real client — whose
// methods accept extra optional args and return wider discriminated unions — is
// assignable here without `any`.

/** Better Auth client calls resolve to a `{ data, error }` pair, never throw. */
export type ClientResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message?: string | undefined } | null };

/** The subset of the Better Auth client the shared account UI depends on. */
export interface AccountAuthClient {
  twoFactor: {
    enable(input: { password?: string }): Promise<ClientResult<TwoFactorEnableData>>;
    verifyTotp(input: { code: string; trustDevice?: boolean }): Promise<ClientResult<unknown>>;
    verifyBackupCode(input: { code: string; trustDevice?: boolean }): Promise<ClientResult<unknown>>;
    disable(input: { password?: string }): Promise<ClientResult<unknown>>;
    generateBackupCodes(input: { password?: string }): Promise<ClientResult<BackupCodesData>>;
  };
  passkey: {
    addPasskey(input?: { name?: string; authenticatorAttachment?: "platform" | "cross-platform" }): Promise<ClientResult<unknown>>;
    deletePasskey(input: { id: string }): Promise<ClientResult<unknown>>;
  };
}
```

**The single gating question for the whole port**: does Neon Auth's client (better-auth `~1.4.18` under Camp 404's root override) expose `twoFactor.*` and `passkey.*` with these shapes? Unverified. If it does not, the UI still ports — Camp 404 supplies its own adapter object.

### 11.2 The clipboard incident — a masterclass in "never claim what did not happen"
`packages/ui/src/components/account-two-factor.tsx:151-179`

```ts
  /**
   * Copy the backup codes — and only say "Copied" when they actually were.
   *
   * This used to be a fire-and-forget `void navigator.clipboard?.writeText(…)`,
   * so the button flipped to "Copied ✓" unconditionally. The Clipboard API is
   * unavailable outside a secure context and can be refused outright by the
   * browser or by permissions policy, and in either case `writeText` rejects (or
   * `navigator.clipboard` is simply undefined and NOTHING was attempted) — the
   * tick appeared anyway. The user then pressed "I've saved them", the panel
   * closed, and the ten codes were gone for good: we show them once and cannot
   * show them again. That is a lockout manufactured by a reassuring tick, on the
   * one screen where being wrong costs the most.
   *
   * So: await the write, and on failure say so and leave the codes on screen.
   */
  async function copyCodes() {
    setError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(backupCodes.join("\n"));
    } catch {
      setError(
        "Your browser wouldn't let us copy to the clipboard — nothing was copied. Your codes are still on screen: download them, or select and copy them by hand.",
      );
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
```

### 11.3 The deletion eligibility assessor — three guards, all at once
`packages/core/src/account-security.ts:339-372`

```ts
export function assessDeletionEligibility(
  ctx: DeletionGuardContext,
): DeletionEligibility {
  const blocks: DeletionBlock[] = [];
  const warnings: DeletionWarning[] = [];

  const sole = ctx.ledProjects.filter((p) => p.leadCount <= 1);
  if (sole.length > 0) {
    const names = sole.map((p) => p.name).join(", ");
    blocks.push({
      code: "sole_camp_lead",
      groupIds: sole.map((p) => p.groupId),
      message:
        sole.length === 1
          ? `You're the only lead of ${names}. Transfer leadership to another member first — we'll walk you through it.`
          : `You're the only lead of ${sole.length} projects (${names}). Transfer leadership for each one first — we'll walk you through it.`,
    });
  }

  if (ctx.isOrgGod && ctx.orgGodCount <= 1) {
    blocks.push({
      code: "sole_org_god",
      message:
        "You're the only god administrator. Grant god to someone else before deleting this account — otherwise nobody could grant it back.",
    });
  }

  if (ctx.signInMethodCount <= 0) {
    blocks.push({
      code: "no_sign_in_method",
      message:
        "This account has no usable sign-in method, so we can't confirm it's you. Contact AfrikaBurn to sort it out.",
    });
  }
```

### 11.4 The re-check at erasure time — the bug only a *final-state* check can close
`apps/web/lib/account-sanitize.ts:119-162`

```ts
  // 0. RE-CHECK THE ANTI-LOCKOUT GUARD, AT THE MOMENT OF ERASURE.
  //
  //    Eligibility was assessed once, when the request was CREATED
  //    (account-actions.ts), and nothing re-asked before this point. That is a
  //    hole the tombstone filters alone do not close, because the property is
  //    about the FINAL state, not about the state on the day someone clicked:
  //
  //      Two System managers, A and B. On day 0 A requests deletion — B is live,
  //      so the count is 2 and it is allowed. On day 1 B requests deletion — A
  //      is still live (the grace period has not elapsed, nothing is sanitized
  //      yet), so the count is still 2 and that is allowed too. On day 14 the
  //      sweeper erases both. Zero live System managers, and no screen can grant
  //      `god` back …
  //
  //    A caught account is LEFT PENDING rather than failed or force-deleted: the
  //    request stays, the grace period has already elapsed so the next sweep
  //    retries, and the moment someone else is granted `god` or made a camp lead
  //    it proceeds on its own. Erasing anyway would strand the deployment;
  //    cancelling the request would silently overturn a person's erasure
  //    decision, which is theirs and not ours.
  const guard = await buildDeletionGuardContext(userId);
  const eligibility = assessDeletionEligibility({
    ...guard,
    // The sign-in-method count is irrelevant now — that guard exists so nobody
    // deletes an account they can no longer prove is theirs, and they already
    // proved it when they asked. Re-applying it here would strand every
    // request whose last social link happened to be revoked in the meantime.
    signInMethodCount: 1,
  });
  if (!eligibility.ok) {
    return {
      ...base,
      error: `Still blocked at sanitization time, so nothing was erased: ${eligibility.blocks
        .map((b) => b.message)
        .join(" ")}`,
    };
  }
```

### 11.5 `parseSetCookies` — the invisible bug that signs a user out five minutes after they secure their account
`packages/auth/src/account.ts:60-86` (function body `:86-142`)

```ts
/**
 * Turn Better Auth's response `Set-Cookie` headers into something a Next server
 * action can put in the cookie store.
 *
 * WHY THIS HAS TO EXIST. Calling `auth.api.*` from a server action bypasses the
 * `/api/auth/*` route handler, so nothing is listening for the headers Better
 * Auth wants to send back — Next discards them. That is invisible for the calls
 * that only read, and it silently breaks the one that ROTATES THE SESSION:
 *
 *   Measured: change a password with "sign out my other devices" on. Better Auth
 *   deletes every session including the caller's, issues a fresh one, and hands
 *   back the new cookie. It goes nowhere. The browser keeps the old cookie,
 *   which now names a row that no longer exists, and stays "signed in" only for
 *   as long as the 5-minute session cookie CACHE lasts — after which the person
 *   who just secured their account is signed out with no explanation. Until
 *   then, the security page cannot find their session in the list and offers to
 *   revoke every row on it, including the one they are sitting on.
 *
 * Parsing lives here, next to the auth server, rather than in three apps.
 * APPLYING it stays in each app, because `next/headers` is a dependency
 * @quagga/auth deliberately does not take (it is also imported by scripts that
 * have no request).
 *
 * Unknown attributes are ignored rather than guessed at: a cookie set with an
 * attribute we do not model is still set, just without it.
 */
export function parseSetCookies(headers: Headers): ParsedSetCookie[] {
```
Applied by `apps/web/lib/account.ts:386-397` (`applyAuthCookies`), best-effort and swallowed because *"the password HAS already changed by the time this runs."*

### 11.6 (bonus) The re-auth marker — 31 lines that prevent a self-cancelling deletion
`packages/auth/src/reauth.ts:1-31`

```ts
// Re-authentication marker.
//
// `requestAccountDeletion` proves it is really you by calling
// `auth.api.signInEmail` with the password you just typed. That is a genuine
// sign-in as far as Better Auth is concerned, so it mints a session row and
// fires `databaseHooks.session.create.after` — the hook that cancels a pending
// deletion. Without a marker, asking to delete an account that is ALREADY
// scheduled would silently cancel the existing request (and mail the burner a
// "your deletion was cancelled" notice) on the way to refusing them.
//
// A password check is not a return. Wrap those calls in `withReauth` and the
// hook stands down.

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<true>();

export function withReauth<T>(fn: () => Promise<T>): Promise<T> {
  return store.run(true, fn);
}

export function isReauth(): boolean {
  return store.getStore() === true;
}
```

---

## 12. Gotchas for a porter

1. **`SecurityEventKind` (10 members, outbound emails) and `SecurityEventLogKind` (9 members, the DB log) are different enums with overlapping names.** `packages/types/src/accounts.ts:98-109` vs `:122-132`. Confusing them silently breaks either the feed or the emails.
2. **Two password-strength scales.** `@quagga/core assessPassword` bands at 18/24; `packages/ui/lib/form-logic.ts passwordStrength` bands at 20/30. They disagree and nothing reconciles them.
3. **`docs/accounts-security-spec.md:76-80` carries an `UNRESOLVED` flag** admitting the "Security principles (the law)" heading and the capability matrix contradict each other on email change and new-device notifications. Do not treat the spec prose as settled.
4. **The donor's own `id-retention.ts` (121 lines, `ID_RETENTION_GRACE_DAYS = 30`) has NO production caller** — verified: the only non-test references are `packages/core/src/index.ts:139-140`, `:193` (barrel re-export) and its own vitest 100% threshold. This is the donor's self-reported gap ("automatic deletion of expired ID documents is written but not scheduled").
5. **`AUTH_CAPABILITIES.emailChange` and `.unlinkAccount` are `pending: true`** — their flows are NOT finished: `auth.api.unlinkAccount` has no caller anywhere in the monorepo, and `user.changeEmail.enabled` is **false** at the provider (`config.ts:141`), so the *entire* 843-line email-change implementation in `account-actions.ts` is reachable only through the app's own `confirmEmailChange`, not through Better Auth. Port the state machine; do not assume it is a shipped flow.
6. **`revokeEmailChange` is deliberately callable UNAUTHENTICATED** (`account-actions.ts:711-717`) — the whole point is that someone locked out of their account can pull the change back from their email. Any port must keep it out of a session gate, and must keep the compare-and-set.
7. **`recordPasswordResetCompleted` is deliberately NOT exported** (`account-actions.ts:264-283`): *"Every export of a 'use server' module is a network-reachable endpoint, and this one takes an account identifier — exported, it would let anyone post a 'your password was reset' alarm into any burner's inbox."* Camp 404's own `"use server"` files should be audited against this rule.
8. **`identityForResetToken`** (`account-actions.ts:238-262`) reaches into Better Auth's `verification` table looking for `identifier = "reset-password:<token>"`. That is a documented internal of better-auth 1.6.x. Neon Auth almost certainly stores it differently. The function is best-effort and never gates, so the safe port is to delete it and lose only the log line.
9. **The donor's `listAccountSessions` deliberately does NOT pass `disableCookieCache`** (`packages/auth/src/account.ts:316-334`) with a *measured* justification: with the forced read the passkey e2e spec failed 3 runs in 10; without it, 0 in 10.
10. **`account-two-factor.tsx` downloads a file via `a.click()` on a blob URL** (`:181-196`). That is fine in a normal app but would be **inert inside a Claude Artifact viewer** — irrelevant for Camp 404's real app, noted only for completeness.
11. **Camp 404's `apps/web/vitest.config.ts` has no `server-only` alias** (`resolve.alias` has only `@`). `apps/web/lib/account.ts`, `account-sanitize.ts`, `account-tokens.ts` and `app/(app)/account/security/events.ts` all begin `import "server-only"`, so they cannot be unit-tested in Camp 404 until that seam exists (donor pattern at `apps/web/vitest.config.ts:92-100`).
12. **`account-sessions.tsx` imports `toast` from `@quagga/ui/components/toast`** and calls it directly inside the component. Camp 404's `Toaster` is mounted globally in `apps/web/app/layout.tsx:69-77`, so this works — but the component is not toast-agnostic.
13. **`Badge variant="success"` and `variant="warning"`** are used by `account-two-factor.tsx:265`, `account-passkeys.tsx:145`, `account-sessions.tsx:134`, `account-sign-in-methods.tsx:117/178`, and `delete/page.tsx:165`. The donor uses `bg-success/20`; Camp 404's badge uses `/15`. Cosmetic, but confirm the variants exist.
14. **`.light` / `.org-accent` / `.supplier-accent`** never appear in these files, but the donor's `globals.css` skinning classes do exist — the account suite itself is theme-neutral and uses only semantic tokens (`bg-muted`, `border-border`, `text-destructive`, `bg-primary/5`, `border-primary/40`), all of which exist in Camp 404's `@theme`.

---

## 13. Recommended port slices (ordered by value ÷ effort)

1. **`account-security.ts` (minus the org/supplier fields) + its 538-line test file** → `@camp404/core`. Closes WP1 #125's sole-captain finding, gives Camp 404 a password policy, and gives it the enumeration-safe message vocabulary it has never had.
2. **`reauth.ts` + `account-tokens.ts` + `rate-limit.ts`** — 222 lines total, zero coupling, all three are things Camp 404 lacks entirely.
3. **The whole `packages/ui` account suite + `field` + `password-input` + `skeleton`** — ~2,400 lines of finished, designed, incident-hardened UI for surfaces Camp 404 has zero of.
4. **`auth-capabilities.ts` pattern** (not the donor's 12 entries) — a Camp-404 matrix over what Neon Auth actually exposes, plus `assertCapability` as a fail-closed server gate and `capabilityVerdict` as the one place a refusal is worded. Its `auth-capabilities.test.ts:76` "documents WHY for every capability" is a doc-completeness gate worth having.
5. **`security_events` table + `describeSecurityEvent` + `recordSecurityEvent` + `AccountSecurityEvents`** — a complete, small, high-value feature (one table, one enum, one pure map, one best-effort writer, one card).
6. **The deletion grace + sweeper stack**, adapted onto Camp 404's `packages/db/src/account.ts`. Highest effort, but it upgrades Camp 404's existing hard-delete-and-stub into a 14-day-reversible, guarded, audited, POPIA-provable erasure — and closes both the WP1 sole-captain hole and `DEFERRED.md`'s "account deletion is a hard no-op under E2E_TEST_MODE".
