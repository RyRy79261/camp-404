# Unit 08 — Audience / segmentation targeting model (DONOR harvest)

**Donor repo root:** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
All paths below are donor-relative unless prefixed `camp-404:`.
Every claim is cited `path:line`. Nothing was modified in either repo.

---

## 1. Purpose

The donor has ONE audience grammar and ONE resolver, shared by **two** consumers:
questionnaire activations and bulletins (broadcasts). The design is deliberately
split into three layers, each with an explicitly-stated authority:

| Layer | File | Authority |
| --- | --- | --- |
| **Validation** | `packages/types/src/audience.ts` | "This file is the VALIDATION authority for the audience shapes" (`packages/types/src/audience.ts:12-15`) |
| **Storage** | `packages/db/src/schema.ts` — `questionnaire_activations.audience` (`:1323`) + `bulletins.audience` (`:1758`) | "the storage authority is `questionnaire_activations.audience` (jsonb) + `authored_scope` / `group_id` columns" (`packages/types/src/audience.ts:13-15`) |
| **Resolution** | `packages/core/src/audience.ts` | Pure function over injected row sets; "No I/O, no env, no DB imports" (`packages/core/src/audience.ts:6-9`) |

The three-layer split plus the **injected-context purity contract** is the single
most valuable idea in this unit, and it ports to Camp 404 with the *grammar*
swapped and the *architecture* kept intact.

**Why Camp 404 needs it.** Camp 404 already ships `resolveAudience` in
`camp-404:packages/db/src/broadcasts.ts` — but it is a DB-coupled function over a
5-value `broadcast_scope` pgEnum `[everyone, team, team_leads, drivers, individual]`
(`camp-404:packages/db/src/schema.ts:164`), and the announcement composer hardcodes
`kind:'announcement'` + scope `everyone` (WP12 #136). The donor shows what the
grown-up version of that looks like: a discriminated-union spec stored as JSONB, a
pure resolver, a live "Resolves to ~N burners" preview that runs the *real* resolver
server-side, and an authz predicate that gates *who may target which audience*.

The donor also carries two things Camp 404's WP4/WP6 backlog is explicitly missing:
a **zero-audience warning surfaced before send** and a **role-scoped authoring
permission** (`manage_questionnaires: { audienceRoles, mayBlock }`) that prevents a
team-lead from blast-gating the whole camp.

---

## 2. File inventory (line counts verbatim from `wc -l`)

### Core subsystem (the thing itself)

| Path | Lines | Role |
| --- | --- | --- |
| `packages/types/src/audience.ts` | 191 | Zod grammar: selectors, labels, the `AudienceSpec` discriminated union, `authoredScopeForAudience`, `groupIdForAudience`, activation/builder input schemas |
| `packages/core/src/audience.ts` | 313 | `resolveAudience` + `AudienceContext` row-set interfaces. Pure, zero-I/O |
| `packages/ui/src/components/audience-select.tsx` | 81 | The dumb picker + the "Resolves to ~N …" sentence |
| `packages/core/src/questionnaire-authz.ts` | 143 | `canAuthorAudience` / `canActivateAudience` / `canViewActivationResults` / `canAuthorProjectQuestionnaire` |
| `packages/core/src/questionnaire-activation.ts` | 142 | `buildActivationRequiredActions`, `activationRequiredActionKey`, `tallyActivationCompletion` — audience → `required_actions` rows |
| `packages/core/src/questionnaire-engine.ts` | 52 | `isParticipantFacingActivation` — the org-internal leak guard |
| `packages/core/src/project-permissions.ts` | 150 | `canManageQuestionnaireAudience` — the per-role audience SCOPE enforcement |
| `packages/core/src/notifications.ts` | 412 | `resolveBulletinAudience` (thin wrapper), `buildBulletinNotifications`, `shouldSendImmediateEmail`, link-app resolution |
| `packages/types/src/notifications.ts` | 58 | `BulletinComposeInput` (carries `audience: AudienceSpec`), `NotificationKind`, `NotificationPayload` |

### Picker / composer UI (three separate option-list constructions — see §10 gotcha)

| Path | Lines | Role |
| --- | --- | --- |
| `apps/org/components/bulletins/audience-options.ts` | 94 | Bulletin picker: option-value ⇄ `AudienceSpec` mapping + `audienceCountNoun` |
| `apps/org/components/bulletins/audience-count.ts` | 102 | `"use server"` live-count action, gated on the `bulletins` domain |
| `apps/org/components/bulletins/bulletin-composer.tsx` | 316 | Composer with 300 ms-debounced live resolve + preview-as-recipient rail |
| `apps/org/components/questionnaire/activation-form.tsx` | 398 | The SEND screen: 3 mode cards + multi-select chips + `AudiencePreview` |
| `apps/org/components/questionnaires/builder-v2.tsx` | 1000+ (`:100-131`, `:200-227`, `:880-965`) | Builder's "Audience & send" rail — its own third option list |
| `apps/web/components/questionnaire/builder.tsx` | 584 | Camp-side project-audience picker (everyone / by-role toggle group), `:55-81`, `:128-171`, `:420-508` |
| `apps/web/components/roles/privileges.tsx` | 319 | The role-permission editor that EDITS `manage_questionnaires.audienceRoles` |

### Server call-sites (the I/O boundary)

| Path | Lines | Role |
| --- | --- | --- |
| `apps/org/lib/questionnaires/queries.ts` | 603 | `buildAudienceContext(editionId, orgGroupId)` at `:409-495`; `audienceLabel(spec)` at `:63-81` |
| `apps/org/lib/questionnaires/actions.ts` | 691 | `previewAudienceCount` (`:244`), `activateQuestionnaire` (`:284`) |
| `apps/org/lib/actions/bulletins.ts` | 386 | `saveBulletin` (`:113`), `fanOut` (`:265`), `publishBulletin` (`:291`), `audienceKey` (`:76`) |
| `apps/org/lib/bulletins.ts` | 126 | Read models with `audienceLabel` stamped in (`:50`) |
| `apps/web/lib/questionnaire-store.ts` | 784 | Camp-side send; `resolveProjectTargets` (`:183-240`) builds a *minimal* context |
| `apps/web/lib/required-actions.ts` | 167 | `listRequiredActions` — filters org-internal out of the participant gate (`:156`) |
| `apps/web/lib/bulletins.ts` | 93 | READ-side audience enforcement: you can only read a bulletin you have a notification row for |
| `apps/org/lib/notifications.ts` | 149 | `insertNotifications` — chunked fan-out sink (`:120-149`) |

### Tests

| Path | Lines | Coverage |
| --- | --- | --- |
| `packages/core/src/__tests__/audience.test.ts` | 435 | 21 cases across all 5 audience kinds + baseline derivation + officer consent |
| `packages/types/src/__tests__/audience.test.ts` | 172 | Union exhaustiveness, empty-selector refusal, label completeness, activation defaults |
| `packages/ui/src/components/__tests__/audience-select.test.tsx` | 95 | The zero-vs-null distinction, singular/plural, custom noun |
| `packages/core/src/__tests__/questionnaire-authz.test.ts` | 194 | 15 cases; scope-crossing denial |
| `packages/core/src/__tests__/notifications.test.ts` | (§ `:80-135`) | "same expansion questionnaires use"; org-internal isolation |
| `apps/org/lib/__tests__/bulletin-actions.test.ts` | — | Frozen title/audience at publish; reordered-selector equality; double-publish |
| `apps/org/lib/__tests__/questionnaire-actions.test.ts` | — | `previewAudienceCount` refusals; "writes nothing to required_actions when the audience resolves to nobody" (`:378`) |
| `e2e/specs/org-staff/bulletins-targeting.spec.ts` | 66 | camp_leads reaches a camp lead, provably not a plain burner |
| `e2e/specs/org-staff/bulletins-audience-reach.spec.ts` | 153 | art_leads vs camp_leads (group-KIND discrimination); org_suppliers cross-app hop |

### Migrations

- `packages/db/migrations/0004_questionnaire_audience_and_project_roles.sql` — creates
  `questionnaire_authored_scope` enum, `project_roles`, `member_role_assignments`, and
  adds `authored_scope` / `group_id` / `edition_id` / `audience` jsonb to
  `questionnaire_activations`, plus `registrations.grants_interest`.
- `packages/db/migrations/0009_left_blue_shield.sql:7` — `bulletins."audience" jsonb NOT NULL`.

---

## 3. The audience grammar (verbatim)

### 3.1 The union — 5 kinds

`packages/types/src/audience.ts:136-143`:

```ts
export const AudienceSpec = z.discriminatedUnion("kind", [
  OrgInternalAudience,
  OrgOutboundAudience,
  OrgOfficerAudience,
  OrgSuppliersAudience,
  ProjectAudience,
]);
export type AudienceSpec = z.infer<typeof AudienceSpec>;
```

| Kind | Shape | Line |
| --- | --- | --- |
| `org_internal` | `{ kind: "org_internal" }` | `:73-76` |
| `org_outbound` | `{ kind: "org_outbound", selectors: OrgOutboundSelector[] /* .min(1) */ }` | `:79-83` |
| `org_officer` | `{ kind: "org_officer", officerKeys: OfficerKey[] /* .min(1) */ }` | `:91-95` |
| `org_suppliers` | `{ kind: "org_suppliers" }` | `:117-120` |
| `project` | `{ kind: "project", groupId: string.min(1), mode: "everyone" \| "roles", roleIds: string[].default([]) }` | `:127-133` |

### 3.2 The 7 outbound selectors (verbatim, `packages/types/src/audience.ts:36-51`)

```ts
export const OrgOutboundSelector = z.enum([
  // every burner with a Burner Bio for the active edition
  "all_current_burners",
  // leads/admins of any theme_camp group
  "camp_leads",
  // leads/admins of camps with an approved registration this edition
  "registered_camp_leads",
  // leads/admins of mutant_vehicle groups
  "mv_leads",
  // MV groups whose current-edition registration has grants_interest = true
  "mv_grant_requesters",
  // leads/admins of artwork groups
  "art_leads",
  // artwork groups with grants_interest = true this edition
  "art_grant_requesters",
]);
```

`ORG_OUTBOUND_SELECTORS = OrgOutboundSelector.options` (`:55`) is the picker source.

### 3.3 Labels (`packages/types/src/audience.ts:58-67`)

```ts
export const ORG_OUTBOUND_SELECTOR_LABELS: Record<OrgOutboundSelector, string> = {
  all_current_burners: "All current burners",
  camp_leads: "Theme camp leads",
  registered_camp_leads: "Registered camp leads",
  mv_leads: "Mutant vehicle leads",
  mv_grant_requesters: "MV grant requesters",
  art_leads: "Artwork leads",
  art_grant_requesters: "Art grant requesters",
};
```

### 3.4 The 5 officer keys + their audience labels

`packages/types/src/roles.ts:315-324`:

```ts
export const OfficerKey = z.enum([
  "lnt_officer",
  "safety_officer",
  "fire_safety_officer",
  "sound_officer",
  "safety_monitor",
]);
export const OFFICER_KEYS = OfficerKey.options;
```

`packages/types/src/audience.ts:98-107`:

```ts
export const OFFICER_AUDIENCE_LABELS: Record<z.infer<typeof OfficerKey>, string> = {
  lnt_officer: "All registered LNT Leads",
  safety_officer: "All registered Safety Officers",
  fire_safety_officer: "All registered Safety Barons",
  sound_officer: "All registered Sound Officers",
  safety_monitor: "All registered Safety Monitors",
};
```

Note the label ≠ key drift: `fire_safety_officer` → "Safety Barons".

### 3.5 The scope derivation — the results-visibility boundary

`packages/types/src/audience.ts:146-155`:

```ts
/** The authored scope implied by an audience spec (org vs group). */
export function authoredScopeForAudience(
  spec: AudienceSpec,
): QuestionnaireAuthoredScope {
  return spec.kind === "project" ? "group" : "org";
}

/** The owning group id for a group-scoped audience, else null (org-scoped). */
export function groupIdForAudience(spec: AudienceSpec): string | null {
  return spec.kind === "project" ? spec.groupId : null;
}
```

`QuestionnaireAuthoredScope = z.enum(["org", "group"])` (`:25`), described as
"the hard boundary results visibility never crosses" (`:21`).

---

## 4. Capability list (exhaustive, each cited)

1. **Discriminated-union audience spec stored as JSONB**, validated by one Zod
   schema and shared verbatim by questionnaires and bulletins
   (`packages/db/src/schema.ts:1323` vs `:1758`; `packages/types/src/notifications.ts:50`).
2. **Pure `resolveAudience(spec, ctx) → string[]`** over injected row sets, returning
   sorted + de-duplicated user ids (`packages/core/src/audience.ts:279-313`, `finalize` at `:99-101`).
3. **Seven org outbound selectors** resolving over group kind, registration status and
   `grants_interest` (`packages/core/src/audience.ts:160-191`).
4. **Approved-registration gate** for `registered_camp_leads` and every officer audience
   (`registeredGroupIdsOfKind` `:130-142`; `registeredGroupIds` `:265-272` — both hard-filter
   `r.status !== "approved"`).
5. **Edition scoping is enforced defensively inside the resolver**, not only by the caller
   (`r.editionId !== ctx.editionId` at `:137`, `:150`, `:268`; bios filter at `:166-168`).
6. **Lead/admin projection**: `LEAD_ADMIN = new Set<MembershipRole>(PROJECT_ADMIN_ROLES)`
   where `PROJECT_ADMIN_ROLES = ["lead", "admin"]` (`packages/core/src/audience.ts:96`,
   `packages/types/src/roles.ts:68`). Plain `member` never resolves for a `*_leads` selector.
7. **Officer audience with CONSENT gating**: only `consent === "accepted"` assignments resolve;
   `pending`/`declined` never do (`packages/core/src/audience.ts:251-256`, and again at
   `:216-221` for project role audiences). Default when the field is absent is `"accepted"`
   (`(a.consent ?? "accepted")`).
8. **Officer audiences ignore camp-level aliases** — they resolve through
   `project_roles.officerKey`, the "stable org catalog anchor"
   (`packages/db/src/schema.ts:962-971`; resolver at `packages/core/src/audience.ts:243-248`).
9. **Baseline derivation** — targeting the camp's baseline role resolves to the whole camp
   even though no assignment rows exist for it (`packages/core/src/audience.ts:206-212`).
   "baseline is never stored per member."
10. **Cross-account-kind audience** (`org_suppliers`) resolving through `suppliers.user_id`,
    never through memberships/bios (`packages/core/src/audience.ts:300-306`,
    `packages/types/src/audience.ts:109-120`).
11. **Optional context fields degrade to empty, not to error**: `projectRoles?` and
    `suppliers?` are optional so pre-feature callers still typecheck; absent ⇒ empty
    (`packages/core/src/audience.ts:87-93`).
12. **Empty audience is a valid outcome, not an error** — "Empty audiences … resolve to `[]`
    — a valid, non-error outcome" (`packages/core/src/audience.ts:276-278`).
13. **Live resolved-count preview** run SERVER-side through the real resolver, 300 ms debounced
    (`apps/org/components/bulletins/bulletin-composer.tsx:91-114`;
    `apps/org/components/questionnaire/activation-form.tsx:111-131`;
    `apps/org/components/questionnaires/builder-v2.tsx:210-227`).
14. **The picker resolves nothing itself** — one resolver, one display
    (`packages/ui/src/components/audience-select.tsx:14-18`).
15. **Zero-count is SHOWN, not hidden** — the deliberate `null` vs `0` distinction
    (`audience-select.tsx:58`; test `audience-select.test.tsx:46-57`).
16. **Authoring/activation authz predicate** keyed on the spec kind
    (`packages/core/src/questionnaire-authz.ts:58-70`).
17. **Results-visibility predicate that never crosses scope** — a `god` who is not the
    project's admin cannot see its results (`questionnaire-authz.ts:85-97`, test `:97`).
18. **Per-role authoring SCOPE**: `manage_questionnaires: { audienceRoles: "all" | string[],
    mayBlock: boolean }` enforced server-side (`packages/core/src/project-permissions.ts:74-97`).
19. **Irrevocable backstop**: `lead`/`admin` always pass every audience check, so no
    permission edit can strand a camp (`project-permissions.ts:20-25`, `:78`).
20. **Audience → `required_actions` fan-out** with a deterministic action key
    `questionnaire:<activationId>` and defensive de-dup
    (`packages/core/src/questionnaire-activation.ts:31-33`, `:69-91`).
21. **Audience → notification fan-out** — one row per recipient
    (`packages/core/src/notifications.ts:297-310`).
22. **Org-internal never leaks into the participant app** —
    `isParticipantFacingActivation(audience) = audience?.kind !== "org_internal"`
    (`packages/core/src/questionnaire-engine.ts:48-52`), applied at
    `apps/web/lib/required-actions.ts:156`, `apps/web/lib/questionnaire-store.ts:570/665/698`.
23. **Read-side audience enforcement for bulletins** — you may read a bulletin only if you
    hold a notification row for it (`apps/web/lib/bulletins.ts:32-43`).
24. **Order-insensitive audience equality** (`audienceKey`) so a reordered selector list does
    not read as a change (`apps/org/lib/actions/bulletins.ts:76-88`).
25. **Title + audience FREEZE at publish**; body stays editable
    (`apps/org/lib/actions/bulletins.ts:100-101`, `:166-172`, `:180-182`).
26. **`SELECT … FOR UPDATE` row lock** around the already-published guard so a double publish
    cannot double-broadcast (`apps/org/lib/actions/bulletins.ts:149-159`, `:310-319`).
27. **Chunked notification insert at 1000 rows** because 6–8 bound params × Postgres' 65535
    ceiling killed the whole transactional broadcast at ~10 922 recipients
    (`apps/org/lib/notifications.ts:111-131`).
28. **Human labels for a stored spec** (`audienceLabel`) used on list rows and result pages
    (`apps/org/lib/questionnaires/queries.ts:63-81`).
29. **Audience carried through the query string** from builder rail to send screen, parsed
    defensively with `safeParse` (`apps/org/app/(console)/questionnaires/[key]/activate/page.tsx:21-36`).
30. **A camp-side audience picker that greys out what the author may not target**, computed
    server-side through the *same* predicate the send re-runs
    (`apps/web/app/(app)/camps/[slug]/questionnaires/new/page.tsx:83-103`;
    `apps/web/components/questionnaire/builder.tsx:433-495`).
31. **Camp-side resolution loads a MINIMAL context** — group memberships + role assignments +
    project roles only; no org, registration or bio rows
    (`apps/web/lib/questionnaire-store.ts:183-240`, note `orgGroupId: ""` at `:225`).
32. **Send-time audit row records the audience and the recipient count**
    (`apps/org/lib/questionnaires/actions.ts:423-434`: `meta: { questionnaireKey, audience, blocking, recipients: userIds.length, editionId }`).
33. **Notification `origin` + `linkApp`**: an org questionnaire vs a camp questionnaire are
    attributed differently, and org-internal sends re-point the link into the console
    (`packages/core/src/notifications.ts:220-279`; `apps/org/lib/questionnaires/actions.ts:466-478`).
34. **Immediate email gated on blocking-ness**
    (`packages/core/src/notifications.ts:320-327`).

---

## 5. Data model (verbatim)

### 5.1 Enums (`packages/db/src/schema.ts`)

```ts
export const groupKindEnum = pgEnum("group_kind", [          // :49
  "org", "theme_camp", "artwork", "mutant_vehicle",
]);

export const membershipRoleEnum = pgEnum("membership_role", [ // :71
  "god", "org_staff", "lead", "admin", "member", "engineer",
]);

export const projectRoleKindEnum = pgEnum("project_role_kind", [ // :87
  "captain", "baseline", "default", "custom", "officer",
]);

export const roleAssignmentConsentEnum = pgEnum("role_assignment_consent", [ // :119
  "pending", "accepted", "declined",
]);

export const registrationStatusEnum = pgEnum("registration_status", [ // :127
  "draft", "submitted", "under_review", "changes_requested",
  "approved", "rejected", "withdrawn",
]);

export const notificationKindEnum = pgEnum("notification_kind", [ // :229
  "registration", "wrangler", "role", "questionnaire",
  "supplier", "security", "bulletin",
]);

export const requiredActionTypeEnum = pgEnum("required_action_type", [ // :240
  "questionnaire", "acknowledgement", "payment", "profile_update",
]);

export const requiredActionStatusEnum = pgEnum("required_action_status", [ // :247
  "pending", "completed", "waived", "expired",
]);

export const questionnaireScopeEnum = pgEnum("questionnaire_scope", [ // :254
  "everyone", "individual", "opt_in",
]);

export const activationStatusEnum = pgEnum("activation_status", [ // :260
  "draft", "open", "closed",
]);

export const questionnaireAuthoredScopeEnum = pgEnum(               // :274
  "questionnaire_authored_scope",
  ["org", "group"],
);
```

> **Note for the port:** `questionnaireScopeEnum` here is `[everyone, individual, opt_in]`
> — the donor DROPPED `team` / `team_leads` when it superseded the enum with the JSONB
> `audience` spec. Camp 404's own is `[everyone, team, team_leads, individual, opt_in]`
> (`camp-404:packages/db/src/schema.ts:133`). The donor's `scope` column survives as a
> vestigial default (`scope: questionnaireScopeEnum("scope").notNull().default("everyone")`,
> `packages/db/src/schema.ts:1305`) and is *not* read by any audience path — the JSONB
> `audience` column replaced it. **That is exactly the migration Camp 404 would make.**

### 5.2 `questionnaire_activations` — audience columns (`packages/db/src/schema.ts:1297-1346`)

```ts
    scope: questionnaireScopeEnum("scope").notNull().default("everyone"),      // :1305
    blocking: boolean("blocking").notNull().default(true),                     // :1306
    status: activationStatusEnum("status").notNull().default("draft"),         // :1307
    dueAt: timestamp("due_at", { mode: "date" }),                              // :1308
    // Audience-targeting columns (questionnaire-builder feature). `authoredScope`
    // + `groupId` are the results-visibility boundary; `audience` is the jsonb
    // spec resolved at send time (@quagga/core resolveAudience); `editionId`
    // scopes edition-relative selectors. All nullable so pre-feature rows (the
    // Burner Bio spine) are untouched.
    authoredScope: questionnaireAuthoredScopeEnum("authored_scope")            // :1314
      .notNull()
      .default("org"),
    groupId: uuid("group_id").references(() => groups.id, {                    // :1317
      onDelete: "cascade",
    }),
    editionId: uuid("edition_id").references(() => editions.id, {              // :1320
      onDelete: "cascade",
    }),
    audience: jsonb("audience").$type<AudienceSpec>(),                         // :1323
```

Indexes (`:1341-1346`): `questionnaire_activations_key_idx`, `…_status_idx`,
`…_group_idx`, `…_edition_idx`.

### 5.3 `bulletins` (`packages/db/src/schema.ts:1748-1773`)

```ts
export const bulletins = pgTable(
  "bulletins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id").notNull().references(() => editions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    // Same enum/shape as questionnaire audiences (validated by AudienceSpec in
    // @quagga/types; resolved by @quagga/core resolveAudience at publish time).
    audience: jsonb("audience").$type<AudienceSpec>().notNull(),      // :1758
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Null = draft; set on publish (the fan-out trigger).
    publishedAt: timestamp("published_at", { mode: "date" }),          // :1763
    pinned: boolean("pinned").notNull().default(false),
    createdAt: …, updatedAt: …,
  },
  (b) => ({
    editionIdx: index("bulletins_edition_idx").on(b.editionId),
    publishedIdx: index("bulletins_published_idx").on(b.publishedAt),
  }),
);
```

### 5.4 `required_actions` — the fan-out target (`packages/db/src/schema.ts:1443-1479`)

Uniqueness key is **(user_id, edition_id, action_key)**:

```ts
    userEditionActionIdx: uniqueIndex(
      "required_actions_user_edition_action_idx",
    ).on(ra.userId, ra.editionId, ra.actionKey),     // :1470-1472
```

with the comment "The edition sits in the MIDDLE so the index still serves a lookup by
user alone (`listRequiredActions`) on its leading column" (`:1468-1469`).
Camp 404's equivalent index is (user, action_key) only.

### 5.5 `notifications` — audience fan-out sink (`packages/db/src/schema.ts:1841-1893`)

Columns: `id`, `userId`, `kind` (`notificationKindEnum`), `title`, `body`, `link`,
`origin` text (`web`/`org`/`camp`/`system` — stored as free text, `:1858`),
`linkApp` text (`:1873`), `bulletinId` FK → `bulletins.id` cascade (`:1874`),
`createdAt`, `readAt`. Indexes: `notifications_user_read_idx` (user, read_at),
`notifications_user_created_idx` (user, created_at DESC).

### 5.6 Rows the resolver reads (source tables)

| Context field | Table | Columns selected |
| --- | --- | --- |
| `memberships` | `memberships` (`:752`) | `id, user_id, group_id, role` |
| `groups` | `groups` (`:717`) | `id, kind` |
| `registrations` | `registrations` (`:1074`) | `group_id, edition_id, status, grants_interest` (`:1136`) |
| `bios` | `burner_bios` (`:605`) | `user_id, edition_id` (filtered to the edition) |
| `roleAssignments` | `member_role_assignments` (`:988`) | `membership_id, project_role_id, consent_status` (`:1003`) |
| `projectRoles` | `project_roles` (`:949`) | `id, group_id, kind, officer_key` (`:971`) |
| `suppliers` | `suppliers` (`:1488`) | `user_id` WHERE `user_id IS NOT NULL` |

`registrations.grantsInterest` verbatim (`:1133-1136`):

```ts
    // Grant-interest flag (questionnaire-builder feature). Nullable tri-state:
    // null = not asked yet (no MV/art grant flow), true/false once declared.
    // Drives the `mv_grant_requesters` / `art_grant_requesters` audiences.
    grantsInterest: boolean("grants_interest"),
```

---

## 6. Public API surface (exported signatures verbatim)

### `packages/core/src/audience.ts`

```ts
export interface AudienceMembership {                     // :23-28
  membershipId: string;
  userId: string;
  groupId: string;
  role: MembershipRole;
}
export interface AudienceGroup { id: string; kind: GroupKind }                     // :31-34
export interface AudienceRegistration {                                            // :37-42
  groupId: string; editionId: string; status: string; grantsInterest: boolean | null;
}
export interface AudienceBio { userId: string; editionId: string }                  // :45-48
export interface AudienceSupplier { userId: string }                               // :51-55
export interface AudienceRoleAssignment {                                          // :58-63
  membershipId: string; projectRoleId: string; consent?: RoleAssignmentConsent;
}
export interface AudienceProjectRole {                                             // :66-71
  id: string; groupId: string; kind: ProjectRoleKind; officerKey: OfficerKey | null;
}
export interface AudienceContext {                                                 // :78-94
  editionId: string;
  orgGroupId: string;
  memberships: readonly AudienceMembership[];
  groups: readonly AudienceGroup[];
  registrations: readonly AudienceRegistration[];
  bios: readonly AudienceBio[];
  roleAssignments: readonly AudienceRoleAssignment[];
  projectRoles?: readonly AudienceProjectRole[];
  suppliers?: readonly AudienceSupplier[];
}
export function resolveAudience(spec: AudienceSpec, ctx: AudienceContext): string[]  // :279-282
```

### `packages/types/src/audience.ts`

```ts
export const QuestionnaireAuthoredScope = z.enum(["org", "group"]);                  // :25
export const OrgOutboundSelector = z.enum([...7...]);                                // :36
export const ORG_OUTBOUND_SELECTORS = OrgOutboundSelector.options;                   // :55
export const ORG_OUTBOUND_SELECTOR_LABELS: Record<OrgOutboundSelector, string>       // :58
export const OrgInternalAudience  = z.object({ kind: z.literal("org_internal") });   // :73
export const OrgOutboundAudience  = z.object({ kind: …, selectors: z.array(OrgOutboundSelector).min(1) }); // :79
export const OrgOfficerAudience   = z.object({ kind: …, officerKeys: z.array(OfficerKey).min(1) });        // :91
export const OFFICER_AUDIENCE_LABELS: Record<z.infer<typeof OfficerKey>, string>     // :98
export const OrgSuppliersAudience = z.object({ kind: z.literal("org_suppliers") });  // :117
export const ProjectAudience = z.object({                                            // :127
  kind: z.literal("project"),
  groupId: z.string().min(1),
  mode: z.enum(["everyone", "roles"]),
  roleIds: z.array(z.string().min(1)).default([]),
});
export const AudienceSpec = z.discriminatedUnion("kind", [...]);                     // :136
export function authoredScopeForAudience(spec: AudienceSpec): QuestionnaireAuthoredScope // :146
export function groupIdForAudience(spec: AudienceSpec): string | null                // :153
export const QuestionnaireBuilderInput = z.object({                                  // :165
  key: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  definition: Questionnaire,
});
export const QuestionnaireActivationInput = z.object({                               // :179
  questionnaireKey: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  editionId: z.string().min(1),
  audience: AudienceSpec,
  blocking: z.boolean().default(true),
  dueAt: z.string().min(1).nullable().default(null),
});
```

### `packages/core/src/questionnaire-authz.ts`

```ts
export interface AuthzMembership { groupId: string; role: MembershipRole }            // :25-28
export function isOrgAuthor(memberships: readonly AuthzMembership[], orgGroupId: string): boolean    // :34
export function isProjectAdmin(memberships: readonly AuthzMembership[], groupId: string): boolean    // :44
export function canAuthorAudience(memberships: readonly AuthzMembership[], spec: AudienceSpec, orgGroupId: string): boolean // :58
export const canActivateAudience = canAuthorAudience;                                 // :70
export interface AuthzActivation { authoredScope: "org" | "group"; groupId: string | null } // :73-76
export function canViewActivationResults(memberships, activation: AuthzActivation, orgGroupId: string): boolean // :85
export function canManageProjectRoles(memberships, groupId: string): boolean          // :100
export function projectAudienceTargetRoleIds(audience: ProjectAudience, baselineRoleId: string | null): string[] // :112
export function canAuthorProjectQuestionnaire(m: PermissionMembership, audience: ProjectAudience, blocking: boolean, baselineRoleId: string | null): boolean // :133
```

### `packages/core/src/project-permissions.ts`

```ts
export function isPermissionBackstop(role: MembershipRole): boolean                    // :23
export interface PermissionMembership {                                                // :33-36
  structuralRole: MembershipRole;
  rolePermissions: readonly ProjectPermissions[];
}
export function hasProjectPermission(m: PermissionMembership, key: ProjectPermissionKey): boolean  // :43
export function canManageQuestionnaireAudience(                                        // :74
  m: PermissionMembership,
  req: { targetRoleIds: readonly string[]; blocking: boolean },
): boolean
export function allProjectPermissions(): ProjectPermissions                            // :102
```

### `packages/core/src/questionnaire-activation.ts`

```ts
export function resolveActivationDefinition<T>(snapshot: T | null | undefined, liveFallback: T): T // :22
export function activationRequiredActionKey(activationId: string): string              // :31
export function parseActivationActionKey(actionKey: string): string | null             // :37
export interface ActivationLike { id: string; title: string; blocking: boolean; dueAt: Date | null } // :45-50
export interface RequiredActionInsert {                                                // :53-62
  userId: string; type: "questionnaire"; actionKey: string; activationId: string;
  title: string; blocking: boolean; status: "pending"; dueAt: Date | null;
}
export function buildActivationRequiredActions(activation: ActivationLike, userIds: readonly string[]): RequiredActionInsert[] // :69
export function completeRequiredAction(now?: Date): RequiredActionCompletion            // :100
export function isActivationResponseComplete(activationId: string, response: ResponseLike | null | undefined): boolean // :113
export function tallyActivationCompletion(actions: readonly { status: string }[]): ActivationCompletion // :136
```

### `packages/core/src/notifications.ts` (audience-relevant)

```ts
export function resolveBulletinAudience(spec: AudienceSpec, ctx: AudienceContext): string[]   // :286
export function buildBulletinNotifications(input: { bulletinId: string; title: string }, userIds: readonly string[]): NotificationRow[] // :297
export function bulletinNotification(input: { bulletinTitle: string; bulletinId: string }): NotificationPayload // :201
export function questionnaireReleasedNotification(input: { title: string; blocking: boolean; activationId?: string | null; from?: string }): NotificationPayload // :91
export function shouldSendImmediateEmail(kind: NotificationKind, opts?: { blocking?: boolean }): boolean // :320
export function resolveNotificationLinkApp(linkApp: NotificationApp | null | undefined, writingApp: NotificationApp): NotificationApp | null // :259
export function notificationLinkIsLocal(linkApp: string | null | undefined, thisApp: NotificationApp): boolean // :274
export type NotificationOrigin = "org" | "camp" | "system";                                    // :220
export type NotificationApp = "web" | "org" | "suppliers";                                     // :230
export interface NotificationRow extends NotificationPayload {                                 // :233-239
  userId: string; bulletinId?: string | null;
  origin?: NotificationOrigin | null; linkApp?: NotificationApp | null;
}
```

### `packages/core/src/questionnaire-engine.ts`

```ts
export function isParticipantFacingActivation(audience: AudienceSpec | null | undefined): boolean // :48-52
```

### `packages/ui/src/components/audience-select.tsx`

```ts
export interface AudienceOption { value: string; label: string }                    // :20-23
export interface AudienceSelectProps {                                              // :25-38
  options: readonly AudienceOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  resolvedCount?: number | null;
  countNoun?: string;      // default "burners"
  placeholder?: string;    // default "Choose an audience"
  disabled?: boolean;
  id?: string;
  className?: string;
}
export function AudienceSelect(props: AudienceSelectProps)                           // :47
```

### `apps/org/components/bulletins/audience-options.ts`

```ts
export interface BulletinAudienceOption { value: string; label: string }             // :21-24
export const BULLETIN_AUDIENCE_OPTIONS: readonly BulletinAudienceOption[]            // :32
export function audienceSpecForOption(value: string): AudienceSpec | null            // :48
export function optionForAudienceSpec(spec: AudienceSpec | null | undefined): string | undefined // :71
export function audienceCountNoun(value: string | undefined): string                 // :87
```

### `apps/org/components/bulletins/audience-count.ts`

```ts
export type BulletinAudienceCountResult = { ok: true; count: number } | { ok: false; error: string } // :39-40
export async function previewBulletinAudienceCount(
  raw: z.input<typeof PreviewInput>,        // { audience: AudienceSpec; editionId: string.uuid() }
): Promise<BulletinAudienceCountResult>                                              // :62
```

### `apps/org/lib/questionnaires/queries.ts`

```ts
export function audienceLabel(spec: AudienceSpec | null): string                     // :63
export async function buildAudienceContext(editionId: string, orgGroupId: string): Promise<AudienceContext> // :412
```

---

## 7. UX behaviours

### 7.1 The count sentence (`packages/ui/src/components/audience-select.tsx:40-45`)

```ts
/** "Resolves to ~N burners" — approximate, live from the resolver. */
function resolveLine(count: number, noun: string): string {
  if (count === 0) return `Resolves to no ${noun} yet`;
  if (count === 1) return `Resolves to ~1 ${noun.replace(/s$/, "")}`;
  return `Resolves to ~${count} ${noun}`;
}
```

Rendered with a `<Users className="h-3.5 w-3.5" aria-hidden />` glyph in
`text-xs text-muted-foreground` (`:74-77`). `showCount = resolvedCount !== null &&
resolvedCount !== undefined` (`:58`) — the *deliberate* three-state.

Test rationale, verbatim (`audience-select.test.tsx:8-11`): *"a resolved count of
ZERO is not the same as 'we have not resolved yet'. Hiding the line when an audience
resolves to nobody is exactly the moment an author most needs to know before pressing
send."*

### 7.2 Bulletin composer — single-choice audience

Field wrapper copy: label "Audience", `required`, help
`"Resolved live by the same rules questionnaires use."`
(`bulletin-composer.tsx:204-219`). `countNoun` swaps per audience
(`audienceCountNoun`, `audience-options.ts:87-93`):
`org_internal → "org staff"`, `org_suppliers → "suppliers"`,
`officer:* → "officers"`, `outbound:all_current_burners → "burners"`,
everything else → `"recipients"`.

Publish footnote: `"Publishing resolves the audience now and notifies everyone it
matches for ${editionName}."` (`:267`); once published:
`"Already published — edits correct the copy; recipients are not notified again."` (`:266`).

Toast on publish carries the audience: `` { description: `Sent to ${audienceLabel.toLowerCase()}.` } `` (`:159`).

### 7.3 Questionnaire SEND screen — three mode cards + multi-select chips

`apps/org/components/questionnaire/activation-form.tsx:180-262`. Mode cards
(`AudienceModeCard`, `:331`), verbatim captions:

| Mode | Title | Caption |
| --- | --- | --- |
| `org_internal` | "Org members (internal)" | "Shows only in this console. Gates staff who haven't answered." |
| `org_outbound` | "Outbound" | "Delivered to burners in the participant app." |
| `org_officer` | "Officers" | "Brief the responsible people across all registered camps." |

Selector chips are `aria-pressed` pill buttons with a `Check` glyph when on
(`:208-227`, `:240-259`). The officer section carries an explanatory line:
*"Resolves to every accepted officer of these roles across registered camps, whatever
each camp calls them."* (`:236-238`).

`AudiencePreview` (`:366-397`) has four states, in order:
1. no spec → "Pick an audience to see how many people it reaches."
2. loading → spinner + "Resolving audience…"
3. error → the server's refusal text in `text-destructive`
4. resolved → `<N> person|people will receive this right now.` (`tabular-nums`)

Send button is `disabled={pending || !spec}` (`:322`).

### 7.4 Camp-side project audience picker

`apps/web/components/questionnaire/builder.tsx:433-508`. Two mode buttons
("Everyone in this camp" / "By role"); the `everyone` button is `disabled` when the
author's scope excludes the baseline (`:435`), with the explanation
*"Your questionnaire permission covers specific roles, not the whole camp — a lead or
admin can widen it."* (`:456-459`).

Role targets render as a Radix `ToggleGroup type="multiple"`; out-of-scope roles are
`disabled` with `title="Outside your questionnaire permission"` (`:468-486`), plus a
footnote *"Greyed-out roles are outside your questionnaire permission."* (`:488-492`).

Resolved count is computed CLIENT-side here (the camp roster is already on the page):

```ts
  const resolvedCount = React.useMemo(() => {                  // :137-142
    if (mode === "everyone") return members.length;
    if (roleIds.length === 0) return 0;
    const wanted = new Set(roleIds);
    return members.filter((m) => m.roleIds.some((id) => wanted.has(id))).length;
  }, [mode, roleIds, members]);
```

Rendered as `Resolves to <N> member|members right now.` (`:500-506`).

Client validation mirrors the server refusals *before* send (`:161-170`) — the file's
own comment: *"Mirrors the server's refusal so the author is told before they send,
not after. The server remains the boundary."*

### 7.5 Blocking toggle copy (audience-adjacent, always co-located)

- Send screen: *"A blocking questionnaire is a hard gate — recipients can do nothing
  else until they submit. Leave off for a dashboard banner that never impedes
  navigation."* (`activation-form.tsx:276-280`).
- Camp builder, when `mayBlock` is false: *"Blocking sends lock a member out of the
  app until they answer, so they need the "may block" part of the questionnaire
  permission. Yours doesn't have it."* (`builder.tsx:547-551`).

### 7.6 Refusal copy is named to the actor's rank

`apps/org/lib/actions/bulletins.ts:60-64` and mirrored in the preview action
(`audience-count.ts:51-55`):

```ts
function broadcastRefusal(session: OrgSession): string {
  return session.role === "engineer"
    ? `${ORG_RANK_LABELS.engineer} accounts don't broadcast to burners in AfrikaBurn's name — ask org staff to send it.`
    : "You are not allowed to broadcast to that audience.";
}
```

Authoring twin (`apps/org/lib/questionnaires/actions.ts:56-59`):
`` `${ORG_RANK_LABELS.engineer} accounts don't ${verb} questionnaires — their answers are personal information. Ask org staff.` ``

### 7.7 Empty-audience result copy

`apps/org/components/questionnaires/results-view.tsx:122-123`:
*"No one matched this audience when it was sent. Grant-requester audiences stay empty
until the MV/art registration flows ship."*

---

## 8. Validation + edge-case rules (digit-exact)

1. `org_outbound.selectors` — `z.array(OrgOutboundSelector).min(1)`; **`[]` is refused**
   (`types/src/audience.ts:81`; test `types/src/__tests__/audience.test.ts:76-85`,
   rationale: *"An empty selector list is an authoring mistake, not a valid broadcast —
   it would activate a blocking questionnaire against zero recipients."*).
2. `org_officer.officerKeys` — same `.min(1)` (`:93`).
3. `project.roleIds` — `.default([])`; parsing `{kind:"project",groupId,mode:"everyone"}`
   yields `roleIds: []` (test `:87-94`).
4. `project.groupId` — `z.string().min(1)`.
5. `AudienceSpec.safeParse({ kind: "everyone" })` → **`success === false`** (test `:72-74`).
6. `QuestionnaireActivationInput.blocking` defaults **true**; `dueAt` defaults **null**
   (`types/src/audience.ts:186-187`; test `:127-133`, rationale: *"Blocking-by-default is
   the safer default for a gate"*).
7. `QuestionnaireActivationInput` without `editionId` or without `audience` → refused
   (test `:135-144`).
8. `editionId` in the preview/count actions is `z.string().uuid()`
   (`audience-count.ts:36`; `questionnaires/actions.ts:232`) — stricter than the
   activation input's `.min(1)`.
9. `BulletinComposeInput` (`types/src/notifications.ts:47-53`):
   `title` trim + **min 1** + **max 200**; `bodyMd` trim + **min 1** + **max 20000**;
   `pinned` default false; `publish` default false.
10. Bulletin `title` input has `maxLength={200}` on the DOM element
    (`bulletin-composer.tsx:184`).
11. Preview/count debounce = **300 ms** in all three composers
    (`bulletin-composer.tsx:109`, `activation-form.tsx:126`, `builder-v2.tsx:220`).
12. `resolveAudience` output is **`[...new Set(userIds)].sort()`** — de-duplicated and
    **lexicographically sorted by user id** (`core/src/audience.ts:99-101`).
13. Only `role ∈ {lead, admin}` resolves for any `*_leads` selector
    (`core/src/audience.ts:96`, `:117`).
14. `registered_camp_leads` requires `r.status === "approved"` **and**
    `r.editionId === ctx.editionId` (`:136-140`).
15. `*_grant_requesters` requires `r.grantsInterest === true` — strict identity, so
    `null` does **not** match (`:151`).
16. `all_current_burners` = bios where `b.editionId === ctx.editionId`; a bio for
    another edition is excluded (`:166-168`; test `:102-112` uses `staleBurner`).
17. `org_internal` = **every** membership on `ctx.orgGroupId` regardless of role —
    including plain `member` (`:284-289`; test `:91-98` expects `["god","orgMember","staff"]`).
18. `project` + `mode: "roles"` + `roleIds: []` → **`[]`** (`:203-204`; test `:300-308`).
19. Baseline derivation: if ANY wanted role id has `kind === "baseline"`, the audience is
    the whole group, and no assignment rows are consulted (`:206-212`; test `:328-353`).
20. Role-assignment consent default: `(a.consent ?? "accepted") !== "accepted"` skips
    (`:219`, `:254`). So a missing `consent` field is treated as accepted.
21. Officer resolution requires ALL FOUR: `r.kind === "officer"`, `r.officerKey !== null`,
    `wantedKeys.has(r.officerKey)`, `registeredGroups.has(r.groupId)` (`:243-247`).
22. Officer resolution short-circuits: `wantedKeys.size === 0 → []` (`:238`);
    `wantedRoleIds.size === 0 → []` (`:249`).
23. `org_suppliers` returns `finalize((ctx.suppliers ?? []).map(s => s.userId))` — absent
    set ⇒ `[]` (`:305`; tests `:207-219`).
24. **Adversarial supplier test** (`audience.test.ts:221-240`): asserts NONE of
    `god, staff, orgMember, campRegLead, campRegAdmin, campRegMember, campUnregLead,
    mvLead, mvMember, artLead` appear.
25. `canManageQuestionnaireAudience` (`project-permissions.ts:74-97`):
    - backstop `lead`/`admin` → `true` immediately;
    - no role grants `manage_questionnaires` → `false`;
    - `req.blocking && !mayBlock` → `false`;
    - `audienceRoles: "all"` on any granting role → `true`;
    - else `req.targetRoleIds.every(id => allowed.has(id))` — **union** across roles.
26. `canAuthorProjectQuestionnaire` (`questionnaire-authz.ts:133-143`): backstop first;
    then `if (audience.mode === "everyone" && !baselineRoleId) return false` — *"a
    non-backstop actor is then denied the everyone audience since scope can't be verified."*
27. `canViewActivationResults` denies a `group`-scoped activation whose `groupId` is null
    (`questionnaire-authz.ts:93-96`; test `:110`).
28. Bulletins **refuse a `project` audience** in three places, with the same sentence
    *"Bulletins broadcast to org audiences, not a single camp."*
    (`bulletins.ts:45`, `audience-count.ts:76-78`) and re-checked on publish of a stored
    row (`bulletins.ts:322`).
29. Questionnaires **refuse a `project` audience from the console**:
    *"Project audiences are authored from the camp dashboard."*
    (`questionnaires/actions.ts:255-257`, `:294-296`).
30. Questionnaires **never offer `org_suppliers`** — the send form's `AudienceMode` type is
    `"org_internal" | "org_outbound" | "org_officer"` (`activation-form.tsx:38`), and
    builder-v2's `AUDIENCE_OPTIONS` omits it (`builder-v2.tsx:105-115`).
31. A DRAFT definition cannot be activated at all — refusal names the state
    (`questionnaires/actions.ts:326-336`).
32. `dueAt` validity: `if (dueAt && Number.isNaN(dueAt.getTime())) throw` (`:339-341`);
    the activate page accepts only `/^\d{4}-\d{2}-\d{2}$/` from the query string
    (`activate/page.tsx:64-65`).
33. `required_actions` insert uses
    `.onConflictDoNothing({ target: [userId, editionId, actionKey] })` — idempotent re-send
    (`questionnaires/actions.ts:410-416`).
34. `buildActivationRequiredActions` de-dupes user ids defensively even though
    `resolveAudience` already did (`questionnaire-activation.ts:74-78`).
35. `activationRequiredActionKey(id) === \`questionnaire:${id}\`` and
    `parseActivationActionKey` returns `null` for a non-matching key **and** for an empty
    suffix (`slice(prefix.length) || null`, `:41`).
36. Notification insert chunk size = **1000 rows** (`apps/org/lib/notifications.ts:113`),
    justified against Postgres' **65535** parameter ceiling: "a single insert dies at
    **10923** rows with SQLSTATE **08P01**" (`:125-129`).
37. `audienceKey` sorts selector arrays so `["a","b"]` ≡ `["b","a"]`
    (`bulletins.ts:76-88`; test `bulletin-actions.test.ts:238`).
38. A published bulletin refuses a title OR audience change with
    `PUBLISHED_FROZEN_MESSAGE` (`bulletins.ts:100-101`, `:166-172`).
39. Publish is serialised by `.for("update")` on the bulletin row (`:159`, `:315`).
40. Immediate email: `kind === "registration"` always; `kind === "questionnaire"` only when
    `blocking === true`; everything else false (`notifications.ts:320-327`).
41. Org-internal send re-points the notification: `link: internal ? "/" : payload.link`
    and `linkApp: internal ? "org" : "web"` (`questionnaires/actions.ts:466-476`), with the
    email body switching to *"Open the organiser console to complete it."* (`:497-499`).
42. Bulletin fan-out writes `linkApp: null` **explicitly** (`bulletins.ts:284`), and
    `resolveNotificationLinkApp` preserves that null because `??` would not
    (`notifications.ts:241-264` — the three-times-lost distinction).
43. `listRequiredActions` treats a row as non-blocking once its activation is closed:
    `blocking && (activationStatus === null || activationStatus === "open")`
    (`apps/web/lib/required-actions.ts:163-164`).
44. `slugifyKey` for org definitions: lowercase → NFKD → `[^a-z0-9]+ → "-"` → trim
    dashes → `.slice(0, 60)` → prefixed `org-`; uniqueness loop tries up to **200**
    candidates `base`, `base-2`, … (`questionnaires/actions.ts:62-80`).
45. Camp definition keys are namespaced `proj:<groupId>:<8-char base36 random>`
    (`apps/web/lib/questionnaire-store.ts:41-49`).

---

## 9. Test coverage

### `packages/core/src/__tests__/audience.test.ts` — 435 lines

**Fixture world** (`:9-88`): one org (`g-org`), a registered theme camp
(`g-camp-registered`, status `approved`), an unregistered theme camp
(`g-camp-unregistered`, status `draft`), one MV (`g-mv`, status `submitted`,
`grantsInterest: true`), one artwork (`g-art`, status `approved`,
`grantsInterest: false`), edition `e-2027` vs `e-2026`. Membership ids follow the
convention `m:<user>:<group>` (`:22`). Users are named by role so assertions read
plainly: `staff, god, orgMember, campRegLead, campRegAdmin, campRegMember,
campUnregLead, mvLead, mvMember, artLead, staleBurner, supplierA, supplierB`.

Suites and their exact assertions:

| Suite | Cases |
| --- | --- |
| org internal (`:90`) | every org member regardless of role → `["god","orgMember","staff"]` |
| org outbound (`:101`) | 8 cases — one per selector, plus "grant-requester audiences are empty when no such registrations exist" (`:171`) and "dedupes across multiple selectors" (`:184`) |
| org suppliers (`:198`) | 5 cases incl. the adversarial no-leak sweep (`:221`) and multi-row de-dup (`:242`) |
| project (`:254`) | 4 cases — everyone; roles with a multi-role member and a cross-group assignment that must be ignored (`:286`); empty roleIds; unlisted role |
| baseline derivation (`:328`) | 1 case: "targeting the baseline role resolves to the whole camp (derived, not stored)" — with **no** roleAssignments seeded |
| org officer (`:355`) | 3 cases over an `officerCtx` fixture with an accepted officer in a registered camp, a **pending** one, an accepted one in an **unregistered** camp, and a second key |

### `packages/types/src/__tests__/audience.test.ts` — 172 lines

The standout is a **union-exhaustiveness table** (`:46-56`) that reads the union's own
options and forces a deliberate org-vs-group decision for any new kind:

```ts
    const unionKinds = AudienceSpec.options.map(
      (o) => o.shape.kind.value as string,
    );
    expect(SPECS.map((s) => s.spec.kind).sort()).toEqual([...unionKinds].sort());
```

Plus label-completeness both ways (`Object.keys(LABELS).sort() === [...KEYS].sort()`,
`:103-105`, `:112-114`) with the rationale *"An unlabelled selector renders as a blank
row in the audience picker."*

### `packages/core/src/__tests__/notifications.test.ts`

- *"resolveBulletinAudience is the same expansion questionnaires use"* — asserts
  literal equality with `resolveAudience` on the same spec+ctx (`:82-90`).
- Fan-out is exactly one row per recipient, `kind === "bulletin"`,
  `link === "/bulletins/b-1"` (`:92-112`).
- Empty audience → zero rows, "valid, not an error" (`:114-125`).
- Org-internal isolation: `["god","orgMember","staff"]`, and explicitly
  `not.toContain("campRegLead" | "campRegMember" | "campUnregLead")` (`:129-138`).

### `apps/org/lib/__tests__/*` (source-text + seeded-store tests)

- `bulletin-actions.test.ts` — "FREEZES the title and audience once it has gone out"
  (`:177`), "does not read a reordered selector list as an audience CHANGE" (`:238`),
  "refuses a stored audience that is camp-scoped" (`:367`), a double-publish case
  (`:320`), and `seedAudienceContext()` (`:60`) described as "The seven row sets
  `buildAudienceContext` reads".
- `questionnaire-actions.test.ts` — `previewAudienceCount` refuses a project audience
  (`:220`), counts live (`:237`), and **"writes nothing to required_actions when the
  audience resolves to nobody"** (`:378`).
- `org-rank-enforcement.test.ts:422-440` — an *anti*-audience test: the wrangler
  notification must derive recipients from ids, and the function body must
  `not.toContain("resolveAudience")` / `not.toContain("buildBulletinNotifications")`.
  Rationale: *"if either ever comes from a role query or the bulletin audience
  resolver, it can over-send."* This is a reusable technique — asserting a module does
  NOT reach for the broadcast machinery.

### E2E

- `bulletins-targeting.spec.ts` — camp_leads: a camp-leading burner receives, a plain
  burner provably does not; drives the real picker via `#bulletin-audience`.
- `bulletins-audience-reach.spec.ts` — its header (`:1-27`) is the best commentary in
  the unit: *"That is one selector out of eleven, and it is the FRIENDLIEST one — a
  resolver that simply returned 'every burner with a bio' would pass it."* The two
  added cases are (1) **art_leads vs a theme-camp lead control** (group-KIND
  discrimination) and (2) **org_suppliers published on :3001 and read on :3002**.
  Both assert absence on the plain `/notifications` AND on `/notifications?filter=bulletins`
  because *"a leak that only shows under a filter is still a leak."*

---

## 10. Dependency footprint

| Asset | Imports |
| --- | --- |
| `packages/core/src/audience.ts` | **type-only** from `@quagga/types` (`AudienceSpec, GroupKind, MembershipRole, OfficerKey, OrgOutboundSelector, ProjectRoleKind, RoleAssignmentConsent`) + the value `PROJECT_ADMIN_ROLES`. Nothing else. No DB, no env, no React. |
| `packages/types/src/audience.ts` | `zod`, `./questionnaire` (`Questionnaire`), `./roles` (`OfficerKey`) |
| `packages/ui/src/components/audience-select.tsx` | `react`, `lucide-react` (`Users`), `./select` (Radix Select wrapper), `../lib/utils` (`cn`). **No workspace type imports at all** — it takes `{value,label}[]` |
| `packages/core/src/questionnaire-authz.ts` | types from `@quagga/types`; `./project-permissions` |
| `packages/core/src/project-permissions.ts` | types from `@quagga/types` + `PROJECT_ADMIN_ROLES` |
| `packages/core/src/notifications.ts` | types from `@quagga/types`; `./audience` |
| `apps/org/components/bulletins/audience-count.ts` | `zod`, `@quagga/core`, `@quagga/types`, `@/lib/questionnaires/queries`, `@/lib/session` |
| `apps/org/lib/questionnaires/queries.ts` (`buildAudienceContext`) | `drizzle-orm`, `@/lib/db` — **7 parallel `SELECT`s in one `Promise.all`**, three of them unfiltered full-table scans (`memberships`, `groups`, `member_role_assignments`, `project_roles`) |

**Camp 404 compatibility.** `packages/core/src/audience.ts` is a **drop-in-shaped**
module: it would compile in `camp-404:packages/core` unchanged apart from the
`@quagga/types → @camp404/types` rename and re-expressing the four imported type
names. Camp 404's `packages/core` is already declared "pure, zero-I/O, depends only on
`@camp404/types`" — identical contract.

`AudienceSelect` needs Camp 404's `Select` (it exists, `camp-404:packages/ui/src/components/select.tsx`)
and `lucide-react` `Users` (present in 1.16.0). Its Tailwind classes
(`space-y-1.5`, `text-xs text-muted-foreground`, `h-3.5 w-3.5`) use only tokens Camp
404 already defines. **This is a genuine drop-in.**

---

## 11. AfrikaBurn / multi-tenant coupling — what Camp 404 must collapse

This unit is one of the MOST coupled in the donor. The coupling is in the **grammar**,
not the machinery.

### 11.1 The `groups` indirection (heaviest)

`AudienceContext` has `memberships` keyed on `groupId`, a `groups` row set keyed on
`GroupKind`, and an `orgGroupId` scalar (`core/src/audience.ts:78-94`). Camp 404 has
**no groups table at all** — its `camp_settings` is a physically-enforced singleton
(`camp-404:packages/db/src/schema.ts:1422-1447`). Consequences:

- `AudienceGroup`, `groupKindMap`, `groupIdsOfKind`, `registeredGroupIdsOfKind`,
  `grantRequesterGroupIdsOfKind`, `leadsAdminsOfGroups`, `registeredGroupIds`
  (`:104-157`, `:265-272`) — **all seven helpers exist only to navigate the group
  indirection** and collapse to nothing in a single-camp app.
- `ProjectAudience.groupId`, `groupIdForAudience`, `questionnaire_activations.group_id`,
  `authoredScopeForAudience` — the whole `org` vs `group` authored-scope boundary
  exists because reviewers are a different organisation from the reviewed. **Collapses
  entirely.**
- `resolveProjectAudience` (`:194-225`) is the ONE resolver branch that survives
  almost verbatim: it filters memberships by group, then by role assignment, with
  baseline derivation. In Camp 404 the "group" is the camp itself and the filter is a
  no-op — leaving exactly `everyone | by-team | by-role`.

### 11.2 The `editions` dimension

`editionId` appears in `AudienceContext` and gates three selectors
(`:137`, `:150`, `:166-168`, `:268`). `burner_bios` is user × edition; `registrations`
is group × edition; `required_actions` is keyed (user, **edition**, action_key).
Camp 404 has no editions table. **Every `editionId` filter drops out**, and
`required_actions` keeps its (user, action_key) key.

*Counterpoint worth noting:* the donor's per-edition required-action key exists because
a completed gate was "satisfied for ever" (`apps/web/lib/required-actions.ts:36-42`).
Camp 404 will eventually hit the same bug if it ever runs a second burn — the donor's
comment is the pre-written post-mortem.

### 11.3 The org-vs-participant split

- `org_internal` audience + `isParticipantFacingActivation` + the entire
  `apps/web/lib/required-actions.ts:156` filter exist ONLY because there are two apps.
  In Camp 404 there is no console to gate separately. **Delete.**
- `NotificationApp = "web" | "org" | "suppliers"`, `resolveNotificationLinkApp`,
  `notificationLinkIsLocal`, and `notifications.link_app` are pure three-app machinery
  (`core/src/notifications.ts:230-279`). **Delete** — but keep
  `NotificationOrigin` (`"org" | "camp" | "system"`), which maps cleanly onto Camp 404's
  captain-vs-team-lead-vs-system announcement provenance, a distinction Camp 404's
  `broadcast_kind` enum half-expresses already.
- `isOrgAuthor` / `ORG_AUTHOR_ROLES = {"god","org_staff"}` (`questionnaire-authz.ts:30`)
  collapses to Camp 404's `rank === "captain"`.
- The `engineer` rank carve-outs in every refusal message
  (`bulletins.ts:60-64`, `questionnaires/actions.ts:56-59`) have no Camp 404 analogue.

### 11.4 The supplier population

`org_suppliers`, `AudienceSupplier`, `suppliers.user_id`, the `apps/suppliers` inbox
and the cross-app e2e hop are all fourth-app machinery. **Camp 404 has no supplier
population — delete outright.** (The *pattern* — an audience that reaches a different
account kind via a link column, never through memberships — is worth remembering if a
"guests / plus-ones" audience ever appears.)

### 11.5 AfrikaBurn domain vocabulary

The seven outbound selectors and the five officer keys are AfrikaBurn nouns
(theme camp / mutant vehicle / artwork / grants / LNT / Safety Baron). **All twelve
must be replaced** with Camp 404's vocabulary. The natural mapping onto Camp 404's
existing `broadcast_scope` + team model:

| Donor selector | Camp 404 equivalent |
| --- | --- |
| `all_current_burners` | `everyone` (approved members) |
| `camp_leads` / `registered_camp_leads` | `team_leads` (via `team_memberships.is_lead`) |
| `mv_leads` / `art_leads` / `*_grant_requesters` | — no analogue |
| `org_officer` × 5 keys | a per-team or per-duty audience once WP6 lands |
| `org_internal` | — (single app) |
| `org_suppliers` | — |
| `project` (`everyone` / `roles`) | **the survivor**: `everyone` \| `by-team` \| `by-role` within the one camp |

### 11.6 Coupled asset that CANNOT be lifted without surgery

`buildAudienceContext` (`apps/org/lib/questionnaires/queries.ts:412-495`) is
irreducibly org-shaped: 7 queries, three of them unbounded full-table scans over
`memberships`, `groups`, `project_roles`, `member_role_assignments`. Camp 404 should
port the *shape* (one function, `Promise.all`, returns the exact context interface)
and rewrite the queries.

---

## 12. Verbatim code excerpts — the five most valuable pieces

### 12.1 The resolver's dispatch + the purity contract (`packages/core/src/audience.ts:1-9`, `:274-313`)

```ts
// Audience resolution (questionnaire-spec §"Authoring levels & audiences").
// `resolveAudience(spec, ctx)` turns a stored audience spec into the concrete
// set of user ids to target — the send-time expansion that becomes
// `required_actions` rows.
//
// PURITY CONTRACT: this is a pure function over INJECTED row sets (the context)
// so it is fully unit-testable without a DB. The caller (a route handler /
// activation service) is responsible for loading the rows for the active
// edition and passing them in. No I/O, no env, no DB imports.
```

```ts
/**
 * Expand an audience spec into the de-duplicated, sorted set of user ids to
 * target. Empty audiences (e.g. grant-requester selectors before those flows
 * ship) resolve to `[]` — a valid, non-error outcome.
 */
export function resolveAudience(
  spec: AudienceSpec,
  ctx: AudienceContext,
): string[] {
  switch (spec.kind) {
    case "org_internal": {
      const ids = ctx.memberships
        .filter((m) => m.groupId === ctx.orgGroupId)
        .map((m) => m.userId);
      return finalize(ids);
    }
    case "org_outbound": {
      const ids: string[] = [];
      for (const selector of spec.selectors) {
        ids.push(...resolveOutboundSelector(ctx, selector));
      }
      return finalize(ids);
    }
    case "org_officer": {
      return finalize(resolveOfficerAudience(ctx, spec.officerKeys));
    }
    case "org_suppliers": {
      // Suppliers are a different account kind: they live in `ctx.suppliers`
      // (linked via suppliers.user_id), never in memberships/bios. Only account-
      // linked suppliers can receive an in-app notification, so that is exactly
      // the set this returns — no burner, lead, or officer can leak in.
      return finalize((ctx.suppliers ?? []).map((s) => s.userId));
    }
    case "project": {
      return finalize(
        resolveProjectAudience(ctx, spec.groupId, spec.mode, spec.roleIds),
      );
    }
  }
}
```

### 12.2 Baseline derivation + consent gating — the branch that survives the port (`packages/core/src/audience.ts:193-225`)

```ts
/** Resolve a PROJECT audience (everyone, or by custom role) to user ids. */
function resolveProjectAudience(
  ctx: AudienceContext,
  groupId: string,
  mode: "everyone" | "roles",
  roleIds: readonly string[],
): string[] {
  const inGroup = ctx.memberships.filter((m) => m.groupId === groupId);
  if (mode === "everyone") return inGroup.map((m) => m.userId);

  const wanted = new Set(roleIds);
  if (wanted.size === 0) return [];

  // Baseline derivation: if any wanted role is the camp's baseline (everyone-
  // role), the audience is the whole camp — baseline is never stored per member.
  const projectRoles = ctx.projectRoles ?? [];
  const baselineWanted = projectRoles.some(
    (r) => wanted.has(r.id) && r.kind === "baseline",
  );
  if (baselineWanted) return inGroup.map((m) => m.userId);

  // membership ids that hold at least one wanted role (accepted assignments —
  // a pending/declined officer assignment does not yet make someone a target).
  const matchedMemberships = new Set<string>();
  for (const a of ctx.roleAssignments) {
    if (!wanted.has(a.projectRoleId)) continue;
    if ((a.consent ?? "accepted") !== "accepted") continue;
    matchedMemberships.add(a.membershipId);
  }
  return inGroup
    .filter((m) => matchedMemberships.has(m.membershipId))
    .map((m) => m.userId);
}
```

### 12.3 The picker — 81 lines that own only the sentence (`packages/ui/src/components/audience-select.tsx:14-45`, `:57-80`)

```ts
// AudienceSelect — the questionnaire/bulletin audience picker (notifications-
// spec: "same component as questionnaire audiences"). A DUMB variant of Select:
// it renders the given options and a "Resolves to ~N burners" line. It does NOT
// resolve anything itself — the parent server action runs @quagga/core's
// resolveAudience and feeds `resolvedCount` down (one resolver, one display).

export interface AudienceOption {
  value: string;
  label: string;
}

export interface AudienceSelectProps {
  options: readonly AudienceOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  /** Live resolved recipient count from the parent (via resolveAudience).
   * `null`/`undefined` → the line is hidden (e.g. before a selection). */
  resolvedCount?: number | null;
  /** Noun for the count line. Default "burners". */
  countNoun?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** "Resolves to ~N burners" — approximate, live from the resolver. */
function resolveLine(count: number, noun: string): string {
  if (count === 0) return `Resolves to no ${noun} yet`;
  if (count === 1) return `Resolves to ~1 ${noun.replace(/s$/, "")}`;
  return `Resolves to ~${count} ${noun}`;
}
```

```tsx
}: AudienceSelectProps) {
  const showCount = resolvedCount !== null && resolvedCount !== undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showCount ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          <span>{resolveLine(resolvedCount, countNoun)}</span>
        </p>
      ) : null}
    </div>
  );
}
```

### 12.4 The option-value ⇄ spec round trip (`apps/org/components/bulletins/audience-options.ts:26-84`)

```ts
const OUTBOUND_PREFIX = "outbound:";
const OFFICER_PREFIX = "officer:";
const INTERNAL_VALUE = "org_internal";
const SUPPLIERS_VALUE = "org_suppliers";

/** Options for the AudienceSelect, in broadcast-reach order. */
export const BULLETIN_AUDIENCE_OPTIONS: readonly BulletinAudienceOption[] = [
  ...ORG_OUTBOUND_SELECTORS.map((selector) => ({
    value: `${OUTBOUND_PREFIX}${selector}`,
    label: ORG_OUTBOUND_SELECTOR_LABELS[selector],
  })),
  ...OFFICER_KEYS.map((key) => ({
    value: `${OFFICER_PREFIX}${key}`,
    label: OFFICER_AUDIENCE_LABELS[key],
  })),
  // Suppliers are a separate account kind; the resolver reaches only supplier-
  // linked accounts (canvas `U8CqE` "Suppliers").
  { value: SUPPLIERS_VALUE, label: "Suppliers" },
  { value: INTERNAL_VALUE, label: "Org members (internal)" },
];

/** Option value → the audience spec the action stores. `null` when unknown. */
export function audienceSpecForOption(value: string): AudienceSpec | null {
  if (value === INTERNAL_VALUE) return { kind: "org_internal" };
  if (value === SUPPLIERS_VALUE) return { kind: "org_suppliers" };
  if (value.startsWith(OUTBOUND_PREFIX)) {
    const selector = value.slice(OUTBOUND_PREFIX.length) as OrgOutboundSelector;
    return ORG_OUTBOUND_SELECTORS.includes(selector)
      ? { kind: "org_outbound", selectors: [selector] }
      : null;
  }
  if (value.startsWith(OFFICER_PREFIX)) {
    const key = value.slice(OFFICER_PREFIX.length) as OfficerKey;
    return OFFICER_KEYS.includes(key)
      ? { kind: "org_officer", officerKeys: [key] }
      : null;
  }
  return null;
}

/**
 * Stored spec → option value, so editing an existing bulletin re-selects it.
 * A multi-selector spec (authored elsewhere) has no single option; returning
 * `undefined` leaves the picker empty rather than silently narrowing it.
 */
export function optionForAudienceSpec(
  spec: AudienceSpec | null | undefined,
): string | undefined {
  if (!spec) return undefined;
  if (spec.kind === "org_internal") return INTERNAL_VALUE;
  if (spec.kind === "org_suppliers") return SUPPLIERS_VALUE;
  if (spec.kind === "org_outbound" && spec.selectors.length === 1) {
    return `${OUTBOUND_PREFIX}${spec.selectors[0]}`;
  }
  if (spec.kind === "org_officer" && spec.officerKeys.length === 1) {
    return `${OFFICER_PREFIX}${spec.officerKeys[0]}`;
  }
  return undefined;
}
```

### 12.5 Per-role audience SCOPE enforcement (`packages/core/src/project-permissions.ts:59-97`)

```ts
/**
 * May the member author/send a project questionnaire to a given audience? This
 * is the SERVER-SIDE enforcement of the `manage_questionnaires` scope config
 * (audience_roles + may_block) — the missing check the earlier review flagged.
 *
 * - lead/admin → always allowed (backstop).
 * - otherwise the member must hold `manage_questionnaires` on some role; the
 *   union of those roles' scopes decides:
 *     · blocking send requires `mayBlock` on at least one granting role;
 *     · targeting is allowed if any granting role has `audienceRoles: "all"`,
 *       else every targeted role id must be within the allowed union.
 *
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
    const scope: ManageQuestionnairesScope | undefined =
      p.manage_questionnaires;
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

The scope type (`packages/types/src/roles.ts:280-283`):

```ts
export const ManageQuestionnairesScope = z.object({
  audienceRoles: z.union([z.literal("all"), z.array(z.string().min(1))]),
  mayBlock: z.boolean(),
});
```

Seeded default (`packages/core/src/project-roles.ts:206-218`) — "Team lead" is scoped
to the baseline audience with `mayBlock: false`:

```ts
  return {
    roleId: teamLead.id,
    permissions: {
      view_member_details: true,
      manage_questionnaires: { audienceRoles: [baseline.id], mayBlock: false },
    },
  };
```

---

## 13. Notable engineering patterns worth stealing

1. **Three named authorities, stated in comments, cross-referencing each other.** Zod =
   validation, schema.ts = storage, core = resolution — each file says which it is and
   names the other two (`types/src/audience.ts:12-15`; `schema.ts:1310-1313`).
2. **Pure function over injected row sets.** The resolver never touches a DB; the caller
   loads. Result: 21 unit tests with zero infrastructure.
3. **Optional context fields for forward compatibility** — `projectRoles?` / `suppliers?`
   documented as "so pre-Roles-v2 callers still type-check; absent ⇒ empty"
   (`audience.ts:87-93`). New audience kinds land without breaking old call sites.
4. **Union-exhaustiveness test that reads the union.** `AudienceSpec.options.map(o =>
   o.shape.kind.value)` forces a written decision for every new kind
   (`types/__tests__/audience.test.ts:47-56`).
5. **Empty is a valid outcome, and it is SHOWN.** `null ≠ 0` in the count line, tested
   explicitly (`audience-select.test.tsx:46-57`).
6. **One resolver, one display.** The picker is dumb; the *server* action runs the real
   resolver, so the preview can never disagree with the send.
7. **The preview refuses in the same words the publish would** — `audience-count.ts:48-55`
   duplicates `broadcastRefusal` deliberately, with a comment saying why.
8. **Per-domain gating even for a read-only preview.** The whole 30-line comment at
   `audience-count.ts:16-32` documents a real bug: the composer reused the
   *questionnaires*-domain preview, so a Bulletins-department author was refused their
   own count in a message naming the wrong department — while Publish stayed armed.
9. **Freeze-after-send with a written reason.** `PUBLISHED_FROZEN_MESSAGE`
   (`bulletins.ts:100-101`) plus the dated attribution "Ryan, 28 Jul 2026" at `:93`.
10. **Order-insensitive spec equality** so a reordered array is not a "change"
    (`audienceKey`, `bulletins.ts:76-88`).
11. **`SELECT … FOR UPDATE` around a publish guard**, with the comment "A transaction is
    not on its own a lock" (`bulletins.ts:303-309`).
12. **Chunked bulk insert against a named Postgres limit** with the exact failing row
    count and SQLSTATE (`notifications.ts:111-129`).
13. **Anti-tests**: assert a module does NOT import the broadcast machinery
    (`org-rank-enforcement.test.ts:436-438`).
14. **E2E controls chosen adversarially** — the art_leads case succeeds only because a
    theme-camp lead is in the room and does *not* receive it
    (`bulletins-audience-reach.spec.ts:11-18`).
15. **Client validation explicitly labelled as convenience, not boundary**
    (`builder.tsx:161-163`; `bulletin-composer.tsx:42-44`).
16. **Defensive query-string parsing with `safeParse`, falling back to "pre-fill nothing"**
    (`activate/page.tsx:17-36`).
17. **Audit meta records the audience AND the recipient count** so a send is reconstructable
    (`questionnaires/actions.ts:426-433`).
18. **Read-side audience enforcement** — a bulletin is readable only via a notification row,
    so no audience logic is duplicated on read (`apps/web/lib/bulletins.ts:9-14`).

---

## 14. Gotchas / defects found while reading

1. **Officer consent is per-edition in the schema but NOT in the resolver's context.**
   `member_role_assignments.consentEditionId` was added by migration 0023 precisely
   because "Consent to share a phone number with AfrikaBurn is consent for ONE burn"
   (`schema.ts:1010-1024`), and `apps/org/lib/queries.ts:1299` DOES filter on it.
   But `buildAudienceContext` selects only `consentStatus`
   (`apps/org/lib/questionnaires/queries.ts:452-459`) and `AudienceRoleAssignment` has no
   edition field (`core/src/audience.ts:58-63`). **So an `org_officer` audience can reach
   an officer whose consent belongs to a previous edition.** Medium confidence that this
   is unintended; it is at minimum an inconsistency between two readers of the same
   consent column. Camp 404 has no editions, so this evaporates on port — but the
   *shape* of the bug (a consent qualifier the resolver forgets) is worth remembering.

2. **Three independent option-list constructions from the same vocabulary.**
   `BULLETIN_AUDIENCE_OPTIONS` (`audience-options.ts:32`, 4 kinds),
   `AUDIENCE_OPTIONS` (`builder-v2.tsx:105`, 3 kinds, no suppliers, prefix `outbound:` /
   `officer:` / literal `"internal"`), and the raw chip toggles in
   `activation-form.tsx:208-259`. **Three different encodings of "internal"** —
   `"org_internal"` in one, `"internal"` in the other two. Porting one does not port
   the others; consolidate to a single option builder in `@camp404/types`.

3. **`questionnaire_activations.scope` is dead weight.** `questionnaireScopeEnum` still
   exists and the column still defaults `"everyone"` (`schema.ts:1305`) but no audience
   path reads it — the JSONB `audience` column superseded it. The donor never removed it
   (Postgres enums are append-only; the column is harmless). **Camp 404 should expect the
   same residue** if it adds a JSONB spec beside its existing `broadcast_scope`.

4. **`resolveProjectTargets` passes `orgGroupId: ""`** into `AudienceContext`
   (`apps/web/lib/questionnaire-store.ts:225`). Safe only because the project branch never
   reads it. A stricter type (a discriminated context per audience kind) would prevent
   the class.

5. **`buildAudienceContext` does four unbounded full-table scans** (`memberships`,
   `groups`, `member_role_assignments`, `project_roles`) on every keystroke-debounced
   preview (`apps/org/lib/questionnaires/queries.ts:428-471`). At AfrikaBurn scale this is
   already meaningful; at Camp 404's 30–80 users it is irrelevant — but do not copy the
   pattern into a larger surface.

6. **`audienceLabel` for `project` returns the constant string `"Project members"`**
   (`apps/org/lib/questionnaires/queries.ts:79`) — it never names the roles targeted or the
   camp. A camp-scoped send's own list row therefore cannot tell two different role
   audiences apart.

7. **`optionForAudienceSpec` returns `undefined` for a multi-selector spec** and the
   picker renders empty (`audience-options.ts:66-84`). Documented as deliberate ("rather
   than silently narrowing it"), but it means the send screen and the bulletin composer
   disagree about what is representable: `activation-form.tsx` can author a multi-selector
   spec that the bulletin picker cannot re-display.

8. **Bulletin `origin` is stored as free `text`**, not an enum
   (`schema.ts:1858`, `:1873`), while `NotificationOrigin` / `NotificationApp` are
   TypeScript-only unions (`core/src/notifications.ts:220`, `:230`). Nothing enforces the
   vocabulary at the DB.

9. **The donor's `docs/simplification-audit.md` flags `apps/org/components/questionnaire/builder.tsx`
   (542 lines) as imported by nothing.** `activation-form.tsx` lives in that same
   directory and IS live (`apps/org/app/(console)/questionnaires/[key]/activate/page.tsx:10`).
   Do not assume directory-level deadness.

10. **`ORG_OUTBOUND_SELECTOR_LABELS` and `OFFICER_AUDIENCE_LABELS` live in
    `@quagga/types`, not in the UI package.** That is why the UI picker can be
    dependency-free — but it also means the copy is validated by a *types* test
    (`types/__tests__/audience.test.ts:97-116`), which is an unusual place to look for it.
