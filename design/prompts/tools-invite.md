# Pencil prompt — tools-invite

Reproduce `design/reference/10-tools-invite.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The invite-creation tool: a signed-in camp member mints a single-use code that lets one person sign up for Camp 404. It collects an optional recipient email, an optional note, and a generated/editable invite code with live availability checking.

## Layout (top → bottom)

- A ghost back-link at top left: a small left chevron + the word `Tools`.
- One large elevated rounded card filling the column, holding the whole form:
  - Bold heading **Invite a member**.
  - A muted multi-line description paragraph below it.
  - Field group: label **Their email address** above a single-line input showing placeholder text `sara@example.com`.
  - Field group: label **Why you're inviting them (optional)** above a taller multi-row textarea showing placeholder `Kitchen lead from last burn; great with sourdough.`.
  - A bordered, slightly-recessed muted info box (no label) with the captain-approval helper text.
  - Field group: label **Invite code** above a row — a wide monospace input holding a generated code (e.g. `crinkly-cabbage-weasel`) and, to its right, a small square outline icon button with a shuffle icon.
  - Below the code input, a small green availability hint: a check icon then `crinkly-cabbage-weasel is available.` (the code in monospace).
  - A full-width solid magenta primary button: **Create invite**.

## Copy & components

- Heading: `Invite a member` (CardTitle). Description (CardDescription): "Mint a single-use code that lets one person sign up for Camp 404. A captain will review and approve them before they get access. Codes are recorded against your account so the family tree picks up who you brought on."
- Labels: `Their email address`, `Why you're inviting them (optional)`, `Invite code`.
- Info box: "Anyone who signs up with this code will need a captain's approval before they can use the app."
- Availability hint (available state): check icon + "`<code>` is available." Submit button: `Create invite`. Back-link: `Tools`.
- @camp404/ui components: `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent`, `Label`, `Input`, `Textarea`, `Button` (ghost back-link; outline icon button with `Shuffle`; full-width primary submit). Icons via lucide: `ChevronLeft`, `Shuffle`, `Check`.

## Tokens

- `--color-background` `oklch(0.15 0.05 295)` — page base · hex `#0d061e`.
- `--color-foreground` `oklch(0.97 0.02 330)` — heading + back-link text · hex `#f7ecf3`.
- `--color-card` `oklch(0.26 0.08 295)` — the elevated form card (one step lighter than page).
- `--color-muted` `oklch(0.22 0.06 295)` — recessed info box / input fills.
- `--color-muted-foreground` `oklch(0.7 0.05 325)` — description, placeholders, helper text.
- `--color-border` / `--color-input` `oklch(0.35 0.1 305)` — card, input, info-box edges.
- `--color-primary` `oklch(0.65 0.27 340)` — solid Create-invite button · hex `rgba(255,0,140,0.92)`.
- `--color-primary-foreground` `oklch(0.99 0.005 340)` — button label.
- Radius ≈ 10px (`--radius: 0.625rem`) on card/inputs/buttons.

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no bottom tab bar, no phone frame.
- Do not redesign the layout or restyle components.
- Do not use a light theme — dark midnight-violet only.

## Notes

- Capture the **member (non-captain)** variant shown in the reference: it has NO "Captain options" panel (no pre-approve checkbox, no max-uses field) — instead the plain muted approval info box appears between the note textarea and the invite code.
- The invite-code input is **monospace**; so is the code echoed inside the availability hint.
- The available-state hint uses an **off-token emerald/green** (`text-emerald-400`, not a brand token) — keep it green, do not map it to magenta. The taken/invalid states use `--color-destructive` red (not shown here).
- The shuffle button regenerates the code; render it as a square outline icon button matched in height to the code input.
- This is a multi-state form (idle / checking / available / taken / invalid, plus a separate "Invite ready" success panel) — reproduce only the **available** state pictured.
