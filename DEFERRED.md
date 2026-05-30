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
- Invite-code case normalised at the redeem choke point (`claimInviteCode`/`isEnvCode` lowercase, matching `/invite/check`). **[audit #11]**
- Sign-out link added to `/profile`. **[audit #11]**
- Avatar uploader shows a local object-URL preview (no proxy 401 mid-onboarding). **[audit #7]**
- `quadrant-nav.tsx` dangling `brief §11/§14.1` citations resolved. **[audit #12]**
- Push drain logic extracted to a unit-tested pure `planPushDrain`; foreground `onMessage` handler added. **[D]**
- MCP security primitives unit-tested (`verifyPkce` w/ RFC 7636 vector, `constantTimeEqual`, `sha256`, token entropy). **[audit #9, partial]**

## Open follow-ups (code)

- **Telegram outbound triggers** — `issueGroupInviteForUser` (on captain approval) and `queueAnnouncement` (on announcement publish) are built + unit-tested in `@camp404/telegram` but **not yet called**. Wiring is a behaviour change (approval → group invite "you're in" flow; announcements mirrored to Telegram) that wants: a guard so it no-ops without bot config, an announcement→Telegram **toggle** (product decision), and surfacing the invite link via `notification_deliveries`. Own PR. **[audit #10]**
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
