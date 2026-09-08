# 50 — Risks and feasibility

Risk audit of the quagga-portal → Camp 404 port programme. Read the headline first, then §6.

**Headline:** this is not a port, it is a re-merge between two forks of the same
scaffold by the same author. `packages/typescript-config/*`, `drizzle.config.ts`,
`packages/ui/src/lib/utils.ts` and `.prettierrc.json` are **byte-identical**
across the repos; `packages/eslint-config/index.js` differs by one line. Every
shared dependency resolves to the same major, and most to the same lockfile
version. The mechanical risk is therefore near zero and concentrated in five
places: **the `better-auth` version pin**, **Tailwind brand tokens that compile
to nothing**, **four component API collisions**, **`typedRoutes: true`**, and
**the missing `server-only` vitest alias**. The real risk in this programme is
not mechanical at all — it is that a multi-tenancy strip removes an authz check
by accident, and that ~40% of the "effort: S" rows are S only for the file and
not for the seam it plugs into.

---

## 1. Mechanical portability, per donor package

Verified against both trees. Versions from `00-baselines.md` §"Mechanical
portability delta", re-checked where load-bearing.

### `packages/typescript-config` and `packages/eslint-config` — **nothing to port**

Byte-identical (`base.json`, `nextjs.json`, `react-library.json`). Camp 404's
eslint config adds one ignore (`storybook-static/**`,
`/home/ryan/repos/Personal/camp-404/packages/eslint-config/index.js:33`). Both
repos wire every workspace as `import base from "<scope>/eslint-config"; export
default base;`. Neither runs `eslint-plugin-react-hooks` or Next's plugin.

Latent target defect found while comparing:
`/home/ryan/repos/Personal/camp-404/apps/web/package.json:60` declares
`eslint-config-next` that `apps/web/eslint.config.js` never loads. Next's lint
rules are unwired. Fix or drop the dep before a port lands on top of it.

### `packages/types` — **drops in after a scope rename. Lowest-risk package.**

Both on `zod ^4.4.3`. The rename is a pure `s|@quagga/|@camp404/|g`. The only
hazard is **name collision inside the target's own modules**, not versions:

- `sanitizeReportText` is exported from *both* `@quagga/core` and
  `@camp404/core` with **incompatible return types** — donor `→ RedactionResult
  {text, redacted}`, target `→ string`
  (`/home/ryan/repos/Personal/camp-404/packages/core/src/text-redaction.ts:53`,
  imported by `apps/web/lib/github-feedback.ts:9` and `app/feedback/actions.ts`).
  Merging the two redaction kernels needs a new name
  (`sanitizeReportTextWithReport`) or a three-call-site migration in one commit.
  This blocks `screenReport`, whose second argument is `readonly RedactionKind[]`.
- The donor's 15-kind `Question` union and Camp 404's 14-kind union are **not
  nested** — 8 kinds overlap, each side has 6–7 the other lacks. A wholesale
  copy is an XL rewrite of the authority the builder canvas, `classifyChange`
  and every stored response depend on. Lift one arm at a time.
- `packages/types/src/questionnaire.ts:7-9` records a written decision — lenient
  phone formats, "no new deps". The donor's `PhoneInput` reverses it.

### `packages/core` — **the pure modules drop in; the query/authz modules are a rewrite**

`@quagga/core` never imports `@quagga/db`, and `@camp404/core` has the same rule
written harder (`packages/core/src/index.ts:1-8` forbids `process.env` and IO).
So the pure modules land clean: `skeleton`-adjacent maths, `readRate`,
`groupNotificationsByDay`, `humanDuration`, `member-ref-code`, `name-dedupe`,
`bucketSubmissionsByMonth`, `questionnaire-results`, `privacy.ts`,
`auth-capabilities`.

What is a **rewrite, not an adapt** — because the group scope is in the function
signatures, not in a wrapper:

| donor module | groupId refs | why it can't be adapted |
|---|---|---|
| `audience.ts` | 17 | Camp 404 already has `computeAudience` (`packages/db/src/audience.ts:29-64`), independently arrived at and with exclusions the donor lacks |
| `questionnaire-authz.ts` | 10 | second permission system; `gateCaptain()` replaces the whole thing |
| `project-roles.ts` | 5 | role rows for one camp of 30–80 people |
| `account-security.ts` | 3 | `sole_camp_lead \| sole_org_god \| no_sign_in_method` collapses to `sole_captain` |
| `medical-access.ts` | — | `actorOrgPersonalInformation` + `actorLeadCampIds × subjectCampIds` are the multi-camp dimension; ~15 fresh lines here |
| `org-permissions.ts`, `org-domains`, `officers.ts` | all | the org tier, entire |

Two donor packages worth knowing you can't have: the donor's `@quagga/core`
barrel **advertises two functions that do not exist**, and its
`report-server` subpath exists to keep the Anthropic SDK and `GITHUB_TOKEN` out
of browser bundles. Camp 404 forbids server code in core outright — a stricter,
better rule. Do not add the subpath.

**SDK gap:** donor `@anthropic-ai/sdk ^0.115.0` vs target `^0.98.0` — 17 minors
on a 0.x SDK where minors break. The donor uses `output_config` / `json_schema` /
`stop_reason === "refusal"`. `AGENTS.md` forbids swapping providers in place.
Re-express, never lift.

### `packages/ui` — **the single most portable package. Four API collisions and one token gap.**

The strongest signal in the whole audit: a grep for
`groupId|orgId|tenant|isOrg|orgSlug|supplierId|MembershipRole|OrgPermissions` over
**all** of donor `packages/ui/src` returns **zero hits**. It is tenant-agnostic
by construction. Both sides are shadcn + Radix + CVA with an identical `cn()`,
both expose `"./components/*": "./src/components/*.tsx"`, both consumed as raw
TS source via `transpilePackages`. `button.tsx` variants are character-for-
character identical; `badge.tsx` differs only in `/20` vs `/15` opacity.

**Near drop-in (sed the scope, `pnpm format`, add a `.stories.tsx`):**
`skeleton`, `table`, `field`, `password-input`, `textarea-with-count`,
`disabled-hint-tile`, `wizard`, `responsive-data-table`, the whole `account-*`
suite + `account-auth-client.ts`.

**Four API collisions — the only real copy-paste hazards:**

1. **`checkbox`** — donor is a native `<input type="checkbox">` taking
   `React.InputHTMLAttributes` (deliberately not Radix, per its own comment).
   Camp 404's is `@radix-ui/react-checkbox` taking `onCheckedChange`. Every donor
   call site using `onChange={(e) => …e.currentTarget.checked}` **will not
   compile**. Affects `AckRow` and every lifted form.
2. **`switch`** — donor is a hand-rolled `<button role="switch">` with
   `variant?: "default"|"privacy"` and `hardLocked?: boolean`. Camp 404's is bare
   Radix, 31 lines, no variants
   (`packages/ui/src/components/switch.tsx`). Default-variant call sites are
   compatible; the privacy variant must be ported as a *distinct* `PrivacySwitch`,
   never as a replacement.
3. **`empty-state`** — donor exposes `action?: React.ReactNode`, Camp 404's takes
   `children`. Three-line reconciliation, but every lifted call site assumes the
   donor shape.
4. **`card`** — donor `CardTitle` is `text-lg`, target `text-2xl`. Cosmetic; it
   will look wrong in a lifted panel until retokenised.

**Token gaps (silent — these compile to nothing, no error, no warning):**

- `--color-ab-teal|-deep|apricot|peach|sage|olive|charcoal|warmwhite` — the donor
  brand ramp. Live usages: `quilt-band.tsx:53,56,60` and `file-upload.tsx:236`.
  A lifted `FileUpload` renders an invisible scrim.
- `--animate-accordion-down|-up` — **but see the correction in 15-condensed**:
  `tw-animate-css@1.4.0` (already imported at
  `packages/ui/src/styles/globals.css:5`) ships both plus the keyframes. Accordion
  works as-is. Do **not** add keyframes to `globals.css`.
- Donor `globals.css:93,124,130,143,149` — `.light`, `.org-accent`,
  `.light.org-accent`, `.supplier-accent`, `.light.supplier-accent`. Five rule
  blocks that exist only to skin three apps and a light theme. Camp 404 is
  dark-only. **Delete, don't port.**
- Camp 404 imports `tw-animate-css`; the donor does not. Every lifted
  dialog/select/popover will sit motionless beside Camp 404's animated overlays
  until you add the animation classes.

**Two structural traps:**

- Donor `packages/ui` cross-component imports use the **self-referential**
  specifier `@quagga/ui/components/badge` (`account-capability-notice.tsx:2`,
  `account-change-password.tsx:4-9`, `account-sessions.tsx:5-7`,
  `file-upload.tsx:14-16`). Camp 404's `packages/ui` has **zero** `@camp404/*`
  imports and uses relative paths throughout. Node/bundler self-reference *should*
  resolve the sed'd form, but **Camp 404 has never exercised that resolution
  path**. Rewrite to relative on the way in.
- `packages/ui/package.json` has **no `@vercel/blob`** (verified: 17 deps, none).
  Porting `FileUpload` adds the first network dependency to a purely
  presentational package. Put it in `apps/web/components/` instead.

Two dangling declarations in the target worth cleaning first:
`packages/ui/package.json:12` exports `"./hooks/*": "./src/hooks/*.ts"` against a
directory that **does not exist**, and `:24` declares a `@camp404/core` workspace
dep that nothing in `packages/ui/src` imports.

### `packages/db` — **same version, same style, no adapter work — but the schema is a rewrite**

Both `drizzle-orm ^0.45.2` + `drizzle-kit ^0.31.10`, both lock-resolving to the
same versions, `drizzle.config.ts` byte-identical. Query modules port
mechanically. The **schema** does not: donor `schema.ts:49` `groupKindEnum`,
`:60` `groupVisibilityEnum`, `:71` `membershipRoleEnum [god, org_staff, lead,
admin, member, engineer]`, plus `OrgPermissions`/`ProjectPermissions` type
imports. 44 tables that assume a `groupId` Camp 404 has no column for.

Package-shape divergence that bites every port: donor `packages/db` exports only
`"."`, `"./schema"`, `"./crypto"`; Camp 404 exports **25 domain entry points**
(`packages/db/package.json:8-34`). **Every donor query module dropped in needs
its own `exports` entry** or it is unreachable.

Camp 404 additions the donor has no analogue for and that a porter must not
break: `__setDbOverride` (`packages/db/src/index.ts:35-41`) and the PGlite
integration harness behind it.

### `packages/auth` — **out of scope by instruction, and unbuildable anyway**

Donor pins `better-auth` **exactly `1.6.25`** as a direct dep of `@quagga/auth`
and all three apps. Camp 404's root `package.json:26` sets
`pnpm.overrides["better-auth"] = "~1.4.18"` (verified), transitively under
`@neondatabase/auth 0.4.1-beta`. **Any donor file importing `better-auth`
resolves to a lower minor.** The donor's own `AGENTS.md:121-131` forbids moving
that pin and cites two high-severity auth advisories
(GHSA-vp58-j275-797x, GHSA-8jhw-6pjj-8723).

The *good* news, and it is the most useful finding in this section: the donor's
10-file, 1,916-line `account-*` UI suite takes **all** server behaviour as
injected props and reaches better-auth only through a locally-declared
*structural* interface — `AccountAuthClient` at
`packages/ui/src/components/account-auth-client.ts:31-56`. There is **no runtime
better-auth import in `packages/ui`**. So the account/security UI is portable
even though the auth package is not. See §3 for what actually gates it.

---

## 2. Migration hazards

Camp 404's rules, verbatim from
`/home/ryan/repos/Personal/camp-404/AGENTS.md`: "**Never hand-edit or hand-write
any file in `migrations/`**"; "Migrations are **incremental and append-only**.
`0000_initial.sql` is frozen — never regenerate, edit, or delete an existing
migration." Repo is at `0018_workable_praxagora.sql`; **19 files**.

The good news: **most of the port implies no DDL at all.** Units 02, 03, 05, 08,
09, 14, 15, 17, 18, 20, 21, 23 explicitly imply zero migrations. The
questionnaire work in particular obeys the donor's own best rule — *everything
lives inside the definition JSONB, every field optional* — so `format`,
`allowOther`, `min`/`max`, `other:` encoding and six new question kinds are all
JSONB-only.

### Ports that need a migration

| # | Change | Table | Additive? | Notes |
|---|---|---|---|---|
| M1 | `action_rate_limit` (`key text PK`, `count integer NOT NULL`, `window_start bigint NOT NULL`) + `index on window_start` | **new** | yes | Blocks the Postgres rate limiter (units 10, 11, 13). **`bigint("window_start", { mode: "number" })` — the `mode` is load-bearing**; without it drizzle returns a string and `window_start < ${cutoff}` compares strings. `schema.ts` currently imports **no `bigint`** (verified) — add the import. |
| M2 | `notification_deliveries.kind` (new pgEnum or reuse `broadcast_kind`) | existing | **NO — see below** | Required by the notification payload-builder seam (unit 04). `presentation` is a different axis. Today a `broadcastId IS NULL` system row renders a generic Bell with no attribution. |
| M3 | `notification_deliveries_user_created_idx` on `(user_id, created_at DESC NULLS LAST)` | existing | yes | `listInbox` orders `desc(createdAt)` with nothing to serve it. Index-only; safe. |
| M4 | `audit_log.metadata` → `.$type<Record<string, unknown>>()` + `audit_log_target_idx` + `audit_log_created_at_idx` | existing | yes | The `$type` half emits **no migration** (type-only) but readers need it or every row reads back as `unknown`. Table has `actor` and `action` indexes only (verified, `schema.ts:1192-1194`). Do it while the table is empty — the index is free. |
| M5 | `users.approval_decision_reason text` (nullable) | existing | yes | Unit 16 item 3. |
| M6 | `users.ref_code text unique` | existing | **NO** | Unit 24. A `UNIQUE` on an existing populated table is not additive — see below. |
| M7 | `broadcasts.pinned boolean NOT NULL DEFAULT false` | existing | yes | Unit 09, pinned banner. Also collides with home's existing "Pinned favourites" group (`design/spec/surfaces/06-home.md:89`) — **rename before building**. |
| M8 | `security_events` + `security_event_kind` enum | **new** | yes | Unit 11. Gated on a product decision; six of nine donor kinds have no producer here. |
| M9 | `account_deletion_requests` + partial unique `(user_id) WHERE status='pending'` | **new** | yes | Unit 12/13. **Reverses a recorded owner decision** (`docs/superpowers/specs/2026-05-30-account-deletion-design.md` §Decisions). Product call, not a port. |
| M10 | `ALTER TYPE task_status ADD VALUE 'awaiting_confirmation'` | existing enum | **NO** | Unit 24 tasks model. Enum growth is not additive in the useful sense — see below. |
| M11 | `users.privacy_flags jsonb NOT NULL DEFAULT '{}'` | existing | yes | Unit 22. Needs a **dedicated** writer separate from the questionnaire save path, or `resolvePrivacyFlagsUpdate`'s omitted-map-is-empty-patch rule has nowhere to send a deliberate change. |
| M12 | `documents` gains `url`, `source_type` enum, `required_ack`, `step_key`, `sort` | existing | yes | Only if the document-ack engine is built. Recommended SKIP. |

### The three that are **not** additive, and how to do them anyway

**M2 — `notification_deliveries.kind NOT NULL`.** A `NOT NULL` column on a table
with rows requires either a `DEFAULT` at add-time or a three-step
add-nullable → backfill → set-not-null. Drizzle-kit will generate a single
`ALTER TABLE … ADD COLUMN … NOT NULL` that **fails on a non-empty table without a
default**. Do it additively: add the column with an explicit default
(`'announcement'`), let the existing rows take it, and only then consider a
separate `SET NOT NULL` migration if you want the default gone. Do not reach for
`0000_initial.sql`.

**M6 — `users.ref_code text unique`.** Adding a `UNIQUE` constraint to a
populated table succeeds only if every existing value is distinct — and NULLs are
distinct in Postgres, so a nullable `ref_code` is safe **today** and unsafe the
moment a backfill writes a duplicate. Add the column nullable, add a **partial**
unique index `WHERE ref_code IS NOT NULL`, backfill in the CLI, never in the
migration. Same shape applies to any future `lower(telegram_handle)` unique index:
`telegramHandle` (`schema.ts:316`) has no constraint today and is denormalised
from a free-text questionnaire answer, so it **needs a dedupe pass before the
index**, not after.

**M10 — growing a pgEnum.** `ALTER TYPE … ADD VALUE` cannot run inside a
transaction block in older Postgres and cannot be reverted. Camp 404 already has
this problem queued as configurable-teams **Phase 4** (growing `team`), and it is
the one remaining phase precisely because it is the hard one. Prefer the pattern
already shipped: keep the enum fixed and put the mutable vocabulary in
`camp_settings.config` JSONB (`schema.ts:1439-1446`), which
`renameTeam`/`setTeamArchived`/`moveTeam` mutate with **no DDL at all**. If a new
`task_status` value is genuinely needed, model it as a nullable
`confirmed_at timestamptz` rather than a fourth enum member.

### Two Postgres traps the donor paid for and Camp 404 is one line away from

1. **Widening a unique index to include a nullable column silently drops
   uniqueness** — Postgres treats NULLs as DISTINCT. Camp 404 is exposed:
   `questionnaire_responses.activationId` is nullable (`schema.ts:1521-1524`)
   while `questionnaire_responses_user_def_idx` (`:1529-1532`) is still
   `(user_id, definition_key)`. Anyone "improving" that index by adding
   `activation_id` permits duplicates. The donor's fix was two partial indexes.
   **Write this into `AGENTS.md`.**
2. **`ON CONFLICT` against a *partial* unique index fails at runtime (42P10)
   unless the statement repeats the predicate.** Camp 404 has two partial unique
   indexes (`schema.ts:522-524` captain promotions, `:571-573` one-open-activation)
   and an `onConflictDoUpdate` in `mcp/tools/profile.ts:81-89` that is exposed if
   anyone ever retargets it. Today all conflict targets are full unique indexes,
   so the bug cannot fire — **don't port the donor's fix as if it could**, but
   keep the rule.

### Ops note

`vercel-build` runs bare `pnpm --filter @camp404/db db:migrate && next build` —
`drizzle-kit migrate` with **no advisory lock and no unpooled-URL enforcement**.
The donor's 280-line `migrate.ts` runner exists to serialise three concurrent
Vercel builders; Camp 404 has one project, one builder, so the race cannot occur.
**Skip the runner. Take `planMigration()` / `isPoolerConnection()` alone** — DDL
over a PgBouncer endpoint is the failure the guard actually prevents, and
`DATABASE_URL_UNPOOLED` is absent from the entire repo today.

---

## 3. Auth-model mismatches

### The shape of the target's model

- **Two stored ranks.** `rankEnum = pgEnum("rank", ["captain", "member"])`
  (`packages/db/src/schema.ts:40`). Everything else is derived: team-lead from
  `team_memberships.is_lead`, driver from `driver_profiles.intends_to_drive`.
- **A three-value viewer ladder**, separate from storage:
  `ViewerRank = camp_member < team_lead < captain`, produced by
  `deriveViewerRank(rank, isLead)` and compared by
  `hasClearance`/`requireClearance` (`packages/core/src/access.ts:16-52`, read
  and verified).
- **Session comes from Neon Auth, not from us.**
  `apps/web/lib/neon-auth.ts` is `createNeonAuth({ baseUrl, cookies: { secret,
  sameSite: "lax" } })`; `apps/web/lib/auth.ts` maps it to
  `AuthenticatedUser { id, primaryEmail, displayName }` — **three fields, and no
  `emailVerified`** (verified by reading the file).
- **Camp identity is a join, not the session.** `users.auth_user_id` joins to the
  upstream Neon Auth user; `ensureCampUser(authUser)` mints the camp row.

### Where donor code assumes primitives Camp 404 does not have

| Donor assumption | Camp 404 equivalent | Risk |
|---|---|---|
| `requireOrgSession({ capability, domain })` | `requireCaptain()` (per-file) or `gateCaptain()` (`captains/questionnaires/actions.ts:70-77`) | Every donor guard collapses to one boolean. Straightforward — but see the divergence below. |
| `orgCan` / `orgCanIn` / `orgCanInDomain` over an 8-domain vocabulary | `hasClearance(viewerRank, required)` | The donor's `ENGINEER_RANK_CARVE_OUTS` model a rank broader in reach and narrower in depth. Camp 404 has no non-superset ladder. Do not port the concept. |
| `god` as a **structurally untouchable** row (`accounts.ts:97-104`; `god` absent from `GrantableRank`) | `captain` is a **mutable stored value** | The donor's sole-manager guard is untouchability, not arithmetic. Camp 404 needs a *count* predicate — an adaptation forced by the difference, not a port. |
| `withReauth` / `auth.api.signInEmail` re-auth gating | nothing | better-auth 1.6.25 machinery. No server-side password verification exists here. |
| better-auth `twoFactor` / `passkey` plugins | **not present** | Verified in the installed typings: `twoFactor`, `totp`, `backupCode`, `passkey` = 0 hits in both `dist/next/index.d.mts` and `dist/next/server/index.d.mts`. The runtime plugin array (`dist/adapter-core-*.mjs:725-732`) is a closed list of six. |
| `session` list / revoke / `changePassword` | **present** via Neon Auth | `listSessions`, `revokeSession`, `revokeSessions`, `revokeOtherSessions`, `changePassword`, `listAccounts`, `deleteUser`, `resetPassword` all exist client+server. |
| `changeEmail`, `unlinkAccount`, `linkSocial`, `forgetPassword` | **client-only** | 0 server hits. Any donor server action for these is unimplementable. This is exactly the donor's `support: "client_only"` state — port the three-value `AUTH_CAPABILITIES` enum, do not collapse it to two. |
| `emailVerified` on the session | **unknown, probably absent** | `AuthenticatedUser` has three fields and `SessionUser` is a hand-written loose slice (`auth.ts:27`). Unit 07's "verified-email god gate" and unit 16 item 12 both depend on Neon Auth exposing this claim, which **nobody has verified from either repo**. Treat as blocked until someone checks a live session. |

### Two live authz defects the comparison exposed (both in the target)

**(a) The captain gates diverge.** Verified by reading both files this session:

- `apps/web/app/captains/camp-settings/actions.ts:44-63` — `requireCaptain()`
  checks `isApproved` under the comment *"a captain still held behind vetting
  can't act."*
- `apps/web/app/captains/camp-management/actions.ts:92-110` — `requireCaptain()`
  **does not check `isApproved` at all.**

So a `rank: 'captain'`, `approvalStatus: 'pending'` account can approve/reject
applicants, send promotions, and reach `getMemberDetailAction` — which
**decrypts SA ID / passport** at `:152-153`. That is the single sharpest finding
in the audit and it is a two-line fix.

**(b) `apps/web/app/notifications/page.tsx:20-24`** checks `hasCampAccess` and
skips `isApproved`, which every sibling page enforces. *Caveat:* unit 09 records
this as **intentional** per `design/spec/surfaces/09-notifications.md:176`
("notifications should remain accessible regardless of onboarding state").
Confirm with the owner before "fixing" it.

**Consolidation warning.** Four captain pages repeat the same four-step prelude
and **all four hardcode `isLead: false`** into `deriveViewerRank`. Any shared
`captainGate()` must state how `team_lead` resolves, or it silently changes
behaviour on all four at once. And `DEFERRED.md:71`'s "redirect-ladder
consolidation" is about `nextGate` (the *required-actions* gate), **not** the
captain rank prelude — consolidating the rank gate is unplanned work.

### The duplicate `nextGate`

`packages/core/src/access.ts:94-104` is exported, tested, and **has zero app
callers**; it lacks the `type === "questionnaire" && activationId` arm that the
live `apps/web/lib/required-actions.ts:30-39` has. Any future consolidation that
picks the core copy silently returns `null` for every builder questionnaire.
Delete it or make it the single implementation with `ACTION_ROUTES` injected —
before wrapping either in a `guardPage()`.

---

## 4. Multi-tenancy collapse — where stripping a scope can remove an authz check

The donor's tenancy lives in three places. Two are safe to strip mechanically;
one is not.

**Safe: the presentation layer.** `packages/ui` is verified tenant-free (zero
hits for every tenancy identifier). The stylesheet's `.org-accent` /
`.supplier-accent` / `.light` blocks are pure skinning. `apps/org` and
`apps/suppliers` exist only because of the split and are correctly SKIP in their
entirety — and the donor's own audit says they are "close to being the same
application twice" (~2,000 duplicated lines, `sign-out-button.tsx` identical
md5, `lib/actions/password.ts` differing in 2 of 81 lines). **Any component
lifted from an `apps/` directory has two near-twins, one of which has already
drifted** — org's `mark-all-read-button` silently lost the success toast the
other two have.

**Safe: the edition dimension.** `edition_id` is `NOT NULL` on donor
`required_actions` and `questionnaire_responses`. Camp 404 has no editions —
every donor signature loses a parameter. Mechanical but pervasive. Bank one donor
lesson as a note, not a column: a `(user_id, action_key)` unique index means the
gate fires **once in a person's lifetime, ever** — relevant when the camp runs a
second burn.

### Dangerous: the scopes that ARE the authz check

| Donor scope | What it actually enforces | If you strip it wrong |
|---|---|---|
| `AudienceSpec` / `resolveBulletinAudience` | who receives a broadcast — the donor calls audience resolution **a privacy boundary, not routing** | Camp 404's `computeAudience` already excludes `isSystem`, `sanitised` and the sender (`packages/db/src/audience.ts:35,63`). Do not replace it with a donor version that lacks those. |
| `questionnaire-authz.ts` `canReadActivationResults` | who may read *other people's answers* | Collapsing this to "any captain" is probably right for one camp — but it must be a **stated decision**, not a deletion. The results surface does not exist yet, so the decision is still free. |
| `canReadPersonalInformationIn(actor, domain)` **before the select** | keeps PII out of the query, not just out of the JSX | See below — this is the one Camp 404 already gets wrong. |
| `groupId` on every org query | the reviewer is a different organisation | Genuinely collapses. Nothing to preserve. |
| `SANITIZATION_IDENTITY_TABLES` ordering | identity rows deleted before the tombstone | Port the **ordering invariant**, not the mechanism (Neon Auth identity deletion is an operator action, `DEFERRED.md:85`). |

**The concrete instance already in the target.**
`getCampMemberDetail` (`packages/db/src/roster.ts:155-200`) selects
`passportEncrypted` and `saIdEncrypted` **unconditionally**, and *both*
`getMemberDetailAction` (captain, decrypts) and `getPublicMemberProfileAction`
(any approved member, discards via `presentPublicMember`) call it. The captain
gate runs before the **decrypt** but not before the **select**, so a
non-captain's request pulls ID ciphertext into RSC render scope and relies on a
JS projection never serialising it. The donor's fix is the one-line
`options: { includeIdDocuments: boolean }` conditional spread — authorise, then
select. **This is the donor pattern most worth taking in the whole programme,
and it is effort S** (two columns; `eftDetailsEncrypted` isn't even in that
query).

**The rule to write down before anyone starts stripping:** a donor parameter
named for a tenant is deletable; a donor parameter that *gates a select list* is
not — it becomes a Camp 404 rank parameter. When in doubt, keep the parameter and
pass a constant.

**Do not port `/directory`.** The donor's directory lists **camps, not people** —
it deliberately has no browsable member list, because that is the bulk-exposure
surface. Camp 404 already crossed that line: `/captains/camp-management` is open
to every approved member, and `requireClearance(…, "captain")` only picks the
projection (`page.tsx:24-51`). Nothing in the donor's directory section applies,
and the donor's reasoning is an argument against widening what is already there.

---

## 5. Effort estimates that are wrong

292 of the 478 priority rows are rated **S**. The following are S for the file
and **M or L for the seam**. Each has a named blocker.

### Rated S, actually M

| Item (unit) | Why it isn't S |
|---|---|
| **`screenReport` / injection screen (10)** | Its second argument is `readonly RedactionKind[]`, and `third-party-data` — the only flag that withholds diagnostics — derives entirely from it. Camp 404's kernel returns a bare `string`. **The sanitiser merge must land first**, and that merge collides on an exported name across three call sites. |
| **`writeAuditEvent` (06, 07)** | The 15-line insert is S. But `audit_log.metadata` is bare `jsonb("metadata")` (verified `schema.ts:1188`) — a `metadata?: Record<string, unknown>` parameter **will not typecheck** without a `.$type<>()` edit, and `createHttpDb` has no interactive transactions, so the `DbOrTx` signature only pays off for callers already on `createPooledDb`. Add the two indexes in the same migration. |
| **Glyph on `broadcast_kind` (05)** | `InboxItem` has no `kind`, `listInbox`'s select never selects it, and `apps/web/lib/test-store.ts:548` models none. Query + type + `NotificationsBackend` contract + test store + route tests. |
| **`previewAudienceCount` / AudienceSelect (04, 08, 09, 15)** | The action is ~20 lines. But `resolveAudience` takes a *broadcast row* and is reachable from the questionnaire path only by a cast that hard-passes `driverUserIds: []` — and questionnaire scope carries `opt_in`, which `openActivation` rejects outright. The preview must reject `opt_in` identically or it confidently reports a count for a scope that cannot send. |
| **`canBootstrapGod` / verified-email gate (07, 16)** | "One-line change" is false: `AuthenticatedUser` is `{id, primaryEmail, displayName}` and `SessionUser` reads no verified flag. Plumbing a new field through the session payload, `AuthenticatedUser` and `apps/web/lib/test-store.ts` — **and it is blocked on confirming Neon Auth exposes the claim at all.** |
| **`navigateOnwards` (24)** | The module is 55 lines. The **sweep is ~15 call sites** (3 push-in-transition, ~12 refresh-in-transition), not the 2 the digest names. |
| **e2e server-log artifact (20)** | Not a `cp` step: Playwright's own `webServer` block starts the server and writes no log file. Needs the command teed. |
| **`.limit()` on `listInbox` (04)** | Framed as free. It reverses `design/spec/surfaces/09-notifications.md:175` ("No pagination… not in scope"). Answer OQ4 first — that's a decision, not a diff. |
| **Blob client-upload token route (02, 23)** | M is the **floor**, and only because it is gated on generalising `/api/avatar` (hardcoded to the `avatars/` prefix, single `isApproved` gate) into a per-prefix authorisation proxy. Landing it with `access: "public"` would be quick and would regress Camp 404's posture. |
| **Any `packages/ui` port that needs a table or tabs (02, 03, 06, 17)** | `packages/ui` has **no `table.tsx`, no `tabs.tsx`, no `skeleton.tsx`** (verified: 41 non-story components, none of them these). `@radix-ui/react-tabs` is not a dependency. `SegmentedControl` substitutes for tabs; nothing substitutes for a table. |

### Rated S, actually L (or blocked)

| Item (unit) | Why |
|---|---|
| **commitlint + husky (20, 21, 24)** | **18 of the last 40 commit subjects exceed 72 characters**, and the actual scope vocabulary is `web, db, ui, types, e2e, turbo, deps, invite, questionnaire, questionnaire-builder, design, db+web, web+ui` — with `design(questionnaire-builder):` using `design` as a **type**, which `config-conventional`'s `type-enum` rejects outright. Adopting this means widening the enums or rewriting the convention. Not a drop-in, and not immediately green. |
| **`loading.tsx` rollout (03, 05, 14, 15, 17, 18, 24)** | The **kit** is S (204 lines, one `motion-safe:` edit). The rollout is M–L across 26 `force-dynamic` pages — and it is **contested**: `design/spec/impl/app/16-captain-tools.md:43`, `11-invite-tool.md:57`, `09-notifications.md:153`, `05-approval-gate.md:54`, `01-landing.md:27` and `17-mcp-connect.md:125` each say *do not create*. `design/spec/flows.md:440` is the defensible line: skeletons are for **client** fetches. Get the ruling before the sweep. |
| **ID-retention rule (12)** | M–L, not M. `rg endDate|end_date|eventDate|burn_date` over apps+packages returns **zero** — there is no burn end-date anywhere. It needs a types change, an accessor, a captain-editable surface, a default for the singleton row, a cron route and a `vercel.json` entry — against a plan whose daily-cron limit already left `telegram/dispatch` unscheduled. |
| **Account sessions UI (11)** | M/L, not S. `auth.listSessions()` inside an RSC render hits the exact documented failure at `apps/web/lib/auth.ts:43-57` (Neon Auth's proxy writes rotated cookies; Next forbids cookie writes during render). Needs a route handler or the degraded-read fallback. Nobody has rendered it once. |
| **Coverage ratchet (10, 13, 14, 20, 21)** | `@vitest/coverage-v8` is in **zero** workspaces and no vitest config has `thresholds`. Landing floors means installing, measuring, then setting — and `apps/web/vitest.config.ts` aliases only `@`, so the instant `coverage.include: ["lib/**"]` pulls in the ~20–30 modules under `apps/web/lib` that `import "server-only"`, they throw. |
| **`/captains/system` panel (18)** | Gated on a **product decision**, not engineering. Every other Camp 404 surface has a numbered impl spec under `design/spec/impl/app/`; this route has none and no feature-set entry. Owner's standing rule is that the design is finished and code is built to it. |
| **`security_events` / 2FA / passkeys (06, 11, 14)** | Not L — **SKIP**. Six of nine kinds have no producer, and `@neondatabase/auth/react/ui` already exports `SessionsCard`, `PasskeysCard`, `TwoFactorCard`, `ChangePasswordCard`, `SecuritySettingsCards`. Mounting `<SecuritySettingsCards/>` is a 30-minute probe. Porting 1,916 lines to reimplement vendor cards is the wrong move at any threat model. |

### The prerequisite that gates about a third of the S list

`apps/web/vitest.config.ts` aliases only `@` (verified). The donor's app vitest
configs all alias `"server-only"` to a stub. **Every ported server module
beginning `import "server-only"` throws the moment a Camp 404 vitest test imports
it.** Note the caveat from unit 04: Camp 404 already ships `import "server-only"`
in `apps/web/lib/{camp-config,auth,neon-auth}.ts` with a green suite, so
resolution *may* already work — but nothing in `apps/web/lib` is directly
unit-tested today, so that is unproven. **Check this before scheduling anything
that claims "S with a test."**

---

## 6. Things that will bite — top 10, ranked

Ranked by (probability × cost to unwind), not by size.

### 1. The questionnaire `image` kind is silently deleting members' profile photos — today

`apps/web/components/questionnaire/question.tsx:364-373` renders `<AvatarUpload>`
with **no `uploadUrl`**, so it defaults to `/api/uploads/avatar`
(`packages/ui/src/components/avatar-upload.tsx:40`). That route writes
`avatars/${user.id}/avatar.{ext}` with `addRandomSuffix: true` and then calls
`deleteAvatarBlobs(user.id, blob.pathname)`, which lists prefix
`avatars/${userId}/` and `del()`s **everything except the new object**
(`apps/web/lib/avatar-blob.ts:12,26-39`). Verified end to end by reading the call
chain. So a questionnaire image answer wipes the profile-photo blob while
`users.profile_image_url` keeps pointing at the deleted path — and the next
profile upload wipes the questionnaire answer.

**Mitigation:** give the questionnaire kind an explicit `uploadUrl` to a route
with its own prefix that does **not** call `deleteAvatarBlobs`. Effort S. Do this
before any media port lands on top of it. The proper fix is the per-`kind` token
policy, but do not wait for it.

### 2. A captain held behind vetting can decrypt ID numbers

`apps/web/app/captains/camp-management/actions.ts:92-110` omits the `isApproved`
check that its sibling at `camp-settings/actions.ts:44-63` performs, and
`getMemberDetailAction` decrypts SA ID / passport at `:152-153`. Two lines apart
in behaviour, one POPIA-regulated column apart in consequence.

**Mitigation:** add `isApproved` to the camp-management gate, copying the comment
from camp-settings. Then hoist one shared gate — but state explicitly how
`team_lead` resolves, because all four captain pages currently hardcode
`isLead: false`.

### 3. `typedRoutes: true` turns every lifted `<Link href>` into a build failure

`apps/web/next.config.ts:13` (verified). Donor route strings —
`/directory`, `/burners/[id]`, `/bulletins/[id]`, `/join/[token]`, `/account/*` —
fail typecheck unless the route exists. This will not surface in review; it
surfaces as a wall of `tsc` errors at the end of a large paste.

**Mitigation:** grep every lifted file for `href=`, `redirect(`, `router.push(`
**before** wiring it, and replace the string with a Camp 404 route or a
deliberate `as Route` with a TODO. Also note `@camp404/db` is **not** in
`transpilePackages` (verified) while `@quagga/db` is in the donor's — unresolved
whether that is deliberate or a latent bundling gap.

### 4. "Verified stale" documentation will send a porter down a dead path

Six claims in the target are provably false right now:
`README.md:108` ("Phase 0 — Setup. Scaffold only"), `README.md:89-91` (3 crons
against 5 in `vercel.json`), `AGENTS.md:22-27` (omits `packages/core` and
`packages/telegram`), `AGENTS.md:180-182` (e2e "disabled" while
`ci.yml:179` runs it on every PR), `docs/configurable-teams-plan.md:1-4`
("PARKED… no feature code is written yet" after Phases 1–3 shipped),
`DEFERRED.md:59-60` (shake-to-report "not built" — it is). Plus
`apps/web/tests/e2e/README.md:63,:114` say "13-page wizard" against **11** pages.

**Mitigation:** dated inline correction blockquotes (donor `docs/roadmap.md:30-33`
is the format) that keep the original text. Half a day, and it is the cheapest
protection against an agent building to a stale claim. Also: the donor's own
statistics disagree with each other across its docs (45 vs 44 tables; three
different e2e counts; 51 vs 49 UI components) — **treat every donor number as
approximate**, and read the code under any donor comment before trusting it (its
own audit found eight comments that contradict the code beneath them).

### 5. The Tailwind brand ramp compiles to nothing, with no error

`--color-ab-*` does not exist in Camp 404's `@theme`. A lifted `quilt-band.tsx`
renders invisible diamonds; a lifted `file-upload.tsx` renders an invisible
scrim (`:236`). Tailwind v4 emits no warning for an unknown token.

**Mitigation:** grep every lifted file for `ab-` before merge. Add it to the PR
template's Risk section. And delete the donor's `.light` / `.org-accent` /
`.supplier-accent` blocks rather than porting them — Camp 404 is dark-only.

### 6. Four component API collisions that fail at compile *or* at runtime

`checkbox` (native `onChange` vs Radix `onCheckedChange`) and `switch` (donor's
`variant="privacy"` + `hardLocked` vs bare Radix) fail at **compile** — annoying
but loud. `empty-state` (`action` prop vs `children`) and `card` (`text-lg` vs
`text-2xl`) fail **visually** — quiet, and they ship.

**Mitigation:** port the donor's checkbox and switch under **new names**
(`AckRow`, `PrivacySwitch`) rather than replacing the Radix primitives. Never
converge two primitives during a port; that is a separate PR.

### 7. Formatting and convention drift makes every port look like a stranger

`.prettierrc.json` sets `"semi": true`, yet
`packages/ui/src/components/{button,badge,switch,checkbox,dialog,popover}.tsx` are
written **without semicolons**. Donor files are uniformly semicolon'd. And Camp
404 keeps a `.stories.tsx` beside almost every component (Storybook 10) while the
donor has **no Storybook at all** — every ported file arrives breaking house
convention.

**Mitigation:** `pnpm format` after every paste, and write the story in the same
commit. Trivially cheap; wildly annoying if skipped for a month.

### 8. The audit trail is fail-open by design — and that is correct, but it must be *logged*

The donor's disclosing-read audit writes inside `after()` with
`catch (err) { console.error(…) }` — **logged, not swallowed**. That distinction
is the whole point: a silently swallowed catch makes an unread trail
undetectable. Camp 404 already has the house shape for the sibling table
(`appendMcpAuditLog`, `packages/db/src/mcp.ts:68-91`, "Auditing must never break
a tool call"). But `after()` from `next/server` is **imported nowhere in Camp
404 today** — its behaviour under this Next 16 setup is assumed, not observed.

**Mitigation:** reuse `appendMcpAuditLog`'s shape, log the failure, and verify
`after()` fires once before relying on it. Add the two `audit_log` indexes in the
same migration as the first writer, not before — an unused index on an empty
table is cost without benefit.

### 9. `team_memberships` has no production write path, so half the ports ship dead

Verified this session: the **only** `insert(schema.teamMemberships)` anywhere in
`apps/` or `packages/` is the test factory
(`packages/db/src/__tests__/_factories.ts:39`). Consequences that compound: the
entire team-lead tier is stranded; `scope: 'team'` and `'team_leads'` sends
resolve to **zero people** and toast success anyway; roster team badges are
decoration; officer/wrangler coverage cards would ship permanently 0-of-8; and
`canSendToAudience`'s team-lead arm has nothing to test against.

**Mitigation:** WP6 (#130) is the keystone. Anything that reads `is_lead`
should be sequenced after it, or shipped with an explicit note that it is inert.
The **live audience-count preview** is the right interim fix — it turns a silent
zero-recipient send into a visible one, and it is cheap.

### 10. `default: ids = []` — the resolver is not exhaustive

`packages/db/src/audience.ts:59-60` (verified). Adding a value to
`BroadcastScope` compiles clean and ships a send that reaches nobody. Three
characters of change buy compile-time exhaustiveness. Note `send-form.tsx:39`
already declares `type Scope = "everyone" | "team" | "team_leads" | "individual"`
— it **omits `drivers`**, which the enum supports and `computeAudience` resolves,
so drivers are already unreachable from that screen.

**Mitigation:** delete the `default` arm (or replace with a
`const _never: never = broadcast.scope`), and add the label-completeness test in
both directions — Camp 404 already knows this trick
(`apps/web/lib/__tests__/camp-config.test.ts` asserts `DEFAULT_TEAMS` keys against
`teamEnum.enumValues`), it just never applied it to the audience vocabulary.

---

### Honourable mentions (would be 11–14)

- **`setUserApproval` has no TOCTOU guard.** `packages/db/src/burner-profile.ts:69-84`
  is a bare `UPDATE … WHERE id = ?` with no status precondition and no
  `.returning()`; `decideApprovalAction` returns `{ok:true}` unconditionally. Two
  captains deciding opposite ways: the second silently wins. And it is the only
  action in that file that skips `UserId.safeParse`.
- **The sole captain can strand the camp.** `deleteOwnAccount`
  (`apps/web/app/profile/actions.ts:55-69`, read this session) checks auth, camp
  access and a typed `DELETE` — no captain count. `sanitisedUserPatch`
  (`packages/db/src/account.ts:22-42`) **preserves `rank`**, and
  `getBootstrapState()` counts `rank = 'captain'` **without filtering `sanitised`
  or `isSystem`** (`packages/db/src/bootstrap.ts:21-27`) — so an erased captain
  still counts, `isCampBootstrapped()` stays true, and `/setup` is closed by a
  ghost. `mint-invite --assigns-rank captain` refuses unless `--created-by` names
  a captain, and `bootstrap-founder` mints a plain member invite, so the CLI does
  not rescue you either. Two one-line fixes (`and(sanitised=false, isSystem=false)`;
  `rank: "member"` in the patch) plus a `canLeaveCamp` predicate.
- **`encryptOrPreserve` — the data-destruction path.** `getIdDocuments` reads with
  `decryptOrNull` (unreadable ⇒ blank form field), then `setIdDocuments` writes
  `idColumnsFor(type, encrypt(value) or null)` which nulls the *other* column
  unconditionally. On a key-rotated deployment, one ordinary re-save permanently
  overwrites a member's ID ciphertext with `null` under a "Saved" toast. The
  three-state `decryptField` plus a four-line `encryptOrPreserve` fixes it.
- **A failing cron looks exactly like a healthy one.**
  `apps/web/app/api/cron/notifications/push/route.ts:17` spreads
  `drainQueuedPush`'s `{sent, failed, skipped, pruned}` into
  `{ok: true, ...result}`, so `{ok:true, sent:0, failed:12}` is a green dashboard
  entry. Three stub crons return `{ok:true, sent:0}` on a schedule, forever.
  Derive `ok` from the failure count and return 500. (`dispatch/route.ts` does
  **not** have this bug — it has no failure counter, so failures throw.)

---

## What I would sequence first, purely on risk

1. The avatar-prefix collision (#1) — active data loss, effort S.
2. The `isApproved` gate divergence (#2) — active PII exposure, effort S.
3. `decryptField` + `encryptOrPreserve` — active data destruction, effort S.
4. Tombstone-aware captain count + sole-captain guard — unrecoverable if it fires.
5. `default: ids = []` + the label-completeness test — three characters and a test.
6. `.gitattributes` with `*.pen -merge` — `design/app.pen` is 45,390 lines of
   JSON that git will three-way-merge into structurally valid, semantically wrong
   output. `git check-attr merge design/app.pen` currently returns unspecified.
7. Dated correction blocks on the six stale doc claims — before an agent builds
   to one.

Everything else in the programme is elective.
