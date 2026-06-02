# CodeDisplay — molecule plan

- **mapsTo:** PROMOTE `apps/web/app/tools/invite/invite-form.tsx` (inline `CodeRow` + `SuccessPanel` CodeBox) and `apps/web/app/captains/camp-management/camp-management-roster.tsx` (no true RedactedField exists — government-ID field is not implemented in the live roster; the spec absorbs the concept). Neither a standalone `CodeField`, `CodeBox`, nor `RedactedField` component file exists anywhere in the codebase; all three patterns are hand-rolled inline in the two app files above.
- **Target file:** `packages/ui/src/components/code-display.tsx`

---

## Current state — does it exist? where? gap vs spec

`packages/ui/src/components/` contains no `code-display.tsx`, `code-field.tsx`, `code-box.tsx`, or `redacted-field.tsx`. Confirmed by directory listing (avatar, button, card, checkbox, combobox, command, dialog, input, label, popover, select, slider, textarea, quadrant-nav, control-grid — no code surface).

**Hand-rolled instances (the PROMOTE sources):**

| Pattern | File | Lines | What it does |
|---|---|---|---|
| `CodeRow` (editable + shuffle) | `apps/web/app/tools/invite/invite-form.tsx` L154–176 | `Input className="font-mono"` + `Button variant="outline" size="icon"` Shuffle icon, seeded by `generateInviteCode()` | CodeField candidate |
| `SuccessPanel` CodeBox | `apps/web/app/tools/invite/invite-form.tsx` L347–362 | `div.flex … rounded-md border bg-muted/40 p-3 font-mono text-lg` + value `<span>` + Copy `Button` with 1500 ms "Copied" flip | CodeBox candidate |
| Government-ID cell | `apps/web/app/captains/camp-management/camp-management-roster.tsx` | No dedicated component; `MemberProfile` spec (`component-library.md` MemberProfile entry) references "decrypted ID via CodeDisplay redacted" but the current live `DetailList` renders all items as plain `dd.font-medium` text — the redacted variant does not exist yet in any file | RedactedField candidate |

**Gaps vs spec (`component-library.md` CodeDisplay entry):**

- No shared component — logic and markup are duplicated inline across two surfaces.
- `font-mono` is a raw Tailwind utility, not resolved through `--font-mono` (design-tokens.md §1.3 wiring is pending).
- Copy timeout uses a raw `setTimeout(..., 1500)` with no cancel-on-unmount guard.
- `bg-muted/40` (CodeBox background) and `font-mono text-lg` (CodeBox text size) deviate from the specified token set — `bg-muted` + `--text-mono` (14–16 px JetBrains Mono, not generic `text-lg`).
- `SuccessPanel` copy button uses `emerald-400` downstream in `AvailabilityHint` — off-token (design-tokens.md §2.2 adds `$success`).
- Shuffle button is separate from the code input (not a self-contained molecule), making it impossible to reuse on any future surface.
- No `redacted` variant exists anywhere.
- No `aria-label` on the value span for screen readers.

---

## API — props, variants, sizes, states

```ts
// packages/ui/src/components/code-display.tsx

export interface CodeDisplayProps {
  /** The code / slug / ID string to display or edit. */
  value: string;

  /**
   * When supplied the component renders an editable Input (JetBrains Mono).
   * Called with the new lowercased value on every keystroke.
   * Omit for read-only variants.
   */
  onChange?: (value: string) => void;

  /**
   * Render a Shuffle icon-button that calls this handler.
   * Requires onChange (editable variant). Aria-label "Generate a new code".
   */
  onShuffle?: () => void;

  /**
   * Render a Copy icon-button. Copies `value` to the clipboard.
   * Transitions the button label "Copy" → "Copied" for `copyResetMs` ms.
   * May be supplied without onChange (read-only + copy = CodeBox).
   */
  onCopy?: () => void;

  /**
   * Duration in ms before the "Copied" label reverts. Default 1500.
   */
  copyResetMs?: number;

  /**
   * Mask the value with bullet characters and show a Lock icon.
   * Overrides onChange/onShuffle/onCopy — redacted variant is always
   * read-only. The raw value is never rendered to the DOM.
   */
  redacted?: boolean;

  /**
   * Disable all interactions (edits, shuffle, copy). Visual opacity cue.
   */
  disabled?: boolean;

  /** Accessible label for the code region. Falls back to "Code". */
  'aria-label'?: string;

  /** Additional className applied to the root container. */
  className?: string;
}
```

### Variants (derived from prop combinations)

| Variant name | Props active | Maps to |
|---|---|---|
| **editable-shuffle** | `onChange` + `onShuffle` | CodeField (invite-form code row) |
| **readonly-copy** | `onCopy` only (no `onChange`) | CodeBox (SuccessPanel code row) |
| **redacted** | `redacted={true}` | RedactedField (MemberProfile government-ID cell) |
| **readonly** | none of the above (display-only) | generic mono display (family-tree "via …", MCP scope — see Consumers) |

### Sizes

Single size. JetBrains Mono `--text-mono` role (13–16 px / 500–600 / lh 1.5 — design-tokens.md §1.1). The invite-tool CodeField uses 14 px slug weight; the CodeBox success panel uses 16 px. Map:

- `editable-shuffle`: 14 px (`text-sm font-mono font-medium`) — matches the board `JetBrains Mono/14px/$foreground` slug input.
- `readonly-copy`: 16 px (`text-base font-mono font-medium`) — matches board `JetBrains Mono/16px/500/$foreground` CodeBox.
- `redacted` / `readonly`: 13 px (`text-[13px] font-mono font-medium`) — `--text-mono` base, consistent with the terminal field-label scale.

### States

| State | Description |
|---|---|
| `default` | Value shown, actions enabled |
| `copied` | Copy button label → "Copied"; icon swaps `Copy` → `Check`; reverts after `copyResetMs` |
| `redacted` | Value replaced with `••••••••`; `EyeOff` lock icon; no copy/shuffle |
| `disabled` | `opacity-50 pointer-events-none` on the root; all child controls inert |

---

## Tokens & type — design tokens + type-scale roles

All values from design-tokens.md. No raw hex in built code.

| Element | Token / role | Notes |
|---|---|---|
| Root container background | `bg-muted` | Spec: `$muted` for code surfaces (design-tokens.md §2.1) |
| Root container border | `border border-input` | `$input` = `$border` per token table |
| Root container radius | `rounded-[--radius]` | `--radius` (md, 0.625 rem) — default card/input radius |
| Code value text | `font-mono text-foreground` | JetBrains Mono via `--font-mono` once §1.3 wiring lands; `$foreground` |
| Code value size (editable) | `text-sm font-medium` (14 px) | `--text-mono` role |
| Code value size (readonly-copy) | `text-base font-medium` (16 px) | `--text-mono` upper step |
| Code value size (redacted/readonly) | `text-[13px] font-medium` | `--text-mono` base |
| Redacted mask text | `text-muted-foreground` | masked bullets de-emphasised |
| Action buttons (Shuffle, Copy) | `variant="outline"` via `Button` atom | inherits `$border`, `$foreground`, `$muted` hover |
| "Copied" confirmation icon | `text-success` | NEW `$success` token (design-tokens.md §2.2) — green affirms the copy |
| Lock icon (redacted) | `text-muted-foreground` | `EyeOff` lucide icon, muted |
| Disabled state | `opacity-50` | standard disabled treatment across all atoms |
| Copy button "Copied" label | `text-success` | same `$success` token as the check icon |
| Input (editable variant) | `bg-muted border-input font-mono` | delegates to `Input` atom with `className="font-mono"` |

---

## Composition & deps — atoms, primitives, helpers

```
CodeDisplay
├── Input                (@camp404/ui/input)          — editable variant only
├── Button (size="icon") (@camp404/ui/button)          — Shuffle + Copy buttons
├── cn                   (@camp404/ui/lib/utils)       — conditional className merging
└── lucide-react icons   (peer dep, already used)
    ├── Shuffle          — shuffle button
    ├── Copy             — copy button idle state
    ├── Check            — copy button "Copied" state
    └── EyeOff           — redacted lock icon
```

No `@camp404/core` helpers required. `rankLevel` is not relevant (CodeDisplay has no rank-awareness). No DB or Next imports — component is pure presentation per the hybrid service-layer architecture constraint (`@camp404/ui` may import types + core, never db/next).

The 1500 ms copy-reset timer must use `useEffect` with a cleanup return to cancel on unmount, correcting the current bare `setTimeout` in `invite-form.tsx` L357–359.

---

## Absorbs — candidates replaced by this component

From the merge map (`component-library.md` merge map row):

| Absorbed candidate | Current location | Absorbed by variant |
|---|---|---|
| **CodeField** | Inline in `apps/web/app/tools/invite/invite-form.tsx` (L154–176) | `editable-shuffle` variant |
| **CodeBox** | Inline in `apps/web/app/tools/invite/invite-form.tsx` `SuccessPanel` (L347–362) | `readonly-copy` variant |
| **RedactedField** | Not yet implemented; specified in `component-library.md` MemberProfile entry + `design/spec/surfaces/14-roster.md` (government-ID field) | `redacted` variant |

After `CodeDisplay` ships, the inline code in `invite-form.tsx` is replaced with `<CodeDisplay>` calls and the bespoke `div.font-mono` + Copy `Button` is deleted. `RedactedField` never ships separately.

---

## Stories & tests

### Storybook stories (`packages/ui/src/components/code-display.stories.tsx`)

```
CodeDisplay.stories.tsx
├── EditableShuffle      — value="neon-toaster-mongoose", onChange+onShuffle wired
├── ReadonlyCopy         — value="iron-parrot-sunrise", onCopy only; click → "Copied" flip
├── ReadonlyDisplay      — value="mcp:user", no actions (MCP scope / family-tree via-line use)
├── Redacted             — value="A0148822", redacted=true; value must NOT appear in DOM
├── DisabledEditable     — EditableShuffle + disabled=true
├── DisabledCopy         — ReadonlyCopy + disabled=true
└── CopiedState          — ReadonlyCopy with copied state pre-triggered (for screenshot testing)
```

### Vitest / RTL test cases (`packages/ui/src/components/__tests__/code-display.test.tsx`)

| Test | Assertion |
|---|---|
| Renders value in editable variant | `getByRole('textbox')` has value prop |
| Shuffle button calls onShuffle | click → onShuffle called once |
| onChange lowercases input (consumer responsibility) | confirm prop passes through; consumer test in invite-form |
| Copy button calls onCopy | click → onCopy called |
| "Copied" label appears after copy click | button text → "Copied" after click |
| "Copied" label reverts after `copyResetMs` | jest.useFakeTimers; advance 1500 ms → "Copy" restored |
| Timer is cancelled on unmount | unmount before revert; no state-update warning |
| Redacted: value NOT in DOM | `queryByText('A0148822')` is null; bullets present |
| Redacted: EyeOff icon present | `getByRole('img', { hidden: true })` or aria check |
| Redacted: no copy/shuffle buttons rendered | `queryByRole('button')` is null |
| Disabled: all buttons have disabled attr | `getByRole('button', { name: /shuffle/i }).disabled` is true |
| aria-label applied to container | `getByRole('region', { name: 'Invite code' })` |

### Accessibility notes

- Root container: `role="group"` with `aria-label` from the `aria-label` prop (default "Code"). This groups the input/display + action buttons as one labelled unit.
- Editable variant: `Input` already has an `id`; consumer passes `aria-label` or wires a `Label htmlFor` — no change to `Input` atom.
- Redacted variant: `aria-label` on the mask span set to "Redacted" (`aria-label="Redacted, hidden"`); `EyeOff` icon is `aria-hidden`.
- Copy button: `aria-label="Copy code"` idle / `aria-label="Copied"` post-click (live-region via `aria-live="polite"` on the button text span, or switch `aria-label`).
- Shuffle button: `aria-label="Generate a new code"` (matches live code's "Generate a new silly code" — drop "silly" for the canonical label).
- No `role="status"` live region needed beyond the button `aria-label` swap.

---

## Build steps — ordered + acceptance criteria

1. **Prerequisite gate — `$success` token in globals.css**
   - AC: `--color-success` and `--color-success-foreground` exist in `packages/ui/src/styles/globals.css` `@theme` block (per design-tokens.md §2.2). `text-success` utility resolves. `CodeDisplay` must not ship with `text-emerald-*` in place of `text-success`.

2. **Prerequisite gate — `--font-mono` wired (or documented fallback)**
   - AC: Either `--font-mono: var(--font-jetbrains-mono), ui-monospace, ...` exists in globals.css and `next/font` loads JetBrains Mono (design-tokens.md §1.3), OR the plan explicitly documents `font-mono` as the immediate target and `ui-monospace` as the interim fallback for this component. Do not introduce a new `font-[JetBrains_Mono]` inline utility — use the token.

3. **Scaffold `packages/ui/src/components/code-display.tsx`**
   - Export `CodeDisplay` accepting `CodeDisplayProps`.
   - Render a `div` root with `role="group"`, `aria-label`, token-derived classes (`bg-muted rounded-[--radius] border border-input flex items-center gap-2 px-3 py-2.5`).
   - AC: component file exists, exports a named function, compiles with zero TS errors.

4. **Implement `readonly` variant (simplest path)**
   - A `<span className="font-mono ...">` displaying `value`; no buttons.
   - AC: ReadonlyDisplay story renders; value present in DOM; no buttons rendered.

5. **Implement `redacted` variant**
   - When `redacted=true`: render `<EyeOff aria-hidden />` + `<span aria-label="Redacted, hidden">{"•".repeat(8)}</span>`; omit value from DOM entirely (never render the raw string).
   - AC: Redacted story + test — `queryByText(value)` is null; eight bullets visible; no action buttons.

6. **Implement `readonly-copy` variant**
   - Add Copy `Button` (`size="icon"` / `size="sm"` with label). Wire `useEffect` copy-reset timer with cleanup. On copy: call `onCopy?.()`, flip internal `copied` state, revert after `copyResetMs`. Show `Check` icon + "Copied" label / `Copy` icon + "Copy" label.
   - AC: ReadonlyCopy story + test — click triggers flip; fake-timer advance reverts; unmount cancels timer (no warning).

7. **Implement `editable-shuffle` variant**
   - Compose `Input` atom (`className="font-mono border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none flex-1"`) within the root container, receiving `value`/`onChange`. Add Shuffle `Button` when `onShuffle` is supplied.
   - AC: EditableShuffle story + test — textbox has correct value; shuffle click calls handler; onChange fires.

8. **Implement `disabled` state**
   - Apply `opacity-50 pointer-events-none` to root when `disabled=true`. Pass `disabled` to `Input` and both `Button`s.
   - AC: Disabled stories render; all buttons have `disabled` attr; no interaction events fire.

9. **Write full test suite** (`__tests__/code-display.test.tsx`)
   - All test cases from Stories & tests section pass.
   - AC: `pnpm --filter @camp404/ui test` green; coverage includes all variant branches.

10. **Write Storybook stories** (`code-display.stories.tsx`)
    - All story entries from Stories & tests section present and render without console errors.
    - AC: `pnpm --filter @camp404/ui storybook` builds; all stories visible.

11. **Replace inline CodeField + CodeBox in `apps/web/app/tools/invite/invite-form.tsx`**
    - Delete the `div.flex.gap-2` CodeRow (L154–176) and the `div.flex…font-mono.text-lg` CodeBox in `SuccessPanel` (L347–362).
    - Replace with `<CodeDisplay value={code} onChange={setCode} onShuffle={() => setCode(generateInviteCode())} aria-label="Invite code" />` and `<CodeDisplay value={code} onCopy={async () => { await navigator.clipboard.writeText(code); }} aria-label="Invite code" />`.
    - AC: invite-form renders identically; existing E2E `invite-tracking.spec.ts` passes; no raw `font-mono text-lg` remains in the file.

12. **Wire `redacted` variant in `MemberProfile` (apps/web)**
    - The `DetailList` government-ID item (rendered by `camp-management-roster.tsx` via `PresentedMember.overview`) replaces its plain `dd` cell with `<CodeDisplay value={decryptedId} redacted aria-label="Government ID" />` for the ID/Passport field.
    - AC: redacted cell renders bullets; raw ID value absent from DOM; captain-only: the value passed to `CodeDisplay` is the already-decrypted string from the server action (CodeDisplay never decrypts — it only masks the display).

13. **Export from `@camp404/ui` barrel**
    - Add `export { CodeDisplay } from './components/code-display'` to `packages/ui/src/index.ts` (or whichever barrel the package uses).
    - AC: consumers can `import { CodeDisplay } from '@camp404/ui'`; no module-not-found errors.

---

## Consumers — which molecules/organisms/surfaces use CodeDisplay

| Consumer | Variant | Surface | File (post-build) |
|---|---|---|---|
| `InviteForm` — CodeField row | `editable-shuffle` | Invite tool `/tools/invite` | `apps/web/app/tools/invite/invite-form.tsx` |
| `InviteForm` — SuccessPanel CodeBox | `readonly-copy` | Invite tool success state | `apps/web/app/tools/invite/invite-form.tsx` |
| `MemberProfile` — government-ID field | `redacted` | Roster `/captains/camp-management` | `apps/web/app/captains/camp-management/camp-management-roster.tsx` (via `DetailList`) |
| `MCPConsent` — scope string display | `readonly` | MCP connect consent HTML | `apps/web/app/api/mcp/oauth/authorize/route.ts` (the raw HTML path renders scope as a styled `<span>` not a React component — noted as out-of-scope for the React `CodeDisplay` component; the raw HTML consent is outside the Next.js shell per `design/spec/surfaces/17-mcp-connect.md`) |
| `FamilyTree` — "via `<slug>`" line | `readonly` | Family tree `/family-tree` | `apps/web/app/family-tree/family-tree.tsx` L242 — the inline `<span className="font-mono">` can adopt `CodeDisplay readonly` after the component ships, but is a low-priority clean-up (not blocking) |
