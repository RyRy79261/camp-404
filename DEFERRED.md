# Deferred work & follow-ups

Tracking for everything the audit-remediation program (PRs #36–#42) intentionally
left for later, plus the items surfaced by the post-merge deviation review. This
exists so deferrals don't live only in scattered code comments / PR prose.

Each item notes its origin: **[audit #N]** = prioritised action from the original
codebase audit; **[X]** = sub-project that deferred it.

## Fixed in the post-review pass (for the record)

These deviation-review findings were fixed (branch `claude/deviation-review-fixes`):

- Dispatch cron now uses `assertCron` (was inline, non-constant-time, fail-open). **[audit #6]**
- PKCE `plain` removed from the authorize enum + well-known metadata (S256-only). **[audit #13]**
- Sign-out link added to `/profile`. **[audit #11]**
- Avatar uploader shows a local object-URL preview (no proxy 401 mid-onboarding). **[audit #7]**
- `quadrant-nav.tsx` dangling `brief §11/§14.1` citations resolved. **[audit #12]**
- Push drain logic extracted to a unit-tested pure `planPushDrain`; foreground `onMessage` handler added. **[D]**
- MCP security primitives unit-tested (`verifyPkce` w/ RFC 7636 vector, `constantTimeEqual`, `sha256`, token entropy). **[audit #9, partial]**

## Fixed in the onboarding error-handling pass (for the record)

Branch `claude/fix-onboarding-crypto-error-handling` — fixes for the "can't get
from questionnaire stage 2 → stage 3" report and the error-handling gap it exposed:

- **Stage 2→3 unblocked.** Advancing past the "About you" page persists the ID
  number, which `encrypt()`s it and threw if `PGCRYPTO_KEY` was unset/short. The
  wizard awaited the save inside `startTransition` with no try/catch, so the throw
  was swallowed silently and the page never advanced. Now: the save action returns
  a typed `{ok:false}` on failure, and the wizard catches throws and shows a
  retry message (`wizard.tsx`, `onboarding/questionnaire/actions.ts`).
- **Boot-time env check** (`lib/env.ts` + `instrumentation.ts`) — a missing/short
  `PGCRYPTO_KEY` now fails loudly at server startup (skipped under E2E test mode and
  `next build`) instead of mid-onboarding.
- **Error boundaries + in-app 404** — added `app/not-found.tsx`, `app/error.tsx`,
  `app/global-error.tsx` (none existed; any throw or bad URL dropped to Next's bare
  default).
- **Wizard e2e coverage** — `tests/e2e/onboarding-questionnaire.spec.ts` drives a
  member through the ID-document page (previously the wizard had zero e2e coverage;
  onboarding was only ever completed via a test seam). Plus unit guards for the
  wizard's throw-handling and `assertServerEnv`.

## Open follow-ups (code)

- **Broader e2e / test-mode-divergence gaps** (surfaced in the same sweep, left for a
  later pass by maintainer decision): the captain approval/vetting UI reads the live
  DB roster and isn't drivable in test mode (approval is only simulated via a seam);
  account deletion is a hard no-op under `E2E_TEST_MODE` (`lib/account.ts`) and has no
  e2e; the owner/captain PII-read decrypt path (`getIdDocuments`, captain detail modal)
  is never exercised. All pass green today because the real paths short-circuit or
  bypass the test store. **[sweep 2026-05-31]**
- **Result-object actions still throw raw on DB errors** — only `createInviteAction`
  try/catches its DB write. The announcements, camp-management, and profile actions
  advertise a `{ok:false}` contract but convert only validation/authz failures; a
  transient DB throw bypasses it (now backstopped by `app/error.tsx`, but the typed
  contract should be made consistent). The questionnaire/forms save actions were fixed
  this pass. **[sweep 2026-05-31]**
- **Shake-to-report bug/feature modal** — spec written at
  `docs/superpowers/specs/2026-05-31-shake-to-report-design.md`; **not built**, pending
  maintainer review of the open decisions (storage target, Intake-Tracker relationship,
  accessibility affordance). The "manual" section of the modal is explicitly out of
  scope for now. **[spec 2026-05-31]**

- **Telegram outbound triggers — intentionally NOT activated (maintainer decision).** `issueGroupInviteForUser` (on captain approval) and `queueAnnouncement` (on announcement publish) are built + unit-tested in `@camp404/telegram`, and the inbound webhook + dispatch cron exist, but the triggers are deliberately **left uncalled** — Telegram outbound must not run yet. Keep all the code; wire the triggers (guarded for no bot config, with an announcement→Telegram toggle, surfacing the invite link via `notification_deliveries`) only when Telegram is explicitly turned on. **[audit #10]**
- **Invite-code case handling** — generated/DB codes are canonically lowercase (validity pattern `/^[a-z0-9]+.../`), but the redeem path matches **verbatim** while `/api/tools/invite/check` lowercases — so a DB code typed in the wrong case can pass the availability check yet fail on redeem. Fixing this needs a *coordinated* change (normalise at redeem + env + seed + storage **and** update the e2e fixtures + the CI `INVITE_CODES`, which currently use uppercase verbatim). An earlier attempt that only lowercased the redeem path broke the e2e and was reverted; do it as a deliberate, test-data-aware change. **[audit #11]**
- **MCP OAuth DB-flow tests** — the pure crypto is now tested; the DB-backed flows (authorization-code consume, refresh-token rotation, rotation-race, Postgres round-trip) need an integration/DB test harness the repo doesn't have yet. **[audit #9]**
- **Gate fallback removal** — `page.tsx` keeps a belt-and-braces `completedAt` check beside the `required_actions` gate. Remove it once (a) existing members are backfilled a `burner_profile` required_action and (b) the MCP completion hooks below land. **[E]**
- **MCP completion hooks** — `update_my_burner_profile` / `update_my_dietary_requirements` / `update_my_driver_profile` on `markComplete` should call `satisfyRequiredAction`. Prerequisite for removing the gate fallback. **[E]**
- **Existing-member required_action backfill** — seed a `burner_profile` required_action for members created before E (new members are seeded at signup). **[E rollout]**
- **Redirect-ladder consolidation** — migrate the ~8 other gated pages (`tools/*`, `family-tree`, `captains/*`) onto the shared `nextGate` gate; the captain-approval gate stays hardcoded by design. **[audit #7, E]**
- **Server-side validation** — run `validateResponses`/`validateIdNumber` (size cap + key allow-list) on non-final questionnaire saves; move ID Luhn/format + DOB age checks server-side. **[audit #5]**
- **`opt_in` activation scope** — pull-model audience (members self-select); currently error-gated in `openActivation`. **[E]**
- **Captain activation compose UI** and **captain-initiated account erasure**. **[E, F]**
- **Native push** — `@capacitor-firebase/messaging` client POSTing to the existing `/api/push/tokens` (no server change). Needs the mobile build (broken/deferred, Phase 7), the deployed API base URL, and an APNs key. **[D]**
- **Scope-aware test-store publish** — if scoped-broadcast E2E is added, extend `test-store.publishBroadcast` to resolve the audience by scope (today it only models `scope='everyone'` announcements). **[C]**
- **`redactIdDocuments`** — a tested-but-uncalled defensive helper; the `people` tool uses a parallel conditional-decrypt path with an `as never` scope cast. Either wire `redactIdDocuments` in as the redaction layer (dropping the cast) or remove it. Low priority — it's a sound defensive utility, not harmful dead code. **[audit #13/info]**
- **Remaining low-severity hygiene** — any other items from audit #13.

## Operator actions (config, not code)

- **Firebase / push:** set `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` (service account) + `NEXT_PUBLIC_FIREBASE_*` + the VAPID key in Vercel to activate web push. Until then the pipeline is inert (no tokens registered, drain no-ops).
- **PII backfill:** run `camp404 backfill-id-encryption` once after the encryption deploy to scrub any pre-existing plaintext ID numbers.
- **Invite bootstrap codes:** replace the env `INVITE_CODES` values with high-entropy random strings (redemption is now throttled, but the defaults are guessable).
- **Account erasure:** the app sanitises the camp row to "Lost Cat #N" and severs the auth link; deleting the upstream **Neon Auth** identity is a separate operator action.
