# Pencil prompt — onboarding-questionnaire

Reproduce `design/reference/05-onboarding-step1.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The first step of the "Build your burner profile" onboarding wizard — a multi-step questionnaire (12 steps) where a new camp member answers a few questions so the camp knows who's arriving. This frame represents the generic wizard step shell: a fixed header, a progress bar, the current question's title/label/control, and a footer with a Back-or-Sign-out escape on the left and a Next/Skip/Finish primary on the right. The captured step is the optional **profile-photo** step (an `image` question), so the body is a dashed-circle avatar uploader. Steps 2 and 3 in the reference (`06-`, `07-`) show this same step; the floating "Issues / Route / Bundler" panel and red "1 Issue" pill in those shots are a Next.js/Vercel dev-tools overlay — NOT part of the screen; ignore them.

## Layout (top → bottom)

- **Header** (left-aligned): bold `h1` "Build your burner profile"; below it, muted subtext "A few questions so the camp knows who's arriving in the dust. Takes about two minutes."
- **Progress bar**: thin (1.5px) full-width rounded track on a muted surface, filled magenta from the left at ~8% (step 1 of 12). Directly under it, small muted caption "Step 1 of 12".
- **Question block**: semibold `h2` "Add a profile photo"; muted subtitle "Optional — helps the camp put a face to your name. You can skip and add it later from your profile."
- **Field**: a `Label` "Profile photo" (white) with a smaller muted helper line "A clear photo of your face works best."
- **Avatar uploader** (centred, large vertical gap above it): a large (~160px) circle with a 2px **dashed** violet border on the muted surface; inside, a centred camera (outline) icon over the small label "Add photo". Beneath the circle, a magenta text button "Upload a photo".
- **Footer** (pinned to bottom, space-between): ghost text button "Sign out" on the left; solid magenta primary button "Skip" on the right.

## Copy & components

Exact strings (from source): heading "Build your burner profile"; subtext "A few questions so the camp knows who's arriving in the dust. Takes about two minutes."; "Step 1 of 12"; question title "Add a profile photo"; subtitle "Optional — helps the camp put a face to your name. You can skip and add it later from your profile."; label "Profile photo"; helper "A clear photo of your face works best."; circle label "Add photo"; link "Upload a photo"; footer "Sign out" and "Skip".

Components: `@camp404/ui` **Button** (footer "Sign out" = `variant="ghost"`, "Skip" = default/primary; the bottom-right label is "Skip" when an optional lone field is empty, otherwise "Next", or "Finish" on the last step). **Label** for the field caption. The avatar control is the app's `AvatarUpload` (custom dashed-circle button, not a UI primitive). The progress bar is a custom `ProgressBar` (muted track + primary fill). Other steps swap the field for UI **Input**, **Select**, **Combobox**, **Checkbox**, **Slider**, **Textarea**, or a segmented toggle — but reproduce the photo step shown.

## Tokens

Use only what this screen needs; reference as `var(--color-*)`, never invent hex.

- `--color-background` `oklch(0.15 0.05 295)` — page base (hex mirror `#0d061e`)
- `--color-foreground` `oklch(0.97 0.02 330)` — heading, label, "Add photo" (hex mirror `#f7ecf3`)
- `--color-muted-foreground` `oklch(0.7 0.05 325)` — subtext, subtitle, helper, "Step 1 of 12"
- `--color-muted` `oklch(0.22 0.06 295)` — progress track + dashed-circle fill surface
- `--color-primary` `oklch(0.65 0.27 340)` — progress fill, "Upload a photo" link, "Skip" button (hot magenta, hex mirror `rgba(255,0,140,0.92)`)
- `--color-primary-foreground` `oklch(0.99 0.005 340)` — text on the Skip button
- `--color-border` `oklch(0.35 0.1 305)` — dashed circle border
- `--radius` `0.625rem` (10px) — button corners

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do not redesign the layout or restyle components.
- Do not use a light theme — dark, midnight-violet base only.
- Do not reproduce the floating "Issues/Route/Bundler" panel or red "1 Issue" pill from steps 2/3 — that is dev-tooling, not the app.

## Notes

- Dark midnight-violet base with hot-magenta as the single accent (progress fill, link, primary CTA); electric-blue does NOT appear on this step.
- The avatar circle is empty/placeholder state: dashed border, camera icon, "Add photo". The border turns solid and the X-remove badge appears once a photo is set — show the empty state.
- The primary CTA reads "Skip" (not "Next") here specifically because the photo question is an optional, lone, unanswered field; the left side is "Sign out" (not "Back") only on this first step.
- Large empty vertical space between the field helper and the centred uploader is intentional — the circle sits low, around the lower-middle of the viewport, with the footer pinned to the bottom edge.
- Type tokens are unspecified in the design system; use a neutral geometric sans for all text on this screen (no monospace — the terminal motif is landing-only).
