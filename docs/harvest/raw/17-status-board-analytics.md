# Unit 17 — Status board, KPIs, funnels, charts, coverage, recent activity

> HARVEST doc. Donor = quagga-portal at
> `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`.
> All paths below are donor-repo-relative unless prefixed. Every claim carries a `path:line`.
> Read-only harvest — nothing in either repo was modified.

---

## 1. Purpose

This is the donor's **analytics layer**: two console pages (`/` Overview and `/status` Status
Board) that render the same headline numbers for the current edition, backed by a strict
three-tier separation:

1. **Pure derivations** — `packages/core/src/org-stats.ts` (386 lines). Zero I/O, zero React,
   zero `server-only`. Takes *minimal row shapes, never raw DB rows* and returns plain read
   models. This is the only place a metric is *defined*.
2. **DB reads** — `apps/org/lib/queries.ts:1688` `getStatusBoard()` (one function, ~215 lines
   of reads) plus `apps/org/lib/status-board.ts` (111 lines: the activity feed and the time
   series). These fetch rows and hand them straight to the tier-1 derivations.
3. **Dumb presentation** — `apps/org/components/status-board/*.tsx` (5 files, 747 lines) plus
   the pure formatter `apps/org/lib/status-board-format.ts` (175 lines: labels, tone, relative
   time, month bucketing).

The self-documented design law is stated at `packages/core/src/org-stats.ts:1-7`:

> Pure derivations over already-fetched query results so the console's landing numbers are
> unit-testable without a DB and stay consistent across the Status Board and the Overview page
> (same cards). Every function takes minimal row shapes (never raw DB rows) and returns a plain
> read model. No I/O, no React, no server-only.

and reinforced in the components — `kpi-cards.tsx:4-7`:

> Identical on the Overview and the Status Board — one component so the two pages can never
> disagree. Every number comes from `deriveStatusBoardKpis` over real rows; nothing here
> computes or guesses.

and `registration-funnel.tsx:7-12`:

> Both read the SAME `deriveRegistrationFunnel` counts — no separate tallies, no rounding
> tricks. […] every bar is direct-labeled with its status name and count, so colour is never
> the only encoding.

**Why Camp 404 cares.** Camp 404 has a captains camp-management surface (`/captains/tools`,
`/captains/camp-management`) and **zero analytics** — no KPI row, no funnel, no chart, no
completion rollup, no activity feed. The donor's whole tier-1 (`org-stats.ts`) and tier-3
(components + `status-board-format.ts`) are **pure, tenant-agnostic and drop-in-shaped**; only
tier-2 (`getStatusBoard`) is welded to the donor's group/edition/org model. The chart is
**hand-rolled inline SVG — no chart library at all** (verified: the only two `<svg>` files in
the donor's app/component trees are `registrations-chart.tsx` and `packages/ui/src/components/quilt-band.tsx`),
so there is no new dependency to add.

Target-side gaps this unit lands on: **questionnaire-builder Phase E** (metrics + responses
read-back, "zero code exists"), **WP10 #134** (response read-back, dues/Finances UI), **WP7 #131**
(zero `loading.tsx` across 24 force-dynamic pages — the donor's `SkeletonRegion`/`SkeletonCard`
kit is here), and the eight `comingSoon: true` home tiles.

---

## 2. File inventory (line counts verified with `wc -l`)

| File | Lines | Tier | Portability |
|---|---:|---|---|
| `packages/core/src/org-stats.ts` | 386 | 1 pure | **drop-in (with substitutions)** |
| `packages/core/src/__tests__/org-stats.test.ts` | 348 | 1 test | drop-in pattern |
| `apps/org/lib/status-board-format.ts` | 175 | 1 pure (app-local) | **drop-in** |
| `apps/org/lib/__tests__/status-board-format.test.ts` | 115 | 1 test | **drop-in** |
| `apps/org/lib/status-board.ts` | 111 | 2 reads | light-adapt |
| `apps/org/lib/__tests__/status-board-reads.test.ts` | 217 | 2 test | light-adapt |
| `apps/org/lib/queries.ts` (`getStatusBoard`, `:1688`–`:1902`; `getActiveEdition` `:119`) | 70 777 B total | 2 reads | heavy-adapt / rewrite |
| `apps/org/lib/__tests__/queries-projection.test.ts` (`describe("getStatusBoard")` `:970`–`:1081`) | — | 2 test | pattern |
| `apps/org/components/status-board/kpi-cards.tsx` | 82 | 3 UI | light-adapt (retoken) |
| `apps/org/components/status-board/registration-funnel.tsx` | 180 | 3 UI | light-adapt (retoken) |
| `apps/org/components/status-board/registrations-chart.tsx` | 100 | 3 UI | **light-adapt (retoken only)** |
| `apps/org/components/status-board/coverage.tsx` | 303 | 3 UI | light-adapt (retoken) |
| `apps/org/components/status-board/recent-activity.tsx` | 82 | 3 UI | light-adapt (retoken) |
| `apps/org/app/(console)/status/page.tsx` | 79 | page | concept-only |
| `apps/org/app/(console)/status/loading.tsx` | 24 | page | **drop-in pattern** |
| `apps/org/app/(console)/page.tsx` | 195 | page | concept-only |
| `apps/org/components/page-heading.tsx` | 35 | shared UI | **drop-in** |
| `apps/org/components/console-skeleton.tsx` | 76 | shared UI | **drop-in** |
| `packages/ui/src/components/skeleton.tsx` | 204 | shared UI | **drop-in** |
| `apps/org/lib/__tests__/support/fake-db.ts` | 265 | test harness | **drop-in** |
| `apps/org/lib/__tests__/support/actors.ts` | 106 | test fixtures | rewrite (org roles) |

Supporting pure modules the derivations import (tier-1 dependencies):

| File | Lines | Used for |
|---|---:|---|
| `packages/core/src/officers.ts` | 206 | `outstandingOfficers` (officer coverage) |
| `packages/core/src/supplier-onboarding.ts` | (`deriveOnboardingProgress` at `:201`) | supplier rollup |
| `packages/core/src/questionnaire-activation.ts` | 142 (`tallyActivationCompletion` at `:136`) | questionnaire completion |
| `packages/core/src/supplier-standing.ts` | 142 (`SUPPLIER_STANDINGS` `:11`, `standingLabel` `:31`) | standing rollup |

**Total in-scope, excluding `queries.ts`: ~2,397 lines** across the 14 files listed in the
harvest brief plus the two pages and their tests.

---

## 3. Capability list (exhaustive, each cited)

### 3.1 Metric definitions (tier 1 — `packages/core/src/org-stats.ts`)

| # | Capability | Where |
|---|---|---|
| C1 | `REGISTRATION_STATUS_ORDER` — the full ordered status set, derived from the Zod enum's `.options` rather than re-listed | `org-stats.ts:23-24` |
| C2 | `IN_REVIEW_STATUSES` = `["submitted","under_review","changes_requested"]` | `org-stats.ts:27-31` |
| C3 | `isRegisteredStatus(status)` — **only `approved` is registered** | `org-stats.ts:34-38` |
| C4 | `isInReviewStatus(status)` — null-safe membership test | `org-stats.ts:41-45` |
| C5 | BURNERS card: total bios + complete count + whole-percent | `org-stats.ts:63-71` |
| C6 | CAMPS card: total theme camps + `registered`/`free` split where `free = total - registered` | `org-stats.ts:95-101` |
| C7 | MUTANT VEHICLES card: total + registered + inReview | `org-stats.ts:112-121` |
| C8 | ARTWORKS card: total + registered + `grantRequests` (`grantsInterest === true`) | `org-stats.ts:132-141` |
| C9 | `deriveStatusBoardKpis({bios, projects})` — the four cards in one pass, one shared input | `org-stats.ts:151-161` |
| C10 | `emptyRegistrationFunnel()` — every status present at 0 (never a sparse map) | `org-stats.ts:171-175` |
| C11 | `deriveRegistrationFunnel(statuses)` — tally + total | `org-stats.ts:178-184` |
| C12 | Officer coverage rollup: applicable / fullyOfficered / campsWithGaps / outstandingSlots | `org-stats.ts:210-229` |
| C13 | Wrangler coverage rollup: eligible / assigned / unassigned / distinct wranglers / **busiestLoad** | `org-stats.ts:267-287` |
| C14 | Supplier onboarding distribution: onboarded / inProgress / notStarted | `org-stats.ts:307-320` |
| C15 | Supplier standing rollup (every standing present at 0) | `org-stats.ts:323-330` |
| C16 | Questionnaire completion: per-send `sent/completed/pending/completionPct` **plus** an overall rollup | `org-stats.ts:360-386` |

### 3.2 Presentation derivations (tier 1 app-local — `apps/org/lib/status-board-format.ts`)

| # | Capability | Where |
|---|---|---|
| C17 | `ACTIVITY_LABELS` — a 33-entry audit-action → English map, with the raw key as fallback | `status-board-format.ts:10-51` |
| C18 | `activityTone(action)` → `"approve" \| "attention" \| "reject" \| "neutral"` | `status-board-format.ts:53-67` |
| C19 | `FEED_EXCLUDED_ACTIONS` — actions kept out of the six-row card (today: medical reads only) | `status-board-format.ts:79-81` |
| C20 | `isFeedAction(action)` predicate over C19 | `status-board-format.ts:84-86` |
| C21 | `relativeTime(value, now = new Date())` — compact "just now / N min ago / N h ago / N d ago / N mo ago", clamped at 0 so a future timestamp never renders negative | `status-board-format.ts:89-103` |
| C22 | `SeriesPoint {key, label, count}` — `YYYY-MM` key + short month label | `status-board-format.ts:105-112` |
| C23 | `bucketSubmissionsByMonth(dates)` — UTC month bucketing, **gap-filled**, invalid-date-filtered, 120-iteration runaway guard, `[]` for empty input | `status-board-format.ts:138-170` |
| C24 | `hasSeries(points)` — `points.length >= 2`; the caller **omits the chart** rather than drawing one | `status-board-format.ts:173-175` |

### 3.3 Reads (tier 2)

| # | Capability | Where |
|---|---|---|
| C25 | `getRecentActivity(actor, limit = 6)` — newest-first audit feed with a **SQL-level** `notInArray` exclusion and a personal-information-gated actor email | `status-board.ts:61-85` |
| C26 | `getSubmissionSeries(editionId)` — registrations-over-time from `submitted_at`; returns `[]` **without querying** when there is no edition | `status-board.ts:94-111` |
| C27 | `getStatusBoard(edition)` — the composite read model; returns **all-zero derivations without issuing a single query** when `edition` is null | `queries.ts:1688-1902`, null branch `:1693-1704` |
| C28 | `getActiveEdition()` — the singleton active edition (`is_active = true`, `ORDER BY year DESC LIMIT 1`) | `queries.ts:119-133` |
| C29 | The status-board module **re-exports every pure formatter** so components have one import | `status-board.ts:20-30` |

### 3.4 UI components (tier 3)

| # | Capability | Where |
|---|---|---|
| C30 | `KpiCards` — a 4-up responsive grid (`sm:grid-cols-2 lg:grid-cols-4`) with a coloured dot, mono uppercase kicker, `text-3xl tabular-nums` value and a sub-line | `kpi-cards.tsx:49-82`, inner `KpiCard` `:17-47` |
| C31 | `RegistrationPipelineStrip` — the Overview's compact chip strip (4 chips + "Open the queue" link) | `registration-funnel.tsx:60-122` |
| C32 | `RegistrationFunnelCard` — the Status Board's labelled measured bars | `registration-funnel.tsx:125-180` |
| C33 | `RegistrationsChart` — hand-rolled inline-SVG area+line chart with per-point `<title>` tooltips and a readable number table underneath | `registrations-chart.tsx:16-99` |
| C34 | `WranglerCoverageCard` — assigned/eligible headline, progress bar, legend, and the `busiestLoad` distribution line | `coverage.tsx:49-115` |
| C35 | `OfficerCoverageCard` — fullyOfficered/applicable with gaps + outstanding slots | `coverage.tsx:118-176` |
| C36 | `SupplierOnboardingCard` — a **segmented** stacked bar + legend list + a standings footer that only renders present standings | `coverage.tsx:179-260` |
| C37 | `QuestionnaireCompletionCard` — one titled progress row per active send | `coverage.tsx:263-303` |
| C38 | `RecentActivity` — six-row divided list, tone dot, actor local-part or `"Staff"`, `<time dateTime>` | `recent-activity.tsx:30-82` |
| C39 | Shared `RailHead` + `LegendDot` sub-primitives | `coverage.tsx:18-25`, `:27-34` |

### 3.5 Page composition

| # | Capability | Where |
|---|---|---|
| C40 | `/status` — `dynamic = "force-dynamic"`, gate first, then **three independent reads issued together with `Promise.all`** | `status/page.tsx:26`, `:29-38` |
| C41 | A "Live · updated HH:MM" chip using `toLocaleTimeString("en-ZA", {hour:"2-digit", minute:"2-digit"})` | `status/page.tsx:40-43`, `:52-55`; same on `(console)/page.tsx:101-104` |
| C42 | 3-column board layout: funnel + chart on a `lg:col-span-2` left rail, three coverage cards on the right, activity feed full-width below | `status/page.tsx:61-76` |
| C43 | **The chart is conditionally rendered**: `{hasSeries(series) && <RegistrationsChart …/>}` | `status/page.tsx:64` |
| C44 | `/status/loading.tsx` — a route boundary skeleton that **copies the page's exact grid classes** | `status/loading.tsx:8-23` |
| C45 | Overview reuses `KpiCards`, `RegistrationPipelineStrip`, three coverage cards and `RecentActivity` verbatim, plus a quick-links grid of 7 destinations | `(console)/page.tsx:44-87`, `:134-192` |

---

## 4. Data model — donor tables/columns/enums, verbatim

### 4.1 Enums this subsystem reads

`RegistrationStatus` — `packages/types/src/registration.ts:11-20`:

```ts
export const RegistrationStatus = z.enum([
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
]);
```

`GroupKind` — `packages/types/src/groups.ts:10-16`:

```ts
export const GroupKind = z.enum([
  "org",
  "theme_camp",
  "artwork",
  "mutant_vehicle",
]);
```

`OfficerKey` — `packages/types/src/roles.ts:315-322`:

```ts
export const OfficerKey = z.enum([
  "lnt_officer",
  "safety_officer",
  "fire_safety_officer",
  "sound_officer",
  "safety_monitor",
]);
```

`RoleAssignmentConsent` — `packages/types/src/roles.ts:332-337`: `["pending","accepted","declined"]`.

`SupplierStanding` — `packages/types/src/suppliers.ts:26-34`:

```ts
export const SupplierStanding = z.enum([
  "good",
  "watch",
  "suspended",
  "diligent_first_timer",
  "adapting",
  "absolute_beginner",
]);
```

Display order is **not** the enum order — `packages/core/src/supplier-standing.ts:11-18`:

```ts
export const SUPPLIER_STANDINGS: readonly SupplierStanding[] = [
  "good",
  "diligent_first_timer",
  "adapting",
  "absolute_beginner",
  "watch",
  "suspended",
];
```

`SUPPLIER_ONBOARDING_STEP_KEYS` (7, in procedure order) — `packages/types/src/suppliers.ts:50-58`:
`registration_form`, `agreement_signed`, `deposit_paid`, `inventory_submitted`,
`crew_details_submitted`, `briefing_attended`, `registration_fee_paid`.
Step status enum — `packages/types/src/suppliers.ts:78-83`: `["pending","awaiting_confirmation","completed"]`.

### 4.2 Tables read by `getStatusBoard` / `getRecentActivity` / `getSubmissionSeries`

`editions` — `packages/db/src/schema.ts:574-582`:

```ts
export const editions = pgTable("editions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  year: integer("year").notNull().unique(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

`burner_bios` — `packages/db/src/schema.ts:605+`. Only **one column is read here**:
`completedAt` (queried at `queries.ts:1707-1710`). Note the schema comment at
`schema.ts:616`: "Field set mirrored from Camp 404's burner profile" — this is a re-import,
not an import.

`groups` — read for `kind` only (`queries.ts:1715-1731`), filtered
`inArray(schema.groups.kind, ["theme_camp","artwork","mutant_vehicle"])` (`queries.ts:1728-1730`).

`registrations` — the columns this unit touches:
- `status` (funnel, KPIs, coverage denominators)
- `grantsInterest: boolean("grants_interest")` — `schema.ts:1136`
- `submittedAt: timestamp("submitted_at", { mode: "date" })` — `schema.ts:1144`
- `s5AmplifiedMusic: text("s5_amplified_music")` — `schema.ts:1118` (officer sound trigger)
- `groupId`, `editionId`

`wrangler_assignments` — `packages/db/src/schema.ts:1190-1213`. The design comment at
`:1198-1200` is worth stealing verbatim:

> `set null`, not cascade: losing the account must not delete the record that this camp HAD a
> wrangler. The board shows it vacant, which is a thing someone has to act on — not
> never-assigned, which is not.

Unique index `wrangler_assignments_group_edition_idx` on `(groupId, editionId)`;
secondary `wrangler_assignments_wrangler_edition_idx` on `(wranglerUserId, editionId)`.

`suppliers` (`standing`) LEFT JOIN `supplier_onboarding` (`steps` jsonb) on
`(supplierId, editionId)` — `queries.ts:1836-1848`.

`questionnaire_activations` — `packages/db/src/schema.ts:1297+`; read for `id`, `title`,
filtered `status = "open"` and `editionId` (`queries.ts:1852-1863`).

`required_actions` — `packages/db/src/schema.ts:1443-1524`; read for `activationId` +
`status`. Unique index `required_actions_user_edition_action_idx` on
`(userId, editionId, actionKey)` (`schema.ts:1513-1515`); secondary
`required_actions_user_status_idx` on `(userId, status)` (`schema.ts:1516-1519`).

`audit_events` — `packages/db/src/schema.ts:1708-1735`:

```ts
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
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

**The index rationale (migration 0024) is directly applicable to Camp 404's `audit_log` table**
(`camp-404/packages/db/src/schema.ts:1180`, currently zero consumers) —
`schema.ts:1719-1728`:

> `audit_events` is APPEND-ONLY and never pruned, so it is the one table here that only ever
> grows — and until these two existed, three hot readers scanned all of it: · the status
> board's recent-activity card and the audit trail page, both `ORDER BY created_at DESC LIMIT
> n` over the whole log; […] DESC to match how every reader orders it (Postgres can walk a
> btree backwards, but the matching order lets `ORDER BY … LIMIT` stop at n).

`member_role_assignments` × `project_roles` × `memberships` — the officer-assignment join
(`queries.ts:1744-1759`), filtered `projectRoles.kind = "officer"`.

---

## 5. Public API surface — exported signatures, verbatim

### `packages/core/src/org-stats.ts`

```ts
export const REGISTRATION_STATUS_ORDER: readonly RegistrationStatus[]
export const IN_REVIEW_STATUSES: readonly RegistrationStatus[]

export function isRegisteredStatus(status: RegistrationStatus | null | undefined): boolean
export function isInReviewStatus(status: RegistrationStatus | null | undefined): boolean

export interface BurnerBioStat { completedAt: Date | null }
export interface BurnerStats { total: number; complete: number; completePct: number }
export function deriveBurnerStats(bios: readonly BurnerBioStat[]): BurnerStats

export interface ProjectStatInput {
  kind: GroupKind;
  status: RegistrationStatus | null;
  grantsInterest: boolean | null;
}

export interface CampStats { total: number; registered: number; free: number }
export function deriveCampStats(projects: readonly ProjectStatInput[]): CampStats

export interface MutantVehicleStats { total: number; registered: number; inReview: number }
export function deriveMutantVehicleStats(projects: readonly ProjectStatInput[]): MutantVehicleStats

export interface ArtworkStats { total: number; registered: number; grantRequests: number }
export function deriveArtworkStats(projects: readonly ProjectStatInput[]): ArtworkStats

export interface StatusBoardKpis {
  burners: BurnerStats;
  camps: CampStats;
  mutantVehicles: MutantVehicleStats;
  artworks: ArtworkStats;
}
export function deriveStatusBoardKpis(input: {
  bios: readonly BurnerBioStat[];
  projects: readonly ProjectStatInput[];
}): StatusBoardKpis

export interface RegistrationFunnel {
  byStatus: Record<RegistrationStatus, number>;
  total: number;
}
export function emptyRegistrationFunnel(): Record<RegistrationStatus, number>
export function deriveRegistrationFunnel(statuses: readonly RegistrationStatus[]): RegistrationFunnel

export interface CampOfficerInput {
  isRegisteredOrInFlight: boolean;
  triggers: OfficerTriggerInput;
  assignedKeys: Iterable<OfficerKey>;
}
export interface OfficerCoverage {
  applicableCamps: number;
  fullyOfficered: number;
  campsWithGaps: number;
  outstandingSlots: number;
}
export function deriveOfficerCoverage(camps: readonly CampOfficerInput[]): OfficerCoverage

export interface CampWranglerInput { isApproved: boolean; wranglerUserId: string | null }
export interface WranglerCoverage {
  eligibleCamps: number;
  assigned: number;
  unassigned: number;
  wranglers: number;
  busiestLoad: number;
}
export function deriveWranglerCoverage(camps: readonly CampWranglerInput[]): WranglerCoverage

export interface SupplierOnboardingRollup {
  total: number; onboarded: number; inProgress: number; notStarted: number;
}
export interface SupplierOnboardingStat { steps: SupplierOnboardingSteps | null | undefined }
export function deriveSupplierOnboardingRollup(
  suppliers: readonly SupplierOnboardingStat[],
): SupplierOnboardingRollup

export function deriveSupplierStandingRollup(
  suppliers: readonly { standing: SupplierStanding }[],
): Record<SupplierStanding, number>

export interface QuestionnaireSendStat {
  activationId: string;
  title: string;
  actions: readonly { status: string }[];
}
export interface QuestionnaireSendCompletion {
  activationId: string; title: string;
  sent: number; completed: number; pending: number; completionPct: number;
}
export interface QuestionnaireCompletionRollup {
  sends: QuestionnaireSendCompletion[];
  totalSent: number; totalCompleted: number; completionPct: number;
}
export function deriveQuestionnaireCompletion(
  sends: readonly QuestionnaireSendStat[],
): QuestionnaireCompletionRollup
```

All 20 symbols are re-exported from the barrel by `export * from "./org-stats";` at
`packages/core/src/index.ts:185`, and are described in the barrel manifest at
`packages/core/src/index.ts:112-118`.

### `apps/org/lib/status-board-format.ts`

```ts
export function activityLabel(action: string): string
export type ActivityTone = "approve" | "attention" | "reject" | "neutral"
export function activityTone(action: string): ActivityTone
export const FEED_EXCLUDED_ACTIONS: readonly string[]
export function isFeedAction(action: string): boolean
export function relativeTime(value: Date, now: Date = new Date()): string
export interface SeriesPoint { key: string; label: string; count: number }
export function bucketSubmissionsByMonth(dates: readonly Date[]): SeriesPoint[]
export function hasSeries(points: readonly SeriesPoint[]): boolean
```

### `apps/org/lib/status-board.ts`

```ts
export interface ActivityRow {
  id: string;
  action: string;
  actorEmail: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}
export async function getRecentActivity(actor: OrgActor, limit = 6): Promise<ActivityRow[]>
export async function getSubmissionSeries(editionId: string | null): Promise<SeriesPoint[]>
```

### `apps/org/lib/queries.ts`

```ts
export interface ActiveEdition {
  id: string; name: string; year: number; startDate: string; endDate: string;
}
export async function getActiveEdition(): Promise<ActiveEdition | null>          // :119

export interface StatusBoard {
  edition: ActiveEdition | null;
  kpis: StatusBoardKpis;
  funnel: RegistrationFunnel;
  officerCoverage: OfficerCoverage;
  wranglerCoverage: WranglerCoverage;
  supplierOnboarding: SupplierOnboardingRollup;
  supplierStandings: Record<SupplierStanding, number>;
  questionnaires: QuestionnaireCompletionRollup;
}
export async function getStatusBoard(edition: ActiveEdition | null): Promise<StatusBoard>  // :1688
```

### Components

```tsx
export function KpiCards({ kpis }: { kpis: StatusBoardKpis })
export function RegistrationPipelineStrip({ funnel }: { funnel: RegistrationFunnel })
export function RegistrationFunnelCard({ funnel }: { funnel: RegistrationFunnel })
export function RegistrationsChart({ points }: { points: SeriesPoint[] })
export function WranglerCoverageCard({ coverage }: { coverage: WranglerCoverage })
export function OfficerCoverageCard({ coverage }: { coverage: OfficerCoverage })
export function SupplierOnboardingCard({
  onboarding, standings,
}: { onboarding: SupplierOnboardingRollup; standings: Record<SupplierStanding, number> })
export function QuestionnaireCompletionCard({ rollup }: { rollup: QuestionnaireCompletionRollup })
export function RecentActivity({ rows }: { rows: ActivityRow[] })
```

Every one takes a **plain read model and nothing else** — no `groupId`, no `orgId`, no actor,
no async. That is why tier 3 is portable.

---

## 6. UX behaviours

### 6.1 Zero states are copy, never an empty chart

Every card has an explicit zero branch with a sentence that says *why* there is nothing:

- `registration-funnel.tsx:91-94` / `:147-150` — "No registrations yet for this edition."
- `coverage.tsx:66-70` — "Nothing is approved yet. A camp gets its wrangler when its
  registration is approved."
- `coverage.tsx:137-141` — "No camps are registered or in review yet, so no officer
  requirements apply."
- `coverage.tsx:211-214` — "No suppliers in the repository yet."
- `coverage.tsx:275-278` — "No questionnaires are open right now."
- `recent-activity.tsx:44-47` — "Nothing has happened in the console yet."
- `(console)/page.tsx:113-116` — "No active edition is seeded yet. Numbers appear once the
  database is seeded."

The stated law at `coverage.tsx:12-16`: "the bars are drawn FROM the numbers shown beside them,
so a bar can never imply a number that isn't in the data. Zero states say 'nothing yet' rather
than drawing an empty bar."

### 6.2 The chart is omitted, not faked

`status/page.tsx:64` renders `{hasSeries(series) && <RegistrationsChart points={series} />}`,
and `hasSeries` requires ≥ 2 points (`status-board-format.ts:173-175`). The page comment at
`status/page.tsx:22-24` says: "when there is less than two months of history the chart is
omitted rather than drawn over invented points."

### 6.3 Colour is never the only encoding

Every funnel bar carries a `w-32` text label and a `w-10 tabular-nums` count
(`registration-funnel.tsx:158-171`); every coverage legend dot is followed by its label and
number (`coverage.tsx:88-97`, `:159-170`, `:229-242`). The chart carries a number table
underneath the SVG (`registrations-chart.tsx:87-96`) plus per-point `<title>` tooltips
(`registrations-chart.tsx:81`) and an `aria-label` naming the span
(`registrations-chart.tsx:47`).

### 6.4 Bars never round to invisible

`registration-funnel.tsx:165`: `style={{ width: `${n === 0 ? 0 : Math.max(pct, 2)}%` }}` — a
non-zero count is always at least 2% wide, and a zero count is exactly 0.

### 6.5 Bars are scaled to the max, not the total

`registration-funnel.tsx:134`: `const max = Math.max(1, ...rows.map((s) => funnel.byStatus[s]));`
then `pct = Math.round((n / max) * 100)` (`:156`). The `Math.max(1, …)` is the divide-by-zero guard.

### 6.6 Tail statuses appear only when non-zero

`registration-funnel.tsx:48-57`:

```ts
const FUNNEL_ORDER: RegistrationStatus[] = [
  "draft", "submitted", "under_review", "changes_requested", "approved",
];
/** Statuses shown only when they actually occurred (never a row of zeroes). */
const TAIL_ORDER: RegistrationStatus[] = ["rejected", "withdrawn"];
```
combined at `:130-133` as `[...FUNNEL_ORDER, ...TAIL_ORDER.filter((s) => funnel.byStatus[s] > 0)]`.
The same idea for standings — `coverage.tsx:202`: `const present = SUPPLIER_STANDINGS.filter((s) => standings[s] > 0);`.

### 6.7 Stacked bar segments skip zeros

`coverage.tsx:218-227` renders `s.n === 0 ? null : <span … style={{ width: `${(s.n / total) * 100}%` }} />`
inside a `flex h-3.5 gap-0.5` track, so an absent segment leaves no stray gap divider.

### 6.8 Singular/plural everywhere

Manual ternaries throughout: `registration{funnel.total === 1 ? "" : "s"}`
(`registration-funnel.tsx:78-79`, `:142-143`), `camp${eligibleCamps === 1 ? "" : "s"}`
(`coverage.tsx:64`), `slot${outstandingSlots === 1 ? "" : "s"}` (`coverage.tsx:167`),
`send${rollup.sends.length === 1 ? "" : "s"}` (`coverage.tsx:273`),
`wrangler${wranglers === 1 ? "" : "s"}` (`coverage.tsx:101`).

### 6.9 Actor display degrades to a role noun

`recent-activity.tsx:24-28`:

```ts
/** Actor display: the local part of the staff email, or "Staff". */
function actorName(email: string | null): string {
  if (!email) return "Staff";
  return email.split("@")[0] ?? email;
}
```

A refused caller sees the *same feed*, just unattributed — not a shorter feed.

### 6.10 "Live · updated HH:MM"

`status/page.tsx:40-43` and `(console)/page.tsx:101-104` both stamp a render-time clock,
paired with a sage dot. This is honest for a `force-dynamic` page: it is the time the server
rendered, not a polling claim.

### 6.11 Route-boundary skeleton mirrors the destination grid

`status/loading.tsx:12-21` reproduces the page's `grid gap-4 lg:grid-cols-3` with
`lg:col-span-2` exactly. The rationale is in `packages/ui/src/components/skeleton.tsx:8-13`:

> a route boundary only stops the navigation feeling broken if it shows the DESTINATION's
> shape. A generic grey page is honest about "something is happening" and dishonest about
> what — and when the real content lands the layout jumps, which reads as a second load.

---

## 7. Validation & edge-case rules — digit-exact

| Rule | Value | Cite |
|---|---|---|
| Only `approved` counts as registered | `status === "approved"` | `org-stats.ts:37` |
| In-review set | exactly 3 statuses | `org-stats.ts:27-31` |
| Burner completion % | `total === 0 ? 0 : Math.round((complete / total) * 100)` | `org-stats.ts:69` |
| `free` camps | `camps.length - registered` (a null-status group counts as free) | `org-stats.ts:100` |
| Grant requests | `p.grantsInterest === true` (strict — `null` does **not** count) | `org-stats.ts:139` |
| Empty funnel | every one of the 7 statuses present at `0` | `org-stats.ts:171-175` |
| Officer coverage denominator | only `summary.applies === true` camps; free camps `continue` | `org-stats.ts:218-219` |
| `fullyOfficered` | `summary.outstanding.length === 0` | `org-stats.ts:221` |
| `campsWithGaps` | `applicable - full` (derived, never counted twice) | `org-stats.ts:226` |
| Wrangler eligibility | `isApproved` only — **not** registration | `org-stats.ts:275`, rationale `:257-261` |
| `busiestLoad` | `load.size === 0 ? 0 : Math.max(...load.values())` | `org-stats.ts:285` |
| Supplier bucket order | `isOnboarded` → onboarded; else `completed > 0 \|\| awaiting > 0` → inProgress; else notStarted | `org-stats.ts:315-317` |
| `isOnboarded` | `completed === SUPPLIER_ONBOARDING_STEP_COUNT` i.e. **all 7** | `supplier-onboarding.ts:214` |
| Standing rollup seeding | every standing pre-set to 0 before tallying | `org-stats.ts:327` |
| Per-send completion % | `tally.sent === 0 ? 0 : Math.round((tally.completed / tally.sent) * 100)` | `org-stats.ts:375-376` |
| Overall completion % | `totalSent === 0 ? 0 : Math.round((totalCompleted / totalSent) * 100)` | `org-stats.ts:383-384` |
| "completed" is the only done status | `actions.filter((a) => a.status === "completed")`; pending/waived/expired all count outstanding | `questionnaire-activation.ts:139-140`, comment `:132-134` |
| Sound-triggered officer | `sound_officer` required when `soundLevel >= 2` | `officers.ts:109` |
| Always-required officers | `lnt_officer` and `fire_safety_officer`, unconditionally | `officers.ts:111,113` |
| Officer slot filled | `consent === "pending" \|\| consent === "accepted"` | `officers.ts:205`; applied at `queries.ts:1764` |
| Month bucket key | `` `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` `` — **UTC**, zero-padded | `status-board-format.ts:129-131` |
| Invalid dates dropped | `dates.filter((d) => !Number.isNaN(d.getTime()))` | `status-board-format.ts:141` |
| Empty series | `if (valid.length === 0) return [];` | `status-board-format.ts:142` |
| Runaway guard | `for (let i = 0; i < 120 && cursor.getTime() <= end; i += 1)` — 10 years of months | `status-board-format.ts:159-160` |
| Chart threshold | `points.length >= 2` | `status-board-format.ts:174` |
| Relative time thresholds | `< 60 s` → "just now"; `< 60 min` → "N min ago"; `< 24 h` → "N h ago"; `< 30 d` → "N d ago"; else "N mo ago" (30-day months) | `status-board-format.ts:94-102` |
| Negative-age clamp | `Math.max(0, Math.round(…/1000))` | `status-board-format.ts:90-93` |
| Feed default limit | `limit = 6` | `status-board.ts:63`; both pages pass `6` explicitly (`status/page.tsx:37`, `(console)/page.tsx:98`) |
| No-edition short circuit (board) | returns all-zero derivations and **issues no query** | `queries.ts:1693-1704`; asserted `queries-projection.test.ts:972-977` |
| No-edition short circuit (series) | `if (!editionId) return [];` before `getDb()` | `status-board.ts:97` |
| No-activation short circuit | `activationIds.length === 0 ? [] : await db…` — `required_actions` is never queried | `queries.ts:1865-1875`; asserted `queries-projection.test.ts:1076-1081` |
| Orphan required action | `if (!a.activationId) continue;` | `queries.ts:1877` |
| Officer-coverage in-flight set | `["submitted","under_review","changes_requested","approved"]` — **draft/withdrawn/rejected excluded** | `queries.ts:1663-1668` |
| Chart geometry | `W = 700`, `H = 150`, `PAD_TOP = 8`, `PAD_BOTTOM = 8`; gridlines at `0.25/0.5/0.75`; line `strokeWidth 2.5` + `vectorEffect="non-scaling-stroke"`; point `r=4` with a 2px card-coloured stroke; area fill `opacity 0.14` | `registrations-chart.tsx:11-14`, `:50-83` |
| Chart y-scale | `const max = Math.max(1, ...points.map((p) => p.count));` | `registrations-chart.tsx:17` |
| Chart x-step | `points.length > 1 ? W / (points.length - 1) : W` | `registrations-chart.tsx:19` |
| Chart min width | `min-w-[280px]` inside an `overflow-x-auto` wrapper | `registrations-chart.tsx:43,48` |

**A latent hazard worth flagging.** `registrations-chart.tsx:29` and `:31` do
`coords[0]!` / `points[0]!` with non-null assertions. The component is safe *only* because
the page guards with `hasSeries()`. Rendering it directly with `points = []` throws. If Camp
404 lifts this component, keep the guard or add an internal `if (points.length < 2) return null;`.

---

## 8. Test coverage

### 8.1 `packages/core/src/__tests__/org-stats.test.ts` (348 lines, 8 `describe` blocks)

Structure and the specific contracts pinned:

- `describe("status predicates")` — `isRegisteredStatus("approved")` true and **every other
  member of `REGISTRATION_STATUS_ORDER` false** (a loop, not a list — so adding an enum member
  is automatically covered). `org-stats.test.ts:38-55`.
- `describe("deriveBurnerStats")` — `{total:4, complete:2, completePct:50}` and the empty
  no-divide-by-zero case. `:57-75`.
- `SEED_CAMPS` fixture at `:27-36` **mirrors `packages/db/src/seed.ts`'s theme camps** and the
  expected numbers are **derived from the fixture, never hardcoded** — the comment at `:23-26`
  says so explicitly. This is the practice that survives a seed change.
- `describe("deriveRegistrationFunnel")` asserts an **invariant**: the sum of the buckets
  equals the input length (`:150-152`), plus the every-status-at-0 empty map.
- `describe("deriveOfficerCoverage")` — three camps (loud+fully-covered, quiet+missing-fire,
  free), asserting `applicableCamps:2, fullyOfficered:1, campsWithGaps:1, outstandingSlots:1`
  with the comment `// the missing fire_safety_officer` (`:193-197`).
- `describe("deriveSupplierOnboardingRollup")` — the **full 7-key completed map is spelled out
  verbatim** at `:222-232`, plus an in-progress-by-completed, an in-progress-by-awaiting, and
  two not-started shapes (`{}` and `null`), asserting the partition invariant
  `onboarded + inProgress + notStarted === total` (`:245-247`).
- `describe("deriveQuestionnaireCompletion")` — `totalSent:3, totalCompleted:1,
  completionPct:33` (i.e. `Math.round(33.33)`), per-send `50` and `0`. `:265-303`.
- `describe("deriveWranglerCoverage")` — three cases, including the load-distribution one
  (`sipho` × 3, `ren` × 1, one vacant → `wranglers:2, busiestLoad:3`) with the comment at
  `:332-333`: "Two people, not four assignments — the headline '4 of 5 covered' hides that one
  volunteer is holding three quarters of it."

`packages/core/vitest.config.ts` sets a **coverage ratchet** — global floors
`lines 90 / statements 89 / functions 92 / branches 82` and per-file 100% floors on the
privacy/safety core. **`org-stats.ts` is NOT in the per-file floor list**; `officers.ts` is
(`lines 90 / statements 90 / functions 100 / branches 79`).

### 8.2 `apps/org/lib/__tests__/status-board-format.test.ts` (115 lines)

- Empty input → `[]` and `hasSeries === false` (`:11-14`).
- **A single month is not a time series** — two dates in Sep 2026 yield one point and
  `hasSeries === false` (`:16-23`).
- Gap filling: Sep + two Decembers → 4 points with Oct/Nov at count 0 (`:25-38`).
- **Year-boundary crossing**: `["2026-11","2026-12","2027-01"]` with counts `[1,0,1]` (`:40-47`).
- Invalid dates never counted (`:49-55`).
- **Conservation invariant**: total counted equals input length (`:57-69`).
- `relativeTime` against a frozen `now = new Date("2027-02-01T12:00:00Z")` asserting all five
  bands (`:72-87`) and the clock-skew case → "just now" (`:89-93`).
- `activityLabel` known + unknown fallback; `activityTone` for approve/reject/attention/neutral
  (`:96-114`).

### 8.3 `apps/org/lib/__tests__/status-board-reads.test.ts` (217 lines)

Uses the `FakeDb` harness (§9.3). The status-board-specific assertions:

- `getRecentActivity(PERSONAL_READER)` yields `actorEmail`; `getRecentActivity(SUPPLIERS_LEAD)`
  and `(READER)` yield `null` **and the recorded select's column list does not contain
  `actorEmail`** — `expect(db.recorded("select","audit_events")[0]?.columns).not.toContain("actorEmail")`
  (`:65-67`). That is a projection assertion, not a render assertion.
- `it("EXCLUDES medical reads IN THE QUERY, for every rank")` — asserts the **built where
  clause mentions the literal** via `whereMentions(call?.where, MEDICAL_VIEW_AUDIT_ACTION)`
  (`:73-84`).
- `getSubmissionSeries(null)` resolves `[]` **and `db.calls` is empty** (`:96-99`).
- A `submittedAt: null` row is dropped so it never buckets as Invalid Date (`:101-117`).

### 8.4 `apps/org/lib/__tests__/queries-projection.test.ts` — `describe("getStatusBoard")` (`:970`–`:1081`)

The end-to-end read-model test. Two things here are the most instructive artefacts in the
whole unit:

**(a) The queue-seeded fake.** `registrations` is seeded as an *array of arrays*
(`:988-997`) because `getStatusBoard` reads that table three times in order (funnel → officer
camps → wranglers). Each successive read shifts one result off the queue
(`fake-db.ts:34-39`, `:130-138`).

**(b) The recorded near-miss** — `queries-projection.test.ts:1000-1006`, verbatim:

> THE KEYS MUST BE REAL ONES. These read "safety" and "lnt" until 4 Aug 2026, and neither is
> in the OfficerKey enum (`safety_officer`, `lnt_officer`, `fire_safety_officer`,
> `sound_officer`, `safety_monitor`). An unrecognised key matches no required slot, so the
> whole assignment path contributed nothing and this test reported the same officer numbers it
> would with the feature deleted — verified by seeding every key as accepted and watching
> `outstandingSlots` not move. The keys also have to be REQUIRED ones to move the number. A
> theme camp always requires `lnt_officer` and `fire_safety_officer`; `safety_officer` is only
> *recommended*, so assigning it proves nothing.

This is elevated to a house rule in `AGENTS.md:252-257`:

> **A fixture whose values are outside the domain vocabulary.** A status-board test seeded
> officer assignments with `officerKey: "safety"` and `"lnt"` — neither is in the `OfficerKey`
> enum — so no seeded row ever matched a required slot and the whole assignment path was
> inert. Deleting the consent filter entirely left all 54 tests green. **Seed values from the
> enum, and check the fixture moves the number**: seed the opposite case and watch the
> assertion change.

The consent-filter assertion that closed it is at `:1041-1055`, with `outstandingSlots === 1`
pinning that a **declined** officer does not fill a slot.

### 8.5 Source-text regression tests (an unusual, portable technique)

`apps/org/lib/__tests__/org-rank-enforcement.test.ts` and
`apps/org/lib/__tests__/medical-audit-surface.test.ts` **read the module source as text** and
assert on its shape:

- `selectProjection(functionBody(statusBoard, "getRecentActivity"))` with the personal branch
  stripped must not contain `schema.users.email` (`org-rank-enforcement.test.ts:246-248`).
- `functionBody(statusBoard, "getRecentActivity")` must contain the literal
  `canReadPersonalInformationIn(actor, "audit")` (`medical-audit-surface.test.ts` — the
  `it("the recent-activity feed asks the audit domain too")` block).
- `expect(statusBoard).toMatch(/notInArray\(\s*schema\.auditEvents\.action/)` and
  `toMatch(/FEED_EXCLUDED_ACTIONS/)`, with the rationale: "A JS-side filter after `limit 6`
  would return fewer than six rows (or none) during a burst — the eviction bug in a different
  costume."
- `expect([...FEED_EXCLUDED_ACTIONS]).toEqual([MEDICAL_VIEW_AUDIT_ACTION])` — the exclusion
  list is pinned to exactly one entry ("the feed is a glance, not a redaction").

### 8.6 E2E

`e2e/specs/god/god-bootstrap-and-surfaces.spec.ts:25-42` lists `{ path: "/status", label:
"Status board" }` in a `CONSOLE_SURFACES` array a `god` persona must reach; the suite "fails
loudly if a new surface is added that a god cannot reach, or if one silently starts refusing
god" (`:23-24`). **There is no e2e test of the numbers themselves.** Note `AGENTS.md:59-69`:
`turbo run test` never executes Playwright.

---

## 9. Dependency footprint

### 9.1 Runtime packages — **zero new dependencies**

| Import | From | In |
|---|---|---|
| `lucide-react` `ArrowRight` | already in Camp 404 (`^1.16.0`) | `registration-funnel.tsx:2`, `recent-activity.tsx:2`, `(console)/page.tsx:2-12` |
| `next/link` | Next 16 | `registration-funnel.tsx:1`, `recent-activity.tsx:1`, `coverage.tsx:1` |
| `Card`, `CardContent` | `@quagga/ui/components/card` — Camp 404 has `card.tsx` (donor `CardTitle` is `text-lg`, target `text-2xl`) | all 5 components |
| `drizzle-orm` `{and, desc, eq, isNotNull, notInArray}` | already in Camp 404 | `status-board.ts:3` |

**No chart library.** No recharts, no d3, no chart.js, no visx. The chart is 100 lines of
inline SVG with CSS custom properties for colour (`var(--color-ab-teal)`, `var(--color-border)`,
`var(--color-card)`). Verified: `rg -l "<svg|polyline|viewBox"` across all three apps'
components + `packages/ui/src` returns exactly two files —
`packages/ui/src/components/quilt-band.tsx` and `apps/org/components/status-board/registrations-chart.tsx`.

### 9.2 Workspace coupling of tier 1

`packages/core/src/org-stats.ts:9-20` imports:

```ts
import type {
  RegistrationStatus, GroupKind, SupplierStanding, SupplierOnboardingSteps, OfficerKey,
} from "@quagga/types";
import { RegistrationStatus as RegistrationStatusEnum } from "@quagga/types";
import { outstandingOfficers, type OfficerTriggerInput } from "./officers";
import { deriveOnboardingProgress } from "./supplier-onboarding";
import { tallyActivationCompletion } from "./questionnaire-activation";
import { SUPPLIER_STANDINGS } from "./supplier-standing";
```

Four of those six are AfrikaBurn-domain (`GroupKind`, `SupplierStanding`,
`SupplierOnboardingSteps`, `OfficerKey`). See §10 for what each becomes.

`packages/core` **never imports `packages/db`** — that boundary is stated at
`docs/architecture.md:85-88` and is exactly why `org-stats.ts` is DB-free and testable.

### 9.3 Test harness

`apps/org/lib/__tests__/support/fake-db.ts` (265 lines) needs only `drizzle-orm`'s
`getTableName` / `Table`. It is a `Proxy`-based thenable that records the builder chain and
**projects seeded rows down to the selected column keys** (`fake-db.ts:139-147`) — which is
what makes "did this caller's query even ask for `email`?" a real assertion. Its own honesty
box, `fake-db.ts:13-21`:

> It proves PROJECTION, AUTHORISATION and MAPPING […] It proves NOTHING about SQL semantics —
> not a WHERE clause, not a join, not an ON CONFLICT, not an ordering. […] a green test here
> must never be reported as evidence that a query is correct.

Camp 404 has a *different* seam for this (`__setDbOverride` + PGlite,
`camp-404/packages/db/src/index.ts:35-41`), which proves real SQL. The two are complements,
not substitutes — `FakeDb` proves *projection* (which columns a query asked for), which PGlite
does not.

### 9.4 Vitest config gotcha

The donor's `apps/*/vitest.config.ts` alias `"server-only"` to `test/stubs/server-only.ts`.
`apps/org/lib/status-board.ts:1` is `import "server-only";`. **Camp 404's
`apps/web/vitest.config.ts` aliases only `"@"`** — so lifting `status-board.ts` and unit-testing
it requires adding that stub alias first.

---

## 10. AfrikaBurn / multi-tenant coupling — what must be collapsed

Rated per asset.

### 10.1 Clean — no coupling at all (lift as-is, retoken only)

| Asset | Why clean |
|---|---|
| `bucketSubmissionsByMonth`, `hasSeries`, `SeriesPoint`, `relativeTime` | Pure `Date` → data. Zero domain vocabulary. `status-board-format.ts:88-175`. |
| `RegistrationsChart` | Takes `SeriesPoint[]` only. Only coupling is `var(--color-ab-teal)` at `:61,64,77`. |
| `KpiCard` (the inner sub-component) | `{tone, kicker, value, sub}` — generic stat tile. `kpi-cards.tsx:17-47`. |
| `RailHead`, `LegendDot` | `coverage.tsx:18-34`. Pure layout. |
| `packages/ui/src/components/skeleton.tsx` | 8 exports, no domain, no state, `cn()` only. |
| `apps/org/components/console-skeleton.tsx`, `page-heading.tsx` | Layout only. `text-accent` retoken. |
| `fake-db.ts` | drizzle-orm only. |
| `emptyRegistrationFunnel` / `deriveRegistrationFunnel` shape | Generic status-tally over any enum. |

### 10.2 Domain-renaming (the metric *shape* survives, the *noun* changes)

| Donor concept | Camp 404 equivalent | Notes |
|---|---|---|
| `deriveBurnerStats` (bios complete %) | **Direct** — `burner_profiles.completedAt` (`camp-404/packages/db/src/schema.ts:380`) is the exact same "completion is an act, not a field" shape. Rename `BurnerBioStat` → e.g. `MemberProfileStat`. | The cleanest single lift in the unit. |
| `deriveQuestionnaireCompletion` + `tallyActivationCompletion` | **Direct** — Camp 404 has `questionnaire_activations` (`schema.ts:537`) and `required_actions` (`schema.ts:643`) with a `required_action_status` enum `[pending, completed, waived, expired]` (`schema.ts:125`). `tallyActivationCompletion` counts `status === "completed"` and treats everything else as outstanding — **this exact tally is builder Phase E's missing metric.** | Zero adaptation beyond the activation-id column name. |
| `deriveOfficerCoverage` | Camp 404 has **no officers**. But the *shape* — "n of m entities have all their required slots filled, k slots outstanding" — maps one-to-one onto **WP6 #130 team-lead coverage**: `team_memberships.is_lead` per team, applicable = active (non-archived) teams from `camp_settings.config`, `outstandingSlots` = teams with no lead. | Reuse `deriveOfficerCoverage`'s body with `OfficerKey` → team key and `outstandingOfficers` → a lead-requirement function. |
| `deriveWranglerCoverage` | No wranglers. But the *distribution* insight (`wranglers`, `busiestLoad`) maps onto **team-lead load** or **captain approval load**. See §11 for why `busiestLoad` is the most valuable idea here. | |
| `deriveSupplierOnboardingRollup` / `deriveSupplierStandingRollup` | **No supplier population in Camp 404** (~30–80 members, one camp). Leave `apps/suppliers` behind entirely. **But** `deriveSupplierOnboardingRollup`'s tri-bucket (`onboarded / inProgress / notStarted`) is *exactly* the shape needed for a member-onboarding-funnel tile: profile complete / partially answered / never started. And `deriveSupplierStandingRollup`'s "every enum member present at 0" pattern applies to any Camp 404 enum rollup (approval status, membership tier, team). | Port the *pattern*, drop the nouns. |
| `deriveCampStats` / `deriveMutantVehicleStats` / `deriveArtworkStats` | **These three are pure group-kind partitioning and do not survive.** Camp 404 has no `groups` table and no `GroupKind`. | The four-KPI-card *row* survives; its contents become Camp-404 nouns. |

### 10.3 Structurally coupled — rewrite

| Coupling | Where | Camp 404 collapse |
|---|---|---|
| **`groups` indirection.** Every project stat keys on `kind: GroupKind`; the coverage queries `innerJoin(schema.groups, …)` and filter `groups.kind = "theme_camp"`. | `org-stats.ts:80-84`, `queries.ts:1728-1730`, `:1733-1742`, `:1826-1829` | There is no group. The whole `ProjectStatInput` triple collapses; camp-level KPIs become one-row counts over `users` / `team_memberships`. |
| **`editions` namespace.** `getStatusBoard(edition)` threads `edition.id` into **eight** separate `eq(…editionId, edition.id)` predicates; `burner_bios` and `registrations` are per-edition; `getActiveEdition()` exists only to resolve it. | `queries.ts:119-133`, `:1706-1875` | Camp 404 is **single-edition by construction** — `camp_settings` is a physically-enforced singleton (`camp-404/packages/db/src/schema.ts:1422-1447`). Delete the `editionId` parameter and every `and(…)` it produces. This alone removes ~30% of `getStatusBoard`'s complexity. |
| **The org-vs-participant permission fork.** `getRecentActivity(actor: OrgActor, …)` calls `canReadPersonalInformationIn(actor, "audit")` and conditionally spreads `...(personal ? { actorEmail: schema.users.email } : {})` into the select. `OrgActor` carries `{rank, roles, domains}` from the `org_departments`/`org_roles` system. | `status-board.ts:4`, `:61-79` | Camp 404's equivalent gate is `ViewerRank` (`camp_member < team_lead < captain`) + `requireClearance` from `@camp404/core`. The **pattern** — decide personal information *at the select, not in JSX* — is the valuable part and should be kept verbatim; only the predicate changes to `hasClearance(rank, "captain")`. Camp 404 already has an OD4 decision that email is captain+owner-visible, and **WP5 #129 flags the roster as missing member email**, so this is directly on-roadmap. |
| **`suppliers` / `supplier_onboarding` / `wrangler_assignments` / `member_role_assignments` / `project_roles`** | `queries.ts:1744-1759`, `:1810-1848` | No analogue. Delete. |
| **Registration status funnel.** Camp 404 has no `registrations` table. | | The nearest Camp 404 funnel is `approval_status` `[pending, approved, rejected]` (`schema.ts:50`) or `questionnaire_status` `[draft, published, unpublished]` (`schema.ts:150`). Both are 3-value, so the funnel component works but the `FUNNEL_ORDER`/`TAIL_ORDER` split becomes trivial. |
| **`ACTIVITY_LABELS`.** 33 entries, all AfrikaBurn-specific dotted keys (`registration.approve`, `supplier.standing`, `org.department.create`, …). | `status-board-format.ts:10-47` | Rewrite the map for Camp 404's own action vocabulary. **But note Camp 404's `audit_log` table currently has ZERO producers** (`camp-404/packages/db/src/schema.ts:1180`), so the feed needs a writer before it needs a label map. |
| **`MEDICAL_VIEW_AUDIT_ACTION`** in `FEED_EXCLUDED_ACTIONS` | `status-board-format.ts:7`, `:46`, `:79-81` | No medical-notes surface in Camp 404. The exclusion list becomes `[]` — but **keep the mechanism**, because the reason it exists (one high-frequency action evicting every low-frequency decision from a 6-row card) will recur (e.g. `notification.read`). |
| **`.org-accent` / brand ramp.** `bg-ab-teal`, `bg-ab-apricot`, `bg-ab-sage`, `var(--color-ab-teal)` appear at `kpi-cards.tsx:11-14`; `registration-funnel.tsx:23,26,34`; `coverage.tsx:83,91,161,188,192,291`; `recent-activity.tsx:18-19`; `registrations-chart.tsx:61,64,77`; `status/page.tsx:53`; `(console)/page.tsx:120`. **Camp 404 has none of these tokens** (they are donor-only per the mechanical delta). They will silently compile to nothing. | | Retoken to Camp 404 semantics. `bg-ab-sage` → success, `bg-ab-apricot` → warning, `bg-ab-teal` → primary/accent, `bg-destructive` and `bg-muted-foreground` already exist in both. **Camp 404 lacks semantic `success`/`warning` tokens** (`design/recommendations.md` P0-2/P2-8 is still open) — this port is a forcing function for that. Camp 404 *does* have `--color-info`. |

### 10.4 Non-couplings worth stating (they look like coupling and are not)

- `apps/org/components/status-board/*` are **imported by exactly two files** — `(console)/status/page.tsx`
  and `(console)/page.tsx` (verified by grep). There is no third consumer, no `apps/suppliers`
  twin, and **no near-duplicate in another app** — unlike the `(account)` suite, this subsystem
  is *not* subject to the donor's "same application twice" warning (`docs/simplification-audit.md:58-60`).
- `org-stats.ts`'s consumers outside this unit: exactly one —
  `apps/web/lib/roles-store.ts:982` uses `isRegisteredStatus(status) || isInReviewStatus(status)`.
- The **only** `docs/simplification-audit.md` finding touching this unit is the
  `relativeTime` triplication (`:170-180`): the donor has three differently-formatted relative-time
  functions and org's status-board variant ("3 h ago") is a *fourth* format from the two
  notification ones ("3 hours ago"). If Camp 404 ports `relativeTime`, put it in
  `@camp404/core` **once**, and pin its output in a test before merging any variant.

---

## 11. Verbatim excerpts — the five most valuable pieces

### 11.1 `deriveWranglerCoverage` — the load-distribution metric and its ethics

`packages/core/src/org-stats.ts:254-287`. This is the single most transferable *idea* in the
unit: a coverage headline can look healthy while one volunteer holds most of the work, and the
fix is a distribution figure that is explicitly framed as one.

```ts
/**
 * Wrangler coverage for the Overview tile: "n of m approved camps have one".
 *
 * ELIGIBILITY IS APPROVAL, not registration. A camp that has not been approved
 * cannot be assigned (the action refuses it), so counting it as uncovered would
 * report work nobody is allowed to do yet and make the tile permanently red.
 *
 * `busiestLoad` is here because the failure mode of a volunteer roster is not
 * "nobody assigned" — it is one person quietly holding fifteen camps while the
 * headline number looks healthy. It is a load figure, not a performance one:
 * it names a distribution problem, and it says nothing about any individual's
 * work, which is the line this product does not cross.
 */
export function deriveWranglerCoverage(
  camps: readonly CampWranglerInput[],
): WranglerCoverage {
  let eligible = 0;
  let assigned = 0;
  const load = new Map<string, number>();
  for (const camp of camps) {
    if (!camp.isApproved) continue;
    eligible += 1;
    if (!camp.wranglerUserId) continue;
    assigned += 1;
    load.set(camp.wranglerUserId, (load.get(camp.wranglerUserId) ?? 0) + 1);
  }
  return {
    eligibleCamps: eligible,
    assigned,
    unassigned: eligible - assigned,
    wranglers: load.size,
    busiestLoad: load.size === 0 ? 0 : Math.max(...load.values()),
  };
}
```

Two rules to carry over verbatim: **(a) the denominator is what someone is *allowed* to act on**,
not what exists — otherwise the tile is permanently red and gets ignored; **(b) a load figure
is not a performance figure** — the same distinction Camp 404 will need the moment it counts
anything per-person.

### 11.2 `bucketSubmissionsByMonth` — the whole time-series engine

`apps/org/lib/status-board-format.ts:133-175`. UTC-safe, gap-filled, invalid-date-hardened,
runaway-guarded, and honest about "not enough data". This is **drop-in for Camp 404 today** —
zero domain coupling. Note it uses the platform `Date` with UTC accessors and
`setUTCMonth(getUTCMonth() + 1)` for the cursor advance, which satisfies Camp 404's recorded
constraint (no hand-rolled date math, no new date package).

```ts
/**
 * Bucket submission timestamps into consecutive calendar months, gaps filled
 * with zeroes so the x-axis is continuous. Returns [] for no input — the caller
 * omits the chart rather than drawing an empty plot.
 */
export function bucketSubmissionsByMonth(
  dates: readonly Date[],
): SeriesPoint[] {
  const valid = dates.filter((d) => !Number.isNaN(d.getTime()));
  if (valid.length === 0) return [];

  const counts = new Map<string, number>();
  for (const d of valid) {
    const key = monthKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = [...valid].sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const points: SeriesPoint[] = [];
  const cursor = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1),
  );
  const end = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1);
  // Guard against a runaway loop on absurd data (10 years of months).
  for (let i = 0; i < 120 && cursor.getTime() <= end; i += 1) {
    const key = monthKey(cursor);
    points.push({
      key,
      label: MONTHS[cursor.getUTCMonth()]!,
      count: counts.get(key) ?? 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return points;
}

/** True when there is enough history for a time series to mean anything. */
export function hasSeries(points: readonly SeriesPoint[]): boolean {
  return points.length >= 2;
}
```

with the month key at `:129-131`:

```ts
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
```

### 11.3 `RegistrationsChart` — a complete dependency-free chart

`apps/org/components/status-board/registrations-chart.tsx:1-99`. 100 lines, no library, works
in RSC (no `"use client"`), theme-aware via CSS custom properties, accessible
(`role="img"` + `aria-label` + per-point `<title>` + a number table), and horizontally
scrollable inside `overflow-x-auto` with `min-w-[280px]`.

```tsx
import { Card, CardContent } from "@quagga/ui/components/card";
import type { SeriesPoint } from "@/lib/status-board-format";

// Registrations over time — submissions per calendar month, straight from
// `registrations.submitted_at`. One series, so no legend box (the title names
// it); recessive grid; 2px line with an 8px marker per point carrying a native
// tooltip; a table view underneath so the numbers are readable without the
// plot. The page omits this card entirely when the series has fewer than two
// months — a chart is never drawn over invented points.

const W = 700;
const H = 150;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;

export function RegistrationsChart({ points }: { points: SeriesPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? W / (points.length - 1) : W;

  const coords = points.map((p, i) => ({
    ...p,
    x: i * step,
    y: PAD_TOP + plotH - (p.count / max) * plotH,
  }));
  const line = coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${coords[0]!.x},${H} ${line} ${coords[coords.length - 1]!.x},${H}`;
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const span = `${points[0]!.label} – ${points[points.length - 1]!.label}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Registrations over time</h2>
          <p className="text-xs text-muted-foreground">
            {span} · {total} submitted
          </p>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Registrations submitted per month, ${span}`}
            className="h-auto w-full min-w-[280px]"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1="0"
                x2={W}
                y1={PAD_TOP + plotH * f}
                y2={PAD_TOP + plotH * f}
                stroke="var(--color-border)"
                strokeWidth="1"
              />
            ))}
            <polygon points={area} fill="var(--color-ab-teal)" opacity="0.14" />
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-ab-teal)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {coords.map((c) => (
              <circle
                key={c.key}
                cx={c.x}
                cy={c.y}
                r="4"
                fill="var(--color-ab-teal)"
                stroke="var(--color-card)"
                strokeWidth="2"
              >
                <title>{`${c.label}: ${c.count} submitted`}</title>
              </circle>
            ))}
          </svg>
        </div>

        <ul className="flex justify-between gap-1 text-[0.65rem] text-muted-foreground">
          {points.map((p) => (
            <li key={p.key} className="tabular-nums">
              <span className="block">{p.label}</span>
              <span className="block font-semibold text-foreground">
                {p.count}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

Retoken list for Camp 404: `var(--color-ab-teal)` × 3 → a Camp 404 accent token. Everything
else (`--color-border`, `--color-card`, `text-muted-foreground`, `text-foreground`,
`tabular-nums`) exists in Camp 404's `@theme` already.

### 11.4 `getRecentActivity` — personal information decided *at the select*, and a SQL-level display filter

`apps/org/lib/status-board.ts:42-85`. Two portable ideas in one function: (a) the conditional
column spread `...(personal ? { actorEmail: … } : {})`, which is what makes a projection test
possible at all; (b) the exclusion applied in SQL rather than in the component, because a
JS-side filter after `LIMIT 6` returns fewer than six rows during a burst.

```ts
/**
 * The most recent audit events across the console (newest first), minus the
 * actions `FEED_EXCLUDED_ACTIONS` keeps out of a six-row card.
 *
 * Today that is medical reads only: one `bio.medical.view` row lands per
 * disclosing read, so a single roster walk emits dozens in a minute and would
 * evict every registration decision from this feed. They are not hidden — they
 * get `/audit`, which shows them WITH the enumeration alerts a six-row card
 * could never carry. The exclusion is a display decision made in one pure,
 * tested place (lib/status-board-format.ts), never an ad-hoc filter here.
 *
 * WHO did each thing is a staff member's email, so it is selected only for a
 * caller who reads personal information in the `audit` domain […]
 */
export async function getRecentActivity(
  actor: OrgActor,
  limit = 6,
): Promise<ActivityRow[]> {
  const db = getDb();
  const personal = canReadPersonalInformationIn(actor, "audit");
  const rows = await db
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      meta: schema.auditEvents.meta,
      createdAt: schema.auditEvents.createdAt,
      ...(personal ? { actorEmail: schema.users.email } : {}),
    })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorId))
    .where(notInArray(schema.auditEvents.action, [...FEED_EXCLUDED_ACTIONS]))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    actorEmail:
      "actorEmail" in r ? ((r.actorEmail as string | null) ?? null) : null,
  }));
}
```

Note the `"actorEmail" in r` narrowing at `:82-84` — the conditional spread means the type is
a union, and this is how the donor normalises it without a cast.

### 11.5 The no-edition / no-activation short circuits in `getStatusBoard`

`apps/org/lib/queries.ts:1682-1704` and `:1865-1875`. Both are asserted by tests that check
`db.calls` is empty / `db.recorded("select","required_actions")` is empty — i.e. the test
proves the *absence of a query*, not just the shape of a result.

```ts
/**
 * The full status-board read model (build-spec §"Org stats dashboard" +
 * §"Status board KPI row"). Fetches the raw rows and runs the pure @quagga/core
 * derivations so the org landing + Overview share one consistent source. Caller
 * must have cleared the gate. Degrades to all-zero derivations when no edition
 * is active (every derivation handles empty input).
 */
export async function getStatusBoard(
  edition: ActiveEdition | null,
): Promise<StatusBoard> {
  const db = getDb();

  if (!edition) {
    return {
      edition: null,
      kpis: deriveStatusBoardKpis({ bios: [], projects: [] }),
      funnel: deriveRegistrationFunnel([]),
      officerCoverage: deriveOfficerCoverage([]),
      wranglerCoverage: deriveWranglerCoverage([]),
      supplierOnboarding: deriveSupplierOnboardingRollup([]),
      supplierStandings: deriveSupplierStandingRollup([]),
      questionnaires: deriveQuestionnaireCompletion([]),
    };
  }
```

and

```ts
  const activationIds = activationRows.map((a) => a.id);
  const actionRows =
    activationIds.length === 0
      ? []
      : await db
          .select({
            activationId: schema.requiredActions.activationId,
            status: schema.requiredActions.status,
          })
          .from(schema.requiredActions)
          .where(inArray(schema.requiredActions.activationId, activationIds));
  const actionsByActivation = new Map<string, { status: string }[]>();
  for (const a of actionRows) {
    if (!a.activationId) continue;
```

**The `inArray([])` guard is not cosmetic** — drizzle's `inArray` with an empty array
produces `false`/an error depending on version, and skipping the round trip entirely is both
correct and free.

### 11.6 (bonus) The status-board loading boundary

`apps/org/app/(console)/status/loading.tsx:1-23` — 24 lines that close **WP7 #131**'s pattern
question ("what should a `loading.tsx` actually look like?").

```tsx
import { SkeletonRegion, SkeletonCard } from "@quagga/ui/components/skeleton";
import { ConsoleHeadingSkeleton } from "@/components/console-skeleton";

/**
 * /status — the board: two-thirds of cards on the left, the summary rail on the
 * right (`grid gap-4 lg:grid-cols-3` with a `lg:col-span-2`), matching the page.
 */
export default function StatusLoading() {
  return (
    <SkeletonRegion className="flex flex-col gap-6">
      <ConsoleHeadingSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    </SkeletonRegion>
  );
}
```

with the `data-loading="true"` + single-`aria-live` wrapper at
`packages/ui/src/components/skeleton.tsx:47-65` — "the `data-loading` hook that lets the E2E
suite assert a boundary actually appeared — 'we added a skeleton' is only true if a browser can
see it."

---

## 12. Notable patterns worth stealing even where the code is not

1. **Metric definitions live in the pure package; queries only fetch rows.** One derivation, two
   pages, provably identical numbers. `org-stats.ts:1-7`.
2. **Take minimal row shapes, never raw DB rows.** `BurnerBioStat` is `{completedAt}` and
   nothing else, so the test fixture is two fields, not a full user record. `org-stats.ts:6`.
3. **Every rollup returns a *dense* map.** `emptyRegistrationFunnel()` / `deriveSupplierStandingRollup`
   seed every enum member at 0 before tallying, so the UI never branches on "key absent".
   `org-stats.ts:171-175`, `:327`.
4. **Derive the complement, never count it twice.** `free = total - registered`,
   `campsWithGaps = applicable - full`, `unassigned = eligible - assigned`,
   `pending = sent - completed`. Four independent places, one habit.
5. **Divide-by-zero is a `=== 0 ? 0 :` ternary at every single ratio.** Six occurrences; there
   is no unguarded division anywhere in the unit.
6. **The denominator is what someone may act on.** `deriveWranglerCoverage:257-261`.
7. **Distribution, not performance.** `busiestLoad` names a lopsided roster and says nothing
   about a person. `org-stats.ts:262-265`.
8. **Omit rather than fake.** `hasSeries()` gates the chart; `TAIL_ORDER.filter(n > 0)` gates
   zero rows; `present.length > 0` gates the standings footer.
9. **Colour is never the only encoding.** Every bar direct-labelled; the chart has a number
   table.
10. **Display exclusions are one pure, tested constant — and applied in SQL.**
    `FEED_EXCLUDED_ACTIONS` + `notInArray`, with a source-text regression test proving the
    filter is not JS-side. `status-board-format.ts:79-81`, `status-board.ts:77`.
11. **Unknown enum members fall back to the raw key rather than inventing copy.**
    `ACTIVITY_LABELS[action] ?? action`; `activityTone` defaults `"neutral"`. `:50`, `:66`.
12. **Independent reads issued together.** `Promise.all` on both pages, with a comment saying
    why (`(console)/page.tsx:94-95`: "running them in series only added a round trip to every
    console landing"). This is Camp 404 WP7's `Promise.all` item, already solved.
13. **Test the absence of a query.** `expect(db.calls).toEqual([])`,
    `expect(db.recorded("select","required_actions")).toHaveLength(0)`.
14. **Derive test expectations from the fixture, never hardcode.**
    `org-stats.test.ts:23-26`, `:81-88`.
15. **Seed fixture values from the enum, and check the fixture moves the number.**
    `AGENTS.md:252-257` — the rule this exact subsystem's near-miss produced.
16. **Assert an invariant, not just a value.** "sum of buckets === input length" appears twice
    (`org-stats.test.ts:150-152`, `status-board-format.test.ts:57-69`).
17. **A loading boundary copies the destination's container classes verbatim.**
    `skeleton.tsx:8-13`, `console-skeleton.tsx:5-9`, `status/loading.tsx:4-7`.
18. **`data-loading="true"` on the skeleton region** so e2e can prove the boundary rendered.
19. **Append-only audit tables get a `created_at DESC` index matching the reader's ORDER BY.**
    `schema.ts:1719-1728`. Directly applicable to Camp 404's unused `audit_log`.
20. **Comments record decisions with dates and names** ("Ryan, 24 Jul", "migration 0026 is what
    made it untrue", "These read 'safety' and 'lnt' until 4 Aug 2026"). The comment at
    `coverage.tsx:39-42` even records what the tile *used to be* (a `DisabledHintTile` saying
    the feature wasn't built) — the honest placeholder Camp 404's `comingSoon: true` tiles are
    already doing.

---

## 13. Gotchas & warnings

1. **`RegistrationsChart` throws on `points = []`** — `coords[0]!` / `points[0]!` at
   `registrations-chart.tsx:29,31`. It is only safe because `status/page.tsx:64` guards with
   `hasSeries()`. Add an internal guard on port.
2. **`bg-ab-*` and `var(--color-ab-*)` do not exist in Camp 404** and will compile to nothing
   silently (no error, no warning) — Tailwind v4 just drops the unknown utility. 17 occurrences
   across 6 files (listed in §10.3). A visual diff will not catch a missing dot colour.
3. **Camp 404 lacks semantic `success`/`warning` tokens.** `design/recommendations.md`
   P0-2/P2-8 is still open. `bg-ab-sage` (good) and `bg-ab-apricot` (attention) have no direct
   target token today; `--color-info` exists but is the wrong semantic.
4. **`apps/org/lib/status-board.ts:1` is `import "server-only"`** and Camp 404's
   `apps/web/vitest.config.ts` has no `server-only` alias stub. Add one before unit-testing a
   lifted read module.
5. **`relativeTime` is the donor's fourth relative-time implementation.**
   `docs/simplification-audit.md:170-180` documents three others with different output
   ("3 h ago" vs "3 hours ago"). If Camp 404 ports it, put one in `@camp404/core` and pin its
   output in a test *before* consolidating.
6. **`deriveOnboardingProgress` treats a missing key as `pending`** (`suppliers.ts:87-93`), so
   `{}` and `null` both bucket as not-started. If the analogous Camp 404 rollup uses a jsonb
   map, replicate that leniency deliberately — the "partial by design" note is at
   `packages/types/src/suppliers.ts:89-93`.
7. **`tallyActivationCompletion` counts `waived` and `expired` as OUTSTANDING**, not done
   (`questionnaire-activation.ts:132-140`). Camp 404's `required_action_status` has both of
   those members (`camp-404/packages/db/src/schema.ts:125`), so this is a live product decision
   on port, not a detail: a waived action shows as owed.
8. **`FakeDb` proves projection, not SQL.** `fake-db.ts:13-21` says a green test there "must
   never be reported as evidence that a query is correct". Camp 404's PGlite harness proves the
   opposite half. Use both, and do not let one stand in for the other.
9. **The queue-seeding convention is order-dependent.** `getStatusBoard` reads `registrations`
   three times and the test seeds `[[funnel],[officers],[wranglers]]` (`queries-projection.test.ts:988-997`).
   Reordering two reads in the implementation silently reassigns the fixtures. Only reads
   consume a queue entry (`fake-db.ts:130-138`).
10. **`getStatusBoard` issues 8 sequential `await`s** (bios → projects → registrations →
    campRegs → officerAssignments → wranglers → suppliers → activations → requiredActions).
    They are **not** `Promise.all`'d despite the pages doing so at the outer level. On Neon
    HTTP that is 8–9 round trips per console landing. Camp 404 should batch these when porting.
11. **`officerAssignmentRows` is queried unfiltered by edition** (`queries.ts:1744-1759` — the
    only `where` is `projectRoles.kind = "officer"`). It scans every officer assignment ever
    made, then filters in JS by group. Low confidence on whether that is deliberate; flagged
    as a scaling smell, not a proven bug.
12. **No e2e test asserts any number on either page** — only that a `god` can reach `/status`
    (`e2e/specs/god/god-bootstrap-and-surfaces.spec.ts:27`). And per `AGENTS.md:59-69`, the unit
    gate never runs a browser at all.
13. **`docs/architecture.md:33` and `:131` say "45 tables"; there are 44.** Do not propagate
    donor doc statistics; count them.
14. **`org-stats.ts` is not on the coverage ratchet's per-file floor list** — only the global
    floors apply to it (`packages/core/vitest.config.ts`). Camp 404 has no coverage tooling at
    all, so adopting the ratchet is a separate decision from adopting this code.
15. **Camp 404's `audit_log` has zero producers** (`camp-404/packages/db/src/schema.ts:1180`).
    `RecentActivity` + `ACTIVITY_LABELS` + `activityTone` are ready to render a feed that
    currently has nothing to render. The writer comes first.
