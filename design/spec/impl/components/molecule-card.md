# Card — molecule plan

- **mapsTo:** REUSE `packages/ui/src/components/card.tsx`
- **Target file:** `packages/ui/src/components/card.tsx`

---

## Current state — does it exist? where? gap vs spec

**Exists:** `packages/ui/src/components/card.tsx` — six named exports:
`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

**Confirmed consumers (apps/web):**
- `components/auth-shell.tsx` — `Card` + `CardContent`
- `app/profile/page.tsx` — `Card` + `CardContent`
- `app/profile/edit/page.tsx` — two `Card` + `CardContent` (profile-form + delete/danger form)
- `app/tools/page.tsx` — full sub-component set; interactive hover tint (`hover:bg-accent/30`)
- `app/captains/tools/page.tsx` — full set; interactive hover tint (`hover:bg-accent/30`)
- `app/tools/forms/page.tsx` — full set; interactive primary-border hover (`hover:border-[color:var(--color-primary)]`)
- `app/tools/invite/invite-form.tsx` — full set; plain usage
- `app/family-tree/family-tree.tsx` — `Card` + `CardContent`; viewer ring (`ring-1 ring-primary`)

**Gaps vs spec (cite files):**

| Gap | Where seen | Required fix |
|---|---|---|
| `rounded-xl` hardcoded — board `$radius` = `--radius` (10px / `0.625rem`) | `card.tsx:11` | Replace `rounded-xl` with `rounded-[--radius]` (or `rounded-md` once token aliases are wired per `design-tokens.md §3`) |
| `shadow-sm` not in the board spec | `card.tsx:11` | Remove; dark-only palette has no light-shadow intent on the boards |
| No `variant` prop — `danger` (destructive border), `selected`/ring, `interactive` (hover tint) are passed as raw `className` by every consumer | `tools/page.tsx:74`, `family-tree.tsx:213-218`, `profile/edit/page.tsx:50`, `design/spec/surfaces/08-profile-edit.md:52` | Add `variant` prop encoding all four cases |
| `CardTitle` uses `text-2xl font-semibold` — spec says card/subtitle title is `--text-subtitle` (16px/700; 15px dense list, 18px hero); `text-2xl` is 24px and off-scale | `card.tsx:37-40` | Normalise to 16px/700 (`text-base font-bold`); expose `size` on `CardTitle` for the 15/18px exceptions |
| `isMatch` in family-tree uses raw `border-amber-400/60` on the Card — a raw colour tint | `family-tree.tsx:217` | This is a reconciliation target (design-tokens.md §4 item 2); the token normalisation to `stroke:$accent` is the codemod task, not a new Card prop — document as a consumer-side migration |
| Interactive hover patterns (`hover:bg-accent/30`, `hover:border-primary`) are reinvented inline at every call site | `tools/page.tsx:74`, `captains/tools/page.tsx:76`, `forms/page.tsx:74` | Roll into `variant="interactive"` on Card |
| `focus-visible:ring-2 focus-visible:ring-ring` applied to `Card` at `tools/page.tsx:74` — focus ring belongs on the `<Link>` wrapper, not the Card | `tools/page.tsx:74` | Document as consumer migration note; Card does not own focus-ring when wrapped in a Link |
| `CardFooter` is exported but has no consumer today | `card.tsx:66-76` | Keep as-is; no removal |

---

## API — props, variants, sizes, states

### Prop interface sketch

```tsx
// Card root
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "danger" | "selected" | "interactive";
  // "default"      — standard bg-card border
  // "danger"       — border-destructive (profile-edit delete form, spec §08)
  // "selected"     — ring-1 ring-primary (family-tree viewer node, roster profile)
  // "interactive"  — hover:bg-accent/30 + transition-colors (tools-hub, captain-tools)
}

// CardTitle
interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  size?: "default" | "sm" | "lg";
  // "default" — 16px/700 (--text-subtitle canonical)
  // "sm"      — 15px/700 (dense list rows: captain-tools/page.tsx text-base→text-sm, CaptainLock)
  // "lg"      — 18px/700 (hero card header: invite-gate "One more thing")
  as?: "h2" | "h3" | "h4";  // default h3
}

// CardHeader, CardContent, CardDescription, CardFooter
// — keep existing HTMLAttributes<HTMLDivElement> / HTMLParagraphElement signatures;
//   no new props (size/spacing via className override as today)
```

### Variants

| Variant | Visual result | Class delta vs default |
|---|---|---|
| `default` | `bg-card border border-border` | — |
| `danger` | destructive border stroke | `border-destructive` |
| `selected` | 1px primary ring | `ring-1 ring-primary` |
| `interactive` | hover tint + transition | `transition-colors hover:bg-accent/30 cursor-pointer` |

### States

| State | Trigger | Visual |
|---|---|---|
| default | — | `$card` fill, `$border` stroke |
| hover (`interactive`) | cursor over | `bg-accent/30` fill |
| selected | `variant="selected"` | `ring-1 ring-primary` |
| dimmed/locked | consumer wraps in `opacity-55 pointer-events-none` (CaptainLock scope) | muted; not a Card prop |
| danger | `variant="danger"` | `border-destructive` stroke |

---

## Tokens & type — exact design tokens + type-scale roles

### Colour tokens (all semantic; no raw hex)

| Usage | Token |
|---|---|
| Card surface fill | `bg-card` → `--color-card` |
| Card text | `text-card-foreground` → `--color-card-foreground` |
| Default border | `border-border` → `--color-border` |
| Danger border | `border-destructive` → `--color-destructive` |
| Selected ring | `ring-primary` → `--color-primary` |
| Interactive hover fill | `bg-accent/30` → `--color-accent` at 30% alpha (snaps to 25% strong step per design-tokens.md §2.3; use `bg-accent/25`) |

Note: `bg-accent/30` is currently used live (`tools/page.tsx:74`, `captains/tools/page.tsx:76`). The canonical alpha steps in `design-tokens.md §2.3` go to 25% ("strong") as the highest named step. The interactive hover should snap to `bg-accent/25` to stay on the canonical scale.

### Typography roles used by sub-components

| Sub-component | Token | Face | Size | Weight |
|---|---|---|---|---|
| `CardTitle` (default) | `--text-subtitle` | Inter | 16px | 700 |
| `CardTitle` (sm) | `--text-subtitle` dense variant | Inter | 15px | 700 |
| `CardTitle` (lg) | `--text-subtitle` hero variant | Inter | 18px | 700 |
| `CardDescription` | `--text-body` / `--text-caption` | Inter | 14px → 12px | 400 |

Current `card.tsx` `CardTitle` uses `text-2xl font-semibold` (24px/600) — off-scale. Normalise to `text-base font-bold` (16px/700) as the default per `design-tokens.md §1.2`. No JetBrains Mono usage in Card itself; mono appears only in consumer content (family-tree `via <code>` lines, invite-form slug).

### Radius

Card uses `--radius` (10px / `0.625rem`), the default container radius per `design-tokens.md §3`. Current `rounded-xl` (12px) is a one-step over; replace with `rounded-[--radius]` or the `rounded-md` alias once `globals.css` tokens are wired (tracked in `foundations-tokens.md`).

---

## Composition & deps — atoms/primitives + @camp404/core helpers

Card is a **pure presentational primitive** — no @camp404/core helpers, no domain logic, no data.

```
Card
  └─ cn()  ← @camp404/ui/lib/utils (already imported in card.tsx)
```

The `variant` prop is resolved via a `cva()` call (class-variance-authority, already a peer of shadcn/ui) or a plain `cn()` switch — either is acceptable. CVA is preferred for legibility and parity with the `Badge` + `Button` pattern in the package.

No `rankLevel` or other @camp404/core helpers are needed. Consumers that gate content behind rank use `CaptainLock` wrapping the Card, not a Card prop.

---

## Absorbs — merge-map candidates replaced

Card does **not** appear in the merge map as an absorbing canonical. It is the **base surface** that higher-order molecules build on:

- `QueueCard` (NEW, app-local) — a `Card` specialisation; it USES Card, not absorbed into Card.
- `NavCard` (PROMOTE) — historically hand-rolled interactive card navigation pattern; it USES Card as its root element.
- `AuthShell` (PROMOTE) — wraps Card/CardContent; consumes Card unchanged.

No inventory candidates collapse into `Card` itself. The existing six sub-components (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) remain — none are dropped.

---

## Stories & tests

### Storybook stories

```
Card.stories.tsx
  Default          — standard card with CardHeader/CardTitle/CardDescription/CardContent
  Danger           — variant="danger", "Danger zone" heading, destructive button
  Selected         — variant="selected" (family-tree viewer node anatomy)
  Interactive      — variant="interactive", wrapped in a Link; hover tint visible
  TitleSizes       — CardTitle size="sm" / "default" / "lg" side-by-side
  AuthShell        — CardContent p-6 usage (replicates auth-shell layout)
  EmptyContent     — Card with EmptyState inside (family-tree empty node)
  FullComposite    — CardHeader + CardContent + CardFooter with Button actions
```

### Vitest / RTL test cases

```
card.test.tsx

Rendering
  renders a <div> with role implied by context (no explicit ARIA role needed)
  applies bg-card and border classes by default
  forwards ref to underlying div

Variants
  variant="danger" adds border-destructive class
  variant="selected" adds ring-1 and ring-primary classes
  variant="interactive" adds transition-colors and hover:bg-accent/25 classes
  variant="default" (explicit) matches the no-variant baseline

CardTitle
  renders an <h3> by default
  size="sm" produces text-[15px] class
  size="lg" produces text-[18px] class
  as="h2" renders an <h2>

className passthrough
  custom className on Card merges with variant classes (no clobber)
  custom className on CardContent merges with default padding

CardHeader / CardContent / CardFooter
  each renders children; className merges correctly

Snapshot
  default card snapshot
```

### Accessibility notes

- `Card` renders a `<div>` — no implicit role. Consumers that make cards interactive (tools-hub, captain-tools) must wrap in a `<Link>` or `<button>` and handle focus/keyboard, NOT add `onClick` to Card directly. Document in the Storybook `Interactive` story.
- `CardTitle` renders `<h3>` by default; `as` prop lets consumers correct the heading level for document outline (e.g. `as="h2"` when Card is the primary content block on a surface).
- `variant="selected"` ring must satisfy 3:1 contrast against card background. `--color-primary` (hot-magenta, OKLCH 0.65 0.27 340) on `--color-card` (OKLCH 0.26 0.08 295) passes this threshold; verify in Storybook a11y plugin.
- `variant="danger"` destructive border is a visual-only cue — the "Danger zone" `<h2>` heading in profile-edit is the accessible label, not a Card-internal concern.

---

## Build steps

### Step 1 — Confirm token foundations are wired (pre-requisite gate)
- `--radius` (10px) must be set in `packages/ui/src/styles/globals.css` as a Tailwind `@theme` entry so `rounded-[--radius]` resolves.
- `--color-accent`, `--color-destructive`, `--color-primary`, `--color-card`, `--color-card-foreground`, `--color-border` must all be present (they already are per `design-tokens.md §2.1`; verify against live `globals.css` before touching card.tsx).
- **Acceptance:** `pnpm build` in `packages/ui` passes; tokens resolve in the Storybook preview.

### Step 2 — Introduce `variant` prop with CVA
- Add `cva` call to `card.tsx`.
- Implement `default | danger | selected | interactive` variants (see API section).
- Replace `"rounded-xl border bg-card text-card-foreground shadow-sm"` baseline with `"rounded-[--radius] border bg-card text-card-foreground"` (drop `shadow-sm`, snap radius).
- Interactive variant: `hover:bg-accent/25 transition-colors` (snapped from live `hover:bg-accent/30` per design-tokens §2.3).
- **Acceptance:** existing consumers pass TypeScript check unchanged (no prop required); Storybook shows four visual states; `pnpm test` green.

### Step 3 — Normalise `CardTitle` typography + add `size` + `as` props
- Replace `"text-2xl font-semibold leading-none tracking-tight"` with `"text-base font-bold leading-snug"` (16px/700 — `--text-subtitle` canonical).
- Add `size?: "default" | "sm" | "lg"` → `text-base` / `text-[15px]` / `text-lg` (18px).
- Add `as?: "h2" | "h3" | "h4"` defaulting to `"h3"`.
- **Acceptance:** visual regression in Storybook `TitleSizes` story; CardTitle renders correct heading element per `as` prop; RTL tests pass.

### Step 4 — Migrate consumer call sites
- `apps/web/app/tools/page.tsx`: remove inline `transition-colors hover:bg-accent/30` from className → use `variant="interactive"`. Focus ring stays on the `<Link>` wrapper.
- `apps/web/app/captains/tools/page.tsx`: same as above.
- `apps/web/app/tools/forms/page.tsx`: `hover:border-[color:var(--color-primary)]` — this is a different interactive pattern (primary border, not accent fill). `variant="interactive"` covers accent-fill hover; the primary-border hover in forms/page is a NavCard-like pattern — migrate this consumer to `NavCard` once that molecule is built (tracked in `molecule-nav-card.md`). In the interim, keep the inline className and file a TODO comment.
- `apps/web/app/family-tree/family-tree.tsx`: viewer node → `variant="selected"`; remove inline `ring-1 ring-primary`. The `isMatch` amber border (`border-amber-400/60`) is a design-tokens §4 item 2 reconciliation (`→ stroke:$accent`) — apply `border-accent/60` as a className; it is not a Card variant.
- `apps/web/app/profile/edit/page.tsx`: danger Card → `variant="danger"`.
- **Acceptance:** no raw `ring-1 ring-primary`, `hover:bg-accent/30`, or `border-destructive` on any `<Card>` element; TypeScript clean.

### Step 5 — Export audit + changelog
- Confirm the six exports (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) are re-exported from `packages/ui/src/index.ts` (or the package's barrel file).
- Add a CHANGELOG entry: "Card: add variant prop (danger/selected/interactive); normalise radius to --radius; fix CardTitle typography to 16px/700."
- **Acceptance:** `pnpm build` clean across monorepo; no type errors in apps/web.

---

## Consumers

| Consumer | Molecule / Organism | Variant used | Notes |
|---|---|---|---|
| `AuthShell` | organism (app-local) | default | Card + CardContent shell |
| `profile/page.tsx` | profile-view (app-local) | default | `overflow-hidden` via className |
| `profile/edit/page.tsx` | profile-edit (app-local) | default + **danger** | Two Cards; second = delete-account Danger zone |
| `tools/page.tsx` | tools-hub / NavCard (migrate to NavCard post-build) | **interactive** | Wrapped in `<Link>` |
| `captains/tools/page.tsx` | captain-tools / NavCard (migrate) | **interactive** | Wrapped in `<Link>` |
| `tools/forms/page.tsx` | my-forms / NavCard (migrate) | interactive (primary-border variant — migrate to NavCard) | Primary-border hover; temporary inline className |
| `family-tree.tsx` | FamilyTree organism (app-local) | default + **selected** | Viewer node ring |
| `invite-form.tsx` | InviteForm organism (app-local) | default | Plain card containers |
| `QueueCard` | molecule (NEW, app-local, 27-questionnaire-complete) | default (locked rows use consumer-side `opacity-55`) | Card specialisation; builds on Card root |
| `AssignCaptainDialog` | organism (app-local) | default | Uses `@camp404/ui/dialog.tsx` which wraps Card |
| `RejectConfirmDialog` | organism (app-local) | **danger** | Destructive stroke per spec |
| `ErrorBoundary` | organism (app-local) | default | Error + retry content |
| `MCPConsent` | organism (app-local) | default | 403 gate Card |
