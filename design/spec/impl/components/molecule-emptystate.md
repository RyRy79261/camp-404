# EmptyState — molecule plan

- **mapsTo:** PROMOTE (no existing `@camp404/ui/empty-state.tsx`; pattern is
  hand-rolled inline across multiple `apps/web` surfaces) · Target file:
  `packages/ui/src/components/empty-state.tsx`

---

## Current state — does it exist? where? gap vs spec

**`packages/ui/src/components/empty-state.tsx` — does NOT exist.** Confirmed by
directory listing — no `empty-state.tsx` or `emptystate.tsx` in
`packages/ui/src/components/`.

The board definition (`design/.spec-extract/boards/08-emptystate.txt`) describes a
64×64 muted circle (`r:999 fill:$muted`) with an `inbox` lucide icon
(`$muted-foreground`), a 16px/700 heading, and a 13px/normal body in
`$muted-foreground`. It is a named reusable component (`kind: COMPONENT`) —
not a one-off screen element.

The component is also referenced as a reusable from S24 Primitive kit
(`33-s24-primitive-kit.txt`): `<EmptyState>` with overrides "Nothing here yet" and
"When there's something to show, it'll appear here."

Today the empty-state treatment is reinvented inline across every consumer:

| File | Pattern | Gap |
|---|---|---|
| `apps/web/app/notifications/page.tsx:54` | `<p className="text-sm text-muted-foreground">No notifications yet.</p>` | Plain text only — no icon circle, no heading/body structure, no `full` variant anatomy per board 08 |
| `apps/web/app/captains/announcements/announcements-manager.tsx:281` | `<p className="text-sm text-muted-foreground">No drafts.</p>` | Same plain-text pattern; open question B18 (`open-questions.md:71`) asks whether to adopt the canvas `EmptyState` or keep inline — **resolved here: adopt** |
| `apps/web/app/captains/announcements/announcements-manager.tsx:334` | `<p className="text-sm text-muted-foreground">Nothing published yet.</p>` | Same plain-text pattern |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:206` | `<td>…No members have signed up yet./No members match your search./Nobody is awaiting approval.</td>` | Table-cell fallback; no shared empty-state component |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:283` | `<p className="text-sm text-muted-foreground">…</p>` | Profile sub-section inline fallback |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:431-432` | `<p className="text-sm text-muted-foreground">No questionnaire answers on record yet.</p>` | Same |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:511` | `<p className="text-sm text-muted-foreground">Nothing recorded.</p>` | Same |
| `apps/web/app/family-tree/family-tree.tsx` (approx) | `<Card><CardContent className="py-10 text-center text-sm text-muted-foreground">…</CardContent></Card>` | Closest to `inline` variant anatomically (no icon circle); uses Card/CardContent wrapper rather than the spec's muted-box |

**EmptyLog (`design/spec/surfaces/12-my-forms.md:70`):** described as an inline
muted box (`pad:[20,16] fill:$muted r:$radius`) with plain text — no heading/icon.
The surface brief explicitly says "not the shared `EmptyState` component". The
merge map in `component-library.md` resolves this: `EmptyLog` becomes
`<EmptyState variant="inline">` (no icon circle). The anatomy aligns — a muted
background box with body text only.

**Gap summary:**

- No shared component — 8+ inline reinventions; every instance is a plain `<p>`
  or `<Card>` fallback with no icon, no structured heading/body, and no consistent
  padding.
- Family-tree uses a `Card` wrapper (the `inline` pattern without the muted fill
  that board 08 requires); it is the closest current analogue but is still
  structurally divergent.
- The notifications empty state (`bell-off` icon, 15px/600 heading per board 09,
  `pad:[40,24]` vertical centred layout) is described in
  `design/spec/surfaces/09-notifications.md:52-56` as the canonical `full` variant
  with a different icon override — nothing in code matches it today.
- The `EmptyLog` inline text box in My-forms detail (`12-my-forms.md:70`) will
  become `variant="inline"` per merge map; the current live code for that surface
  has not yet been implemented.

---

## API — props, variants, sizes, states

```ts
import type { LucideIcon } from "lucide-react";

type EmptyStateVariant = "full" | "inline";

interface EmptyStateProps {
  /** Lucide icon component to render inside the circle (full variant only).
   *  Ignored when variant="inline". Default: Inbox. */
  icon?: LucideIcon;
  /** Short heading line. Inter 16/700 $foreground (full); omitted in inline. */
  heading: string;
  /** Longer body / helper copy. Inter 13/normal $muted-foreground. Required. */
  body: string;
  /** full = icon-circle + heading + body (board 08, S24 specimen).
   *  inline = muted-fill box + body only (EmptyLog — 12-my-forms.md).
   *  Default: "full". */
  variant?: EmptyStateVariant;
  /** Extra className forwarded to the root element. */
  className?: string;
}
```

**Variants:**

| Variant | Root | Icon circle | Heading | Body |
|---|---|---|---|---|
| `full` | vertical flex, `gap:12 pad:[32,24] ai:center` | `<IconBadge size="lg" shape="circle" tone="muted">` — 64×64, `$muted` fill | Inter 16/700 `$foreground` | Inter 13/normal `$muted-foreground` |
| `inline` | `pad:[20,16] fill:$muted r:$radius` (no flex column centre) | none | none | Inter 13/normal `$muted-foreground` |

**Sizes:** No explicit `size` prop — the board defines one size for `full` (64×64
icon circle) and the `inline` variant is text-only.

**States:** Static — `EmptyState` is always presentational. It renders once the
host determines there are no items; the host owns the data-loading state. No
loading, error, or interactive state on the component itself.

---

## Tokens & type — exact design tokens + type-scale roles used

All values resolved from `design/spec/design-tokens.md` and
`design/spec/component-library.md`. No raw hex; no `dark:` variants.

| Element | Token | Type role |
|---|---|---|
| Root container (full) | `pad:[32,24]` (inline: `bg-muted rounded-[--radius] pad:[20,16]`) | — |
| Icon circle fill | `bg-muted` | — |
| Icon colour | `text-muted-foreground` | — |
| Heading (full only) | `text-foreground` | `--text-subtitle` (Inter 16/700, lh 1.3) |
| Body text | `text-muted-foreground` | `--text-body` (Inter 13/normal, lh 1.45) — board 08 draws 13/normal, matching the caption/muted role boundary |

**Radius:**

- `full` variant: no border/fill on the root container; `IconBadge` circle uses
  `rounded-full` (`--radius-full: 9999px`).
- `inline` variant: root gets `rounded-[--radius]` (0.625 rem / 10 px = `$radius`).

**No status tokens involved** — `EmptyState` always uses the `muted` tone; it is a
neutral placeholder, never a success/warning/error state.

---

## Composition & deps — atoms/primitives + @camp404/core helpers

| Dep | Role | Notes |
|---|---|---|
| `IconBadge` (`packages/ui/src/components/icon-badge.tsx`) | 64×64 icon circle in `full` variant | `size="lg" shape="circle" tone="muted"`; icon prop forwarded. `IconBadge` must exist before EmptyState can ship its `full` variant. |
| `cn` (`packages/ui/src/lib/utils`) | className merging | Same pattern as every other `@camp404/ui` component |

No `@camp404/core` helpers are needed — EmptyState is purely presentational with
no data/logic contract.

---

## Absorbs — candidates replaced (from the merge map)

From `design/spec/component-library.md` merge map:

| Absorbed candidate | Where it lives today | Disposition |
|---|---|---|
| **EmptyState** (board 08) | Referenced as a reusable canvas component; no code implementation yet | Becomes `<EmptyState variant="full">` |
| **EmptyLog** (inline variant — `12-my-forms.md:70`) | Described as a bespoke inline box; not yet implemented in code | Becomes `<EmptyState variant="inline">`. The `inline` variant captures the `pad:[20,16] fill:$muted r:$radius` muted box with body text only (no icon, no heading) per the surface brief. |

All existing inline `<p className="text-sm text-muted-foreground">` fallbacks in
`apps/web` are **not** absorbed at the component level — they are dead reinventions
to be replaced by consumers once EmptyState ships. See Build steps.

---

## Stories & tests

### Storybook stories (`packages/ui/src/components/empty-state.stories.tsx`)

```text
Default          — variant="full" heading="Nothing here yet"
                   body="When there's something to show, it'll appear here."
                   icon=Inbox (matches board 08 / S24 specimen)

NotificationsUse — variant="full" icon=BellOff heading="No notifications yet."
                   body="Everything sent your way will appear here."
                   (matches 09-notifications.md:52-56)

MyFormsUse       — variant="full" icon=Inbox heading="No forms yet"
                   body="You haven't completed any forms yet."
                   (matches 12-my-forms.md:37)

AnnouncementsUse — variant="full" icon=Megaphone heading="No drafts."
                   body="Save a draft to see it here."

InlineVariant    — variant="inline"
                   body="No edits yet. Changes you make here will show up in this list."
                   (matches EmptyLog spec in 12-my-forms.md:70)

CustomIcon       — variant="full" icon=FileQuestion heading="Nothing recorded."
                   body="Answers from the questionnaire will appear here."
```

### Vitest / RTL test cases (`packages/ui/src/components/__tests__/empty-state.test.tsx`)

1. **Renders full variant without crash** — mounts `<EmptyState heading="H" body="B" />`, element present in DOM.
2. **Renders IconBadge circle in full variant** — the rendered output contains an element matching the `IconBadge` muted circle.
3. **Heading is rendered in full variant** — `getByRole("heading")` or `getByText("H")` found.
4. **Body text is rendered in full and inline** — `getByText("B")` found in both variants.
5. **variant="inline" renders no icon circle** — `queryByRole("img")` / `aria-hidden` icon element is absent; no `IconBadge` rendered.
6. **variant="inline" renders no heading element** — no `<p>` or element carrying the heading text; only body present.
7. **variant="inline" root has muted fill classes** — root element has `bg-muted` and a radius class.
8. **Custom icon is rendered in full variant** — pass `icon=BellOff`; rendered output contains the BellOff icon (aria-hidden).
9. **Default icon is Inbox when no icon prop** — rendered output contains an inbox glyph in full variant.
10. **className merges** — extra `className="mt-4"` appears in rendered root classes.
11. **body is always rendered** — smoke test that `body` text is present regardless of variant.
12. **Full variant has centred layout class** — root has `items-center` and `text-center` (or equivalent centre alignment).

### a11y notes

- The icon circle is purely decorative — `<IconBadge>` renders the icon with
  `aria-hidden="true"` per the `atom-iconbadge.md` contract.
- The `heading` in the `full` variant should be rendered as a `<p>` (or styled
  `<span>`) rather than a semantic `<h*>` — `EmptyState` is an inert placeholder
  in the content flow, not a document section heading. Consumers that need a
  landmark heading for the empty page region own that wrapping `<h2>`.
- Body text carries `$muted-foreground` which in the dark palette is
  `oklch(0.7 0.05 325)` — sufficient contrast against the `$background`
  `oklch(0.15 0.05 295)` and the `$muted` `oklch(0.22 0.06 295)` inline fill.
- `EmptyState` is not interactive; it has no `tabIndex`, `role`, or ARIA live
  region. The host's data-loading pattern (server component, suspense fallback, or
  client state) owns announcing the transition from loading to empty — not this
  component.

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `IconBadge` (`packages/ui/src/components/icon-badge.tsx`) must
exist and export correctly. `EmptyState`'s `full` variant wraps `<IconBadge
size="lg" shape="circle" tone="muted">` — if IconBadge is not yet shipped, the
`full` variant can temporarily render the circle inline (64×64 `rounded-full
bg-muted flex items-center justify-center`) and the dep is wired once IconBadge
lands. The `inline` variant has no dependency on IconBadge and can ship first.

### Step 1 — Create `packages/ui/src/components/empty-state.tsx`

- Define `EmptyStateVariant` type (`"full" | "inline"`).
- Define `EmptyStateProps` interface (as above).
- Implement `EmptyState` as a `React.FC<EmptyStateProps>`:
  - `full`: vertical flex column `items-center text-center gap-3 py-8 px-6`
    (snapping board's `pad:[32,24] gap:12` to Tailwind steps), renders
    `<IconBadge size="lg" shape="circle" tone="muted" icon={icon ?? Inbox} aria-hidden />`,
    then `<p className="text-base font-bold text-foreground">{heading}</p>`,
    then `<p className="text-sm text-muted-foreground">{body}</p>`.
  - `inline`: single `<p className="rounded-[--radius] bg-muted px-4 py-5 text-sm text-muted-foreground">{body}</p>`
    (snapping board `pad:[20,16]` to `py-5 px-4`; no heading, no icon).
  - Both variants forward `className` via `cn(…, className)`.
- Export named: `EmptyState`, `EmptyStateProps`, `EmptyStateVariant`.
- **Acceptance:** component renders both variants without error; no raw hex or
  `dark:` classes; no hardcoded px sizes outside Tailwind utilities.

### Step 2 — Export from package barrel

- Add `export * from "./components/empty-state"` to `packages/ui/src/index.ts`.
- **Acceptance:** `import { EmptyState } from "@camp404/ui"` resolves in a
  consuming package.

### Step 3 — Storybook stories

- Create `packages/ui/src/components/empty-state.stories.tsx` with all 6 stories
  above.
- **Acceptance:** Storybook builds without error; all stories render visually
  matching the board 08 / S24 specimen references.

### Step 4 — Vitest / RTL tests

- Create `packages/ui/src/components/__tests__/empty-state.test.tsx` with the 12
  test cases above.
- **Acceptance:** `pnpm test --filter @camp404/ui` passes green.

### Step 5 — Replace notifications inline empty state

- `apps/web/app/notifications/page.tsx:54`: replace
  `<p className="text-sm text-muted-foreground">No notifications yet.</p>`
  with `<EmptyState icon={BellOff} heading="No notifications yet." body="Everything sent your way will appear here." />`.
- The board (`09-notifications.md:52-56`) specifies the `full` variant with
  `bell-off` icon, "No notifications yet." heading (Inter 15/600), and centred
  `pad:[40,24]` layout. Use `variant="full"` and add `py-10 px-6` override via
  `className` to match the `pad:[40,24]` board spec.
- **Acceptance:** visual output matches board 08 empty circle + heading + body;
  no raw `<p>` fallback remains on this page.

### Step 6 — Replace announcements inline empty states

- `apps/web/app/captains/announcements/announcements-manager.tsx:281`:
  replace `<p className="text-sm text-muted-foreground">No drafts.</p>` with
  `<EmptyState heading="No drafts." body="Save a draft to see it here." />`.
- `apps/web/app/captains/announcements/announcements-manager.tsx:334`:
  replace `<p className="text-sm text-muted-foreground">Nothing published yet.</p>`
  with `<EmptyState heading="Nothing published yet." body="Publish a draft to send it to the camp." />`.
- **Acceptance:** open question B18 (`open-questions.md:71`) closed — both
  sections use the shared component; no bare `<p>` fallback text remains.

### Step 7 — Wire EmptyState into My-forms list page

- `apps/web/app/tools/forms/page.tsx` (when implemented): add
  `<EmptyState heading="No forms yet" body="You haven't completed any forms yet." />`
  for the `forms.length === 0` branch per `12-my-forms.md:37`.
- **Acceptance:** board spec satisfied; no bespoke inline fallback on this route.

### Step 8 — Wire EmptyLog (inline variant) into My-forms detail ChangeLog

- `apps/web/app/tools/forms/[key]/page.tsx` (when implemented): add
  `<EmptyState variant="inline" body="No edits yet. Changes you make here will show up in this list." />`
  for the `edits.length === 0` branch per `12-my-forms.md:70`.
- **Acceptance:** inline muted box renders with correct padding and background;
  no heading or icon circle present.

### Step 9 — Reconcile family-tree empty state

- `apps/web/app/family-tree/family-tree.tsx`: the current
  `<Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{…}</CardContent></Card>`
  pattern is the closest analogue to the `inline` variant but uses a Card wrapper
  instead of the muted box. Per `13-family-tree.md:98`, the `EmptyState` canvas
  component is explicitly **not used** on the family-tree surface — the board
  documents the empties as bespoke `fill:$muted` boxes without the shared
  component header.
  **Decision:** keep the `Card/CardContent` wrapper on family-tree as-is (matching
  the "not used" note in the surface brief); do NOT replace it with `EmptyState`.
  This step is a confirm-and-close, not a code change.
- **Acceptance:** no `EmptyState` import added to family-tree; confirm-and-close
  noted.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | Variant | Icon | Heading | Body | Surface ref |
|---|---|---|---|---|---|
| **Notifications inbox** | `full` | `BellOff` | "No notifications yet." | per product copy | `09-notifications.md:52-56` |
| **My-forms list** | `full` | `Inbox` (default) | "No forms yet" | "You haven't completed any forms yet." | `12-my-forms.md:37` |
| **My-forms detail — ChangeLog** | `inline` | — | — | "No edits yet. Changes you make here will show up in this list." | `12-my-forms.md:70` (EmptyLog) |
| **Announcements — Drafts section** | `full` | `FileText` or `Inbox` | "No drafts." | product copy | `15-announcements.md:79` |
| **Announcements — Published section** | `full` | `Megaphone` | "Nothing published yet." | product copy | `15-announcements.md:79` |
| **Roster** | In-table fallback (`td`) — the roster's empty state is a table-cell centred text, not the shared component; see `14-roster.md:107`. Roster empties are inline by design (table cell colspan). NOT a consumer. | — | — | — | `14-roster.md` |
| **Completion-queue** | Not applicable — `27-questionnaire-complete.md:69` explicitly lists `EmptyState` as not used on this surface; the all-done state is handled by `CompletionHero` which is a distinct molecule. | — | — | — | `27-questionnaire-complete.md` |
| **S24 Primitive kit** | `full` | `Inbox` | "Nothing here yet" | "When there's something to show, it'll appear here." | `33-s24-primitive-kit.txt` (design specimen only) |
