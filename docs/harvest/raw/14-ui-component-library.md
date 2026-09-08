# Unit 14 — Shared UI component library (`@quagga/ui`) — full inventory vs `@camp404/ui`

**Harvest agent report.** Donor = `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app` (quagga-portal / AfrikaBurn Contributors App). Target = `/home/ryan/repos/Personal/camp-404`.
Every claim below is cited `path:line` against files read in full. Donor paths are relative to the donor repo root; target paths relative to the Camp 404 repo root.

---

## 1. Purpose

`packages/ui` is the donor's presentation layer: **49 `.tsx` components + 1 `.ts` contract file in `src/components/`, a 4-file `markdown-editor/` subdirectory, 7 pure-logic modules in `src/lib/`, one Tailwind v4 token stylesheet, and 27 test files carrying 272 `it()` cases.** It is consumed identically by all three donor apps (`apps/web` 3000, `apps/org` 3001, `apps/suppliers` 3002) — `apps/web` alone imports it 222 times.

Two architectural properties make it unusually portable, and both are worth stating up front because they are the whole reason this unit is high-yield for Camp 404:

1. **It is tenant-agnostic.** A grep for `groupId|orgId|group_id|tenant|isOrg|orgSlug|supplierId|MembershipRole|OrgPermissions|ProjectPermissions` across all of `packages/ui/src` returns **zero hits**. The org/participant/supplier split — the single biggest structural difference between the two products — does not reach into this package at all. Its only workspace couplings are six type/constant imports (§9).
2. **Every server behaviour is injected, never imported.** The account-security suite reaches Better Auth only through a locally-declared *structural* interface (`packages/ui/src/components/account-auth-client.ts:31-56`); the password policy arrives as a function prop (`account-change-password.tsx:48`); the audience resolver arrives as a number (`audience-select.tsx:31`); the capability verdict arrives as data (`account-capability-notice.tsx:22-30`). There is **no runtime `better-auth` import anywhere in `packages/ui`** — confirmed by reading every account-* file. The declared reason is in the file header: *"@quagga/ui can host the 2FA + passkey UI for ALL THREE apps … without taking a hard runtime dependency on better-auth"* (`account-auth-client.ts:2-6`).

The practical consequence: this is the one donor subsystem where the porting cost is dominated by a `s|@quagga/|@camp404/|g` rename plus a token/palette pass, not by architecture surgery.

**Structure note (important, and easy to miss):** the donor package has **no `src/index.ts` barrel**. `packages/ui/package.json:8-12` exports exactly three entries:

```json
"exports": {
  "./styles.css": "./src/styles/globals.css",
  "./components/*": "./src/components/*.tsx",
  "./lib/utils": "./src/lib/utils.ts"
}
```

So `lib/form-logic`, `lib/wizard`, `lib/bulletin`, `lib/client-errors`, `lib/report-client`, and `lib/use-dictation` are **not publicly exported** — they are internal, reached only by relative import from inside `packages/ui/src/components/*`. Camp 404's `packages/ui/package.json:8-13` has the same shape plus a `"./hooks/*": "./src/hooks/*.ts"` entry pointing at a directory that does not exist. Any port of a lib module needs either a new exports entry or a relative import.

---

## 2. File inventory with line counts

### 2.1 `packages/ui/src/components/` — 50 files, 6,925 lines

Sorted by size (from `wc -l`).

| Lines | File | One-line role |
|---:|---|---|
| 618 | `account-two-factor.tsx` | TOTP enrolment + QR + backup codes + regenerate + disable |
| 497 | `report-dialog.tsx` | The bug/feature reporter dialog (sheet on mobile) |
| 417 | `file-upload.tsx` | Vercel Blob **client** upload with progress + URL-paste fallback |
| 376 | `responsive-data-table.tsx` | One column set → `<table>` at md+, stacked cards below md |
| 275 | `account-passkeys.tsx` | WebAuthn passkey list/add/remove |
| 227 | `account-sign-in-methods.tsx` | Password / Google / Passkey method rows |
| 204 | `skeleton.tsx` | 8-primitive loading-skeleton kit |
| 167 | `account-change-password.tsx` | Change-password form (one field, no confirm-twice) |
| 165 | `wizard.tsx` | Numbered section navigator (rail + strip variants) |
| 164 | `toast.tsx` | Module-store toast + `<Toaster/>` |
| 163 | `account-sessions.tsx` | Active-session list + revoke / revoke-others |
| 156 | `select.tsx` | Radix Select wrapper (10 exports) |
| 155 | `dialog.tsx` | Radix Dialog wrapper (10 exports) |
| 145 | `report-settings-card.tsx` | "Bugs and feature requests" settings card |
| 145 | `report-launcher.tsx` | Bottom-**left** floating Report pill + popover menu |
| 144 | `report-diagnostics.tsx` | "What this attaches" disclosure panel |
| 144 | `notification-item.tsx` | One notification row, 7 kinds |
| 141 | `password-input.tsx` | Single password field + show/hide + strength meter |
| 137 | `account-two-factor-challenge.tsx` | Sign-in second factor (TOTP ⇄ backup code) |
| 124 | `phone-input.tsx` | International phone input (E.164 out, ZA default) |
| 118 | `table.tsx` | shadcn table primitives (8 exports) |
| 115 | `bulletin-card.tsx` | Bulletin card + read-rate bar |
| 109 | `switch.tsx` | Native `<button role="switch">` + **privacy variant + hardLocked** |
| 99 | `account-shell.tsx` | Account-page chrome + section nav (plain `<a>`) |
| 94 | `account-security-events.tsx` | Security-event feed card |
| 87 | `payment-details-block.tsx` | Payment reference/amount/status block (**0 app consumers**) |
| 85 | `card.tsx` | shadcn card (6 exports) |
| 81 | `toggle-group.tsx` | Radix ToggleGroup + inlined `toggleVariants` |
| 81 | `role-badge.tsx` | `RoleBadge` + `RoleSwatch` + 8-colour hex/label maps |
| 81 | `audience-select.tsx` | Audience picker + "Resolves to ~N burners" |
| 81 | `account-delete-elsewhere.tsx` | "Delete lives on the other app" card |
| 76 | `textarea-with-count.tsx` | Word-counted textarea |
| 74 | `field.tsx` | label · control · help · error wrapper + `privacyToggle` slot |
| 68 | `quilt-band.tsx` | Decorative SVG diamond band (**AfrikaBurn brand motif**) |
| 68 | `accordion.tsx` | Radix Accordion wrapper |
| 66 | `status-badge.tsx` | Registration-status → Badge variant/label maps |
| 64 | `account-auth-client.ts` | **Structural Better-Auth client interface** (the DI seam) |
| 63 | `pinned-bulletin-banner.tsx` | Slim pinned-bulletin banner |
| 63 | `checkbox.tsx` | Native `<input type=checkbox>` + **`AckRow`** |
| 57 | `button.tsx` | shadcn button, 6 variants × 4 sizes |
| 55 | `account-capability-notice.tsx` | "We can't do this yet" honest block |
| 54 | `tabs.tsx` | Radix Tabs wrapper |
| 54 | `popover.tsx` | Radix Popover wrapper (data-slot style) |
| 53 | `notification-bell.tsx` | Bell + capped unread badge |
| 52 | `empty-state.tsx` | Empty state with an **`action`** prop |
| 52 | `disabled-hint-tile.tsx` | "Parked, and here's why" tile |
| 36 | `badge.tsx` | 6-variant pill |
| 23 | `input.tsx` | shadcn input |
| 22 | `textarea.tsx` | shadcn textarea |
| 20 | `client-error-capture.tsx` | Mounts the recent-errors buffer, renders `null` |

### 2.2 `packages/ui/src/components/markdown-editor/` — 4 files, 310 lines

| Lines | File |
|---:|---|
| 196 | `markdown-editor.tsx` — Tiptap compose editor, markdown string in/out |
| 46 | `markdown-view.tsx` — read-only renderer (`editable:false` Tiptap) |
| 35 | `extensions.ts` — shared StarterKit + tiptap-markdown config (the sanitiser) |
| 33 | `markdown.ts` — headless `roundTripMarkdown()` |

### 2.3 `packages/ui/src/lib/` — 7 files, 712 lines

| Lines | File | Purity |
|---:|---|---|
| 194 | `client-errors.ts` | Browser-only, module singleton buffer |
| 170 | `use-dictation.ts` | `"use client"` React hook |
| 138 | `report-client.ts` | `"use client"`, `fetch`-based |
| 96 | `form-logic.ts` | **Pure, no React, no DOM** |
| 84 | `wizard.ts` | **Pure, no React, no DOM** |
| 24 | `bulletin.ts` | **Pure, no React, no DOM** |
| 6 | `utils.ts` | `cn()` — **byte-identical to Camp 404's** |

### 2.4 `packages/ui/src/components/__tests__/` — 27 files, 5,888 lines, **272 `it()` cases**

| Cases | File | Cases | File |
|---:|---|---:|---|
| 21 | `file-upload.test.tsx` | 11 | `phone-input.test.tsx` |
| 19 | `account-two-factor.test.tsx` | 11 | `responsive-data-table.test.tsx` |
| 15 | `tier2-3.test.tsx` | 11 | `toast.test.tsx` |
| 13 | `account-chrome.test.tsx` | 10 | `account-passkeys.test.tsx` |
| 13 | `reporter.test.tsx` | 10 | `account-sessions.test.tsx` |
| 13 | `skeleton.test.tsx` | 10 | `account-two-factor-challenge.test.tsx` |
| 12 | `markdown-editor.test.tsx` | 10 | `client-errors.test.ts` |
| 12 | `use-dictation.test.ts` | 10 | `report-client.test.ts` |
| 11 | `account-change-password.test.tsx` | 9 | `form-logic.test.ts` |
| 11 | `account-sign-in-methods.test.tsx` | 8 | `role-badge.test.tsx` |
| 11 | `form-controls.test.tsx` | 6 | `report-entry-points.test.tsx` |
| — | — | 6 | `toggle-group.test.tsx` |
| — | — | 5 | `components.test.tsx` |
| — | — | 4 | `audience-select.test.tsx` |

**Contrast:** Camp 404's `packages/ui` has 6 test files with **22 `it()` cases total** (`lib/__tests__/utils.test.ts` 4, `components/__tests__/toast.test.ts` 8, `badge.test.tsx` 3, `nav-card.test.tsx` 3, `switch.test.tsx` 2, `questionnaire-summary-card.test.tsx` 2). Donor is ~12× the test density on a package of comparable size.

### 2.5 Package config

- `packages/ui/package.json` — 3 exports, 25 runtime deps, 14 dev deps.
- `packages/ui/vitest.config.ts` — jsdom, `include: ["src/**/__tests__/**/*.test.{ts,tsx}"]`, `testTimeout: 30_000`, `hookTimeout: 30_000`, coverage `provider: "v8"` with **hard ratchet floors `lines: 89, statements: 88, functions: 83, branches: 84`** and a 25-line comment recording the measured whole-package figures (statements 91.92 = 967/1052, branches 87.59 = 819/935, functions 86.33 = 278/322, lines 92.65 = 908/980, measured 2026-08-04).
- `packages/ui/vitest.setup.ts` — 47 lines. `cleanup()` after each; jsdom stubs for `window.matchMedia`, `globalThis.ResizeObserver`, and four `Element.prototype` methods (`scrollIntoView`, `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`) that Radix reaches for.
- `packages/ui/components.json` — shadcn `style: "new-york"`, `rsc: true`, `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`. Camp 404's `packages/ui/components.json` is the same shadcn config shape with `@camp404/ui` aliases.

---

## 3. Camp 404's baseline — the 41 components in `packages/ui/src/components/*.tsx`

Listed first, as instructed, so the comparison below reads against a known set:

`alert`, `avatar`, `avatar-upload`, `badge`, `button`, `captain-lock`, `card`, `checkbox`, `code-display`, `combobox`, `command`, `date-control`, `detail-header`, `dialog`, `dictate-pill`, `divider`, `empty-state`, `ghost-back`, `google-button`, `grid-tile`, `icon-badge`, `input`, `input-field`, `label`, `nav-card`, `option-card-group`, `popover`, `progress-bar`, `qcard`, `questionnaire-summary-card`, `section-header`, `segmented-control`, `select`, `slider`, `spinner`, `stat-tile`, `stepper`, `switch`, `textarea`, `toast`, `top-chrome`.

Plus `packages/ui/src/lib/utils.ts` (6 lines, `cn`), `packages/ui/src/styles/globals.css`, and 40 `.stories.tsx` files (Storybook 10) which the donor has **no equivalent of** — the donor lists Storybook under "Explicitly NOT built" (`docs/build-spec.md:421`).

**In BOTH (12, same names):** `badge`, `button`, `card`, `checkbox`, `dialog`, `empty-state`, `input`, `popover`, `select`, `switch`, `textarea`, `toast`.

**DONOR-ONLY (38 files + the 4-file `markdown-editor/` dir):** `accordion`, `account-auth-client`, `account-capability-notice`, `account-change-password`, `account-delete-elsewhere`, `account-passkeys`, `account-security-events`, `account-sessions`, `account-shell`, `account-sign-in-methods`, `account-two-factor`, `account-two-factor-challenge`, `audience-select`, `bulletin-card`, `client-error-capture`, `disabled-hint-tile`, `field`, `file-upload`, `notification-bell`, `notification-item`, `password-input`, `payment-details-block`, `phone-input`, `pinned-bulletin-banner`, `quilt-band`, `report-diagnostics`, `report-dialog`, `report-launcher`, `report-settings-card`, `responsive-data-table`, `role-badge`, `skeleton`, `status-badge`, `table`, `tabs`, `textarea-with-count`, `toggle-group`, `wizard`.

**TARGET-ONLY (29):** `alert`, `avatar`, `avatar-upload`, `captain-lock`, `code-display`, `combobox`, `command`, `date-control`, `detail-header`, `dictate-pill`, `divider`, `ghost-back`, `google-button`, `grid-tile`, `icon-badge`, `input-field`, `label`, `nav-card`, `option-card-group`, `progress-bar`, `qcard`, `questionnaire-summary-card`, `section-header`, `segmented-control`, `slider`, `spinner`, `stat-tile`, `stepper`, `top-chrome`.

---

## 4. Component-by-component inventory

Each entry: what it does · digit-exact specifics · whether Camp 404 has an equivalent · portability verdict.

### 4.1 The 12 overlapping primitives

#### `button.tsx` (57 lines)
Six variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) × four sizes (`default: "h-10 px-4 py-2"`, `sm: "h-9 rounded-md px-3"`, `lg: "h-11 rounded-md px-8"`, `icon: "h-10 w-10"`), `asChild` via `@radix-ui/react-slot`, exports `{ Button, buttonVariants }` (`button.tsx:57`).
**Camp 404 equivalent:** yes, `packages/ui/src/components/button.tsx` — the variant strings are character-for-character identical; the only deltas are `focus-visible:ring-offset-background` being hoisted in the target's base string and the target adding a fifth size `"icon-lg": "h-14 w-14"` (target `button.tsx:27`). Semicolon style differs (target file is written without semicolons despite `.prettierrc.json` `"semi": true`).
**Verdict: no action — Camp 404's is the same component.**

#### `badge.tsx` (36 lines)
Six variants; base string is `"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors"` (`badge.tsx:9`).
**Camp 404 equivalent:** yes. Only differences: donor `success`/`warning` use `bg-success/20` and `bg-warning/20` (`badge.tsx:17-18`) where Camp 404 uses `/15` (target `badge.tsx:17-18`); comment says "role tags" vs "rank tags".
**Verdict: no action.**

#### `card.tsx` (85 lines)
`Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` (`card.tsx:78-85`).
**Camp 404 equivalent:** yes, 78 lines. **One live API delta:** donor `CardTitle` is `text-lg` (`card.tsx:38`), Camp 404's is `text-2xl`. Lifting a donor card layout wholesale will render a visibly larger title.
**Verdict: drop-in with a one-class reconciliation.**

#### `input.tsx` (23 lines) / `textarea.tsx` (22 lines)
Plain `React.InputHTMLAttributes` / `TextareaHTMLAttributes` forwardRefs.
**Camp 404 equivalent:** yes, near-identical (target's input adds `file:` pseudo-element classes and puts `ring-offset-background` on the base). Note Camp 404's WP11 (#135) already wants its own `Input` moved to board 06's `h-[46px] bg-muted border-border` — the donor's is still `h-10 … bg-background`, so it is **not** the answer to that ticket.
**Verdict: no action.**

#### `checkbox.tsx` (63 lines) — **API COLLISION**
Donor's `Checkbox` is a **themed native `<input type="checkbox">`** typed `Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">` (`checkbox.tsx:10-13`), with an explicit comment refusing the Radix dep: *"Native rather than @radix-ui/react-checkbox: the plain control is fully accessible, needs no client hooks (so it stays server-component-safe), and avoids adding a dependency"* (`checkbox.tsx:5-8`). It uses `accent-primary` for the tick colour.
It also exports a **second component Camp 404 has nothing like — `AckRow`** (`checkbox.tsx:34-61`): a whole-row `<label>` with `min-h-[44px]` (an explicit ≥44px touch target), `cursor-pointer`, `has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60`, an optional leading `icon` slot, and a `rowClassName` for the outer label. Used for registration and supplier-signup acknowledgements.
**Camp 404 equivalent:** `packages/ui/src/components/checkbox.tsx` (30 lines) is `@radix-ui/react-checkbox` and takes `onCheckedChange`, **not** `onChange`/`checked`. Any donor call site using `onChange={(e) => …e.currentTarget.checked}` will fail to compile against it.
**Verdict: the primitive is a no-action (keep Camp 404's Radix one); `AckRow` is a genuine gap — port it re-based on Camp 404's Radix `Checkbox`, keeping the 44px row and the `has-[:disabled]` styling.**

#### `switch.tsx` (109 lines) — **API COLLISION + a real gap**
Donor's is a hand-rolled `<button type="button" role="switch" aria-checked … data-state={isOn ? "checked" : "unchecked"}>` (`switch.tsx:55-61`), `h-5 w-9` track with an `h-4 w-4` thumb translating `translate-x-4`. Props: `variant?: "default" | "privacy"`, `checked?: boolean`, `onCheckedChange?: (checked: boolean) => void`, `hardLocked?: boolean` (`switch.tsx:24-35`).
The **privacy variant** renders a caps status label beside the track — `"On · Public"` / `"Off · Private"` / `"Always private"` with a `<Lock className="mr-1 inline-block h-3 w-3 align-[-1px]" />` glyph (`switch.tsx:85-101`). The label class constant is `PRIVACY_CAPS = "text-[10px] font-semibold uppercase tracking-wide leading-none text-muted-foreground select-none"` (`switch.tsx:21-22`).
The **hard-lock law** is implemented as: `const isOn = hardLocked ? false : checked; const isDisabled = disabled || hardLocked;` (`switch.tsx:51-52`) — it force-renders OFF, disables the control, and cannot be toggled. The file states plainly that *"UI is not the security boundary; this only mirrors the server-enforced law"* (`switch.tsx:19`).
Tested at `__tests__/form-controls.test.tsx:34-75`: three cases assert `On · Public`, `Off · Private`, and that `hardLocked` makes `aria-checked === "false"`, `disabled === true`, and a click fires **nothing**.
**Camp 404 equivalent:** `packages/ui/src/components/switch.tsx` (31 lines) is `@radix-ui/react-switch`, `h-6 w-11` with an `h-5 w-5` thumb, **no variants, no `hardLocked`**. Donor *default*-variant call sites are compatible as-is (`checked`/`onCheckedChange`/`disabled`/`aria-label` all match Radix's API); the **privacy variant has no target equivalent at all**.
**Verdict: port the privacy variant as a distinct component (e.g. `PrivacySwitch`) wrapping Camp 404's Radix `Switch`. This is directly relevant — Camp 404 stores SA ID/passport/bank details encrypted (`AGENTS.md:143-149`) and has no per-field privacy affordance whatsoever.**

#### `dialog.tsx` (155 lines)
Ten exports: `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger` (`dialog.tsx:144-155`). Written in the 2025 shadcn `data-slot` function style. Two props Camp 404's does not have: `DialogContent` takes `showCloseButton?: boolean` (`dialog.tsx:50`) and `DialogFooter` takes `showCloseButton?: boolean` that renders a `<Button variant="outline">Close</Button>` inside a `DialogPrimitive.Close asChild` (`dialog.tsx:109-113`). Overlay is `bg-background/80`, content `bg-card` `rounded-lg` `sm:max-w-lg`. **No `animate-in`/`zoom`/`slide` classes at all** — the donor does not depend on `tw-animate-css`.
**Camp 404 equivalent:** yes, 158 lines. Camp 404 imports `tw-animate-css` (`packages/ui/src/styles/globals.css:5`), so its overlays animate and a lifted donor dialog would sit motionless beside them.
**Verdict: keep Camp 404's; harvest only the two `showCloseButton` affordances if wanted.**

#### `popover.tsx` (54 lines)
`Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent` (`popover.tsx:54`). Content is `z-50 w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none`, `align = "center"`, `sideOffset = 4`.
**Camp 404 equivalent:** yes, 31 lines (older forwardRef style, no `PopoverAnchor`). Cosmetic difference only.
**Verdict: no action; `PopoverAnchor` is a free add if a donor component needs it.**

#### `select.tsx` (156 lines)
Ten exports including `SelectScrollUpButton`/`SelectScrollDownButton` (`select.tsx:145-156`). `SelectTrigger` is `h-10 w-full … border-input bg-background`; `SelectContent` defaults `position = "popper"` with `max-h-96 min-w-[8rem]`.
**Camp 404 equivalent:** yes, 159 lines, same export surface.
**Verdict: no action.**

#### `empty-state.tsx` (52 lines) — **API COLLISION**
Donor's takes `icon?`, `title` (required `string`), `description?: string`, **`action?: React.ReactNode`**, plus `children` (`empty-state.tsx:8-16`). Both `action` and `children` render, in that order. Container: `rounded-xl border border-dashed border-border bg-card/40 px-6 py-16`.
**Camp 404 equivalent:** `packages/ui/src/components/empty-state.tsx` (44 lines) has `icon`, `title`, `description` and **`children` only — no `action` prop**. Its icon is wrapped in a `h-10 w-10 rounded-full border bg-muted/40` chip; the donor's is a bare `<span>`. Container is `rounded-lg … bg-muted/10 px-6 py-12`.
**Verdict: adding `action?: React.ReactNode` to Camp 404's `EmptyState` is a 3-line change that unblocks a dozen lifted donor call sites. Do that rather than porting the donor file.**

#### `toast.tsx` (164 lines)
Module-level store, no context provider: `let toasts: ToastRecord[]`, a `Set<() => void>` of listeners, `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` where `getServerSnapshot` returns a stable `EMPTY` array (`toast.tsx:28-47, :145-149`). `DEFAULT_DURATION = 5000` (`toast.tsx:55`); `normalizeDuration` accepts `Infinity` (persist) and any finite `>= 0`, else falls back to the default (`toast.tsx:57-61`). `toast` is `Object.assign`'d with `.success/.error/.warning/.info/.dismiss` and each `push` returns an increasing numeric id (`toast.tsx:91-102`). Error toasts get `role="alert"`, everything else `role="status"` (`toast.tsx:121`).
**Camp 404 equivalent:** yes — and it is *the same file*. A semicolon-normalised diff shows Camp 404's version adds only: an exported `getToasts(): readonly ToastRecord[]` returning `toasts.slice()` (target `toast.tsx:63-66`), extra explanatory comments, and one dropped `text-card-foreground` class. Donor `toast.test.tsx` has 11 cases against Camp 404's 8.
**Verdict: no action on the component. The donor's 11-case `toast.test.tsx` is worth lifting for the three extra assertions (NaN duration, `dismiss(undefined)` clearing all, id monotonicity).**

---

### 4.2 Donor-only — form & field layer

#### `field.tsx` (74 lines) — **HIGH VALUE, drop-in**
The label · control · help · error wrapper. Props: `label: React.ReactNode`, `htmlFor?: string`, `required?: boolean`, `help?: React.ReactNode`, `error?: React.ReactNode`, **`privacyToggle?: React.ReactNode`** (a right-aligned label-row slot for a privacy `<Switch/>`), `children`, `className` (`field.tsx:15-31`).
Explicit wiring contract, stated because the component owns no hooks: *"pass the SAME `htmlFor` to Field and as the `id` of the control in `children`. Field derives `${htmlFor}-help` / `${htmlFor}-error` ids"* (`field.tsx:8-13`, implemented `:43-44`). **Error supersedes help** — when `error` is present the help text is not rendered at all (`field.tsx:63-71`), asserted by `__tests__/form-controls.test.tsx:109-119` (`queryByText("Public")` is `null`).
Most-used donor component after button/card/toast/badge/input: **18 files import it.**
**Camp 404 equivalent:** partial. `input-field.tsx` (58 lines) does label+input+helper+error but is welded to `<Input>` and generates its own id with `React.useId()`. There is **no generic control-agnostic field wrapper**, and nothing with a label-row slot.
**Verdict: drop-in. Port verbatim; it composes Camp 404's `Select`/`Textarea`/`Slider`/`Combobox` unchanged.**

#### `password-input.tsx` (141 lines) — **drop-in, but read the comment**
One password field with a show/hide toggle and a length-only strength meter. `BAR_COLOR: Record<PasswordStrengthScore, string>` = `{0: "bg-transparent", 1: "bg-destructive", 2: "bg-warning", 3: "bg-primary", 4: "bg-success"}` (`password-input.tsx:21-27`). Props: `hideStrength?: boolean`, `minLength?: number` (default `PASSWORD_MIN_LENGTH` = 15).
Works controlled **or** uncontrolled — it shadows the value in local state so the meter reads correctly either way (`password-input.tsx:53-63`).
Carries a 7-line comment recording a real defect and its fix (`password-input.tsx:90-96`): the toggle *"used to carry [a `tabIndex={-1}`], which took the only control for revealing a password out of the tab order on every password field in all three apps … Anyone working keyboard-only (or with a switch device) could type a 15-character passphrase and had no way to check it."*
**Camp 404 equivalent:** none. Camp 404 has no password UI at all — forgot/reset falls through to Neon Auth's hosted `<AuthView/>` (`apps/web/app/auth/[path]/page.tsx:40-45`).
**Verdict: drop-in (imports only `./input`, `../lib/form-logic`, `lucide-react`).**

#### `textarea-with-count.tsx` (76 lines)
Word-counted textarea. Counter string is `` `${count} / ${maxWords} words` `` when `maxWords` is set, else `` `${count} ${count === 1 ? "word" : "words"}` `` (`textarea-with-count.tsx:43-46`). Over-cap adds `border-destructive` to the textarea and `aria-invalid` (`:58-59`); the counter turns `text-destructive` when **over OR under** (`:65`). Controlled/uncontrolled shadowing as with `PasswordInput`.
Test asserts `"4 / 3 words"` and that the counter carries `text-destructive` (`__tests__/form-controls.test.tsx:121-128`).
**Camp 404 equivalent:** none. Camp 404 has `textarea.tsx` bare.
**Verdict: drop-in — needs `lib/form-logic.ts` alongside it.**

#### `phone-input.tsx` (124 lines) — light-adapt (2 new deps)
Themed wrapper around `react-phone-number-input` (which sits on `libphonenumber-js`). `DEFAULT_COUNTRY: Country = "ZA"` (`phone-input.tsx:19`). Renders the library's country picker through **Camp-style `Select`** and its number field through **`Input`**; flags come from `react-phone-number-input/flags` with a 3.5×5 rounded swatch (`phone-input.tsx:21-29`). Props: `value: string`, `onChange: (value: string) => void`, `id?`, `placeholder?`, `disabled?`, `defaultCountry?: Country`, `describedBy?`, `className?` (`:87-96`).
**The value contract is the point** and is nailed by 11 tests (`__tests__/phone-input.test.tsx:35-95`):
- opens seeded with `"+27"`, not an empty box;
- `onChange` **always** emits a string — `onChange={(v) => onChange(v ?? "")}` (`phone-input.tsx:116`) — the test comment says *"A consumer writing `undefined` into a hard-locked column is a data defect nothing downstream would catch"*;
- stored E.164 `"+27821234567"` renders as `"+27 82 123 4567"`;
- typing `0821234567` (with the SA trunk zero) emits `"+27821234567"`;
- **a documented library defect, recorded rather than endorsed:** select-all-and-paste of `0821234567` emits `"+0821234567"` — *"eleven digits behind a `+0`, which is not a valid number anywhere … the server-side check is what must refuse it"* (`phone-input.test.tsx:80-94`).
**Camp 404 equivalent:** none. **Verdict: light-adapt — add `react-phone-number-input ^3.4.17` + `libphonenumber-js ^1.13.9`, then it compiles against Camp 404's `Select`/`Input` unchanged. Port the test file too; the paste bug is real.**

#### `audience-select.tsx` (81 lines) — concept + a copy-lift
A **deliberately dumb** Select variant plus a live recipient count. `resolveLine(count, noun)` (`audience-select.tsx:41-45`): `count === 0` → `` `Resolves to no ${noun} yet` ``; `count === 1` → `` `Resolves to ~1 ${noun.replace(/s$/, "")}` `` (singularises); otherwise `` `Resolves to ~${count} ${noun}` ``. `countNoun` defaults `"burners"`, `placeholder` defaults `"Choose an audience"`. The count is hidden when `resolvedCount` is `null` **or** `undefined` (`:58`) — so a pre-selection state shows nothing rather than "0".
Header comment states the law: *"It does NOT resolve anything itself — the parent server action runs @quagga/core's resolveAudience and feeds `resolvedCount` down (one resolver, one display)"* (`audience-select.tsx:16-18`).
**Camp 404 equivalent:** none — and this is a live gap. Camp 404's `/captains/questionnaires/[key]/send` offers scopes `team` and `team_leads` that reach **zero people** because `team_memberships` has no production write path (WP6 #130), and the send screen has no audience-count affordance to expose that. `packages/db/src/broadcasts.ts` already exports `resolveAudience`.
**Verdict: light-adapt. Swap `options` to Camp 404's `broadcast_scope` enum values; `countNoun="members"`. This directly answers WP6's "zero-audience protection on sends".**

---

### 4.3 Donor-only — data display

#### `responsive-data-table.tsx` (376 lines) — **THE SINGLE HIGHEST-VALUE ASSET IN THIS UNIT**
One column declaration, two layouts: a real `<table>` at `md:block` and the *same rows* redrawn as stacked cards at `md:hidden` (`responsive-data-table.tsx:197, :263-264`).

The header comment names the problem it solved: *"Four org tables plus the questionnaire results rows each hand-rolled the desktop `<Table>` and got only horizontal scroll on phones — the designed mobile card was missing everywhere"* (`:19-22`).

Column type (`:39-58`) is exhaustively documented:
```ts
export type ResponsiveColumnRole = "title" | "badge" | "actions" | "default";

export interface ResponsiveColumn<T> {
  id: string;                       // unique within the set
  header: React.ReactNode;          // <th> at md+, label below md
  cell: (row: T) => React.ReactNode;
  role?: ResponsiveColumnRole;      // steers the CARD only
  mobileHidden?: boolean;           // md+ only; excluded from the card
  hideHeader?: boolean;             // sr-only <th> label
  align?: "left" | "right" | "center";
  cellClassName?: string;
  headClassName?: string;
}
```

The projection is a **pure function**, exported separately so it is unit-testable without React (`:82-115`):
```ts
export function projectColumnsToCard<T>(
  columns: ResponsiveColumn<T>[],
): CardProjection<T>
```
returning `{ title, badges, actions, pairs, hidden }`. **`mobileHidden` wins over any role** (`:94-97`) and declaration order is preserved within every slot.

Table props (`:126-151`): `columns`, `data`, `getRowKey: (row: T) => string`, `renderExpanded?: (row: T) => React.ReactNode`, `rowClassName?: (row: T) => string | undefined`, `emptyState?`, `caption?`, `className?`, `mobileAriaLabel?` (which *defaults to `caption` when caption is a plain string*, `:187-188`).
Expansion state is a `ReadonlySet<string>` toggled immutably (`:165-179`); `colSpan = columns.length + (expandable ? 1 : 0)` (`:186`). The expand control is an `<button aria-expanded aria-label={isOpen ? "Collapse row" : "Expand row"}>` with Chevron Down/Right (`:354-376`). Mobile pairs render as `<dl>/<dt>/<dd>`, right-aligned unless `align === "left"` (`:307-330`).
11 tests (`__tests__/responsive-data-table.test.tsx`), 3 of them against the pure projection alone.
**Camp 404 equivalent:** none — Camp 404 has **no `table.tsx` at all**, let alone a responsive one. Its captain roster at `/captains/camp-management` hand-rolls its layout.
**Verdict: drop-in (needs `table.tsx` alongside). This is the direct answer to WP5 (#129, roster data), WP9 (#133, roster operations — column sort/export slot into a column definition), and `design/recommendations.md` P0-3 (mobile roster).**

#### `table.tsx` (118 lines)
Standard shadcn new-york primitives: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` (`table.tsx:109-118`). The root wraps in `<div className="relative w-full overflow-x-auto">` (`:10`) so a wide table scrolls rather than breaking the layout — which is exactly the Artifact/mobile rule Camp 404's design system also wants. `TableHead` is `h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0`.
**Camp 404 equivalent:** none.
**Verdict: drop-in, zero deps beyond `cn`.**

#### `skeleton.tsx` (204 lines) — **drop-in, and Camp 404 has a named ticket for it**
Eight exports (`skeleton.tsx:31, :47, :68, :92, :111, :132, :153, :172, :182`):
- `Skeleton({className, ...props})` — one `animate-pulse rounded-md bg-muted` block, **`aria-hidden`**, no intrinsic size.
- `SkeletonRegion({className, children, label = "Loading…"})` — the wrapper every boundary renders once: `aria-busy="true"`, `aria-live="polite"`, **`data-loading="true"`**, and a single `<span className="sr-only">{label}</span>`.
- `SkeletonText({lines = 3})` — last line is `w-2/3`, the rest `w-full`.
- `SkeletonHeading({eyebrow = true, description = true})` — `h-3 w-40` / `h-7 w-64 max-w-full` / `h-3.5 w-full max-w-xl`.
- `SkeletonCard({lines = 3})`, `SkeletonRow({columns = 3})`, `SkeletonCardGrid({cards = 6, lines = 2, className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"})`, `SkeletonField()`, `SkeletonForm({fields = 4})`.

The design rationale is stated as a rule, not a preference (`skeleton.tsx:8-13`): *"a route boundary only stops the navigation feeling broken if it shows the DESTINATION's shape. A generic grey page is honest about 'something is happening' and dishonest about what — and when the real content lands the layout jumps, which reads as a second load. So each route composes these primitives with the SAME container classes its page uses, and the swap is a fill, not a reflow."*

Accessibility contract is tested (`__tests__/skeleton.test.tsx:36-67`): exactly **one** `.sr-only` per region however many bars are inside; `data-loading` exists *"so a browser test can prove a boundary appeared — 'we added a skeleton' is only true if a browser can see it."*

The donor ships **34 `loading.tsx` files** across the three apps built on this kit, plus per-app composition helpers: `apps/org/components/console-skeleton.tsx` (76 lines: `ConsoleHeadingSkeleton`, `ConsoleTableSkeleton`), `apps/web/components/boundary/page-skeleton.tsx` (44 lines), `apps/suppliers/components/route-skeleton.tsx` (48 lines).
**Camp 404 equivalent:** **none, and Camp 404 has ZERO `loading.tsx` files across 24 `force-dynamic` pages** — that is literally WP7 (#131).
**Verdict: drop-in. The single cheapest way to close WP7's first half.**

#### `status-badge.tsx` (66 lines) — concept, needs re-typing
Three exports plus a component: `REGISTRATION_STATUS_VARIANT: Record<RegistrationStatus, BadgeVariant>` (`status-badge.tsx:17-28`) = `draft: "outline"`, `submitted: "default"`, `under_review: "default"`, `changes_requested: "warning"`, `approved: "success"`, `rejected: "destructive"`, `withdrawn: "secondary"`; `REGISTRATION_STATUS_LABEL` (`:31-39`); `registrationStatusVariant(status)`; `<StatusBadge status children? className?>`.
`RegistrationStatus` is the donor's 7-value Zod enum (`packages/types/src/registration.ts:11-19`).
**Camp 404 equivalent:** none as a mapping component, though `packages/ui/src/components/badge.tsx` supplies the variants. Camp 404's analogous enums are `approval_status` `[pending, approved, rejected]` (`packages/db/src/schema.ts:50`), `promotion_request_status` `[sent, accepted, declined, cancelled]` (`:59`), `questionnaire_status` `[draft, published, unpublished]` (`:150`), `activation_status` `[draft, open, closed]` (`:141`).
**Verdict: concept-only — the *pattern* (a typed exhaustive `Record<Enum, BadgeVariant>` + `Record<Enum, string>` pair, guarded by a test that asserts the two maps have identical keysets) is the reusable thing, and the donor's `role-badge.test.tsx:19-40` shows exactly that guard. The AfrikaBurn registration lifecycle is not.**

#### `role-badge.tsx` (81 lines) — **rewrite, but steal the technique**
Exports `ROLE_COLOR_HEX: Record<RoleColor, string>` (`role-badge.tsx:8-17`) — `teal #2D7696`, `teal_deep #235C75`, `apricot #F4B672`, `peach #FFBC7D`, `sage #B6D090`, `olive #7D9953`, `rust #C24438`, `neutral #ADB6B3` — `ROLE_COLOR_LABELS` (`:19-28`), `RoleSwatch({color, className, selected})`, `RoleBadge({name, color = "neutral", emoji, className})`.
**The technique worth stealing:** the chip is drawn as a *translucent tint over the theme background* with a solid border — `style={{ backgroundColor: `${hex}22`, borderColor: `${hex}99` }}` (`:75`) — *"so a role chip stays legible in BOTH light and dark without per-theme classes."* The test pins the exact alphas (`__tests__/role-badge.test.tsx:42-55`): jsdom normalises `#2D769622` to `rgba(45, 118, 150, 0.133)` and `#2D769699` to `rgba(45, 118, 150, 0.6)`.
The test also enforces two invariants TypeScript cannot: the two maps must have **identical keysets**, and every hex must be **distinct** — *"Two roles that tint identically are two roles a reader cannot tell apart at a glance, which is the only thing the colour is for"* (`role-badge.test.tsx:19-40`).
**Camp 404 equivalent:** none. Camp 404's team badges on the roster are `Badge` variants over an 8-value fixed `team` enum (`packages/db/src/schema.ts:70-79`) with labels now configurable via `camp_settings.config` (`packages/db/src/camp-config.ts`).
**Verdict: rewrite the palette (the hex ramp is AfrikaBurn's brand); keep the `${hex}22`/`${hex}99` tinting technique and the exhaustive-map test.**

#### `payment-details-block.tsx` (87 lines) — **DEAD in the donor**
`STATUS_META: Record<PaymentStatus, {label, variant}>` = `pending: {"Awaiting payment", "warning"}`, `reconciled: {"Reconciled", "success"}`, `waived: {"Waived", "secondary"}` (`:10-17`). `formatAmount` uses `Intl.NumberFormat("en-ZA", {style:"currency", currency})` on `amountCents / 100`, with a `${currency} ${(amountCents/100).toFixed(2)}` catch fallback (`:31-40`). Renders `"To be confirmed"` when `amountCents` is not a number (`:75-78`). Closing line is hardcoded: *"We track — AfrikaBurn collects. No payment is processed here; quote this reference when you settle directly with AfrikaBurn."* (`:82-84`).
**Zero app consumers** — verified by grep across `apps/`, `packages/`, `e2e/`; the only non-doc reference is its own test (`__tests__/components.test.tsx:15-35`). The donor's own design QA whitelist records it as *"Library-only … reserved for future logistics apps; used on no page frame"* (`design/qa/whitelist.json:8-13`), and `docs/build-spec.md:283-285` confirms there is no `/payments` section in the console.
**Camp 404 equivalent:** none. Relevant anyway: Camp 404's `users.duesPaid` is read but written by nothing, and its Finances tile is `comingSoon: true` (WP10 #134).
**Verdict: concept-only. Camp 404's dues UI is a different shape (a camp collecting its own dues, not a platform refusing to touch money). The `Intl.NumberFormat` + cents-integer + "To be confirmed" pattern is the transferable part.**

---

### 4.4 Donor-only — navigation / chrome / progress

#### `wizard.tsx` (165 lines) + `lib/wizard.ts` (84 lines) — **drop-in pair**
The numbered section navigator. `NUMBER_STYLES` and `LABEL_STYLES` are `Record<WizardSectionState, string>` (`wizard.tsx:20-32`) over the four states. `StepMarker` renders a `<Check className="h-3.5 w-3.5"/>` when done, a `<Lock className="h-3 w-3"/>` when blocked, otherwise the number; sizes `h-7 w-7` (default) / `h-6 w-6` (`sm`) (`:34-61`).
Two variants share one derivation: `"rail"` (desktop vertical `<ol>`) and `"strip"` (mobile horizontal `<ol>` of markers). Both wrap in `<nav aria-label="Registration progress">` and print the progress label.
**Interactivity is opt-in and that is deliberate** — the file is server-component-safe with no hooks; passing `onSelect` turns each step into a `<button aria-current={s.state === "current" ? "step" : undefined}>`, omitting it renders static markers with no event handler (`wizard.tsx:16-18, :95, :139`). A `blocked` step is never a button in either variant.

The state machine is a pure function in `lib/wizard.ts:51-84`:
```ts
export function deriveWizardProgress(
  sections: WizardSectionInput[],
  currentId?: string,
): WizardProgress
```
Precedence rules, verbatim from `lib/wizard.ts:45-49`: *"a `done` section is always 'done'. Otherwise the resolved current section is 'current'; a `blocked` section is 'blocked'; anything else is 'todo'. When `currentId` is omitted (or points at a done/blocked section), the current section is the first not-done, not-blocked section."*
`label` is `` `${completed} of ${total} complete` `` (`lib/wizard.ts:81`); `index` is **1-based** (`:74`).
Six tests (`__tests__/tier2-3.test.tsx:90-137`) pin: `2 of 5 complete`, `currentId === "logistics"`, states `["done","done","current","todo","blocked"]`, indices `[1,2,3,4,5]`, honouring an explicit actionable `currentId`, and falling back off a done/blocked one.
**Camp 404 equivalent:** `stepper.tsx` (60 lines) is close but weaker: `StepperStep = { label: string; status: "done" | "active" | "upcoming" }` — **three states, no `blocked`, no derivation helper, no rail/strip variants, no `aria-current="step"`, and the caller derives every status by hand.** Camp 404 also has `progress-bar.tsx` and `segmented-control.tsx` covering adjacent ground.
**Verdict: `lib/wizard.ts` is a drop-in pure module worth taking on its own (it would feed Camp 404's `Stepper` and the questionnaire builder wizard). The component is a light-adapt — retitle the `aria-label` away from "Registration progress".**

#### `notification-bell.tsx` (53 lines) — drop-in
`count = 0`, `max = 99`. `const unread = Math.max(0, Math.floor(count))` (`:21`) — clamps negatives and fractions; `display = unread > max ? `${max}+` : String(unread)` (`:22`); accessible name is `` `Notifications, ${unread} unread` `` or `"Notifications, none unread"` (`:23-26`). Badge is hidden entirely at 0 and is `aria-hidden` when shown (the count is already in the button's name). Button is `h-10 w-10`. No hooks → server-safe.
Tested at `__tests__/form-controls.test.tsx:90-107` including the `250 → "99+"` cap.
**Camp 404 equivalent:** none as a component. Camp 404's `top-chrome.tsx` (83 lines) owns the header slot and its `/notifications` route exists, and there is a real unread count (`packages/db/src/broadcasts.ts` `countUnread`). No bell primitive.
**Verdict: drop-in.**

#### `notification-item.tsx` (144 lines) — light-adapt
One notification row. `export type NotificationKind = "registration" | "wrangler" | "role" | "questionnaire" | "supplier" | "security" | "bulletin"` (`:26-33`) and an exhaustive `NOTIFICATION_KIND_ICON: Record<NotificationKind, LucideIcon>` (`:36-44`) = `registration: PartyPopper`, `wrangler: Compass`, `role: UserCheck`, `questionnaire: ClipboardList`, `supplier: Package`, `security: ShieldAlert`, `bulletin: Megaphone`.
Props: `kind`, `title`, **`body?`**, `meta?`, `timeAgo?`, `source?`, `read = false`, `blocking = false` (`:46-70`). Meta line derivation: `meta ?? ([timeAgo, source].filter(Boolean).join(" · ") || null)` (`:85-86`). `isBlocking = blocking && kind === "questionnaire"` (`:87`) — a blocking flag on any other kind is ignored — and renders `"Required · blocks registration"` in `text-destructive` caps plus a destructive-tinted icon chip. Unread renders a `bg-primary` dot with `aria-label="Unread"`.
The `body` prop carries a stated reason (`:53-58`): *"Some notifications carry text that IS the message rather than a pointer to it — a reviewer's reason for rejecting a registration, above all — and a row that shows only the title silently discards it."*
Tests (`__tests__/tier2-3.test.tsx:25-57`) assert the icon map keyset matches the kind union **and that every icon is distinct**.
**Camp 404 equivalent:** none. Camp 404's `/notifications` page renders rows inline. Camp 404's kind enum is `broadcast_kind` `[announcement, team_message, lead_directive, reminder, system]` (`packages/db/src/schema.ts:156`) plus `broadcast_presentation` `[acknowledge, popup, feed]` (`:194`).
**Verdict: light-adapt — re-key the icon map to Camp 404's 5 `broadcast_kind` values; keep the `body`, the derived meta line, the unread dot and the exhaustive-map test.**

#### `account-shell.tsx` (99 lines) — light-adapt
Account-page chrome: eyebrow (`font-mono text-[11px] uppercase tracking-[0.2em]`), `<h1 className="text-3xl font-bold tracking-tight">`, description, then a `<nav aria-label="Account sections">` of pill links with `aria-current="page"` on the active one.
Three decisions are documented and all three are portable (`account-shell.tsx:5-19`): *"A plain `<nav>` of links rather than a Tabs component: these are separate routes, so the active state must survive a full page load and each entry has to be a real, shareable URL."* · *"PLAIN `<a>`, NOT next/link, because @quagga/ui takes no dependency on Next"* · *"SECTIONS ARE PASSED IN, not hardcoded … a component that decided this itself would be deciding product policy for apps it cannot see."*
`AccountSectionLink = { key: string; label: string; href: string }` (`:21-25`).
**Camp 404 equivalent:** none. Camp 404's `/profile` and `/profile/edit` have no shared shell and no section nav.
**Verdict: light-adapt — the default `note` prop is hardcoded to *"One AfrikaBurn account, whichever door you come in by — participant, organiser or supplier"* (`:38`), which is the org/participant split leaking into a prop default. Change the default, keep everything else.**

#### `pinned-bulletin-banner.tsx` (63 lines) — drop-in
`border-primary/30 bg-primary/10` banner, `<Pin/>` + wrapping title + a `Read →` anchor + optional `✕`. Server-safe by default: *"with no `onDismiss` it renders no event handler and holds no state"* (`:9-11`, implemented `:51-60`). `readLabel` defaults `"Read"`.
**Camp 404 equivalent:** none. Camp 404's announcements have `broadcast_presentation` `popup`/`feed` but no pinned-banner surface; `apps/web/app/acknowledgement-gate.tsx` is the full-screen takeover only.
**Verdict: drop-in.**

#### `bulletin-card.tsx` (115 lines) + `lib/bulletin.ts` (24 lines) — light-adapt
Card with a `<Megaphone/> BULLETIN` kicker, optional `Pinned` flag, `line-clamp-2` preview, meta line, an audience `Badge variant="outline"`, and an optional read-rate bar.
`readRate(read, of): ReadRate` (`lib/bulletin.ts:19-23`) — `total = Math.max(0, Math.floor(of))`, `opened = Math.min(Math.max(0, Math.floor(read)), total)`, `percent = total === 0 ? 0 : Math.round((opened/total)*100)`. Four tests pin `readRate(12,30) === {read:12, of:30, percent:40}`, `readRate(1,3).percent === 33`, `readRate(0,0)` → 0% (no divide-by-zero), and `readRate(50,30)` clamping to `{read:30, of:30, percent:100}` (`__tests__/tier2-3.test.tsx:59-88`).
**Camp 404 equivalent:** none. Camp 404 tracks `notification_deliveries` with read state and `countUnread`/`markRead` in `packages/db/src/broadcasts.ts`, so the read-rate maths has real data behind it the moment a captain-facing announcement list wants it.
**Verdict: `lib/bulletin.ts` is a drop-in pure module; the card is a light-adapt (retitle the kicker).**

#### `disabled-hint-tile.tsx` (52 lines) — **drop-in and immediately useful**
A deliberately-disabled tile that names a parked capability *and says why*. Props: `title`, `hint` ("the honest one-line reason it's parked"), `icon?` (defaults `<Lock className="h-4 w-4"/>`), `tag?` ("Separate app", "Coming later"). Renders `aria-disabled="true"`, `border-dashed`, `opacity-70`, with the tag as a `text-[10px] uppercase tracking-wide` pill.
Header names the real uses (`:5-9`): Containers *"separate app — for large camps"*, Water/Ice/Gas *"pending AfrikaBurn input"*, Placement & Art grants *"entitlement — process TBC"*.
**Camp 404 equivalent:** none as a component. **But Camp 404 has exactly this problem, eight times over:** `apps/web/app/home/tile-catalogue.ts:60-176` marks 8 of 12 home tiles `href: null, comingSoon: true` (Camp Tasks, Finances, Crew Roster, Crew Tasks, Crew Forms, Crew Announcements, My Teams, My Tasks), and `grid-tile.tsx` renders them.
**Verdict: drop-in — or better, fold the `hint`+`tag` affordance into Camp 404's existing `grid-tile.tsx`. Camp 404's honesty rule (`CONTRIBUTING.md` house rule in the donor: *"a disabled control says why"*) has no current implementation.**

#### `quilt-band.tsx` (68 lines) — **DO NOT PORT**
A decorative full-width SVG band of brand-triad diamonds. One `30×10` `<pattern patternUnits="userSpaceOnUse">` with three `<polygon>`s filled `var(--color-ab-teal)`, `var(--color-ab-apricot)`, `var(--color-ab-sage)` (`:47-62`). `aria-hidden`, `h-2.5 w-full overflow-hidden`, `opacity` prop defaults `0.9`.
Contains one genuinely reusable trick (`:27-28`): *"useId embeds colons, invalid in an SVG url(#id) reference — strip them"* → `` const patternId = `quilt-${reactId.replace(/:/g, "")}`; ``.
**15 files import it** — the most-used donor-only component — because it is the identity motif on every app-shell header.
**Camp 404 equivalent:** none, and none wanted.
**Verdict: AfrikaBurn brand asset. Do not port. Steal only the `useId().replace(/:/g,"")` line if Camp 404 ever inlines an SVG pattern.**

---

### 4.5 Donor-only — Radix wrappers

#### `accordion.tsx` (68 lines)
`Accordion` (= `AccordionPrimitive.Root`), `AccordionItem`, `AccordionTrigger`, `AccordionContent`. Trigger rotates its chevron via `[&[data-state=open]>svg]:rotate-180`. **Content depends on two tokens Camp 404 does not have:** `data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down` (`accordion.tsx:58`), defined in `packages/ui/src/styles/globals.css:21-39` as `--animate-accordion-down: accordion-down 0.2s ease-out` / `-up`, plus their two `@keyframes` blocks keyed on `var(--radix-accordion-content-height)`.
**Camp 404 equivalent:** none. **Verdict: light-adapt — needs `@radix-ui/react-accordion ^1.2.18` **and** the two `--animate-accordion-*` tokens + keyframes copied into Camp 404's `@theme`, or the classes silently compile to nothing. Camp 404's `tw-animate-css` does not supply them.**

#### `tabs.tsx` (54 lines)
`Tabs`, `TabsList` (`h-10 … rounded-md bg-muted p-1`), `TabsTrigger` (`data-[state=active]:bg-background data-[state=active]:shadow-sm`), `TabsContent`.
**Camp 404 equivalent:** none as a component. `segmented-control.tsx` (99 lines) covers the visual idea but is a different primitive.
**Verdict: light-adapt — needs `@radix-ui/react-tabs ^1.1.14`. Coverage note: the donor's own vitest config flags `accordion.tsx` and `tabs.tsx` as "still dark on purpose … Radix re-exports whose forwardRefs only merge a className (v8 records zero branches in either)" (`packages/ui/vitest.config.ts` comment).**

#### `toggle-group.tsx` (81 lines)
`ToggleGroup`, `ToggleGroupItem`, `toggleVariants`. The cva is **inlined deliberately** — *"so we don't take on @radix-ui/react-toggle as a second dependency just for its cva"* (`:9-11`). Variants `default: "bg-transparent"` / `outline: "border border-input bg-background"`; sizes `default: "h-10 px-3"`, `sm: "h-9 min-w-9 px-2.5"`, `lg: "h-11 px-5"`. On-state: `data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:text-foreground`.
**A documented footgun, pinned by a test:** `ToggleGroupItem` resolves classes as `context.variant ?? variant` (`:68-69`) — **the group's context WINS over the item's own prop**. The test comment (`__tests__/toggle-group.test.tsx:6-12`): *"An author who writes `<ToggleGroupItem variant="outline">` inside a default-variant group gets it silently ignored — no error, no warning, just the wrong chrome. That is surprising enough that changing it should be a deliberate act, which is what the last case here makes it."*
**Camp 404 equivalent:** `segmented-control.tsx` is the nearest but is single-select only.
**Verdict: light-adapt — needs `@radix-ui/react-toggle-group ^1.1.17`. Useful for multi-select filter chips on a roster (WP9).**

---

### 4.6 Donor-only — the account-security suite (10 components + 1 interface, 1,916 lines)

**This whole suite is provider-agnostic and is the single largest greenfield opportunity for Camp 404** — a repo-wide grep for `passkey|two-factor|twoFactor|2fa|totp|webauthn|session list|revoke session|security event` across Camp 404's `apps/` + `packages/` returns **zero files**.

#### `account-auth-client.ts` (64 lines) — **THE PIVOT FILE**
Declares the *structural* subset of the Better Auth client the UI depends on, so `packages/ui` takes no runtime auth dependency. Verbatim (`account-auth-client.ts:14-56`):

```ts
export type ClientResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message?: string | undefined } | null };

export interface TwoFactorEnableData { totpURI: string; backupCodes: string[]; }
export interface BackupCodesData { backupCodes: string[]; status?: boolean; }

export interface AccountAuthClient {
  twoFactor: {
    enable(input: { password?: string }): Promise<ClientResult<TwoFactorEnableData>>;
    verifyTotp(input: { code: string; trustDevice?: boolean }): Promise<ClientResult<unknown>>;
    verifyBackupCode(input: { code: string; trustDevice?: boolean }): Promise<ClientResult<unknown>>;
    disable(input: { password?: string }): Promise<ClientResult<unknown>>;
    generateBackupCodes(input: { password?: string }): Promise<ClientResult<BackupCodesData>>;
  };
  passkey: {
    addPasskey(input?: { name?: string; authenticatorAttachment?: "platform" | "cross-platform" }): Promise<ClientResult<unknown>>;
    deletePasskey(input: { id: string }): Promise<ClientResult<unknown>>;
  };
}

export function clientErrorMessage(
  error: { message?: string | undefined } | null,
  fallback: string,
): string {
  return error?.message?.trim() ? error.message : fallback;
}
```

The file states *why* the methods are declared as methods rather than properties (`:9-11`): *"Methods are declared as METHODS (bivariant) so the real client — whose methods accept extra optional args and return wider discriminated unions — is assignable here without `any`."*
**Camp 404 gating question (unverified, flagged low-confidence):** this interface was written against `better-auth 1.6.25`; Camp 404's root `package.json:26` has `pnpm.overrides` forcing `"better-auth": "~1.4.18"` transitively under `@neondatabase/auth 0.4.1-beta`. Whether Neon Auth's 1.4.x client exposes `twoFactor.*` and `passkey.*` in these shapes at all is **the one question that gates this entire suite** and was not verifiable from either repo's source.

#### `account-two-factor.tsx` (618 lines) — heavy-adapt / concept
Full TOTP enrolment card. Flow stated verbatim (`:34-38`): *"turn on → confirm password → scan QR / copy the setup key → verify a 6-digit code → backup codes shown ONCE (copy / download) → 2FA is on."*
Digit-exact details:
- `secretFromTotpUri(uri)` parses `otpauth://…?secret=` via `new URL(uri).searchParams.get("secret")`, returning `null` on throw (`:43-50`).
- `groupSecret(secret)` = `secret.replace(/(.{4})/g, "$1 ").trim()` — 4-char blocks for manual typing (`:53-55`).
- QR via `react-qr-code`, `size={160}`, on a forced `bg-white p-3` panel (`:352-354`).
- Code field: `inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}` with `onChange` normalising `e.target.value.replace(/\D/g, "").slice(0, 6)`; submit disabled until `code.length === 6` (`:372-395`).
- Backup codes render in a `grid-cols-2` `font-mono` list, shown exactly once.
- **A 15-line comment records a real, costly bug and its fix** (`:151-165`): the copy button was `void navigator.clipboard?.writeText(…)`, so *"the button flipped to 'Copied ✓' unconditionally … The user then pressed 'I've saved them', the panel closed, and the ten codes were gone for good: we show them once and cannot show them again. That is a lockout manufactured by a reassuring tick, on the one screen where being wrong costs the most."* The fix awaits the write, and on failure sets an error and leaves the codes on screen (`:166-179`). A second comment at `:429-431` notes the backup panel *"never rendered `error` before, so a refused clipboard write had nowhere to surface even once it was detected."*
- `downloadCodes()` builds a `text/plain` Blob with a two-line header and `a.download = "afrikaburn-backup-codes.txt"` (`:181-196`).
- `requiresPassword` prop gates the password confirm — *"True when the account has a password credential (Better Auth requires it); false for a Google-only / passkey-only account"* (`:62-68`).
- 19 tests (`__tests__/account-two-factor.test.tsx`), grouped: the setup key, `beginEnrol`, the 6-digit code, copying, downloading, managing an enabled account.
**Camp 404 equivalent:** none. **Verdict: heavy-adapt (gated on the `AccountAuthClient` question). The clipboard lesson and the "shown once" discipline are portable regardless.**

#### `account-two-factor-challenge.tsx` (137 lines) — heavy-adapt / concept
The sign-in second factor. Two modes, `"totp"` (default) and `"backup"`, with `maxLength={totp ? 6 : 20}` and different normalisation per mode (`e.target.value.replace(/\D/g,"").slice(0,6)` vs `.trim()`) (`:88-96`). A `"Trust this device for 30 days"` checkbox threaded to `trustDevice` (`:102-110`). Submit disabled `totp ? code.length !== 6 : code.length === 0` (`:121`). A mode-switch button reading *"Lost your authenticator? Use a backup code"* ⇄ *"Use a code from your authenticator app instead"* — the stated design reason: *"Two ways through, so a lost authenticator is never a dead end"* (`:18-20`).
**Camp 404 equivalent:** none. **Verdict: same gating as above.**

#### `account-passkeys.tsx` (275 lines) — heavy-adapt / concept
`PasskeyRow = { id: string; name: string | null; deviceType: string | null; createdAt: string | null }` (`:33-38`). Device type is rendered `multiDevice → "Synced"`, `singleDevice → "This device"`, else `"Passkey"` (`:169-173`). Name field is `maxLength={64}`.
**A 16-line comment records a hydration bug worth remembering** (`:69-81`): support detection was `typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined"` **evaluated during render** — *"On the server the first half is false, so every visitor was served HTML that said 'This browser doesn't support passkeys' with the Add button already disabled — a verdict on a browser nobody had consulted, and wrong for the large majority of them. It also disagreed with the client's first render, which is a hydration mismatch."* The fix is a **tri-state** `useState<boolean | null>(null)` set in a `useEffect` (`:82-85`), with `null` meaning "not asked yet" and rendering the button live and saying nothing about support.
Closing note enforces the product law: *"A passkey is a faster way in, not your only one — your password stays active, so losing a device never locks you out"* (`:267-271`), with a test group literally named `describe("recovery honesty")` (`__tests__/account-passkeys.test.tsx:280`).
**Camp 404 equivalent:** none. **Verdict: heavy-adapt. The tri-state feature-detection pattern is a drop-in idea for any Camp 404 capability probe (Camp 404's `enable-push.tsx` has adjacent concerns).**

#### `account-sessions.tsx` (163 lines) — **light-adapt, and portable regardless of provider**
`SessionView = { token: string; label: string; ipAddress: string | null; lastSeen: string | null; current: boolean }` (`:26-32`). `SessionActionResult = { ok: true; message?: string } | { ok: false; error: string }` (`:34-35`) — the same result-object shape Camp 404's `DEFERRED.md:53-58` wants to standardise on.
`relative(iso)` (`:37-48`), digit-exact: `null` or `NaN` → `"Last seen unknown"`; `mins < 2` → `"Active now"`; `mins < 60` → `` `${mins} minutes ago` ``; `hours < 24` → `` `${hours} hour${hours === 1 ? "" : "s"} ago` ``; else `` `${days} day${days === 1 ? "" : "s"} ago` ``.
**Two honest departures from the design mock, both stated and both worth importing as policy** (`:13-20`):
1. *"The mock shows 'Cape Town, South Africa'. We do not geolocate — we have an IP address and nothing else — so we show the IP and say that's what it is. An invented city is a security lie: the whole point of this list is 'do I recognise this?', and a wrong city defeats it."* The on-screen copy repeats it (`:98-101`).
2. *"'Sign out everywhere' keeps THIS device signed in … Signing yourself out while securing your account is a hostile outcome, so the label says so."* Hence the button label `"Sign out everywhere else"` (`:108`), disabled when `others === 0`.
The empty state is also honest (`:113-117`): *"We couldn't read your active sessions right now. That means the list is unavailable, not that nothing is signed in."*
`onRevoke`/`onRevokeOthers` are injected server actions; the component owns a `useTransition` + a `busyToken` so the pressed row shows `"Ending…"` (`:62-63, :152-154`).
**Camp 404 equivalent:** none. **Verdict: light-adapt. The presentation is 100% provider-agnostic — Camp 404 supplies two server actions returning `SessionActionResult`. Whether Neon Auth exposes session listing/revocation is the only open question.**

#### `account-security-events.tsx` (94 lines) — **light-adapt, fully provider-agnostic**
`SecurityEventRow = { id: string; title: string; body: string | null; createdAt: Date }` (`:26-31`). Dates via `d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })` (`:33-39`). Uses `EmptyState` with a default `emptyDescription`.
Two rules stated (`:17-24`): *"TITLES ARE RESOLVED BEFORE THEY GET HERE, by @quagga/core's `describeSecurityEvent`: no wording is stored in the database, and none is invented in this package."* And on the `note` prop: *"The closing note names what the feed does NOT contain, because a security log that quietly omits a category trains the reader to trust a completeness it does not have."*
**Camp 404 equivalent:** none. Camp 404 *has* an `audit_log` table (`packages/db/src/schema.ts:1180`) with **zero production consumers** — this component is a ready-made reader for it.
**Verdict: drop-in (takes only `events`, `note?`, `emptyDescription?`). Pairs naturally with un-orphaning `audit_log`.**

#### `account-change-password.tsx` (167 lines) — **light-adapt; the injection pattern is the lesson**
Props (`:44-60`): `minLength: number`, `assess: (password: string) => PasswordAssessment`, `onSubmit: (input: {currentPassword, newPassword, revokeOtherSessions}) => Promise<ChangePasswordResult>`, `onDone?`, `onChanged?`, `idPrefix = "account"`.
`PasswordAssessment = { ok: boolean; error?: string | null }` — declared locally, with the reason given (`:24-29`): *"declared here rather than imported because @quagga/ui takes no dependency on core. `error` is `string | null | undefined` so core's shape (which nulls it on success) satisfies it without a cast at every call site."*
`ChangePasswordResult = { ok: true; message?: string } | { ok: false; error: string }` (`:35-36`).
Header states the law (`:18-22`): *"THE POLICY IS INJECTED, not imported. `assess` is @quagga/core's `assessPassword` handed in by the app — the same function the server action enforces … The client check is a courtesy either way; the server call is the boundary, and this component cannot become a second, drifting definition of what a good password is."*
Includes a `Switch`-backed **"Sign out my other devices"** row, default `true`, with the honest sub-label *"Recommended. This device stays signed in."* (`:128-141`).
`idPrefix` namespaces `${idPrefix}-current-password` / `${idPrefix}-new-password` so two forms coexist on one page.
**Camp 404 equivalent:** none. **Verdict: light-adapt. Even if Camp 404 never builds a bespoke password screen, the injected-policy pattern is directly applicable to its questionnaire builder validators.**

#### `account-sign-in-methods.tsx` (227 lines) — light-adapt
Three `MethodRow`s (Password / Google / Passkeys) with badges `Active`/`Not set`, `Connected`/`Not connected`. Props at `:31-55` include `unlinkNotice: string` (*"The unlink capability's own words, resolved from @quagga/core by the app"*), `securityHref: string` (*"apps mount the suite at their own paths"*), `methodCount: number`, and `isLastMethod = methodCount <= 1` (`:108`).
The header enumerates exactly what is real and what is not (`:15-29`), including *"Setting a FIRST password — not offered. The only password endpoint we have is `change-password`, which requires the current one; a Google-only account has none. Rather than a form that would always fail, the row says so."*
Closing note: `isLastMethod ? "This is your only way to sign in — it can't be removed. Add another method first." : "At least one sign-in method must stay active on your account."` (`:220-222`).
**Camp 404 equivalent:** none. Camp 404 has `google-button.tsx` and a bespoke sign-in/sign-up at `/auth/[path]` but no method inventory.
**Verdict: light-adapt.**

#### `account-capability-notice.tsx` (55 lines) — **drop-in, and the best small idea in the unit**
```ts
export interface CapabilityVerdict {
  label: string | null;   // null → render nothing
  message: string;
}
```
(`:22-30`). `if (!verdict.label) return null;` (`:39`) — so a caller passes it **unconditionally** rather than branching at every call site, and *"the day a capability flips to `supported` the notice still disappears everywhere at once"* (`:15-17`).
The rule it enforces (`:7-9`): *"a surface for a capability our auth server does not expose must say so plainly and offer NO control that pretends otherwise."* Styled `border-dashed bg-muted/30` with an `<Info/>` and an outline `Badge` — *"Deliberately not styled as an error: nothing is broken, and nothing the reader did caused it"* (`:19-20`).
**Camp 404 equivalent:** none. Camp 404's near-analogue is `captain-lock.tsx` (36 lines, "VIEW ONLY / No data for your rank"), which is about *clearance*, not *capability*. Camp 404 has at least four surfaces that need a capability notice today: push is inert without Firebase env (`DEFERRED.md:80-85`), dictation is inert without `GROQ_API_KEY`, feedback AI is inert without `ANTHROPIC_API_KEY` (`apps/web/app/layout.tsx:69-77` already threads `aiAvailable`), and Telegram outbound is deliberately dormant.
**Verdict: drop-in. 55 lines, one dependency (`Badge`).**

#### `account-delete-elsewhere.tsx` (81 lines) — **do not port**
Exists purely because deletion lives on a different app in a three-app deployment (`:11-31`). Camp 404 has one app and already owns deletion end-to-end (`apps/web/app/profile/edit/delete-account.tsx`, `packages/db/src/account.ts`).
**Verdict: multi-app artefact. The one transferable sentence is its rationale — *"An account suite whose Delete tab is simply missing reads as 'you cannot delete this account', which is false"* (`:14-16`) — i.e. don't hide a capability, explain where it lives.**

---

### 4.7 Donor-only — the in-app reporter (4 components, 931 lines + 2 lib modules)

Camp 404 already has shake-to-report (`apps/web/components/feedback/report-bug-dialog.tsx`, `use-shake-gesture.ts`, `app/feedback-gate.tsx`, `app/feedback/actions.ts` → GitHub issue via `lib/github-feedback.ts` + optional AI via `lib/feedback-ai.ts`). The donor's is the **same product, more finished**, and it directly answers two open Camp 404 items: WP10 (#134) item (h) *"no manual 'Report a problem' entry point (shake is the only trigger, `apps/web/app/feedback-gate.tsx:14`)"* and the shake-spec's own follow-ups.

#### `report-launcher.tsx` (145 lines) — **drop-in; this IS Camp 404's missing manual entry point**
A fixed pill at **bottom-LEFT**, with the reason stated (`:5-9`): *"Left because the bottom-right is where a page puts its own primary action, and a permanently floating control that sits on top of 'Submit registration' is a defect dressed as a feature."*
Classes: `fixed bottom-5 left-5 z-40 … rounded-full border border-border bg-card shadow-lg`, `max-sm:p-3 sm:px-4 sm:py-2.5`, **`print:hidden`** (`:86-89`). The z-index carries a comment: *"z-40, under the dialog's z-50: once the reporter is open the pill must not sit on top of its own scrim."* On a phone the label becomes `max-sm:sr-only` and the pill collapses to a circle.
Opens a `Popover` with two choices — `bug` "Report a bug / Something is broken", `feature` "Request a feature / Something is missing" (`:32-53`) — and a footer line shown **before** the dialog opens: *"Opens a public issue. Your name and email are never attached."* (`:128-133`), with the reason: *"Said before the dialog opens, not only inside it: where this goes is the first thing worth knowing about pressing the button."*
Props: `className?`, `dictationEnabled?: boolean` (default `true`).
Mount rule (`:11-13`): *"Mounted from each app's signed-in shell, never from the root layout — filing needs a session, and offering the control to somebody who would be refused is worse than not offering it."*
**Camp 404 equivalent:** none — shake is the only trigger.
**Verdict: drop-in (needs `Popover` ✓ and `ReportDialog`).**

#### `report-dialog.tsx` (497 lines) — light-adapt
Dialog on desktop, sheet on phone via media-query variants on one `DialogContent` (`:270`): `max-h-[92dvh] gap-0 overflow-y-auto p-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl sm:max-w-[600px]`.
Three load-bearing behaviours, named in the header (`:12-22`):
1. **Choosing Feature removes the diagnostics entirely, and says so.** `includeDiagnostics: type === "bug" && attachDiagnostics` (`:248`) — *"whatever the toggle last said while Bug was selected"* — and the panel is replaced by a `bg-success/10` block headed *"Nothing about your device is attached"* (`:433-448`).
2. **The disclosure sits above the Send button, expanded, on a bug** — `<ReportDiagnosticsPanel defaultOpen />` (`:424`).
3. **Dictation is never the only way in** — `canDictate = dictation.supported && dictationEnabled` (`:229`); when false the mic is hidden and a `<MicOff/>` line distinguishes *"Dictation isn't switched on for this deployment"* from *"Dictation isn't available in this browser"* (`:405-412`).
Other digit-exact details: `maxLength={REPORT_DESCRIPTION_MAX}` (= 5,000) with a live `{description.length.toLocaleString()} / {REPORT_DESCRIPTION_MAX.toLocaleString()} characters` counter (`:373, :382-385`); reopening resets everything except the type (`:197-206`); a dictated transcript is **appended and re-clamped** — `(current ? `${current.trimEnd()} ${text}` : text).slice(0, REPORT_DESCRIPTION_MAX)` (`:218-223`) with the reason *"`maxLength` on the textarea only governs typing. A long dictation could push the field past the server's cap, and the report would then be refused at submit — after the recording, with no indication which part was too much"*; `showCloseButton={!submitting}`; the success panel reads `Filed as issue #{filed.number}` with a `View it on GitHub` link and the honest line *"It's in the queue tagged `needs-triage`. Nobody has looked at it yet, and it isn't assigned to anyone."* (`:274-289`).
**Camp 404 equivalent:** `apps/web/components/feedback/report-bug-dialog.tsx` — a simpler dialog with no type choice, no diagnostics disclosure, no dictation.
**Verdict: light-adapt. Camp 404 already has the server half (`app/feedback/actions.ts`, `lib/github-feedback.ts`) and the voice half (`/api/voice/transcribe`, `lib/groq.ts`).**

#### `report-diagnostics.tsx` (144 lines) — light-adapt
The "What this attaches" panel, rendered in **both** the dialog and Account settings — *"Two copies would drift, and this is the text somebody consents to"* (`:6-7`).
It renders the **real** payload: `useDiagnosticsSnapshot()` calls `buildDiagnostics()` **in a `useEffect`, not in render**, with the reason given (`:47-48`): *"`collectEnvironment()` reads `window` and `navigator`, and this component is rendered inside a server-rendered tree."* And it snapshots **once per mount**, deliberately not recomputed as the person types (`:36-42`).
Header pill reads `` `${fields.length} ${fields.length === 1 ? "FIELD" : "FIELDS"}` ``. The error-count warning reads *"{n} recent error(s) from this tab is/are attached — the last {REPORT_LOGS_MAX} are kept, and they can quote whatever was on screen when they happened."* (`:119-132`). Values are `break-all font-mono text-[11px]` with a comment explaining why (a user-agent has no spaces to wrap on).
The closing caveat, which is the honest bit (`:135-140`): *"Paths only — never the query string, so invite tokens and search terms stay out. Emails, phone and ID numbers in what you write are stripped before posting. That's pattern matching, not a guarantee: don't paste somebody else's details."*
**Camp 404 equivalent:** none — Camp 404's bug dialog attaches nothing and discloses nothing.
**Verdict: light-adapt — needs `REPORT_LOGS_MAX` and `ReportDiagnostics` moved into `@camp404/core`, plus `lib/client-errors.ts` + `lib/report-client.ts`.**

#### `report-settings-card.tsx` (145 lines) — light-adapt
The Account-settings entry. Exists for a specific reason (`:6-9`): *"It exists for the question you cannot ask the corner pill: what does this send? Answering it only inside the dialog means the only way to read the disclosure is to start a report, which is backwards."*
`filingEnabled = false` (no `GITHUB_TOKEN`) replaces the two buttons with a `<PlugZap/>` block: *"Reporting isn't switched on for this deployment … which is why there is no Report button in the corner. Everything below still describes what a report would attach once it is."* (`:62-77`).
The closing disclosure is unusually candid (`:124-134`): *"Reports are filed as public issues on GitHub by the AfrikaBurn maintainer account, on your behalf, and they arrive untriaged. Your name, email and account ID are never in them. The server writes an audit line pairing the issue number with your account, so a maintainer reading that log could work out who to ask — but nothing notifies you, and nobody is watching the issue on your behalf."*
**Camp 404 equivalent:** none.
**Verdict: light-adapt — swap "AfrikaBurn maintainer account" for Camp 404's.**

#### `client-error-capture.tsx` (20 lines) — drop-in
`useEffect(() => installClientErrorCapture(), [])`, returns `null`. Mount rule (`:9-13`): *"It belongs in the ROOT layout of each app, above everything else, because the errors worth having are the ones that happen before anybody thinks to open the reporter."*
**Camp 404 equivalent:** none. **Verdict: drop-in (needs `lib/client-errors.ts`).**

---

### 4.8 Donor-only — media & rich text

#### `file-upload.tsx` (417 lines) — **heavy-adapt, high value**
Vercel Blob **client** upload (`import { upload } from "@vercel/blob/client"`), browser → Blob directly, *"bypassing the 4.5 MB serverless-body cap and giving real progress"* (`:18-21`).
Constants: `DEFAULT_MAX_BYTES = 8 * 1024 * 1024` (8 MB), `IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]` (`:31-32`).
Props (`:34-66`): `value: string[]`, `onChange: (urls: string[]) => void`, `handleUploadUrl: string`, `blobConfigured: boolean`, `kind: string`, `variant?: "image" | "file"` (default `"image"`), `maxFiles = 1`, `maxSizeBytes = DEFAULT_MAX_BYTES`, `acceptedTypes?`, `allowUrlPaste = true`, `urlPlaceholder?`, `hint?`, `disabled = false`, `onCommit?`, `className?`, `ariaLabel?`.
Behaviours, digit-exact:
- Filename sanitiser: `file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80)`, uploaded to `` `${kind}/${safeName}` `` with `clientPayload: JSON.stringify({ kind })` (`:172-181`).
- Validation messages: image variant → `"Upload a PNG, JPEG, WebP, or GIF image."`; file variant → `"That file type isn't allowed here."`; size → `` `That file is larger than ${formatBytes(maxSizeBytes)}.` `` where `formatBytes` yields `MB` ≥ 1 MiB, `KB` ≥ 1 KiB, else `B` (`:134-144, :403-407`). Tested table-driven at `__tests__/file-upload.test.tsx:171-181`: `8388608 → "8 MB"`, `524288 → "512 KB"`, `500 → "500 B"`.
- Over-cap batch: `const room = Math.max(0, maxFiles - value.length)` then `` toast.info(`Only ${room} more ${room === 1 ? "file fits" : "files fit"} here.`) `` (`:149-155`).
- `commit(next)` calls `onChange(next)` then `setTimeout(onCommit, 0)` — *"Let React flush the new value before a consumer's autosave reads it"* (`:107-111`).
- Progress: an inline `role="progressbar"` with `aria-valuenow={state.percentage}` and batch copy `` `Uploading ${index} of ${total}… ${percentage}%` `` (`:299-319`).
- `fileNameFromUrl(url)` decodes the last path segment, falling back to the raw URL on throw (`:409-417`).
- **Honest degradation**: `blobConfigured === false` hides the dropzone entirely and shows only the URL-paste field plus *"File uploads aren't configured on this deployment — paste a link to an already-hosted file instead."* (`:391-396`).
- **Security posture, stated** (`:21-25`): the app's `handleUploadUrl` route sets server-enforced `allowedContentTypes` + `maximumSizeInBytes` on the issued token, *"so type/size validation is a SERVER boundary, not just this client's pre-check."*
- 21 tests, the most of any file in the package.
**Two brand-token leaks to fix:** `bg-ab-charcoal/70 text-ab-warmwhite` on the image remove button (`:236`) — those tokens don't exist in Camp 404's `@theme`, so the button would render transparent-on-transparent.
**Camp 404 equivalent:** partial and narrower. Camp 404 has `avatar-upload.tsx` (180 lines) plus a **server-side** route pair `/api/uploads/avatar` (write) + `/api/avatar` (read proxy) and `lib/image.ts` `cropResizeToSquare`. That is a single-image, server-routed, avatar-specific path — no multi-file, no drag-and-drop, no progress, no URL-paste fallback, no non-image support.
**Verdict: heavy-adapt. `@vercel/blob ^2.4.0` is already in Camp 404's tree (`README.md:16` names Vercel Blob as storage), but Camp 404 has no `handleUpload` route — that server half must be written. Retoken the two `ab-*` classes. Highest value if Camp 404 ever builds documents/receipts UI (its `documents` and `reimbursements` tables are live but MCP-only).**

#### `markdown-editor/` (4 files, 310 lines) — light-adapt (4 new deps)
- `extensions.ts` (35 lines) is the **security boundary**: `StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } })` + `Markdown.configure({ html: false, linkify: true, breaks: false, transformPastedText: true, transformCopiedText: true })`. The stated safety argument (`:12-16`): *"`html: false` makes tiptap-markdown treat raw HTML in the markdown as plain text rather than parsing it, and the ProseMirror schema below is the sanitiser — generated HTML can only contain nodes/marks this schema defines, so there is no path for arbitrary/script HTML to render."*
- `markdown-editor.tsx` (196 lines): markdown string in/out; 6-button toolbar (bold, italic, H2, link, bullet list, ordered list); `onMouseDown={(e) => e.preventDefault()}` on every toolbar button so focus is not stolen; `window.prompt("Link URL", previous)` for links with `""` meaning unset and `null` meaning cancel (`:62-71`); controlled-reset effect that compares serialised markdown before calling `setContent(value, { emitUpdate: false })` so the caret is never clobbered while typing (`:175-183`).
  **An accessibility fix worth importing verbatim** (`:147-156`): `editorProps.attributes` sets `role: "textbox"`, `"aria-multiline": "true"` and an `aria-label`, because *"a bare `contenteditable` div announces as a generic group … it is the difference between 'Bulletin body, group' and 'Bulletin body, multi-line edit text' in a screen reader. Found because the e2e spec asked for it by role and could not find it — an accessibility gap surfacing as a test failure, which is the honest version of what that assertion was for."*
- `markdown-view.tsx` (46 lines): `editable: false`, `immediatelyRender: false`, same extensions → same sanitiser.
- `markdown.ts` (33 lines): `roundTripMarkdown(markdown: string): string` — spins a detached `new Editor({extensions, content})`, reads `editor.storage.markdown.getMarkdown()`, and `editor.destroy()` in a `finally`. Explicitly *"not for hot server-side paths"* (`:6-8`). Tested for mark preservation, link destination preservation, and **idempotence on a second pass** (`__tests__/tier2-3.test.tsx:153-179`).
**Camp 404 equivalent:** none — Camp 404 has `react-markdown ^10.1.0` + `rehype-sanitize ^6.0.0` installed, so it would render markdown but has no *editor*. Camp 404's announcement composer at `/captains/announcements` writes plain text.
**Verdict: light-adapt — needs `@tiptap/core|pm|react|starter-kit ^3.29.0` + `tiptap-markdown ^0.9.0` (5 packages). Nested-path export resolution (`@camp404/ui/components/markdown-editor/markdown-editor`) is inferred from the `"./components/*"` exports spec but **untested in Camp 404** — verify on first port. Low confidence.**

---

## 5. Capability list (exhaustive, each cited)

Presentation capabilities this package provides, as distinct from components:

1. **Responsive table→card projection from one column declaration** — `responsive-data-table.tsx:82-115` (pure) + `:153-352` (render).
2. **Route-boundary loading skeletons with a single polite announcement per boundary and a `data-loading` E2E hook** — `skeleton.tsx:47-64`.
3. **Word counting matching a server-side rule** — `lib/form-logic.ts:15-20`, mirrored from `@quagga/core` `word-count.ts` (deliberate duplication, `lib/form-logic.ts:5-8`).
4. **Length-only password strength with no composition rules** — `lib/form-logic.ts:74-96`, `PASSWORD_MIN_LENGTH = 15`, `STRENGTH_FULL_AT = 32`.
5. **Wizard section-state derivation with done > current > blocked > todo precedence** — `lib/wizard.ts:51-84`.
6. **Read-rate maths clamped into `[0, of]` with no divide-by-zero** — `lib/bulletin.ts:19-23`.
7. **In-memory recent-error buffer capturing `window.error`, `unhandledrejection`, and `console.error`** — `lib/client-errors.ts:84-132`.
8. **Device-environment collection that is about the device, never the person** — `lib/client-errors.ts:151-194`.
9. **Microphone capture with a hard stop and guaranteed release** — `lib/use-dictation.ts:49-170`.
10. **Report submission with a checked (not cast) 201 response** — `lib/report-client.ts:80-117`.
11. **Audio transcription round-trip that stores nothing server-side** — `lib/report-client.ts:123-138`.
12. **TOTP enrolment: QR + grouped setup key + 6-digit verify + one-time backup codes + regenerate + disable** — `account-two-factor.tsx`.
13. **Second-factor sign-in challenge with a backup-code recovery path and trust-device** — `account-two-factor-challenge.tsx`.
14. **Passkey list/add/remove with tri-state WebAuthn feature detection** — `account-passkeys.tsx:82-85`.
15. **Session list + per-session revoke + revoke-others-but-not-this-one** — `account-sessions.tsx:65-91`.
16. **Security-event feed rendering pre-resolved titles** — `account-security-events.tsx`.
17. **Change password with injected policy and an opt-in "sign out my other devices"** — `account-change-password.tsx`.
18. **Capability-verdict notice that renders nothing when a capability is supported** — `account-capability-notice.tsx:39`.
19. **Per-field privacy toggle with a non-toggleable hard-lock state** — `switch.tsx:51-52, :85-101`.
20. **≥44px acknowledgement row wrapping a checkbox** — `checkbox.tsx:43-61`.
21. **International phone entry emitting E.164 or `""`, never `undefined`** — `phone-input.tsx:116`.
22. **Multi-file client-direct Blob upload with progress, drag-drop, per-file validation and a URL-paste fallback** — `file-upload.tsx`.
23. **Markdown compose + read-only render sharing one schema that IS the sanitiser** — `markdown-editor/extensions.ts:12-16`.
24. **Headless markdown normalisation (`roundTripMarkdown`)** — `markdown-editor/markdown.ts:27-33`.
25. **Bottom-left, `print:hidden`, z-40 report launcher with pre-disclosure** — `report-launcher.tsx:86-89, :128-133`.
26. **Consent-before-send diagnostics disclosure rendering the real payload** — `report-diagnostics.tsx:43-51`.
27. **Toast store with `role="alert"` for errors and `role="status"` for everything else** — `toast.tsx:121`.
28. **Audience picker with a parent-resolved recipient count and singularising copy** — `audience-select.tsx:41-45`.
29. **Notification row with an exhaustive kind→icon map and a blocking flag scoped to questionnaires** — `notification-item.tsx:36-44, :87`.
30. **Bell with a clamped, capped unread count in the accessible name, badge hidden at 0** — `notification-bell.tsx:21-26`.
31. **Honest "parked capability" tile that names the reason** — `disabled-hint-tile.tsx`.
32. **Field wrapper deriving `-help`/`-error` ids with error superseding help** — `field.tsx:43-44, :63-71`.
33. **Registration-status → badge-variant/label maps as data** — `status-badge.tsx:17-39`.
34. **Two-theme-legible role chips via `${hex}22`/`${hex}99` tinting** — `role-badge.tsx:75`.
35. **Cursor-pointer restoration across Radix `[role=…]` elements after Tailwind v4 dropped it** — `styles/globals.css:171-186`.

---

## 6. Data model

**`packages/ui` owns no database tables, no columns, and no `pgEnum`s.** It is a pure presentation package. Every enum-shaped value it handles arrives as a TypeScript union imported from `@quagga/types`, or is declared locally in the component.

Enum-shaped types the package **consumes** (verbatim):

- `RegistrationStatus` — `packages/types/src/registration.ts:11-19`:
  `z.enum(["draft", "submitted", "under_review", "changes_requested", "approved", "rejected", "withdrawn"])`. Doc comment says *"Keep in sync with `registrationStatusEnum` in @quagga/db schema.ts."*
- `RoleColor` — `packages/types/src/roles.ts:244-254`:
  `z.enum(["teal", "teal_deep", "apricot", "peach", "sage", "olive", "rust", "neutral"])`, plus `ROLE_COLORS = RoleColor.options` (`:256`). Doc: *"Curated color palette keys derived from the brand ramp … NOT freeform hex — token-mapped at render so both themes stay legible."*
- `PaymentStatus` — `packages/types/src/payments.ts:10-11`: `z.enum(["pending", "reconciled", "waived"])`.
- `ReportType` — `packages/core/src/report.ts:45`: `export type ReportType = "bug" | "feature";`

Enum-shaped types the package **declares itself**:

- `NotificationKind` — `notification-item.tsx:26-33`: `"registration" | "wrangler" | "role" | "questionnaire" | "supplier" | "security" | "bulletin"`.
- `ToastVariant` — `toast.tsx:12`: `"info" | "success" | "warning" | "error"`.
- `WizardSectionState` — `lib/wizard.ts:7`: `"done" | "current" | "todo" | "blocked"`.
- `ResponsiveColumnRole` — `responsive-data-table.tsx:37`: `"title" | "badge" | "actions" | "default"`.
- `DictationState` — `lib/use-dictation.ts:24-25`: `"idle" | "requesting" | "recording" | "transcribing" | "unsupported"`.
- `PasswordStrengthScore` — `lib/form-logic.ts:52`: `0 | 1 | 2 | 3 | 4`.

Numeric constants imported from `@quagga/core` (`packages/core/src/report.ts:52-65`), all verbatim:

```
REPORT_DESCRIPTION_MAX  = 5_000
REPORT_ENV_FIELDS_MAX   = 25
REPORT_ENV_VALUE_MAX    = 500
REPORT_LOGS_MAX         = 20   // "Twenty, not the original's thirty"
REPORT_LOG_MESSAGE_MAX  = 2_000
REPORT_LOG_STACK_MAX    = 4_000
```
Plus, in the same file but not reached by the UI: `ISSUE_BODY_MAX = 60_000` (*"GitHub's hard body limit is 65536; leave room"*) and `STACK_IN_BODY_MAX = 1_200`.
Related Zod shapes: `EnvFieldSchema { label: max 60, value: max REPORT_ENV_VALUE_MAX }` (`report.ts:76-79`); `ReportErrorLogSchema { timestamp: number, source: max 40, message: max 2000, stack?: max 4000, route?: max 300 }` (`:82-89`); `ReportDiagnosticsSchema { environment: array max 25, errorLogs: array max 20 }` (`:92-95`).

Constants declared inside `packages/ui`:

```
lib/form-logic.ts:50   PASSWORD_MIN_LENGTH = 15
lib/form-logic.ts:68   STRENGTH_FULL_AT    = 32   (module-private)
lib/use-dictation.ts:47 DEFAULT_MAX_DURATION_MS = 90_000
toast.tsx:55           DEFAULT_DURATION    = 5000
file-upload.tsx:31     DEFAULT_MAX_BYTES   = 8 * 1024 * 1024
file-upload.tsx:32     IMAGE_TYPES = ["image/png","image/jpeg","image/webp","image/gif"]
phone-input.tsx:19     DEFAULT_COUNTRY: Country = "ZA"
notification-bell.tsx  max = 99 (prop default)
```

---

## 7. Public API surface (exported signatures, verbatim)

### `src/lib/utils.ts`
```ts
export function cn(...inputs: ClassValue[])
```

### `src/lib/form-logic.ts`
```ts
export function countWords(input: string | null | undefined): number
export interface WordCountStatus { count: number; max?: number; over: boolean; under: boolean }
export function wordCountStatus(
  value: string | null | undefined,
  opts: { min?: number; max?: number } = {},
): WordCountStatus
export const PASSWORD_MIN_LENGTH = 15
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4
export interface PasswordStrength {
  length: number; meetsMin: boolean; score: PasswordStrengthScore; label: string; percent: number
}
export function passwordStrength(password: string, min: number = PASSWORD_MIN_LENGTH): PasswordStrength
```

### `src/lib/wizard.ts`
```ts
export type WizardSectionState = "done" | "current" | "todo" | "blocked"
export interface WizardSectionInput { id: string; label: string; done?: boolean; blocked?: boolean }
export interface WizardSection { id: string; label: string; index: number; state: WizardSectionState }
export interface WizardProgress {
  sections: WizardSection[]; completed: number; total: number; label: string; currentId: string | null
}
export function deriveWizardProgress(
  sections: WizardSectionInput[], currentId?: string,
): WizardProgress
```

### `src/lib/bulletin.ts`
```ts
export interface ReadRate { read: number; of: number; percent: number }
export function readRate(read: number, of: number): ReadRate
```

### `src/lib/client-errors.ts`
```ts
export function installClientErrorCapture(): () => void   // idempotent; returns teardown
export function recentClientErrors(): ReportErrorLog[]    // copy, oldest first
export function clearClientErrors(): void
export function collectEnvironment(extra: EnvField[] = []): EnvField[]
```

### `src/lib/report-client.ts`
```ts
export interface SubmitReportInput {
  type: ReportType; description: string;
  dictated?: boolean; useAi?: boolean; includeDiagnostics?: boolean
}
export function buildDiagnostics(): ReportDiagnostics
export class ReportError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number)
}
export async function submitReport(input: SubmitReportInput): Promise<ReportResponse>
export async function transcribeRecording(audio: Blob): Promise<string>
```
Endpoints are module constants: `REPORT_ENDPOINT = "/api/report"`, `TRANSCRIBE_ENDPOINT = "/api/report/transcribe"` (`report-client.ts:19-20`) — *"Same path in all three."*

### `src/lib/use-dictation.ts`
```ts
export type DictationState = "idle" | "requesting" | "recording" | "transcribing" | "unsupported"
export interface UseDictationOptions { onTranscript: (text: string) => void; maxDurationMs?: number }
export interface UseDictation {
  state: DictationState; error: string | null;
  start: () => Promise<void>; stop: () => void; supported: boolean
}
export function useDictation(options: UseDictationOptions): UseDictation
```

### Components — exported symbols (grouped)
```
accordion.tsx                 Accordion, AccordionItem, AccordionTrigger, AccordionContent
account-auth-client.ts        ClientResult<T>, TwoFactorEnableData, BackupCodesData,
                              AccountAuthClient, clientErrorMessage(error, fallback)
account-capability-notice.tsx CapabilityVerdict, AccountCapabilityNotice({verdict, className})
account-change-password.tsx   PasswordAssessment, ChangePasswordResult, AccountChangePassword
account-delete-elsewhere.tsx  AccountDeleteElsewhere({href, consequences, linkLabel})
account-passkeys.tsx          PasskeyRow, AccountPasskeysProps, AccountPasskeys
account-security-events.tsx   SecurityEventRow, AccountSecurityEvents({events, note, emptyDescription})
account-sessions.tsx          SessionView, SessionActionResult, AccountSessions
account-shell.tsx             AccountSectionLink, AccountShell
account-sign-in-methods.tsx   SignInMethodsProps, AccountSignInMethods
account-two-factor.tsx        AccountTwoFactorProps, AccountTwoFactor
account-two-factor-challenge  AccountTwoFactorChallengeProps, AccountTwoFactorChallenge
audience-select.tsx           AudienceOption, AudienceSelectProps, AudienceSelect
badge.tsx                     Badge, badgeVariants, BadgeProps
bulletin-card.tsx             BulletinCardProps, BulletinCard
button.tsx                    Button, buttonVariants, ButtonProps
card.tsx                      Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent
checkbox.tsx                  Checkbox, AckRow, CheckboxProps, AckRowProps
client-error-capture.tsx      ClientErrorCapture(): null
dialog.tsx                    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
                              DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger
disabled-hint-tile.tsx        DisabledHintTileProps, DisabledHintTile
empty-state.tsx               EmptyStateProps, EmptyState
field.tsx                     FieldProps, Field
file-upload.tsx               FileUploadProps, FileUpload
input.tsx                     Input, InputProps
markdown-editor/*             MarkdownEditor, MarkdownEditorProps, MarkdownView, MarkdownViewProps,
                              markdownExtensions, roundTripMarkdown
notification-bell.tsx         NotificationBell, NotificationBellProps
notification-item.tsx         NotificationKind, NOTIFICATION_KIND_ICON, NotificationItemProps,
                              NotificationItem
password-input.tsx            PasswordInput, PasswordInputProps
payment-details-block.tsx     PaymentDetailsBlockProps, PaymentDetailsBlock
phone-input.tsx               PhoneInputProps, PhoneInput
pinned-bulletin-banner.tsx    PinnedBulletinBannerProps, PinnedBulletinBanner
popover.tsx                   Popover, PopoverTrigger, PopoverAnchor, PopoverContent
quilt-band.tsx                QuiltBandProps, QuiltBand
report-diagnostics.tsx        ReportDiagnosticsPanelProps, ReportDiagnosticsPanel
report-dialog.tsx             ReportDialogProps, ReportDialog
report-launcher.tsx           ReportLauncherProps, ReportLauncher
report-settings-card.tsx      ReportSettingsCardProps, ReportSettingsCard
responsive-data-table.tsx     ResponsiveColumnRole, ResponsiveColumn<T>, CardProjection<T>,
                              projectColumnsToCard<T>, ResponsiveDataTableProps<T>, ResponsiveDataTable<T>
role-badge.tsx                ROLE_COLOR_HEX, ROLE_COLOR_LABELS, RoleSwatch, RoleBadge
select.tsx                    Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
                              SelectLabel, SelectItem, SelectSeparator,
                              SelectScrollUpButton, SelectScrollDownButton
skeleton.tsx                  SkeletonProps, Skeleton, SkeletonRegion, SkeletonText, SkeletonHeading,
                              SkeletonCard, SkeletonRow, SkeletonCardGrid, SkeletonField, SkeletonForm
status-badge.tsx              REGISTRATION_STATUS_VARIANT, REGISTRATION_STATUS_LABEL,
                              registrationStatusVariant, StatusBadge_Props, StatusBadge
switch.tsx                    Switch, SwitchProps
table.tsx                     Table, TableHeader, TableBody, TableFooter, TableHead, TableRow,
                              TableCell, TableCaption
tabs.tsx                      Tabs, TabsList, TabsTrigger, TabsContent
textarea.tsx                  Textarea, TextareaProps
textarea-with-count.tsx       TextareaWithCount, TextareaWithCountProps
toast.tsx                     ToastVariant, ToastOptions, ToastRecord, toast, Toaster
toggle-group.tsx              ToggleGroup, ToggleGroupItem, toggleVariants
wizard.tsx                    WizardProps, Wizard
```

---

## 8. UX behaviours, validation & edge-case rules (digit-exact)

Everything below is a rule the code enforces, with its citation.

**Counting & strength**
- A "word" is a whitespace-delimited run after `trim()`; `"a   well-run   camp"` is 3 words; `"line one\nline two"` is 4 (`lib/form-logic.ts:15-20`, `__tests__/form-logic.test.ts:16-22`).
- Password buckets by length only: `0` → score 0 label `""` percent 0; `< 15` → score 1 `"Too short"`; `15–19` → score 2 `"Fair"`; `20–29` → score 3 `"Good"`; `≥ 30` → score 4 `"Strong"`. Percent is `Math.round(Math.min(length, 32) / 32 * 100)`, so 40 chars is 100% (`lib/form-logic.ts:74-96`, `__tests__/form-logic.test.ts:46-77`).
- Below-minimum copy is `` `${strength.label} — use at least ${minLength} characters` `` (`password-input.tsx:131`).

**Read-rate**
- `readRate(12, 30)` → `{read: 12, of: 30, percent: 40}`; `readRate(1, 3).percent === 33`; `readRate(0, 0)` → all zeros; `readRate(50, 30)` → `{read: 30, of: 30, percent: 100}`; `readRate(-5, 30).read === 0` (`lib/bulletin.ts:19-23`, `__tests__/tier2-3.test.tsx:59-88`).

**Wizard**
- `done` beats everything; a `currentId` pointing at a done or blocked section falls through to the first actionable one; `label` is `` `${completed} of ${total} complete` ``; `index` is 1-based (`lib/wizard.ts:51-84`).
- A `blocked` step is never rendered as a button in either variant (`wizard.tsx:95, :139`).

**Notification bell**
- Negative and fractional counts are clamped by `Math.max(0, Math.floor(count))`; the badge is hidden entirely at 0; over `max` the display is `` `${max}+` `` while the accessible name still carries the true number (`notification-bell.tsx:21-26`).

**Notification item**
- `blocking` only takes effect on `kind === "questionnaire"` (`notification-item.tsx:87`).
- Meta falls back to `[timeAgo, source].filter(Boolean).join(" · ")`, and to `null` (nothing rendered) if both are absent (`:85-86`).

**Toast**
- `duration: undefined` → 5000; `Infinity` → persists; any other non-finite or negative value → 5000 (`toast.tsx:57-61`).
- `dismiss()` with no id clears **every** toast (`toast.tsx:50-53`).
- Errors are `role="alert"`; info/success/warning are `role="status"` (`:121`).

**Field**
- Error supersedes help — when `error` is truthy the help paragraph is not rendered (`field.tsx:63-71`).
- `helpId`/`errorId` are only derived when `htmlFor` is provided (`:43-44`).

**Switch (privacy)**
- `hardLocked` forces `isOn = false` and `isDisabled = true`; clicking fires nothing; the caps label becomes `"Always private"` with a lock glyph (`switch.tsx:51-52, :85-101`).

**File upload**
- Wrong image type → `"Upload a PNG, JPEG, WebP, or GIF image."`; wrong type on the file variant → `"That file type isn't allowed here."`; oversize → `"That file is larger than 8 MB."` / `"512 KB"` / `"500 B"` per `formatBytes` (`file-upload.tsx:134-144, :403-407`).
- The type check is skipped when `file.type` is empty (`if (accepts && file.type && !accepts.includes(file.type))`, `:135`) — a browser that reports no MIME type is allowed through to the server's own check.
- Filenames are sanitised to `[a-zA-Z0-9._-]` and truncated to 80 chars (`:172-174`).
- A batch larger than the remaining room is truncated, with `` `Only ${room} more file(s) fit here.` `` (`:149-155`).
- A duplicate pasted URL → `toast.info("That link is already added.")`; an unparseable one → `toast.error("That doesn't look like a valid URL.")` (`:117-132`).
- `blobConfigured === false` renders **no dropzone at all** — only the paste field and an explanation (`:280, :391-396`).

**Phone**
- `onChange` emits `""` for empty, never `undefined` (`phone-input.tsx:116`).
- `addInternationalOption={false}` removes the library's "International" pseudo-country from the picker (`:111`).
- **Known defect, recorded not fixed:** pasting `0821234567` over the whole field emits `"+0821234567"` (`__tests__/phone-input.test.tsx:80-94`).

**Dictation**
- Hard stop at 90,000 ms (`lib/use-dictation.ts:47`).
- Any `getUserMedia` failure — refusal, dismissal, no input device — produces the single sentence *"We couldn't use the microphone. You can type instead."* and returns to `idle` (`:102-110`).
- An empty recording → *"That recording was empty."*; a transcript with no speech → *"We couldn't hear any speech in that."* (`:137-151`).
- **If the component unmounts while the permission prompt is open, the tracks are stopped explicitly** — a 7-line comment explains that otherwise nothing would ever release them and *"the browser's recording indicator stays lit until the page is reloaded. A live microphone nobody asked for is the worst failure this hook has"* (`:112-121`).
- `supported` is `typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)` (`:61-64`).

**Report submission**
- The 201 body is **checked, not cast**: a response missing a string `url` or a numeric `number` throws a `ReportError` with code `"bad-response"` and the message *"It may have been filed, but we couldn't read the answer. Check the issues before sending it again."* — because *"a malformed 201 becomes '#undefined' and a dead link — which reads like the report went nowhere"* (`lib/report-client.ts:100-115`).
- `includeDiagnostics: false` sends `{ environment: [], errorLogs: [] }` rather than omitting the key (`:91-94`).
- Transcription filename extension is `mp4` when `audio.type.includes("mp4")`, else `webm` — *"the server passes the filename through so Whisper can identify the container"* (`:125-128`).

**Client-error buffer**
- Newest-last, trimmed by `while (buffer.length > REPORT_LOGS_MAX) buffer.shift()` — *"Drop the oldest rather than refusing the newest"* (`lib/client-errors.ts:57-60`).
- Source is clamped to 40 chars, message to 2,000, stack to 4,000, route to 300 (`:46-54`).
- **Only `window.location.pathname` is recorded — never the query string or hash** — *"those carry tokens, invite codes and search terms, and this value ends up in a public issue"* (`:51-55`).
- `console.error` is passed through **first and unconditionally**, and the capture body is wrapped in a `try/catch` that swallows — *"Capturing an error must never itself throw — that would turn a logged error into an uncaught one, inside the console.error handler"* (`:105-123`).
- `installClientErrorCapture()` is idempotent; a second call returns a no-op teardown rather than removing the first installation's handlers (`:84-86`).
- `collectEnvironment` clamps to 25 fields, labels to 60 chars, values to 500, and wraps `Intl.DateTimeFormat().resolvedOptions().timeZone` in a try/catch because *"Some locked-down browsers refuse this; a missing field is fine"* (`:178-193`).

**2FA**
- Setup key is grouped in 4s; the 6-digit field strips non-digits and slices to 6; submit is disabled until exactly 6 (`account-two-factor.tsx:53-55, :372-395`).
- Backup codes are shown **once**; the copy button only says "Copied" after an awaited successful `navigator.clipboard.writeText` (`:166-179`).
- `requiresPassword === false` (Google-only/passkey-only account) skips the password confirm entirely on enrol, disable and regenerate (`:301-321, :511-523, :568-580`).

**Sessions**
- `"Sign out everywhere else"` is disabled when `others === 0` (`account-sessions.tsx:106`).
- The current session row has no Revoke button at all (`:145`).

---

## 9. Dependency footprint

### Runtime deps declared by `packages/ui/package.json:22-49`
| Package | Version | Used by |
|---|---|---|
| `@quagga/core` | `workspace:*` | `lib/client-errors.ts`, `lib/report-client.ts`, `report-diagnostics.tsx`, `report-dialog.tsx`, `report-launcher.tsx`, `report-settings-card.tsx` |
| `@quagga/types` | `workspace:*` | `status-badge.tsx`, `role-badge.tsx`, `payment-details-block.tsx` |
| `@radix-ui/react-accordion` | `^1.2.18` | `accordion.tsx` |
| `@radix-ui/react-dialog` | `^1.1.15` | `dialog.tsx` |
| `@radix-ui/react-popover` | `^1.1.23` | `popover.tsx` |
| `@radix-ui/react-select` | `^2.2.6` | `select.tsx` |
| `@radix-ui/react-slot` | `~1.2.4` **(pinned — AGENTS.md:121-131 forbids bumping)** | `button.tsx` |
| `@radix-ui/react-tabs` | `^1.1.14` | `tabs.tsx` |
| `@radix-ui/react-toggle-group` | `^1.1.17` | `toggle-group.tsx` |
| `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit` | `^3.29.0` | `markdown-editor/` |
| `tiptap-markdown` | `^0.9.0` | `markdown-editor/extensions.ts` |
| `@vercel/blob` | `^2.4.0` | `file-upload.tsx` (`@vercel/blob/client`) |
| `class-variance-authority` | `^0.7.1` | button, badge, toggle-group |
| `clsx` + `tailwind-merge` | `^2.1.1` / `^3.6.0` | `lib/utils.ts` |
| `libphonenumber-js` | `^1.13.9` | transitive via `react-phone-number-input` |
| `lucide-react` | `^1.16.0` | ~30 components |
| `react`, `react-dom` | `^19.2.6` | everywhere |
| `react-phone-number-input` | `^3.4.17` | `phone-input.tsx` |
| `react-qr-code` | `^2.2.0` | `account-two-factor.tsx` **only** |

**Deps Camp 404 already has:** `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react`/`react-dom`, `@vercel/blob` (in `apps/web`).
**Deps Camp 404 must add to port the full set (9):** `@radix-ui/react-accordion`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle-group`, `react-qr-code`, `react-phone-number-input`, `libphonenumber-js`, and the four/five `@tiptap/*` + `tiptap-markdown`.
**Deps Camp 404 has that the donor doesn't (so a lifted donor file will not find them, and vice versa):** `@radix-ui/react-avatar|checkbox|label|slider|switch`, `cmdk`, `tw-animate-css`, Storybook 10 + `@tailwindcss/vite` + `vite`.

**Icon check:** the donor's `packages/ui` imports 49 distinct lucide icon names (`Bell` … `XIcon`); all 49 exist in Camp 404's installed `lucide-react@1.16.0` (donor lock-resolves 1.26.0). No icon-name breakage.

**Workspace couplings — exactly six, all of them small:**
1. `status-badge.tsx:2` — `import type { RegistrationStatus } from "@quagga/types"`
2. `role-badge.tsx:2` — `import type { RoleColor } from "@quagga/types"`
3. `payment-details-block.tsx:2` — `import type { PaymentStatus } from "@quagga/types"`
4. `lib/client-errors.ts:21-29` — six `REPORT_*` constants + `EnvField`, `ReportErrorLog` from `@quagga/core`
5. `lib/report-client.ts:10-14` — `ReportDiagnostics`, `ReportResponse`, `ReportType` from `@quagga/core`
6. `report-diagnostics.tsx:20` / `report-dialog.tsx:37` / `report-launcher.tsx:26` / `report-settings-card.tsx:14` — `REPORT_LOGS_MAX`, `REPORT_DESCRIPTION_MAX`, `ReportType`, `ReportDiagnostics`

To port the reporter, those constants and types must move into `@camp404/core` (which today has 8 modules and explicitly excludes I/O — the `REPORT_*` constants and their Zod schemas would fit its charter cleanly).

**Import-style subtlety.** Donor `packages/ui` cross-component imports are inconsistent: most use relative paths (`./badge`, `../lib/utils`), but **seven files use the self-referential specifier `@quagga/ui/components/…`**: `account-capability-notice.tsx:2-3`, `account-change-password.tsx:4-9`, `account-delete-elsewhere.tsx:2-9`, `account-security-events.tsx:1-8`, `account-sessions.tsx:5-7`, `account-shell.tsx:1`, `account-sign-in-methods.tsx:5-11`, `file-upload.tsx:13-16`. Camp 404's `packages/ui` has **zero** `@camp404/*` imports and uses relative paths throughout. Node/bundler self-reference via `name` + `exports` should make the sed'd form resolve, but it is a path Camp 404 has never exercised — **normalise to relative imports on port** rather than betting on it.

---

## 10. Test coverage

- **27 files, 5,888 lines, 272 `it()` cases.** Config at `packages/ui/vitest.config.ts`: jsdom, `globals: true`, `include: ["src/**/__tests__/**/*.test.{ts,tsx}"]`, `setupFiles: ["./vitest.setup.ts"]`.
- **Hard coverage ratchet:** `thresholds: { lines: 89, statements: 88, functions: 83, branches: 84 }`, with `include: ["src/**/*.{ts,tsx}"]` and `exclude: ["**/__tests__/**", "**/*.d.ts"]`. The comment is explicit that nothing else is excluded on purpose: *"Narrowing `include` to the files a test happens to reach would shrink the denominator rather than measure anything."* And: *"A ratchet, not a target. Raise it as coverage improves; never lower it to make a build pass — the drop is the signal."*
- **Timeouts are 30,000 ms with a 20-line incident note** (`vitest.config.ts`): run 30939995495 (4 Aug 2026) saw phone-input's typing case time out at the 5,000 ms default in the `ci` job while passing in its own coverage shard, because `turbo run test` runs eight workspaces at once. *"A limit inside that noise fails at random, and a gate that fails at random is a gate people learn to re-run rather than read."*
- **jsdom stubs** in `vitest.setup.ts`: `window.matchMedia`, `globalThis.ResizeObserver`, `Element.prototype.{scrollIntoView, hasPointerCapture, setPointerCapture, releasePointerCapture}`. **Camp 404 will need the same stubs** the moment it tests a Radix-based component that opens a portal — its `packages/ui/vitest.setup.ts` should be checked against this list.
- **Test-quality practices worth importing:**
  - *Exhaustive-map guards* for typed `Record<Union, T>` constants — assert the keyset matches, **and** that values are distinct (`role-badge.test.tsx:19-40`, `tier2-3.test.tsx:25-37`). TypeScript catches a missing key; it cannot catch two colours sharing a hex.
  - *Pure-function extraction so the interesting logic is testable without React* — `projectColumnsToCard`, `deriveWizardProgress`, `readRate`, `passwordStrength`, `wordCountStatus` all have their own describe blocks.
  - *Recording an upstream defect as a passing test rather than pretending it doesn't exist* — the `+0821234567` paste case is labelled `"MEASURED:"` and comments say it was *"raised as a finding rather than endorsed"* (`phone-input.test.tsx:80-94`).
  - *Testing that a surprising API is surprising on purpose* — the toggle-group context-wins case (`toggle-group.test.tsx:6-12`).
  - *Uninstalling a global patch before capturing the original* — `client-errors.test.ts:38-44` explains that failing to do so would leave the suite's own `console.error` wrapper installed for every later test.
- **Camp 404 has 22 `it()` cases in `packages/ui`**, no coverage provider installed anywhere in the repo, and no `thresholds` key in any of its 7 `vitest.config.ts` files — while `turbo.json`'s `test` task already declares `outputs: ["coverage/**"]` that nothing writes.

---

## 11. AfrikaBurn / multi-tenant coupling

**Structural verdict: this package is the least coupled subsystem in the donor.** A grep for `groupId|orgId|group_id|tenant|isOrg|orgSlug|supplierId|MembershipRole|OrgPermissions|ProjectPermissions` across all of `packages/ui/src` returns **zero hits**. There is no `edition_id`, no `groups` indirection, and no `org_roles` resolver anywhere in it.

Coupling that **does** exist, exhaustively:

**(A) Brand tokens (2 files, 4 call sites) — must retoken.**
- `quilt-band.tsx:53, :56, :60` — `var(--color-ab-teal)`, `var(--color-ab-apricot)`, `var(--color-ab-sage)`.
- `file-upload.tsx:236` — `bg-ab-charcoal/70 text-ab-warmwhite`.
These resolve against `styles/globals.css:41-49` (`--color-ab-teal … --color-ab-warmwhite`). Camp 404's `@theme` has none of them, so the classes compile to nothing silently.

**(B) Three-app / light-mode stylesheet blocks — delete, do not port.**
`styles/globals.css:93` `.light`, `:124` `.org-accent`, `:130` `.light.org-accent`, `:143` `.supplier-accent`, `:149` `.light.supplier-accent`. Applied at `apps/org/app/layout.tsx:40` and `apps/suppliers/app/layout.tsx:41`. Camp 404 is dark-only and single-app.

**(C) Hardcoded AfrikaBurn copy in prop defaults and body text (8 sites) — reword.**
- `account-shell.tsx:38` default `note`: *"One AfrikaBurn account, whichever door you come in by — participant, organiser or supplier."*
- `account-delete-elsewhere.tsx:53-58` — the whole card is about the three-app split; `linkLabel` defaults to `"Delete on the participant app"` (`:37`).
- `account-passkeys.tsx:141-143` — *"One passkey works across all of AfrikaBurn's apps."*
- `account-two-factor.tsx:184` — download header *"AfrikaBurn Contributors — two-factor backup codes"*; `:193` filename `"afrikaburn-backup-codes.txt"`.
- `report-settings-card.tsx:127` — *"filed as public issues on GitHub by the AfrikaBurn maintainer account"*.
- `payment-details-block.tsx:82-84` — *"We track — AfrikaBurn collects."*
- `notification-item.tsx:128` — the blocking chip reads `"Required · blocks registration"` (AfrikaBurn's camp-registration lifecycle, not Camp 404's).
- `wizard.tsx:88, :117` — `aria-label="Registration progress"`.

**(D) Donor-domain type unions (3 files) — re-express.**
`status-badge.tsx` (`RegistrationStatus`, 7 values), `role-badge.tsx` (`RoleColor`, 8 brand-ramp values), `payment-details-block.tsx` (`PaymentStatus`, 3 values). None of these three enums exist in Camp 404.

**(E) Donor-domain vocabulary in defaults (2 sites) — reword.**
`audience-select.tsx:52` `countNoun = "burners"`; `markdown-editor.tsx:140` `ariaLabel = "Bulletin body"`.

**(F) Base-layer stylesheet behaviours Camp 404 lacks and may want** — `globals.css:171-186` (the cursor-pointer restoration across `button` + seven Radix `[role=…]` selectors + `label[for]` + `summary`, with `:disabled`/`[aria-disabled]` → `not-allowed`) and `:196-204` (`h1,h2 { font-weight: 800; text-transform: uppercase }`, a Montserrat brand treatment Camp 404 should **not** take).

**Token compatibility is otherwise excellent.** Every semantic token the donor's CVA strings reference — `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `muted`, `muted-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `accent`, `accent-foreground`, `border`, `input`, `ring`, `destructive`, `destructive-foreground`, `success`, `success-foreground`, `warning`, `warning-foreground`, `--radius`, `--overlay`, `--font-sans`, `--font-mono` — exists in Camp 404's `@theme`. So `bg-primary text-primary-foreground`, `bg-success/20`, `border-input` all compile unchanged and simply re-skin. The only value drifts are `--radius` `0.5rem` (donor) vs `0.625rem` (target) and `--overlay` alpha `/0.55` vs `/0.5`.

**Missing tokens that would fail silently** (beyond the `ab-*` ramp): `--animate-accordion-down` / `--animate-accordion-up` and their two `@keyframes` (`globals.css:21-39`), required by `accordion.tsx:58`.
**Camp 404 tokens the donor never uses**, so a lifted component will not benefit from them: `--color-info` / `--color-info-foreground` and the entire named type scale `--text-brand-glyph … --text-mono-caption` (target `globals.css:53-54, :69-100`).

---

## 12. Verbatim excerpts — the five most valuable pieces

### 12.1 `projectColumnsToCard` — the pure half of the responsive table
`packages/ui/src/components/responsive-data-table.tsx:77-115`

```ts
/**
 * Partition a column set into its mobile-card slots. `mobileHidden` wins over
 * any role (a hidden column never appears in the card, whatever its role).
 * Declaration order is preserved within every slot.
 */
export function projectColumnsToCard<T>(
  columns: ResponsiveColumn<T>[],
): CardProjection<T> {
  const projection: CardProjection<T> = {
    title: [],
    badges: [],
    actions: [],
    pairs: [],
    hidden: [],
  };

  for (const column of columns) {
    if (column.mobileHidden) {
      projection.hidden.push(column);
      continue;
    }
    switch (column.role) {
      case "title":
        projection.title.push(column);
        break;
      case "badge":
        projection.badges.push(column);
        break;
      case "actions":
        projection.actions.push(column);
        break;
      default:
        projection.pairs.push(column);
        break;
    }
  }

  return projection;
}
```

### 12.2 `deriveWizardProgress` — the whole wizard state machine, 34 lines, zero React
`packages/ui/src/lib/wizard.ts:42-84`

```ts
/**
 * Derive per-section states and overall progress.
 *
 * Rules (precedence): a `done` section is always "done". Otherwise the resolved
 * current section is "current"; a `blocked` section is "blocked"; anything else
 * is "todo". When `currentId` is omitted (or points at a done/blocked section),
 * the current section is the first not-done, not-blocked section — so the
 * navigator always highlights the next actionable step.
 */
export function deriveWizardProgress(
  sections: WizardSectionInput[],
  currentId?: string,
): WizardProgress {
  const total = sections.length;
  const completed = sections.filter((s) => s.done).length;

  const isActionable = (s: WizardSectionInput) => !s.done && !s.blocked;
  const requested = currentId
    ? sections.find((s) => s.id === currentId)
    : undefined;
  const resolvedCurrent =
    requested && isActionable(requested)
      ? requested
      : sections.find(isActionable);
  const currentResolvedId = resolvedCurrent?.id ?? null;

  const derived: WizardSection[] = sections.map((s, i) => {
    let state: WizardSectionState;
    if (s.done) state = "done";
    else if (s.id === currentResolvedId) state = "current";
    else if (s.blocked) state = "blocked";
    else state = "todo";
    return { id: s.id, label: s.label, index: i + 1, state };
  });

  return {
    sections: derived,
    completed,
    total,
    label: `${completed} of ${total} complete`,
    currentId: currentResolvedId,
  };
}
```

### 12.3 The `SkeletonRegion` contract — one announcement per boundary, plus an E2E hook
`packages/ui/src/components/skeleton.tsx:5-21, :41-65`

```ts
/**
 * The shared skeleton kit behind every app-router `loading.tsx`.
 *
 * Why a kit and not one big `<PageSkeleton>`: a route boundary only stops the
 * navigation feeling broken if it shows the DESTINATION's shape. A generic grey
 * page is honest about "something is happening" and dishonest about what — and
 * when the real content lands the layout jumps, which reads as a second load.
 * So each route composes these primitives with the SAME container classes its
 * page uses, and the swap is a fill, not a reflow.
 *
 * Everything here is server-safe: no hooks, no state, no data. That matters —
 * the boundary has to stream before any of the slow work has finished.
 *
 * Accessibility: the pulse blocks are decorative (`aria-hidden`), and the
 * wrapper (`SkeletonRegion`) carries the single polite live region. One
 * announcement per boundary, not one per bar.
 */

/**
 * The wrapper every loading boundary should render once, at its root. It owns
 * the live region and the `data-loading` hook that lets the E2E suite assert a
 * boundary actually appeared — "we added a skeleton" is only true if a browser
 * can see it.
 */
export function SkeletonRegion({
  className,
  children,
  label = "Loading…",
  ...props
}: SkeletonProps & { label?: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      data-loading="true"
      className={className}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
```

### 12.4 The privacy Switch — hard-lock, in ten lines
`packages/ui/src/components/switch.tsx:15-19, :21-22, :51-52, :83-104`

```tsx
// The Bio hard-lock law (build-spec §Schema, @quagga/core `isHardLockedPrivate`):
// pass `hardLocked` for fields that can NEVER be public (phone, emergency
// contacts, id/passport, medical). It force-renders OFF, disables the control,
// and shows an "ALWAYS PRIVATE" caps label with a lock glyph — never toggleable.
// UI is not the security boundary; this only mirrors the server-enforced law.

const PRIVACY_CAPS =
  "text-[10px] font-semibold uppercase tracking-wide leading-none text-muted-foreground select-none";

    const isOn = hardLocked ? false : checked;
    const isDisabled = disabled || hardLocked;

    if (variant !== "privacy") return track;

    const caps = hardLocked
      ? "Always private"
      : isOn
        ? "On · Public"
        : "Off · Private";

    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <span className={PRIVACY_CAPS}>
          {hardLocked ? (
            <Lock
              className="mr-1 inline-block h-3 w-3 align-[-1px]"
              aria-hidden
            />
          ) : null}
          {caps}
        </span>
        {track}
      </span>
    );
```

### 12.5 The recent-error buffer — a public-issue-aware capture with three named safety rules
`packages/ui/src/lib/client-errors.ts:1-19, :40-61, :100-124`

```ts
// The recent-errors buffer the in-app reporter attaches to a report.
//
// A bug report that says "it broke" is nearly useless; the same report with the
// three console errors that preceded it is usually enough to find the fault
// without going back to the person. This is the thing that collects them.
//
// ## It is a buffer, not a log
//
// Nothing here is persisted or transmitted on its own. Entries live in memory,
// die with the tab, and leave the device only if somebody opens the reporter
// and submits — at which point they go through the redaction pass in
// `@quagga/core` `report-sanitize.ts` on the way to a PUBLIC GitHub issue.
//
// That destination is why the caps below are hard rather than advisory. An
// error message on this product routinely contains the payload that failed to
// render, and on these screens that payload is somebody's phone number,
// emergency contact or medical note. Truncating here means less of it exists to
// leak later, and it also means the server never rejects a report for being
// over the schema's limits.

function record(entry: {
  source: string;
  message: string;
  stack?: string;
}): void {
  const log: ReportErrorLog = {
    timestamp: Date.now(),
    source: clamp(entry.source, 40),
    message: clamp(entry.message, REPORT_LOG_MESSAGE_MAX),
  };
  if (entry.stack) log.stack = clamp(entry.stack, REPORT_LOG_STACK_MAX);
  // The path, never the query string or hash: those carry tokens, invite codes
  // and search terms, and this value ends up in a public issue.
  if (typeof window !== "undefined") {
    log.route = clamp(window.location.pathname, 300);
  }

  buffer.push(log);
  // Drop the oldest rather than refusing the newest — the errors immediately
  // before someone reaches for the reporter are the ones that matter.
  while (buffer.length > REPORT_LOGS_MAX) buffer.shift();
}

  // React reports render and hydration failures through console.error and
  // nowhere else, so without this the most diagnostic errors in a Next app
  // never reach a report.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Pass through FIRST and unconditionally. Whatever happens below, the
    // browser console must show what it would have shown.
    originalConsoleError.apply(console, args as never[]);
    try {
      const first = args[0];
      const described = describe(first);
      const rest = args
        .slice(1)
        .map((arg) => (typeof arg === "string" ? arg : describe(arg).message))
        .join(" ");
      record({
        source: "console.error",
        message: rest ? `${described.message} ${rest}` : described.message,
        ...(described.stack ? { stack: described.stack } : {}),
      });
    } catch {
      // Capturing an error must never itself throw — that would turn a logged
      // error into an uncaught one, inside the console.error handler.
    }
  };
```

---

## 13. Adjacent app-level assets (found by grepping beyond the listed paths)

These are not in `packages/ui` but are the *consumption pattern* for it, and they map directly onto Camp 404's WP7 (#131), which has no implementation at all.

- **34 `loading.tsx` files** across the three apps, every one composing the skeleton kit. Example (`apps/org/app/(console)/registrations/loading.tsx`, 15 lines) wraps `<ConsoleHeadingSkeleton/>` + `<ConsoleTableSkeleton rows={10} columns={5}/>` in a `<SkeletonRegion>`, with a docblock naming the destination's shape.
- **10 `error.tsx` / `global-error.tsx` files**, all delegating to two shared components:
  - `apps/web/components/boundary/error-recovery.tsx` (81 lines) — `ErrorRecoveryProps { error: Error & {digest?: string}; reset: () => void; title?; description?; frame?: "standalone" | "inline" }`. The `frame` prop exists because *"'inline' is for a boundary INSIDE `app/(app)/layout.tsx`: the header, nav and edition banner are already rendered, so a second full-screen frame would stack one chrome on top of another"* (`:23-30`). Shows `Ref {error.digest}` in mono caps when present; `console.error("[error-boundary]", error)` in an effect *"without ever showing a stack to the participant"*.
  - `apps/web/app/global-error.tsx` (77 lines) — **entirely inline-styled, zero imports**, because *"it must supply its own `<html>`/`<body>` (it replaces the root layout entirely). Kept dependency-light and inline-styled so it renders even if the design CSS or the font failed to load — the very failures that would trip this boundary."* Hardcodes `background: "#17191b"`, `color: "#f5f3ef"`, button `#e6633a`.
- **Per-app skeleton vocabularies:** `apps/org/components/console-skeleton.tsx` (76 lines), `apps/web/components/boundary/page-skeleton.tsx` (44), `apps/suppliers/components/route-skeleton.tsx` (48), `apps/web/components/boundary/not-found-view.tsx` (63). The console file explains the discipline: *"the heading placeholder here copies that component's container classes verbatim … When the real heading arrives it occupies exactly the box the skeleton held, so nothing below it moves."*

**Camp 404 has one `apps/web/app/error.tsx`, no `global-error.tsx`, and zero `loading.tsx`.** The donor's boundary pattern (a shared `ErrorRecovery` with a `frame` prop + a dependency-free `global-error` + per-area skeleton vocabularies) is the complete answer to WP7 and is essentially free to port.

---

## 14. Gotchas — things that will bite on a port

1. **`packages/ui` exports only `./styles.css`, `./components/*`, `./lib/utils`.** Six of the seven `lib/` modules are not publicly reachable. Any port of `form-logic`, `wizard`, `bulletin`, `client-errors`, `report-client` or `use-dictation` needs a new exports entry (Camp 404's mirror-image bug: `packages/ui/package.json:12` exports `"./hooks/*"` against a directory that does not exist).
2. **Seven donor UI files import themselves via `@quagga/ui/components/…`.** Camp 404's `packages/ui` has never exercised self-reference resolution. Normalise to relative imports.
3. **`checkbox` and `switch` are API collisions, not skin differences.** Donor `Checkbox` is a native input (`onChange`/`checked`); Camp 404's is Radix (`onCheckedChange`). Donor default-variant `Switch` *is* compatible with Camp 404's Radix one; the privacy variant is not.
4. **`empty-state` has an `action` prop Camp 404's does not.** Every donor call site passing `action=` silently loses its CTA if the target component is used unchanged.
5. **`CardTitle` is `text-lg` in the donor, `text-2xl` in Camp 404.** Lifted card layouts will look wrong until reconciled.
6. **`accordion.tsx` will animate to nothing** without `--animate-accordion-down` / `--animate-accordion-up` and their keyframes. `tw-animate-css` does not supply them.
7. **`quilt-band.tsx:53-60` and `file-upload.tsx:236` reference `--color-ab-*` tokens** that do not exist in Camp 404 — the upload's remove button would render invisibly.
8. **Donor components carry no `animate-in`/`zoom`/`slide` classes.** Camp 404 imports `tw-animate-css`, so a lifted donor dialog/select/popover will sit motionless next to Camp 404's animated overlays.
9. **`payment-details-block.tsx` is dead in the donor** — zero app consumers, kept only for hypothetical future logistics apps. Do not treat its existence as evidence of a shipped payments UI.
10. **The whole account-security suite is gated on one unverified question:** whether Neon Auth's client (pinned by Camp 404's root `pnpm.overrides` to `better-auth ~1.4.18`) satisfies the `AccountAuthClient` interface written against 1.6.25. Verify before scheduling any of it. **Low confidence — not resolvable from either repo's source.**
11. **`phone-input` carries a known, tested library defect** — pasting over the whole field emits `"+0821234567"`. Port the test with the component so it stays visible, and enforce the format server-side.
12. **Formatting drift.** Donor files are uniformly semicolon'd; several Camp 404 `packages/ui` files (`button.tsx`, `badge.tsx`, `switch.tsx`, `checkbox.tsx`, `dialog.tsx`, `popover.tsx`) are written without semicolons despite `.prettierrc.json` `"semi": true`. Any copy-paste visibly mixes styles until `pnpm format` runs.
13. **Camp 404's `packages/ui/package.json:24` declares a `@camp404/core` workspace dependency nothing under `src/` imports.** Porting the reporter would finally make that dependency real — so it is currently dead weight, not a mistake to remove.
14. **No `prefers-reduced-motion` anywhere in the donor either.** A grep across the donor's `packages/` + `apps/` returns zero hits. **The donor does not solve Camp 404's WP8 (#132) motion problem** — that work has no donor source.
15. **The donor has no Storybook.** Camp 404 keeps a `.stories.tsx` beside almost every component (40 of them); every ported donor component arrives without one and will break the target's own convention until a story is written.
16. **Donor `vitest.setup.ts` stubs `matchMedia`, `ResizeObserver` and four `Element.prototype` methods.** Camp 404's setup should be checked against that list before any Radix-portal component gets a test.
17. **Donor comments sometimes contradict their code elsewhere in the repo** (`docs/simplification-audit.md:44-50` records eight such findings). Inside `packages/ui` specifically I found no lying comment — every rationale I spot-checked matched the code beneath it — but the general warning stands for anything lifted from `packages/core` alongside it.

---

## 15. Notable patterns worth stealing even if the code is not

1. **Inject the server behaviour; declare its shape locally.** `AccountAuthClient` (`account-auth-client.ts:31-56`), `assess: (password) => PasswordAssessment` (`account-change-password.tsx:48`), `onRevoke/onRevokeOthers` (`account-sessions.tsx:57-58`), `resolvedCount` (`audience-select.tsx:31`). The stated principle: a shared package that reaches for one app's router, auth client or domain logic is shared *only until the next app*.
2. **Extract the interesting logic to a pure module and test it there.** Five of them: `projectColumnsToCard`, `deriveWizardProgress`, `readRate`, `passwordStrength`, `wordCountStatus`. Each has its own describe block that never renders React.
3. **Interactivity is opt-in, so the default stays server-safe.** `Wizard` without `onSelect` renders static markers; `PinnedBulletinBanner` without `onDismiss` renders no button and holds no state; `NotificationBell` and `NotificationItem` are hook-free by construction. The comments say so explicitly (`wizard.tsx:16-18`, `pinned-bulletin-banner.tsx:9-11`, `notification-bell.tsx:6-8`).
4. **Honest degradation is a rendered state, not a hidden control.** `blobConfigured={false}` shows the paste field plus a plain explanation; `filingEnabled={false}` replaces the buttons with a sentence; `dictationEnabled={false}` hides the mic and distinguishes "not configured" from "not supported"; `CapabilityVerdict.label === null` renders nothing at all. This is the donor's house rule — *"nothing in this product may claim something that isn't true"* — implemented at the component level.
5. **Tri-state feature detection.** `useState<boolean | null>(null)` set in a `useEffect`, with `null` meaning "not asked yet" and the UI saying nothing about support in that state (`account-passkeys.tsx:69-85`). The alternative — evaluating `typeof window` during render — produced a hydration mismatch *and* a wrong verdict for most visitors.
6. **Never claim success for an operation that may not have happened.** The clipboard fix (`account-two-factor.tsx:151-179`) — await the write, and on failure say so and leave the data on screen.
7. **Say what leaves the device before it leaves, and show the real payload.** `ReportDiagnosticsPanel` calls the actual `buildDiagnostics()` rather than describing it generically (`report-diagnostics.tsx:9-14`), and the launcher's pre-disclosure appears in the popover, before the dialog opens (`report-launcher.tsx:126-133`).
8. **Cap at the client where the destination is public.** Every truncation in `lib/client-errors.ts` is justified by the destination (a public GitHub issue), not by tidiness — and it also guarantees the server never refuses a report for being over-schema.
9. **Record a defect you cannot fix as a passing, labelled test.** `phone-input.test.tsx:80-94` (`"MEASURED:"`).
10. **Guard typed maps with keyset + distinctness assertions.** `role-badge.test.tsx:19-40`, `tier2-3.test.tsx:25-37`.
11. **Loading skeletons must copy their destination's container classes verbatim.** `skeleton.tsx:8-13`, demonstrated by `apps/org/components/console-skeleton.tsx:6-9`.
12. **A coverage ratchet with a written measurement and a "never lower it" rule**, plus an explicit refusal to shrink the denominator by narrowing `include` (`packages/ui/vitest.config.ts`).
13. **A timeout is set from measured contention, with the incident recorded in the config file.** 30,000 ms, run id and date included.
14. **Position a permanent floating control away from where pages put their primary action**, and make it `print:hidden` (`report-launcher.tsx:5-9, :88`).
15. **A `frame: "standalone" | "inline"` prop on a shared error panel**, because a boundary inside a persistent layout must not draw a second chrome (`apps/web/components/boundary/error-recovery.tsx:23-30`).
16. **A `global-error.tsx` with zero imports and inline styles**, because it fires exactly when the CSS may have failed to load.
