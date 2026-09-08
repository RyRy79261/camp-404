# 07 — roles-permissions

**Headline:** Take the donor's *rails*, not its role systems — one shared captain gate, an anti-lockout guard on the last captain, deletion-cost arithmetic, and an audit writer that runs inside the transaction. The one exception is the role/team-assignment UI, which is the reference implementation WP6 (#130) is blocked on.

**Camp 404 today:** There is no permission model — `rankEnum = ["captain","member"]` (`/home/ryan/repos/Personal/camp-404/packages/db/src/schema.ts:40`) plus a derived `team_lead`, resolved by an ordinal ladder in `/home/ryan/repos/Personal/camp-404/packages/core/src/access.ts:16-52`; no privilege keys, no role rows, no delegation anywhere in the 38-table schema. What exists instead is the preview-but-locked doctrine (D3) applied by a four-step prelude copy-pasted into every captain page and re-implemented per actions file (verified in `apps/web/app/captains/tools/page.tsx:58-72`, `.../announcements/page.tsx`, `.../camp-settings/page.tsx`, `.../camp-management/page.tsx`).

## Take these

| # | Item | Verdict | Rec | Value | Effort | Donor path | Camp 404 destination | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | One captain gate module (`guardConsole` shape) | MISSING | ADAPT | high | M | `apps/org/lib/gate.tsx:16-60` | new `apps/web/lib/captain-gate.ts` (+ retire the 4 page preludes and the 3 action gates) | Four identical page preludes and three divergent action gates; one has a live authz hole |
| 2 | AssignRolesDialog → "Assign teams" | MISSING | ADAPT | high | M | `apps/web/components/camp-members.tsx:227-315` | `apps/web/app/captains/camp-management/member-profile.tsx` (Actions bar, :311/:356/:368) | The UI half of WP6 (#130); `team_memberships` has zero production INSERTs |
| 3 | Sole-captain / anti-lockout guard | PARTIAL | ADAPT | high | S | `apps/org/lib/actions/accounts.ts:97-104,138-152` | `packages/core/src/promotion.ts` (new pure predicate) + `apps/web/app/profile/actions.ts:55-69` | The last captain can delete themselves and the camp is unrecoverable |
| 4 | `writeAuditEvent(tx, …)` + transactional action shape | MISSING | ADAPT | high | M | `apps/org/lib/audit.ts` (26 lines), `apps/org/lib/actions/org-roles.ts:640-661` | `packages/db/src/audit.ts` (new), called from camp-management/camp-settings actions | `audit_log` has **zero** writers (verified); `createPooledDb` (index.ts:56) is the handle to thread |
| 5 | Deletion-cost arithmetic (`DeletionImpact.leftWithNothing`) | MISSING | ADAPT | high | M | `apps/org/lib/org-role-impact.ts` (109 lines, zero I/O) | `apps/web/app/captains/camp-settings/team-settings-manager.tsx`, `.../questionnaires/questionnaire-hub.tsx:79` | Camp 404 has zero deletion-cost arithmetic; archiving a team names no member count |
| 6 | Name validation + conflict detection | PARTIAL | COPY | medium | S | `packages/core/src/project-roles.ts:89-144`, `packages/core/src/name-dedupe.ts:14-70` | `packages/core/src/text-utils.ts` (beside `slugify`), used by `packages/db/src/camp-config.ts:107-118` | **Live bug:** `renameTeam` is a bare `.map` — any string, no length/empty/clash check |
| 7 | `runAction` result wrapper (18 lines) | MISSING | COPY | medium | S | `apps/org/lib/actions/result.ts` | `apps/web/lib/action-result.ts` | Exactly what DEFERRED.md:53-58 asks for; kills 6+ hand-rolled per-file result unions |
| 8 | `canBootstrapGod` — verified-email gate | MISSING | ADAPT | medium | S | `packages/core/src/god-emails.ts:34-41`, `apps/org/lib/session.ts:102-113` | `apps/web/lib/access-control.ts:28-31`, `apps/web/lib/auth.ts:13-17,60-69` | `isGodEmail` never checks verification; `AuthenticatedUser` carries no `emailVerified` |
| 9 | `capabilityPendingMessage` / two-axis disabled-control copy | MISSING | ADAPT | medium | S | `packages/core/src/auth-capabilities.ts:27-66` | `apps/web/app/home/tile-catalogue.ts`, `apps/web/app/home/rank-group-card.tsx:70-71` | 8 `comingSoon` tiles render disabled with **no** `title` — reads as broken |
| 10 | Longhand resolution-matrix test + source-grep guard test | MISSING | ADAPT | medium | S | `packages/core/src/__tests__/org-permissions.test.ts:159-237`, `apps/org/lib/__tests__/org-role-lockout.test.ts:333,478` | `packages/core/src/__tests__/access.test.ts` | 3 ranks × ~10 surfaces is small enough to write out; the technique is already in-house |
| 11 | Consequence-copy tables + refusals that name the fix | PARTIAL | INSPIRE | medium | S | `packages/core/src/org-permissions.ts:331-395,576-691` | `apps/web/app/captains/**/actions.ts`, `packages/ui/src/components/captain-lock.tsx:17` | Camp 404 already does it in miniature (`SEND_PROMOTION_COPY` :76-80, `DECIDE_PROMOTION_COPY`) but nowhere else |
| 12 | `canViewMedicalNotes` + `medicalAccessBasis` | MISSING | ADAPT | medium | M | `packages/core/src/medical-access.ts:114-142` | `packages/db/src/schema.ts:279-282,405-408`, `apps/web/lib/camp-roster.ts` | Emergency contacts + anaphylactic allergies exist, roster shows neither (WP5 #129); gives item 4 its first real `metadata` payload |
| 13 | `hasProjectPermission` + `ProjectPermissions` Zod schemas | PARTIAL | ADAPT | medium | M | `packages/core/src/project-permissions.ts:20-57`, `packages/types/src/roles.ts:280-300` | `packages/core/src/access.ts`, `packages/types/src/roles.ts` | Only if delegation is actually wanted. **Not yet** for 30–80 people |

### 1. One captain gate (`guardConsole`)

Donor shape: `guardConsole(...)` returns `{ ok: true; session } | { ok: false; node }` — a page opens with three lines and *cannot render without calling it* (`gate.tsx:31-33`). It composes perfectly with D3: the `node` **is** `<CaptainLock>`.

The Camp 404 prelude, verbatim from `apps/web/app/captains/tools/page.tsx:58-72` and repeated identically in `announcements/page.tsx`, `camp-settings/page.tsx`, `camp-management/page.tsx`:

```
getAuthenticatedUserOrRedirect() → !hasCampAccess ? redirect("/signup/required")
  → !isApproved ? redirect("/pending-approval")
  → requireClearance(deriveViewerRank(campUser.rank, false), "captain")
```

Two things the gate must decide up front: (a) **every** one of those four call sites hardcodes `isLead: false` into `deriveViewerRank`, so a shared gate must state how `team_lead` resolves or it silently changes behaviour; (b) `apps/web/app/notifications/page.tsx:20-24` checks only `hasCampAccess` and skips `isApproved` entirely — verified.

The sharper defect, on the action side: `apps/web/app/captains/camp-settings/actions.ts` `requireCaptain` (:44-63) checks `isApproved` under the comment *"a captain still held behind vetting can't act"*, while `apps/web/app/captains/camp-management/actions.ts` `requireCaptain` (:92-110) **does not**. So a captain-ranked account with `approvalStatus: 'pending'` can approve/reject applicants, decrypt IDs via `getMemberDetailAction` (:139) and send promotions. That single divergence is the whole argument for one gate module.

### 2. AssignRolesDialog → "Assign teams" (WP6 #130)

`camp-members.tsx:227-315` is a multi-select role assignment dialog driven by a Radix `ToggleGroup` (:288-301). Camp 404's socket is prepared: `member-profile.tsx` already imports `AssignCaptainDialog` (:13) and `RejectConfirmDialog` (:14) and renders an Actions bar at :311 with dialogs at :356/:368; `TeamBadge` chips already render on the roster (`roster-presentation.tsx:148-159`); `team_memberships` (schema.ts:474-490) exists with `is_lead`.

Two things to carry:
- **The optimistic-merge defect**, recorded verbatim at `camp-members.tsx:261-264`: an earlier version replaced the whole id array and stripped the baseline chip off whoever had just been assigned. Camp 404's derived `team_lead` has the same shape of hazard.
- **The write path** (item below): delete + insert of a member's team set must be ONE transaction, which on Camp 404 means `createPooledDb()` — the neon-http driver has no transactions (`packages/db/src/index.ts:44`, pooled handle at :56).

`@radix-ui/react-toggle-group` is absent from both `apps/web/package.json` and `packages/ui/package.json` (verified). **Don't add it** — `packages/ui` already ships `segmented-control` and `option-card-group`, either of which covers a multi-select chip row.

Escalation-guard shape to copy from `roles-store.ts:400-484`: the store's `setMemberRoles` takes `opts?: { allowElevated?: boolean }` (:404), **refuses by default** (:432-446), and the caller computes authority at the *action* layer and passes it down (`camps/[slug]/actions.ts:221-222`) rather than the store re-deriving it.

### 3. Sole-captain guard — the recoverability hole

`deleteOwnAccount` (`apps/web/app/profile/actions.ts:55-69`) checks only `hasCampAccess` and the typed `DELETE` confirmation. No captain count. Meanwhile `isCampBootstrapped()` returns `captainCount > 0 || bootstrappedAt !== null` (`apps/web/lib/bootstrap.ts:25`), so once the latch is stamped `/setup` never reopens.

**Correction to the digest** (see below): an admin CLI *does* exist (`apps/admin-cli/src/index.ts`) — but it doesn't rescue you. `mint-invite --assigns-rank captain` refuses unless `--created-by` names a user whose `rank === "captain"` (:88-92), and `bootstrap-founder` mints `meowzit` with `createdByUserId: null` and **no** `assignsRank` (:154-160), i.e. a plain member invite. So a camp at zero captains is still unrecoverable without direct DB access — the fix is either a `promote --email` CLI command (an afternoon) or the guard itself.

Donor note worth getting right: the donor's guard is **not** a count. `accounts.ts:97-104` refuses any write against a `god` row in either direction, and `god` is absent from `GrantableRank` (:35) — structural untouchability. Camp 404's `captain` *is* a mutable stored value, so a count predicate (`canLeaveCamp(remainingCaptains)`) is an adaptation forced by that difference, not a port. It also lacks the revoke direction entirely: `setUserRank` (`packages/db/src/burner-profile.ts:94`) accepts `"captain"|"member"` but every caller only ever writes upward.

### 4. `writeAuditEvent` — the 26-line drop-in

`audit_log` (`packages/db/src/schema.ts:1180-1197`) has `actor_id / action / target / metadata` and — verified by grep across `apps/` and `packages/` — **zero writers outside the schema file**. The donor's mechanic is one function whose FIRST parameter is the transaction handle (`apps/org/lib/audit.ts`), which is what makes the test name *"no audit row outlives its write"* (`org-role-lockout.test.ts:478`) expressible rather than aspirational. The action shape it enables: guard → Zod parse → `withTransaction` → mutate → `writeAuditEvent(tx, …)` → revalidate. Update audits carry a before/after diff.

### 5. Deletion cost before the click

109 lines of pure zero-I/O arithmetic; `leftWithNothing` (`org-role-impact.ts:73`) is the number that turns a confirmation into a warning. The separation that matters for Camp 404: the *name* query is not run at all for a caller who may not read the addresses (`queries.ts:710-712` throws before fetching) — an absence, not a mask, which is exactly how `rosterForViewer` already behaves. Camp 404's comparators today: `window.confirm(\`Delete "${title}"? This can't be undone.\`)` (`questionnaire-hub.tsx:79`) and a team archive toggle that flips with a "Team archived" toast and no member count (`team-settings-manager.tsx:200-223`).

### 6. Name conflict detection — a live bug, fixable today

`renameTeam` (`packages/db/src/camp-config.ts:107-118`) is verbatim a bare `.map` writing any string as a label: no length cap, no emptiness check, no clash check. Two teams relabelled to the same string render two identical `TeamBadge` chips (`roster-presentation.tsx:148-159`) and the roster filter becomes ambiguous.

Port `roleNameConflicts(existing, candidate, exceptNormalized?)` (`project-roles.ts:113-131`) — the `exceptNormalized` escape hatch (so renaming to a case/punctuation variant of a name's *own* self passes) is the non-obvious half. Camp 404 already has the normaliser's twin in `slugify` (`packages/core/src/text-utils.ts:29-38`: NFKD → strip marks → lowercase → collapse). Optionally also take `trigramSimilarity` / `isSimilarName` / `SIMILARITY_WARN_THRESHOLD = 0.55` (`name-dedupe.ts:27-70`, ~45 lines, a pure reimplementation of pg_trgm's Jaccard-over-trigrams): `roleNameConflicts` stops "Kitchen" vs "kitchen!", this warns on "Kitchen" vs "Kitchens".

## Already covered in Camp 404

- **One resolver, two readers** — `requireClearance` returns `{cleared, viewerRank, requiredRank}` (`packages/core/src/access.ts:43-52`) so the page gates its fetch and feeds `<CaptainLock>` from the same decision. Boolean rather than capability-keyed, but the right shape.
- **Absence, not a mask** — `rosterForViewer` (`apps/web/lib/camp-roster.ts:263`) forks server-side into `PublicRosterRow` (:21) vs `RosterRow` (:41) returning a discriminated union (:253), with two separate actions behind the two shapes (`camp-management/actions.ts:139` captain-gated vs `:194` member-gated). Better than the donor's read/write page split. **Don't re-port.**
- **No self-promotion** — `canSendPromotion` refuses it, surfaced as "You can't promote yourself." (`camp-management/actions.ts:78`); captain promotion is a two-sided handshake.
- **Report what actually happened, on the promotion path** — `decideCaptainPromotion` (`packages/db/src/captain-promotion.ts:115-120`) carries status preconditions in the WHERE and returns null on a non-open row, converted to `{ok:false,error:"This request is no longer open."}` at `notifications/actions.ts:100-102`. The gap is **only** on the approval path (`decideUserApproval` returns `Promise<void>`).
- **Sanitised-account re-animation is already blocked** — `sanitisedUserPatch` (`packages/db/src/account.ts:21-43`) severs `authUserId` to `deleted:<id>` (:28), which `findUserByAuthId` can never match. Different mechanism from the donor's status flag, not a missing one.
- **An admin CLI exists** — `apps/admin-cli/src/index.ts` with `seed`/`wipe-test-data` (both TODO stubs), `mint-invite`, `bootstrap-founder`, `backfill-id-encryption`.
- **Permanence explained where the missing control would be** — `team-settings-manager.tsx:230-234` ("Archived teams stay valid on existing profiles; at least two teams must stay active").

## Deliberately skip

- **The entire org side** — `org_departments` / `org_roles` / `org_role_assignments` / `org_department_domains`, `orgCan`/`orgCanIn`/`orgCanInDomain`, the 8-domain vocabulary, `RolesManager` (1327 lines). It exists solely because the reviewer is a different organisation from the reviewed. Camp 404 collapses that by definition.
- **The officer class** — `OFFICER_CATALOG`, the trigger matrix, the consent state machine, `OfficerRow` (284 lines), `member_role_assignments.consent_edition_id`. Its whole point is a POPIA disclosure channel to an external org, driven by AfrikaBurn's registration schema (sound level, generators, open flame). Camp 404 has no external org and no edition dimension. *Record the dropped consent-expiry property as a decision, not an omission.*
- **`ENGINEER_RANK_CARVE_OUTS`** — models a rank that is broader in reach and narrower in depth. Camp 404 has one tier above member; there is no non-superset ladder.
- **`PROJECT_ROLE_CAP`** — nothing user-creatable to cap; `teamEnum` is 8 fixed values and growth is a migration, a harder cap than any integer.
- **`cross-side-identity.test.ts`** (272 lines) — specifies a boundary between two permission systems Camp 404 doesn't have.
- **`roles-store.ts` as a file** — 1055 lines with `groupId` threaded through every signature and ~half of it officer machinery. Write the ~400 useful lines fresh in `packages/db/src`. Keep two lessons: `cache()` the seed-on-read (measured 27 statements → 2 at `roles-store.ts:99-100`), and never store the role everyone holds — append it at resolve time, which is already how Camp 404 treats `team_lead`.
- **Radix Accordion** — the donor's whole roles screen sits on it; `packages/ui` has none and doesn't define `--animate-accordion-down/-up`. Rebuild the screen against Camp 404's existing primitives rather than adding a dependency for one surface.
- **Deep permission delegation (item 13) — for now.** For 30–80 people with one captain tier, per-role permission objects are machinery in search of a problem. Revisit only when WP12 (#136, "team-lead post to your crew") is genuinely being built.

## DB changes this unit implies

- **None required for items 1, 3, 4, 5, 6, 7, 8, 9, 10, 11.** All of them work against the existing schema — that is most of the value in this unit.
- **Item 2 (WP6):** none — `team_memberships (user_id, team, is_lead)` at `schema.ts:474-490` already exists and has never been written to in production.
- **Item 12:** none for the predicate; `users.emergency_contacts` (:279-282) and `dietary_requirements.allergies` / `is_anaphylactic` (:405-408) already exist. `audit_log` (:1180-1197) already has the columns for the basis string in `metadata`.
- **Item 13 only, if delegation is ever taken:** `project_roles`-equivalent table (`name`, `name_normalized` UNIQUE, `kind`, `color`, `emoji`, `permissions` JSONB, `sort`), a `role_kind` enum (`captain|baseline|default|custom` — drop `officer`), a `role_color` enum (8 curated values, re-picked for Camp 404's OKLCH dark-only palette), and a `member_role_assignments` join. **Read the deploy warning first:** the deploy that moves hardcoded rights into editable rows is the deploy that locks out everyone whose rights used to be hardcoded, because the new table comes up EMPTY on an already-seeded database — and Camp 404's exposure is *worse* than the donor's because `/setup` will not re-run to fix it. Mitigation: insert-if-missing on a stable key, never update.

## Quick wins (effort S)

1. **Fix the divergent captain gate.** Add the `isApproved` check to `requireCaptain` in `/home/ryan/repos/Personal/camp-404/apps/web/app/captains/camp-management/actions.ts:92-110`, copying the comment from `camp-settings/actions.ts:52-56`. Add `isApproved` to `apps/web/app/notifications/page.tsx:20-24`. Test: a captain-ranked, `pending`-approval account cannot reach `getMemberDetailAction`.
2. **Validate `renameTeam`.** Copy `cleanRoleName` / `isValidRoleName` / `roleNameConflicts` from donor `packages/core/src/project-roles.ts:89-144` → `/home/ryan/repos/Personal/camp-404/packages/core/src/text-utils.ts` (rename `Role`→`Team`, reuse `slugify` as the normaliser), call from `packages/db/src/camp-config.ts:108-118`. Test: relabelling two teams to "Kitchen" and "kitchen!" is refused; renaming "Kitchen" → "kitchen" (itself) passes.
3. **Copy the result wrapper.** Donor `apps/org/lib/actions/result.ts` (18 lines) → `/home/ryan/repos/Personal/camp-404/apps/web/lib/action-result.ts`. Wrap `deleteOwnAccount`, the announcements and camp-management actions. Closes DEFERRED.md:53-58. Test: a thrown DB error returns `{ok:false,error}` instead of propagating.
4. **Sole-captain guard.** Write `canLeaveCamp({ isCaptain, remainingCaptains })` in `/home/ryan/repos/Personal/camp-404/packages/core/src/promotion.ts` (pure, DB-free), call it from `apps/web/app/profile/actions.ts:55-69`. Refusal names the fix: "You're the last captain — promote someone else first." Test: last captain refused, second-to-last allowed.
5. **Verified-email god gate.** Add `emailVerified: boolean` to `SessionUser` and `AuthenticatedUser` (`/home/ryan/repos/Personal/camp-404/apps/web/lib/auth.ts:13-17,60-69`), then gate `isGodEmail(email) && emailVerified` in `apps/web/lib/access-control.ts:28-31`. **Ship the companion state from donor `apps/org/lib/session.ts:102-113` in the same change** — a listed-but-unverified address must be told *why*, or on a deployment with no email provider the founder bootstrap becomes a silent lockout. Camp 404 has no email provider wired. Test: donor `e2e/specs/god/god-verified-email-bootstrap-guard.spec.ts:35,51,92` names the three cases, including "verified + listed DOES become god" — the one that catches an over-tight fix.
6. **Explain the 8 disabled tiles.** Copy `capabilityPendingMessage` / `capabilityIsUsable` from donor `packages/core/src/auth-capabilities.ts:58-66` (returns an empty string when not pending, so it drops straight into `title`). Apply at `/home/ryan/repos/Personal/camp-404/apps/web/app/home/rank-group-card.tsx:70-71`, sourced from `tile-catalogue.ts`. Test: every `comingSoon: true` tile renders a non-empty `title`.
7. **First audit writer.** Copy donor `apps/org/lib/audit.ts` (26 lines) → `/home/ryan/repos/Personal/camp-404/packages/db/src/audit.ts` with `createPooledDb` (index.ts:56) as the handle. Wire the first caller inside `decideApprovalAction`'s transaction. Test: source-grep style — every camp-management mutation calls `writeAuditEvent` with the same handle it mutates on.

## Corrections applied

- **REFUTED — "no admin CLI exists".** The digest states `scripts/` contains only `assemble-feature-set.mjs`, `md-fix-tables.mjs` and `pencil/` and concludes the stranded camp is unrecoverable. `apps/admin-cli/src/index.ts` exists with five commands. **The conclusion survives anyway, for a different reason:** `mint-invite` refuses unless `--created-by` resolves to a captain (:88-92) and `bootstrap-founder` mints a code with no `assignsRank` (:154-160), so neither recovers a captain. Verified this session.
- **REFUTED — "DEFERRED.md:71 already plans this consolidation".** DEFERRED.md:71 is about migrating pages onto `nextGate`, which is the *required-actions* (blocking-questionnaire) gate at `apps/web/lib/required-actions.ts:30` — a different mechanism from the captain rank prelude, which none of the four captain pages calls. Consolidating the rank gate is **unplanned work**, not a queued item. Verified this session.
- **REFUTED (digest's own correction, upheld here) — "camp-management/camp-settings have inline checks".** Both have named per-file gates; the real defect is that only `camp-settings`' checks `isApproved`. Re-verified this session at `camp-management/actions.ts:92-110` and `camp-settings/actions.ts:44-63`.
- **REFUTED — sanitised-account re-animation.** Not a Camp 404 gap: `account.ts:28` severs `authUserId` to `deleted:<id>`. Dropped from the recommendations.
- **REFUTED — "the promotion accept path toasts success over an unchanged row".** False; only `decideApprovalAction` → `decideUserApproval` (`users.ts:261-268`, returns `void`) has that hole. Scoped accordingly.
- **REFUTED — god-email severity.** An unverified listed address does **not** reach captain: `ensureCampUser` creates the row with `rank: "member"` (`users.ts:79`) and `isGodEmail` feeds only `hasCampAccess`/`isApproved`. Real, cheap, worth fixing — but **medium**, not high. Downgraded above.
- **REFUTED — the donor's sole-manager guard is a count.** It is structural untouchability (`accounts.ts:97-104`), with no arithmetic to port. The count predicate recommended above is an adaptation forced by Camp 404 storing `captain` as a mutable rank, and is labelled as such.
- **REFUTED — "five optional booleans" for `ProjectPermissions`.** `manage_questionnaires` holds a `ManageQuestionnairesScope` object (`types/roles.ts:280-286`), not a boolean, so item 13 is two schemas plus a sanitiser (`sanitizeOrgPermissions`, `org-permissions.ts:733`), not one.
- **REFUTED — e2e spec size.** The three cited donor specs total 526 lines, not ~1,900 (1,004 across all role/officer specs). The e2e-disabled note is `AGENTS.md:181`, not :133; and `playwright.config.ts:3-6,32` does support an external preview via `PLAYWRIGHT_BASE_URL`.
- **CORRECTED — "a grep for `permission|privilege|role_color` returns nothing".** It returns 4 hits, all comments. The conclusion (no permission model) stands; the stated evidence did not.
- **CORRECTED — donor org capability vocabulary.** The pre-migration list (`read_personal_information`/`write`/`manage_camp_categories`/`manage_accounts`/`read_system`) was retired by migration 0022. Live keys are `create · read · update · delete · personal_information`. Irrelevant to anything recommended here, but don't build against the old list if you go reading the donor.

## Confidence notes

- **High confidence, spot-checked this session:** the divergent `requireCaptain` gates, the four duplicated page preludes with hardcoded `isLead: false`, `notifications/page.tsx` skipping `isApproved`, `deleteOwnAccount`'s missing captain count, the `/setup` latch, `renameTeam`'s missing validation, `audit_log`'s zero writers, `team_memberships`' single test-only INSERT, `isGodEmail`'s missing verification check, `AuthenticatedUser`'s shape, the absence of accordion/toggle-group from `packages/ui`, and the admin CLI's inability to restore a captain.
- **Not re-verified this session (taken from the digest's own verifier, high confidence there):** every donor-side line number, the `ManageQuestionnairesScope` shape, the `roles-store.ts` measured incident, and the `medical-access.ts` org-dependency cut.
- **Unverifiable from either repo:** whether the Neon Auth session object exposes `emailVerified` at all. Quick win 5 is blocked on confirming that; `SessionUser` in `auth.ts:27` is a hand-written loose slice, so the type change is trivial but the *data* may not be there.
- **Medium confidence:** the donor's `settings/roles/page.tsx` details (147 lines, the verifier read the model but not all of the file). Not load-bearing for anything recommended.
- **Judgement, not evidence:** item 13's "not yet". If the owner wants team-lead delegation sooner than WP12 implies, items 1/6/13 land together and the deploy-lockout warning above becomes the top risk in the unit.
