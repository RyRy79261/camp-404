### 24. Shared UI primitive kit
**Purpose:** The restyleable, presentational shadcn-style ("new-york") primitive layer every Camp 404 screen reuses — buttons, inputs, labels, checkboxes, selects, sliders, cards, dialogs, popovers, command palettes, comboboxes, and avatars — owning no data, server calls, routing, or gating.
**Layout & elements:** Mobile single column. Button; Input (native, with file-pick styling); Textarea (`min-h-[80px]`); Label (dims with disabled peer); Checkbox (lucide `Check`); Select family (trigger with `ChevronDown`, portalled content, item `Check`, scroll up/down `ChevronUp`/`ChevronDown`); Slider (1+ thumbs, horizontal/vertical); Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter; Dialog (centered, top-right `XIcon` + sr-only "Close", optional footer "Close" button, overlay); Popover (`w-72`); Command palette (leading `Search`, list, empty, group, item, shortcut, separator); Combobox (outline trigger with selected `label` or muted placeholder + `ChevronsUpDown`, search field, `Check` row); Avatar / AvatarImage / AvatarFallback (initials).
**Every action (preserve all):**
- Button click/keyboard activate → fires action; `disabled` blocks pointer events; `asChild` routes activation to wrapped element (e.g. link).
- Input/Textarea type/focus/blur/paste/file-pick → native; no debounce/masking.
- Label click → focuses associated control via `htmlFor`.
- Checkbox click/Space → toggles checked⇄unchecked (tristate `"indeterminate"` supported, no distinct visual).
- Select open (click/Enter/Space) → arrow-navigate, type-ahead, select (closes, shows `Check`), scroll buttons.
- Slider drag/arrow-step (caller `step`) → each thumb independently movable; `disabled` dims/blocks.
- Dialog open via trigger → close via X (if `showCloseButton`), footer "Close", Escape, or overlay click; focus trapped.
- Popover/Command/Combobox open → outside-click/Escape closes; Combobox type-filter then select fires `onChange(value)`, shows `label`, closes.
- Avatar image load failure → auto-swaps to fallback.
**States to design:**
- Empty → Combobox placeholder "Select…" / `emptyMessage` "Nothing found."; Command empty; Select/Input/Textarea placeholders; Avatar fallback initials.
- Loading → Avatar fallback while image loads; no spinner primitive exists.
- Populated → selected `label` + `Check`; inputs show value; cards/avatars render.
- Validation-error → NO built-in error variant; consumer adds error classes via `className`.
- Submitting → NO `loading`/`pending`/`isLoading` prop; caller passes `disabled` and swaps children.
- Success → none; consumer-expressed.
- Disabled → universal: opacity-50 + blocked pointer/cursor across all; Label dims via `peer-disabled`.
- Open/closed → Radix `data-[state=open|closed]` zoom/fade/slide; Combobox tracks own `open`.
- Gating (invite-gated / onboarding-incomplete / pending-approval / rejected / captain-only-locked) → OUT OF SCOPE; enforced upstream by routing/ControlPanel, not here.
**Options & exact values:** Button variants `default | destructive | outline | secondary | ghost | link` (default `default`); sizes `default | sm | lg | icon | icon-lg` (default `default`). Slider `min=0`, `max=100`, caller `step`, thumbs = value count else 2. Combobox defaults `placeholder="Select…"`, `searchPlaceholder="Search…"`, `emptyMessage="Nothing found."`; `ComboboxOption {value,label}`. Dialog `DialogContent.showCloseButton=true`, `DialogFooter.showCloseButton=false`. Popover `align="center"`, `sideOffset=4`, `w-72`. Select `position="popper"`, `max-h-96`, `min-w-[8rem]`. Icons: `Check`, `ChevronDown`/`ChevronUp`, `ChevronsUpDown`, `Search`, `XIcon`.
**Validation & rules:**
- No validation lives here; primitives constrain nothing — consumers own required/pattern/min/max/messaging.
- `cn()` merge: later Tailwind utility wins (`px-2`+`px-4`→`px-4`); falsy dropped; arrays/objects flattened — lets callers override classes.
- Slider: non-array value/defaultValue falls back to `[min,max]` → TWO thumbs; single-value REQUIRES a 1-element array.
- Combobox search matches visible `label`, persists `value`; muted placeholder when value unset/not in options.
- Avatar: consumer must supply fallback initials; no default glyph.
- Dialog: keep at least one exit (X, footer Close, Escape, or overlay) so "every gate has an exit".
- Colour from single OKLCH `@theme` `var(--color-*)` only; entities disambiguated by ICON + LABEL, never per-entity hue. No barrel index — import per path `@camp404/ui/components/<name>`.
**Do-not-drop:** A purely presentational, fully restyleable primitive set where any caller overrides classes via `cn()` and dropdowns track trigger width — losing this breaks every screen's reuse and theming. DEAD/ORPHANED: Button size `icon-lg` (`h-14 w-14`) defined but has no consumer; `CommandShortcut` also unused — preserve both.
