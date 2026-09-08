# 30 — Build plan

Eight waves. 83 de-duplicated pieces of work, sequenced. Effort figures are the
reconciled ones from `50-risks.md` §5, not the ledger's originals — where a row
was rated S for the file and M for the seam, the M is what appears here.

**The one-paragraph version.** Land six S-sized foundations first (skeleton kit,
`table.tsx`, `decryptField` + crypto-guard, `writeAuditEvent` + the `$type` fix,
`withTransaction`, the `server-only` vitest alias) — between them they unblock
about half the corpus and two of them are prerequisites for fixing live data
destruction. Then spend a week closing bugs the comparison exposed, none of
which need a donor file at all: a questionnaire image answer deletes the
member's profile photo; a pending-approval captain can decrypt SA ID numbers; an
erased sole captain latches `/setup` shut forever. Then build the team
membership write path, because eight downstream items ship dead without it and
it is Camp 404 work, not a port. Everything after that is elective and can be
fanned out.

**Scope honesty, stated once.** Roughly half of Camp 404's remaining roadmap has
**no donor reference implementation at all** — `prefers-reduced-motion` (WP8, 40
findings), @dnd-kit, Firebase/FCM, Telegram, the whole MCP captain tier,
Capacitor, recipes, manuals, the tasks board, adoptees, family tree, carpool,
reimbursements, `opt_in` scope, configurable-teams Phase 4 (verified: zero donor
source hits for each, `20-completeness-critique.md` §5). This plan covers the
other half. Do not read it as the roadmap.

---

## Decision docket — answer these before the wave that needs them

Six items are blocked on a human call, not on engineering. Each blocks a
specific wave. Get them answered in one sitting; they are cheap to decide and
expensive to guess.

| # | Question | Blocks | The two positions | Recommendation |
|---|---|---|---|---|
| D-A | **Is the Playwright suite live?** `AGENTS.md:180-182` says disabled; `.github/workflows/ci.yml:179` runs it on every `src` PR, inside the `ci-pass` aggregate at `:218`. | Wave 7, and the value of every e2e item (units 01, 02, 06, 09, 23 all down-weighted e2e work on the false premise). | Fix the doc, or fix CI. | Fix the doc. The suite is running; that is the observable fact. Add an `UNRESOLVED (flagged <date>)` marker if the intent was to disable it. |
| D-B | **`loading.tsx` rollout — yes or no, and where?** Six impl specs say *do not create one*: `design/spec/impl/app/16-captain-tools.md:43`, `11-invite-tool.md:57`, `09-notifications.md:153`, `05-approval-gate.md:54`, `01-landing.md:27`, `17-mcp-connect.md:125`. `design/spec/flows.md:440` says skeletons are for **client** fetches. | Wave 5 (the rollout only — the kit is unconditional). | 26 bespoke files vs 3 segment-root defaults vs none. | Ship the kit in Wave 0 regardless. Scope the rollout to client-fetch surfaces per `flows.md:440`, as 3 segment-root files (`app/`, `app/captains/`, `app/captains/questionnaires/`). Keep `data-loading="true"` either way — it serves the a11y/e2e half. |
| D-C | **Year two.** Camp 404 has no edition/cycle concept anywhere (`rg '\bedition\b'` over `packages/db` + `apps/web/lib` returns nothing; `camp_settings` `schema.ts:1422` is a singleton). On a second burn, `users.dues_paid`, `approval_status`, `terms_consented_at`, every `required_actions` row and every `questionnaire_responses` row carry over with no reset. | Any dues/`payments` work (Wave 8), and it is cheap now / expensive later. | Wipe-and-reseed each year vs a cycle key on the affected tables. | Decide before the dues ledger exists. Wipe-and-reseed is a legitimate answer for 30–80 people — but it has to be *chosen*. |
| D-D | **`severity` on public feedback issues.** Camp 404 renders `_Severity hint: …_` into a public issue body; the donor deleted the field under the rule *"priority is one wiring mistake away from being a permission."* `design/feature-set/25-global-feedback-dialogs.md:27` records it as a spec value. | Wave 7. | Keep it (spec) or kill it (donor's rule). | Kill it. Four code sites plus the spec line. |
| D-E | **commitlint.** 18 of the last 40 subjects exceed 72 chars and `design(questionnaire-builder):` uses `design` as a **type**, which `config-conventional` rejects outright. | Wave 7. | Adopt with widened enums (M, not S), or don't. | Adopt with a hand-written type/scope enum matching real history and `header-max-length: 100`. It is M. Do not drift into it. |
| D-F | **Account deletion grace period.** `docs/superpowers/specs/2026-05-30-account-deletion-design.md` §Decisions records irreversibility as an owner decision. | Wave 6 (only the sole-captain guard is unblocked without it). | Keep irreversible, or add a 14-day window. | Keep irreversible. Ship the sole-captain guard instead. If reopened: `grace_ends_at` **stored, never derived**, and do **not** sever `authUserId` at request time or the captain can't sign in to fix it. |

Two more that are already answered and should not be re-litigated: do **not**
activate outbound Telegram (`DEFERRED.md:65`); do **not** port `/directory` —
the donor's directory lists *camps, not people*, deliberately, because a
browsable member list is the bulk-exposure surface.

---

## Wave 0 — Foundations

**Goal:** land the shared primitives every other wave imports, plus the two
conventions that stop concurrent work destroying things.

Nothing here is a feature. All of it is S. Do it in one sitting-week and never
think about it again.

| # | What lands | Donor source | Camp 404 destination | Migration | Test that proves it |
|---|---|---|---|---|---|
| F1 | **Skeleton kit** — 9 exports (`Skeleton`, `SkeletonText`, `SkeletonRegion`, …), 204 lines | `packages/ui/src/components/skeleton.tsx` + `packages/ui/src/components/__tests__/skeleton.test.tsx` | `packages/ui/src/components/skeleton.tsx` + `__tests__/` + a `.stories.tsx` | none | Donor test passes unchanged: one `.sr-only` per region, `aria-hidden` bars, verbatim `className` pass-through |
| F2 | **`table.tsx`** — 8 shadcn exports | `packages/ui/src/components/table.tsx` (118 L) | `packages/ui/src/components/table.tsx` + `.stories.tsx` | none | Render test asserting the root carries `relative w-full overflow-x-auto` (that root is exactly what `roster-table.tsx` lacks — it wraps in `overflow-hidden` and clips) |
| F3 | **`decryptField` / `DecryptedField` tri-state** — 27-line paste **below** `decryptOrNull`, keep both | `packages/db/src/crypto.ts:87-113` | `packages/db/src/crypto.ts` | none | Three cases: readable → `{state:"ok",value}`; absent → `{state:"absent"}`; garbage ciphertext → `{state:"unreadable"}`. **Never touch `KEY_SALT`** (`"camp404-pgcrypto-v1"` derives every live key) |
| F4 | **`crypto-guard.ts`** — `isCryptoConfigured` / `safeEncrypt`, 19 lines | donor `packages/db/src/crypto-guard.ts` | `packages/db/src/crypto-guard.ts` | none | Unit test — **blocked on F6**. Do **not** port the donor's request-time refuse-with-no-key throw; Camp 404 already fails at boot (`apps/web/lib/env.ts:20-26` + `instrumentation.ts`), which is strictly better |
| F5 | **`writeAuditEvent`** + `audit_log.metadata` `.$type<Record<string,unknown>>()` + two indexes | `apps/suppliers/lib/audit.ts:13-28` (**the suppliers copy** — only it is typed `DbOrTx` so it composes inside transactions) | new `packages/db/src/audit.ts`; `schema.ts:1188` for the `$type`; `:1192-1194` for the indexes | **yes**, one generated migration — but ship it *with the first writer* (Wave 5), not now. An unused index on an empty table is cost without benefit. The `$type` half emits no migration | PGlite test: write an event, read it back with `metadata` typed. Renames: `subject`→`target`, `meta`→`metadata` |
| F6 | **`server-only` vitest alias stub** — one line | donor app vitest configs | `apps/web/vitest.config.ts:13-17` (`resolve.alias` currently has only `"@"` — verified) | none | Add any test importing a module under `apps/web/lib` that begins `import "server-only"` (~30 such modules). Named as a blocker by 10 units; unit 13's verifier reproduced the throw experimentally |
| F7 | **`withTransaction<T>` + derived `Tx`** — 12 lines | donor `packages/db/src/index.ts` | `packages/db/src/index.ts`, **barrel-exported** (2 of the 15 call sites are in `apps/web/lib/mcp/oauth.ts`) | none | PGlite test: a throw inside the callback rolls back. Replaces 15 hand-rolled `createPooledDb()` … `finally { pool.end() }` sites |
| F8 | **`runAction` / `ActionResult`** — 18 lines; closes `DEFERRED.md:53-58` verbatim | `apps/suppliers/lib/actions/result.ts:1-18` | `apps/web/lib/action-result.ts` | none | Test that a thrown DB error yields `{ok:false, error:<generic string>}` and `console.error`s the original. **Do not** map `error.message` through — packages/db errors nest under `.cause` and leak DB text |
| F9 | **`privacy.ts` field classes** — ~90 lines, zero imports | `packages/core/src/privacy.ts` (127 L) | new `packages/core/src/privacy.ts` | none | Camp 404's answers are question ids in a JSONB map, not columns. HARD_LOCKED ≈ `id.number` + EFT; SAFETY_VISIBLE ≈ `users.emergencyContacts` + `dietary_requirements.allergies` + `isAnaphylactic` (**three** keys where the donor had one). **Skip** the 19-row `BIO_PRIVACY_FIELDS` registry; keep the derivation trick `locked = ALWAYS_PRIVATE.has(key) \|\| f.locked` so law and UI cannot drift |
| F10 | **`redactSecrets(text, env)`** two-pass scrubber | donor `packages/core/src/text-redaction.ts` | `packages/core/src/text-redaction.ts`, **beside** `redactPii` — not `apps/web/lib` | none | Camp 404's env list is **14** names (`rg -o 'process\.env\.[A-Z0-9_]+'`), not the donor's ~12. Keep the `value.length >= 8` guard. Usable today on `apps/web/app/api/cron/notifications/push/route.ts:22`, which puts raw `err.message` into a JSON body |
| F11 | **`.gitattributes`** with `*.pen -merge` | `.gitattributes:1-34` | new `/.gitattributes` (verified absent) | none | `git check-attr merge design/app.pen` returns `unspecified` today. `design/app.pen` is 45,390 lines of JSON git will three-way-merge into structurally valid, semantically **wrong** output. Drop the donor's `design/brand/**` line |
| F12 | **Dated correction blocks** on six provably-stale claims | format: donor `docs/roadmap.md:30-33` | `README.md:108`, `README.md:89-91` (3 crons vs 5 in `vercel.json`), `AGENTS.md:22-27` (omits `packages/core`, `packages/telegram`), `AGENTS.md:180-182` (see D-A), `docs/configurable-teams-plan.md:1-4`, `DEFERRED.md:59-60`; also `apps/web/tests/e2e/README.md:63,:114` ("13-page wizard" vs 11) | none | None — doc-only. Keeps the superseded reasoning a rewrite destroys. Half a day, and it is the cheapest protection against an agent building to a stale claim |
| F13 | **`git add apps/web/tests/e2e/lib/`** | — (Camp 404's own, untracked) | `apps/web/tests/e2e/lib/mailtm.ts` | none | A 141-line disposable-inbox helper, *better than the donor's* on retry/backoff, currently one `git clean` from gone. It is in the working tree right now |

**Total: 13 items, all S. 3–5 days.**

**Done when:** `pnpm build && pnpm test && pnpm typecheck` is green with the
skeleton and table primitives exported from `@camp404/ui`, `decryptField`
and `withTransaction` exported from `@camp404/db`, one test under
`apps/web/lib/__tests__/` importing a `server-only` module and passing, and
`git check-attr merge design/app.pen` returning `-merge`.

**Main risk:** none mechanical — `packages/ui/src/lib/utils.ts` is byte-identical
across the repos (unit 06 ran `diff`, no output) and `button.tsx` variants are
character-for-character identical. The real risk is convention drift: Camp 404's
`packages/ui/src/components/{button,badge,switch,checkbox,dialog,popover}.tsx`
are written **without semicolons** despite `.prettierrc.json` setting
`"semi": true`, and Camp 404 keeps a `.stories.tsx` beside almost every
component while the donor has no Storybook at all. Run `pnpm format` after every
paste and write the story in the same commit.

---

## Wave 1 — Stop the bleeding

**Goal:** close every live defect the comparison exposed. No donor architecture,
no new surfaces — twelve small fixes, three of which are actively destroying
data or exposing PII right now.

| # | Fix | Where | Detail |
|---|---|---|---|
| 1.1 | **Questionnaire image answers delete profile photos** | `apps/web/components/questionnaire/question.tsx:364-373` | Verified this session: the `image` case renders `<AvatarUpload>` with **no `uploadUrl`**, which defaults to `/api/uploads/avatar` (`packages/ui/src/components/avatar-upload.tsx:40`). That route writes `avatars/${user.id}/avatar.{ext}` then calls `deleteAvatarBlobs(user.id, blob.pathname)`, which lists prefix `avatars/${userId}/` and `del()`s everything but the new object (`apps/web/lib/avatar-blob.ts:12,26-39`). **Fix:** pass an explicit `uploadUrl` to a new route with its own prefix that does not call `deleteAvatarBlobs`. Do not wait for the per-`kind` token policy (Wave 8) |
| 1.2 | **A captain held behind vetting can decrypt SA IDs** | `apps/web/app/captains/camp-management/actions.ts:92-110` | Verified this session: `requireCaptain()` there checks auth + `hasCampAccess` + `requireClearance` but **not `isApproved`**, while its twin at `camp-settings/actions.ts:44-63` does, under the comment *"a captain still held behind vetting can't act."* `getMemberDetailAction` decrypts passport/SA ID at `:152-153`. **Fix:** add the check, copy the comment. Three more sites miss the same: `apps/web/app/tools/invite/actions.ts:52-58`, `apps/web/app/tools/forms/[key]/actions.ts:31-33`, `apps/web/app/notifications/page.tsx:22-24` — the last is recorded as **intentional** (`design/spec/surfaces/09-notifications.md:176`), so confirm before "fixing" it |
| 1.3 | **`encryptOrPreserve` on the ID/EFT write paths** | `packages/db/src/id-documents.ts:43`, `apps/web/lib/users.ts:415`, `apps/web/lib/mcp/tools/profile.ts:91-99` and `:452-459` | `idColumnsFor` nulls the non-matching ID column unconditionally, and `decryptOrNull` reports unreadable ciphertext as absent — so on a key-rotated deployment **one ordinary re-save permanently overwrites an encrypted SA ID with `null` under a "Saved" toast.** Give `idColumnsFor` a `stored` parameter rather than loading the row inside it, so it stays pure. Donor reference: `apps/web/lib/bio-store.ts:338-347`. Leave `packages/db/src/maintenance.ts:34` alone — deliberate backfill. Depends on F3 + F4 |
| 1.4 | **Tombstone-aware captain count** | `packages/db/src/bootstrap.ts:23-26` and `:75-78` | Verified this session: `getBootstrapState` counts `eq(users.rank, "captain")` with **no `sanitised`/`isSystem` filter**, and `sanitisedUserPatch` (`packages/db/src/account.ts:22-42`) deliberately preserves `rank`. So after a sole captain erases themselves, `isCampBootstrapped()` stays true and **`/setup` is closed by a ghost** — and the CLI does not rescue you (`mint-invite --assigns-rank captain` refuses unless `--created-by` names a captain; `bootstrap-founder` mints a plain member invite). **Do both:** the `and(...)` filter (necessary) *and* `rank: "member"` in `sanitisedUserPatch` (defence in depth). The filter habit already exists at `roster.ts:93` and `audience.ts:35` |
| 1.5 | **Delete the audience resolver's `default` arm** | `packages/db/src/audience.ts:59-60` | Verified this session — `default: ids = []`. Three characters buy compile-time exhaustiveness; today a new scope value compiles clean and ships a send that reaches nobody. Ship the label-completeness test in **both** directions alongside: `apps/web/app/captains/announcements/send-form.tsx:39` already omits `drivers` from its `Scope` union, so drivers are unreachable from that screen today. Camp 404 already knows this trick — `apps/web/lib/__tests__/camp-config.test.ts` asserts `DEFAULT_TEAMS` keys against `teamEnum.enumValues` |
| 1.6 | **Authorise before SELECT (`includeIdDocuments`)** | `packages/db/src/roster.ts:155-200` + both callers at `camp-management/actions.ts:139,:194` | `getCampMemberDetail` selects `passportEncrypted`/`saIdEncrypted` unconditionally, and **both** the captain action (decrypts) and the member-facing public-profile action (discards via a projection) call it — so a non-captain's request pulls ID ciphertext into RSC render scope. Two columns, one conditional spread, donor `apps/org/lib/queries.ts:1399-1447`. **The single most worthwhile import in the programme, and it is S** |
| 1.7 | **Microphone unmount leak** | `apps/web/components/voice/use-voice-recorder.ts` — cleanup `:77-94`, `await` `:117`, assignment `:124`, AudioContext `:129-138` | Confirmed live by three units independently. `start()` awaits `getUserMedia` and only assigns `streamRef.current` afterwards, so unmounting during the permission prompt runs cleanup against a null ref and the resolved stream leaks — OS mic indicator stays lit until reload. Add `supported = typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)` so `DictatePill` hides instead of failing after the tap |
| 1.8 | **TOCTOU compare-and-set on the approval decision** | `packages/db/src/burner-profile.ts:69-84`, `apps/web/app/captains/camp-management/actions.ts:216` | `setUserApproval` is a bare `UPDATE … WHERE id = ?` with no status precondition and no `.returning()`; `decideApprovalAction` returns `{ok:true}` unconditionally — two captains deciding opposite ways, second silently wins. Camp 404 already does this right at `decideCaptainPromotion` (guards on `eq(status,"sent")`). Two extras: `decideApprovalAction` is the only action in that file skipping `UserId.safeParse`, and the write routes through the real/test backend split so `apps/web/lib/test-store.ts` needs the same guard or e2e stops matching production |
| 1.9 | **Content blocks ignore `visibleIf` in the runner** | `apps/web/components/questionnaire/builder-wizard.tsx:237` | One `if`. `ContentBlockRenderer` renders unconditionally while all four content blocks carry `...visibility`, the validator checks their `visibleIf` references, and `classifyChange` treats edits to them as breaking. A captain can author a conditional explainer and every respondent sees it always |
| 1.10 | **Order-aware `classifyChange`** | `packages/types/src/questionnaire-builder.ts:391-395` | `fieldMap` is keyed by id and order-insensitive, so a page reorder classifies `cosmetic` and `publishDefinition`'s in-place `onConflictDoUpdate` then rewrites the very snapshot an open activation is pinned to. Add position to the comparison. **Do NOT** take the donor's send-time definition-snapshot column — that is a migration plus a resolver rewrite for a bug order-awareness fixes. Write the donor's paired regression: one asserting the pinned version renders, one that proves the bug |
| 1.11 | **Hidden-field smuggling + bounded non-final autosave** | `packages/types/src/questionnaire-builder.ts:296-298`, `apps/web/app/questionnaires/[activationId]/actions.ts:73-75` | `validateBuilderResponses` retains the **client-supplied** value for a hidden field without validating it, and every non-final save skips the validator entirely and upserts the raw record. `DEFERRED.md:72` confirms the second half is a known ask. Retain-vs-drop is a product decision — write it into `docs/questionnaire-builder.md §5` either way; at minimum drop keys not present in the definition |
| 1.12 | **A failing cron looks exactly like a healthy one** | `apps/web/app/api/cron/notifications/push/route.ts:17` | Spreads `drainQueuedPush`'s `{sent, failed, skipped, pruned}` into `{ok:true, …}`, so `{ok:true, sent:0, failed:12}` is a green dashboard entry. Derive `ok` from `failed`, return 500 so the scheduler's own alerting fires. (`dispatch/route.ts` does **not** have this bug — it has no failure counter at all, which is a `packages/db` signature change, Wave 7) |
| 1.13 | **Split the fused `isE2ETestMode() \|\| !token` upload branch** | `apps/web/app/api/uploads/avatar/route.ts`, `apps/web/lib/avatar-blob.ts:23-24` | The route returns **HTTP 200 with a fabricated proxy URL** for a blob that was never written; `avatar-upload.tsx` treats any `res.ok` as success, persists it to `users.profile_image_url`, and the read proxy 404s forever. Keep `isE2ETestMode()` (a legitimate deterministic stub); make bare `!token` return **501**. Tighten the MIME check while there — `file.type.startsWith("image/")` admits script-bearing `image/svg+xml` |

**Total: 13 items, all S. 3–5 days.**

**Done when:** a questionnaire image answer and a profile photo can coexist
(prove it with an integration test or a manual round-trip); a
`rank:'captain', approvalStatus:'pending'` fixture is refused by every action in
`camp-management/actions.ts`; a PGlite test shows a key-rotation re-save
preserving unreadable ciphertext; an erased sole captain leaves
`isCampBootstrapped()` false; and adding a hypothetical `BroadcastScope` member
fails `pnpm typecheck`.

**Main risk:** 1.2 and 1.6 change who can see what. Both need a test that names
the *refused* case, not just the allowed one — and 1.2 has a sibling
(`/notifications`) whose missing gate is recorded as intentional, so the sweep
must be per-site, not a regex.

---

## Wave 2 — The keystone: team memberships

**Goal:** give `team_memberships` a production write path, so the entire team-lead
tier stops being decoration.

This is not a port. Verified this session: the **only** `insert(schema.teamMemberships)`
anywhere in `apps/` or `packages/` is `packages/db/src/__tests__/_factories.ts:39`;
`packages/db/src/account.ts:96` only DELETEs. Eight units independently found it.
Consequences that are all currently invisible: every `team` / `team_leads`
broadcast and questionnaire send resolves to **zero recipients and toasts
success**; roster team badges are decoration; any coverage tile ships permanently
0-of-8; the safety-data predicate's `team_lead` branch is inert; the e2e
`team_lead` persona documents a stranded tier.

| # | Item | Eff | Source |
|---|---|---|---|
| 2.1 | **`assignTeam` / `removeTeam` / `setLead` write path**, one transaction on `createPooledDb` (neon-http has no interactive transactions) — uses F7 | M | Camp 404 work. Reference UI only: donor `apps/web/components/camp-members.tsx:227-315` (`AssignRolesDialog`) |
| 2.2 | **Captain-facing assignment UI** on `/captains/camp-management` | M | same reference |
| 2.3 | **Send screen must read the teams config** — live bug, four ways | S | `apps/web/app/captains/announcements/send/page.tsx:80-96` never calls `getTeamsConfig()`, so the picker enumerates raw `Team.options` and **offers archived teams as send targets**; `TEAM_LABEL` is hardcoded so renames don't propagate; `sub: m.teams.join(", ")` prints `power_and_lighting` ten lines from where the pretty string lives. Configurable-teams Phase 2 shipped, which is what makes this live |
| 2.4 | **`audienceLabel(scope, team)`** — one owner for a vocabulary currently at **five** sites | S | donor `apps/org/lib/questionnaires/queries.ts:63-81` → `packages/db/src/camp-config.ts` beside `teamLabelMap:54` |
| 2.5 | **`previewAudienceCount` server action** | S | donor `apps/org/lib/questionnaires/actions.ts:244` + tests `apps/org/lib/__tests__/questionnaire-actions.test.ts:209-246`. `"use server"` → Zod-parse → **the same `gateCaptain()` the send runs** → **the same `computeAudience`** → `{ok, count}`. Two corrections that matter: `resolveAudience` takes a *broadcast row* and cannot be pointed at a questionnaire send — build the questionnaire count on `packages/db/src/activations.ts:68-70`; and the preview must reject `opt_in` exactly as `openActivation` does (`activations.ts:50-52`) or it reports a count for a scope that cannot send. A refusal must cost **zero** DB round-trips — it sits behind a 300 ms debounce keyed on `JSON.stringify(spec)` with a `cancelled` flag |
| 2.6 | **`<AudienceCount>` + the zero-vs-null contract** | S | **Lift the count LINE, not the component.** Camp 404's picker (four scope cards + team select + searchable member multi-select, `send-form.tsx:186-261`) is richer than the donor's single `Select`; porting `AudienceSelect` regresses it. The transferable asset is `showCount = resolvedCount !== null && resolvedCount !== undefined` — **`null` hides the line, `0` SHOWS it**, because zero is precisely when the author needs telling — plus `resolveLine`'s three cases with `noun="members"`. Take only the first `describe` of `packages/ui/src/components/__tests__/audience-select.test.tsx:19-58` |
| 2.7 | **`canSendToAudience(actor, audience)`** — ~25 lines | S | donor `packages/core/src/questionnaire-authz.ts:58-70` → new `packages/core/src/audience-authz.ts`. A live caller exists the moment 2.1 lands: team leads already author but cannot send |
| 2.8 | **Name validation + conflict detection on `renameTeam`** | S | `packages/db/src/camp-config.ts:107-118` is a bare `.map` writing any string as a label — two teams can be relabelled identically and the roster filter becomes ambiguous. **`normalizeName` is not missing** — `slugify` already does NFKD → strip marks → lowercase → collapse. The genuinely absent piece is `roleNameConflicts(existing, candidate, exceptNormalized?)`, whose `exceptNormalized` escape hatch (renaming a name to a case variant of *itself* passes) is the non-obvious half |

**Total: 2 M + 6 S. 4–6 days.**

**Done when:** a captain can assign a member to a team and mark them lead from
the UI; a `scope:'team'` announcement to that team resolves to a non-zero
recipient list in a PGlite test; the send screen shows a live count that reads
`0 members` (visible, not hidden) for an empty team; and the archived-team
option is gone from the picker.

**Main risk:** 2.1 defines how `team_lead` resolves for the rest of the app. All
four captain pages currently hardcode `isLead: false` into `deriveViewerRank`.
Decide the resolution rule here, write it into `AGENTS.md`, and Wave 6's shared
gate inherits it — otherwise the gate consolidation silently changes behaviour
on four pages at once.

---

## Wave 3 — Questionnaire read-back (builder Phase E)

**Goal:** captains can see what members answered. Today there is **zero** results
code — `grep -i csv` across `apps/web/app/captains/questionnaires` and
`packages/db/src` returns nothing; `metrics` appears only in two comments.

| # | Item | Eff | Notes |
|---|---|---|---|
| 3.1 | **Frozen v1 fixture + `KIND_SAMPLES` exhaustiveness fixture** | S | **Land before 3.2 or any new question kind.** `validateOne` is a 14-arm switch with no `default` and `noImplicitReturns` is off, so a 15th kind silently accepts anything. Today's suite covers only slider/number/single_select/multi_select/short_text. Donor `packages/core/src/__fixtures__/questionnaire-v1.ts` + `packages/types/src/__tests__/question-fixtures.ts`. Copy the DO-NOT-MODERNISE header word for word |
| 3.2 | **`aggregateResponses`** — the per-question results engine | **M** | donor `packages/core/src/questionnaire-results.ts` (419 L) + its 341-line test companion → new `packages/core/src/questionnaire-results.ts`. Effort reconciled L→M: `toggle` and `combobox` carry the identical `options:{value,label}[]` shape and drop into the `choice` arm with **no new code**, `scale` needs a field rename — genuinely new arms are needed for **two** kinds (`slider`, `number`), not four. Drop `grid` and `rating` (no such kinds here). **PII stance settled:** `docs/questionnaire-builder.md:400` rules free-text out of value breakdown, so the `text` arm returns a **count**, never `answers: string[]`. Port the test with it; it pins every rounding and denominator decision |
| 3.3 | **CSV export** | S | donor `apps/org/components/questionnaires/results-view.tsx:505-609` (~105 lines, no new dep). Keep verbatim: `csvCell` doubling inner quotes, `\r\n` terminators, the **UTF-8 BOM** at `:587-589` (so Excel doesn't mojibake member names). Replace `optionLabelMap` with Camp 404's `displayResponseValue` so there is one label path. Put `csvCell` + BOM in a shared helper — the WP9 roster CSV wants them too. Best effort-to-value ratio in the questionnaire units |
| 3.4 | **`ResponseViewer` — per-respondent answer dialog** | S | donor `apps/org/components/questionnaire/response-viewer.tsx` (97 L) → `apps/web/app/captains/questionnaires/[key]/response-viewer.tsx`. `displayResponseValue` (`packages/types/src/questionnaire.ts:321-348`) already does the hard half. Dialog height cap `max-h-[85svh]` outer / inner `dl max-h-[60svh] overflow-y-auto` |
| 3.5 | **`tallyActivationCompletion`** | S | donor `packages/core/src/questionnaire-activation.ts:136-142`. **Do not port the donor's arithmetic** — it counts `waived`/`expired` as pending; `docs/questionnaire-builder.md:390` excludes them (`completed / (pending + completed)`). Port the shape, add a third bucket `closed = waived + expired` so the excluded tail is visible rather than silently dropped. `closeActivation` manufactures expired rows deliberately, so this is not hypothetical. `=== 0 ? 0 : Math.round(...)` at both ratios; derive `pending` as a complement |
| 3.6 | **Results/Responses route** — `listActivationResponses` + `ResultsView` | **L** | The Phase E payoff surface. New DB read (`required_actions × questionnaire_responses × users`) **and** a new route. Hard-depends on F2 (`packages/ui` has no `table` and no `tabs`; `SegmentedControl` substitutes for tabs, nothing substitutes for a table). Read the donor's `getActivationResults` + its route as a working reference, not just its components. Take `BarRow`'s documented 360px gutter fix and the namespaced `${q.id}:${value}` label-map key (the org fork's flat map collides across questions). **Do not filter results by `activation_id`** — `questionnaire_responses.activationId` is `on delete set null` with one latest row per `(user, definitionKey)`, so filtering blanks an earlier send's results after a re-send. `docs/questionnaire-builder.md` reserves **two** routes, `/metrics` (:214) and `/responses` (:215) |
| 3.7 | **`duplicate_id` + `invalid_range` publish checks** | S | Genuinely missing from `validateBuilderQuestionnaire`, and duplicate ids cause **two** bugs: two blocks collapse onto one response key, *and* the forward-reference `earlier` set is keyed by question id so the second block's `visibleIf` check passes spuriously. Keep the `string[]` return for now. Copy the donor's five messages verbatim **and** their assertions, or they drift |
| 3.8 | **`DefinitionIssue {path, code, message}` + dotted-path router** | M | The return-type change only, **after** 3.7. Corrected code vocabulary: `duplicate_id`, `duplicate_option_value`, `invalid_range`, `dangling_visible_if`, `no_visible_page`. **Drop** `unreachable_page`, all four branch codes and both `reserved_*` — Camp 404 branches by `visibleIf` and has no jump targets or reserved constants. Path grammar differs: `pages[i].blocks[j]` with the question one level deeper. **Do not** take the donor's "never write an invalid definition" rule — `updateDefinitionAction` is the canvas autosave and must keep persisting half-built drafts |
| 3.9 | **`TextFormat` presets + `checkTextFormat`** | S | donor `packages/types/src/questionnaire.ts:48-59`, `:539-575` + `__tests__/questionnaire-text-format.test.ts`. Closed 7-member enum, 38-line checker, no ReDoS surface. Two hazards: Camp 404 collapses `short_text` and `long_text` into one validator arm (`:503-509`) so the call needs a `q.kind === "short_text"` narrowing or it type-errors; and Camp 404 already has a distinct `number` kind (`:36`), so `format:"number"` creates two ways to ask for a number — pick one and say which in the palette |
| 3.10 | **`other:` in-band answer encoding** | S | ~15 lines, no migration (the response map is already `z.record(string, string\|number\|string[]\|boolean\|null)`). **Three things must land together** or it is half-broken: `allowOther` on the two choice kinds, the reserved-prefix definition-time guard (donor `questionnaire-definition.ts:231-237`), and a `displayResponseValue` arm — its `default:` at `:346-347` would render `other:pizza` raw to a captain |

**Total: 1 L + 2 M + 7 S. 7–10 days.**

**Done when:** a captain opens `/captains/questionnaires/[key]/metrics` and sees
per-question aggregates with honest denominators; `/responses` lists respondents
with a working per-respondent dialog; CSV downloads open in Excel with correct
member names; and `pnpm test` covers the donor's four robustness properties
(post-hoc questions report honest skips, orphan answers surface, deleted options
still get a row labelled by raw value, out-of-range scale values keep their
bucket) — all four **will** occur here because `lifecycle-controls.tsx:108-119`
explicitly permits editing a published questionnaire.

**Main risk:** 3.6 is the only L in the programme and it fans out. Land 3.3 and
3.4 first as standalone surfaces — they are cheap, immediately useful, and both
get reused inside 3.6, so if the L slips the wave still delivers.

---

## Wave 4 — Make delivery actually deliver

**Goal:** a message sent reaches somebody, and the recipient can open it.

Two structural facts drive this wave. First, a **non-blocking questionnaire send
— the default on the Send screen (`send-form.tsx:80`) — currently reaches
nobody**, because the only reader filters blocking-only. Second, **Camp 404 has
zero working outbound channels**: no email provider at all (one false-positive
grep repo-wide), FCM inert until Firebase env is set in Vercel
(`DEFERRED.md:80-85`), Telegram deliberately not activated (`DEFERRED.md:65`).

| # | Item | Eff | Notes |
|---|---|---|---|
| 4.1 | **`listPendingQuestionnaires` sibling reader + `PendingQuestionnaires` card** | S–M | **Add a sibling reader**, do not drop `eq(blocking, true)` from `getPendingRequiredActions` in place — the sibling is lower-risk against three existing call sites and gives the card its `type='questionnaire'` filter for free. **No join needed:** `title`, `blocking`, `dueAt` and `activationId` are already in the select list at `packages/db/src/activations.ts:215-222`. Home placement is an open design call — `tile-catalogue.ts` is a fixed 3×4 grid and the reserved "Crew Forms" tile sits in the **team_lead** group, so it is the author read-back slot, not a member pending list |
| 4.2 | **Thread `activation.blocking` → runner variant + `BlockingBadge` Optional** | S | Two lines; the `"onboarding" \| "runner"` union already exists at `builder-wizard.tsx:67` and `activation.blocking` is already selected at `activations.ts:236`. **Ship it with 4.1** — blast radius is zero today because nothing can hand a member a non-blocking link. Generalise `RequiredChip` into `BlockingBadge({blocking})` and use it on the send screen, hub rows, lifecycle controls and the fill page |
| 4.3 | **Resend adapter behind the existing dispatch cron** | S | The highest-value line in the env diff and a two-hour job. `notification_deliveries.channel` already exists (`schema.ts:903`) — the schema is ready and the second channel is missing. One env var (`RESEND_API_KEY`, add to `turbo.json` `globalEnv`) plus an adapter. Donor has Resend; the adapter shape ports, its AfrikaBurn templates do not |
| 4.4 | **Questionnaire-released notification on send** | M | The other half of the non-blocking delivery gap, and the cheaper half — the announcement fan-out engine is already built and proven. **Must be written AFTER commit, outside the transaction** (`openActivation`'s tx spans `activations.ts:94-133` with `pool.end()` in a `finally`), each side write in its own try/catch. `createAnnouncementDraft` hardcodes `scope:"everyone"` and takes no targets, so a **small new writer** is needed (broadcast scope=individual + `broadcast_targets` rows + publish), not an existing call |
| 4.5 | **`/announcements/[id]` read page + delivery-row-as-permission** | M | Every delivery carries `refType:"announcement"`/`refId` and pushes both to FCM — **with no route to open**. The rule is the asset: SELECT the delivery for `(userId, broadcastId) LIMIT 1`; if absent return `null` **without reading the broadcast row at all** (the donor's test pins exactly that); then read the broadcast and null it if `published_at IS NULL`. The delivery row *is* the permission — no second authz system to keep in sync with `resolveAudience`. Reverses `09-notifications.md:120`; ship the spec edit with the route |
| 4.6 | **`(user_id, created_at DESC)` index on `notification_deliveries`** | S | Unconditional: `listInbox` orders `desc(createdAt)` and the four existing indexes serve none of it. **Separate this from the `.limit()`** — the index has no spec conflict; the LIMIT reverses `09-notifications.md:175` ("No pagination… not in scope") and needs OQ4 answered first |
| 4.7 | **`groupByDay` + `dayGroupHeading` + `NotificationDayGroups`** | S | donor `packages/core/src/notifications.ts:368-411` — 44 lines, zero imports, injectable `now`; copy the module-private `dayKey` with it (local calendar, deliberately not UTC). **It does not sort** — state `listInbox`'s `orderBy desc(createdAt)` as a precondition in the file, or unsorted input silently yields duplicate groups. Retoken rather than lift: Camp 404's rows are already individually bordered cards, so the group is a heading over the existing `gap-3` stack. This is the answer to list length, given pagination is out of scope |
| 4.8 | **`readRate` + read-rate tally + bar** | S | Lands in `packages/core` (pure maths, the barrel is exactly for this), not `packages/ui/src/lib`. Three test cases port verbatim: `readRate(1,3).percent === 33`, `(0,0) → {0,0,0}`, `(50,30)` clamps to 100. DB half is one extra correlated `count(*)::int … and nd.read_at is not null` subquery beside the two at `packages/db/src/broadcasts.ts:129-137`. Note: "Sent to N members" already renders for every variant — only the *read rate* is missing, and the existing bar is acknowledge-gated at `:468` |
| 4.9 | **Body clamp on the inbox row and announcement cards** | S | Not a port — the donor file is a markdown stripper and Camp 404's bodies are plain text. `line-clamp-3` on `apps/web/app/notifications/notification-row.tsx:66`, `line-clamp-2` on `announcements-manager.tsx:406-408` and `:456-458`. Tailwind v4 ships it (`select.tsx:21` already uses `line-clamp-1`). It is a spec edit: `15-announcements.md:176` records the unclamped body as known behaviour |
| 4.10 | **`scope` on the announcement compose boundary** | **M** | Three sites, not one: (a) `isOwnedAnnouncementDraft` (`packages/db/src/broadcasts.ts:36-43`) pins `scope='everyone'` into the ownership predicate, so a scoped draft becomes unfindable by its own writers; (b) `publishAnnouncement`'s `.returning()` (`:240-245`) doesn't select `scope`/`team`; (c) it passes a **literal** `{scope:"everyone", team:null}` to the resolver at `:261`. Express the input as a discriminated union over Camp 404's own enum so "a team send with no team" is a parse error. **Do not add `channel` in the same pass** — `open-questions.md:126` (D24) withholds it. Depends on Wave 2 for the team scope to mean anything |
| 4.11 | **Sole `TopChrome` mount / route-group chrome layout** | S–M | `TopChrome` is rendered by **exactly one file** (`apps/web/app/page.tsx:99`), so every route other than `/` has no bell, no unread badge and no top chrome at all. The work is introducing a route-group layout that mounts chrome for the first time — not fixing a remount |
| 4.12 | **Publish confirmation + honest refusal copy** | S–M | An irreversible camp-wide takeover fires from one unguarded `onClick` (`announcements-manager.tsx:434`) in a file that already imports `Dialog`. **Do NOT port `SELECT … FOR UPDATE`** — `publishAnnouncement` already claims the draft in the UPDATE itself, which is strictly stronger and needs no lock. Separately, replace the collapsed `"Draft not found or already published."` (`actions.ts:81`, `:94`) with copy naming which of three causes fired |
| 4.13 | **Notification payload-builder seam + `kind` column** | M–L | The producer gap: the only two `insert(notificationDeliveries)` sites are both fed by a captain-composed row, so approval decisions, captain promotion, questionnaire sends and the reminders cron produce nothing anyone can see. The donor's ten AfrikaBurn builders are useless; the **architecture** ports — a pure zero-I/O module returning `{kind, title, body, link}` with the insert and channel left to the caller. Derive the TS union from the pgEnum, never retype it. **Migration:** `kind` must be added with an explicit `DEFAULT 'announcement'` — a bare `ADD COLUMN … NOT NULL` fails on a populated table |
| 4.14 | **`notificationMentionsAny` privacy guard** | S | 12 lines, donor `packages/core/src/notifications.ts:337-348`. Take the tests too or it isn't a guard — especially the **non-vacuity** case asserting `true` on a payload titled "Your phone +27821234567 was updated", and the blank-needle case. Seed Camp 404's own secrets (encrypted SA ID, passport, emergency contacts). It guards almost nothing until 4.13 exists, and it is the choke point the moment it does |

**Total: 1 M–L + 3 M + 10 S. 7–10 days.**

**Done when:** a captain sends a non-blocking questionnaire, the member sees it
on `/home`, opens it via a link that is not a gate, and the completion is visible
on the metrics page from Wave 3; a published announcement's push notification
opens `/announcements/[id]`; and a member with no email address configured still
receives the delivery in-app while a member with one receives an email.

**Main risk:** 4.13 is the widest change in the wave and the only one that needs
a non-trivially-additive migration. Land 4.1–4.9 first — they are independent of
it — and treat 4.13 as its own epic if the wave runs long.

---

## Wave 5 — Privacy and accountability

**Goal:** the app can prove who read what. `audit_log` exists and has had **zero
writers since it was created**; seven units want it.

| # | Item | Eff | Notes |
|---|---|---|---|
| 5.1 | **Ship F5's migration with its first writer** | S | The two indexes (`audit_log_target_idx`, `audit_log_created_at_idx`) go in the same generated migration as the first `writeAuditEvent` call, not before. The donor's `audit_events` (`schema.ts:1708`) indexes actor+action+subject+created_at desc; Camp 404's `audit_log` (`:1180`) indexes only actor+action, so "everything that happened to member X" and "recent activity newest-first" are both seq scans |
| 5.2 | **Audit the captain ID decrypt (disclosing-read pattern)** | M | `apps/web/app/captains/camp-management/actions.ts:152-153` decrypts SA ID / passport for captains **with no record it happened** — while the *machine* path (`mcp_audit_log`) is fully audited, making the web PII read strictly less accountable than the MCP one. Camp 404 already has move (a): `requireCaptain()` runs before `getCampMemberDetail()`. Three missing moves: the three-state result (F3), `if (!isSelf && value)` so self-reads and empty fields are not access events, and the write in `after()` with `console.error` — **logged, not swallowed**. `after()` from `next/server` is imported **nowhere** in Camp 404 today; verify it fires once under Next 16 before relying on it. Reuse `appendMcpAuditLog`'s shape (`packages/db/src/mcp.ts:68-91`, "Auditing must never break a tool call") |
| 5.3 | **Safety-data access predicate + `resolveSafetyDataForViewer`** | S + M | Camp 404 stores emergency contacts (`users.emergency_contacts`, `schema.ts:279-282`) and anaphylactic-allergy flags with **no web reader, no audience predicate and no audit row** — while MCP already exposes them to captains (`apps/web/lib/mcp/tools/people.ts:126`). The predicate de-orgs cleanly to `{isSelf, isCaptain, actorLeadTeamKeys, subjectTeamKeys}` with basis `"self" \| "captain" \| "team_lead"` — fail-closed, pure, a natural 9th `packages/core` module (~15 fresh lines; do **not** port the donor's 142). The resolver is the transferable design: authorise → select+decrypt only on a yes → report `unreadable` as its own field → audit in `after()`. This is WP5's safety-critical half |
| 5.4 | **`MEDICAL_AUDIENCE_NOTE` consent-sentence constant** | S | donor `packages/core/src/bio.ts:145-157`. The consent sentence must live in a **code constant** because the capture surface is a questionnaire whose copy is data a captain can edit |
| 5.5 | **`schema-invariants.test.ts` sweep** | S | Catches the one failure Camp 404 cannot otherwise see: a fifth `*_encrypted` column added without crypto wiring passes lint, typecheck, build and all 97 test files, and surfaces only as plaintext PII in production. Two mandatory adaptations: swap `burner_bios` for `burner_profiles` in the non-vacuity check, and **scope the `notNull === false` assertion to the three `users` columns** — `reimbursements.account_details_encrypted` **is** `.notNull()`, which is exactly why `account.ts:122` scrubs it to `""`. Allowlist it as a documented exception. Ride the `predicateText` + FK/snake_case sweep in the same file (it pins the two shipped partial indexes) |
| 5.6 | **`/captains/audit` panel** | M | Needs F2 + 5.1. Also needs `formatDateTime` + `relativeTime` (donor `apps/org/lib/labels.ts:44-58`) — eight source files hand-roll date formatting today. **Date rule:** platform `Date` with a UTC round-trip, no hand-rolled maths and no new package |
| 5.7 | **Sole-captain deletion guard** | S–M | `deleteOwnAccount` (`apps/web/app/profile/actions.ts:55-69`) checks auth + camp access + a typed `DELETE` and nothing else. **Hard-depends on 1.4** for its data source. Collapse the donor's three block codes to one `sole_captain`; drop all three org/supplier warnings. Two donor properties worth taking whole: return **every** block at once with UI-verbatim messages, and re-check eligibility **at the moment of erasure** (two captains can each pass a request-time guard on different days) |
| 5.8 | **`account.sanitized` proof row + completeness provers** | S | Today a completed erasure and a data-loss incident look identical afterwards. Plus `patchLeaksAny` / `uncoveredHardLockedFields` (donor `packages/core/src/account-sanitization.ts:326-351`) so a new personal column cannot silently survive erasure — needs F9 |
| 5.9 | **Approval decision reason + notification to the applicant** | M | A rejected member is told nothing, ever — `/pending-approval` says "reach out to whoever invited you" because the app has no reason to show them. One nullable `users.approval_decision_reason` column. Carry the donor's invariant from day one: a reason written about state X is cleared the instant the row leaves X (their repair migration exists because they retrofitted it). Depends on F7, 1.8 and Wave 4's delivery path |
| 5.10 | **`loading.tsx` rollout** (gated on **D-B**) | M | Only if D-B says yes. Shape: 3 segment-root defaults at `app/`, `app/captains/`, `app/captains/questionnaires/`, each copying its own segment's container classes verbatim. `/notifications` is a recorded non-goal (`09-notifications.md:64,:153`) |

**Total: 4 M + 1 S–M + 5 S. 6–9 days.**

**Done when:** a captain viewing a member's ID number produces an `audit_log`
row naming actor, target and action; a self-read produces none; an emergency
contact is readable by a captain and by that member's team lead and by nobody
else, with the refusal path tested; and adding a `foo_encrypted` column to
`schema.ts` fails `pnpm test`.

**Main risk:** `after()` semantics under Next 16 are assumed, not observed.
Verify it fires once with a throwaway route before 5.2 depends on it. The audit
write is fail-open **by design** — that is correct — but it must be *logged*,
because a silently swallowed catch makes an unread trail undetectable.

---

## Wave 6 — Console hardening and captain operations

**Goal:** one gate, honest refusals, and the roster operations WP9 asks for.

| # | Item | Eff | Notes |
|---|---|---|---|
| 6.1 | **Collapse the duplicate `nextGate`** | S | `packages/core/src/access.ts:94-104` is exported and unit-tested with **zero app callers** and lacks the `type === "questionnaire" && activationId` arm that the live `apps/web/lib/required-actions.ts:30-39` has — any future caller silently returns `null` for every builder questionnaire. Delete it and its test, or make it the single implementation with `ACTION_ROUTES` injected. **Must happen before 6.2**, or the consolidation regresses routing |
| 6.2 | **One shared captain gate module (`guardConsole` shape)** | M | Returns `{ok:true;session} \| {ok:false;node}` where the `node` **is** `<CaptainLock>` — composes exactly with Camp 404's shipped preview-but-locked doctrine (D3). Replaces four identical page preludes and three divergent action gates. **Decide up front:** all four call sites hardcode `isLead:false` into `deriveViewerRank`, so the gate must state how `team_lead` resolves (Wave 2 answered this) or it silently changes behaviour. Note `DEFERRED.md:71` is about the *required-actions* gate — consolidating the **rank** gate is unplanned work |
| 6.3 | **`DecisionPanel` — state-machine-gated approve / reject / request-changes** | M | **The best-matched orphan in the donor repo, named by zero harvest docs.** `apps/org/components/decision-panel.tsx` (192 L): `availableReviewActions(status)` gates which buttons exist, `NEEDS_REASON = ["request_changes","reject"]` forces a typed reason into a dialog before the negative actions fire, and a `refusal` prop carries **the exact sentence the server would refuse you with**, rendered next to the disabled control (`DECISION_REFUSAL_ID`, `:41`). That one file answers **WP1** (stale-decision guard), **WP2** (restricted controls must say why) and **WP9** (decision reversal). Pairs with 1.8's compare-and-set and 5.9's reason column |
| 6.4 | **Roster CSV export + column sort** | M | WP9. Reuse 3.3's `csvCell` + BOM helper. Server sorts `displayName asc` only today (`packages/db/src/roster.ts:95`) |
| 6.5 | **`ResponsiveDataTable` + `projectColumnsToCard`** | M | Hard-depends on F2. **Do not migrate the shipped roster onto it** — `roster-list.tsx:61-87` is a deliberately different mobile board (avatar + combined `@handle · flag · country` sub-line + trailing role emoji), not a duplicate column set, and the donor's card projection has no slot for it. Land it for the *next* table (questionnaire responses). Both layouts stay in the DOM, so Playwright needs `.filter({ visible: true })` |
| 6.6 | **`capabilityPendingMessage` + `DisabledHintTile` treatment** | S | Camp 404's 8 `comingSoon` home tiles render disabled with no explanation and read as broken; the team_lead group is 4-of-4 parked. `capabilityPendingMessage` returns the reason and an **empty string** when not pending, so it drops straight into a `title` attribute. Merge with `reason?`/`tag?` on `CatalogueTile` + the dashed-border/Lock treatment inside `GridTile`'s existing `aria-disabled` branch (`grid-tile.tsx:78-87`) — **do not add a second tile component**; `GridTile` already has a `hint` prop, so half of this is copywriting. Donor reference: `packages/ui/src/components/disabled-hint-tile.tsx` (52 L) |
| 6.7 | **`AccountCapabilityNotice`** | S | donor `packages/ui/src/components/account-capability-notice.tsx` (55 L). Its `if (!verdict.label) return null` design lets call sites pass it unconditionally, so the notice vanishes everywhere at once when a capability flips on. Deliberately **not** an error style ("nothing is broken, and nothing the reader did caused it"). Four hidden-capability sites: `enable-push.tsx:100`, the `aiAvailable === false` branch at `layout.tsx:73`, dormant Telegram, and the parked tiles |
| 6.8 | **`AUTH_CAPABILITIES` matrix + mount `<SecuritySettingsCards/>`** | M | **Do not port the donor's 1,916-line `account-*` suite.** `@neondatabase/auth/react/ui` — already imported at `apps/web/app/auth/[path]/page.tsx:2` — exports `SessionsCard`, `PasskeysCard`, `TwoFactorCard`, `ChangePasswordCard`, `ProvidersCard`, `DeleteAccountCard`, `SecuritySettingsCards` and `PasswordInput`. Mounting the composite is a 30-minute probe; do that first. Then encode the uneven provider story as machine-checked data, keeping **all three** support states — `client_only` is the live state for `changeEmail`, `unlinkAccount`, `linkSocial`, `forgetPassword` (0 server hits, present in client typings). Re-derive every entry against `@neondatabase/auth 0.4.1-beta`; a beta dep makes re-verification a habit, which is itself the argument for the matrix |
| 6.9 | **Explicit `cookies.sessionDataTtl` + revocation caveat** | S | The TTL **is** settable (`dist/next/server/index.d.mts:76`, default 300) and `apps/web/lib/neon-auth.ts:25-34` simply omits it. A revoked session can still be honoured for up to the TTL, so any revoke button must say so — and the number it states should be the number the stack uses |
| 6.10 | **Section review threads** (optional, scope-dependent) | M | donor `apps/org/components/section-review-thread.tsx` (197 L) + `section_reviews` / `section_review_replies`. Two-sided per-section comment thread with `status: open \| resolved`. Camp 404 has nothing like it in any questionnaire or approval surface. `section_reviews` gets 9 harvest mentions in prose but **0 ledger rows**, so it carries no verdict — treat as a genuinely unassessed option, not a recommendation |

**Total: 6 M + 3 S (+1 optional M). 6–9 days.**

**Done when:** one gate module backs all four captain pages and all seven action
gates; a captain reversing an approval decision is possible and audited; the
roster exports and sorts; and every disabled tile on `/home` says why in words a
member can read.

**Main risk:** 6.2 changes authorisation on seven surfaces at once. It is a
tidy-up, **not** the fix — the fix was 1.2, in Wave 1. Do not let this wave be
the first time the hole is closed.

---

## Wave 7 — Ops, CI, docs and the test harness

**Goal:** make the repo tell the truth about itself.

| # | Item | Eff | Notes |
|---|---|---|---|
| 7.1 | **Coverage provider install + measure** | M | `@vitest/coverage-v8` is in **zero** of 8 workspaces and no config has a `coverage` key, while `turbo.json:45-47` caches a `coverage/**` nothing writes. Order is fixed: swap the outputs onto a new `test:coverage` task → install → `include: ['src/**/*.ts']` → **exclude `schema.ts`** (1,535 declaration lines; including it would *improve* the number by eight points, which is why it must not count) → **measure** → floor at measured-minus-3. **Skip the 8-shard CI matrix.** Per-file 100% floors on the pure privacy core: `text-redaction.ts`, `access.ts`, `id-validation.ts`, `promotion.ts`, `db/crypto.ts`. Needs F6, or the ~20–30 `server-only` modules under `apps/web/lib` throw the moment `coverage.include` pulls them in. Standing comment to carry verbatim: never lower a floor to green a build |
| 7.2 | **Postgres fixed-window limiter + `action_rate_limit` table** | S–M | Drops in behind Camp 404's existing async `RateLimiter` seam (`apps/web/lib/rate-limit.ts:73-78`) with **zero call-site changes** across 7–12 consumers, and **replaces the planned Upstash dependency** (`DEFERRED.md:75`) with a table. Camp 404's limiter is per-process, so on Vercel the budgets reset on every cold start and multiply by concurrent instances. Three load-bearing details: `bigint("window_start", { mode: "number" })` (without the mode drizzle compares strings — and `schema.ts` imports no `bigint` today), the CTE's `AND key <> ${key}`, and the dual row-shape read `Array.isArray(rows) ? rows[0] : rows.rows?.[0]` (Camp 404 has **zero** `.execute()` sites today, so this is the first place the two drivers differ). Keep the fail-**open** on storage error |
| 7.3 | **`deriveSystemStatus` + `probeDatabase`** (+ `/captains/system`, product-gated) | M | `/api/health` is 7 edge lines that never touch the database, and ~20 optional integrations have no surface saying which are live. **The check SET is a rewrite, not a transcription** — 10 of the donor's 18 checks are Better-Auth-coupled. Three verified traps: `requireDatabaseUrl()` substitutes `BUILD_PLACEHOLDER_URL` (guard on `process.env.DATABASE_URL` directly); `isCampBootstrapped()` returns `true` under E2E mode; the probe carries `import "server-only"` (F6). `CheckRow`/`CheckListCard` are **not independently landable** — they import `CheckTone`/`SystemCheck` from the deriver. Prereq: `apps/web/lib/firebase-admin.ts` reads its three vars inline and exports no resolver, so "derive, don't duplicate" has nothing to call. **The library ships without the page** — every other Camp 404 surface has a numbered impl spec and this route has none |
| 7.4 | **Credential-marker "no secret is ever printed" test** | S | ~40 lines, zero donor coupling. Seed every credential var with one marker **including inside two full `postgres://` URLs**, flatten every string the surface can render, assert no marker survives across every probe outcome — then the *positive* assertion that the DB hostname **is** shown, "so removing it is a decision rather than an accident". Needs F10 |
| 7.5 | **Cron honesty, parts (b) and (c)** | S then M | (b) Self-declaring stub shape `{ok, job, status:"stub", scheduled, message}` on `recipes/analyse`, `manuals/generate`, `notifications/reminders`, `telegram/dispatch` — three run daily in production reporting success for doing nothing, and `recipes/analyse`'s JSDoc claims "every 15 minutes" against a `"0 8 * * *"` entry. (c) `dispatch/route.ts` genuinely has no failure channel: `dispatchDueBroadcasts` returns `{dispatched, deliveries}` with no per-target failures — a `packages/db` signature change plus PGlite tests. Note `/api/cron/telegram/dispatch` is absent from `vercel.json`'s crons array entirely: unscheduled, not a no-op |
| 7.6 | **Sanitiser merge → `RedactionResult`** | M | **Merge, don't choose.** Keep Camp 404's secrets block first (Bearer/JWT/`sk-`/`ghp_`/`AKIA`/`xox*`, token query params, ≥40-char opaque runs) and splice in the donor's depth-counting brace scanner, UUID rule, linear `stripMarkup` and the `RedactionKind[]` channel. Rule **order** is load-bearing and `pattern.lastIndex = 0` is reset twice per rule. **Name collision:** both repos export `sanitizeReportText` from their core barrel with incompatible returns — pick a new export name or migrate three call sites in one commit. The real defect it fixes: Camp 404's **card rule mangles a UUID**, leaking the first half and emitting a false `[card]`; the donor's UUID rule before the card rule fixes both. (Do not repeat the claimed `[phone]3` example — it does not reproduce) |
| 7.7 | **`screenReport` / `describeFlags` injection + third-party screen** | S after 7.6 | Its second argument is `readonly RedactionKind[]` and `third-party-data` — the only flag that withholds diagnostics — derives entirely from it. Sequence 7.6 first, or ship only `addresses-reader` + `requests-disclosure`. Urgency and panic are deliberately **not** flagged. `needsHuman` gates the model call; a flagged report is never handed to the model |
| 7.8 | **Untrusted-content fence + provenance sentence** | S | Two HTML-comment markers plus one blockquote around **both** body branches (the AI branch currently emits bare prose), closed *before* the footer. Camp 404 files into a **public** repo whose issues its own agents read. `mdInline` already defuses block-level markdown injection, so this is an authority/provenance fix for human and agent readers, not a hole |
| 7.9 | **Feedback pipeline ordering + never-log-the-upstream-body** | S | (a) The `GITHUB_FEEDBACK_TOKEN` check sits at `:114` — after both rate limits **and a paid Anthropic call** — so on a token-less deploy every attempt burns a slot and a model call to reach "isn't set up yet". (b) `:171-174` logs GitHub's error body, which on a 422 echoes the submitted report into Vercel's logs. Also fix the voice rate-limit window: `{limit:30}` with no `windowMs` and a `60_000` default makes it 30/**minute**, 60× looser than intended |
| 7.10 | **Delete `severity` from the AI schema and issue body** (gated on **D-D**) | S | Four code sites plus `design/feature-set/25-global-feedback-dialogs.md:27` |
| 7.11 | **`.github/` governance set** | S each | Dependency order: `SECURITY.md` → issue `config.yml` (its advisory link) → `bug.yml`/`feature.yml` → labels → `issue-forms.test.ts`. Camp 404 is a **public repo storing SA IDs, passports and bank details with no private-reporting path** — the bug form's two required privacy confirmations and its "stop at the `?`" URL rule are the load-bearing parts. PR template: pre-fill Database and Expected follow-ups with `None.` ("a real answer that means something different from silence") and put long prose in a collapsed `<details>` so it cannot bury the migration note. **`SECURITY.md` correction:** the required check is named `ci-pass`, not `CI pass`. Also: do **not** describe the ID columns as pgcrypto-encrypted — `packages/db/src/crypto.ts:13-18` says pgcrypto is *not* used (Node AES-256-GCM with a `PGCRYPTO_KEY`-derived key), despite what `AGENTS.md` and `schema.ts` say |
| 7.12 | **`GITHUB_LABELS` taxonomy as code + `issue-forms.test.ts`** | S + M | Port **28** labels unchanged **including all four `priority:` labels** (both the forms test and the triage contract depend on them); delete the 3 `app:` labels; substitute 8 Camp 404 areas. Hard limits the test enforces: description ≤ 100 (**GitHub 422s — that is how the donor's first sync failed**), `/^[0-9a-f]{6}$/`, name ≤ 50, no duplicates. **Prerequisite:** `labels-sync.ts` imports `GITHUB_LABELS` from a zod module, so extract the taxonomy to a plain-object module first. **Kill the sync script** — `apps/web/lib/github-feedback.ts:30-32` says missing labels are auto-created by the issues API on first use. The test's first assertion is the generalisable one: `files.length > 0`, because a glob matching nothing passes every `for` loop in silence |
| 7.13 | **AGENTS.md §Verification + four operational traps + `UNRESOLVED` markers** | S | The most portable passage in the corpus (donor `AGENTS.md:216-260`, `:71-90`). Two named false-passing shapes, **both live here**: asserting an absence against a page that has not rendered (11 `toHaveCount(0)` sites across four specs; `toHaveURL` resolves before paint) and a fixture whose values sit outside the domain vocabulary — aim that one at the untyped `text` columns (`audit_log.action`, `questionnaireKey`, `definitionKey`), not at `_factories.ts`, which TypeScript already guards. Also add the two Postgres traps: **widening a unique index to include a nullable column silently drops uniqueness** (Camp 404 is one line away — `questionnaire_responses.activationId` is nullable at `schema.ts:1521-1524` while `questionnaire_responses_user_def_idx` at `:1529-1532` is still `(user_id, definition_key)`), and **`ON CONFLICT` against a partial unique index fails 42P10 unless the statement repeats the predicate** (two partial unique indexes at `schema.ts:522-524`, `:571-573`) |
| 7.14 | **e2e harness primitives** | S each | `appAlerts` — a 17-line file that makes `toHaveCount(0)` on alerts **expressible at all** (Next injects `#__next-route-announcer__` with `role="alert"`; Camp 404 found the trap and inlined a weaker workaround in two specs). `mobile-360` — five config lines for the viewport the product is designed for and has never tested; ship it on a **nightly workflow with no `pull_request` trigger** plus a `desktopOnly()` escape hatch, because GitHub renders a literal `${{ matrix.label }}` for a skipped matrix job. The anon and onboarding-gate route loops need the **positive-proof** assertion — a URL assertion alone is satisfied by a blank document. Plus `forbidOnly: IS_CI` (a stray `test.only` silently narrows a green CI run to one test) |
| 7.15 | **CI/turbo hygiene** | S | Workflow-level `permissions: contents: read` (7 of 8 jobs inherit the repo default token while running build tooling); `X-Frame-Options: DENY` + HSTS into the existing `apps/web/vercel.json:11-27` array (four of six already ship — **do NOT copy the donor's `Permissions-Policy`**, its `camera=(), microphone=()` would kill the voice recorder and avatar capture; Camp 404's `(self)` form is ahead, and do **not** add a `headers()` key to `next.config.ts`); `typecheck.dependsOn: ["^build","build"]` (`typedRoutes:true` generates route types at build, so a bare `tsc` sees stale ones); neon-pr-cleanup **two** fixes (`pull_request_target` + cursor pagination — `permissions: contents: read` is already present at lines 18-19; the half that will actually fire is that under `pull_request`, a Dependabot-actor close gets the empty Dependabot secret store, `NEON_API_KEY` resolves to nothing, and the job leaks the branch it exists to delete); turbo `globalEnv` union (`GOD_EMAILS`, `INVITE_CODES`, `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPO`, `MCP_PUBLIC_URL`, `VERCEL_URL`, `NEON_LOCAL_PROXY`, `E2E_TEST_MODE`, `DATABASE_URL_UNPOOLED`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_VERCEL_ENV`, `RESEND_API_KEY` — verify each against source before committing); `planMigration()` / `isPoolerConnection()` alone from the donor's 280-line migrate runner (**skip the runner** — it exists to serialise three concurrent Vercel builders; Camp 404 has one) |
| 7.16 | **commitlint** (gated on **D-E**) | M | Not a drop-in. See D-E |

**Total: 5 M + 1 S–M + ~10 S. 6–9 days.**

**Done when:** `pnpm test:coverage` produces a number and CI floors it; every
cron route returns 500 on failure or declares itself a stub; `SECURITY.md`,
issue forms and the PR template exist; `AGENTS.md` carries the Verification
section, the four operational traps and the two Postgres traps; and the mobile
viewport is exercised nightly.

**Main risk:** 7.1 is where "measure first" gets skipped. Do not write a
threshold number before the provider is installed and a run has happened. And
`schema.ts` must be excluded or the number is a lie in your favour.

---

## Wave 8 — Elective, decision-gated, or genuinely optional

Everything here is real work with a real payoff, and none of it is on the
critical path. Pull items forward when a decision lands or a need appears.

| Item | Eff | Gate |
|---|---|---|
| **Per-`kind` blob token route + `FileUpload` primitive** | M (floor) | The proper structural fix for 1.1. The real cost is generalising `/api/avatar` (hardcoded to the `avatars/` prefix, one `isApproved` gate) into a per-prefix authorisation proxy — a captain manual and a member avatar cannot share one gate. `kind` simultaneously prefixes the pathname, selects the policy and names the clearance. Use Camp 404's existing `ProgressBar` (`role="progressbar"` + the aria triple), not the donor's inline markup. Put it in `apps/web/components/`, **not** `packages/ui` — `packages/ui` has no `@vercel/blob` and this would be its first network dependency. **Do NOT** gate `/api/uploads/avatar` with `isApproved`: the uploader runs *inside* onboarding (`apps/web/app/onboarding/questionnaire.ts:119`) and `design/feature-set/22-avatar-media.md` records the asymmetry as intentional — the gate belongs on a future non-onboarding kind |
| **`payments` table + dues ledger** | M | **Blocked on D-C.** `users.dues_paid` is written by nothing. Donor `schema.ts:1682` — polymorphic `(subject_type, subject_id)`, `amount_cents`, `currency`, unique human `reference`, `status ∈ pending/reconciled/waived`, `recorded_by_user_id`. Do not build a dues ledger with no cycle key |
| **`member-ref-code.ts`** | S | Only once a dues write path exists. Technical rule for when it lands: derive the prefix **once at bootstrap and store it** — a derived code re-keys itself silently whenever an input moves, and a member editing their display name must not change the reference their treasurer already wrote on a bank statement. `users.ref_code` needs a nullable column + a **partial** unique index `WHERE ref_code IS NOT NULL`, backfilled in the CLI, never in the migration |
| **`RegistrationSummary` / S27 completion screen** | M | donor `apps/web/components/registration/registration-summary.tsx` (467 L), named by zero harvest docs. Read-only post-submission view: status banner + read-only sections + per-section feedback threads. Simultaneously WP4's S27 screen, WP10's missing read-back surface, and half of builder Phase E. Pairs with `navigateOnwards` — classify that as **pre-emptive, not a fix**: no hang exists today, but `builder-wizard.tsx:162` calls `onComplete?.()` and `runner.tsx:21-30` passes **no `onComplete`**, so a member finishing a blocking questionnaire lands nowhere, and the first person to fix that with `push(); refresh()` walks into the donor's bug. The sweep is ~15 call sites, not 2 |
| **`bucketSubmissionsByMonth` + `RegistrationsChart` + measured-bar funnel** | S each | Pure Date/Map/Math with a UTC round-trip, zero deps, server component, a11y done, 3 token swaps. The chart throws on `points=[]` — add an internal guard |
| **`security_events` table** | S | **Skip unless a per-account security feed is wanted.** Six of nine donor kinds have no producer here |
| **`docker-compose.local.yml` + `NEON_LOCAL_PROXY`** | S | Runs the whole stack incl. E2E off a laptop. Relevant because `docs/e2e-true-auth.md` is blocked partly on "where does Neon Auth store identities". **Do not lift `configureLocalProxy` verbatim** — the donor calls it from `createHttpDb` then immediately branches away into a WebSocket read pool because the `fetchEndpoint` path it just configured is the slow one. Port the read-pool swap with it or don't bother |
| **Client-error ring buffer + `ReportDiagnosticsPanel`** | S each | **Recorded as out of scope** (`docs/superpowers/specs/2026-05-31-shake-to-report-design.md:77`). Technically sound if reopened; propose reopening with what changed, don't frame it as filling an oversight. If it lands, `ReportDiagnosticsPanel` is mandatory — without it the other two are a privacy regression |
| **`ReportLauncher` corner pill** | S | Reverses a decision recorded in four design docs plus commit `655c5e1` ("remove the floating button (shake-only)"). The underlying problem is real — shake is the only trigger, so the reporter is unreachable on desktop and on sensor-less devices — but that is an argument to reopen, not to ignore. If root-mounted it **must** carry `FeedbackGate`'s client-session gate |
| **Invite revoke + a "my invites" list** | S | `revokedAt` and `invite_codes_created_by_idx` already exist and are unused. The donor's own `revokeInvite` is *weaker* (it stamps `usedAt`), so only the `isNull` guard idiom transfers |
| **`AckRow` (≥44px), `deriveWizardProgress` blocked state, `cursor:pointer` base layer, `humanDuration`, `FakeDb`, `sqlLogger`** | S each | Genuine but small. `AckRow` must wrap Camp 404's **Radix** checkbox — the donor's is a native input. `deriveWizardProgress` lands in `packages/core`, not `packages/ui`. `FakeDb` complements PGlite rather than competing: PGlite proves the SQL is valid, the fake proves which **columns** a query asked for. `sqlLogger` is low value — the donor's own 152 ms rationale applies only to environments that don't ship |

---

## Not doing — and why

Blunt, because this is an internal tool for 30–80 people.

- **The org console and supplier portal** (52 + 59 donor files). No analogue.
  The donor's own audit calls them "close to being the same application twice"
  (~2,000 duplicated lines).
- **All Better Auth provider tables, 2FA, passkeys, `withReauth`.** Verified in
  the installed typings: `twoFactor`/`totp`/`backupCode`/`passkey` are **0 hits**
  in both `dist/next/index.d.mts` and `dist/next/server/index.d.mts`, and the
  runtime plugin array is a closed list of six. Mount the vendor cards instead.
- **The donor's 1,916-line `account-*` UI suite.** Reimplementing shipped vendor
  cards is the wrong move at any threat model.
- **`/directory`.** The donor's directory lists camps, not people, deliberately.
  Its reasoning is an argument *against* widening what `/captains/camp-management`
  already exposes.
- **The 280-line migration runner, the 8-shard coverage matrix, the labels sync
  script, the `report-server` subpath.** Enterprise machinery for problems one
  Vercel project does not have. (Camp 404 forbidding server code in `core` is a
  *stricter, better* rule than the donor's subpath.)
- **`account_deletion_requests` / the 14-day grace machine.** Recorded owner
  decision. See D-F.
- **The donor's `editions` table.** The *question* it raises matters (D-C); the
  table does not.
- **The donor's 15-kind `Question` union wholesale.** 8 kinds overlap, each side
  has 6–7 the other lacks. A wholesale copy is an XL rewrite of the authority
  the builder canvas, `classifyChange` and every stored response depend on.
  Lift one arm at a time.

---

## The quick-win list

Every effort-**S**, value **high|medium**, verdict **MISSING|PARTIAL** item, as a
checklist. Grouped by wave so it stays sequenced. Each line is meant to be
startable without reopening the analysis.

Donor root below is
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`.
Camp 404 root is `/home/ryan/repos/Personal/camp-404`.

**Universal renames on every lifted file:** `@quagga/` → `@camp404/`; donor
self-referential specifiers (`@quagga/ui/components/badge`) → **relative paths**
(Camp 404's `packages/ui` has zero `@camp404/*` imports and has never exercised
self-reference resolution); `pnpm format` after every paste (donor files are
uniformly semicolon'd, several Camp 404 UI files are not); write the
`.stories.tsx` in the same commit (Storybook 10, the donor has none).

**Universal greps before merging any lifted file:**
`rg 'ab-'` (the `--color-ab-*` brand ramp compiles to **nothing** with no warning
— a lifted `file-upload.tsx:236` renders an invisible scrim);
`rg 'href=|redirect\(|router\.push\('` (`typedRoutes:true` at
`apps/web/next.config.ts:13` turns every donor route string into a `tsc` wall);
`rg 'onCheckedChange|onChange.*checked|variant="privacy"'` (four component API
collisions — port the donor's checkbox and switch under **new names**, never
converge two primitives during a port).

### Wave 0

- [ ] **Skeleton kit.** Copy donor `packages/ui/src/components/skeleton.tsx` (204 L, **nine** exports — several units miscounted eight) + `packages/ui/src/components/__tests__/skeleton.test.tsx` → same paths under `packages/ui/src/`. Edits: relative `cn` import; `animate-pulse` → `motion-safe:animate-pulse` (**one** occurrence, at `:35`); `pnpm format`; add `skeleton.stories.tsx`. Test: the donor's, unchanged.
- [ ] **`table.tsx`.** Copy donor `packages/ui/src/components/table.tsx` (118 L) → `packages/ui/src/components/table.tsx`. `packages/ui/src/lib/utils.ts` is byte-identical, so `cn` needs no work. Keep `TableCaption`'s `sr-only` (it exists because a screen reader announced "table" twice). Test: assert the root's `relative w-full overflow-x-auto`.
- [ ] **`decryptField` tri-state.** Paste donor `packages/db/src/crypto.ts:87-113` **below** `decryptOrNull` in `packages/db/src/crypto.ts`; keep both. Migrate only the safety/ID readers; the other five `decryptOrNull` sites stay. The `catch` deliberately logs nothing. **Never touch `KEY_SALT`.** Test: ok / absent / unreadable.
- [ ] **`crypto-guard.ts`** (19 L) → `packages/db/src/crypto-guard.ts`. Drop the donor's request-time no-key throw. Test blocked until the vitest alias lands.
- [ ] **`server-only` vitest alias.** One line into `apps/web/vitest.config.ts` `resolve.alias` (which currently has only `"@"`). Test: any new test under `apps/web/lib/__tests__/` importing a `server-only` module.
- [ ] **`withTransaction<T>` + `Tx`** (12 L) → `packages/db/src/index.ts`, **barrel-exported**. Test: PGlite rollback-on-throw. Then start collapsing the 15 hand-rolled `createPooledDb()`/`finally { pool.end() }` sites opportunistically.
- [ ] **`runAction` / `ActionResult`.** Copy donor `apps/suppliers/lib/actions/result.ts` (18 L) → `apps/web/lib/action-result.ts`. **Map the error to a generic string and `console.error` the original** — a blanket `catch → error.message` leaks DB text, and packages/db errors nest under `.cause`. Test: thrown DB error yields the generic `{ok:false}`.
- [ ] **`privacy.ts` field classes** → new `packages/core/src/privacy.ts`. Re-express for JSONB answers, not columns (see F9). Skip the 19-row bio registry. Test: `locked` derivation.
- [ ] **`redactSecrets`** → `packages/core/src/text-redaction.ts` beside `redactPii`. 14 env names. Keep the `>= 8` length guard. Test: markers seeded into two full `postgres://` URLs.
- [ ] **`.gitattributes`** with `*.pen -merge` + the two other lines (drop `design/brand/**`). Verify with `git check-attr merge design/app.pen`.
- [ ] **Dated correction blocks** on the six stale claims + the e2e README's "13-page wizard". Format: donor `docs/roadmap.md:30-33`. Keep the original text.
- [ ] **`git add apps/web/tests/e2e/lib/`** — the untracked 141-line `mailtm.ts`.

### Wave 1

- [ ] **Avatar prefix collision.** `apps/web/components/questionnaire/question.tsx:364-373` — pass an explicit `uploadUrl` pointing at a new route whose prefix is not `avatars/` and which does **not** call `deleteAvatarBlobs`. Test: upload a questionnaire image, then read `users.profile_image_url`'s blob and assert it still exists.
- [ ] **`isApproved` in `camp-management`'s `requireCaptain`.** `apps/web/app/captains/camp-management/actions.ts:92-110` — add the check and copy the comment from `camp-settings/actions.ts:52-56`. Then `tools/invite/actions.ts:52-58` and `tools/forms/[key]/actions.ts:31-33`. Leave `notifications/page.tsx:22-24` alone pending owner confirmation. Test: a `captain`/`pending` fixture is refused by `getMemberDetailAction`.
- [ ] **`encryptOrPreserve`.** Give `packages/db/src/id-documents.ts:43` `idColumnsFor` a `stored` parameter (keep it pure). Three call sites: `apps/web/lib/users.ts:415`, `apps/web/lib/mcp/tools/profile.ts:91-99` and `:452-459`. Reference: donor `apps/web/lib/bio-store.ts:338-347`. Test: PGlite round-trip where the stored ciphertext is unreadable and the re-save preserves it.
- [ ] **Tombstone-aware captain count.** `and(eq(rank,'captain'), eq(sanitised,false), eq(isSystem,false))` at `packages/db/src/bootstrap.ts:23-26` **and** `:75-78`; plus `rank: "member"` in `sanitisedUserPatch` (`packages/db/src/account.ts:22-42`). Test: erase the sole captain, assert `isCampBootstrapped()` is false.
- [ ] **Delete `default: ids = []`** at `packages/db/src/audience.ts:59-60`; replace with `const _never: never = broadcast.scope`. Add the label-completeness test in both directions next to `apps/web/lib/__tests__/camp-config.test.ts:41`, and add `drivers` to `send-form.tsx:39`'s `Scope` union.
- [ ] **`includeIdDocuments` on `getCampMemberDetail`.** `packages/db/src/roster.ts:155-200` — one options object, one conditional spread over `passportEncrypted`/`saIdEncrypted`; update both callers at `camp-management/actions.ts:139,:194`. Copy the donor's `functionBody()` test helper **verbatim including its fix** (it skips the parameter list before finding the body, because taking the first `{` after the name broke the moment a parameter carried an inline object type — which is exactly the signature shape being introduced).
- [ ] **Mic unmount leak.** `apps/web/components/voice/use-voice-recorder.ts` — assign `streamRef.current` before/around the `await` at `:117`, guard cleanup at `:77-94`, close the AudioContext at `:129-138`. Add `supported` and hide `DictatePill` when false.
- [ ] **TOCTOU on approval.** Add a status precondition + `.returning()` to `setUserApproval` (`packages/db/src/burner-profile.ts:69-84`); return `{ok:false}` from `decideApprovalAction` when zero rows come back; add the missing `UserId.safeParse`; mirror the guard in `apps/web/lib/test-store.ts`. Plus one `AGENTS.md` line — this is one site, not a sweep.
- [ ] **Content blocks respect `visibleIf`.** One `if` at `apps/web/components/questionnaire/builder-wizard.tsx:237`.
- [ ] **Order-aware `classifyChange`.** `packages/types/src/questionnaire-builder.ts:391-395` — include position in the comparison. Two tests: one asserts the pinned version renders; one proves the bug.
- [ ] **Hidden-field smuggling.** `packages/types/src/questionnaire-builder.ts:296-298` + a key allow-list and size cap on the non-final path at `apps/web/app/questionnaires/[activationId]/actions.ts:73-75`. Record retain-vs-drop in `docs/questionnaire-builder.md §5`.
- [ ] **Cron `ok` derived from `failed`** at `apps/web/app/api/cron/notifications/push/route.ts:17`; return 500. Use `redactSecrets` on the error body at `:22` while you're there.
- [ ] **Split the fused upload branch.** `!token` → **501**; keep `isE2ETestMode()`. Same twin at `apps/web/lib/avatar-blob.ts:23-24` (log, don't silently no-op). Tighten the MIME check against `image/svg+xml`.

### Wave 2

- [ ] **`getTeamsConfig()` on the send page.** `apps/web/app/captains/announcements/send/page.tsx:80-96`; drop the hardcoded `TEAM_LABEL`; map `m.teams` through the label map instead of `join(", ")` at `send-form.tsx:208`. Test: an archived team is absent from the picker.
- [ ] **`audienceLabel(scope, team)`** → `packages/db/src/camp-config.ts` beside `teamLabelMap:54`; replace the other four sites.
- [ ] **`previewAudienceCount`** → `apps/web/app/captains/questionnaires/actions.ts`, reusing `gateCaptain()` at `:70-77`. Build the questionnaire count on `packages/db/src/activations.ts:68-70`, **not** `resolveAudience`. Reject `opt_in`. Port donor tests `apps/org/lib/__tests__/questionnaire-actions.test.ts:209-246`.
- [ ] **`<AudienceCount>`** → `packages/ui/src/components/audience-count.tsx` + test. `null` hides, `0` shows. Take only the first `describe` of the donor test.
- [ ] **`canSendToAudience`** → new `packages/core/src/audience-authz.ts` (~25 L), from donor `packages/core/src/questionnaire-authz.ts:58-70`.
- [ ] **`roleNameConflicts(existing, candidate, exceptNormalized?)`** into `packages/db/src/camp-config.ts:107-118`; reuse the existing `slugify` as the normaliser. Test: renaming a team to a case variant of *itself* passes; to a case variant of another team fails.
- [ ] **Named refusal instead of a disabled button.** `send-form.tsx:148-151` — `canSubmit` disables with no reason; toast "Pick an audience" (donor `apps/org/components/questionnaire/activation-form.tsx:147`).

### Wave 3

- [ ] **Frozen v1 fixture + `KIND_SAMPLES`.** Donor `packages/core/src/__fixtures__/questionnaire-v1.ts` and `packages/types/src/__tests__/question-fixtures.ts` → `packages/types/src/__tests__/`. Copy the DO-NOT-MODERNISE header verbatim. **Land before any question-kind change.**
- [ ] **CSV export.** Donor `apps/org/components/questionnaires/results-view.tsx:505-609` → new `apps/web/app/captains/questionnaires/[key]/[activationId]/csv.ts`, with `csvCell` + BOM extracted to a shared helper. Keep `\r\n`, quote-doubling and the BOM at `:587-589`. Swap `optionLabelMap` for `displayResponseValue`. Test: a member name with a comma and an accent round-trips.
- [ ] **`ResponseViewer` dialog.** Donor `apps/org/components/questionnaire/response-viewer.tsx` (97 L) → `apps/web/app/captains/questionnaires/[key]/response-viewer.tsx`. Height caps `max-h-[85svh]` / inner `max-h-[60svh]`.
- [ ] **`tallyActivationCompletion`** → `packages/core/src/questionnaire-stats.ts`. **Camp 404's denominator, not the donor's**: `completed / (pending + completed)`, plus a `closed = waived + expired` bucket. `=== 0 ? 0 : Math.round(...)`.
- [ ] **`duplicate_id` + `invalid_range` checks** into `validateBuilderQuestionnaire`, under the existing `string[]` return. Copy the donor's five messages **and** their assertions verbatim.
- [ ] **`TextFormat` + `checkTextFormat`.** Donor `packages/types/src/questionnaire.ts:48-59`, `:539-575` → `packages/types/src/questionnaire.ts`; call inside `validateOne` (`:438-547`) with an explicit `q.kind === "short_text"` narrowing or it type-errors against `LongTextQuestion` (`:503-509` is a shared arm). Bring `__tests__/questionnaire-text-format.test.ts`. Decide `format:"number"` vs the existing `number` kind and say which in the palette.
- [ ] **`other:` encoding.** Four exports (~15 L) from donor `packages/types/src/questionnaire.ts:25-45`. **Three things together:** `allowOther` on the two choice kinds, the reserved-prefix definition-time guard, and an arm in `displayResponseValue` (`:321-348`) so a stored `other:pizza` doesn't render raw.

### Wave 4

- [ ] **`listPendingQuestionnaires`** — a sibling of `getPendingRequiredActions` minus `eq(blocking,true)`, plus a `type='questionnaire'` filter. No join needed: the fields are already selected at `packages/db/src/activations.ts:215-222`.
- [ ] **`BlockingBadge({blocking})`** — generalise `RequiredChip` in `apps/web/components/questionnaire/blocking-chrome.tsx:14-21`; thread `activation.blocking` (already selected at `activations.ts:236`) into `runner.tsx` via the existing `"onboarding" | "runner"` union at `builder-wizard.tsx:67`. Ship with the item above.
- [ ] **Resend adapter** behind the existing dispatch cron; add `RESEND_API_KEY` to `turbo.json` `globalEnv`. `notification_deliveries.channel` (`schema.ts:903`) already exists.
- [ ] **`(user_id, created_at DESC NULLS LAST)` index** on `notification_deliveries` (`schema.ts:961`). Index only — **not** the `.limit()`, which reverses `09-notifications.md:175`.
- [ ] **`groupByDay` + `dayGroupHeading` + day-group rendering.** Donor `packages/core/src/notifications.ts:368-411` (44 L) → `packages/core/src/notifications.ts`; copy module-private `dayKey` (local calendar, deliberately not UTC). Document `listInbox`'s `desc(createdAt)` as a precondition **in the file**. Render as headings over the existing `gap-3` card stack, not a lifted list.
- [ ] **`readRate` + read-rate bar.** `packages/core/src/` + one correlated `count(*)::int … and nd.read_at is not null` subquery beside `packages/db/src/broadcasts.ts:129-137`. Three donor test cases verbatim.
- [ ] **Body clamp.** `line-clamp-3` at `apps/web/app/notifications/notification-row.tsx:66`; `line-clamp-2` at `announcements-manager.tsx:406-408` and `:456-458`. Ship the `15-announcements.md:176` spec edit with it.
- [ ] **`notificationMentionsAny`** (12 L) → `packages/core/src/notifications.ts`, **with its tests** — especially the non-vacuity case ("Your phone +27821234567 was updated") and the blank-needle case. Seed Camp 404's own secrets.

### Wave 5

- [ ] **`writeAuditEvent` migration + first writer**, together. Take the **suppliers** copy (`apps/suppliers/lib/audit.ts:13-28` — typed `DbOrTx`). Rename `subject`→`target`, `meta`→`metadata`. Add `.$type<Record<string,unknown>>()` to `schema.ts:1188` **first** or the parameter will not typecheck. Indexes `audit_log_target_idx` + `audit_log_created_at_idx` in the same generated migration.
- [ ] **Safety-access predicate** (~15 fresh lines, do not port the donor's 142) → a 9th `packages/core` module. `{isSelf, isCaptain, actorLeadTeamKeys, subjectTeamKeys}` → basis `"self" | "captain" | "team_lead"`, fail-closed. The `team_lead` branch is inert until Wave 2.
- [ ] **`MEDICAL_AUDIENCE_NOTE`** constant (donor `packages/core/src/bio.ts:145-157`) → `packages/core/src/`, referenced by the dietary/emergency questionnaire copy.
- [ ] **`schema-invariants.test.ts`.** Donor `packages/db/src/__tests__/schema-invariants.test.ts:38-89` + `:21-35`, `:168-191` → same path. Swap `burner_bios` → `burner_profiles`; scope the `notNull === false` assertion to the three `users` columns and allowlist `reimbursements.account_details_encrypted` with a comment naming `account.ts:122`.
- [ ] **`formatDateTime` + `relativeTime`** → `apps/web/lib/audit-format.ts`. Platform `Date`, UTC round-trip, no new package.
- [ ] **`account.sanitized` proof row** + `patchLeaksAny` / `uncoveredHardLockedFields` against `packages/db/src/account.ts:55-80`.

### Wave 6

- [ ] **Delete `packages/core/src/access.ts:94-104`** (the second `nextGate`) and its test — or make it the single implementation with `ACTION_ROUTES` injected. **Before** any gate consolidation.
- [ ] **`capabilityPendingMessage`** + `reason?`/`tag?` on `CatalogueTile` + the dashed-border/Lock treatment inside `GridTile`'s existing `aria-disabled` branch (`packages/ui/src/components/grid-tile.tsx:78-87`). `GridTile` already has a `hint` prop — half of this is copywriting for the 8 `comingSoon` tiles in `apps/web/app/home/tile-catalogue.ts`. **Do not add a second tile component.**
- [ ] **`AccountCapabilityNotice`** (55 L) → `packages/ui/src/components/capability-notice.tsx`. Four call sites: `enable-push.tsx:100`, the `aiAvailable === false` branch at `layout.tsx:73`, Telegram, the parked tiles.
- [ ] **Mount `<SecuritySettingsCards/>`** from `@neondatabase/auth/react/ui` (already imported at `apps/web/app/auth/[path]/page.tsx:2`) — a 30-minute probe before deciding anything else about account security.
- [ ] **Explicit `cookies.sessionDataTtl`** at `apps/web/lib/neon-auth.ts:25-34`, and state the number in the revoke copy.

### Wave 7

- [ ] **Credential-marker test** (~40 L) — markers inside two full `postgres://` URLs; the positive assertion that the DB hostname **is** shown.
- [ ] **Untrusted-content fence** — two HTML-comment markers + one blockquote around **both** body branches in `apps/web/lib/github-feedback.ts`, closed before the footer.
- [ ] **Feedback pipeline order** — move the `GITHUB_FEEDBACK_TOKEN` check ahead of the rate limits and the Anthropic call; stop logging GitHub's error body at `:171-174`; set an explicit `windowMs` on the voice rate limit.
- [ ] **`X-Frame-Options: DENY` + HSTS** — two JSON entries into `apps/web/vercel.json:11-27`. **No `Permissions-Policy`**, no `headers()` in `next.config.ts`.
- [ ] **Workflow-level `permissions: contents: read`** in `.github/workflows/ci.yml`, after `concurrency:` and before `jobs:`.
- [ ] **`typecheck.dependsOn: ["^build","build"]`** in `turbo.json:41-44`.
- [ ] **`forbidOnly: IS_CI`** in `apps/web/playwright.config.ts`.
- [ ] **neon-pr-cleanup** — `pull_request_target` + cursor pagination (two fixes; `permissions` is already there at lines 18-19). The job has no checkout step, so the switch is safe; keep the same-repo `if:` guard.
- [ ] **turbo `globalEnv` union** — 14 names, each verified against source before committing; the `test`→`test:coverage` outputs move is a **swap**, not an addition.
- [ ] **`appAlerts`** (17 L) → `apps/web/tests/e2e/lib/`; replace the two inlined weaker workarounds.
- [ ] **PR template** — Database and Expected-follow-ups pre-filled with `None.`; long prose in a collapsed `<details>`.
- [ ] **`SECURITY.md`** — and it is the only place that can record "branch protection requires exactly `ci-pass`". Do not describe the ID columns as pgcrypto-encrypted.
- [ ] **`GITHUB_LABELS` as a plain-object module** (extraction first), 28 labels including all four `priority:` ones, 8 Camp 404 areas, `app:` deleted. Then the four issue forms + `blank_issues_enabled: false`. Then `issue-forms.test.ts` — first assertion `files.length > 0`.
- [ ] **AGENTS.md** — §Verification, the four operational traps, the two false-passing test shapes, the two Postgres traps, `UNRESOLVED (flagged <date>)` for D-A, and the privacy-class + anti-monitoring law (Camp 404's current section is three bullets stating no classes, no audit obligation, no anti-monitoring rule).
- [ ] **Stub-cron self-declaration** — `{ok, job, status:"stub", scheduled, message}` on `recipes/analyse`, `manuals/generate`, `notifications/reminders`, `telegram/dispatch`; fix `recipes/analyse`'s JSDoc, which claims "every 15 minutes" against `"0 8 * * *"`.

---

## Critical path to "feature-complete"

**What "feature-complete" means here, from Camp 404's own docs:** the twelve open
work-package issues **WP1–WP12 (#125–#136)** closed, plus **questionnaire builder
Phase E** (`docs/questionnaire-builder.md` §9 — metrics, responses table,
per-respondent view, CSV, reminders; zero code exists today), plus the two
specced-but-unbuilt surfaces `25-global-overlays` and `27-questionnaire-complete`
from `design/spec/impl/build-coverage-audit.md`. That is the definition the
repo's own artefacts support. WP0 (#124) is closed, shipped as `c732ee1`.

Two caveats on that definition, both important:

1. **The WP issue numbers are not verifiable from the working tree.** Four units
   grepped `DEFERRED.md`, `AGENTS.md`, `docs/` and `design/` and found nothing;
   the GitHub MCP server failed to connect this session (and again in this one).
   They were verified once, via `gh issue list`, by the baselines agent. Treat
   every "already planned in WPn" as an external tracker pointer. The only asks
   citable verbatim in-repo are `DEFERRED.md:71` (redirect-ladder consolidation)
   and `DEFERRED.md:66` (invite-code case handling).
2. **This plan gets you roughly half of it.** The donor covers WP1, WP2, WP4,
   WP7, WP9, parts of WP5/WP10/WP11, and Phase E. It covers **none** of WP8
   (motion/a11y, 40 findings, zero donor hits), WP3 (captain-promotion UI —
   design reference only), WP6 (the keystone, Camp 404 work), WP12, Telegram,
   the MCP captain tier, or the mobile build.

**The shortest ordered sequence:**

```
Wave 0  foundations                      3–5 d   ┐ nothing ships without these
Wave 1  live defects                     3–5 d   ┘ two of them need F3/F4

Wave 2  team_memberships write path      4–6 d   ← unblocks 8 downstream items
Wave 3  questionnaire read-back          7–10 d  ← needs F2; the Phase E payoff
Wave 4  delivery                         7–10 d  ← 4.10 needs Wave 2
Wave 5  privacy + audit                  6–9 d   ← needs F3/F5/F9; 5.3 needs Wave 2
Wave 6  console hardening + roster ops   6–9 d   ← 6.2 needs Wave 2's team_lead rule
Wave 7  ops / CI / docs / e2e            6–9 d   ← 7.1 needs F6

                              TOTAL     42–63 working days
```

**8–13 weeks for one developer**, or 6–9 weeks with two people running the
parallel tracks below. Add the non-donor half of the roadmap (WP8, WP3, WP6's
product surface beyond the write path, MCP, Telegram, mobile, the orphaned
tables) and feature-complete is materially further out — that work is not sized
here because this exercise has no source material for it.

**Assumptions this range rests on, each of which would move it if wrong:**

- **`server-only` resolution.** Camp 404 already ships `import "server-only"` in
  three `apps/web/lib` modules with a green suite, but nothing in `apps/web/lib`
  is directly unit-tested today, so the alias may be a no-op or may be load-bearing.
  Unit 13's verifier reproduced the throw. **Check this on day one** — about a
  third of the S list claims "S with a test."
- **`after()` under Next 16** is imported nowhere in Camp 404 and its behaviour
  is assumed. Wave 5 depends on it firing exactly once.
- **Neon Auth exposes `emailVerified`.** `AuthenticatedUser` is
  `{id, primaryEmail, displayName}` and `SessionUser` reads no verified flag.
  Nobody has confirmed the claim exists. Every "verified-email gate" item is
  blocked on this, and the god-email bootstrap gate is **M, not S**, because of it.
- **PGlite covers the DB tests you need.** The harness exists
  (`@electric-sql/pglite ^0.5.3`, `_harness.ts`, `_factories.ts`) and the
  `__setDbOverride` seam works — but Camp 404 has **zero** `.execute()` sites
  today, so Wave 7's rate limiter is the first place the two drivers diverge.
- **No migration surprises.** Most of the port needs no DDL at all (units 02,
  03, 05, 08, 09, 14, 15, 17, 18, 20, 21, 23 imply zero). Twelve changes need
  one, and three of them are not additive: `notification_deliveries.kind`
  (add with an explicit `DEFAULT`, never a bare `ADD COLUMN NOT NULL`),
  `users.ref_code UNIQUE` (nullable column + **partial** unique index + a CLI
  backfill), and any `ALTER TYPE … ADD VALUE` (prefer `camp_settings.config`
  JSONB, which `renameTeam`/`setTeamArchived`/`moveTeam` already mutate with
  zero DDL).
- **`0000_initial.sql` stays frozen** and migrations stay append-only, per
  `AGENTS.md`. Repo is at `0018_workable_praxagora.sql`.

---

## Parallel vs strictly in series

### Strictly in series — these edges are hard

```
F3 decryptField ──► F4 crypto-guard ──► 1.3 encryptOrPreserve
                 ├─► 5.2 captain ID decrypt audit
                 └─► 5.3 safety-data resolver

F5 $type<>() on audit_log.metadata ──► writeAuditEvent typechecks at all
F5 writeAuditEvent ──► 5.2, 5.3, 5.6 /captains/audit, 5.8 erasure proof row

F6 server-only alias ──► any unit test of apps/web/lib (~30 modules)
                      ├─► F4's test  (explicitly blocked on it)
                      └─► 7.1 coverage over lib/**

F2 table.tsx ──► 3.6 results table, 5.6 audit panel, 6.5 ResponsiveDataTable
F1 skeleton  ──► 5.10 loading.tsx (if D-B says yes)
F9 privacy.ts ──► 5.3 safety predicate, 5.8 completeness provers
F7 withTransaction ──► makes 1.8, 4.4, 5.9 one-liners each

1.4 tombstone count ──► 5.7 sole-captain guard   (it is the guard's data source)
3.1 frozen fixture  ──► 3.9 TextFormat, 3.10 other:, any new kind
3.7 duplicate_id checks ──► 3.8 DefinitionIssue  (change the return type once)
3.2 aggregateResponses ──► 3.6 ResultsView
2.5 previewAudienceCount ──► 2.6 AudienceCount   (the parent must feed a real count)
6.1 nextGate collapse ──► 6.2 shared gate        (or the consolidation regresses routing)
7.6 sanitiser merge ──► 7.7 screenReport         (its 2nd arg is RedactionKind[])
7.1 coverage measure ──► every threshold number anywhere
GITHUB_LABELS extraction ──► labels module ──► issue-forms.test.ts
SECURITY.md ──► issue config.yml's advisory link

★ Wave 2 team_memberships ──► team/team_leads scope resolving non-zero,
    5.3's team_lead branch, 6.2's team_lead rule, any coverage tile,
    the e2e team_lead persona
```

### Genuinely parallel — fan these out

**Track A — data and privacy** (one person, DB-shaped): F3, F4, F5, F7, F9 →
1.3, 1.4, 1.6 → Wave 5 entire.

**Track B — questionnaire** (one person, product-shaped): F1, F2 → 1.9, 1.10,
1.11 → Wave 3 entire. Touches `packages/types` and
`apps/web/app/captains/questionnaires/**` almost exclusively; near-zero overlap
with Track A.

**Track C — platform** (part-time, anyone): F6, F10, F11, F12, F13 → Wave 7
entire. Only 7.1 has a real dependency (F6); the rest is `.github/`, `docs/`,
`turbo.json`, `vercel.json` and `playwright.config.ts` — files no feature branch
touches.

**Serialisation points between tracks:** Wave 2 must land before Track A's 5.3
and before Wave 4's 4.10, and its `team_lead` resolution rule must be written
down before Wave 6's 6.2. Wave 4 mostly overlaps Track B (both touch
`packages/db/src/broadcasts.ts` and the notifications surface) — do not run them
concurrently with different people.

**Never parallel:** two people editing `packages/db/src/schema.ts` in the same
week. Migrations are append-only and generated; two branches each generating
`0019_*` is a merge conflict that resolves silently and wrongly.

---

## Per-wave PR shape

The house rule to apply throughout: **never converge two primitives during a
port** — that is a separate PR, always.

**Wave 0 — 5 PRs.**
1. `feat(ui): skeleton + table primitives` — two components, two test files, two
   stories. Pure additions, no consumers. Reviewable in ten minutes.
2. `feat(db): decryptField tri-state + crypto-guard` — `crypto.ts` additions
   only, no call-site changes. The migration-free half of the PII work.
3. `feat(db): withTransaction + barrel export` — plus **one** converted call site
   as proof; leave the other 14 for opportunistic follow-ups.
4. `chore(web): server-only vitest alias + first lib test` — one line and the
   test that proves it was needed.
5. `docs: dated corrections, .gitattributes, track the e2e mail helper` — no code.

Keep `writeAuditEvent` and `privacy.ts` and `redactSecrets` as three more small
PRs if the above land fast; they have no consumers yet either.

**Wave 1 — one PR per defect.** Thirteen small PRs, not one big one. Each has a
different blast radius and a different reviewer question, and three of them are
security-relevant. Each PR: the fix, the test that names the *refused* or
*preserved* case, and one line in the description saying what was broken.
Exception: 1.2's four sites can share one PR because they are literally the same
four-line check — but the `/notifications` site is **excluded** from it pending
owner confirmation, and the description must say so.

**Wave 2 — 3 PRs.**
1. `feat(db): team membership write path + PGlite tests` — the transaction, no UI.
2. `feat(web): team assignment UI on camp-management` — consumes PR 1.
3. `fix(web): send screen reads the teams config, live audience count` — 2.3–2.7
   together, because they are all the same screen and one review of the team
   vocabulary is better than four.

**Wave 3 — 5 PRs, ordered.**
1. `test(types): frozen v1 fixture + KIND_SAMPLES` — no product change.
2. `feat(core): aggregateResponses + its test companion` — pure, no route.
3. `feat(web): CSV export + shared csvCell helper` — standalone, immediately useful.
4. `feat(web): per-respondent ResponseViewer` — standalone, immediately useful.
5. `feat(web): /metrics and /responses routes` — the L. Consumes 1–4. If it slips,
   the wave still delivered 3 and 4.

Keep 3.7 → 3.8 as two PRs: add the checks under the existing `string[]` return,
then change the return type once, so the type change is reviewable on its own.

**Wave 4 — 6 PRs.**
1. `feat: non-blocking questionnaire delivery` (4.1 + 4.2 together — the badge is
   unreachable without the reader).
2. `feat: Resend adapter + channel wiring` (4.3).
3. `feat(web): /announcements/[id] + delivery-row-as-permission` (4.5 + 4.6),
   with the `09-notifications.md:120` spec edit in the same commit.
4. `feat(web): inbox day groups, read rate, body clamp` (4.7 + 4.8 + 4.9) — three
   small presentational changes on one screen.
5. `feat: announcement scope on the compose boundary` (4.10) — all three sites in
   one PR; splitting them ships a half-scoped announcement.
6. `feat(db): notification kind + payload-builder seam` (4.13 + 4.14) — its own
   epic if it runs long. Migration PR separate from the consumer PR if the
   backfill needs review.

**Wave 5 — 4 PRs.** (a) `writeAuditEvent` + migration + **one** writer, together
— the migration should never land ahead of its first user. (b) safety predicate
+ resolver + consent constant. (c) `schema-invariants` + erasure provers — pure
test additions, trivially reviewable. (d) sole-captain guard + approval decision
reason, which is where the migration for `users.approval_decision_reason` lives.

**Wave 6 — 5 PRs.** (a) `nextGate` deletion, alone, because it is a deletion.
(b) the shared gate module + all seven call sites in one commit — a half-migrated
gate is worse than either state. (c) `DecisionPanel`. (d) roster CSV + sort.
(e) tiles + capability notices + `sessionDataTtl` — the copy PR.

**Wave 7 — many tiny PRs, deliberately.** `.github/` files one at a time in the
dependency order (`SECURITY.md` → `config.yml` → forms → labels → test). Config
changes (`turbo.json`, `vercel.json`, `playwright.config.ts`, workflow
permissions) one file per PR — each is independently revertable and a bad one
breaks CI for everybody. The two real code PRs are `7.1 coverage` (install +
measure + set, in that order, in one PR so the number and its justification
arrive together) and `7.6 sanitiser merge` (which must handle the
`sanitizeReportText` name collision across three call sites in a single commit).

**On every PR that lifts a donor file, put four lines in the description:**
the donor path it came from; what was renamed; `rg 'ab-'` clean; `pnpm format`
run. Those four lines catch the four things that actually go wrong.
