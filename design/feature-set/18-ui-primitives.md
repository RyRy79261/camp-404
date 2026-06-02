# 18 — @camp404/ui component catalog

**Files covered:**
- `packages/ui/src/components/button.tsx` — `Button` + `buttonVariants` (CVA): the single button primitive, 6 variants × 5 sizes, `asChild` slot support.
- `packages/ui/src/components/input.tsx` — `Input`: thin styled wrapper over a native `<input>`, forwards all native input attrs.
- `packages/ui/src/components/textarea.tsx` — `Textarea`: thin styled wrapper over a native `<textarea>`, `min-h-[80px]`.
- `packages/ui/src/components/label.tsx` — `Label`: Radix `LabelPrimitive.Root` wrapper, `peer-disabled` styling.
- `packages/ui/src/components/checkbox.tsx` — `Checkbox`: Radix checkbox with a lucide `Check` indicator.
- `packages/ui/src/components/select.tsx` — Radix Select family (Root/Trigger/Content/Item/Label/Group/Value/Separator/ScrollUp/ScrollDown buttons).
- `packages/ui/src/components/slider.tsx` — `Slider`: Radix Slider, single- or multi-thumb (renders one thumb per value).
- `packages/ui/src/components/card.tsx` — `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` container family.
- `packages/ui/src/components/dialog.tsx` — Radix Dialog family (Root/Trigger/Portal/Close/Overlay/Content/Header/Footer/Title/Description), built-in close `XIcon`, optional `Close` button in footer.
- `packages/ui/src/components/popover.tsx` — Radix Popover (Root/Trigger/Content); positioned content, `w-72` default.
- `packages/ui/src/components/command.tsx` — cmdk command palette family (Command/Input/List/Empty/Group/Item/Shortcut/Separator) with lucide `Search` icon.
- `packages/ui/src/components/combobox.tsx` — `Combobox`: searchable single-select built by composing Popover + Command + Button; camp-custom (not a raw shadcn primitive).
- `packages/ui/src/components/avatar.tsx` — `Avatar`/`AvatarImage`/`AvatarFallback`: circular image with initials/icon fallback.
- `packages/ui/src/lib/utils.ts` — `cn()` class-merge helper (clsx + tailwind-merge); used by every component.
- `packages/ui/src/lib/__tests__/utils.test.ts` — unit tests pinning `cn()` behaviour.
- `packages/ui/src/styles/globals.css` — single OKLCH `@theme` token source these components reference (`var(--color-*)`, `--radius`); detailed in unit 28, only referenced tokens are noted here.
- `*.stories.tsx` (button/input/label/checkbox/select/slider/textarea/card) — Storybook docs; note: stories under-document a few real variants (see Sub-components/variants).

**Purpose:** This unit is the shared, restyleable primitive layer of Camp 404 — the shadcn-style (verbatim/"new-york") set every screen reuses for buttons, text inputs, labels, checkboxes, selects, sliders, cards, dialogs, popovers, command palettes, comboboxes, and avatars. It is purely presentational and stateless beyond local UI state (open/closed, single combobox `open`); it owns NO data, NO server calls, NO routing, and NO gating logic. All colour comes from the single global OKLCH `@theme` via `var(--color-*)` Tailwind utilities; `cn()` merges caller classes so any consumer can restyle without forking. There is NO barrel index — each component is imported by its own path (`@camp404/ui/components/<name>`). These are the building blocks; the camp-custom navigation (ControlPanel/ControlGrid/QuadrantNav) is unit 19 and tokens are unit 28.

## Features

### Button (button.tsx)
- Single `Button` component backed by a CVA factory `buttonVariants` (button.tsx:7-35), also exported standalone for use on non-button elements.
- `asChild` prop (default `false`): when true, renders via Radix `Slot` so the variant classes are applied to the child element instead of a `<button>` (button.tsx:40,44-45). Used e.g. to style links/triggers as buttons.
- Forwards ref to `HTMLButtonElement` and spreads all native button attributes (`type`, `onClick`, `disabled`, `aria-*`, etc.) (button.tsx:37-39,51).
- Base classes include icon handling: any nested `svg` is forced to `size-4`, `shrink-0`, `pointer-events-none` (button.tsx:8) — so icon buttons auto-size their lucide glyphs.
- Disabled styling baked into base: `disabled:pointer-events-none disabled:opacity-50` (button.tsx:8).
- Focus ring baked into base: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (button.tsx:8).

### Input (input.tsx)
- Thin styled `<input>`; passes `type` through and spreads all native input attributes (input.tsx:6-19).
- `placeholder:text-muted-foreground`, `disabled:cursor-not-allowed disabled:opacity-50`, file-input styling (`file:border-0 file:bg-transparent file:text-sm file:font-medium`) (input.tsx:12).
- `InputProps = React.InputHTMLAttributes<HTMLInputElement>` (no custom props) (input.tsx:4).

### Textarea (textarea.tsx)
- Thin styled `<textarea>` with `min-h-[80px]`, spreads all native textarea attributes (textarea.tsx:6-18).
- `TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>` (no custom props) (textarea.tsx:4).

### Label (label.tsx)
- Radix `LabelPrimitive.Root` wrapper; `text-sm font-medium leading-none` and `peer-disabled:cursor-not-allowed peer-disabled:opacity-70` so a label tied to a disabled `peer` control visually dims (label.tsx:8-10).
- `"use client"` (label.tsx:1).

### Checkbox (checkbox.tsx)
- Radix `CheckboxPrimitive.Root` with a lucide `Check` icon inside `CheckboxPrimitive.Indicator` (checkbox.tsx:5,21-25).
- `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground` toggles checked styling; `disabled:cursor-not-allowed disabled:opacity-50` (checkbox.tsx:16).
- Supports tristate (Radix `checked` may be `true | false | "indeterminate"`); no explicit indeterminate visual is added beyond the indicator showing only when checked.
- `"use client"` (checkbox.tsx:1).

### Select (select.tsx)
- Re-exports Radix Select parts as a styled family: `Select` (=Root), `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` (select.tsx:148-159).
- `SelectTrigger` shows a `ChevronDown` icon and clamps the value to one line (`[&>span]:line-clamp-1`) (select.tsx:18-30).
- `SelectContent` is portalled, `position="popper"` by default, `max-h-96 min-w-[8rem]`, with open/close enter/exit animation data-attrs and side-aware slide-in; popper mode adds directional translate offsets and sizes the viewport to the trigger width/height via `--radix-select-trigger-*` (select.tsx:69-98).
- `SelectItem` renders a left-anchored `Check` indicator for the selected item (`SelectPrimitive.ItemIndicator`) and focus styling `focus:bg-accent focus:text-accent-foreground`; disabled item styling `data-[disabled]:pointer-events-none data-[disabled]:opacity-50` (select.tsx:113-133).
- Scroll up/down buttons render `ChevronUp`/`ChevronDown` (select.tsx:34-67).
- `"use client"` (select.tsx:1).

### Slider (slider.tsx)
- Radix `SliderPrimitive.Root` rendered as a function component (NOT forwardRef) (slider.tsx:8-61).
- Defaults `min = 0`, `max = 100` (slider.tsx:12-13).
- Renders one `SliderPrimitive.Thumb` per value, derived from `value` ⊳ `defaultValue` ⊳ `[min, max]` via `_values` memo — so passing a 2-element default yields a range slider; passing none yields a 2-thumb `[min,max]` slider (slider.tsx:16-24,52-58).
- Supports horizontal and vertical orientation (`data-[orientation=vertical]` classes; vertical gets `min-h-44`) (slider.tsx:34,42,48).
- `data-[disabled]:opacity-50` on root; thumb has hover/focus ring growth (`hover:ring-4 focus-visible:ring-4`) (slider.tsx:34,56).
- `data-slot` attributes on root/track/range/thumb for styling hooks (slider.tsx:28,40,46,54).
- `"use client"` (slider.tsx:1).

### Card (card.tsx)
- Container family: `Card` (rounded-xl bordered surface, `bg-card text-card-foreground shadow-sm`), `CardHeader` (`flex flex-col space-y-1.5 p-6`), `CardTitle` (`<h3>`, `text-2xl font-semibold`), `CardDescription` (`<p>`, `text-sm text-muted-foreground`), `CardContent` (`p-6 pt-0`), `CardFooter` (`flex items-center p-6 pt-0`) (card.tsx:4-78).
- All are `forwardRef` div/h3/p wrappers spreading native HTML attributes; no behaviour, pure layout/typography.

### Dialog (dialog.tsx)
- Radix Dialog family as function components: `Dialog`(Root), `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` (dialog.tsx:147-158).
- `DialogContent` is centered (`top/left 50%`, translate −50%), `max-w-[calc(100%-2rem)] sm:max-w-lg` (matches the app's `max-w-lg` shell), portalled over a `DialogOverlay` (`bg-background/80`), with open/close zoom+fade animations (dialog.tsx:50-82).
- `DialogContent` renders a built-in top-right close affordance with a lucide `XIcon` + sr-only "Close" text, gated by `showCloseButton` prop (default `true`) (dialog.tsx:50-78).
- `DialogFooter` has its OWN `showCloseButton` prop (default `false`); when true it appends a `<Button variant="outline">Close</Button>` wrapped in `DialogPrimitive.Close asChild` (dialog.tsx:94-118).
- `DialogHeader`/`DialogFooter` are plain divs with `data-slot` attrs; header is centered on mobile, left-aligned `sm:`; footer is `flex-col-reverse` stacking on mobile, row + right-justified `sm:` (dialog.tsx:84-119).
- `"use client"` (dialog.tsx:1).

### Popover (popover.tsx)
- Radix Popover: `Popover`(=Root), `PopoverTrigger`(=Trigger, raw re-export), `PopoverContent` (styled, forwardRef) (popover.tsx:8-31).
- `PopoverContent` defaults `align = "center"`, `sideOffset = 4`, `w-72`, portalled, side-aware slide/zoom/fade animations, `origin-[--radix-popover-content-transform-origin]` (popover.tsx:12-28).
- `"use client"` (popover.tsx:1).

### Command (command.tsx)
- cmdk-based command palette family: `Command`(Root, `bg-popover`), `CommandInput` (with leading lucide `Search` icon in a bordered wrapper, `h-11`), `CommandList` (`max-h-[300px]` scroll), `CommandEmpty` (`py-6 text-center`), `CommandGroup` (styled `[cmdk-group-heading]`), `CommandItem` (`data-[selected=true]:bg-accent`, `data-[disabled=true]:opacity-50`, auto `size-4` svg), `CommandShortcut` (right-aligned `ml-auto` keyboard-hint span), `CommandSeparator` (command.tsx:9-138).
- `"use client"` (command.tsx:1).

### Combobox (combobox.tsx) — camp-custom composite
- Searchable single-select dropdown composing `Popover` + `Command` + `Button` (variant `outline`, role `combobox`) (combobox.tsx:41-114). Doc-comment notes it was copied verbatim from `RyRy79261/intake-tracker` and is the right primitive for long lookup sets (e.g. country picker) where a plain `Select` would force scrolling hundreds of options (combobox.tsx:34-40).
- Controlled: takes `value: string | undefined`, `onChange: (value: string) => void`, `options: ReadonlyArray<ComboboxOption>` where each option is `{ value, label }` (combobox.tsx:17-32).
- Local `open` state (combobox.tsx:52); selecting an item calls `onChange(o.value)` then closes the popover (combobox.tsx:92-95).
- Trigger button shows the selected option's `label`, or `placeholder` (muted text) when nothing is selected; trailing `ChevronsUpDown` icon (combobox.tsx:57-75).
- Selected row shows a leading lucide `Check` in a fixed-width slot so text doesn't shift; conditional render (not opacity toggle) deliberately avoids a Tailwind-v4 shared-package class-scanner quirk (combobox.tsx:97-103).
- Popover content width matches the trigger via `w-[var(--radix-popover-trigger-width)]` (combobox.tsx:78-79).
- `CommandItem` filters by `value={o.label}` (search matches the label text, not the stored value) (combobox.tsx:91).
- `"use client"` (combobox.tsx:1).

### Avatar (avatar.tsx)
- `Avatar` (Radix `AvatarPrimitive.Root`): circular `h-10 w-10` (default) clipped overflow (avatar.tsx:12-24).
- `AvatarImage`: `object-cover aspect-square`; Radix auto-hides it on load error and shows fallback (avatar.tsx:27-37).
- `AvatarFallback`: centered initials/icon on `var(--color-secondary)` / `var(--color-secondary-foreground)`, `font-semibold` — the ONLY component that references the secondary palette directly via `var(--color-*)` in TSX rather than a Tailwind token class (avatar.tsx:39-51).
- Doc-comment: standard shadcn "new-york" avatar, used by the profile page, the profile editor, and the home header (avatar.tsx:7-11).
- `"use client"` (avatar.tsx:1).

### cn() class merge (lib/utils.ts)
- `cn(...inputs: ClassValue[])` = `twMerge(clsx(inputs))` (utils.ts). Every component merges caller `className` through it so restyling overrides win the Tailwind conflict (later class beats earlier).

## User actions & interactions
These primitives expose interactions through native/Radix/cmdk behaviour; this unit adds no bespoke gestures beyond the Combobox composite.
- **Button:** click/keyboard activate; `disabled` blocks pointer events. When `asChild`, the wrapped element receives the activation (e.g. a link).
- **Input / Textarea:** type, focus, blur, paste, file-pick (input file styling); fully native. No debounce, no masking in this unit.
- **Label:** clicking focuses its associated control via `htmlFor` (native label behaviour); dims when its `peer` control is disabled.
- **Checkbox:** click/Space toggles checked ⇄ unchecked (Radix); supports `defaultChecked`/controlled `checked` + `onCheckedChange` from caller.
- **Select:** open trigger (click/Enter/Space), arrow-key navigate items, type-ahead, select item (closes), scroll via up/down buttons; selected item shows a `Check`.
- **Slider:** drag thumb, arrow-key step (`step` supplied by caller; stories use `step={1}` and `step={5}`), each thumb independently movable for ranges; `disabled` dims and blocks.
- **Dialog:** open via `DialogTrigger`; close via top-right `XIcon` (when `showCloseButton`), optional footer "Close" button, Escape, or overlay click (Radix defaults); focus is trapped while open.
- **Popover:** open via `PopoverTrigger`; close on outside-click/Escape (Radix); side/align configurable.
- **Command:** type to filter, arrow-key navigate, Enter to select an item, `CommandEmpty` shows when no matches.
- **Combobox:** click trigger to open popover → type to filter → click/Enter an item to select (fires `onChange(value)` and closes); selecting persists the option's `value`, displays its `label`.
- **Avatar:** no interaction; image load failure swaps to fallback automatically.

## States & presentations
This unit only realizes the **always-needed** global-states rows; the **gating** rows (invite-gated / onboarding-incomplete / pending-approval / rejected / captain-only-locked) are enforced by routing and the ControlPanel layer (units 19 / gating spine), NOT by these primitives. They are listed below only to mark them out of scope here.

- **Empty:** `CommandEmpty` (`emptyMessage`, default via Command consumers); Combobox `emptyMessage` default `"Nothing found."` (combobox.tsx:47); `SelectValue placeholder`; Input/Textarea `placeholder`; Combobox trigger shows muted `placeholder` (default `"Select…"`, combobox.tsx:45) when unselected; Avatar shows `AvatarFallback` (initials) when no image.
- **Loading:** Avatar shows `AvatarFallback` while the image is still loading (Radix loading-status behaviour); no spinner primitive exists in this unit.
- **Populated:** Select/Combobox show selected `label` + `Check` mark; inputs show their value; cards/avatars render content.
- **Validation-error:** NO built-in error variant on Input/Textarea/Select/Checkbox/Slider/Combobox — error styling/messaging is the consumer's responsibility (e.g. the questionnaire `_form`/`_root` banner). These primitives expose only the focus ring and disabled states; callers add error classes through `className`.
- **Submitting/pending:** no built-in busy/spinner state; Button has no `loading` prop — callers pass `disabled` and swap children. (Confirmed: no `isLoading`/`pending` prop anywhere in these files.)
- **Success:** no success variant; expressed by consumers.
- **Disabled:** universal — Button (`disabled:pointer-events-none disabled:opacity-50`), Input/Textarea/Select/Checkbox (`disabled:cursor-not-allowed disabled:opacity-50`), Slider (`data-[disabled]:opacity-50`), Combobox (`disabled` prop forwarded to its trigger Button), Command items (`data-[disabled=true]`), Select items (`data-[disabled]`). Label dims via `peer-disabled`.
- **Open/closed (UI-local):** Select/Dialog/Popover/Combobox use Radix `data-[state=open|closed]` with zoom/fade/slide animations; Combobox tracks its own `open` React state.
- **Gating rows (OUT OF SCOPE for this unit):** invite-gated, onboarding-incomplete, pending-approval, rejected (terminal), captain-only-locked — none are implemented in `packages/ui/src/components`; they are enforced upstream (app/page.tsx gating spine, ControlPanel locked layers). NO offline/sync states and NO budget/over-target states exist anywhere.

## Enums, options & configurable values

### Button variants (`buttonVariants`, button.tsx:11-28) — 6 variants
- `default` — `bg-primary text-primary-foreground hover:bg-primary/90`
- `destructive` — `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- `outline` — `border border-input bg-background hover:bg-accent hover:text-accent-foreground`
- `secondary` — `bg-secondary text-secondary-foreground hover:bg-secondary/80`
- `ghost` — `hover:bg-accent hover:text-accent-foreground`
- `link` — `text-primary underline-offset-4 hover:underline`
- Default variant: `default` (button.tsx:31).

### Button sizes (button.tsx:22-28) — 5 sizes
- `default` — `h-10 px-4 py-2`
- `sm` — `h-9 rounded-md px-3`
- `lg` — `h-11 rounded-md px-8`
- `icon` — `h-10 w-10`
- `icon-lg` — `h-14 w-14`
- Default size: `default` (button.tsx:32).

> Note: the shared-vocabulary brief lists button variants as `default/outline/ghost/destructive/secondary` and sizes `default/sm/lg/icon` — the code ADDS a 6th variant `link` and a 5th size `icon-lg` beyond the brief. `link` IS used in the app (`apps/web/app/signup/required/invite-gate-form.tsx:63`). `icon-lg` is defined but has NO consumer found in `apps/web/**/*.tsx` (see Sub-components/variants → dead/orphaned).

### Slider configurable values (slider.tsx)
- `min` default `0`, `max` default `100` (slider.tsx:12-13). `step` is caller-supplied (not defaulted here; Radix default 1). Thumb count = number of values in `value`/`defaultValue`, else 2 (`[min,max]`).

### Combobox props/defaults (combobox.tsx:41-51)
- `placeholder` default `"Select…"`; `searchPlaceholder` default `"Search…"`; `emptyMessage` default `"Nothing found."`.
- `ComboboxOption` = `{ value: string; label: string }` (combobox.tsx:17-20).

### Dialog flags (dialog.tsx)
- `DialogContent.showCloseButton` default `true` (dialog.tsx:53). `DialogFooter.showCloseButton` default `false` (dialog.tsx:96).

### Popover defaults (popover.tsx:15)
- `align` default `"center"`; `sideOffset` default `4`; width `w-72`.

### Select defaults (select.tsx:72)
- `SelectContent.position` default `"popper"`; `max-h-96`; `min-w-[8rem]`.

### Tokens referenced (from the single OKLCH `@theme`, globals.css; full set is unit 28)
Used by these primitives via `var(--color-*)`/Tailwind token classes (NOT redefined here):
- `--color-primary: oklch(0.65 0.27 340)`, `--color-primary-foreground: oklch(0.99 0.005 340)`
- `--color-accent: oklch(0.62 0.18 255)`, `--color-accent-foreground: oklch(0.99 0.005 255)`
- `--color-secondary: oklch(0.42 0.18 320)`, `--color-secondary-foreground: oklch(0.98 0.01 330)`
- `--color-destructive: oklch(0.65 0.22 18)`, `--color-destructive-foreground: oklch(0.98 0 0)`
- `--color-background: oklch(0.15 0.05 295)`, `--color-foreground: oklch(0.97 0.02 330)`
- `--color-card: oklch(0.26 0.08 295)` / `--color-card-foreground`; `--color-popover: oklch(0.26 0.08 295)` / `--color-popover-foreground`
- `--color-muted: oklch(0.22 0.06 295)`, `--color-muted-foreground: oklch(0.7 0.05 325)`
- `--color-border` / `--color-input: oklch(0.35 0.1 305)`; `--color-ring: oklch(0.65 0.27 340)`
- `--radius: 0.625rem` (drives `rounded-md`/`rounded-lg`/`rounded-xl` scale).

### lucide-react icons embedded in primitives
`Check` (checkbox, select item, combobox), `ChevronDown`/`ChevronUp` (select trigger + scroll buttons), `ChevronsUpDown` (combobox trigger), `Search` (command input), `XIcon` (dialog close). (`lucide-react ^1.16.0`.)

## Data model touched
None. This unit touches **no database tables and no schema fields** — it is pure presentation. The only TypeScript shape it defines is the UI-local `ComboboxOption` interface:
- `ComboboxOption { value: string; label: string }` (combobox.tsx:17-20).

Consumers map domain data into these props; e.g. the questionnaire `combobox` field passes `question.options` (already `{value,label}`) and persists the chosen `value` string (`apps/web/components/questionnaire/question.tsx:221-231`). Avatars are fed a `src` URL + initials string by `profile/page.tsx` and `home-header.tsx` (no schema knowledge in this unit). All actual entity tables/fields belong to unit 29.

## Validation, edge cases & business rules
- **No validation lives here.** None of these primitives validate input, enforce required fields, or constrain values; validation is the consumer's job (questionnaire field machine, server actions). Inputs accept any native attributes the caller passes (`required`, `pattern`, `min`, `max`, `maxLength`) but the component adds none by default.
- **`cn()` conflict resolution (utils.test.ts):** later Tailwind utility wins (`cn("px-2","px-4") === "px-4"`); falsy entries dropped (`false`/`null`/`undefined`/`""`); nested arrays/objects flattened (clsx semantics). This is the contract that lets any caller override a primitive's classes.
- **Slider thumb derivation:** if neither `value` nor `defaultValue` is an array, the slider falls back to `[min, max]` → renders TWO thumbs (a full-range slider), not zero/one. A single-value slider REQUIRES the caller to pass `value`/`defaultValue` as a 1-element array (slider.tsx:16-24). Edge case to preserve on restyle.
- **Combobox search key:** `CommandItem value={o.label}` means fuzzy search matches the visible label, not the stored `value` (combobox.tsx:91). Selecting fires `onChange(o.value)` and closes (combobox.tsx:92-95). Trigger renders muted placeholder when `value` is unset or not found in `options` (combobox.tsx:53,66-73).
- **Avatar fallback:** Radix swaps to `AvatarFallback` automatically on image load error or while loading; consumers must supply fallback content (initials) — there is no default glyph in the primitive (avatar.tsx:39-51).
- **Dialog double-close affordance:** `DialogContent` close (X) and `DialogFooter` close button are independent flags; both default-states differ (`true` vs `false`). A restyle must keep at least one escape affordance plus Radix Escape/overlay-click so "every gate has an exit" holds.
- **Checkbox tristate:** Radix `checked` may be `"indeterminate"`; the indicator only renders the `Check` glyph (no dash) — indeterminate has no distinct visual here.
- **Select content sizing:** in `popper` position the viewport is sized to the trigger via `--radix-select-trigger-width/height`; Combobox popover uses `--radix-popover-trigger-width`. Preserve these so dropdowns track trigger width.
- **No barrel export:** components are imported per-path (`@camp404/ui/components/<name>`, plus `@camp404/ui/lib/utils`); package `exports` map (package.json) has no aggregate index. Adding/renaming a file changes its public import path.
- **`var(--color-*)` only rule:** colours come exclusively from the single `@theme`; `AvatarFallback` is the one place a raw `bg-[color:var(--color-secondary)]` is inlined. Entities are disambiguated by ICON + LABEL, never colour — restyle must not introduce per-entity hue tables.

## Sub-components / variants
- **Button:** exported `Button` + `buttonVariants` (CVA factory). Variants `default | destructive | outline | secondary | ghost | link`; sizes `default | sm | lg | icon | icon-lg`. `asChild` slot mode.
  - **DEAD/ORPHANED:** size `icon-lg` (`h-14 w-14`) is defined (button.tsx:27) but has **no consumer** in `apps/web/**/*.tsx` (grep found none) and is omitted from `button.stories.tsx` (not in the `Sizes` story or `size` argTypes). Defined-but-unused — reserved for a future feature (e.g. the push-to-talk / large icon button) but currently unused.
  - **UNDER-DOCUMENTED:** `button.stories.tsx` argTypes omit `link` from variants and `icon-lg` from sizes, and the `Sizes` story shows only sm/default/lg — yet both `link` and `icon-lg` exist in code (and `link` is used in `invite-gate-form.tsx:63`).
- **Input / Textarea / Label:** single component each, no variants. `labelVariants` is a CVA with only a base string (no variant axes) — effectively a no-op CVA (label.tsx:8-10).
- **Checkbox:** single component; checked/unchecked/(indeterminate) via Radix data-state.
- **Select family (10 exports):** `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` (select.tsx:148-159).
- **Slider:** single function component (note: NOT forwardRef, unlike most others — passing a `ref` won't attach to the DOM root).
- **Card family (6 exports):** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- **Dialog family (10 exports):** `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`. Two `showCloseButton` flags (Content default true, Footer default false).
- **Popover family (3 exports):** `Popover`, `PopoverTrigger` (raw Radix re-export), `PopoverContent` (styled).
- **Command family (8 exports):** `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator`. `CommandShortcut` (keyboard-hint right-aligned span) has no found consumer in `apps/web` — likely orphaned but harmless (provided for completeness of the cmdk family).
- **Combobox:** single composite (`Combobox` + exported `ComboboxOption` type). Camp-custom (composes Popover+Command+Button), not a verbatim shadcn primitive; provenance noted as copied from `RyRy79261/intake-tracker`.
- **Avatar family (3 exports):** `Avatar`, `AvatarImage`, `AvatarFallback`.
- **OUT OF SCOPE (unit 19, present in the same folder):** `control-grid.tsx`, `control-panel.tsx`, `quadrant-nav.tsx` (+ their `.stories.tsx`) — the camp-custom 2×2 quadrant nav / push-to-talk layer; intentionally NOT documented here.
