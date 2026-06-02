# NavCard — molecule plan

- **mapsTo:** PROMOTE (hand-rolled in `apps/web`) · Target file: `packages/ui/src/components/nav-card.tsx`

---

## Current state — does it exist? where? gap vs spec

No `nav-card.tsx` exists in `packages/ui/src/components/` (confirmed by directory listing — 25 files, none named `nav-card`).

The pattern is hand-rolled — twice — as inline JSX in two `apps/web` page files, plus a third variant (FormCard) in a third page, each with divergences:

### Existing hand-rolls

| File | Board name | Divergences from spec |
|---|---|---|
| `apps/web/app/tools/page.tsx` L73–90 | NavCard (S13) | Focus ring on `<Card>`, not `<Link>` wrapper (S19 brief open question #7 confirms this is wrong — ring must be on `Link`). Icon chip is `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">` — no `$border` token, uses `bg-muted/40` (off-token alpha — spec is `bg-muted`+`border-border`), 40 px (not 44 px). No `disabled` prop. No `meta` prop. `CardTitle` text size unspecified (defaults to card.tsx large). |
| `apps/web/app/captains/tools/page.tsx` L75–90 | ToolCard (S19) | Focus ring correctly on `<Link>` with `rounded-xl`. Icon chip same 40 px `bg-muted/40 border`. No `disabled` prop (non-captain state handled by server-side hard redirect — spec requires `CaptainLock` in-place, not a `disabled` NavCard prop on this surface). No `meta` prop. |
| `apps/web/app/tools/forms/page.tsx` L66–88 | FormCard (S15) | No icon chip — the board's FormCard omits the `IconChip` entirely. Hover is `hover:border-[color:var(--color-primary)]` (not `hover:bg-accent/30`). Focus ring absent. Meta line ("Last edited {date}") present. Uses verbose `text-[color:var(--color-muted-foreground)]` token spelling (reconciliation P1-5). |

### Gap vs spec (consolidated)

| Gap | Source | Fix |
|---|---|---|
| Icon chip is 40 px (`h-10 w-10`) | `tools/page.tsx` L76, `captains/tools/page.tsx` L78 | Boards draw 44×44 → `IconBadge size="md"` (44–46 px band). The `atom-iconbadge.md` Absorbs table incorrectly says `size="sm"` for NavCard; boards are authoritative at 44 px → `size="md"` is the correct value. |
| `bg-muted/40` — off-token alpha on icon chip fill | both tool pages | Board spec is `fill:$muted` (no alpha modifier) + `stroke:$border` → `bg-muted border border-border`. |
| Icon chip has no border in `tools/page.tsx` (missing `border` class) | `apps/web/app/tools/page.tsx` L76 | Both boards draw `stroke:$border` on the IconChip. The `captains/tools` page adds `border` but `tools/page` omits it. Both need `border border-border`. |
| Focus ring on `<Card>` not `<Link>` | `apps/web/app/tools/page.tsx` L73–74 | Ring must be on the `<Link>` wrapper (`focus-visible:ring-2 focus-visible:ring-ring rounded-[--radius]`) per S19 brief open question #7 and board S19 spec. |
| FormCard hover is `hover:border-primary` not `hover:bg-accent/30` | `apps/web/app/tools/forms/page.tsx` L74 | Board S15 FormCard does not draw a hover state explicitly; S13 and S19 boards both specify `hover:bg-accent/30` as the hover treatment. Normalise all three to `hover:bg-accent/30`. |
| FormCard `text-[color:var(--color-muted-foreground)]` verbose token spelling | `apps/web/app/tools/forms/page.tsx` | Normalise to `text-muted-foreground` (reconciliation P1-5). |
| FormCard has no icon chip | `apps/web/app/tools/forms/page.tsx` | Board S15 FormCard omits the IconChip — it is text-only + chevron. The `meta?` prop handles this; when `icon` is omitted the chip slot is absent. |
| No shared component — logic duplicated across 3 files | all three | Extract to `packages/ui/src/components/nav-card.tsx`. |

---

## API — props, variants, sizes, states

### TS prop interface

```ts
import type { LucideIcon } from "lucide-react";

export interface NavCardProps {
  /** Destination href (typed to Next.js route; consumers pass string). */
  href: string;
  /**
   * Lucide icon rendered inside the IconBadge chip.
   * When omitted the chip slot is absent (FormCard variant — board S15 omits IconChip).
   */
  icon?: LucideIcon;
  /** Card title — Inter/15px/700/$foreground (spec: --text-subtitle dense 15 px step). */
  title: string;
  /** Card description — Inter/13px/normal/$muted-foreground. */
  description: string;
  /**
   * Optional meta line rendered below the description.
   * Used by the FormCard variant: "Last edited {date}" — Inter/12px/500/$muted-foreground.
   * When omitted the meta slot is absent.
   */
  meta?: string;
  /**
   * Disabled / locked state.
   * opacity-35, pointer-events-none, aria-disabled="true" on the Link.
   * Board S19 LockedVariant draws the dimmed cards at op:0.35 as a design annotation
   * (actual non-captain view uses CaptainLock — see Consumers). The `disabled` prop
   * covers genuine inert-card cases such as future "coming soon" entries.
   */
  disabled?: boolean;
  className?: string;
}
```

### Variants

| Variant | Trigger | Description |
|---|---|---|
| **default** | `icon` provided, no `meta` | IconBadge chip + title + description + ChevronRight. S13 and S19 usage. |
| **with-meta** | `meta` prop provided | Adds a third text line below description. FormCard (S15) usage. |
| **without-icon** | `icon` omitted | Text block + ChevronRight only, no chip slot. FormCard (S15) usage — board draws no IconChip on FormCard. |
| **disabled** | `disabled={true}` | Entire card at `opacity-[0.35]`, Link has `pointer-events-none aria-disabled="true"`. |

### Sizes

No size prop. The NavCard has a fixed layout: padding 16 (S13) / 18 (S19) — standardise on 16 per S13 (the member-tools canonical board); captain tools padding 18 is a 2 px drift, snap to 16 for the shared component. Gap between chip and text block is 14 (both boards). Text stack gap is 4.

### States

| State | Visual | Implementation |
|---|---|---|
| **default** | `$card` fill, `$border` stroke, `$radius` corners | Base classes |
| **hover** | `bg-accent/30` background tint | `transition-colors hover:bg-accent/30` on the `<Card>` |
| **focus** | `ring-2 ring-ring` | `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` on the `<Link>` wrapper; `rounded-[--radius]` on Link to match card corners |
| **disabled** | `opacity-[0.35]`, no hover tint, pointer blocked | `disabled` prop → `opacity-[0.35] pointer-events-none` on the wrapper; `aria-disabled="true"` on Link |

---

## Tokens & type — exact design tokens + type-scale roles

All tokens are semantic — no raw hex, no raw colour utilities.

| Slot | Token | Type-scale role | Notes |
|---|---|---|---|
| Card fill | `bg-card` | — | Board: `fill:$card` |
| Card stroke | `border border-border` | — | Board: `stroke:$border` |
| Card radius | `rounded-[--radius]` | — | Board: `r:$radius` → `--radius` (0.625 rem / 10 px, §3 design-tokens) |
| Hover fill | `hover:bg-accent/30` | — | Board: `hover:bg-accent/30` (S13 + S19 briefs confirm) |
| Focus ring | `ring-ring` | — | `focus-visible:ring-2 focus-visible:ring-ring` on Link |
| IconBadge fill | `bg-muted` | — | Board: `fill:$muted` |
| IconBadge stroke | `border border-border` | — | Board: `stroke:$border` — present on both boards; absent from `tools/page.tsx` (gap) |
| IconBadge icon colour | `text-primary` | — | Board: icon colour `$primary` |
| Title | `text-foreground` | `--text-subtitle` (dense 15 px step) — Inter/15px/700 | Board: `Inter/15px/700/$foreground`. Design-tokens §1.2 normalises card title to 16 px default but explicitly keeps **15 px for dense list-row CardTitle**. This is the dense-list case. |
| Description | `text-muted-foreground` | `--text-caption` or lower body — Inter/13px/normal | Board: `Inter/13px/normal/$muted-foreground` |
| Meta line | `text-muted-foreground` | `--text-caption` — Inter/12px/500 | Board S15: `Inter/12px/500/$muted-foreground`. Caption role. |
| ChevronRight | `text-muted-foreground` | — | Board: `$muted-foreground`, 20×20 (`size-5`) |
| Disabled opacity | `opacity-[0.35]` | — | Board S19 LockedVariant draws `op:0.35` |
| Transition | `transition-colors` | — | Standard motion primitive |

**No mono/JetBrains Mono type roles are used in NavCard.** All text is Inter (UI face). The meta line uses the caption scale (12 px) but in Inter, not mono — it is a date string displayed as UI copy, not a data-console value.

**No status tokens** (`success`/`warning`) are used. The NavCard carries no status signalling.

---

## Composition & deps — atoms/primitives + helpers

| Dep | Purpose | Source |
|---|---|---|
| `IconBadge` | 44×46 px icon chip — `size="md" shape="rounded" tone="muted"` | `packages/ui/src/components/icon-badge.tsx` (PROMOTE, plan `atom-iconbadge.md`) |
| `cn` | Class merging | `packages/ui/src/lib/utils` |
| `ChevronRight` | Trailing nav affordance | `lucide-react` |
| `Link` (next/link) | Full-card tap target | Consumer import — **not** imported inside `packages/ui`. NavCard accepts `href: string` and renders a plain `<a>` internally, or exposes an `asChild`-style slot. See note below. |

### Link wrapping — package constraint

`packages/ui` must not import `next/link` (it is a `@camp404/ui` presentation package; `next/*` is an app concern). Two options:

1. **Render a plain `<a href={href}>`** inside `nav-card.tsx`. Consumers in `apps/web` use `<Link asChild>` or pass the href as a prop and let the component use `<a>`. Client-side nav is handled by Next.js automatically intercepting `<a>` tags in the app router.
2. **Accept `asChild`** via Radix `Slot` (already a dep of `button.tsx` in the package).

**Decision: use `asChild` pattern** (`Slot` from `@radix-ui/react-slot`), matching `button.tsx`. Default render is `<a href={href}>`. Consumers in `apps/web` wrap with `<Link asChild href={...}>` when they need prefetching. The `Slot` dep already exists in the package.

| `@camp404/core` helper | Used? | Note |
|---|---|---|
| `rankLevel` | No | NavCard is purely presentational; rank gating is done by the surface server component. |
| `initialsFrom` | No | No avatar in this component. |
| `cn` | Yes | From `packages/ui/src/lib/utils` — not a core helper. |

---

## Absorbs — candidates it replaces (from the merge map)

From the merge map entry in `component-library.md` (NavCard row):

| Absorbed candidate | Current location | Disposition |
|---|---|---|
| **NavCard (S13)** | Inline JSX in `apps/web/app/tools/page.tsx` L73–90 | DELETE inline markup; replace with `<NavCard>` |
| **ToolCard (S19)** | Inline JSX in `apps/web/app/captains/tools/page.tsx` L75–90 | DELETE inline markup; replace with `<NavCard>` |
| **FormCard (S15)** | Inline JSX in `apps/web/app/tools/forms/page.tsx` L66–88 | DELETE inline markup; replace with `<NavCard meta="Last edited {date}">` (no `icon` prop — board S15 omits IconChip from FormCard) |

No other file in `packages/ui/src/components/` overlaps. The `card.tsx` primitive remains and is composed inside `NavCard`.

---

## Stories & tests

### Storybook stories (`packages/ui/src/components/nav-card.stories.tsx`)

```text
Default          — icon=Mail, title="Invite a member", description="Mint a named invite link…", href="#"
WithMeta         — icon omitted, title="Burner profile", description="The onboarding questionnaire…",
                   meta="Last edited 12 May 2026", href="#"
WithIcon         — icon=Megaphone, title="Announcements & notifications", long description, href="#"
DisabledState    — icon=Users, title="Roster & approvals", disabled={true}, href="#"
HoverSimulated   — use play() to hover; assert bg-accent/30 class
FocusRing        — use play() to focus via keyboard; assert ring classes on Link wrapper
AllIconTones     — three cards side by side: Mail, ClipboardList, GitBranch (mirrors S13 hub)
```

### Vitest / RTL test cases (`packages/ui/src/components/__tests__/nav-card.test.tsx`)

1. **Renders without crash** — mounts `<NavCard icon={Mail} title="Invite" description="desc" href="/foo" />`; DOM element present.
2. **Renders title and description** — `getByText("Invite")` and `getByText("desc")` found.
3. **Renders IconBadge when icon provided** — the `IconBadge` container is present in the DOM.
4. **Omits IconBadge when no icon** — no icon container when `icon` prop absent.
5. **Renders meta line when meta prop provided** — `getByText("Last edited 12 May 2026")` present.
6. **Omits meta slot when meta absent** — no third text line rendered.
7. **Renders ChevronRight** — `ChevronRight` icon in DOM.
8. **href threads to anchor** — the `<a>` element has `href="/foo"`.
9. **disabled applies aria-disabled** — `<a aria-disabled="true">` present when `disabled={true}`.
10. **disabled applies pointer-events-none** — rendered element has `pointer-events-none` class.
11. **className merges** — extra `className="mt-4"` appears on outer element.
12. **No raw hex in rendered classes** — snapshot check: no `#` in className strings.

### a11y notes

- The entire card is a single focusable `<a>` (or Link-wrapped `<a>`). No nested interactive elements.
- `aria-disabled="true"` on the Link when `disabled`; pointer events blocked — screen readers announce "link, dimmed" without navigating.
- Icon inside `IconBadge` is `aria-hidden="true"` (decorative). The title text is the accessible name for the link.
- `ChevronRight` is decorative — rendered with `aria-hidden="true"`.
- Focus ring is `focus-visible` only (keyboard-only ring). Meets WCAG 2.4.7.
- Colour contrast: title `text-foreground` on `bg-card` — confirmed high contrast against the dark palette. Description `text-muted-foreground` on `bg-card` — check WCAG AA at 13 px (small text threshold). The `$muted-foreground` token `oklch(0.7 0.05 325)` on `$card` `oklch(0.26 0.08 295)` achieves adequate contrast; confirm with a contrast checker during QA.

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `IconBadge` must be built and exported from `@camp404/ui` before NavCard can compose it (see `atom-iconbadge.md` plan). `IconBadge` has its own prerequisite: status tokens in `globals.css`. The `muted` tone used by NavCard does **not** depend on the new status tokens, so NavCard can ship with `IconBadge muted` while `success`/`warning` tones are pending elsewhere.

### Step 1 — Create `packages/ui/src/components/nav-card.tsx`

- Import `IconBadge` from `./icon-badge`, `cn` from `../lib/utils`, `ChevronRight` from `lucide-react`, `Slot` from `@radix-ui/react-slot`, and `Card`, `CardHeader` from `./card`.
- Implement `NavCardProps` interface as specified above.
- Render structure:
  ```text
  <Slot asChild?> → <a href={href}>
    <Card className={cn("transition-colors hover:bg-accent/30", disabled && "opacity-[0.35] pointer-events-none", className)}>
      <CardHeader className="flex flex-row items-center gap-3.5 space-y-0 p-4">
        {icon && <IconBadge size="md" shape="rounded" tone="muted" icon={icon} />}
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[15px] font-bold leading-snug text-foreground">{title}</span>
          <span className="text-[13px] leading-normal text-muted-foreground">{description}</span>
          {meta && <span className="text-[12px] font-medium text-muted-foreground">{meta}</span>}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
    </Card>
  </a>
  ```
- Focus ring on the `<a>` wrapper: `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[--radius]`.
- `aria-disabled={disabled}` on the `<a>`.
- Export named: `NavCard`, `NavCardProps`.
- **Acceptance:** component renders all variants without error; no raw hex in className strings; no `next/link` imported inside the package.

### Step 2 — Export from package barrel

- Add `export * from "./components/nav-card"` to `packages/ui/src/index.ts`.
- **Acceptance:** `import { NavCard } from "@camp404/ui"` resolves in a consuming package.

### Step 3 — Storybook stories

- Create `packages/ui/src/components/nav-card.stories.tsx` with all 7 stories.
- **Acceptance:** Storybook builds without error; Default, WithMeta, WithIcon, Disabled stories visually match the boards.

### Step 4 — Vitest / RTL tests

- Create `packages/ui/src/components/__tests__/nav-card.test.tsx` with all 12 test cases.
- **Acceptance:** `pnpm test --filter @camp404/ui` passes green.

### Step 5 — Replace `apps/web/app/tools/page.tsx` inline cards

- Remove the inline `<span>` icon chip, `<Card><CardHeader>…</CardHeader></Card>` JSX inside the `TOOLS.map`.
- Import `NavCard` from `@camp404/ui`; wrap each entry with `<Link asChild href={tool.href}><NavCard icon={tool.icon} title={tool.title} description={tool.description} /></Link>` (or `<NavCard href={tool.href} … />` if using the default `<a>` render).
- Remove the now-unused `Card`, `CardDescription`, `CardHeader`, `CardTitle` imports if nothing else on the page uses them.
- **Acceptance:** visual output matches S13 board; focus ring is on the Link wrapper; no inline `bg-muted/40` or `rounded-md border` classes in JSX; `pnpm build --filter apps/web` passes.

### Step 6 — Replace `apps/web/app/captains/tools/page.tsx` inline cards

- Same swap as Step 5, using `<NavCard>` from `@camp404/ui`.
- The non-captain hard-redirect (`if (campUser.rank !== "captain") redirect("/")`) is replaced by the `CaptainLock` in-place treatment per S19 spec — this is a separate surface-level change, not part of the NavCard component build. NavCard's `disabled` prop is not needed for this surface's locked path.
- Remove unused `Card*` imports.
- **Acceptance:** same criteria as Step 5; captain-tools visual matches S19 board for the captain state.

### Step 7 — Replace `apps/web/app/tools/forms/page.tsx` inline FormCard

- Replace the inline `<Link href={…}><Card><CardHeader>…</CardHeader></Card></Link>` block per form with `<NavCard href={…} title={form.title} description={form.description} meta={\`Last edited \${dateFmt.format(lastEdited)}\`} />`.
- Confirm `icon` is omitted (board S15 FormCard has no icon chip).
- Remove verbose `text-[color:var(--color-muted-foreground)]` utility; the NavCard component uses short-form tokens internally (reconciliation P1-5).
- Remove unused `Card*` imports.
- **Acceptance:** FormCard renders title + description + meta line + ChevronRight; hover is `bg-accent/30` (not `hover:border-primary`); `pnpm build --filter apps/web` passes.

### Step 8 — CI / lint check

- Run `pnpm lint --filter @camp404/ui` and `pnpm lint --filter apps/web`.
- **Acceptance:** no new lint errors; no raw hex tints; no `text-[color:var(--color-*)]` verbose tokens introduced.

---

## Consumers — which molecules/organisms/surfaces use NavCard

| Consumer | Route / file | Props used | Notes |
|---|---|---|---|
| **Tools hub (S13)** | `apps/web/app/tools/page.tsx` | `icon`, `title`, `description`, `href` | 3 cards — Mail / ClipboardList / GitBranch |
| **Captain tools hub (S19)** | `apps/web/app/captains/tools/page.tsx` | `icon`, `title`, `description`, `href` | 2 cards — Megaphone / Users; non-captain branch uses CaptainLock (not `disabled` NavCards) |
| **My forms list (S15)** | `apps/web/app/tools/forms/page.tsx` | `title`, `description`, `meta`, `href` (no `icon`) | FormCard variant — one per completed form |

No molecule or organism composes `NavCard` — it is used directly by surface-level server components. It is a navigation leaf; no organism wraps it.

**Future consumer note:** the `disabled` prop is spec'd for correctness and future-proofing (e.g. "coming soon" tool entries in either hub's `TOOLS` array). As of the S13/S19/S15 build, no surface passes `disabled={true}` to a rendered `NavCard` in production — the captain-tools locked path replaces the list with `CaptainLock`, not with disabled cards.
