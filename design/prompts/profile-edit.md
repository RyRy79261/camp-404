# Pencil prompt — profile-edit

Reproduce `design/reference/12-profile-edit.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The member-facing profile editor: change your camp display name and avatar, then save — with a separate "Danger zone" card for permanently deleting your account. Centred on a circular avatar-upload control.

## Layout (top → bottom)

- Page header, flush-left, no card: bold `h1` "Edit profile"; below it a muted one-line subhead.
- **Profile card** (elevated, rounded ~10px, padded):
  - Large circular avatar uploader, centred. Empty state = dashed violet ring around a recessed circle, with a centred camera icon over the label "Add photo".
  - Magenta text button under the circle: "Upload a photo".
  - Field block: small label "Display name" above a full-width text input (shown pre-filled with `god@example.com`).
  - Footer row: ghost "Cancel" on the left, solid magenta "Save changes" button on the right.
- Spacer gap, then the **Danger zone card** (same surface):
  - `h2` "Danger zone" in the destructive red token.
  - Muted paragraph of warning copy.
  - Label "Confirmation" above an input with placeholder "DELETE".
  - Full-width destructive (red) "Delete my account" button.

## Copy & components

- Header: "Edit profile" / "Update your photo and how your name shows up around camp."
- Avatar (`AvatarUpload`): empty state icon + "Add photo"; text-button "Upload a photo" (becomes "Change photo" once set, "Uploading…" while busy). A small destructive circular X "remove" button sits top-right of the circle only when a photo is present.
- Field label "Display name"; submit row Button (ghost) "Cancel" + Button (default/magenta) "Save changes".
- Danger zone heading "Danger zone"; body: "This permanently erases your personal data and removes you from camp rosters. Your account becomes an anonymous "Lost Cat" stub so the family tree stays intact — it can't be undone. Type **DELETE** to confirm." (the word DELETE is bold). Label "Confirmation"; input placeholder "DELETE"; Button (destructive) "Delete my account".
- `@camp404/ui` components: `Card` / `CardContent`, `Button` (variants: default, ghost, destructive), `Input`, `Label`. Icons via lucide: `Camera`, `X`, `Loader2`.

## Tokens

- Page base `--color-background` = `oklch(0.15 0.05 295)` (hex `#0d061e`).
- Text `--color-foreground` = `oklch(0.97 0.02 330)` (hex `#f7ecf3`).
- Card surface `--color-card` = `oklch(0.26 0.08 295)` (one step lighter than page = elevated).
- Recessed avatar circle fill `--color-muted` = `oklch(0.22 0.06 295)`; icon/"Add photo" text `--color-muted-foreground` = `oklch(0.7 0.05 325)`.
- Dashed ring + input borders `--color-border` / `--color-input` = `oklch(0.35 0.1 305)`.
- Magenta primary (Save button, "Upload a photo" link) `--color-primary` = `oklch(0.65 0.27 340)` (hex magenta `rgba(255,0,140,0.92)`); text on it `--color-primary-foreground` = `oklch(0.99 0.005 340)`.
- Destructive red (Danger heading, X remove button, Delete button) `--color-destructive` = `oklch(0.65 0.22 18)`; text on it `--color-destructive-foreground` = `oklch(0.98 0 0)`.

## Do NOT

- Do not invent iOS/phone chrome — no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do not redesign the layout or relabel anything.
- Do not use a light theme. Dark midnight-violet only.

## Notes

- Two stacked cards, both on the same elevated card surface; the header sits outside/above the first card with no container of its own.
- The avatar uploader is the focal point: render the **empty** state from the reference (dashed ring + camera + "Add photo"), even though the input below shows a value. The dashed ring becomes solid once a photo is set (not shown here).
- "Upload a photo" is a plain magenta text button (underline on hover), not a filled button.
- The danger zone is intentionally alarming: red heading, red full-width Delete button. The destructive token (`oklch 0.65 0.22 18`) is an orange-red and is distinct from the magenta primary — keep them clearly different hues.
- Inputs are dark fills with a violet `--color-border`; the Confirmation field shows placeholder "DELETE" (muted), not a typed value.
- Mono is the brand's terminal accent but is NOT used here — body/sans throughout.
