# RosterRow — organism plan

- **mapsTo + home:** **NEW** (board-implied; not among the canvas reusables, not in
  `@camp404/ui` today) · **lives in `apps/web`** (app-local — per
  `component-library.md` §RosterRow "mapsTo: NEW (app-local)") · captain-only surface,
  rides the preview-but-locked spine.
- **Target file paths:**
  - `apps/web/app/captains/camp-management/roster-row.tsx` (the responsive row; both
    `responsive="table"` and `responsive="list"` render modes in one file).
  - Mounted by its two list wrappers, also app-local and NEW:
    `roster-table.tsx` (terminal `<table>`) and `roster-list.tsx` (mobile `<ul>`), which
    replace the inline `<table>` currently hand-rolled in
    `apps/web/app/captains/camp-management/camp-management-roster.tsx` (this organism's
    redesign target). Those two wrappers are speced as siblings in
    `component-library.md` ("RosterTable / RosterList are the responsive pair"); this plan
    covers the row and the contract it owes those wrappers.
- **Why app-local, not `packages/ui`:** it binds to the app's `RosterRow` view-model
  (`apps/web/lib/camp-roster.ts`), the app-resident `MemberProfile` selection flow, and
  the captain surface's preview-but-locked semantics. It composes only PROMOTED/REUSED
  `@camp404/ui` atoms + `@camp404/core` pure helpers; it ships no DB/`next/*` of its own
  (it is a presentation child of the `"use client"` roster container).

---

## Current state — what exists today (the old design's component/route markup)

There is **no `RosterRow` component** today. One row is hand-rolled as a `<tr>` inside the
single client file, and the "row" anatomy the boards specify (status bar, mono-tinted
avatar, @handle/country sub-line, emoji role badge, open chevron, responsive table↔list
pair) does not exist — the live surface is a single wide Inter `<table>` with a different
column set.

- **`apps/web/app/captains/camp-management/camp-management-roster.tsx`** (`"use client"`,
  541 lines) — the file this organism redesigns:
  - `:166-275` — one inline `<table>` (`text-sm`, `border-collapse`) with a 7-column
    `HeaderRow` (`:168-192`): **Member · Rank · Status · Questionnaires · Driver · In SA
    · Country** (the live columns the boards replace — `surfaces/14-roster.md`
    §Divergences row "Live columns … 7-col").
  - `:211-272` — the row itself: a `<tr>` with `onClick={() => setSelectedId(r.id)}` +
    `hover:bg-muted/30`. Cells: name + comma-joined teams sub-line (`:217-224`); a
    rank pill (`:225-238`, inline `<span>` switching `bg-primary/15`/`bg-sky-500/15`/
    `bg-muted` by `rank`/`isLead`); a status pill (`:239-255`, inline `<span>` keyed off
    the local `STATUS_STYLE` map); three `YesNo` tick/dash cells (`:256-267`); a plain
    country cell (`:268-270`).
  - **No status colour bar, no avatar, no @handle, no emoji role badge, no open chevron,
    no responsive list variant** — the boards' entire row anatomy is net-new.
  - `:43-49` `STATUS_STYLE` record — off-token raw classes
    (`bg-emerald-500/15 text-emerald-400`, `bg-amber-500/15`, `bg-sky-500/15`,
    `bg-rose-500/15`); **dies** when Badge + status tokens land (see Badge plan
    §Absorbs "role-badge" and the migration note `atom-badge.md:311-313`).
  - `:51-56` `teamLabel` helper; `:58-71` `YesNo` cell helper (the live Questionnaires/
    Driver/In-SA facets — dropped as roster *columns* per
    `surfaces/14-roster.md` §Divergences "keep the live yes/no facets … in the
    profile/Outstanding, not as roster columns"); these become MemberProfile concerns,
    not RosterRow.
  - `:159-164,278-289` — the **bespoke locked treatment**: `opacity-40 blur-[2px]` +
    `PlaceholderRows` + an inline `Lock` "Captain access only" card. This is the
    redirect-replacement the spec **drops** in favour of the shared `CaptainLock`
    (`surfaces/14-roster.md` §8; `molecule-captainlock.md` mapsTo cites this exact file
    as a PROMOTE source). RosterRow's locked behaviour changes accordingly (see States).
- **`apps/web/app/captains/camp-management/page.tsx`** (`force-dynamic`, server) —
  `:31-33` `isCaptain ? (await getCampManagementRoster()).map(toRosterRow) : []`:
  preview-but-locked **zero-rows** for non-captains is **already implemented** at the
  page (decision #3 satisfied at the data boundary;
  `service-layer/05-roster-approvals-promotion.md` §REUSE).
- **`apps/web/lib/camp-roster.ts`** (`:15` `interface RosterRow`, `:60` `toRosterRow`,
  `:97` `rankLabel`) — the **pure view-model the row consumes**. Exists; carries
  `displayName`, `rank`, `isLead`, `rankLabel`, `teams`, `status`/`statusLabel`,
  `approvalStatus`, `pendingRequiredActions`, `country`. **Missing for the new row:**
  `handle`, an avatar `tint`/`initials`, and a `statusTone` mapping (today the colour
  lives in the component's `STATUS_STYLE`, off-token). EXTENDs tracked below.
- `@camp404/ui` has **avatar** (REUSE, needs the `tint`/mono-tinted variant from
  `atom-avatar.md`) but **no badge, no code-display, no captain-lock** yet — all three
  are PROMOTE targets this organism depends on (their plans exist under
  `design/spec/impl/components/`).

Confirmed: the row, its status bar, mono-tinted avatar, @handle sub-line, emoji role
badge, chevron, and the responsive table↔list pair are **all NEW**; only the underlying
view-model (`RosterRow`) and the page's zero-rows gate pre-exist.

---

## Composition — leaves, core helpers, services, server/client split

### Leaf components it consumes (link plans)

| Leaf | Plan | Role in the row | Marking |
|---|---|---|---|
| **Avatar** | [`atom-avatar.md`](./atom-avatar.md) | `variant="mono-tinted"` — mono initials on a per-member tint, `h-9 w-9` (34px), `rounded` (`r:4`) square in both table + list. Consumer passes `initials` + `tint` (atom is logic-free; see helpers). | REUSE (needs the `tint`/mono-tinted EXTEND from its plan) |
| **Badge** | [`atom-badge.md`](./atom-badge.md) | **RoleBadge** = emoji + label rendered through `Badge` (`atom-badge.md` §Absorbs "role-badge" + the roster consumer row `:348`). Emoji (🐱 Member / 🦩 Captain / 🪄 Lead) sits in the Badge label slot; tone follows rank. Also the optional Outstanding affordance if surfaced inline. | NEW usage of PROMOTE Badge |
| **CodeDisplay** | [`molecule-codedisplay.md`](./molecule-codedisplay.md) | OPTIONAL — the `@handle`/country sub-line is **plain mono text**, not a copy-affordance, so it needs only the `--text-mono` token, NOT the full CodeDisplay molecule. CodeDisplay is referenced only for the mono *type* convention; the row does not mount it. (CodeDisplay proper is used by MemberProfile for the redacted government ID.) | not mounted (mono token only) |
| **lucide `ChevronRight`** | — | The "open" affordance on the trailing edge (`chevron-right`, `surfaces/14-roster.md` §4). `aria-hidden`; the row's accessible name carries the action. | external icon |

**Sub-atoms that are NOT separate component files** (drawn as row-local markup, per
`component-library.md` "Three+ rows stay distinct … only shared atoms, not a row shape"):

- **StatusBar** — a 4px left rule (`<span aria-hidden>` / `border-l-4` / a thin filled
  div), colour by `statusTone` (see tokens below). Bespoke to the row anatomy; not
  promoted.
- **RoleBadge** — composed *via Badge* (emoji + label), not its own file
  (`atom-badge.md` absorbs it).
- The selected-row **accent wash** + alternating-row tint — row container classes, not
  components.

### `@camp404/core` pure helpers

| Helper | Source / plan | Use |
|---|---|---|
| `initialsFrom(name)` | `@camp404/core` (extracted from `apps/web/lib/initials.ts` — `architecture.md` Hybrid table, plan 09) | Compute avatar initials; consumer passes the result to Avatar `initials` (atom never calls it — `atom-avatar.md` §Composition). |
| `avatarTintFor(userId)` | **NEW** in `@camp404/core` (`atom-avatar.md` §Tokens + Build Step 1) | Deterministic per-member tint slot (`primary｜accent｜secondary｜success｜warning`); consumer passes to Avatar `tint`. Replaces the boards' raw hex fills with token-derived hues. |
| `rankLevel`/`RANK_ORDER` (indirect) | `@camp404/core` (`architecture.md` Hybrid, plan 01) | Not called by the row directly; rank label is precomputed in `rankLabel` (view-model). Listed for the role-badge tone derivation if done in core later. |

The row imports **no DB and no `next/*`** — it receives already-derived data as props.
`toRosterRow` / `rankLabel` / `deriveRosterStats` stay **pure-but-in-app** in
`apps/web/lib/camp-roster.ts` (`service-layer/05-roster-approvals-promotion.md` §Hybrid
"STAY pure-but-in-app").

### Services / server-actions

RosterRow **calls no service or server-action itself.** It is a presentational child:

- **Data it renders** comes from `getCampManagementRoster()` →
  `toRosterRow()` (the `RosterRow` view-model), fetched in the **server**
  `page.tsx` and passed down (`service-layer/05` §Consumers row 1). The page's
  `isCaptain ? … : []` is the preview-but-locked zero-rows boundary.
- **Selection** — `onSelect(id)` is a callback prop bubbled up to the `"use client"`
  container (`camp-management-roster.tsx`), which owns `selectedId` state and opens
  `MemberProfile`; the profile fetch (`getMemberDetailAction`,
  `service-layer/05` §Target API) happens **above** the row, not in it.
- `getCampManagementRoster` is **EXTENDed** to add `handle` (from `telegramHandle`) to
  the SELECT + `CampManagementMember.handle` (`service-layer/05` §EXTEND, §Target API);
  this is upstream of the row but is the row's data prerequisite for the @handle sub-line.

### Server-component vs `"use client"` split

- **RosterRow itself is presentational and can be a plain (RSC-compatible) component** —
  no hooks, no event handlers of its own beyond invoking the `onSelect` prop. In practice
  it renders **inside** the `"use client"` roster container (`camp-management-roster.tsx`,
  which owns `useState` for query/filter/selection), so it ships as part of the client
  bundle. It declares no `"use client"` directive of its own — it inherits the parent's.
- The page (`page.tsx`) stays the **server** boundary that fetches + gates the data; the
  client container owns interaction; the row is a dumb leaf of that container.

---

## API & data flow

### Props (the row contract)

Per `component-library.md` §RosterRow ("Props: `member` · `statusTone` · `selected` ·
`onSelect` · `responsive`"):

```ts
import type { RosterRow as RosterRowVM } from "@/lib/camp-roster";

export type RosterStatusTone =
  | "success"     // ready / approved
  | "accent"      // onboarding / active  (info = accent)
  | "warning"     // awaiting approval / pending / outstanding
  | "destructive" // rejected / blocked
  ;

export interface RosterRowProps {
  /** The pure per-member view-model (apps/web/lib/camp-roster.ts).
   *  Carries displayName, rank, isLead, rankLabel, teams, status,
   *  approvalStatus, pendingRequiredActions, country, and (EXTEND) handle. */
  member: RosterRowVM;
  /** Status colour bar tone, derived from member.status. Pass the result of
   *  statusToneFor(member.status); the row does not import the mapping table so
   *  the table + list stay token-consistent. */
  statusTone: RosterStatusTone;
  /** Pre-computed avatar tint slot (avatarTintFor(member.id)) + initials
   *  (initialsFrom(member.displayName)) — atom is logic-free. */
  tint: import("@camp404/core").AvatarTint;
  initials: string;
  /** Selected = inline MemberProfile is open for this member. */
  selected: boolean;
  /** Bubble selection to the client container (sets selectedId). Omitted/no-op
   *  in the locked preview (controls inert). */
  onSelect?: (id: string) => void;
  /** Render mode. table = terminal console <tr>; list = mobile stacked row.
   *  The wrapper (RosterTable/RosterList) picks this per breakpoint. */
  responsive: "table" | "list";
}
```

### What it fetches vs receives

- **Receives everything** — `member` (view-model), `statusTone`, `tint`, `initials`,
  `selected`, `responsive`. It **fetches nothing**; all reads happen in `page.tsx`
  (roster) / the container (detail).
- **No forms, no validation** in the row. (Approve/Reject/Assign-captain forms +
  validation live in `MemberProfile` / the dialogs — `service-layer/05` §Target API
  actions; `component-library.md` §MemberProfile / §AssignCaptainDialog /
  §RejectConfirmDialog.) RosterRow's only "action" is select.

### How state flows

```
page.tsx (server)
  getCampManagementRoster()  →  toRosterRow[]   (or []  ⟵ non-captain, preview-but-locked)
        │ passes rows + locked
        ▼
camp-management-roster.tsx ("use client")
  useState: query, filter, selectedId
  derive: filtered = rows.filter(matchesRosterQuery & matchesChip)   (EXTEND, pure helpers)
        │ for each filtered row → RosterRow
        ▼
RosterRow (this organism)
  renders StatusBar(statusTone) + Avatar(tint,initials) + name + @handle·country
        + RoleBadge(rank,isLead) + ChevronRight
  onClick → onSelect(member.id)  ──────────────►  container sets selectedId
                                                  → opens <MemberProfile> (sibling)
```

The row is **stateless**; `selected` is derived by the container
(`selectedId === member.id`) and passed down. Counts shown by the surrounding stats
strip + filter chips come from `deriveRosterStats(rows)` (NEW pure helper,
`service-layer/05` §EXTEND) — not the row's concern, but the row's `member.status` /
`approvalStatus` / `pendingRequiredActions` feed those reductions, so the row's
status derivation must reconcile (`surfaces/14-roster.md` §Validation "Counts must
reconcile").

---

## States — every state incl. the global matrix + gating

Applied to the row specifically (the surface-wide matrix lives in
`surfaces/14-roster.md` §States; here is the row's share):

| State | Row behaviour |
|---|---|
| **default** | StatusBar (tone by status) + mono-tinted Avatar + name + `@handle · flag · country` sub-line + RoleBadge (emoji+label) + `chevron-right`. Hover: subtle row tint. |
| **alternating** | Non-selected rows alternate `#ffffff07` / transparent (`surfaces/14-roster.md` §4) → token: `bg-foreground/[0.03]` on odd rows (replace raw hex per `design-tokens.md` §2.3). Index passed by the wrapper or `:nth-child`. |
| **selected** | Accent wash on the row container (`#00dcff14` → `bg-accent/[0.08]`, token-spelled); **mobile**: the name turns `$accent` (`surfaces/14-roster.md` §4 "Selected row name turns `$accent`"). `aria-selected` / `aria-current` set; the open inline `MemberProfile` is the visual continuation. |
| **empty** | **Not a row state** — emptiness is rendered by the wrapper (`RosterTable`/`RosterList`), which shows the EmptyState copy instead of rows: "No members have signed up yet." (zero rows) / "No members match your search." / "Nobody is awaiting approval." (per active filter) — `surfaces/14-roster.md` §States Empty. The row simply isn't mounted. |
| **loading** | **Not a row state** for the roster list (rows arrive server-rendered with the page). The inline-profile fetch spinner is a `MemberProfile` concern. In the locked preview the wrapper MAY render inert skeleton rows (structure, no data) — see gating. |
| **error** | **Not a row state** — detail-fetch/action errors surface in `MemberProfile`'s actions footer (`role="alert"`, `surfaces/14-roster.md` §States). The row does not show errors. |
| **submitting / success** | **Not a row state** — approve/reject/assign in-flight + success (counts/status-pill refresh) are `MemberProfile`/dialog states. On success the page re-renders (`revalidatePath` + `router.refresh()`), so the row re-receives an updated `member` view-model (e.g. status flips off `pending`); it is a pure re-render, no local mutation. |
| **disabled** | When the surrounding surface is locked, `onSelect` is omitted/no-op and the row is inert (no pointer, no focus) — see gating. |
| **preview-but-locked (the gating headline — captain/rank surface)** | This **is** a captain/rank surface (decision #3). Non-captain viewers: the server sends **zero rows** (`page.tsx:31-33`), so **no RosterRow instances mount at all** — the row's "locked" contribution is *absence of data*, not a greyed copy of itself. The shared **`CaptainLock`** panel ([`molecule-captainlock.md`](./molecule-captainlock.md)) renders the chrome-level "VIEW ONLY · no data for your rank" treatment; the wrapper renders structure (header row / empty body or inert skeleton) with controls inert. The bespoke `opacity-40 blur-[2px]` + inline `Lock` card + `PlaceholderRows` in the current file (`camp-management-roster.tsx:159-164,278-289`) is **DELETED** and replaced by `CaptainLock` (`surfaces/14-roster.md` §8; decision #2). This is **NOT a redirect, NOT an overlay** — structure renders, data is withheld upstream. |

**Role/rank presentation (all three ranks, decision carry):** the RoleBadge
distinguishes 🐱 Member / 🦩 Captain / 🪄 Lead — **Captain from `rank==='captain'`,
**Lead** derived from `team_memberships.is_lead` (the view-model's `isLead`), Member
otherwise (`surfaces/14-roster.md` §4 "Role/rank is presentation only"). The inline
profile's rank tag is Captain/Member only — the live asymmetry the spec flags; the row
is the place that shows all three.

**StatusBar tone mapping** (4px bar colour; replaces the off-token `STATUS_STYLE`):

| `member.status` (`RosterStatus`) | `statusTone` | Token |
|---|---|---|
| `ready` | `success` | `--color-success` (was `#3fd07a` / emerald — `design-tokens.md` §2.2) |
| `onboarding` | `accent` | `--color-accent` (= info; was amber on the live status pill — reconcile per spec §2 token-drift note) |
| `awaiting_approval` / `pending` | `warning` | `--color-warning` (was sky/rose — `design-tokens.md` §2.2) |
| `rejected` | `destructive` | `--color-destructive` |

The board's bar uses `$accent`=onboarding/active, `#3fd07a`=approved/ready,
`$destructive`=rejected/blocked (`surfaces/14-roster.md` §4); awaiting/pending →
`warning` per the status-token plan. A pure `statusToneFor(status): RosterStatusTone`
helper (NEW, co-located in `apps/web/lib/camp-roster.ts`) keeps table + list consistent
and replaces the deleted `STATUS_STYLE`.

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Dependency prerequisites (must land first):**

1. **Foundations (Phase 0, `foundations-tokens.md`):** status tokens
   `success`/`warning`/`info(=accent)` + foregrounds in `globals.css`, the radius scale,
   and `--text-mono`. Gates StatusBar tone + Badge + the mono @handle sub-line. **Hard
   prerequisite** (`atom-badge.md` "Badge ships only after that step lands";
   `design-tokens.md` §2.2).
2. **`@camp404/core` scaffold + helpers (Phase 1/3):** `initialsFrom` (extracted) and
   `avatarTintFor` (NEW — `atom-avatar.md` Build Step 1). Gates the mono-tinted avatar.
3. **Avatar EXTEND (`atom-avatar.md` Build Step 2):** `tint` + `mono-tinted` variant
   (`font-mono font-bold text-white`, square-rounded). Gates the row's avatar.
4. **Badge PROMOTE (`atom-badge.md`):** the `packages/ui/src/components/badge.tsx`
   primitive (tones × variants). Gates the RoleBadge.
5. **CaptainLock PROMOTE (`molecule-captainlock.md`):** the shared locked panel that
   replaces the bespoke lock treatment in the surface. Gates the locked-preview cleanup.
6. **View-model EXTENDs (`service-layer/05` §EXTEND):** `getCampManagementRoster` +
   `CampManagementMember.handle` (from `telegramHandle`); `RosterRow.handle` + carry in
   `toRosterRow`; NEW `statusToneFor` co-located in `camp-roster.ts`. Gates the @handle
   sub-line + StatusBar tone. (Handle null-fallback decided per
   `surfaces/14-roster.md` OQ#2.)

**Ordered build:**

1. **EXTEND the view-model** (`apps/web/lib/camp-roster.ts`): add `handle` to `RosterRow`
   + carry it in `toRosterRow`; add `statusToneFor(status)`.
   *Acceptance:* a member with `telegramHandle` exposes `handle`; null handle yields the
   agreed fallback; `statusToneFor` returns the table tone for every `RosterStatus`.
   *Test:* EXTEND `apps/web/lib/__tests__/camp-roster.test.ts` — handle/no-handle cases +
   exhaustive `statusToneFor` mapping.
2. **Build `roster-row.tsx`** — the responsive row composing StatusBar (`statusToneFor`
   colour) + Avatar (`mono-tinted`, `tint`+`initials`) + name + `@handle · flag ·
   country` sub-line (mono token) + RoleBadge (Badge, emoji+label by rank/isLead) +
   `ChevronRight`. Two render modes keyed off `responsive`: `table` → `<tr>`/`<td>`
   cells (MEMBER · HANDLE · COUNTRY · ROLE · [view]); `list` → a stacked 58px row
   (status bar, avatar, name + sub-line, trailing role emoji). `onClick → onSelect(id)`;
   `selected` → accent wash (+ mobile name accent); alternating tint by index.
   *Acceptance:* table + list snapshots match the boards (`37-…terminal-console`,
   `38-…mobile`); all three ranks render the correct emoji+label; selected + alternating
   visuals correct; no raw hex (tokens only); chevron `aria-hidden`.
   *Test:* `roster-row.test.tsx` (RTL) — renders name/@handle/country/role; `onSelect`
   fires with `member.id` on click + on Enter/Space; `selected` sets `aria-current`;
   omitting `onSelect` makes the row inert (locked); Member/Captain/Lead badge cases.
3. **Build `roster-table.tsx` + `roster-list.tsx` wrappers** — HeaderRow + map rows;
   empty-state copy per active filter (EmptyState); responsive switch (`hidden sm:block`
   table / `sm:hidden` list); in the locked preview render `CaptainLock` + structure with
   inert/skeleton body (no data). Pass `selected = selectedId === member.id` and
   precompute `tint`/`initials`/`statusTone` per row.
   *Acceptance:* zero rows → correct empty copy; filtered-to-zero → "No members match…";
   locked → `CaptainLock` panel + inert chrome (no rows, no live data); breakpoint swap
   correct at `sm`.
   *Test:* wrapper tests — empty/filtered-empty/locked branches; one selected row;
   reconcile visible filtered rows with `deriveRosterStats` counts.
4. **Rewire `camp-management-roster.tsx`** — replace the inline `<table>` (`:166-275`)
   with `<RosterTable>`/`<RosterList>`; delete `STATUS_STYLE` (`:43-49`), `YesNo`
   (`:58-71`), and the bespoke lock treatment (`:159-164,278-289`) in favour of
   `CaptainLock`; keep the container's `useState` (query/filter/selectedId) and wire
   `matchesRosterQuery`/`matchesChip` (EXTEND, `service-layer/05`).
   *Acceptance:* the surface renders the boards' row anatomy at both breakpoints; non-
   captain shows `CaptainLock` + no rows (no blur/redirect); selecting a row opens
   `MemberProfile`; no dead `STATUS_STYLE`/`YesNo`/`PlaceholderRows` remain.
   *Test:* container test — select bubbles to open profile; locked path renders
   CaptainLock and mounts no rows/profile/dialogs.
5. **a11y pass** — the row is a single activatable target: it carries the accessible
   name (member name + role), `role="row"`/`button` semantics as appropriate for
   table vs list, keyboard-activatable (Enter/Space), focus-visible ring; decorative
   StatusBar/Avatar/chevron `aria-hidden`; `aria-current`/`aria-selected` on the open row.
   *Acceptance:* keyboard-only selection works; SR announces "{name}, {role}, open
   profile"; no a11y-addon violations.

**Acceptance criteria (organism-level):** drops **no** functionality — the live yes/no
facets (Questionnaires/Driver/In-SA) and full country/teams data are **not lost**, they
move to `MemberProfile`/Outstanding per `surfaces/14-roster.md` §Divergences; the row
adds the boards' status bar, mono-tinted avatar, @handle, three-rank role badge, chevron,
and the responsive table↔list pair. Preview-but-locked is data-withheld + `CaptainLock`,
never a redirect/blur/overlay.

---

## Consumers — which surfaces mount it

- **S14 Roster** (`surfaces/14-roster.md`, route `/captains/camp-management`) — the
  **only** surface. Mounted via its wrappers: `RosterTable` (terminal console,
  `≥ sm` ~1040px) and `RosterList` (mobile, `< sm` 430px), inside the
  `"use client"` `camp-management-roster.tsx` container, under the server `page.tsx`
  preview-but-locked data gate. Canonical boards:
  `37-s17-roster-iteration-b-terminal-console` (table) and
  `38-s17-roster-iteration-b-mobile` (list). No other surface uses RosterRow (the
  distinct rows — TreeRow / NotificationRow / ReorderRow — have their own anatomy,
  `component-library.md` "Three+ rows stay distinct").
