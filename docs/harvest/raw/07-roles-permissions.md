# Unit 07 — Roles, permissions, capability model, and role-management UI

**Donor:** `quagga-portal` / AfrikaBurn Contributors App
**Donor root (this machine):** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Target:** Camp 404 (`/home/ryan/repos/Personal/camp-404`)
All paths below are DONOR-relative unless prefixed `camp-404/`.

---

## 0. Purpose and the one-paragraph verdict

The donor runs **two completely separate permission systems** that share a vocabulary and a set of shapes but never share a resolver:

1. **Project (camp-side) roles — "Roles v2".** Per-group rows in `project_roles` carrying a `kind` (permanence class), a curated `color`, an `emoji` and a `permissions` JSONB object over a **5-key** privilege vocabulary. Resolution is `hasProjectPermission` in `@quagga/core/project-permissions`, with an **irrevocable structural backstop** (`lead`/`admin` on `memberships.role` always hold everything). This is the half Camp 404 actually wants: it is a camp-scoped, captain-configurable role/privilege system with an editor UI, a delete-cascade confirmation, an escalation guard, and a consent-gated "officer" class.
2. **Org (console-side) roles — "Org roles v1/v2".** Data-driven departments (`org_departments`), roles (`org_roles`), assignments (`org_role_assignments`) and domain ownership (`org_department_domains`), resolved by `orgCan` / `orgCanIn` / `orgCanInDomain` over a **5-key CRUD+PII** vocabulary with an 8-key hardcoded domain list, an engineer rank ceiling and a `god` anti-lockout anchor. This exists **only because reviewers are a different organisation from the reviewed**. Camp 404 collapses this entirely — but its *engineering patterns* (one resolver read by both the gate and the UI; consequence-copy tables; `summarizeOrgActor` as the single renderer behind every preview; deletion-impact arithmetic; the "grant that reaches nothing" warning) are the most valuable transferable ideas in the whole donor repo.

**Why it matters to Camp 404.** Camp 404's rank model is `pgEnum("rank", ["captain","member"])` plus a derived `team_lead` (`camp-404/packages/db/src/schema.ts:40`, `camp-404/packages/db/src/roster.ts:208`) and a 3-value `ViewerRank` ladder in `@camp404/core/access`. There is no privilege object, no per-role configuration, no delegation, and no way for a captain to say "this person can send questionnaires to the kitchen crew but not block the app". WP6 (#130, team assignment) and WP9 (#133, roster operations) are both blocked on exactly the machinery this unit contains. The donor's *project* side is a near-drop-in answer that was itself written from Camp 404's own conventions.

**The most important correction to prior briefing.** Earlier context in this porting exercise records the org capability vocabulary as `read · read_personal_information · write · delete · manage_camp_categories · manage_accounts · read_system`. **That vocabulary was retired by migration 0022.** The live vocabulary is exactly five keys — `create · read · update · delete · personal_information` (`packages/types/src/roles.ts:141-148`) — and `manage_accounts` / `read_system` are no longer capabilities at all (they became the `isSystemManager` and `runsDeployment` *rank* questions). `SYSTEM_MANAGER_ONLY_CAPABILITIES` is now an **empty array** (`packages/core/src/org-permissions.ts:230`). Any port built on the old list will be building against a vocabulary that has been dead since 28 Jul 2026.

---

## 1. File inventory (line counts verified with `wc -l`)

### 1.1 Pure logic — `packages/core/src/`

| File | Lines | What it owns |
|---|---:|---|
| `org-permissions.ts` | 858 | The org resolver: `orgCan`/`orgCanIn`/`orgCanInDomain`, rank labels, carve-outs, refusal copy, `summarizeOrgActor` |
| `org-roles.ts` | 415 | Department/role row builders, name+key normalisation, kind guards, seeded departments + roles |
| `org-domains.ts` | 231 | The 8-key domain vocabulary, ownership map, `departmentForDomain`, domain copy |
| `project-roles.ts` | 238 | Camp-side role seeding, name normalisation, kind guards, officer role materialisation |
| `project-permissions.ts` | 150 | `hasProjectPermission`, `canManageQuestionnaireAudience`, captain lock, escalation predicate |
| `officers.ts` | 206 | Officer catalog (5 entries), trigger matrix, outstanding-officer arithmetic, consent predicates |
| `auth-capabilities.ts` | 269 | Provider capability matrix (2FA/passkeys/sessions/email-change/unlink), `assertCapability` fail-closed gate |
| `god-emails.ts` | 41 | `parseGodEmails`, `isGodEmailIn`, `canBootstrapGod` (verified-email gate) |
| `medical-access.ts` | 142 | `canViewMedicalNotes` — **couples to the org tier via `actorOrgPersonalInformation`** |
| `name-dedupe.ts` | (shared) | `normalizeName` — the single normaliser both role systems use (`:14-20`) |
| `questionnaire-authz.ts` | — | `canAuthorProjectQuestionnaire` (`:133-143`), `projectAudienceTargetRoleIds` (`:112-120`), `canManageProjectRoles` (`:100-105`) |

### 1.2 Types — `packages/types/src/`

| File | Lines | What it owns |
|---|---:|---|
| `roles.ts` | 337 | Every enum and every Zod permissions schema for BOTH systems |

### 1.3 Persistence + actions

| File | Lines | Role |
|---|---:|---|
| `apps/web/lib/roles-store.ts` | 1055 | The camp-side persistence layer: seed, list, CRUD, member assignment, officer consent flow, permission lookup, officer status |
| `apps/web/app/(app)/camps/[slug]/actions.ts` | 353 | Camp role/officer server actions (`requirePermission` gate at `:51-65`) |
| `apps/web/app/(app)/camps/[slug]/settings/roles/actions.ts` | 69 | `createRoleWithSetupAction` — name+icon+colour+privileges in one round trip |
| `apps/web/app/(app)/camps/[slug]/settings/roles/page.tsx` | 147 | The Roles & Officers settings page (server) |
| `apps/org/lib/actions/org-roles.ts` | 668 | 7 System-manager-only actions, each transactional + audited |
| `apps/org/lib/actions/accounts.ts` | 170 | `setOrgStaffRole` — grant/revoke the console door, sole-god guard |
| `apps/org/lib/session.ts` | 388 | `resolveOrgSession` / `requireOrgSession` / `requireSystemManager` / `canManageAccounts` |
| `apps/org/lib/gate.tsx` | 124 | `guardConsole` — one `orgCan(actor,"read")` gate no page can forget |
| `apps/org/lib/god.ts` | 33 | Thin `process.env.GOD_EMAILS` wrapper over the pure core helpers |
| `apps/org/lib/org-role-impact.ts` | 109 | Pure "who loses what" deletion arithmetic |
| `apps/org/lib/queries.ts` | (partial) | `resolveAccountCapabilities` (:341), `getOrgRolesOverview` (:529), `listAssignableOrgRoles` (:626), `getOrgRoleImpacts` (:703) |

### 1.4 UI

| File | Lines | Role |
|---|---:|---|
| `apps/web/components/roles/roles-settings.tsx` | 195 | Three accordion sections: Officers / Core roles / Custom roles + outstanding badge |
| `apps/web/components/roles/role-row.tsx` | 253 | One core/custom role: rename, appearance, privileges, two-step delete with member count |
| `apps/web/components/roles/officer-row.tsx` | 284 | One officer: lock glyph, required/recommended tag, consent tags, assign picker, POPIA copy |
| `apps/web/components/roles/privileges.tsx` | 319 | `PrivilegeToggles` + `PrivilegeEditor` + `privilegeSummary` — the privilege switch block |
| `apps/web/components/roles/new-role-card.tsx` | 150 | Inline create card (name → icon/colour → privileges → create) |
| `apps/web/components/roles/appearance.tsx` | 99 | Emoji input + 12 suggestions + 8-swatch colour picker |
| `apps/web/components/roles/officer-consent-banner.tsx` | 137 | The member's own accept/decline/**withdraw** banner |
| `apps/web/components/roles/types.ts` | 91 | View models, action types, `OFFICER_PURPOSE`, `KIND_TAG` |
| `apps/web/components/camp-members.tsx` | 315 | Roster + `AssignRolesDialog` (ToggleGroup multi-select, `:227-315`) |
| `packages/ui/src/components/role-badge.tsx` | 81 | `ROLE_COLOR_HEX`, `ROLE_COLOR_LABELS`, `RoleSwatch`, `RoleBadge` |
| `apps/org/components/org-roles/roles-manager.tsx` | 1327 | System-manager departments+roles screen (largest single file in the unit) |
| `apps/org/components/org-roles/capability-summary.tsx` | 232 | `grantsForRoles` + `CapabilitySummary` — the one renderer behind three surfaces |
| `apps/org/app/(console)/system/roles/page.tsx` | 151 | Two-gate page (read=`runsDeployment`, write=`isSystemManager`) |

### 1.5 Tests

| File | Lines |
|---|---:|
| `packages/core/src/__tests__/org-permissions.test.ts` | 1096 |
| `packages/core/src/__tests__/cross-side-identity.test.ts` | 272 |
| `packages/core/src/__tests__/project-roles.test.ts` | 202 |
| `packages/core/src/__tests__/project-permissions.test.ts` | 195 |
| `packages/core/src/__tests__/org-roles.test.ts` | 188 |
| `packages/core/src/__tests__/org-domains.test.ts` | 184 |
| `packages/core/src/__tests__/officers.test.ts` | 179 |
| `packages/core/src/__tests__/auth-capabilities.test.ts` | 102 |
| `packages/core/src/__tests__/god-emails.test.ts` | 71 |
| `apps/org/lib/__tests__/org-rank-enforcement.test.ts` | 702 |
| `apps/org/lib/__tests__/org-role-actions.test.ts` | 614 |
| `apps/org/lib/__tests__/org-role-lockout.test.ts` | 490 |
| `apps/org/lib/__tests__/org-role-impact.test.ts` | 105 |
| e2e: `e2e/specs/god/god-roles-management.spec.ts` | 237 |
| e2e: `e2e/specs/god/department-domain-scoping.spec.ts` | 338 |
| e2e: `e2e/specs/god/god-privilege-escalation-refused.spec.ts` | 140 |
| e2e: `e2e/specs/camp-lead/roles.spec.ts` | 211 |
| e2e: `e2e/specs/camp-lead/officers.spec.ts` | 128 |
| e2e: `e2e/specs/officer/*.spec.ts` (5 files) | 90+92+89+82+75 = 428 |

**Unit total: ~9,900 lines across ~40 files** (excluding the shared normaliser and questionnaire-authz partials).

---

## 2. Capability list — exhaustive, each cited

### 2.1 Project (camp-side) privileges — 5 keys

`ProjectPermissionKey` (`packages/types/src/roles.ts:262-269`), verbatim:

```
"view_member_details", "manage_questionnaires", "assign_roles", "manage_roles", "manage_members"
```

`PROJECT_PERMISSION_KEYS = ProjectPermissionKey.options` (`:271`).

Human labels, `PROJECT_PERMISSION_LABELS` (`packages/types/src/roles.ts:303-309`), verbatim:

| Key | Label |
|---|---|
| `view_member_details` | `"See member details"` |
| `manage_questionnaires` | `"Send questionnaires"` |
| `assign_roles` | `"Assign roles"` |
| `manage_roles` | `"Manage roles"` |
| `manage_members` | `"Manage members"` |

UI copy for the same five (`apps/web/components/roles/privileges.tsx:143-239`) — note the UI *rewords* every one:

| Key | Switch label | Hint |
|---|---|---|
| `view_member_details` | `"Can see private member info"` | `"Ref codes, emails, join dates — never overrides a burner's own privacy flags."` |
| `manage_questionnaires` | `"Can send questionnaires"` | (expands into sub-scope block) |
| `manage_questionnaires.mayBlock` | `"May send blocking questionnaires"` | `"Blocking stops people using the app until they answer — leads only, usually."` |
| `assign_roles` | `"Can assign roles to members"` | `"Included with managing role definitions."` (only when `manage_roles`) |
| `manage_roles` | `"Can manage role definitions"` | `"Create, edit, delete roles — implies assigning."` |
| `manage_members` | `"Can manage invites"` | `"Create and revoke this camp's invites."` |

**Implication rule:** `manage_roles` implies `assign_roles` — enforced in the resolver at `project-permissions.ts:53` (`if (key === "assign_roles" && p.manage_roles === true) return true;`) AND mirrored in the UI by disabling the `assign_roles` switch when `manage_roles` is on (`privileges.tsx:220-222`).

**Sub-scope on the only privilege that has one.** `ManageQuestionnairesScope` (`packages/types/src/roles.ts:280-283`):

```ts
export const ManageQuestionnairesScope = z.object({
  audienceRoles: z.union([z.literal("all"), z.array(z.string().min(1))]),
  mayBlock: z.boolean(),
});
```

`audienceRoles: "all"` = any audience; otherwise an explicit array of `project_role` ids. `"everyone"` (the whole camp) is expressed as *targeting the baseline role's id* — one concept, not two (`questionnaire-authz.ts:112-120`).

### 2.2 Org (console-side) capabilities — 5 keys

`OrgCapabilityKey` (`packages/types/src/roles.ts:141-148`), verbatim:

```
"create", "read", "update", "delete", "personal_information"
```

Three parallel copy tables in `packages/core/src/org-permissions.ts`:

**`ORG_CAPABILITY_LABELS` (`:350-356`)** — chip/toggle headings:
`create:"Create"`, `read:"Read"`, `update:"Update"`, `delete:"Delete"`, `personal_information:"See personal information"`.

**`ORG_CAPABILITY_CONSEQUENCES` (`:359-367`)** — verb phrases completing "This account can …", lowercase, no full stop:
- `create`: `"add new records in this department's part of the console"`
- `read`: `"open and read this department's part of the console"`
- `update`: `"change existing records in this department's part of the console"`
- `delete`: `"permanently destroy records in this department's part of the console"`
- `personal_information`: `"read people's names, email addresses, phone numbers, ID numbers, emergency contacts and medical notes in this department's part of the console"`

**`ORG_CAPABILITY_DESCRIPTIONS` (`:370-380`)** — the sentence under a checkbox in the role editor; each names a concrete consequence. E.g. `delete` reads `"Permanently destroys records in the domains this department owns. Destroyed, not archived — there is no undo. (Rejecting a registration is NOT this: nothing is destroyed and the decision can be changed.)"`.

### 2.3 The 8 org domains

`ORG_DOMAINS` (`packages/core/src/org-domains.ts:72-81`), verbatim:

```
"registrations", "suppliers", "supplier_documents", "questionnaires",
"bulletins", "camp_categories", "accounts", "audit"
```

`ORG_DOMAIN_LABELS` (`:95-104`) and `ORG_DOMAIN_DESCRIPTIONS` (`:113-130`) provide one label and one full sentence per domain. **Deliberately absent** and documented as such (`:60-71`): `notifications` (the actor's own inbox), `system` (a rank concern), `status` (derived rollups).

**Two domains are documented as INERT today** (`:33-45`): `bulletins` and `camp_categories` carry no personal column and no destructive guard, so owning them changes nothing. Their descriptions say so out loud — the donor treats "a checkbox that reads as access and grants none" as the primary defect class.

### 2.4 Rank-level (non-grantable) capabilities

- `isSystemManager(actor)` — `actor?.rank === "god"` (`org-permissions.ts:438-440`). The anchor.
- `runsDeployment(actor)` — `rank === "engineer" || rank === "god"` (`:671-673`). The system panel's question. **This replaced the `read_system` capability.**
- `canManageAccounts(role)` — `orgRankFromRole(role) === "god"` (`apps/org/lib/session.ts:383-388`). **This replaced the `manage_accounts` capability.**

### 2.5 Auth-provider capabilities (11 keys)

`AUTH_CAPABILITIES` (`packages/core/src/auth-capabilities.ts:103-216`). All eleven are `support: "supported"`; **two are `pending: true`** (provider can, but the app has not wired it):

| Key | support | pending | Backing method |
|---|---|---|---|
| `passwordChange` | supported | — | `auth.api.changePassword` |
| `passwordReset` | supported | — | `auth.api.requestPasswordReset + auth.api.resetPassword` |
| `emailVerification` | supported | — | `auth.api.sendVerificationEmail + auth.api.verifyEmail` |
| `sessionList` | supported | — | `auth.api.listSessions` |
| `sessionRevoke` | supported | — | `auth.api.revokeSession / revokeSessions / revokeOtherSessions` |
| `emailChange` | supported | **yes** | `auth.api.changeEmail` |
| `accountDeletion` | supported | — | `sanitizeAccount (@quagga/web)` |
| `linkedAccounts` | supported | — | `auth.api.listUserAccounts + auth.api.accountInfo` |
| `unlinkAccount` | supported | **yes** | `auth.api.unlinkAccount` |
| `twoFactor` | supported | — | `authClient.twoFactor.enable/verifyTotp/disable + auth.api.enableTwoFactor` |
| `backupCodes` | supported | — | `authClient.twoFactor.generateBackupCodes + verifyBackupCode` |
| `passkeys` | supported | — | `authClient.passkey.addPasskey / signIn.passkey + auth.api.listPasskeys/deletePasskey` |

(12 rows; `emailChange` and `unlinkAccount` are the two pending.) Digit-exact facts recorded in the `reason` strings: cookie-cache read may honour a revoked session **for up to its 5-minute maxAge** (`:139`); 2FA plugin lockout is **10 fails → 15 min** (`:198`); **ten** single-use backup codes shown once at enrolment (`:206`); backup codes stored `storeBackupCodes:'encrypted'`, never plaintext (`:206`); deletion is a **14-day-grace + sweeper** flow (`:165`).

---

## 3. Data model — verbatim

### 3.1 Enums (`packages/db/src/schema.ts`)

```ts
// :71-78 — APPEND-ONLY; `engineer` sits at the end rather than in rank order.
export const membershipRoleEnum = pgEnum("membership_role", [
  "god", "org_staff", "lead", "admin", "member", "engineer",
]);

// :87-93
export const projectRoleKindEnum = pgEnum("project_role_kind", [
  "captain", "baseline", "default", "custom", "officer",
]);

// :98
export const orgRoleKindEnum = pgEnum("org_role_kind", ["system", "custom"]);

// :101-104 (migration 0022)
export const orgDepartmentKindEnum = pgEnum("org_department_kind", ["system", "custom"]);

// :106-115
export const roleColorEnum = pgEnum("role_color", [
  "teal", "teal_deep", "apricot", "peach", "sage", "olive", "rust", "neutral",
]);

// :119-123
export const roleAssignmentConsentEnum = pgEnum("role_assignment_consent", [
  "pending", "accepted", "declined",
]);
```

Zod mirrors in `packages/types/src/roles.ts`: `MembershipRole` (`:44-51`), `OrgRoleKind` (`:96`), `OrgDepartmentKind` (`:124`), `OrgCapabilityKey` (`:141-147`), `OrgPermissions` (`:189-195`), `ProjectRoleKind` (`:215-221`), `RoleColor` (`:244-253`), `ProjectPermissionKey` (`:262-268`), `ProjectPermissions` (`:293-299`), `OfficerKey` (`:315-321`), `RoleAssignmentConsent` (`:332-336`).

Derived constant tuples in the same file:
- `ORG_APP_ROLES = ["god","org_staff","engineer"]` (`:61-65`)
- `PROJECT_ADMIN_ROLES = ["lead","admin"]` (`:68`)
- `UNDELETABLE_ORG_ROLE_KINDS = ["system"]` (`:100`)
- `RENAMEABLE_ORG_ROLE_KINDS = ["system","custom"]` (`:103-106`)
- `UNDELETABLE_ORG_DEPARTMENT_KINDS = ["system"]` (`:128-130`)
- `UNDELETABLE_ROLE_KINDS = ["captain","baseline","default","officer"]` (`:225-230`)
- `RENAMEABLE_ROLE_KINDS = ["captain","baseline","default","custom"]` (`:233-238`)
- `ROLE_COLORS = RoleColor.options` (`:256`)
- `OFFICER_KEYS = OfficerKey.options` (`:324`)

### 3.2 Tables

**`memberships`** (`schema.ts:752-788`) — user × group with a role.
```
id uuid PK defaultRandom
user_id uuid NOT NULL → users.id ON DELETE cascade
group_id uuid NOT NULL → groups.id ON DELETE cascade
role membership_role NOT NULL DEFAULT 'member'
ref_code text                       -- camp-scoped member ref, e.g. MAH-M017; nullable
created_at timestamp NOT NULL defaultNow
UNIQUE (user_id, group_id)          -- memberships_user_group_idx
INDEX (group_id)                    -- memberships_group_idx
UNIQUE (group_id, ref_code)         -- memberships_group_ref_code_idx
```
Migration 0018 **dropped** `department` (text) and `department_lead` (bool) from this table (`schema.ts:763-769`; SQL at `migrations/0018_tidy_mastermind.sql`, last two statements) — a deliberate removal of a second department vocabulary.

**`project_roles`** (`schema.ts:949-982`):
```
id uuid PK defaultRandom
group_id uuid NOT NULL → groups.id ON DELETE cascade
name text NOT NULL
name_normalized text NOT NULL
is_default boolean NOT NULL DEFAULT false
sort integer NOT NULL DEFAULT 0
kind project_role_kind NOT NULL DEFAULT 'custom'
color role_color NOT NULL DEFAULT 'neutral'
emoji text
permissions jsonb $type<ProjectPermissions> NOT NULL DEFAULT {}
officer_key text                    -- stable org catalog anchor; null for non-officers
created_at, updated_at timestamp NOT NULL defaultNow
UNIQUE (group_id, name_normalized)  -- project_roles_group_name_normalized_idx
INDEX (group_id)
```

**`member_role_assignments`** (`schema.ts:988-1037`):
```
membership_id uuid NOT NULL → memberships.id ON DELETE cascade
project_role_id uuid NOT NULL → project_roles.id ON DELETE cascade
consent_status role_assignment_consent NOT NULL DEFAULT 'accepted'
accepted_at timestamp
org_visible boolean NOT NULL DEFAULT false
consent_edition_id uuid → editions.id ON DELETE set null   -- migration 0023
created_at timestamp NOT NULL defaultNow
PRIMARY KEY (membership_id, project_role_id)
INDEX (project_role_id)             -- member_role_assignments_role_idx
INDEX (consent_edition_id)          -- member_role_assignments_consent_edition_idx
```
The `consent_edition_id` comment (`:1008-1024`) is the single best POPIA lesson in the repo: *"Consent to share a phone number with AfrikaBurn is consent for ONE burn"* — nothing was edition-scoped, so an officer who accepted in 2026 was still `accepted` + `org_visible` in 2027 while the console read *this* year's bio through *last* year's consent.

**`org_departments`** (`schema.ts:800-829`):
```
id uuid PK defaultRandom
key text NOT NULL                   -- stable slug, derived once, never rewritten by rename
name text NOT NULL
name_normalized text NOT NULL
description text
kind org_department_kind NOT NULL DEFAULT 'custom'
sort integer NOT NULL DEFAULT 0
created_at, updated_at timestamp NOT NULL defaultNow
UNIQUE (key), UNIQUE (name_normalized)
```

**`org_department_domains`** (`schema.ts:854-869`) — **`domain` IS the primary key**, so a domain has at most one owner, enforced by the database:
```
domain text PRIMARY KEY             -- an OrgDomain key; TEXT not enum, on purpose
department_id uuid NOT NULL → org_departments.id ON DELETE cascade
created_at timestamp NOT NULL defaultNow
INDEX (department_id)
```

**`org_roles`** (`schema.ts:887-915`):
```
id uuid PK defaultRandom
key text NOT NULL                   -- 'org_staff' | 'engineer' | 'dept.<deptkey>.<slot>' | 'custom.<slug>'
department_id uuid → org_departments.id ON DELETE cascade   -- null = org-wide
name text NOT NULL
name_normalized text NOT NULL
description text
kind org_role_kind NOT NULL DEFAULT 'custom'
color role_color NOT NULL DEFAULT 'neutral'
permissions jsonb $type<OrgPermissions> NOT NULL DEFAULT {}
sort integer NOT NULL DEFAULT 0
created_at, updated_at timestamp NOT NULL defaultNow
UNIQUE (key), UNIQUE (name_normalized), INDEX (department_id)
```
Note the schema comment `:883-885`: **`god` is not a row here.** The System manager is anchored on `memberships.role = 'god'` so no permission edit can define them out of existence.

**`org_role_assignments`** (`schema.ts:924-939`):
```
membership_id uuid NOT NULL → memberships.id ON DELETE cascade
org_role_id uuid NOT NULL → org_roles.id ON DELETE cascade
created_at timestamp NOT NULL defaultNow
PRIMARY KEY (membership_id, org_role_id)
INDEX (org_role_id)
```
Keyed on the **membership**, so revoking console access cascades the role grants away rather than leaving orphans a later membership could re-attach.

### 3.3 Migrations in this unit

| Migration | What it did |
|---|---|
| `0004_questionnaire_audience_and_project_roles.sql` | introduced `project_roles` + audiences |
| `0018_tidy_mastermind.sql` | created `org_role_kind`, `org_departments`, `org_roles`, `org_role_assignments`; **dropped** `memberships.department` and `memberships.department_lead` |
| `0019_burly_paibok.sql` | `org_department_domains` |
| `0022_redundant_luckman.sql` | created `org_department_kind`; **rewrote every stored `org_roles.permissions` object into the 5-key CRUD vocabulary** via a jsonb rebuild (not key renames — so a row carrying a key from neither vocabulary cannot survive) |
| `0023_officer_consent_edition.sql` | `member_role_assignments.consent_edition_id`, backfilled to the active edition |

The 0022 mapping table, verbatim from the migration header:
```
read                      -> read
write                     -> create + update
delete                    -> delete
read_personal_information -> personal_information
manage_camp_categories    -> create + update + delete
manage_accounts           -> DROPPED (System-manager-only already)
read_system               -> DROPPED (now the engineer/System manager rank)
```

### 3.4 Seeded rows

**`SEEDED_ORG_DEPARTMENTS`** (`packages/core/src/org-roles.ts:266-283`) — exactly two, verbatim:
```ts
{ key: "theme_camps", name: "Theme camps",
  description: "Camp, artwork and vehicle registrations — the review pipeline behind the participant app.",
  domains: ["registrations", "camp_categories"], sort: 0 },
{ key: "suppliers", name: "Suppliers",
  description: "The supplier repository and the documents suppliers acknowledge — the org side of the supplier portal.",
  domains: ["suppliers", "supplier_documents"], sort: 1 },
```

**`SEEDED_ORG_ROLES`** (`org-roles.ts:285-314`):
```ts
{ key: "org_staff", name: "Org staff", color: "apricot", sort: 0,
  permissions: { create: true, read: true, update: true, delete: true, personal_information: true } },
{ key: "engineer", name: "Engineer", color: "teal", sort: 1,
  permissions: { create: true, read: true, update: true } },   // NO personal_information, NO delete
```

**Department role defaults** (`org-roles.ts:352-364`):
```ts
DEPARTMENT_LEAD_PERMISSIONS   = { create: true, read: true, update: true, delete: true, personal_information: true }
DEPARTMENT_MEMBER_PERMISSIONS = { create: true, read: true, update: true }
```
Lead role colour `olive`, member `sage`; sort `100 + i` (`org-roles.ts:396,401`).

**`DEFAULT_PROJECT_ROLES`** (`packages/core/src/project-roles.ts:42-70`) — exactly three, in order:
| name | sort | kind | color | emoji | permissions |
|---|---:|---|---|---|---|
| `Captain` | 0 | `captain` | `apricot` | 🎩 | `allProjectPermissions()` (locked) |
| `Team lead` | 1 | `default` | `teal` | 🔧 | `{ view_member_details: true, manage_questionnaires: { audienceRoles: "all", mayBlock: false } }` |
| `Burner` | 2 | `baseline` | `sage` | 🔥 | `{}` |

Team lead's `audienceRoles` is seeded `"all"` and **re-pointed to the baseline role's id after insert** by `teamLeadScopePatch` (`project-roles.ts:206-219`), because the baseline id does not exist until the rows do.

**`OFFICER_CATALOG`** (`packages/core/src/officers.ts:30-51`) — exactly five, verbatim:
| key | name | emoji | color |
|---|---|---|---|
| `lnt_officer` | `LNT Lead` | ♻️ | `sage` |
| `safety_officer` | `Safety Officer` | ⛑️ | `apricot` |
| `fire_safety_officer` | `Safety Baron` | 🔥 | `rust` |
| `sound_officer` | `Sound Officer` | 🔊 | `teal` |
| `safety_monitor` | `Safety Monitor` | 🛡️ | `olive` |

Note `fire_safety_officer` displays as **"Safety Baron"** — the key and the label deliberately disagree.

**`ROLE_COLOR_HEX`** (`packages/ui/src/components/role-badge.tsx:8-17`), verbatim:
```
teal #2D7696 · teal_deep #235C75 · apricot #F4B672 · peach #FFBC7D
sage #B6D090 · olive #7D9953 · rust #C24438 · neutral #ADB6B3
```

---

## 4. Public API surface — verbatim signatures

### 4.1 `@quagga/core/project-permissions` (the Camp 404 candidate)

```ts
export function isPermissionBackstop(role: MembershipRole): boolean            // :23
export interface PermissionMembership {                                        // :33
  structuralRole: MembershipRole;
  rolePermissions: readonly ProjectPermissions[];
}
export function hasProjectPermission(m: PermissionMembership, key: ProjectPermissionKey): boolean   // :43
export function canManageQuestionnaireAudience(
  m: PermissionMembership,
  req: { targetRoleIds: readonly string[]; blocking: boolean },
): boolean                                                                      // :74
export function allProjectPermissions(): ProjectPermissions                     // :102
export function isPermissionsLockedKind(kind: ProjectRoleKind): boolean         // :117
export function enforceKindPermissions(kind: ProjectRoleKind, permissions: ProjectPermissions): ProjectPermissions  // :126
export function roleGrantsElevatedPrivileges(kind: ProjectRoleKind, permissions: ProjectPermissions): boolean       // :142
```

### 4.2 `@quagga/core/project-roles`

```ts
export interface DefaultProjectRole { name: string; sort: number; kind: ProjectRoleKind; color: RoleColor; emoji: string; permissions: ProjectPermissions }  // :22
export const DEFAULT_PROJECT_ROLES: readonly DefaultProjectRole[]   // :42
export const PROJECT_ROLE_NAME_MAX = 60                             // :73
export const PROJECT_ROLE_CAP = 20                                  // :77
export function roleCapReached(existingCount: number): boolean      // :80
export function normalizeRoleName(name: string): string             // :89
export function cleanRoleName(name: string): string                 // :94
export function isValidRoleName(name: string): boolean              // :99
export function roleNameConflicts(existingNames: readonly string[], candidate: string, exceptNormalized?: string): boolean  // :113
export function dedupeRoleNames(names: readonly string[]): string[] // :132
export interface ProjectRoleInsert {                                // :147
  groupId: string; name: string; nameNormalized: string; isDefault: boolean;
  sort: number; kind: ProjectRoleKind; color: RoleColor; emoji: string | null;
  permissions: ProjectPermissions; officerKey: OfficerKey | null;
}
export function defaultProjectRoleRows(groupId: string): ProjectRoleInsert[]                    // :161
export function officerRoleRows(groupId: string, startSort = 100): ProjectRoleInsert[]          // :182
export function teamLeadScopePatch(roles: readonly { id: string; kind: ProjectRoleKind }[]):
  { roleId: string; permissions: ProjectPermissions } | null                                    // :206
export function canDeleteRoleKind(kind: ProjectRoleKind): boolean   // :222  → kind === "custom"
export function canRenameRoleKind(kind: ProjectRoleKind): boolean   // :227  → kind !== "officer"
export function isBaselineKind(kind: ProjectRoleKind): boolean      // :236  → kind === "baseline"
```

### 4.3 `@quagga/core/officers`

```ts
export interface OfficerCatalogEntry { key: OfficerKey; name: string; emoji: string; color: RoleColor }  // :18
export const OFFICER_CATALOG: readonly OfficerCatalogEntry[]                       // :30
export function officerCatalogEntry(key: OfficerKey): OfficerCatalogEntry | undefined  // :58
export type OfficerRequirement = "required" | "recommended"                        // :65
export interface OfficerTriggerInput { soundLevel: number; hasGenerators: boolean; hasOpenFlame: boolean; hasFuelStorage: boolean }  // :72
export function soundLevelFromValue(value: string | null | undefined): number      // :86
export function officerRequirements(input: OfficerTriggerInput): Map<OfficerKey, OfficerRequirement>  // :106
export function requiredOfficerKeys(input: OfficerTriggerInput): OfficerKey[]      // :120
export interface OutstandingOfficers { outstanding: OfficerKey[]; requiredCount: number; assignedCount: number; applies: boolean }  // :127
export function outstandingOfficers(input: {
  isRegisteredOrInFlight: boolean; triggers: OfficerTriggerInput; assignedKeys: Iterable<OfficerKey>;
}): OutstandingOfficers                                                            // :146
export const OFFICER_CONSENT_INITIAL: RoleAssignmentConsent  // :179 = "pending"
export function officerConsentCopy(officerName: string): string                    // :182
export function officerContactVisibleToOrg(assignment: { isOfficer: boolean; consent: RoleAssignmentConsent }): boolean  // :196
export function officerSlotFilled(consent: RoleAssignmentConsent): boolean         // :204
```

### 4.4 `@quagga/core/org-permissions`

```ts
export const ORG_RANKS = ["engineer","org_staff","god"] as const                   // :150
export type OrgRank = (typeof ORG_RANKS)[number]                                   // :151
export const ORG_RANK_LABELS: Record<OrgRank,string>                               // :154
export const ORG_RANK_DESCRIPTIONS: Record<OrgRank,string>                         // :161
export function orgRankFromRole(role: MembershipRole|null|undefined): OrgRank|null // :178
export const ORG_CAPABILITIES = ORG_CAPABILITY_KEYS                                // :212
export type OrgCapability = OrgCapabilityKey                                       // :213
export const SYSTEM_MANAGER_ONLY_CAPABILITIES: readonly OrgCapability[] = []       // :230 (EMPTY)
export const GRANTABLE_ORG_CAPABILITIES: readonly OrgCapability[]                  // :236
export const DEPARTMENT_SCOPED_CAPABILITIES: readonly OrgCapability[] = ORG_CAPABILITIES  // :263
export function isDepartmentScopedCapability(capability: OrgCapability): boolean   // :271
export const ENGINEER_RANK_CARVE_OUTS = ["personal_information","delete"]          // :300
export function isRankCarveOut(actor: OrgActor|null|undefined, capability: OrgCapability): boolean  // :312
export function reachesEveryDepartment(actor: OrgActor|null|undefined, capability: OrgCapability): boolean  // :324
export const ORG_CAPABILITY_LABELS / _CONSEQUENCES / _DESCRIPTIONS                 // :350 / :359 / :370
export const DEPARTMENT_SCOPE_NOTE: string                                         // :394
export interface OrgRoleGrant { id: string; key: string; name: string; kind: OrgRoleKind; departmentId: string|null; permissions: OrgPermissions }  // :401
export interface OrgActor { rank: OrgRank; roles: readonly OrgRoleGrant[]; domains: DomainOwnership }  // :428
export function isSystemManager(actor: OrgActor|null|undefined): boolean           // :438
export function orgCan(actor, capability): boolean                                 // :456
export function orgCanIn(actor, capability, departmentId: string|null): boolean    // :488
export function orgCanInDomain(actor, capability, domain: OrgDomain|null): boolean // :521
export function isDepartmentScopedGrant(actor, capability): boolean                // :540
export function departmentsGranting(actor, capability): string[]                   // :554
export function orgCapabilitiesFor(actor): readonly OrgCapability[]                // :569
export function orgCapabilityRefusal(actor, capability, domain: OrgDomain|null = null): string  // :621
export function runsDeployment(actor): boolean                                     // :671
export function runsDeploymentRefusal(): string                                    // :676
export function systemManagerRefusal(what: string): string                         // :688
export function canReadPersonalInformationIn(actor, domain: OrgDomain): boolean    // :702
export function canReadPersonalInformationAnywhere(actor): boolean                 // :720
export function sanitizeOrgPermissions(permissions: OrgPermissions|null|undefined): OrgPermissions  // :733
export function orgPermissionsFromKeys(keys: readonly OrgCapability[]): OrgPermissions  // :745
export interface OrgCapabilityGrant { capability: OrgCapability; departmentIds: string[]|null; domains: OrgDomain[]|null }  // :763
export function summarizeOrgActor(actor): OrgCapabilityGrant[]                     // :809
export function grantScopeClause(grant: Pick<OrgCapabilityGrant,"domains">, departmentNames: readonly string[]): string  // :835
export function grantedOrgCapabilities(permissions: OrgPermissions|null|undefined): OrgCapability[]  // :853
```

### 4.5 `@quagga/core/org-roles`

```ts
export const ORG_DEPARTMENT_NAME_MAX = 60     // :52
export const ORG_ROLE_NAME_MAX = 60           // :55
export const ORG_DEPARTMENT_CAP = 40          // :58
export const ORG_ROLE_CAP = 60                // :61
export function normalizeOrgName(name: string): string           // :69  (delegates to normalizeName)
export function cleanOrgName(name: string): string               // :74
export function isValidDepartmentName(name: string): boolean     // :79
export function isValidOrgRoleName(name: string): boolean        // :89
export function orgNameConflicts(existingNames, candidate, exceptNormalized?): boolean  // :103
export function departmentKeyFrom(name: string): string          // :123  slug, lowercased, [^a-z0-9]+→_, trimmed, .slice(0,40), fallback "department"
export function uniqueDepartmentKey(base: string, taken: readonly string[]): string     // :133  base_2 … base_999, then base_<Date.now()>
export const DEPARTMENT_ROLE_SLOTS = ["lead","member"] as const  // :147
export function departmentRoleKey(departmentKey, slot): string   // :151  → `dept.${departmentKey}.${slot}`
export function customOrgRoleKey(name, taken): string            // :159  → `custom.${departmentKeyFrom(name)}`
export function canDeleteOrgRoleKind(kind): boolean              // :174  kind === "custom"
export function canDeleteOrgDepartmentKind(kind): boolean        // :187  kind === "custom"
export function canRenameOrgRoleKind(_kind): boolean             // :192  always true
export function canEditOrgRolePermissions(_kind): boolean        // :202  always true
export function canRescopeOrgRole(role: { kind; departmentId }): boolean  // :208  !(kind==="system" && departmentId!==null)
export interface OrgRoleInsert { key; departmentId; name; nameNormalized; description; kind; color; permissions; sort }  // :216
export const SEEDED_ORG_DEPARTMENTS / SEEDED_ORG_ROLES           // :266 / :285
export function seededOrgRoleRows(): OrgRoleInsert[]             // :317
export const DEPARTMENT_LEAD_PERMISSIONS / DEPARTMENT_MEMBER_PERMISSIONS  // :352 / :360
export function departmentRoleName(departmentName, slot): string // :367  → `${cleanOrgName(name)} ${slot}`
export function departmentRoleRows(department: { id; key; name }): OrgRoleInsert[]  // :379
export function defaultRoleKeyForRank(rank: "org_staff"|"engineer"): string  // :413  identity
```

### 4.6 `@quagga/core/org-domains`

```ts
export const ORG_DOMAINS  // :72
export type OrgDomain     // :83
export function isOrgDomain(value: string): value is OrgDomain   // :90
export const ORG_DOMAIN_LABELS / ORG_DOMAIN_DESCRIPTIONS         // :95 / :113
export interface DomainOwner { id: string; name: string }        // :134
export type DomainOwnership = Readonly<Partial<Record<OrgDomain, DomainOwner>>>  // :147
export const NO_DOMAIN_OWNERSHIP: DomainOwnership = Object.freeze({})            // :151
export function buildDomainOwnership(rows: readonly { domain: string; departmentId: string; departmentName: string }[]): DomainOwnership  // :159
export function departmentOwning(ownership, domain): DomainOwner | null          // :176
export function departmentForDomain(ownership, domain): string | null            // :185
export function domainsOwnedBy(ownership, departmentId): OrgDomain[]             // :194
export function unownedDomains(ownership): OrgDomain[]                           // :203
export function listDomainLabels(domains: readonly OrgDomain[]): string          // :210
export function departmentDomainsNote(domains: readonly OrgDomain[]): string     // :226
```

### 4.7 `@quagga/core/god-emails`

```ts
export function parseGodEmails(raw: string|undefined|null): string[]                       // :8
export function isGodEmailIn(email: string|null|undefined, godEmails: readonly string[]): boolean  // :17
export function canBootstrapGod(email, emailVerified: boolean, godEmails): boolean         // :34
```

### 4.8 `apps/web/lib/roles-store.ts` (server-only persistence)

```ts
export interface ProjectRole { id; name; isDefault; sort; kind; color; emoji; permissions; officerKey }  // :59
export const ensureDefaultRoles = cache(async (groupId: string): Promise<void> => …)        // :102
export async function listRoles(groupId): Promise<ProjectRole[]>                            // :149
export interface RoleAssignmentRow { projectRoleId; consent; orgVisible }                   // :173
export async function getRoleAssignments(groupId): Promise<Map<string, RoleAssignmentRow[]>> // :183
export type RoleMutationResult = { ok: true } | { ok: false; error: string }                // :212
export async function createRole(groupId, rawName, opts?: { color?; emoji? }): Promise<RoleMutationResult>  // :215
export async function renameRole(groupId, roleId, rawName)                                  // :261
export async function setRoleAppearance(groupId, roleId, appearance: { color?; emoji? })    // :306
export async function setRolePermissions(groupId, roleId, permissions)                      // :342
export async function removeRole(groupId, roleId)                                           // :367
export async function setMemberRoles(groupId, membershipId, roleIds, opts?: { allowElevated? })  // :400
export async function assignOfficer(groupId, membershipId, roleId, opts?: { allowElevated? })    // :499
export async function unassignOfficer(groupId, membershipId, roleId)                        // :602
export interface PendingOfficerConsent { membershipId; roleId; officerKey; officerName; emoji; groupId; groupName; groupSlug; consent }  // :650
export async function pendingOfficerConsents(userId): Promise<PendingOfficerConsent[]>      // :675
export async function respondToOfficer(userId, groupId, roleId, accept: boolean, editionId: string)  // :731
export interface ViewerPermissionMembership { structuralRole; rolePermissions }              // :858
export async function getMemberPermissions(groupId, userId): Promise<ViewerPermissionMembership | null>  // :869
export async function getBaselineRoleId(groupId): Promise<string | null>                    // :912
export interface OfficerAssignmentView / OfficerRoleView / OfficerStatus                    // :921 / :927 / :937
export async function getOfficerStatus(groupId, editionId): Promise<OfficerStatus>          // :948
export async function membershipIdsWithRoles(groupId, roleIds): Promise<string[]>           // :1035
```

### 4.9 Server actions

**Camp side** (`apps/web/app/(app)/camps/[slug]/actions.ts`, all `Promise<RoleMutationResult>`):
`createRoleAction`, `renameRoleAction`, `removeRoleAction` (`:193`), `setMemberRolesAction` (`:211`), `setRoleAppearanceAction` (`:242`), `setRolePermissionsAction` (`:263`), `assignOfficerAction` (`:285`), `unassignOfficerAction` (`:301`), `respondToOfficerAction` (`:328`). Plus `createRoleWithSetupAction` (`settings/roles/actions.ts:33`).

Required permission per action:
| Action | Gate |
|---|---|
| `createRoleWithSetupAction` | `manage_roles` |
| `renameRoleAction` / `removeRoleAction` / `setRoleAppearanceAction` / `setRolePermissionsAction` | `manage_roles` |
| `setMemberRolesAction` | `assign_roles` (+ `manage_roles` decides `allowElevated`) |
| `assignOfficerAction` / `unassignOfficerAction` | `assign_roles` |
| `respondToOfficerAction` | **none** — camp membership only; the actor consents on their own behalf (`:323-327`) |

**Org side** (`apps/org/lib/actions/org-roles.ts`, all `Promise<ActionResult>`, all `requireSystemManager()` first):
`createDepartment` (`:68`), `renameDepartment` (`:153`), `deleteDepartment` (`:211`), `setDepartmentDomains` (`:280`), `createOrgRole` (`:368`), `updateOrgRole` (`:458`), `deleteOrgRole` (`:537`), `setAccountOrgRoles` (`:596`). Plus `setOrgStaffRole` (`apps/org/lib/actions/accounts.ts:59`).

**Org session** (`apps/org/lib/session.ts`):
```ts
export interface OrgSession { user; dbUserId: string; role: OrgRank; membershipId: string; actor: OrgActor; orgGroupId: string }  // :43
export type OrgSessionState =
  | { kind: "unauthenticated" }
  | { kind: "not_ready"; user }
  | { kind: "forbidden"; user; godEmailUnverified?: boolean }
  | ({ kind: "ok" } & OrgSession)                                       // :99-114
export const resolveOrgSession = cache(async (): Promise<OrgSessionState> => …)  // :135
export async function requireOrgSession(options?: { capability: OrgCapability; domain: OrgDomain }): Promise<OrgSession>  // :304
export async function requireSystemManager(what = "manage departments, roles or who holds them"): Promise<OrgSession>     // :364
export function canManageAccounts(role: MembershipRole): boolean        // :383
```
`domain` is **mandatory whenever a capability is named — enforced by the TypeScript type, not by review** (`:317-321`). It used to be optional and defaulted to "no department", which was fail-closed but silent.

---

## 5. UX behaviours

### 5.1 Camp Roles & Officers settings screen (`/camps/[slug]/settings/roles`)

Three accordion sections, one row open at a time (`roles-settings.tsx:116,142,165` — `<Accordion type="single" collapsible>`):

1. **Officers.** Header copy switches on `officerApplies` (`:109-114`): registered → *"The people AfrikaBurn needs to reach. Assigning one asks them to accept — only then are their contact details shared with AfrikaBurn."*; free camp → *"Free camps don't have required officers — requirements apply once you register. You can still name them voluntarily."* Badge: green `"All required officers assigned"` with a check, or destructive `"{n} outstanding · {assigned} of {required} assigned"` (`:69-93`). Badge renders nothing at all when `!outstanding.applies`.
2. **Core roles** — `captain | baseline | default`. Sub: *"Seeded on every camp. Rename and recolour freely — these can't be deleted."*
3. **Custom roles** — `custom`. Sub: *"Anything your camp needs. Delete these anytime (members keep their membership)."* Empty state: *"No custom roles yet — add one to organise your crew."* `NewRoleCard` rendered only when `canManageRoles`.

**Role row** (`role-row.tsx`): collapsed trigger is `RoleBadge` + a `KIND_TAG` chip + a one-line summary. `KIND_TAG` (`types.ts:85-91`): `captain→"Default"`, `baseline→"Baseline · everyone"`, `default→"Default"`, `custom→"Custom"`, `officer→"Officer"`. Summary (`role-row.tsx:39-46`): captain → `"All privileges · locked on"`; baseline → `"{privileges} · rename to alias your people"`; else `"{privileges} · {n} member(s)"`. Expanded: name input (`maxLength={60}`) only when `canRenameRoleKind`; `AppearancePicker`; a Save button that appears **only when dirty**; `PrivilegeEditor`; then a **two-step delete** that first states the cost — *"{n} member(s) hold this role — deleting removes it from them. They stay in the camp."* — before offering the destructive button (`:198-241`). Non-deletable, non-baseline roles get the explainer *"Seeded roles can't be deleted — rename and recolour them instead."*

**Privilege block** (`privileges.tsx`). Five switch rows on a `divide-y`. `manage_questionnaires` expands into a `bg-muted/40` sub-block headed **"Who they can send to"**: an "Any audience" chip plus one chip per non-officer role (`:97` filters `r.kind !== "officer"`), an explainer *"{baselineName} is the baseline — selecting it means the whole camp."*, and a nested "May send blocking questionnaires" switch. Turning `manage_questionnaires` ON defaults the scope to `[baseline.id]` (or `"all"` if there is no baseline) with `mayBlock: false` (`:100-114`). Captain rows render an Info panel: *"Captains can do everything — that's what makes them captains. Their privileges are locked on."* and every control is disabled (`:265-266,292-298`).

`privilegeSummary` (`:21-36`) is the collapsed one-liner: joins with `" · "`, and returns `"No extra privileges"` when empty. Note it prints `"Manages roles"` OR `"Assigns roles"` (never both) and calls `manage_members` **"Manages invites"**.

**Appearance picker** (`appearance.tsx`): a 4-char-max emoji `Input` (`maxLength={4}`, `w-14`, centered, placeholder 🙂) beside 12 suggestion buttons — `EMOJI_SUGGESTIONS = ["🔧","🎩","🔥","🧙","🍳","🎨","🎧","🛠️","🚿","☕","🚚","⚡"]` (`:17-30`) — and 8 `RoleSwatch` colour buttons with `aria-pressed` + `ROLE_COLOR_LABELS` as `aria-label`.

**New role card** (`new-role-card.tsx`): collapsed to a dashed-border "New role" outline button; expands to name (Enter submits, `:100-105`) → appearance → privileges → Create. Default colour `"teal"`, empty permissions.

### 5.2 Officer row and the consent flow

**Officer row** (`officer-row.tsx`) — the trigger carries, in order: `RoleBadge`, a `Lock` glyph with `aria-label="Set by AfrikaBurn — officers can't be renamed"`, a required/recommended tag (only when `officerApplies`), one consent tag per assignment, the summary, and an "Assign" affordance rendered as a **`<span>` not a `<button>`** because a real button would nest inside the accordion trigger (`:174-180` — the comment is explicit about why).

`CONSENT_TAG` (`:41-45`): `pending → "Awaiting acceptance"`, `accepted → "✓ Accepted"`, `declined → "Declined"`.

Per-assignment status copy (`:215-219`), verbatim:
- accepted: `"Accepted · name, email and phone shared with AfrikaBurn for this role"`
- pending: `"Awaiting their acceptance · nothing shared yet"`
- declined: `"Declined · the slot is free"`

Assign toast: `"Asked them to accept — nothing is shared until they do."` (`:96`). Unassigned empty state: *"Not yet assigned — that's a normal state, you can name someone whenever you know who it is."*

Two standing footnotes: the POPIA consent copy from `officerConsentCopy(role.name)` (`:261`), and the lock explainer *"Officer names, icons and colours are set by AfrikaBurn so the same vocabulary works across every camp — you can still choose what this officer may do inside your camp."* (`:266-269`). That last clause is what makes the `assignOfficer` escalation guard necessary (§6.3).

`officerConsentCopy(name)` (`officers.ts:182-188`), verbatim:
> `Accepting the ${officerName} role shares your contact details (name, email, and phone number) with AfrikaBurn for this function. You can decline, which leaves the role unassigned.`

**Consent banner** (`officer-consent-banner.tsx`) — the member's own surface. Renders BOTH pending and already-accepted assignments. The header comment (`:22-30`) states the rule: **"CONSENT THAT CANNOT BE WITHDRAWN IS NOT CONSENT."** The banner previously vanished on Accept, leaving the phone number shared and the only unassign path on a lead-only settings page that 404s a plain member. Accepted rows now get a **"Withdraw consent"** button and the copy *"You accepted this role, so AfrikaBurn can reach you on the contact details in your bio for it. Withdrawing stops that and frees the slot — your camp can ask you again, or name someone else."* Decline/withdraw toast: `"Withdrawn. AfrikaBurn no longer has your contact for that role."`; accept toast: `"Thanks — you're registered."`

### 5.3 Member roster role assignment

`AssignRolesDialog` (`camp-members.tsx:227-315`): a `ToggleGroup type="multiple" variant="outline"` of assignable roles (baseline + officers excluded). Dialog copy: *"A member can hold several roles. Officer registrations are managed on the Roles & Officers page."* Empty: *"No assignable roles yet. Add some on the Roles & Officers page."* The optimistic merge (`:203-216`) deliberately preserves chips this dialog never controlled (baseline, accepted officers) — an earlier version stripped the "Burner" chip off whoever you had just given a role to.

### 5.4 Org roles screen (`/system/roles`)

Five house rules stated in the file header (`roles-manager.tsx:90-118`), worth quoting because they are the transferable design contract:

1. Nothing destructive happens without stating who it costs — the dialog **names the people**, and a toast afterwards is not a substitute for a sentence before.
2. Permanence is **explained in the place the control it blocks would be** — a permanent role's editor puts the reason in the footer slot the Delete button occupies.
3. Rights are described by **consequence**, never by permission key.
4. A department that owns nothing **says so**.
5. Which rights a department confines is **read from the model** (`DEPARTMENT_SCOPED_CAPABILITIES`), never restated — two screens once gave opposite answers.

`RoleEditor` (`:1063-1327`): name, description (`rows={2}`), department `Select` (with `"Org-wide (no department)"` sentinel `NO_DEPARTMENT = "__none__"`), 8-swatch colour row, a `<fieldset>` legend **"What someone holding it can do"** with one bordered label per grantable capability (the `delete` one gets `border-destructive/40 bg-destructive/5`), each carrying its label + description + a *per-capability scoping sentence* that reads the model, and finally a live preview box headed **"Someone whose only role is this can:"** rendering `CapabilitySummary` over the draft. Save is disabled while the name is empty.

`HoldersLosingIt` (`:957-993`) renders the affected addresses in a monospace list and, when `leftWithNothing > 0`, a warning panel: *"…so they will keep console access and find it empty until you give them a role."*

`DepartmentDeletionCost` (`:996-1053`) lists every role that dies with the department, marks the permanent ones *"· permanent, dies with the department"*, states which domains go back to being unowned, and closes with *"Written to the audit trail with your name on it. There is no undo — recreating the department creates new roles, and nobody is re-assigned."*

### 5.5 Refusal copy — the single best-written part of the unit

`orgCapabilityRefusal` (`org-permissions.ts:621-655`) composes a refusal from the capability's own consequence plus **why** it failed, in a strict order (rank ceiling first, then ungrantable, then no-roles, then scope, then absence). Verbatim examples:

- Engineer + `delete`: *"Engineer accounts reach every department, and deliberately cannot delete anything in any of them. Destroying org data is org work — ask someone with the org staff door to do it, or ask a system manager to change your access."*
- No roles at all: *"Your account can open the console but holds no org roles yet, so there is nothing it can do here. A system manager assigns roles from the Accounts screen."*
- Scoped refusal, three distinct `scopeReason` branches (`:589-603`): the domain belongs to another named department / the domain is owned by **nobody** / the caller **named no domain at all**. The header comment explains why: *"Being told a false reason is worse than being told none — it sends someone to argue with the wrong colleague."*

`systemManagerRefusal(what)` (`:688-691`): *"Only a system manager can {what}. That is the rank rather than a permission, so it cannot be granted to a role — which is what keeps every other permission safe to edit."*

---

## 6. Validation and edge-case rules, digit-exact

### 6.1 Caps and lengths

| Constant | Value | Where |
|---|---:|---|
| `PROJECT_ROLE_CAP` | **20** roles per camp (defaults + officers + custom) | `project-roles.ts:77` |
| `PROJECT_ROLE_NAME_MAX` | **60** | `project-roles.ts:73` |
| `ORG_DEPARTMENT_CAP` | **40** | `org-roles.ts:58` |
| `ORG_ROLE_CAP` | **60** (seeded + custom) | `org-roles.ts:61` |
| `ORG_DEPARTMENT_NAME_MAX` / `ORG_ROLE_NAME_MAX` | **60** each | `org-roles.ts:52,55` |
| Department key slug | `.slice(0, 40)` | `org-roles.ts:128` |
| Key disambiguation loop | `for (let i = 2; i < 1000; i += 1)`, then `${base}_${Date.now()}` | `org-roles.ts:139-143`, `:166-170` |
| Emoji input | `maxLength={4}` in UI, `z.string().max(8)` on the wire | `appearance.tsx:59`, `actions.ts:239` |
| Role name Zod | `z.string().min(1).max(60)` (camp), `.min(1).max(80)` (org) | `settings/roles/actions.ts:27`, `org-roles.ts:360` |
| Org description Zod | `z.string().max(280).nullish()` | `org-roles.ts:361` |
| `setAccountOrgRoles` roleIds | `z.array(z.string().uuid()).max(ORG_ROLE_CAP)` = max 60 | `org-roles.ts:586` |
| Department role sort | `100 + i` | `org-roles.ts:401` |
| Custom org role sort | `500 + existing.length` | `org-roles.ts:420` |
| Officer role start sort | `startSort = 100` | `project-roles.ts:184` |

### 6.2 Name normalisation and conflicts

Both systems use the **same** normaliser, `normalizeName` (`name-dedupe.ts:14-20`): NFKD → strip combining marks → lowercase → `replace(/[^a-z0-9]+/g, "")`. So `"Team Lead"`, `"team-lead"` and `"teamlead"` all collapse to `"teamlead"` and collide.

- `cleanRoleName` / `cleanOrgName`: `name.trim().replace(/\s+/g, " ")`.
- `isValidRoleName`: cleaned length > 0 AND ≤ max AND **`normalizeRoleName(cleaned).length > 0`** — so a punctuation-only name like `"!!!"` is rejected even though it is non-empty.
- `roleNameConflicts(existing, candidate, exceptNormalized?)`: the `exceptNormalized` escape hatch lets a rename to a pure case/punctuation variant of its own name pass without self-conflicting.
- Camp uniqueness is `unique(group_id, name_normalized)`; **org uniqueness is global** (`unique(name_normalized)` across the whole org). That is why `createDepartment` pre-checks for a role name clash and errors with *"A role called \"{name}\" already exists — rename it first, so this department's own lead and member roles can take that name."* (`org-roles.ts:124-128`).

### 6.3 Escalation guards — three, and one of them was a real hole

**Guard 1 — quick-assign.** `setMemberRoles(…, { allowElevated })` (`roles-store.ts:432-446`). An `assign_roles`-only caller may NOT hand out (or self-assign) any role where `roleGrantsElevatedPrivileges(kind, permissions)` — i.e. `kind === "captain"` OR `permissions.manage_roles === true` OR `permissions.manage_members === true`. Error: *"Only a role manager can assign roles that manage roles or members."* `allowElevated` is computed at the action layer as `hasProjectPermission(membership, "manage_roles")` (`actions.ts:220-222`).

**Guard 2 — officer assignment.** The SAME guard was **missing** on `assignOfficer` and was added; the code comment (`roles-store.ts:509-520`) documents the exact exploit chain:
> Officer roles seed with no permissions, but they are ordinary `project_roles` rows and the officer accordion renders the PrivilegeEditor beside them … so a camp CAN give Safety Baron `manage_roles`. And an officer assignment is **self-acceptable**: the person named is the person who accepts it, and acceptance is what makes the role count in `getMemberPermissions`. So a member holding only `assign_roles` could name THEMSELVES to that officer role, click Accept on their own consent banner, and walk out holding the very authority the quick-assign path refuses to hand them.

**Guard 3 — captain lock.** `enforceKindPermissions(kind, permissions)` (`project-permissions.ts:126-132`) forces a `captain`-kind row to `allProjectPermissions()` **on every write**, whatever the client sent. `setRolePermissions` calls it unconditionally (`roles-store.ts:350`).

### 6.4 Cross-camp write guard

`unassignOfficer` took `groupId` and **never used it** — deleting on `(membershipId, roleId)` alone, both of which arrive from the client. The comment (`roles-store.ts:607-619`) states the consequence: a lead of camp A could post camp B's ids, clear the permission gate on their own camp, and strip an officer from a camp they have nothing to do with — *"in the officer model that decides who AfrikaBurn may contact about safety."* Fixed by looking the role up per-group and requiring the membership to belong to the same group.

### 6.5 Officer consent state machine

- Assign → `consent_status = 'pending'`, `accepted_at = null`, `org_visible = false`, `consent_edition_id = null`. Re-assigning **resets** all four via `onConflictDoUpdate` (`roles-store.ts:545-569`).
- Accept → `consent_status='accepted'`, `accepted_at = new Date()`, `org_visible = true`, `consent_edition_id = editionId` — and the update uses `.returning()` so a **zero-row update returns `{ ok:false, error: "That officer role isn't waiting on you any more." }`** rather than a false success (`:804-829`). The comment explains why: the banner turned an unconditional `{ok:true}` into *"Thanks — you're registered."* while the camp's slot still read "not yet assigned" and AfrikaBurn had no contact for the post. *"For a Safety Baron that is the kind of belief that only gets tested on site."*
- Decline → delete the row, **idempotent on purpose** (the row may already be gone; "leave the slot unassigned" is what a no-op delete achieves) (`:780-794`).
- `respondToOfficer` carries **no permission gate by design** but validates that `roleId` is an `officer`-kind role **of this camp** before touching anything (`:752-778`). Without that check, `accept:false` deleted ANY role the member held (a silent way to leave a role-scoped questionnaire audience), and `accept:true` stamped `org_visible` on a row that was never a consent moment.

### 6.6 Officer requirement matrix

`officerRequirements` (`officers.ts:106-117`), verbatim outcomes:
| Officer | Requirement |
|---|---|
| `lnt_officer` | **always required** |
| `safety_officer` | always recommended |
| `fire_safety_officer` | **always required** for registered camps |
| `sound_officer` | **required when `soundLevel >= 2`**, else recommended |
| `safety_monitor` | always recommended |

`soundLevelFromValue` (`:86-93`): "no amplified sound" or empty → `0`; else the **first digit** in the label; else the value's index in `SOUND_SCALE_VALUES` if `> 0`; else `0`.

`outstandingOfficers` (`:146-169`): when `!isRegisteredOrInFlight` returns `{ outstanding: [], requiredCount: 0, assignedCount: 0, applies: false }`. A slot counts as assigned once **any** member is on it, pending acceptance included (`officerSlotFilled` = `pending || accepted`).

`getOfficerStatus` (`roles-store.ts:948-1032`) hardcodes `hasGenerators/hasOpenFlame/hasFuelStorage: false` because *"No dedicated generator/open-flame/fuel columns exist in the frozen registration schema"* (`:986-992`). `isRegisteredOrInFlight = isRegisteredStatus(status) || isInReviewStatus(status)` — **`draft` is excluded**, because a private status Set here once disagreed with the org console's `OFFICER_IN_FLIGHT` list and the same camp was simultaneously told it had outstanding officers and counted as not-applicable (`:966-979`).

### 6.7 Org resolver fail-closed rules

Every one is tested (§7):
- `orgCan(null|undefined, …)` → `false` for every capability.
- Only a **literal `true`** grants: `role.permissions?.[capability] === true` (`org-permissions.ts:443-445`). A truthy string, a `1` or `null` are all refusals.
- `SYSTEM_MANAGER_ONLY_SET` is checked **before** the role loop, so an ungrantable capability is refused however a hand-written row was crafted.
- `isRankCarveOut` is checked before the role loop too — an engineer never resolves `personal_information` or `delete`, whatever role they hold. **This is a ceiling on the rank, not a default on a row.**
- `orgCanInDomain(actor, cap, null)` resolves to "no department", so only an **org-wide** role passes — the fail-closed direction for a guard that forgot to say where it was.
- `buildDomainOwnership` **drops** any domain key this build does not know and keeps the **first** owner if handed two rows.
- `sanitizeOrgPermissions` runs on the way **in** (session load, `session.ts:264`) as well as on the way **out** (write path).

### 6.8 God bootstrap

`canBootstrapGod(email, emailVerified, godEmails)` (`god-emails.ts:34-41`) requires **both** listed and `emailVerified`. The doc comment names the exploit: *"any flow that lets a user assert an unverified email (self-service sign-up, an unverified email-change, or an OIDC provider asserting an attacker-controlled `email` claim) matching a not-yet-registered god address would silently elevate an attacker to the highest privilege in the system."*

The bootstrap in `resolveOrgSession` (`session.ts:189-215`) only writes when `existingGod?.role !== "god"`, and writes an `account.elevate` audit row with `meta: { email, role: "god", via: "god_emails" }`.

A signed-in user who **is** listed but unverified gets `{ kind: "forbidden", godEmailUnverified: true }` (`:281-286`) so the dead end is legible rather than a silent refusal.

### 6.9 Sole-System-manager guard

`setOrgStaffRole` (`accounts.ts:97-104`): a `god` membership is **untouchable from the accounts panel in either direction**, so the last System manager can be neither removed nor demoted — by anyone, including themselves. Additionally `if (input.userId === session.dbUserId) throw new Error("You cannot change your own access.")` (`:67-69`). `GrantableRank = z.enum(["engineer","org_staff"])` — `god` is not mintable (`:35`). `setAccountOrgRoles` refuses a god target with *"System manager accounts already hold everything — roles would change nothing."* (`:622-626`).

### 6.10 Bootstrap / deploy invariants

`ensureDefaultRoles` (`roles-store.ts:102-146`) is `cache()`d and does **one** multi-row insert. The comment records a measured cost: the camp dashboard reaches `listRoles` three times per render concurrently, so an unseeded camp issued **8 inserts × 3 = 24 sequential round trips plus 3 existence probes**; a single camp-member e2e spec issued **72 `insert into project_roles` statements**; at 152 ms/statement through the dev SQL proxy that was material. `cache()` + one multi-row insert took **27 statements down to 2** (`:77-100`).

`ensureSeededOrgRoles` / `ensureSeededOrgDepartments` (`packages/db/src/seed.ts:136,155`) are called by the **deploy migrator** on already-seeded databases (`migrate.ts:239-250`), insert-if-missing on the stable key, **never update** — so a System manager's edits survive. The domain filing is gated on `if (row)` (department was just created) because otherwise *"every deploy re-filed `registrations` and `camp_categories` under Theme camps … handing every holder of those departments' LEAD roles `personal_information` over those domains again — silently, with no audit row, on a schedule nobody associated with a deploy"* (`seed.ts:181-204`).

---

## 7. Test coverage

**`packages/core/src/__tests__/org-permissions.test.ts` (1096 lines)** — the densest permission test in either repo. Structure:
- `"the console door"` — `ORG_APP_ROLES` exactness; `orgRankFromRole` refuses project roles; `god` stays the stored value; *"OPENS THE DOOR AND NOTHING ELSE — a rank with no roles can do nothing"*.
- `"THE RESOLUTION MATRIX, longhand"` (`:159-233`) — a hand-written `Record<actor, Record<OrgCapability, boolean>>` for five actors (`god`, `seeded_org_staff`, `seeded_engineer`, `widened_engineer`, `no_roles`) generating **25 individual `it()` cases**. Written out rather than derived, explicitly *"because this table is what a reviewer reads when they ask 'what can this person actually do?'"*.
- `"proves there is NO LADDER"` (`:296-311`) — asserts `engineerOnly === []` and `staffOnly === ["delete","personal_information"]`.
- `"THE ENGINEER TIER: broader in reach, narrower in depth, not a superset"` (`:313`) — asserts `ENGINEER_RANK_CARVE_OUTS` sorted equals `["delete","personal_information"]`, then gives an engineer and an org_staff **identical roles granting everything** and proves the engineer resolves two fewer.
- `"fails closed for junk in a permissions object"` (`:271`) — `{ read:"yes", write:1, delete:null }` grants nothing.
- `"the System manager anchor"` — three LOCKOUT SCENARIO cases: a god with zero roles holds everything; a god holding an empty role holds everything; administering rights is not a capability at all.
- `"department scoping"` (`:456-632`) — including *"RYAN'S RULE: a suppliers lead reads supply-related details"* and its mirror *"…AND NOT a theme camp's members' details"*; a domain nobody owns; a lead of a department that owns nothing; a guard that names no domain; scope union across two departments; resolution **by department id** so ownership can be re-assigned.
- `"personal information"` (`:634-777`) — including *"CANNOT be granted to an ENGINEER-RANKED account, and that is deliberate"* and *"LOCKOUT SCENARIO: the console DOOR alone never grants medical notes"* (the medical predicate and the console matrix answering together, per domain).
- `"refusals"` (`:799-887`) — six cases, including *"never say 'god' out loud"* and *"refuse a missing actor without leaking which capability was asked for"*.
- `"the resolved summary"` (`:889-1037`) — 12 cases on `summarizeOrgActor`, ending with *"never reports a capability the resolver would refuse"*.
- `"consequence copy"` (`:1039-1096`) — asserts every capability has a label, a consequence and a description; that consequences complete *"This account can …"* lowercase with no full stop; that the copy *"speaks in consequences, never in permission keys"*; and that `delete`'s copy names what it destroys **without naming one department's things**.

**`cross-side-identity.test.ts` (272 lines)** — the file that proves the two systems never touch. Three describes: *"the org ladder does not reach across to a camp"*, *"the camp ladder does not reach across to the console"*, and **"ALL THREE HATS AT ONCE — camp lead + officer + system engineer"** (`:155-241`) with five cases: reads their OWN camp's members' medical notes as a CAMP LEAD not as org; is REFUSED another camp's members, engineer rank notwithstanding; their console access is the engineer's, unchanged by the camp hats; their OFFICER consent shares a phone with the ORG, not a console right; an ORG_STAFF-ranked camp lead reads their department's domain AND their own camp.

**`apps/org/lib/__tests__/org-role-lockout.test.ts` (490 lines)** — four named LOCKOUT SCENARIOs plus source-grep regressions:
1. the god bootstrap still works (bootstrap writes `god` before any role exists; a god resolves everything with no roles; no role row can take a god's rights away).
2. the sole System manager cannot be removed or demoted (accounts panel refuses to touch a god membership; `god` is not in the grantable set; the delete path can never match a god row; nobody can change their own access).
3. only a System manager manages departments/roles/assignments — a table-driven case asserting **each** of the seven actions calls `requireSystemManager`.
4. fail closed — no roles means nothing but the door; *"every page is gated on `read`, in ONE place a new page cannot forget"*; *"the session re-sanitizes stored permissions on the way in"*; scoped delete never leaks out of its department; scoped PII stays in its department.
Plus *"every role mutation is audited"* and *"every role mutation is one transaction, so no audit row outlives its write"*.

**`apps/org/lib/__tests__/org-rank-enforcement.test.ts` (702 lines)** — query-level regressions. The load-bearing one: *"NO query decides personal information without naming a domain"* (`:167`), plus a table-driven `${name} resolves the predicate for \`${domain}\` before it selects` and `${name} selects no personal column for a refused caller`. Also *"searchAccounts does not MATCH on email either — no lookup oracle"* (`:190`).

**Camp-side tests.** `project-permissions.test.ts` (195) covers the backstop, grants-on-top, `manage_roles ⇒ assign_roles`, the four `canManageQuestionnaireAudience` scope cases, the captain lock and the four `roleGrantsElevatedPrivileges` cases. `project-roles.test.ts` (202) covers the 20-cap, the three seeded roles in order, normalisation, conflicts, `dedupeRoleNames`, officer materialisation, `teamLeadScopePatch` and the kind guards. `officers.test.ts` (179) covers the 5-entry catalog with fixed identities, the sound-level parser, the trigger matrix (including the `>= 2` boundary), free-camp non-applicability, and the three consent predicates. `god-emails.test.ts` (71) includes an explicit *"regression: verified-email gate"* describe with the unverified-elevation exploit as a named case.

**E2E** — 9 specs, ~1,900 lines, across three personas:
- `camp-lead/roles.spec.ts`: create-with-colour/emoji/privileges persists; **`assign_roles` unlocks the roles surface for a member and revoking it locks it again**; Captain privileges are locked on and cannot be reduced; deleting every custom role leaves the lead's management authority intact.
- `camp-lead/officers.spec.ts` + 5 `officer/*` specs: assignment request and consent; decline frees the slot; **phone shared with org only after consent**; required counts; officer roles not aliasable.
- `god/*`: roles management (a new department arrives with two permanent roles and deleting it says what goes with it; dismissing the confirm destroys nothing; the accounts screen answers "what can this person delete?" without leaving it; an org staff account is refused the roles surface); department-domain scoping (338 lines); privilege escalation refused; sole-god cannot self-delete; verified-email bootstrap guard.

---

## 8. Dependency footprint

**`@quagga/core` role modules import nothing but `@quagga/types` and each other.** Zero DB, zero React, zero `process.env` — the package rule (`docs/architecture.md:85-88`) is that core never imports `@quagga/db`. Internal edges:
- `org-roles.ts` → `name-dedupe` (`normalizeName`)
- `org-permissions.ts` → `org-domains` + `@quagga/types`
- `project-roles.ts` → `name-dedupe`, `project-permissions` (`allProjectPermissions`), `officers` (`OFFICER_CATALOG`)
- `project-permissions.ts` → `@quagga/types` only
- `officers.ts` → `sound` (`SOUND_SCALE_VALUES`, `isNoAmplifiedSound`) — **the one AfrikaBurn-domain coupling in the camp-side logic**
- `medical-access.ts` → `@quagga/types` only (but see §9)

**UI dependencies.**
- `role-badge.tsx` imports only `RoleColor` from `@quagga/types` and the local `cn`. It renders colours as **inline `style` with hex + alpha suffixes** (`${hex}22` background, `${hex}99` border) rather than Tailwind classes, explicitly so *"a role chip stays legible in BOTH light and dark without per-theme classes"* (`:5-7`). **This makes it theme-agnostic and therefore drop-in for Camp 404's dark-only palette** — the only work is replacing the 8 hex values.
- `apps/web/components/roles/*` imports: `@quagga/ui/components/{accordion, button, input, select, switch, toast, role-badge}` + `lucide-react`. **`accordion` is donor-only** and needs `@radix-ui/react-accordion ^1.2.18` plus the `--animate-accordion-down/-up` tokens Camp 404 lacks. **`switch` here uses the default variant** (`checked`/`onCheckedChange`/`disabled`/`aria-label`) which is API-compatible with Camp 404's Radix switch.
- `apps/org/components/org-roles/*` additionally needs `@quagga/ui/components/{badge, card, checkbox, dialog, field, textarea}`. **`checkbox` is the collision**: the donor's is a native `<input type="checkbox">` and `RoleEditor:1231` uses `onChange={(e) => … e.target.checked}`, which Camp 404's Radix checkbox (`onCheckedChange`) will not accept. **`field` is donor-only** and near-drop-in.

**Store/action dependencies.** `roles-store.ts` needs `drizzle-orm` (`and, asc, eq, inArray`), a `withTransaction` helper (Camp 404's `createPooledDb` provides one; the http driver does **not** support transactions — `camp-404/AGENTS.md:70-75`), and `insertNotifications`. It also imports `isInReviewStatus`/`isRegisteredStatus` (registration domain — droppable) and `officerAcceptedNotification`/`officerAssignmentRequestNotification` (notification templates — Camp 404 has an equivalent via `packages/db/src/broadcasts.ts`).

**Nothing in this unit imports `better-auth`.** `god-emails.ts` and `auth-capabilities.ts` are the two auth-adjacent files and both are pure data/string logic. `auth-capabilities.ts` describes Better Auth 1.6.25 method names in `reason` strings, but those are documentation, not calls.

---

## 9. AfrikaBurn / multi-tenant coupling — what must be collapsed

### 9.1 Coupling that is fatal to a lift (rewrite)

| Asset | Coupling |
|---|---|
| The entire org tier — `org_departments`, `org_department_domains`, `org_roles`, `org_role_assignments`, `orgCan`/`orgCanIn`/`orgCanInDomain`, `OrgActor`, `ENGINEER_RANK_CARVE_OUTS`, `summarizeOrgActor`, `ORG_DOMAINS`, `SEEDED_ORG_DEPARTMENTS`, `apps/org/**` | Exists **only** because reviewers are a different organisation from the reviewed. Camp 404 has one camp, one `camp_settings` singleton row, and no reviewer/reviewed split. There is nothing to scope a department to. |
| `membershipRoleEnum` | Carries three org ranks (`god`, `org_staff`, `engineer`) alongside two project ranks (`lead`, `admin`) and `member`, on one column of a `memberships` table keyed by `group_id`. Camp 404's `rankEnum` is `["captain","member"]` on `users`. |
| `apps/org/lib/session.ts` | `resolveOrgSession` is 155 lines of "find the one seeded `org` group, ensure a `users` join row, apply the GOD_EMAILS bootstrap, read the membership, load its org roles, load the domain ownership map". Only the last third has an analogue in Camp 404. |

### 9.2 Coupling that is a mechanical rename (light-adapt)

| Asset | Coupling | Collapse |
|---|---|---|
| `project_roles.group_id` | Every camp-side role row is keyed on the group | Drop the column entirely, or pin it to the `camp_settings` singleton. All 12 `groupId` parameters in `roles-store.ts` disappear. |
| `memberships` as the assignment anchor | `member_role_assignments.membership_id` | Re-key to `users.id`. Camp 404's `team_memberships` is the nearest existing analogue but is a different concept (team, not role). |
| `MembershipRole` in `PermissionMembership.structuralRole` | The backstop set is `PROJECT_ADMIN_ROLES = ["lead","admin"]` | Becomes `["captain"]` against Camp 404's `rankEnum`. One-line change; the whole backstop concept transfers intact. |
| `member_role_assignments.consent_edition_id` | `editions` is the donor's root namespace | Camp 404 has no edition dimension. Either drop the column (accepting perpetual consent) or replace it with a `camp_settings`-derived burn year. **Do not silently drop it** — the 0023 comment is the argument for keeping *some* expiry. |
| `officers.ts` → `sound.ts` | `soundLevelFromValue` parses AfrikaBurn's `s5_amplified_music` registration field | The catalog, the consent flow and `outstandingOfficers` are all reusable; only `officerRequirements`' *trigger inputs* are AfrikaBurn-specific. Camp 404's equivalent triggers would come from `camp_settings.config` or team membership. |
| `OFFICER_CATALOG` names/emoji | LNT Lead, Safety Baron, Sound Officer are AfrikaBurn vocabulary | The *mechanism* (an org-defined, non-aliasable, consent-gated role class) is what transfers. For a single camp, "org" collapses to "the camp", so the whole consent-to-share-with-the-org premise may not survive — but a captain-defined, member-accepted responsibility role is a real Camp 404 want. |

### 9.3 The one asset that is coupled in a non-obvious way

`packages/core/src/medical-access.ts` reads `MedicalAccessContext.actorOrgPersonalInformation` (`:93`), documented at `:73-84` as *"the ORG CONSOLE'S RESOLVED `read_personal_information` for this actor IN THE `registrations` DOMAIN"*. **The medical predicate cannot be lifted without cutting that dependency.** Once cut, what remains is genuinely useful to Camp 404 and maps onto WP5 (#129, emergency contacts): the pure rule is *"self, OR a structural lead/admin of a camp the subject is a member of (the id sets must intersect)"* (`:114-122`), plus `medicalAccessBasis` returning `"self" | "org_staff" | "camp_lead"` for the audit row, plus `MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view"`. For a single camp the intersect check degenerates to "is the viewer a captain", which is trivially Camp 404's `hasClearance`.

### 9.4 Coupling the donor got RIGHT and Camp 404 should copy verbatim

- **`custom` is the only deletable kind, on both sides.** `canDeleteRoleKind`/`canDeleteOrgRoleKind` are one-liners that are the *entire* permanence policy, enforced server-side and explained in the UI where the missing button would be.
- **"Permanent" is about existence, never about rights.** `canEditOrgRolePermissions` returns `true` for both kinds and is *written as a function anyway* so a future locked kind has one place to land (`org-roles.ts:196-204`) — mirroring `isPermissionsLockedKind` on the camp side.
- **Officers are not renameable** (`canRenameRoleKind(kind) → kind !== "officer"`) but ARE re-rightable, and the UI says so in one sentence.
- **The baseline role is derived, never stored.** `isBaselineKind`; `getMemberPermissions` pushes `baseline.permissions` unconditionally (`roles-store.ts:901-902`); `memberCount` for baseline is `members.length` (`settings/roles/page.tsx:120-122`); it is excluded from `setMemberRoles`' assignable set. "Everyone in this camp" and "the baseline role" are **one concept, not two**.

---

## 10. Verbatim excerpts — the five most valuable pieces

### 10.1 The camp-side resolver, in full (`packages/core/src/project-permissions.ts:20-97`)

This is ~80 lines and is the single highest-value artefact in the unit for Camp 404.

```ts
const ADMIN_BACKSTOP = new Set<MembershipRole>(PROJECT_ADMIN_ROLES);

/** True when a structural role implicitly holds every project permission. */
export function isPermissionBackstop(role: MembershipRole): boolean {
  return ADMIN_BACKSTOP.has(role);
}

export interface PermissionMembership {
  structuralRole: MembershipRole;
  rolePermissions: readonly ProjectPermissions[];
}

/**
 * Does the member hold a given project permission? lead/admin → always true
 * (irrevocable backstop). Otherwise the grant must appear on one of their roles.
 * `manage_roles` implies `assign_roles`.
 */
export function hasProjectPermission(
  m: PermissionMembership,
  key: ProjectPermissionKey,
): boolean {
  if (isPermissionBackstop(m.structuralRole)) return true;
  for (const p of m.rolePermissions) {
    if (key === "manage_questionnaires") {
      if (p.manage_questionnaires) return true;
      continue;
    }
    if (key === "assign_roles" && p.manage_roles === true) return true;
    if (p[key] === true) return true;
  }
  return false;
}

/**
 * May the member author/send a project questionnaire to a given audience? This
 * is the SERVER-SIDE enforcement of the `manage_questionnaires` scope config
 * (audience_roles + may_block) — the missing check the earlier review flagged.
 * ...
 * `everyone` (baseline) audiences are represented by passing the baseline role
 * id in `targetRoleIds` — targeting the whole camp is targeting the baseline.
 */
export function canManageQuestionnaireAudience(
  m: PermissionMembership,
  req: { targetRoleIds: readonly string[]; blocking: boolean },
): boolean {
  if (isPermissionBackstop(m.structuralRole)) return true;

  let granted = false;
  let allowAll = false;
  let mayBlock = false;
  const allowed = new Set<string>();
  for (const p of m.rolePermissions) {
    const scope: ManageQuestionnairesScope | undefined = p.manage_questionnaires;
    if (!scope) continue;
    granted = true;
    if (scope.mayBlock) mayBlock = true;
    if (scope.audienceRoles === "all") allowAll = true;
    else for (const id of scope.audienceRoles) allowed.add(id);
  }
  if (!granted) return false;
  if (req.blocking && !mayBlock) return false;
  if (allowAll) return true;
  return req.targetRoleIds.every((id) => allowed.has(id));
}
```

The module header (`:1-9`) is the design statement:
> Custom-role permissions are GRANTS ON TOP for plain members; the structural `lead`/`admin` roles are the permission BACKSTOP — they implicitly hold every project permission and this can never be revoked, **so no permission edit can ever strand a camp (no self-lockout class of bugs, by construction).**

### 10.2 The escalation guard and its exploit narrative (`apps/web/lib/roles-store.ts:429-446` and `:499-530`)

```ts
  // Escalation guard: only manage_roles holders may hand out roles that grant
  // role-/member-management (or Captain). Prevents an assign_roles-only holder
  // from self-assigning Captain and acquiring every project permission.
  if (!opts?.allowElevated) {
    const grantsElevated = wanted.some((id) => {
      const role = assignable.get(id);
      return role
        ? roleGrantsElevatedPrivileges(role.kind, role.permissions)
        : false;
    });
    if (grantsElevated) {
      return {
        ok: false,
        error:
          "Only a role manager can assign roles that manage roles or members.",
      };
    }
  }
```

and the officer-path version, whose comment is the clearest security narrative in the repo:

```ts
  // THE SAME ESCALATION GUARD `setMemberRoles` APPLIES — this path never had it.
  //
  // Officer roles seed with no permissions, but they are ordinary `project_roles`
  // rows and the officer accordion renders the PrivilegeEditor beside them ("you
  // can still choose what this officer may do inside your camp",
  // components/roles/officer-row.tsx), so a camp CAN give Safety Baron
  // manage_roles. And an officer assignment is self-acceptable: the person named
  // is the person who accepts it, and acceptance is what makes the role count in
  // `getMemberPermissions`. So a member holding only `assign_roles` could name
  // THEMSELVES to that officer role, click Accept on their own consent banner,
  // and walk out holding the very authority the quick-assign path refuses to
  // hand them — the guard was one function away, on a route nobody had joined up.
  if (
    !opts?.allowElevated &&
    roleGrantsElevatedPrivileges(role.kind, role.permissions)
  ) {
    return {
      ok: false,
      error:
        "Only a role manager can assign roles that manage roles or members.",
    };
  }
```

### 10.3 The org resolver's three questions (`packages/core/src/org-permissions.ts:456-532`)

```ts
export function orgCan(
  actor: OrgActor | null | undefined,
  capability: OrgCapability,
): boolean {
  if (!actor) return false;
  if (isSystemManager(actor)) return true;
  // Not grantable to any role, at any time, however the row was written.
  if (SYSTEM_MANAGER_ONLY_SET.has(capability)) return false;
  // The engineer ceiling: universal reach, and never these two. See
  // ENGINEER_RANK_CARVE_OUTS — this is not an inverted comparison.
  if (isRankCarveOut(actor, capability)) return false;
  return actor.roles.some((role) => roleGrants(role, capability));
}

export function orgCanIn(
  actor: OrgActor | null | undefined,
  capability: OrgCapability,
  departmentId: string | null,
): boolean {
  if (!actor) return false;
  if (isSystemManager(actor)) return true;
  if (SYSTEM_MANAGER_ONLY_SET.has(capability)) return false;
  if (isRankCarveOut(actor, capability)) return false;
  const everywhere = reachesEveryDepartment(actor, capability);
  return actor.roles.some(
    (role) =>
      roleGrants(role, capability) &&
      (role.departmentId === null ||
        everywhere ||
        (departmentId !== null && role.departmentId === departmentId)),
  );
}

export function orgCanInDomain(
  actor: OrgActor | null | undefined,
  capability: OrgCapability,
  domain: OrgDomain | null,
): boolean {
  if (!actor) return false;
  return orgCanIn(actor, capability, departmentForDomain(actor.domains, domain));
}
```

The header's framing (`:84-94`) is the reusable idea, independent of departments:
> Three questions, three functions, and using the wrong one is the whole hazard:
> · `orgCan` — "may they, ANYWHERE?" → nav entries, affordances.
> · `orgCanIn` — "may they, for a thing in THIS department?" (by id).
> · `orgCanInDomain` — "may they, for a thing in THIS domain?" → what guards and queries actually ask, **because a call site knows which screen it is on and knows no department id.**

### 10.4 `summarizeOrgActor` — the one function behind every preview (`org-permissions.ts:809-827`)

```ts
export function summarizeOrgActor(
  actor: OrgActor | null | undefined,
): OrgCapabilityGrant[] {
  if (!actor) return [];
  return ORG_CAPABILITIES.filter((c) => orgCan(actor, c)).map((capability) => {
    const scoped =
      isDepartmentScopedCapability(capability) &&
      isDepartmentScopedGrant(actor, capability);
    if (!scoped) {
      return { capability, departmentIds: null, domains: null };
    }
    const departmentIds = departmentsGranting(actor, capability);
    const domains = new Set<OrgDomain>();
    for (const id of departmentIds) {
      for (const d of domainsOwnedBy(actor.domains, id)) domains.add(d);
    }
    return { capability, departmentIds, domains: [...domains] };
  });
}
```

Its contract (`:780-807`): it is *"deliberately PURE and free of DB or React: the summary a System manager reads before saving and the summary the table shows afterwards are produced by the same code as the refusal itself (`orgCan`/`orgCanIn` are its only sources of truth), so **the console cannot describe an access it would not grant**."* Three surfaces call it — the accounts table, the assignment dialog's live preview, and the role editor's draft preview — through one renderer, `CapabilitySummary`.

And the tell in `OrgCapabilityGrant.domains` (`:766-776`): an **empty array** is the case the field exists for — *"a role scoped to a department that owns nothing looks like a grant and is not one. Reporting 'can delete, in Safety only' without saying Safety owns nothing would be a summary that overstates access to the exact person deciding whether the access is acceptable."*

### 10.5 The deletion-impact arithmetic (`apps/org/lib/org-role-impact.ts:32-76`)

```ts
/** What happens to people when a role or a whole department is deleted. */
export interface DeletionImpact {
  /** Distinct accounts holding at least one of the roles being removed. */
  people: number;
  /**
   * Of those, how many hold NO other org role afterwards — the ones who would
   * be left able to sign in and do nothing. The number that decides whether the
   * dialog is a formality or a warning.
   */
  leftWithNothing: number;
  /** Who they are, in stable order, so the dialog can name them. */
  labels: string[];
}

function impactOf(
  rows: readonly AssignmentRow[],
  doomed: (row: AssignmentRow) => boolean,
): DeletionImpact {
  const rolesByUser = new Map<string, { label: string; kept: number; lost: number }>();
  for (const row of rows) {
    const entry = rolesByUser.get(row.userId) ?? { label: row.label, kept: 0, lost: 0 };
    if (doomed(row)) entry.lost += 1;
    else entry.kept += 1;
    rolesByUser.set(row.userId, entry);
  }

  const affected = [...rolesByUser.values()].filter((e) => e.lost > 0);
  return {
    people: affected.length,
    leftWithNothing: affected.filter((e) => e.kept === 0).length,
    labels: affected.map((e) => e.label).sort((a, b) => a.localeCompare(b)),
  };
}
```

Module header (`:1-20`): *"Deleting a department cascades its roles away … Both are one click, both are irreversible, and both can leave a colleague signed in to a console that does nothing — so the dialog has to say so BEFORE the click, naming the people, not after it in a toast."* And the privacy note: `label` is an email when the caller may read one and a username otherwise; the module never chooses, because `getOrgRoleImpacts` **throws** unless `isSystemManager(actor)` (`queries.ts:710-712`) and the whole read simply does not happen for anyone else — *an absence, not a mask*.

---

## 11. Gotchas and traps for a porting agent

1. **The old 7-key org vocabulary is dead.** Migration 0022 rewrote every row. If any prior briefing says `read_personal_information` / `manage_camp_categories` / `manage_accounts` / `read_system`, it is describing pre-28-Jul-2026 code. The live keys are `create · read · update · delete · personal_information`.
2. **`DEPARTMENT_SCOPED_CAPABILITIES`'s doc comment says the exact opposite of the code below it.** The 20-line comment at `org-permissions.ts:239-262` says *"TWO, and they are the two that hurt"* and names `delete` and `read_personal_information`; the code at `:263-264` is `= ORG_CAPABILITIES` — **all five**. This is the donor's own named "comments that lie" finding (`docs/simplification-audit.md:764`). Do not trust it.
3. **`SYSTEM_MANAGER_ONLY_CAPABILITIES` is an empty array** kept deliberately as an enforcement point (`:216-230`), and `GRANTABLE_ORG_CAPABILITIES` therefore equals `ORG_CAPABILITIES`. Code reading either as non-trivial is reading history.
4. **`god` is stored as `god` and displayed as "System manager", forever.** `packages/types/src/roles.ts:29-36` is a written prohibition on "fixing" it. Any port that carries the anchor concept must decide up front whether to keep the split.
5. **`orgCan` vs `orgCanInDomain` is a live security distinction, not a convenience.** `canReadPersonalInformationAnywhere` is affordance-only and a regression test refuses it in any server read model (`org-rank-enforcement.test.ts:167`). Copying the wrong one is how a scoped grant becomes global.
6. **`respondToOfficerAction` has no permission gate.** That is correct (self-consent) and is also why its role-kind + camp validation is load-bearing. Do not "tidy" a gate onto it, and do not remove the validation.
7. **`assignOfficer`'s `allowElevated` defaults to REFUSING**, and `assignOfficerAction` never passes it — so the officer path is strictly stricter than quick-assign. That asymmetry is intentional.
8. **`unassignOfficer` and `respondToOfficer` both scope by group after a history of not doing so.** Any Camp 404 port that drops the group dimension must not also drop the *"the id you were given must belong to the thing you were authorised for"* check — the shape survives even when the tenant does not.
9. **`ensureDefaultRoles` is a WRITE on a READ path.** `listRoles` calls it first. It is `cache()`d per request precisely because three concurrent callers would otherwise triple-seed. Camp 404 has no `cache()`-wrapped write-on-read precedent except `ensureCampUser`-style helpers; replicate the dedup or you replicate the 27-statement page load.
10. **The donor's `Checkbox` is a native input.** `RoleEditor:1231` uses `onChange={(e) => … e.target.checked}`. Camp 404's is Radix (`onCheckedChange`). Every org-side checkbox call site breaks verbatim. The camp-side `Switch` uses the default variant and is compatible.
11. **`Accordion` is donor-only.** The whole camp Roles & Officers screen is built on it. Porting needs `@radix-ui/react-accordion ^1.2.18` plus `--animate-accordion-down` / `--animate-accordion-up` tokens and their `@keyframes`, which Camp 404's `globals.css` does not define — without them `data-[state=open]:animate-accordion-down` silently compiles to nothing.
12. **`role-badge.tsx` uses inline hex with alpha suffixes, not Tailwind tokens.** That is a feature (theme-agnostic) but it means the 8 brand hexes are hardcoded in `packages/ui` and must be re-chosen for Camp 404's OKLCH magenta/violet palette. `apps/web/components/roles/appearance.tsx:12-14` states the rule: role colours are **DATA colours**, never theme tokens, never freeform hex.
13. **`teamLeadScopePatch` runs only when `!haveAny`** (`roles-store.ts:133-145`). A camp that already had *some* roles when officers were topped up never gets the patch — Team lead keeps `audienceRoles: "all"`. Latent, worth checking on any port that changes the seeding order.
14. **`getMemberPermissions` counts only `consentStatus = 'accepted'` assignments** (`:895`). A pending officer role grants nothing. That is what makes the self-accept exploit in §6.3 an *accept*-time escalation rather than an *assign*-time one.
15. **`officerRequirements` hardcodes three trigger inputs to `false`** in `getOfficerStatus` because the registration schema is frozen. The pure function supports them; the caller does not supply them. Any port inherits three dead parameters.
16. **`org_roles.name_normalized` is globally unique, `project_roles.name_normalized` is per-group.** Copying the org table shape into a single-camp app is fine; copying the *camp* table shape and dropping `group_id` silently turns a per-group unique index into a global one, which is what you want — but the `createDepartment` name-clash pre-check exists precisely because global uniqueness produces confusing errors. Keep the friendly message.
17. **`.env.example` declares `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET`** (`:19-20`) which no donor code reads — they are Camp 404's own variable names left behind. `GOD_EMAILS` is the real variable this unit reads, via `apps/org/lib/god.ts:16` only.
18. **Camp 404 already has a `GOD_EMAILS` mechanism and has flagged it for deprecation** (`camp-404/docs/first-time-setup.md:86-87`). The donor's `canBootstrapGod` verified-email gate is a strict improvement over an un-gated list and should be ported *even if* the mechanism is on its way out.
19. **`apps/web/components/roles/types.ts` imports server-action *types* from route files** (`@/app/(app)/camps/[slug]/actions`, `:17-18`). That is a `typeof` import, so it is erased at build — but it makes the component directory non-relocatable without rewriting those two lines.
20. **Officer consent is edition-scoped since 0023, and `assignOfficer` clears `consentEditionId` on re-assignment.** Camp 404 has no edition. If the column is dropped, the "consent expires with the burn" property is silently lost — record that as a decision, not an omission.

---

## 12. Notable patterns worth stealing even if the code is not

- **One resolver, two readers.** The gate and the UI call the *same* function, so a hidden button and a refused action can never disagree. Stated at `org-permissions.ts:3-9` and enforced by `guardConsole` + `CapabilitySummary` sharing `orgCan`/`summarizeOrgActor`.
- **Consequence copy, not permission keys.** Three parallel `Record<Capability, string>` tables (label / consequence / description) and a test that asserts every key has all three, that consequences are lowercase and full-stop-free, and that the copy *"speaks in consequences, never in permission keys"*.
- **Refusals that name the fix.** `orgCapabilityRefusal` orders its branches so the *most specific true reason* wins, and `scopeReason` has three branches because *"being told a false reason is worse than being told none."*
- **Permanence explained where the missing control would be.** `permanenceReason(role, "short"|"full")` renders in the list AND in the footer slot the Delete button occupies.
- **Deletion states its cost before the click, naming people.** `DeletionImpact.leftWithNothing` is the number that turns a formality into a warning.
- **A grant that reaches nothing says so.** `domains: []` on a resolved grant, `departmentDomainsNote([])`, and `grantScopeClause`'s *"which owns no part of the console, so this reaches nothing"*.
- **An irrevocable structural backstop makes editable permissions safe.** Camp side: `lead`/`admin` always hold everything. Org side: `god` resolves everything with zero roles. Both are tested as named LOCKOUT SCENARIOs.
- **The right to edit rights is never itself a right.** `requireSystemManager` asks the anchor, never a capability — *"the surface that edits permissions must not be one anyone can grant."*
- **Sanitise on the way IN as well as OUT.** `sanitizeOrgPermissions` runs at session load, so a row written by anything other than the editor still cannot carry an ungrantable key.
- **Every mutation is one transaction with its audit row inside it** — `org-role-lockout.test.ts:478` asserts *"no audit row outlives its write."*
- **Report what actually happened.** `respondToOfficer` uses `.returning()` so a zero-row update is an error, not a cheerful toast.
- **The longhand matrix test.** A hand-written truth table generating one `it()` per (actor, capability) pair, kept *"because this table is what a reviewer reads."* 25 cases, zero derivation, maximum readability.
- **A pure impact/preview module separated from its query** so the rule is testable without a database.
- **Consent that cannot be withdrawn is not consent** — the accepted-state banner with a Withdraw button, added after the first version made acceptance a one-way door.

