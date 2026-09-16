# Unit 06 — Audit trail, security-event feed, and sensitive-data access logging

HARVEST inventory of the donor (quagga-portal / AfrikaBurn Contributors App) at
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`,
for porting into Camp 404 (`/home/ryan/repos/Personal/camp-404`).

Every claim below is cited `path:line`. Read-only pass; nothing in either repo was modified.

---

## 1. Purpose — what this subsystem actually is

The donor ships **two structurally separate logs**, and conflating them is the single
biggest risk when porting:

| | `audit_events` | `security_events` |
|---|---|---|
| Table | `packages/db/src/schema.ts:1708` | `packages/db/src/schema.ts:2026` |
| Migration | `0000_stormy_raider.sql:17` (day one) | `0014_lumpy_gargoyle.sql:10` |
| Subject | **What STAFF did to OTHER PEOPLE'S data** | **What happened to YOUR OWN account** |
| Read by | org console `/audit` (org-gated) | the account holder, on `/account/security` |
| `action`/`kind` column type | free `text` (`schema.ts:1716`) | `pgEnum security_event_kind` (`schema.ts:203-218`, 9 values) |
| Retention | **append-only, never pruned** (`schema.ts:1723`) | **purged on account sanitization** (`packages/core/src/account-sanitization.ts:187-191`) |
| Write discipline | inside the same transaction as the change it records | best-effort, swallowed catch, never a gate |
| PII in it | actor email joined at read; `meta.email` scrubbed on erasure | `ip` + `user_agent` stored (that's why it is purged) |

Layered on top of both is the subsystem's most distinctive asset: **the medical-notes
access trail** — a single `audit_events` action (`bio.medical.view`) that records *who
read whose special-category health data, on what authority*, written off the critical
path in Next's `after()`, and read back by a dedicated console panel. That trail carries
an explicit, documented product law: **it is a record, never monitoring**. An enumeration
detector was built and then deliberately removed, and a test now *pins its absence*
(`apps/org/lib/__tests__/medical-audit-surface.test.ts:114-135`).

Why it matters to Camp 404: unit 06 is a **named user priority ("read audit logs for
security")** and Camp 404 has `audit_log` as a **pure forward-declared table with zero
consumers** (`packages/db/src/schema.ts:1180`), plus **zero auth-adjacent security
surfaces at all** — no session list, no security feed, no 2FA/passkey UI. This is
greenfield with a live donor blueprint.

---

## 2. File inventory (line counts verified with `wc -l`)

### Core rules (pure, no I/O) — `packages/core/src/`
| File | Lines | What it owns |
|---|---:|---|
| `medical-access.ts` | 142 | `canViewMedicalNotes`, `medicalAccessBasis`, `isOrgStaffRole`, `MEDICAL_VIEW_AUDIT_ACTION`, `MedicalAccessContext`, `MedicalAccessBasis` |
| `security-events.ts` | 33 | `SECURITY_EVENT_TITLES` (9 kinds), `describeSecurityEvent` |
| `security-notifications.ts` | 334 | 9 in-app notification builders + 9 Resend email builders + `maskEmail` + `securityMessageLeaks` |
| `account-security.ts` | 546 | password policy, enumeration-safe copy + leak detector, 14-day deletion state machine, 3 deletion guards, 48h email-change state machine |
| `account-sanitization.ts` | (excerpt read :180-290) | `SANITIZATION_PURGED_TABLES`, `SANITIZATION_IDENTITY_TABLES`, `buildSanitizationPlan` (incl. the `account.sanitized` audit row), `isSanitized`, `assertNotSanitized` |
| `id-retention.ts` | 121 | `ID_RETENTION_GRACE_DAYS = 30`, `idRetentionExpiresAt`, `identifyPurgeableIdBios` — POPIA storage-limitation rule, **written but not scheduled** |
| `org-domains.ts` | 206+ | `ORG_DOMAINS` incl. the `"audit"` domain, `ORG_DOMAIN_LABELS`, `ORG_DOMAIN_DESCRIPTIONS` |
| `org-permissions.ts` | 720+ | `canReadPersonalInformationIn`, `canReadPersonalInformationAnywhere`, `orgCapabilityRefusal` |
| `username.ts:250` | — | `publicMemberName(username, {sanitizedAt})` → `"Departed Burner"` / `UNNAMED_BURNER` |

### Console readers + UI — `apps/org/`
| File | Lines | What it is |
|---|---:|---|
| `app/(console)/audit/page.tsx` | 97 | the `/audit` page — 45 lines of it are the product-law comment |
| `app/(console)/audit/loading.tsx` | 19 | skeleton matching the page's `flex flex-col gap-6` |
| `components/audit/medical-access-panel.tsx` | 147 | who-looked / whose-notes / authority / when / ago table |
| `components/audit/audit-trail-list.tsx` | 86 | the general chronological trail with tone dots |
| `lib/medical-audit.ts` | 239 | `canReadMedicalAccessLog`, `getMedicalAccessLog`, `getAuditTrail` |
| `lib/audit.ts` | 26 | `writeAuditEvent(db, {actorId, action, subject?, meta?})` |
| `lib/status-board-format.ts` | 175 | `activityLabel` (34-entry map), `activityTone`, `FEED_EXCLUDED_ACTIONS`, `isFeedAction`, `relativeTime` |
| `lib/status-board.ts` | 111 | `getRecentActivity` (the 6-row glance feed, exclusion applied in SQL) |
| `components/status-board/recent-activity.tsx` | 82 | the glance card, links to `/audit` |
| `lib/labels.ts` | 58 | `formatDateTime` (`en-ZA`, 24h) |
| `components/console-skeleton.tsx` | 76 | `ConsoleHeadingSkeleton`, `ConsoleTableSkeleton` |
| `lib/gate.tsx:47` | — | `guardConsole()` → `{ok:true,session} | {ok:false,node}` |
| `components/console-header.tsx:59` | — | `{ href: "/audit", label: "Audit" }` nav entry |

### Writers — `apps/suppliers/`
| File | Lines | What it is |
|---|---:|---|
| `lib/audit.ts` | 28 | the **duplicate** `writeAuditEvent`, typed `DbOrTx` so it composes inside transactions |

### Account-security surfaces — `packages/ui/` + `apps/web/`
| File | Lines | What it is |
|---|---:|---|
| `packages/ui/src/components/account-security-events.tsx` | 94 | the shared "Recent security events" card (all 3 apps) |
| `packages/ui/src/components/table.tsx` | 118 | `Table/TableBody/TableCaption/TableCell/TableHead/TableHeader/TableRow` — required by the medical panel |
| `packages/ui/src/components/skeleton.tsx` | 204 | `SkeletonRegion`, `SkeletonCard` |
| `apps/web/app/(app)/account/security/events.ts` | 57 | presentation layer: title from core, body from captured UA+IP |
| `apps/web/app/(app)/account/security/page.tsx` | 123 | composes 2FA + passkeys + sessions + events |
| `apps/web/components/account/security-factors.tsx` | 43 | thin DI wiring of the shared 2FA/passkey cards |
| `apps/web/lib/medical-access.ts` | 237 | `resolveMedicalNotesForViewer` — the participant-app half |
| `apps/web/lib/account-sanitize.ts` | (read :190-400) | the erasure runner, incl. the `audit_events.meta` PII scrub |
| `apps/web/app/api/account/deletion-sweep/route.ts` | 80+ | the daily cron (`apps/web/vercel.json`, `0 3 * * *`) |
| `packages/auth/src/account.ts:218-271, :367-392` | — | `recordSecurityEvent`, `listSecurityEvents`, `deviceLabel` (auth pkg, but provider-agnostic bodies) |

### Tests
| File | Lines |
|---|---:|
| `apps/org/lib/__tests__/medical-audit-surface.test.ts` | 361 |
| `apps/org/lib/__tests__/support/fake-db.ts` | 265 |
| `apps/org/lib/__tests__/support/actors.ts` | 106 |
| `apps/org/lib/__tests__/org-rank-enforcement.test.ts` | 702 |
| `apps/org/lib/__tests__/status-board-reads.test.ts` | 217 |
| `apps/org/lib/__tests__/status-board-format.test.ts` | 115 |
| `apps/org/lib/__tests__/roster-privacy.test.ts` | 120 |
| `packages/core/src/__tests__/medical-access.test.ts` | 205 |
| `packages/core/src/__tests__/security-events.test.ts` | 23 |
| `packages/core/src/__tests__/security-notifications.test.ts` | 187 |
| `packages/core/src/__tests__/account-security.test.ts` | 538 |
| `apps/web/lib/__tests__/medical-access-resolver.test.ts` | 308 |
| `e2e/specs/org-staff/medical-notes-access.spec.ts` | 143 |
| `e2e/specs/org-staff/engineer-rank.spec.ts:173-197` | — |

### Docs
- `docs/accounts-security-spec.md:240-355` — the narrative spec for both logs.
- `AGENTS.md:151-187` — the two privacy classes and the medical law, verbatim.
- `packages/core/src/index.ts:31-32, :123-140, :159, :187-192` — the barrel manifest.

---

## 3. Capability list (exhaustive)

### A. Writing the general audit trail
1. **`writeAuditEvent(db, event)`** appends one row; `subject`/`meta` default to `null`
   (`apps/org/lib/audit.ts:11-26`).
2. It takes a **db handle or a transaction handle**, so the audit row commits atomically
   with the change it records (`apps/suppliers/lib/audit.ts:13`, type `DbOrTx`;
   `apps/org/lib/actions/registrations.ts:187-203` shows the update + audit in one `tx`).
3. **`actorId` is nullable and `ON DELETE set null`** (`schema.ts:1712-1714`) — the trail
   survives the actor.
4. **`subject` is `text`, not `uuid`** (`schema.ts:1717`) — it holds registration ids,
   supplier ids, group ids and user ids interchangeably. This is load-bearing: see §7.
5. **The trail is never pruned.** The schema comment at `schema.ts:1723-1733` says
   "`audit_events` is APPEND-ONLY and never pruned, so it is the one table here that only
   ever grows".
6. **Three indexes**, added in migration 0024 after three hot readers were found scanning
   the whole table: `audit_events_actor_idx`, `audit_events_action_idx`,
   `audit_events_subject_idx`, `audit_events_created_at_idx` — the last **DESC**, "to
   match how every reader orders it" (`schema.ts:1721-1735`).

### B. The audited-action vocabulary (45 distinct strings, verified by grep over non-test source)
`rg -n 'action: "[a-z_]+\.[a-z_.]+"' --glob '!**/__tests__/**' --glob '!e2e/**'`:

| Action | Written at |
|---|---|
| `bio.medical.view` | `apps/org/app/(console)/registrations/[id]/members/[userId]/page.tsx:115`; `apps/web/lib/medical-access.ts:85` (constant at `packages/core/src/medical-access.ts:142`) |
| `account.elevate` | `apps/org/lib/session.ts:210`; `apps/web/lib/session.ts:50`; `apps/org/lib/actions/accounts.ts:156` |
| `account.demote` | `apps/org/lib/actions/accounts.ts:157` |
| `account.deletion_requested` | `apps/web/lib/account-actions.ts:978` |
| `account.deletion_cancelled` | `packages/db/src/deletion.ts:134` |
| `account.sanitized` | `packages/core/src/account-sanitization.ts:230,:262` (plan), applied `apps/web/lib/account-sanitize.ts:391` |
| `account.released_holdings` | `apps/web/lib/account-sanitize.ts:378` |
| `registration.approve` / `.reject` / `.request_changes` / `.start_review` / `.withdraw` … | `apps/org/lib/actions/registrations.ts:195` — template literal `` `registration.${input.action}` `` over `REVIEW_ACTIONS` |
| `review.comment` | `apps/org/lib/actions/registrations.ts:253` |
| `bulletin.create` / `bulletin.update` | `apps/org/lib/actions/bulletins.ts:204-207, :246` |
| `bulletin.publish` | `apps/org/lib/actions/bulletins.ts:246, :349` |
| `bulletin.pin` | `apps/org/lib/actions/bulletins.ts:379` |
| `category.create` / `.update` / `.delete` / `.assign` | `apps/org/lib/actions/categories.ts:88, :140, :181, :249` |
| `org.department.create` / `.rename` / `.delete` / `.domains` | `apps/org/lib/actions/org-roles.ts:133, :193, :245, :337` |
| `org.role.create` / `.update` / `.delete` | `apps/org/lib/actions/org-roles.ts:427, :514, :570` |
| `org.roles.assign` | `apps/org/lib/actions/org-roles.ts:653` |
| `questionnaire.definition.create` / `.update` | `apps/org/lib/questionnaires/actions.ts:212, :179` |
| `questionnaire.activate` / `.close` | `apps/org/lib/questionnaires/actions.ts:425, :548` |
| `wrangler.assign` / `.unassign` | `apps/org/lib/actions/wranglers.ts:241, :311` |
| `supplier.add` / `.delete` / `.standing` / `.note` / `.onboarding` | `apps/org/lib/actions/suppliers.ts:315, :406, :62, :244, :169` |
| `supplier.onboarding_step` | `apps/org/lib/supplier-step-reconcile.ts:179`; `apps/suppliers/lib/actions/onboarding.ts:114`; `apps/suppliers/lib/actions/documents.ts:125,:138` |
| `supplier.onboarding_step_reopened` | `apps/org/lib/supplier-step-reconcile.ts:171` |
| `supplier.register` / `.profile_update` | `apps/suppliers/lib/actions/register.ts:206, :310` |
| `supplier.link` | `apps/suppliers/lib/session.ts:198` |
| `supplier.document_ack` | `apps/suppliers/lib/actions/documents.ts:152` |
| `supplier_document.create` / `.update` / `.delete` | `apps/org/lib/actions/supplier-documents.ts:115, :206, :291` |

**The vocabulary is NOT an enum.** `action` is plain `text` and unknown actions fall back
to the raw key (`apps/org/lib/status-board-format.ts:50`). 34 of them have human labels
(`:10-47`); the rest render as dotted keys.

### C. Reading the general trail — `getAuditTrail(actor, limit = 100)`
7. Newest-first, `limit` default 100 (`apps/org/lib/medical-audit.ts:211-233`).
8. **Two things are withheld from a caller who lacks `read_personal_information` in the
   `audit` domain**: the actor's email column is *not selected at all*
   (`:223` — `...(personal ? { actorEmail: schema.users.email } : {})`), and
   `bio.medical.view` rows are excluded **in the WHERE clause**, not after the fetch
   (`:227-231` — `ne(schema.auditEvents.action, MEDICAL_VIEW_AUDIT_ACTION)`).
9. The medical exclusion exists because those rows carry a subject id + every console rank
   can open a member page + a row only exists when the subject HAS notes ⇒ walking the
   trail would rebuild the disclosure census (`:199-210`).

### D. Reading the medical access log — `getMedicalAccessLog(actor, options)`
10. **Fails closed by throwing**, not by returning a redacted list: `"Not authorised to read
    the medical access log."` (`apps/org/lib/medical-audit.ts:116-120`). Rationale in the
    comment: *"there is no version of these rows that is not still a disclosure census"*.
11. Lookback default **30 days** (`MEDICAL_AUDIT_LOOKBACK_DAYS = 30`, `:29`); overridable
    via `options.lookbackDays`.
12. Hard row cap **500** (`MEDICAL_AUDIT_ROW_CAP = 500`, `:32`), clamped with
    `Math.min(options.limit ?? 500, 500)` (`:122-125`).
13. `truncated` is `rows.length >= limit` (`:186`) so the page can say the view is partial.
14. **Subject names are resolved in a SECOND query** over only the ids that match a UUID
    regex (`UUID_RE`, `:34-35`; used at `:150-152`). Casting the `text` column in a join
    "would let one malformed historical row error the whole page, and this page must always
    render" (`:107-110`).
15. Names go through `publicMemberName(username, {sanitizedAt})` so a deleted actor renders
    as `"Departed Burner"` (`:169`; `packages/core/src/username.ts:250-257`).
16. `meta.basis` is **allow-listed, not echoed**: only `"self" | "org_staff" | "camp_lead"`
    survive `parseBasis`; anything else becomes `null` (`:59-66`).

### E. The permission that guards the medical panel
17. `canReadMedicalAccessLog(actor) = canReadPersonalInformationIn(actor, "audit")`
    (`apps/org/lib/medical-audit.ts:91-93`).
18. **It asks the `audit` DOMAIN specifically, not "anywhere"** — a department-scoped grant
    (e.g. a Suppliers lead with `personal_information`) does **not** open a console-wide
    census (`:84-89`). `"audit"` is one of 8 members of `ORG_DOMAINS`
    (`packages/core/src/org-domains.ts:72-81`).
19. `ENGINEER_RANK_CARVE_OUTS` means the `engineer` rank can **never** resolve
    `read_personal_information`, whatever role it holds — so an engineer is refused the
    panel by rank, and told so (`packages/core/src/org-permissions.ts:632-640`;
    e2e proof at `e2e/specs/org-staff/engineer-rank.spec.ts:173-197`).
20. The refusal card renders `orgCapabilityRefusal(actor, "personal_information", "audit")`
    — the *server's own sentence*, not a second copy
    (`apps/org/app/(console)/audit/page.tsx:82`).

### F. The medical read itself (the thing being audited)
21. `canViewMedicalNotes(ctx)` — pure, fail-closed. Three grants, in order:
    self → org safety tier → camp-lead intersection
    (`packages/core/src/medical-access.ts:114-122`).
22. Camp-lead grant requires **set intersection** of `actorLeadCampIds` × `subjectCampIds`
    (`:117-121`) — a lead of camp A is refused for a member of camp B.
23. `medicalAccessBasis(ctx)` returns `"self" | "org_staff" | "camp_lead" | null` and is
    what lands on the audit row (`:128-135`).
24. **Authorise, then select.** Both resolvers run the predicate *before* the query that
    would read the ciphertext, so a refusal never loads plaintext into render scope
    (`apps/org/app/(console)/registrations/[id]/members/[userId]/page.tsx:76-104` — the
    comment at `:73-79` states this explicitly; `apps/web/lib/medical-access.ts:45-58`).
25. **Audit only an actual disclosure**: `if (medicalNotes && !ctx.isSelf)` — reading your
    own notes is not an access event, and an empty field discloses nothing
    (`page.tsx:111`; `apps/web/lib/medical-access.ts:79`).
26. **Written in `after()`, off the critical path**, and the catch is swallowed to
    `console.error("[medical-access] audit write failed", err)`
    (`page.tsx:113-120`; `apps/web/lib/medical-access.ts:81-92`).
27. **Fail-open by design**, and the spec says so out loud: a dropped instance or DB blip
    yields a *silent, unlogged disclosure*, and that is the accepted trade because "an
    emergency medic read MUST NOT be blocked by an audit write"
    (`docs/accounts-security-spec.md:284-289`).
28. **No rate limit on this path, on purpose** — a throttle fails closed in an emergency
    (`docs/accounts-security-spec.md:329-331`).
29. **No per-view notification to the subject** — removed deliberately; "notifying a burner
    every time their camp lead opens their profile is noise, not consent"
    (`docs/accounts-security-spec.md:335-338`).
30. Three-state result, not two: `{ visible, notes, unreadable }` — ciphertext we cannot
    decrypt must not present as "this burner recorded nothing"
    (`apps/web/lib/medical-access.ts:41, :59-64`).

### G. The glance feed vs. the record
31. `FEED_EXCLUDED_ACTIONS = [MEDICAL_VIEW_AUDIT_ACTION]` — exactly one entry
    (`apps/org/lib/status-board-format.ts:79-81`), and a test asserts *nothing else is in
    it* (`medical-audit-surface.test.ts:93-95`).
32. The exclusion is applied **in SQL** (`notInArray`, `apps/org/lib/status-board.ts:77`) —
    a JS filter after `limit 6` would return fewer than six rows during a burst
    (`medical-audit-surface.test.ts:97-103` pins this by source match).
33. `getRecentActivity` also withholds `actorEmail` unless
    `canReadPersonalInformationIn(actor, "audit")` (`status-board.ts:66, :73`).
34. `activityTone(action)` → `"approve" | "attention" | "reject" | "neutral"`;
    `bio.medical.view` gets `"attention"` (`status-board-format.ts:56-67`).

### H. The subject-facing security-event feed
35. `recordSecurityEvent(headers, userId, kind)` — best-effort append; splits
    `x-forwarded-for` on `,` and takes `[0].trim()`, falls back to `x-real-ip`, reads
    `user-agent`, **swallows every error** (`packages/auth/src/account.ts:218-232`).
36. `listSecurityEvents(userId, limit = 10)` — newest first, scoped by the *caller passing
    their own id*, returns `[]` on any read failure so the page degrades rather than breaks
    (`packages/auth/src/account.ts:252-271`).
37. **No display strings in the DB.** Titles come from `describeSecurityEvent(kind)`
    (`packages/core/src/security-events.ts:31-33`) so "a wording change never needs a
    migration" (`:6-8`).
38. The body line is composed app-side from the captured context:
    `deviceLabel(userAgent) + " · " + ip` (`apps/web/app/(app)/account/security/events.ts:38-43`).
39. `deviceLabel(userAgent)` — a hand-rolled 26-line UA classifier; **order matters**
    (Edge and Chrome both claim Safari) (`packages/auth/src/account.ts:367-392`).
40. The card **names what it does NOT contain** — new-device sign-ins are not wired, so the
    session list is the check (`apps/web/app/(app)/account/security/page.tsx:109-119`;
    the component comment at `packages/ui/src/components/account-security-events.tsx:20-24`
    explains why the note is a prop rather than hardcoded).

### I. Erasure interaction (POPIA)
41. `security_events` is one of three **purged** tables on sanitization, because the
    captured IP/UA is personal data
    (`SANITIZATION_PURGED_TABLES = ["profile_keys","email_change_requests","security_events"]`,
    `packages/core/src/account-sanitization.ts:187-191`; applied at
    `apps/web/lib/account-sanitize.ts:209-211`).
42. `audit_events` is **preserved** — "POPIA erasure does not require forgetting that an
    actor existed" — but its `meta` is surgically scrubbed of three email keys with raw SQL
    (`apps/web/lib/account-sanitize.ts:338-356`). The comment records that **32 such rows
    existed on the live database** when this was found.
43. Sanitization writes its own proof row, `account.sanitized`, with
    `meta = {reason:"deletion_grace_elapsed", bioRows, membershipsPreserved, stub}`
    (`packages/core/src/account-sanitization.ts:260-268`) — "an erasure with no record of
    having happened is indistinguishable from data loss" (`:238-242`).
44. And a second row, `account.released_holdings`, recording org-role ids / supplier ids /
    wrangler group ids released — **ids only, no email, no name**
    (`apps/web/lib/account-sanitize.ts:357-388`). The comment documents that an earlier
    version's claim to audit these was *false*.
45. `cancelPendingDeletion` writes `account.deletion_cancelled` **inside the same
    transaction** as the status flip, with the status predicate in the `WHERE` acting as the
    concurrency guard against a double-cancel (`packages/db/src/deletion.ts:111-138`).

---

## 4. Data model — verbatim

### `audit_events` (`packages/db/src/schema.ts:1708-1737`)
```ts
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    subject: text("subject"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (a) => ({
    actorIdx: index("audit_events_actor_idx").on(a.actorId),
    actionIdx: index("audit_events_action_idx").on(a.action),
    subjectIdx: index("audit_events_subject_idx").on(a.subject),
    createdAtIdx: index("audit_events_created_at_idx").on(a.createdAt.desc()),
  }),
);
```
Original DDL, `packages/db/migrations/0000_stormy_raider.sql:17-24`:
```sql
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
```

### `security_event_kind` pgEnum (`packages/db/src/schema.ts:203-218`) — 9 values
```ts
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

### `security_events` (`packages/db/src/schema.ts:2026-2047`)
```ts
export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: securityEventKindEnum("kind").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (e) => ({
    userCreatedIdx: index("security_events_user_created_idx").on(
      e.userId,
      e.createdAt.desc(),
    ),
  }),
);
```
DDL: `packages/db/migrations/0014_lumpy_gargoyle.sql:10-17`, FK at `:21`.

### Zod mirrors (`packages/types/src/accounts.ts`)
```ts
// :98-110 — OUTBOUND notification kinds (Resend). 10 values, NOT the same set.
export const SecurityEventKind = z.enum([
  "password_changed", "password_reset_completed", "email_change_requested",
  "email_change_completed", "email_change_revoked", "new_device_sign_in",
  "session_revoked", "deletion_requested", "deletion_cancelled",
  "deletion_completed",
]);

// :122-133 — the LOG kinds. 9 values, mirrors the pgEnum exactly.
export const SecurityEventLogKind = z.enum([
  "password_changed", "password_reset_completed", "session_revoked",
  "sessions_revoked_others", "email_change_requested",
  "email_change_confirmed", "email_change_revoked",
  "deletion_requested", "deletion_cancelled",
]);
```
**Two enums, deliberately different.** `SecurityEventKind` (10) has
`email_change_completed`, `new_device_sign_in`, `deletion_completed` which the LOG does
not; `SecurityEventLogKind` (9) has `sessions_revoked_others` and
`email_change_confirmed` which the notification set does not. A port that collapses them
loses that distinction.

### Adjacent enums
- `notification_kind` includes `"security"` (`schema.ts:229-237`; Zod
  `packages/types/src/notifications.ts:16-24`) — 7 values:
  `registration, wrangler, role, questionnaire, supplier, security, bulletin`.
- `MedicalAccessBasis = "self" | "org_staff" | "camp_lead"`
  (`packages/core/src/medical-access.ts:126`) — a TS union, **not** a pgEnum; it lives in
  `audit_events.meta.basis` as free JSON and is allow-listed on read.
- `ORG_DOMAINS` (`packages/core/src/org-domains.ts:72-81`): `registrations, suppliers,
  supplier_documents, questionnaires, bulletins, camp_categories, accounts, audit`.

---

## 5. Public API surface — verbatim signatures

```ts
// apps/org/lib/audit.ts:11-19  (and the near-identical apps/suppliers/lib/audit.ts:13-21)
export async function writeAuditEvent(
  db: DbHandle,
  event: {
    actorId: string;
    action: string;
    subject?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void>

// apps/org/lib/medical-audit.ts
export const MEDICAL_AUDIT_LOOKBACK_DAYS = 30;              // :29
const MEDICAL_AUDIT_ROW_CAP = 500;                          // :32  (module-private)
export interface MedicalReadRow {                           // :38-50
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  subjectId: string | null;
  subjectName: string | null;
  basis: MedicalAccessBasis | null;
  createdAt: Date;
}
export interface MedicalAccessLog {                          // :52-57
  rows: MedicalReadRow[];
  truncated: boolean;
  lookbackDays: number;
}
export function canReadMedicalAccessLog(actor: OrgActor): boolean;               // :91
export async function getMedicalAccessLog(
  actor: OrgActor,
  options: { lookbackDays?: number; limit?: number } = {},
): Promise<MedicalAccessLog>;                                                    // :112
export interface AuditTrailRow {                                                 // :191-197
  id: string;
  action: string;
  actorEmail: string | null;
  subject: string | null;
  createdAt: Date;
}
export async function getAuditTrail(
  actor: OrgActor,
  limit = 100,
): Promise<AuditTrailRow[]>;                                                     // :211

// packages/core/src/medical-access.ts
export function isOrgStaffRole(role: MembershipRole | null | undefined): boolean; // :62
export interface MedicalAccessContext {                                           // :90-96
  isSelf: boolean;
  actorOrgRole: MembershipRole | null;
  actorOrgPersonalInformation?: boolean;
  actorLeadCampIds: readonly string[];
  subjectCampIds: readonly string[];
}
export function canViewMedicalNotes(ctx: MedicalAccessContext): boolean;          // :114
export type MedicalAccessBasis = "self" | "org_staff" | "camp_lead";              // :126
export function medicalAccessBasis(ctx: MedicalAccessContext): MedicalAccessBasis | null; // :128
export const MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view";                      // :142

// packages/core/src/security-events.ts
export const SECURITY_EVENT_TITLES: Readonly<Record<SecurityEventLogKind, string>>; // :16
export function describeSecurityEvent(kind: SecurityEventLogKind): string;          // :31

// packages/auth/src/account.ts   (provider-agnostic bodies; see §9)
export async function recordSecurityEvent(
  headers: Headers, userId: string, kind: SecurityEventLogKind,
): Promise<void>;                                                                   // :218
export interface SecurityEventView {                                                // :234-240
  id: string; kind: SecurityEventLogKind; ip: string | null;
  userAgent: string | null; createdAt: Date;
}
export async function listSecurityEvents(
  userId: string, limit = 10,
): Promise<SecurityEventView[]>;                                                    // :252
export function deviceLabel(userAgent: string | null): string;                      // :367

// apps/web/app/(app)/account/security/events.ts
export interface SecurityEvent { id: string; title: string; body: string | null; createdAt: Date; } // :30
export async function listSecurityEvents(userId: string, limit = 10): Promise<SecurityEvent[]>;      // :46

// apps/web/lib/medical-access.ts:37-41
export async function resolveMedicalNotesForViewer(input: {
  viewerUserId: string;
  subjectUserId: string;
  editionId: string;
}): Promise<{ visible: boolean; notes: string | null; unreadable: boolean }>

// apps/org/lib/status-board-format.ts
export function activityLabel(action: string): string;                              // :49
export type ActivityTone = "approve" | "attention" | "reject" | "neutral";           // :53
export function activityTone(action: string): ActivityTone;                          // :56
export const FEED_EXCLUDED_ACTIONS: readonly string[];                               // :79
export function isFeedAction(action: string): boolean;                               // :84
export function relativeTime(value: Date, now: Date = new Date()): string;           // :89

// apps/org/lib/status-board.ts
export interface ActivityRow { id: string; action: string; actorEmail: string | null;
  meta: Record<string, unknown> | null; createdAt: Date; }                           // :34-40
export async function getRecentActivity(actor: OrgActor, limit = 6): Promise<ActivityRow[]>; // :61

// packages/ui/src/components/account-security-events.tsx
export interface SecurityEventRow { id: string; title: string; body: string | null; createdAt: Date; } // :26
export function AccountSecurityEvents({
  events, note, emptyDescription = "Password changes, password resets and sign-outs all land here the moment they happen.",
}: {
  events: readonly SecurityEventRow[];
  note?: React.ReactNode;
  emptyDescription?: string;
}): JSX.Element;                                                                     // :41-49

// apps/org/components/audit/*.tsx
export function MedicalAccessPanel({ log, displayLimit = 50 }:
  { log: MedicalAccessLog; displayLimit?: number }): JSX.Element;                    // medical-access-panel.tsx:80-86
export function AuditTrailList({ rows }: { rows: AuditTrailRow[] }): JSX.Element;    // audit-trail-list.tsx:34
```

---

## 6. UX behaviours

### `/audit` page (`apps/org/app/(console)/audit/page.tsx`)
- `export const dynamic = "force-dynamic"` (`:44`).
- Gate: `guardConsole()` → any org rank with `read` (`:47-48`; `apps/org/lib/gate.tsx:47-60`).
- **The two fetches are parallel and the medical one is conditional**:
  `Promise.all([seesMedical ? getMedicalAccessLog(actor) : null, getAuditTrail(actor, 100)])`
  (`:52-56`) — the check precedes the fetch, and `org-rank-enforcement.test.ts:511-521`
  asserts the source ordering.
- **The page description changes with clearance** (`:64-68`): with medical, *"Medical-notes
  reads are listed first because that is the record people ask about — not because anyone
  is being watched."*; without, just *"Who did what, and when."*
- **Refusal is a card, not a blank.** A `Lock` icon, the title "Medical-notes reads", the
  server's own refusal sentence as the description, and a body paragraph explaining *why*
  it is withheld whole rather than blanked (`:73-90`).
- **`loading.tsx` mirrors the page container exactly** — `flex flex-col gap-6`,
  `ConsoleHeadingSkeleton` + `SkeletonCard lines={2}` + `ConsoleTableSkeleton rows={10}
  columns={5} filters={false}` (`loading.tsx:12-21`).

### `MedicalAccessPanel`
- Five columns: **Who looked · Whose notes · Authority · When · Ago** (`:120-126`).
- `BASIS_LABEL = { self: "Own notes", org_staff: "Org staff", camp_lead: "Camp lead" }` (`:40-44`).
- Basis renders as a `Badge`, `variant="secondary"` for `camp_lead`, `"outline"` otherwise;
  `null` renders an em-dash (`:60-66`).
- **`<TableCaption className="sr-only">`** — added because the page rendered two tables and
  a screen reader announced "table" twice with nothing to tell them apart, *"on the one page
  whose whole purpose is answering 'who saw my medical information?'"* (`:110-118`).
- Actor display is the **local part of the email only** (`email.split("@")[0]`, `:47-50`),
  falling back to `"Unknown actor"`.
- Default `displayLimit = 50`, and when more were loaded or the 500-cap was hit it says so:
  *"Showing the N most recent of M loaded — the window holds more than the console loads at
  once, so counts above cover the loaded rows only."* (`:134-141`).
- Empty state: *"Nobody has opened a burner's medical notes in this window."* (`:105-107`).

### `AuditTrailList`
- Coloured tone dot + `actorName` + `activityLabel(action)` + `formatDateTime` in a `<time>`
  with `dateTime={createdAt.toISOString()}` (`:59-78`).
- `TONE_DOT = { approve: "bg-ab-sage", attention: "bg-ab-apricot", reject: "bg-destructive",
  neutral: "bg-muted-foreground" }` (`:22-27`) — **two raw AfrikaBurn brand tokens**, see §9.
- Fallback actor name is `"Staff"` (`:29-32`).
- Empty state: *"Nothing has happened in the console yet."* (`:49-51`).

### `RecentActivity` (the 6-row glance)
- Header row with a **"Audit log →" link to `/audit`** (`recent-activity.tsx:36-42`).
- Same tone dots; uses `relativeTime` rather than absolute (`:73`).

### `AccountSecurityEvents` (subject-facing)
- Card title *"Recent security events"*, description *"What's happened to your account. We
  email you when these occur."* (`:53-56`).
- Rows: bold title, optional muted body, right-aligned date via
  `toLocaleDateString("en-ZA", {day:"numeric", month:"short", year:"numeric"})` (`:33-39`).
- The `note` slot renders in a **dashed-border, muted card** at the bottom (`:86-90`) — and
  apps/web passes a paragraph that *names the gap*: new-device sign-in alerts are not
  switched on ("we'd have to remember every device you've used, and we don't"), so the
  session list is the reliable check (`page.tsx:109-119`).

---

## 7. Validation + edge-case rules, digit-exact

| Rule | Value | Source |
|---|---|---|
| Medical audit lookback | **30 days** | `medical-audit.ts:29` |
| Medical audit row cap (hard) | **500** | `medical-audit.ts:32` |
| Limit clamp | `Math.min(limit ?? 500, 500)` | `medical-audit.ts:122-125` |
| Panel display limit | **50** | `medical-access-panel.tsx:82` |
| `getAuditTrail` default limit | **100**; page passes `100` | `medical-audit.ts:213`; `page.tsx:55` |
| Glance feed limit | **6** | `status-board.ts:63` |
| `listSecurityEvents` default limit | **10** | `packages/auth/src/account.ts:253` |
| Deletion grace period | **14 days** | `account-security.ts:152` |
| Email-change confirm TTL | **2 hours** | `account-security.ts:432` |
| Email-change revocation window | **48 hours** | `account-security.ts:435` |
| Password min / max length | **15 / 64** (NIST SP 800-63B-4) | `account-security.ts:25, :28` |
| Password strength bands | `>=24` strong, `>=18` good, else fair | `account-security.ts:74-75` |
| ID-retention grace after edition end | **30 days** | `id-retention.ts:40` |
| Deletion-sweep cron | `0 3 * * *` | `apps/web/vercel.json` |
| `FEED_EXCLUDED_ACTIONS` size | **exactly 1** | `status-board-format.ts:79-81` + test `:93-95` |
| `relativeTime` thresholds | `<60s` "just now"; `<60min` "N min ago"; `<24h` "N h ago"; `<30d` "N d ago"; else "N mo ago" | `status-board-format.ts:89-103` |
| Truncation predicate | `rows.length >= limit` | `medical-audit.ts:186` |

**Edge cases the code handles explicitly:**
1. `audit_events.subject` is `text` and holds non-UUID legacy keys → name lookup is
   filtered by `UUID_RE` and the page still renders (`medical-audit.ts:34-35, :148-154`;
   test `medical-audit-surface.test.ts:251-267`).
2. `meta.basis` is untrusted jsonb → allow-listed to three values, everything else `null`
   (`medical-audit.ts:59-66`; test `:230-249` seeds `"because I said so"` and asserts `null`).
3. Sanitized subject → `"Departed Burner"` (`medical-audit.ts:169`; test `:216-228`).
4. Deleted actor → `actorId` is `null` (FK `set null`), `actorEmail` is `null`, panel shows
   `"Unknown actor"` / trail shows `"Staff"`.
5. Over-large `limit` → clamped, and `truncated` is then `false` when no rows come back
   (test `:283-288`).
6. `getMedicalAccessLog` on a refused actor **issues no query at all** — the test asserts
   `db.calls` is `[]` (`:190-197`).
7. `recordSecurityEvent` with no request context → `ip`/`userAgent` both `null`, insert
   still happens (`packages/auth/src/account.ts:225-231`).
8. `listSecurityEvents` with no DB configured → returns `[]` (`:256`); on a thrown read →
   `[]` (`:270-273`).
9. `deviceLabel(null)` → `"Unknown device"`; unknown OS/browser → `"Unknown OS"` /
   `"browser"` (`packages/auth/src/account.ts:367-392`).
10. `formatDateTime` on `null`/invalid → `"—"` (`apps/org/lib/labels.ts`).
11. `cancelPendingDeletion` double-cancel race → the `status = 'pending'` predicate in the
    `UPDATE … WHERE` is the guard; zero rows updated ⇒ no audit row
    (`packages/db/src/deletion.ts:118-131`).
12. `deletionCancelledNotification`'s link is `/account`, which **only exists in apps/web**;
    the row is stamped `linkApp: "web"` so the console and portal render it non-clickable
    (`packages/db/src/deletion.ts:158-181`). A three-app problem Camp 404 does not inherit —
    but the *pattern* (stamping which app a deep link belongs to) is worth knowing about.

---

## 8. Test coverage

**Unit — the medical-audit contract (`apps/org/lib/__tests__/medical-audit-surface.test.ts`, 361 lines).**
Two halves, deliberately: source-text assertions ("the guard is written") and executed
assertions ("the guard runs"). Its own header says *"a refactor that keeps the words and
changes the object passes the first and fails the second"* (`:9-12`).
- `stripComments()` helper (`:47-49`) so the *prose explaining why there is no threshold*
  doesn't fail the *test asserting there is no threshold* (`:119-124`).
- Pins the **absence** of `summarizeMedicalAccess|detectMedicalEnumeration|threshold|alert`
  in the reader and the panel, and of `MedicalAccessStrip|getMedicalAccessGlance` on the
  overview and status pages (`:114-135`).
- Pins that the panel contains neither `medicalNotes` nor `decrypt` (`:144-148`).
- Pins the SQL-side exclusion by regex on the source (`:97-103`).
- Executed: fail-closed with zero queries, basis allow-list, UUID-only name resolution,
  truncation, clamping, custom lookback, and the granted/refused projection pair
  (`:185-361`).

**Unit — `packages/core/src/__tests__/medical-access.test.ts` (205 lines).**
Nine `canViewMedicalNotes` cases including the cross-camp refusal and the "console door is
not the safety tier" case (`:76-85`); pins `MEDICAL_VIEW_AUDIT_ACTION === "bio.medical.view"`
(`:119-123`); pins that `MEDICAL_AUDIENCE_NOTE` names both audiences, because *"the honest
label IS the privacy control in this model"* (`:126-143`); and a projection regression that
was **rewritten because the previous version was structurally incapable of failing**
(`:169-196`) — a genuinely instructive test-quality artefact.

**Unit — `packages/core/src/__tests__/security-events.test.ts` (23 lines).**
Two assertions: every `SecurityEventLogKind` has a non-empty title, and
`Object.keys(SECURITY_EVENT_TITLES).sort()` equals the enum's options sorted — a **drift
guard between the Zod enum, the pgEnum and the label map**.

**Unit — `packages/core/src/__tests__/security-notifications.test.ts` (187 lines).**
Builds `ALL_NOTIFICATIONS` (9) and `ALL_EMAILS` (10) as arrays and runs every one through
`securityMessageLeaks` against forbidden values (`:28-60`) — the leak guard applied
exhaustively rather than per-builder.

**Unit — `apps/org/lib/__tests__/org-rank-enforcement.test.ts:494-535`.**
Source-level: `canReadMedicalAccessLog` must literally contain
`canReadPersonalInformationIn(actor, "audit")`; `getMedicalAccessLog` must contain both the
guard call and `throw new Error`; the page's `canReadMedicalAccessLog` index must be **less
than** its `getMedicalAccessLog` index; the page must contain `orgCapabilityRefusal`.

**Unit — `apps/org/lib/__tests__/status-board-reads.test.ts` (217 lines)** and
`status-board-format.test.ts` (115) — feed exclusion at the query layer and at the pure layer.

**Test harness — `apps/org/lib/__tests__/support/fake-db.ts` (265 lines).** See §11; this is
one of the most portable assets in the whole unit.

**Fixtures — `apps/org/lib/__tests__/support/actors.ts` (106 lines).** `GOD`, `READER`,
`PERSONAL_READER`, `SUPPLIERS_LEAD`, `CAMPS_LEAD`, `NO_ROLES` over a deliberately
*half-configured* deployment where `audit`, `accounts` and `questionnaires` are **unowned**
— "the state a real console spends its first week in and the one most likely to be got
wrong" (`:9-21`).

**E2E — `e2e/specs/org-staff/medical-notes-access.spec.ts` (143 lines).** Walks the whole
path: burner writes notes → lead invites → registration submitted → org staff opens member
detail → notes visible → `/audit` shows the row **scoped to the medical panel's own
accessible table name**, with the basis `"Org staff"` → and asserts the notes themselves
have `toHaveCount(0)` on the audit page (`:106-141`). Polls with `toPass({timeout: 30_000})`
because the row lands in `after()` (`:115-126`).

**E2E — `e2e/specs/org-staff/engineer-rank.spec.ts:173-197`.** The engineer opens `/audit`,
sees the heading, and is shown the *rank* refusal verbatim.

---

## 9. Dependency footprint

**Zero new npm packages.** Everything in this unit is drizzle + React + `lucide-react`
icons + the workspace's own `@quagga/ui` primitives.

| Need | Donor source | Camp 404 status |
|---|---|---|
| `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` | `@quagga/ui/components/card` | **present** (`packages/ui/src/components/card.tsx`) — note donor `CardTitle` is `text-lg`, target `text-2xl` |
| `Badge` | `@quagga/ui/components/badge` | **present**; donor uses `bg-success/20`, target `/15` |
| `EmptyState` | `@quagga/ui/components/empty-state` | **present**, but donor's takes `action?: ReactNode` and target's takes `children` |
| `Table`* family (7 exports) | `packages/ui/src/components/table.tsx` (118 lines) | **ABSENT** — must be ported |
| `SkeletonRegion`, `SkeletonCard` | `packages/ui/src/components/skeleton.tsx` (204 lines) | **ABSENT** — must be ported (and Camp 404 has zero `loading.tsx` anywhere, WP7 #131) |
| Icons | `lucide-react`: `Lock`, `ScrollText`, `Stethoscope`, `ArrowRight` | present; target lucide is 1.16.0, all four exist |
| `after` | `next/server` | Next 16 on both sides — available |
| drizzle ops | `and, desc, eq, gte, inArray, ne, notInArray, isNotNull, sql` | all present, same drizzle 0.45.2 |
| Tailwind tokens | `bg-ab-sage`, `bg-ab-apricot` | **ABSENT in Camp 404** — donor-only raw brand ramp (`packages/ui/src/styles/globals.css:42-49`). These will compile to nothing. Retoken to Camp 404 semantics. |

**Workspace couplings to break:**
- `apps/org/lib/medical-audit.ts` imports `canReadPersonalInformationIn`, `OrgActor`,
  `publicMemberName`, `MEDICAL_VIEW_AUDIT_ACTION`, `MedicalAccessBasis` from `@quagga/core`
  (`:5-10`).
- `packages/core/src/security-events.ts` imports only `SecurityEventLogKind` from
  `@quagga/types` (`:10`) — the cleanest module in the unit.
- `packages/core/src/medical-access.ts` imports only `MembershipRole` from `@quagga/types`
  (`:34`).
- `apps/org/lib/audit.ts` and `apps/suppliers/lib/audit.ts` import `"server-only"` — Camp
  404's `apps/web/vitest.config.ts` has **no `server-only` alias stub**, so these will throw
  the moment a Camp 404 vitest test imports them. The donor stubs it in every app's
  vitest config.

---

## 10. AfrikaBurn / multi-tenant coupling — what Camp 404 must collapse

**Ranked from cleanest to worst.**

### Clean — no coupling at all (drop-in after a scope rename)
- `packages/core/src/security-events.ts` (33 lines). Depends on one type. **Zero** group,
  edition, org or supplier references. The `SECURITY_EVENT_TITLES` strings are
  product-neutral ("Password changed", "A device was signed out").
- `packages/ui/src/components/account-security-events.tsx` (94 lines). Pure props; the only
  AfrikaBurn-ish thing is the `en-ZA` locale in `formatDate` (`:34`) — which Camp 404, also
  a South African camp, likely wants anyway.
- `apps/org/lib/audit.ts` / `apps/suppliers/lib/audit.ts` (26/28 lines). `writeAuditEvent`
  has no tenant parameter whatsoever.
- The `audit_events` and `security_events` **tables themselves**. Neither carries a
  `group_id`, `edition_id` or tenant column. `audit_events.subject` is a bare `text`.

### Light — one enum/label swap
- `apps/org/lib/status-board-format.ts`. `ACTIVITY_LABELS` is 34 AfrikaBurn-domain entries
  (`registration.approve`, `supplier.standing`, `org.department.create`…). The **shape** is
  the asset; the vocabulary is entirely replaceable with Camp 404's own
  (`approval.approve`, `promotion.send`, `team.assign`, `questionnaire.publish`…). The tone
  dots use two `ab-*` brand classes.
- `MedicalAccessBasis` labels — `"Org staff"` / `"Camp lead"` become Camp 404's
  `"Captain"` / `"Team lead"`.

### Medium — the org/participant fork is in the *permission call*, not the query
- `getAuditTrail` / `getMedicalAccessLog` / `getRecentActivity` each call
  `canReadPersonalInformationIn(actor, "audit")` — a function from the donor's **entire
  second permission system** (`org_departments` / `org_roles` / `org_role_assignments` /
  `org_department_domains`, migrations 0018/0019). Camp 404 has none of that.
  **The collapse is mechanical**: replace the one call with
  `hasClearance(viewerRank, "captain")` from `@camp404/core/access`. The *structure* —
  "decide at the select, not in the JSX", and "the trail excludes the sensitive action for
  a refused caller" — ports unchanged. Everything else in these three functions is
  tenant-free drizzle.
- `orgCapabilityRefusal(actor, "personal_information", "audit")` on the refusal card
  produces AfrikaBurn-specific copy naming departments and the "System manager" rank. Camp
  404 needs its own one-liner; the *pattern* (server's own refusal sentence, not a second
  copy in the JSX) is what to keep.

### Heavy — the medical predicate is genuinely org-coupled
- `MedicalAccessContext.actorOrgPersonalInformation` (`packages/core/src/medical-access.ts:93`)
  exists **only** because reviewers are a different organisation from the reviewed. Its doc
  comment (`:74-84`) explicitly says the value must be
  `canReadPersonalInformationIn(actor, "registrations")`. Camp 404 collapses this to: the
  actor is a captain.
- `actorLeadCampIds` × `subjectCampIds` intersection (`:117-121`) is the *multi-camp* half —
  "a lead of camp A is refused for a member of camp B". **Camp 404 is one camp**, so this
  collapses to a team-membership intersection (`team_memberships`) if you want team-lead
  scoping, or drops entirely if only captains read sensitive data.
- `apps/web/lib/medical-access.ts:103-228` — `buildMedicalAccessContext` is 125 lines, of
  which ~90 are org-group discovery, org-role-assignment joins and department-ownership
  resolution. **In Camp 404 this becomes about 10 lines.** The valuable residue is the
  three-state return (`visible/notes/unreadable`) and the "authorise, then select" ordering.

### Also coupled (drop rather than port)
- `editions` — `burner_bios` is user × edition, and `getMedicalAccessLog` doesn't touch it,
  but the *subject page* it audits does. Camp 404 has no edition dimension.
- The **duplicate `writeAuditEvent`** in `apps/suppliers/lib/audit.ts` is a symptom of the
  three-app split (`docs/simplification-audit.md:58-60`: "apps/org and apps/suppliers are
  close to being the same application twice"). Camp 404 gets **one** copy, in
  `packages/db/src/audit.ts`.
- The `apps/web` **private duplicate of `recordSecurityEvent`** (`apps/web/lib/account-actions.ts:115-131`,
  called from 8 sites) versus the shared `packages/auth/src/account.ts:218` — the donor's own
  audit calls this out at `docs/simplification-audit.md:659-676`. **Port the shared one; the
  duplicate is a known defect.**

---

## 11. Notable patterns worth stealing even if the code isn't

1. **Decide at the SELECT, never in the JSX.** The projection is built conditionally
   (`...(personal ? { actorEmail: schema.users.email } : {})`), so a refused caller's row
   *does not contain the key at all*. The `fakeDb` harness applies the projection precisely
   so `"actorEmail" in row` is a real assertion (`fake-db.ts:23-32`).
2. **Filter in SQL, not after `limit`.** A JS filter after `limit 6` returns fewer than six
   rows during a burst — "the eviction bug in a different costume"
   (`medical-audit-surface.test.ts:98-99`).
3. **Fail closed by throwing, when there is no honest redacted view.** `getMedicalAccessLog`
   refuses rather than returning a filtered list, because *any* subset of the rows is still
   a disclosure census (`medical-audit.ts:116-120`).
4. **The audit write is atomic with the change it records** — same `tx` handle
   (`registrations.ts:187-203`) — *except* on the fail-open path, where it is deliberately
   `after()` + swallowed. Two opposite disciplines, each documented with its reason.
5. **No display strings in the database.** The typed `kind` is stored; the wording lives in
   pure code, so a copy change never needs a migration
   (`packages/core/src/security-events.ts:6-8`).
6. **A drift-guard test between enum, pgEnum and label map** — three-line test, catches the
   whole class (`security-events.test.ts:18-22`).
7. **Name what the log does NOT contain.** "a security log that quietly omits a category
   trains the reader to trust a completeness it does not have"
   (`account-security-events.tsx:20-24`); the `note` is a prop so each app supplies its own
   honest gap statement.
8. **Source-text tests + executed tests, deliberately paired.** Neither replaces the other
   (`medical-audit-surface.test.ts:9-12`).
9. **Pin the ABSENCE of a removed feature.** The enumeration detector was built and removed;
   a test now fails if anyone re-adds `threshold|alert|detectMedicalEnumeration`. That is a
   *product decision encoded as a regression test*
   (`medical-audit-surface.test.ts:114-135`).
10. **`stripComments()` before source assertions** so the prose explaining a decision doesn't
    trip the test enforcing it (`medical-audit-surface.test.ts:47-49`).
11. **Accessible table names on a page with two tables.** `<TableCaption className="sr-only">`
    added because a screen reader announced "table" twice
    (`medical-access-panel.tsx:110-118`), and the e2e spec then uses that name to scope its
    assertions (`medical-notes-access.spec.ts:111-113`).
12. **Erasure that is provable.** Preserve the trail, scrub only the PII keys out of `meta`
    with targeted SQL, and write a proof row recording *that* erasure happened
    (`account-sanitize.ts:338-395`). The comment records a real production finding: 32 rows
    with a live email address survived erasure.
13. **A failed erasure is not a successful cron run** — log each failure and answer 500 so
    the scheduler's own alerting sees it (`deletion-sweep/route.ts:74-80`).
14. **Timing-safe bearer comparison with a length pre-check** for the destructive cron
    (`deletion-sweep/route.ts:42-48`).
15. **`fakeDb` — a table-keyed drizzle-builder fake** (`fake-db.ts`, 265 lines). Records
    op/table/columns/values/where/methods per chain; the transaction handle is the same fake
    so one call log covers both. Its own header states exactly what it proves (projection,
    authorisation, mapping) and what it cannot (any SQL semantics) — *"a green test here must
    never be reported as evidence that a query is correct"* (`:13-21`). Camp 404 already has
    a PGlite harness for real SQL, so this fake is complementary, not competing: it makes
    projection/authz assertions cheap and fast.
16. **`whereMentions(condition, literal)`** (`fake-db.ts:255-265`) — walks the drizzle
    condition tree for a bound literal, so "the medical rows were filtered" is
    distinguishable from "no filter" *and* from "a filter on something else".

---

## 12. Verbatim excerpts — the five most valuable pieces

### (1) The product law, in the page's own words — `apps/org/app/(console)/audit/page.tsx:20-42`
```tsx
// The audit log — a plain, chronological record.
//
// It exists so that if a burner ever asks "who saw my medical information?", or
// something goes wrong and it has to be reconstructed, there is an honest
// answer. That is its whole job.
//
// IT IS NOT STAFF MONITORING. There is deliberately no volume threshold, no
// per-actor profiling and no alerting, and there must not be. Reading many
// members' notes in one sitting is what the work looks like — a medic working
// out what to prepare for on site does exactly that — so flagging it would
// report ordinary care as an incident, and would teach the people we most need
// reading this information that the safety tool is watching them. That is worse
// for burners, not better. (Ryan's call, 26 Jul 2026.)
//
// Org-gated at the page (`guardConsole`). It shows WHO read WHOSE notes and when
// — never the notes. Reading the trail is not itself a disclosure, so it writes
// no audit row of its own.
//
// THE MEDICAL PANEL IS NOT FOR EVERY RANK. A `bio.medical.view` row only exists
// when the subject HAS notes, so the panel is a list of burners who have
// disclosed a health condition — the same census the member roster refuses to
// carry. A rank that may not read personal information may not read it, and is
// TOLD so here rather than shown a mysteriously empty card. The rest of the
// trail still renders for them, minus the medical rows (lib/medical-audit.ts).
```

### (2) The conditional-projection + SQL-side exclusion — `apps/org/lib/medical-audit.ts:211-239`
```ts
export async function getAuditTrail(
  actor: OrgActor,
  limit = 100,
): Promise<AuditTrailRow[]> {
  const db = getDb();
  const personal = canReadPersonalInformationIn(actor, "audit");
  const rows = await db
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      subject: schema.auditEvents.subject,
      createdAt: schema.auditEvents.createdAt,
      ...(personal ? { actorEmail: schema.users.email } : {}),
    })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorId))
    .where(
      personal
        ? undefined
        : ne(schema.auditEvents.action, MEDICAL_VIEW_AUDIT_ACTION),
    )
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    actorEmail:
      "actorEmail" in r ? ((r.actorEmail as string | null) ?? null) : null,
  }));
}
```

### (3) The fail-open, off-critical-path audit write — `apps/web/lib/medical-access.ts:66-93`
```ts
  // Audit only an actual disclosure of someone ELSE's notes: reading your own
  // data is not an access event, and an empty field discloses nothing. Written
  // after the response so a slow/failed audit never degrades the read.
  //
  // This FAILS OPEN — the notes are already streamed before the insert is
  // attempted, and the error is swallowed below. That is the right trade for an
  // emergency read: nobody should wait on a log row to find out someone is
  // diabetic. No rate limit gates this path either, for the same reason.
  //
  // The row is a RECORD, not surveillance. It answers "who saw my medical
  // information?" if a burner asks, and lets a real incident be reconstructed.
  // It is deliberately not aggregated, thresholded or alerted on: reading a lot
  // of notes in one sitting is normal medic work, not a red flag.
  if (!isSelf && notes) {
    const basis = medicalAccessBasis(ctx);
    after(async () => {
      try {
        await db().insert(schema.auditEvents).values({
          actorId: viewerUserId,
          action: MEDICAL_VIEW_AUDIT_ACTION,
          subject: subjectUserId,
          meta: { basis },
        });
      } catch (err) {
        console.error("[medical-access] audit write failed", err);
      }
    });
  }

  return { visible: true, notes, unreadable };
```

### (4) The pure predicate + the audit-basis derivation — `packages/core/src/medical-access.ts:104-142`
```ts
function isOrgSafetyTier(ctx: MedicalAccessContext): boolean {
  if (ctx.actorOrgRole === "god") return true;
  return ctx.actorOrgPersonalInformation === true;
}

/**
 * May the actor see the subject's medical notes? Pure and fail-closed: anything
 * not explicitly permitted returns false. This is the server-side boundary —
 * hiding the section in the UI is never the control.
 */
export function canViewMedicalNotes(ctx: MedicalAccessContext): boolean {
  if (ctx.isSelf) return true;
  if (isOrgSafetyTier(ctx)) return true;
  if (ctx.actorLeadCampIds.length === 0 || ctx.subjectCampIds.length === 0) {
    return false;
  }
  const subjectCamps = new Set(ctx.subjectCampIds);
  return ctx.actorLeadCampIds.some((id) => subjectCamps.has(id));
}

/** Which authority a permitted read rests on — stored on the audit row so the
 * trail records WHY the access was allowed. `null` when access is refused. */
export type MedicalAccessBasis = "self" | "org_staff" | "camp_lead";

export function medicalAccessBasis(
  ctx: MedicalAccessContext,
): MedicalAccessBasis | null {
  if (ctx.isSelf) return "self";
  if (isOrgSafetyTier(ctx)) return "org_staff";
  if (canViewMedicalNotes(ctx)) return "camp_lead";
  return null;
}

/**
 * The audit `action` string every disclosing read writes (actor, subject, basis,
 * timestamp). Written server-side AFTER the notes are resolved and never on the
 * critical path — the read must not be blocked or slowed by its own audit row.
 */
export const MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view";
```

### (5) The security-event log — write, read, and title resolution
`packages/auth/src/account.ts:207-232` (write; provider-agnostic — no better-auth import in the body):
```ts
/**
 * Best-effort append to `security_events` — the feed the security page shows
 * under "Recent security events". THIN: it records the request context (IP +
 * user agent) at the moment an account action succeeds.
 *
 * It must NEVER break or roll back the primary action. A failed insert, or a
 * request with no context, is swallowed: the change already happened, and the
 * log is a record rather than a gate. The inverse — refusing a completed
 * password change because its log line would not write — protects nobody.
 */
export async function recordSecurityEvent(
  headers: Headers,
  userId: string,
  kind: SecurityEventLogKind,
): Promise<void> {
  try {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || headers.get("x-real-ip") || null;
    const userAgent = headers.get("user-agent") || null;
    await createHttpDb()
      .insert(schema.securityEvents)
      .values({ userId, kind, ip, userAgent });
  } catch {
    // The change already happened; the log is a record, never a gate.
  }
}
```
`packages/core/src/security-events.ts:12-33` (titles — the whole module minus the header):
```ts
/**
 * The one-line title shown for each security event kind. Plain, past-tense, and
 * account-owner-facing — these describe something that already happened.
 */
export const SECURITY_EVENT_TITLES: Readonly<
  Record<SecurityEventLogKind, string>
> = {
  password_changed: "Password changed",
  password_reset_completed: "Password reset completed",
  session_revoked: "A device was signed out",
  sessions_revoked_others: "Signed out of all other devices",
  email_change_requested: "Sign-in email change requested",
  email_change_confirmed: "Sign-in email change confirmed",
  email_change_revoked: "Sign-in email change reversed",
  deletion_requested: "Account deletion requested",
  deletion_cancelled: "Account deletion cancelled",
};

/** The display title for a security event kind. */
export function describeSecurityEvent(kind: SecurityEventLogKind): string {
  return SECURITY_EVENT_TITLES[kind];
}
```

### (6, bonus) The POPIA `meta` scrub — `apps/web/lib/account-sanitize.ts:338-356`
```ts
    // 8. Strip PII out of the AUDIT TRAIL without destroying it.
    //
    //    The trail itself is deliberately preserved — it is the record of what
    //    this account did, keyed by our internal id, and POPIA erasure does not
    //    require forgetting that an actor existed. But some writers put the
    //    person's EMAIL ADDRESS in `meta` (the god-bootstrap rows in
    //    lib/session.ts do, and the supplier overlap rows do), and that address
    //    survived erasure verbatim — 32 such rows on the live database at the
    //    time this was found — while the farewell email told them nothing
    //    identifying remained. Drop just those keys; the row, its action, its
    //    timestamp and its internal ids all stay.
    await tx.execute(sql`
      UPDATE audit_events
         SET meta = meta - 'email' - 'contactEmail' - 'primaryEmail'
       WHERE (actor_id = ${userId} OR subject = ${userId})
         AND meta IS NOT NULL
         AND (meta ? 'email' OR meta ? 'contactEmail' OR meta ? 'primaryEmail')
    `);
```

---

## 13. Gotchas for a porter

1. **Two logs, two lifetimes.** `audit_events` is append-only forever; `security_events` is
   *purged* on account deletion. Do not build one table for both.
2. **`SecurityEventKind` (10) ≠ `SecurityEventLogKind` (9).** Notification vocabulary vs. log
   vocabulary. Collapsing them loses `sessions_revoked_others` / `email_change_confirmed`
   and gains three kinds nothing writes.
3. **`new_device_sign_in` never fires.** No per-account device fingerprint exists; the
   builder is dead code and the UI *says so* rather than pretending
   (`apps/web/app/(app)/account/security/events.ts:22-25`, page note `:109-119`).
4. **The donor has no attack monitoring at all** — "nothing is watching for attacks; there is
   no alerting on failed-login spikes" (`docs/technical-spec.md:436-437`). Do not assume the
   audit log gives you detection; it gives you *reconstruction*.
5. **Three stale comments claim an "enumeration alerts" feature that was removed**:
   `apps/org/lib/status-board.ts:49`, `apps/org/lib/status-board-format.ts:76`, and
   `apps/org/lib/medical-audit.ts:21` (the last is fine — it says "detectable", not
   "alerted"). The *tests* are the truth here, not the prose. Donor house rule confirmed at
   `docs/simplification-audit.md:44-50`: **do not trust a donor comment without reading the
   code under it.**
6. **`writeAuditEvent` exists twice** (`apps/org/lib/audit.ts:11`, `apps/suppliers/lib/audit.ts:13`)
   and `recordSecurityEvent` exists twice (`packages/auth/src/account.ts:218` vs the private
   copy at `apps/web/lib/account-actions.ts:115`, called from 8 sites). Port one of each.
7. **`bg-ab-sage` / `bg-ab-apricot`** in both activity components will silently compile to
   nothing in Camp 404 — the `--color-ab-*` ramp does not exist there.
8. **`Table` and `Skeleton` do not exist in `@camp404/ui`.** The medical panel and the
   `loading.tsx` both need them.
9. **`"server-only"`** at the top of `medical-audit.ts`, `status-board.ts`, `audit.ts`,
   `apps/web/lib/medical-access.ts`. Camp 404's vitest has no alias stub for it.
10. **`activityLabel` falls back to the raw dotted key** for unknown actions
    (`status-board-format.ts:50`), and a test pins that fallback (`:70-72`). If you port the
    map but not the vocabulary, `/audit` will show dotted keys — which is the *designed*
    degradation, not a bug.
11. **The action string is free text with no enum.** That is why the donor needed
    `whereMentions` in tests. Camp 404 could do better here (a `pgEnum` or a const union in
    `@camp404/types`) — but note the donor's `` `registration.${input.action}` `` template
    would then need rewriting.
12. **`audit_events.subject` being `text` is load-bearing, not sloppy.** It holds
    registration ids, supplier ids, group ids and user ids. The UUID-regex second query and
    the "must always render" rule exist because of it. If Camp 404 makes it `uuid`, the
    UUID_RE dance disappears — but so does the ability to log a subject that isn't a row id.
13. **The `orgCapabilityRefusal` sentence is server-produced.** The page renders the
    server's own words rather than a second copy (`page.tsx:82`). Keep that; Camp 404's
    `requireClearance` has no refusal-copy analogue yet.
14. **`getMedicalAccessLog` asserts its own guard** rather than trusting the caller
    (`:116-120`) even though the page already checks. Both are needed; the test pins both.
15. **The e2e spec is the only proof the whole path works**, and Camp 404's Playwright suite
    is "disabled pending a preview deployment" (`AGENTS.md:133`). A port lands without that
    end-to-end proof unless the suite is revived.
16. **`id-retention.ts` is written but not scheduled** — the donor's own stated gap
    (`docs/technical-spec.md:437-438`). Do not port it expecting a working purge job.
17. **Camp 404's `audit_log` is already a near-clone of the donor's `audit_events` — reuse
    it, do not create a second table.** Verified at
    `/home/ryan/repos/Personal/camp-404/packages/db/src/schema.ts:1180-1196`:
    ```ts
    export const auditLog = pgTable(
      "audit_log",
      {
        id: uuid("id").defaultRandom().primaryKey(),
        actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
        action: text("action").notNull(),
        target: text("target"),
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
      },
      (a) => ({
        actorIdx: index("audit_log_actor_idx").on(a.actorId),
        actionIdx: index("audit_log_action_idx").on(a.action),
      }),
    );
    ```
    **Column-for-column identical to the donor except two names**: `target` ↔ `subject`,
    `metadata` ↔ `meta`. `metadata` also lacks the donor's
    `.$type<Record<string, unknown>>()`. **It is missing the two indexes migration 0024 added
    to the donor after three hot readers were found scanning the whole table**:
    `audit_log_subject_idx`-equivalent on `target`, and a `created_at DESC` index. Every
    reader in this unit orders `created_at DESC LIMIT n`, so that index is not optional — add
    it in a new drizzle-kit-generated migration (hand-editing `migrations/` is forbidden,
    `AGENTS.md:56-68`).
18. **Camp 404 has no `security_events` analogue at all**, and no `security_event_kind`
    enum. The whole subject-facing half is net-new: table + enum + `recordSecurityEvent` +
    `listSecurityEvents` + `describeSecurityEvent` + the shared card. But Camp 404 also has
    no password-change / session-revoke / email-change actions to log — the donor's 9 log
    kinds map onto surfaces Camp 404 does not have (Neon Auth hosts forgot/reset). The
    honest Camp 404 vocabulary is probably a different, smaller set (`account_deleted`,
    `rank_changed`, `promotion_accepted`, `invite_redeemed`, `signed_out_everywhere`), and
    the *machinery* — typed kind in the DB, titles in `@camp404/core`, drift-guard test — is
    what ports, not the enum members.
