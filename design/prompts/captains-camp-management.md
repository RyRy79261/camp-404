# Pencil prompt — captains-camp-management

> **No faithful reference screenshot exists yet.** This page's roster reads the
> **live database**, not the in-memory test store, so under `E2E_TEST_MODE` the
> capture run hits the error boundary (see `design/reference/17-error-boundary.png`
> and `design/prompts/error-boundary.md`). To capture the real roster, re-run
> `design:capture` against a real `DATABASE_URL` (seed a few burner rows first).
> Until then, **design from source** (`apps/web/app/captains/camp-management/page.tsx`
> + `camp-management-roster.tsx`) using the layout below. Mobile-first, DARK theme.

## What this screen is
The captain-only camp roster: a searchable, filterable list of every burner with
their rank, approval status and questionnaire progress, plus a per-member detail
modal with Approve / Reject / Ping actions. It is the densest, most data-heavy
screen in the app and the one most in need of a design pass.

## Layout (top → bottom)
- Ghost back-button "Captains" with a chevron-left.
- `<h1>` "Camp management" + a muted one-line description.
- A segmented filter: "All (n)" / "Awaiting approval" (the awaiting tab carries a count badge).
- A search `Input`: placeholder "Search name, team, country…".
- A bordered roster **table**: columns Member / Rank / Status / Questionnaires / Driver / In SA / Country. Rows use status + rank pills and tick/dash cells.
- Clicking a row opens a per-burner `Dialog` modal with Overview / Profile tabs and Approve / Reject / Ping actions.
- Non-captains see the same table chrome blurred/greyed (`opacity-40 blur-[2px]`) behind a centred "Captain access only" lock card.

NB: the current implementation is `max-w-5xl` (desktop-leaning) and builds a raw
`<table>` — see the recommendations memo; this screen is a strong candidate for a
mobile card/list layout and shared `Badge` / `Table` primitives rather than a
desktop table squeezed into a phone.

## Copy & components
- Quote exact strings from `camp-management-roster.tsx` when recreating (status
  labels, tab labels, the lock-card copy, the modal action labels).
- Components: `@camp404/ui` `Input`, `Dialog`; everything else (tabs, status/rank
  pills, the table, the segmented filter) is **hand-rolled inline today** — there
  is no shared `Tabs`, `Badge`, or `Table` in `@camp404/ui`.

## Tokens
Base surfaces use the standard tokens (`var(--color-card)`, `--color-border`,
`--color-foreground`, `--color-muted-foreground`, `--color-primary`). **But the
status system is off-token** (raw Tailwind palette, not brand tokens) — flag this:
- Status pills: `emerald` (ready), `amber` (onboarding), `sky` (awaiting approval), `rose` (rejected/pending).
- Rank pills: `primary/15` (captain), `sky` (lead), `muted` (crew).
- Yes/no cells: emerald `Check` vs muted `Minus`. The "Approve" button is a hardcoded `emerald-600`, **not** the magenta primary.

When recreating, prefer mapping these to **semantic tokens** (a proposed
`success` / `warning` / `info` set) rather than reproducing the raw palette — see
the visual-direction recommendations.

## Do NOT
- Invent iOS/phone chrome (status bar, 9:41 clock, battery, bottom tab bar, phone frame).
- Use a light theme — dark midnight-violet only.
- Treat the desktop `<table>` as fixed — this is the screen to rethink for mobile.

## Notes
- This is the highest-value screen to get right and the hardest to capture. If you
  want a real reference, the fastest path is seeding a handful of burner rows in a
  local Postgres and re-running `design:capture` with that `DATABASE_URL`.
