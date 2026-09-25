# 404 OS visual language for the console

Status: proposal, 2026-09-25. Nothing here is built. The owner picked the
Classic desktop on 2026-09-25 (decision 1, ruled: the skin follows Join),
and in a second review the same day ruled decision 3 (last-seen windows),
movable icons with right-click menus, team folders, the Start menu's layer
and height, the blocking form on top of an inert desktop, no text selection
on the chrome, and the two cats (design doc, "The owner's second review").
Several details still need his ruling (see section 12), and every control
still needs his screenshot approval (section 7).

Related documents:

- Architecture and routing: `docs/specs/2026-09-25-404-os-console-design.md`
- Every program, its icon and who sees it:
  `docs/specs/2026-09-25-404-os-program-catalogue.md`
- This document (look and interaction):
  `docs/specs/2026-09-25-404-os-visual-language.md`
- PR order and exit criteria: `docs/plans/2026-09-25-404-os-console-migration.md`

[CORRECTION 2026-09-26] PR A moved Join's engine into packages, so the
`apps/join` paths and line numbers this document cites for it are from
before that move. The files now: window manager
`packages/os/src/window-manager.ts`; window frame, taskbar, desktop icon and
boot screen `packages/os/src/{os-window,taskbar,desktop-icon,boot}.tsx`
(Join's `components/os/taskbar.tsx` and `desktop.tsx` now only fill them with
Join's content); terminal engine and window
`packages/os/src/terminal/{engine.ts,terminal-window.tsx}`, with Join's
commands in `apps/join/lib/terminal-commands.ts`; INKBLOT
`packages/games/src/inkblot/` (`game.ts`, `sprites.ts`, `cat.ts`,
`inkblot-window.tsx`, `inkblot-win.tsx`). The Esc rule described as missing
is in `os-window.tsx` now.

## 1. Scope and ground rules

This spec says how the Join site's look (`apps/join`, "404 OS") carries into
the signed-in console in `apps/web`. It covers tokens, type, window chrome,
icons, boot, taskbar, Start menu, tray, the skin for the shared kit in
`packages/ui`, readability, motion and phones.

Rules:

1. **No new palette.** Every colour comes from Join's tokens
   (`apps/join/app/globals.css:6-33`), which are the landing page's values
   (`apps/web/app/landing-hero.tsx:11-20`), or from a status colour that
   already exists in `packages/ui/src/styles/globals.css`. Mixed surfaces use
   `color-mix` from those values, as Join already does.
2. **Skin through tokens.** The window engine (`@camp404/os`, see the design
   doc) reads only `--os-*` variables. The kit in `packages/ui` reads its
   usual semantic tokens, which `.os-skin` points at the Join values.
3. **The landing page is out of scope.** `apps/web/app/landing-hero.tsx` keeps
   its own palette and face (owner, 2026-09-23). Nothing here touches it.
4. **Structure ships before skin.** PR C (desktop on today's tokens) must not
   depend on anything here. PR D (this skin) merges only after the owner has
   approved screenshots of each control listed in section 7. The Kitchen
   windows also need the owner's layout approval first (memory:
   kitchen-noble-notations-direction).
5. **Legibility beats flavour.** This is a daily tool for 30 to 80 people,
   often on a phone in the desert. Where the Join look and legibility pull
   apart, legibility wins, and the rule is written down below.
6. **The desktop stays calm** (owner, 2026-09-25, rejecting the Tiled
   workstation and the Command deck as "way too busy and overstimulating").
   No dashboards, tickers, live charts or feeds on the wallpaper. Information
   lives inside programs and inside the Today gadget, which is closed by
   default. The wallpaper holds icons and folders and nothing else that
   changes on its own.
7. **Plain words** (owner, 2026-09-25: "some of the terminology might be a
   bit too geeky"). Every label a member reads is plain English: Roster, not
   `ROSTER.DB`; Family tree, not `LINEAGE.EXE`; "Page not found", not "FILE
   NOT FOUND". File names survive only in the Terminal and, under decision 9
   B, as a quiet suffix on the window title chip.
8. **The chrome is not text** (owner, 2026-09-25). Icons, folders, the
   header, the taskbar, the Start menu and the right-click menu are
   `user-select: none`, as on a real desktop. Program window bodies, dialogs
   and the blocking form keep selectable text.
9. **Easter eggs are never labelled** (owner, 2026-09-25: "if you know you
   know"). No hint, tooltip, badge or help line points at a cat or a game
   (section 4.6).

## 2. Tokens

### 2.1 Source values (reused, not new)

From `apps/join/app/globals.css:7-28`:

| Token | Value | Role in Join |
| --- | --- | --- |
| `os-bg` | `oklch(0.15 0.05 295)` | midnight violet desktop |
| `os-fg` | `oklch(0.97 0.02 330)` | text |
| `os-primary` | `oklch(0.65 0.27 340)` | hot magenta: focus, title bar |
| `os-primary-fg` | `oklch(0.99 0.005 340)` | text on magenta |
| `os-muted` | `oklch(0.7 0.05 325)` | secondary text |
| `os-accent` | `oklch(0.62 0.18 255)` | electric blue: eyebrows, icons |
| `os-panel` | `color-mix(os-bg 88%, os-fg)` | window body |
| `os-chrome` | `color-mix(os-bg 72%, os-fg)` | inactive title bar, taskbar |
| `os-line` | `color-mix(os-bg 60%, os-fg)` | borders and rules |

`os-accent` is the same value as the console's `--color-camp-blue`
(`packages/ui/src/styles/globals.css:86`). The console's magenta
(`--color-camp-magenta`, `oklch(0.72 0.2 345)`, line 84) is a different,
lighter magenta.

Join has no status colours. Its error text is the accent blue
(`apps/join/components/os/windows/terminal.tsx:15`) and its warning is a
magenta box (`apps/join/components/os/windows/readme.tsx:14`). The console
needs real ones (destructive buttons, toasts, validation). **Reuse the
console's existing values** rather than invent: `--color-destructive`
`#c24438`, `--color-success` `#b6d090`, `--color-warning` `#f4b672`
(`packages/ui/src/styles/globals.css:73-78`). They are already in the repo
and already tested against dark surfaces.

### 2.2 The `.os-skin` block

Add a `.os-skin` class to `packages/ui/src/styles/globals.css`, next to
`.camp-accent` (lines 155-161). `apps/web/app/layout.tsx:70` swaps
`camp-accent` for `os-skin` on `<html>` when PR D merges. The mapping:

| shadcn semantic | 404 OS value |
| --- | --- |
| `background` | `os-bg` |
| `foreground`, `card-foreground`, `popover-foreground` | `os-fg` |
| `card`, `popover` | `os-panel` |
| `muted`, `secondary` | `os-chrome` |
| `muted-foreground` | `os-muted` |
| `border`, `input` | `os-line` |
| `primary`, `ring` | `os-primary` |
| `primary-foreground` | see 2.3 |
| `accent` | `os-accent` (PageHeading's eyebrow already uses `text-accent`, `packages/ui/src/components/page-heading.tsx:19`) |
| `destructive`, `success`, `warning` | kept from the dark defaults (2.1) |
| `--radius` | `0` |
| `--overlay` | `oklch(from os-bg l c h / 0.7)` |

The same block also defines the `--os-*` variables that `@camp404/os` reads,
so Join and the console share one set of names. Join keeps its own `@theme`
block and maps it onto the same `--os-*` names (PR A).

`.light` is not offered under `.os-skin`. 404 OS is dark only, as Join is.

### 2.3 Contrast (computed, must be re-measured)

These ratios were computed with the standard OKLab to sRGB formula and the
WCAG 2 luminance formula (a throwaway script, not a browser). They are close,
not exact, because oklch values outside sRGB get clipped. Re-measure in the
browser before PR D merges.

| Text on surface | Ratio | Small text (4.5:1) |
| --- | --- | --- |
| `os-fg` on `os-bg` | 18.0 | pass |
| `os-fg` on `os-panel` | 14.8 | pass |
| `os-muted` on `os-panel` | 6.0 | pass |
| `os-muted` on `os-chrome` (inactive title) | 3.7 | **fail** |
| `os-accent` on `os-panel` (eyebrow) | 4.4 | **borderline fail** |
| `os-primary` on `os-panel` (magenta text) | 4.4 | **borderline fail** |
| `os-primary-fg` on `os-primary` (Join's title bar) | 3.6 | **fail** |
| `os-bg` on `os-primary` | 5.3 | pass |
| `os-bg` on console magenta | 7.2 | pass |

What follows from this:

- **Text on filled magenta is `os-bg`, not near-white.** Join puts
  `os-primary-fg` on the magenta title bar
  (`apps/join/components/os/os-window.tsx:152`), which is about 3.6:1 for
  12px text. Dark text on the same magenta clears 5:1. This keeps Join's hot
  magenta and follows the console's own reasoning for dark text
  (`packages/ui/src/styles/globals.css:150-154`). So in `.os-skin`,
  `primary-foreground` is `os-bg`. Near-white on magenta is not offered.
  This is option A of design doc decision 4 (Join's magenta, dark text,
  5.3:1); option B is the console's magenta with the same dark text (7.2:1).
- **Inactive title text uses `os-fg`**, not `os-muted`, on `os-chrome`
  (9.3:1). The inactive state is shown by the grey bar, not by dim text.
- **Magenta and blue are for 14px and up, or for non-text.** Eyebrows in
  `os-accent` are fine in Silkscreen at 12px only if re-measurement passes;
  otherwise lift them a step with `color-mix(os-accent, os-fg)`, the way
  Join lifts terminal output (`terminal.tsx:12-13`). Error text never uses
  the accent blue in the console: it uses `destructive`, with an icon.
- **`os-line` is 2.4:1 on `os-panel`.** That meets 3:1 for nothing. Input
  borders that carry meaning (a field's edge) use `os-muted` instead; `os-line`
  stays for dividers only.

## 3. Type

Three roles, the same as Join (`apps/join/app/layout.tsx:1-17`,
`apps/join/components/os/windows/ui.tsx`):

| Role | Face | Where |
| --- | --- | --- |
| Pixel | Silkscreen 400/700 (`--font-pixel`, `next/font/google`, as Join loads it) | window titles, icon labels, taskbar, Start menu, buttons, badges, the in-window h1, big numbers |
| Body | sans (see below) | paragraphs, table cells, form values, help text, errors, recipe text, markdown |
| Mono | JetBrains Mono (already loaded, `apps/web/app/layout.tsx:19-23`) | field labels, table headers, eyebrows, paths, codes, timestamps, money |

The body face is design doc decision 10: Join and the landing use Inter; the
console uses Montserrat (`apps/web/app/layout.tsx:13-18`). Default (A):
**keep Montserrat 500** for body, because it is already loaded, already tuned
(`packages/ui/src/styles/globals.css:223-236`) and reads well at 14px.
Montserrat's 800 uppercase h1/h2 rule is dropped under `.os-skin`: headings
become Silkscreen.

Hard rules (a lint-style test in PR D checks the first three by grepping for
`font-pixel` in these components):

1. Silkscreen never sets a table cell, an input or textarea value, a select
   value, help text, an error message, a toast body, markdown or a recipe.
2. Silkscreen is never smaller than 10px (Join's `text-[9px]` labels,
   `apps/join/components/os/windows/ui.tsx:40`, stay in Join).
3. Silkscreen is never used for a sentence longer than about six words.
   Button labels and titles only.
4. Member names are body text, everywhere. Join sets names in Silkscreen in
   its crew table (`apps/join/components/os/windows/crew.tsx:40-44`); the
   roster does not.
5. Uppercase is for pixel and mono labels only. Body text keeps its case.

## 4. Desktop, windows and chrome

### 4.1 Wallpaper

Calm (rule 6). The desktop surface stacks Join's four layers
(`apps/join/components/os/desktop.tsx:24-46`): `.os-grid` (32px magenta grid
at 7%), `.camp404-scanlines`, `.camp404-noise` at 6% and `.camp404-scanbeam`.
They move into `packages/os` CSS unchanged.

**Textures stay on the wallpaper.** No scanline, noise, beam, `os-glow` or
`camp404-chromatic` inside a window body. They cost paint time on long
scrolling tables and soften text.

### 4.2 Window frame

Taken from `apps/join/components/os/os-window.tsx:110-225`, with the changes
marked.

- A square `<section aria-labelledby=… aria-roledescription="window">` on
  `os-panel`: a labelled region, **not** `role="dialog"` (changed from Join).
  Real Radix modals keep `role="dialog"`, so the 25 `getByRole("dialog")`
  locators in the E2E specs still mean a modal, and a screen reader does not
  say "dialog" on every page.
- Focused: `os-primary` border, the magenta glow and the 8px hard black
  shadow (line 138). Not focused: `os-line` border and a 6px shadow
  (line 139).
- Title bar `h-9`. Focused: solid `os-primary` with **`os-bg` text** (changed,
  see 2.3). Not focused: `os-chrome` with **`os-fg` text** (changed).
- **The title chip shows the plain name** (Roster, Tasks), from the program
  catalogue. Under decision 9 B (recommended on desktop) the file name follows
  as a quiet suffix: `roster.db` in mono 11px `os-muted`, lower case,
  `aria-hidden`, hidden on phones. It is **not a heading**: the page's own
  `PageHeading` h1, inside the body, is the only heading, so
  `getByRole("heading")` never double-matches. The accessible name (through
  `aria-labelledby`) is the plain name.
- Three 28px buttons: minimise (a bar), maximise/restore (drawn boxes), close
  (×), with the aria-labels Join uses (lines 166, 176, 197).
- Esc closes the window only if `!e.defaultPrevented` and the event target is
  inside the window's own DOM, so dismissing a portalled Select or Popover
  never closes the program (design doc, section 2).
- Drag from the title bar only. Eight invisible grips plus the striped corner
  grip (lines 208-223). Positioned with left/top, never a transform, so
  dnd-kit and Radix positioning stay right.
- The body is the scroll container **and** an `@container`, so pages can
  answer to window width (see section 10). Not verified: `container-type`
  applies layout containment, which makes the body the containing block for
  `position: fixed` descendants. The questionnaire builder's dnd-kit
  `DragOverlay` (`apps/web/components/questionnaires/builder.tsx:1037`) is
  fixed-position and not portalled, so inside a window it may be offset or
  clipped. (The task board, `apps/web/app/(console)/tasks/task-board.tsx`,
  has no `DragOverlay`; it drags the card itself by transform, so it needs
  the same check but not the portal.) PR A or PR C adds a Playwright drag
  check of the builder and the task board inside a moved, non-maximised
  window; if it fails, `DragOverlay` is portalled to `document.body`.
- Opening plays `.os-window-in` (180ms, `steps(4)`, fill-mode `backwards`,
  `apps/join/app/globals.css:363-375`).

**Background windows (decision 3 A, ruled 2026-09-25).** Only the focused window
mounts its page (design doc). A background window keeps its frame and
unfocused title bar and shows a **frozen copy of its body as it last looked**,
at full brightness, so several programs read as open at once (the part of the
Classic desktop the owner likes most). A one-line footer in mono 11px
`os-muted` says `Last seen 14:02. Click to refresh.` The body is `inert` and
`aria-hidden`; the copy sits in a closed shadow root. Private fields are
blanked to a flat `os-chrome` bar with the word `Hidden`. After a hard load,
before a window has been opened, its body shows its icon and plain name
centred on `os-panel`. Clicking anywhere in the frame focuses it and renders
it fresh.

**Window crashed and not found.** In-window screens, built on
`ErrorRecovery frame="inline"`: a Silkscreen line
(`TASKS STOPPED RESPONDING` / `PAGE NOT FOUND`), one body sentence, and slab
buttons Retry / Close / Report.

### 4.3 Icons

Three families, as in Join:

1. **Program icons: AppIcon grammar.** SVG on a 48-unit grid, stroke 1.5,
   `strokeLinecap="square"`, `strokeLinejoin="miter"`, `currentColor`
   (`apps/join/components/os/icons.tsx:103-116`). At rest `os-accent`; hover,
   focus or open `os-primary`, with the drop-shadow glow when open. One new
   drawing per program in the catalogue. Each is drawn to this grammar and
   shown to the owner with the PR D screenshots.
2. **Team icons: PixelIcon.** The triple-layer (magenta, cyan, white) pixel
   grids already exist per team (`apps/join/components/os/pixel-icons.tsx`),
   keyed by `TeamIcon`. They move to `packages/os` and serve the Teams
   folder.
3. **Glyphs inside controls: lucide, squared.** apps/web has about 118
   lucide imports. They stay, but under `.os-skin` a base rule sets
   `svg.lucide { stroke-linecap: square; stroke-linejoin: miter; }`. lucide
   adds the `lucide` class to every icon
   (`node_modules/.pnpm/lucide-react@1.16.0_react@19.2.6/node_modules/lucide-react/dist/esm/Icon.mjs:35`).
   No mass replacement.

Desktop icon buttons follow `apps/join/components/os/desktop-icon.tsx`: icon
above a label chip on `os-chrome/80` that turns magenta on hover, focus or
open. The label is the plain name (Family tree), in Silkscreen at least 11px,
and wraps to two lines rather than truncating. **Badges** (unread,
pending) are a square `os-primary` chip with `os-bg` mono digits, top right
of the icon, plus the count in the button's `aria-label`, which uses the
plain name ("Open Inbox, 3 unread"). The `useLinkStatus` pending state pulses the
icon with a `steps(2)` blink, not a spinner.

Marks on desktop icons (from the prototype, `variant-a-chrome.tsx`,
`AIcon`):

- **Selected**: a dotted `os-primary/70` box round the whole cell with a
  `primary/15` fill. Not colour alone: the selection is also in the
  accessibility tree (design doc, section 6).
- **Shortcut**: a small arrow in the icon's bottom-left corner, as on a
  real desktop, and ", shortcut" in the accessible name.
- **Team folder you lead**: a small `LEAD` tag at the folder's top-left,
  on `os-bg` with an `os-primary` border. Silkscreen 10px (the prototype's
  8px breaks rule 2 in section 3). The tag is `aria-hidden`, so the
  folder's accessible name says it instead ("Open Kitchen team, you lead
  it").
- **Member folder**: the folder drawing with the number of items in it.
- **Being dragged**: the icons follow the pointer at 75% opacity; on drop
  they are simply in their new cells. No slide or snap animation.
- **Box select**: a dashed `os-primary` rectangle with a `primary/10` fill.

### 4.4 Desktop layout

Owner, 2026-09-25: "it needs to be ordered a bit. Things seem quite random",
then, on the second review, icons that move like a real desktop.

- **An invisible grid** of square cells (96 px in the prototype) covers
  the desktop, left of the Today handle. Every icon sits in one cell.
- **Default layout**: one column per group from the left, top to bottom:
  1. **Me**: Inbox, My forms, My account, Invites, My lift.
  2. **Camp**: Tasks, Calendar, Roster, Meetings, Family tree, Power, the
     Teams folder, the Kitchen folder.
  3. **Captains**: the Captains folder (team leads and captains only), then
     Terminal. For a plain member, Terminal ends the Camp column.
  A group too long for the screen runs into a second column. **Team
  folders** go down the right-hand side, led teams first.
- No group labels and no boxes on the wallpaper: the columns are only the
  starting order, and the member may move anything. The Start menu (as
  sections with mono 11px uppercase labels) and the phone home screen keep
  the group names.
- "Line up icons" (right-click on the empty desktop) puts the default back.
- The member's own folders and shortcuts go in the first free cell when
  made, then wherever they drag them.

### 4.4a Right-click menu

From the prototype (`_proto/desktop-items.tsx`, `ContextMenu`):

- A small panel at the pointer, kept on screen: `os-panel`, a 1px
  `os-primary` border, the 6px hard shadow, square. Rows are body text 13px
  (not Silkscreen: some are sentences like "Add to a new folder"); the
  hovered or focused row is solid `os-primary` with `os-bg` text. The first
  row (Open) is bold. Delete rows are in the danger colour (`destructive`
  in the console, not magenta). Thin `os-line` rules split the groups.
- Opens on right-click, and from the keyboard with Shift+F10 or the Menu
  key. Focus lands on the first row; arrows move; Esc closes and returns
  focus to the icon.
- Naming a folder is a small dialog ("Name your new folder" / "Rename this
  folder", one field, 24 characters at most, Save).

### 4.5 The Today gadget

- **Closed by default** (owner, 2026-09-25: "I don't like it being open the
  whole time"). A handle on the right edge of the desktop, vertically
  centred: a 28 x 96 px tab on `os-chrome` with a magenta left rule, the
  vertical mono label `TODAY` and a count chip when something is due. It is a
  `<button aria-expanded aria-controls>` named "Show Today" / "Hide Today",
  44 px wide hit area.
- Open, it is a panel docked to the right edge, 320 px wide, full height
  above the taskbar, on `os-panel` with an `os-line` left border. It sits
  above the wallpaper and below the window layer, so it never covers a
  focused window. Esc inside it closes it and returns focus to the handle.
- The choice is remembered per browser (`localStorage`
  `camp404.os.today-open`, a boolean). Opening plays `.os-window-in`; closing
  is instant.
- On phones it is a sheet from the bottom bar (section 9).

### 4.6 Terminal and hidden cats

- **Terminal.** Join's TERMINAL look (`apps/join/components/os/windows/terminal.tsx`),
  shared through `@camp404/os/terminal`: mono 14px on `os-bg`, the prompt in
  the lifted accent, errors in `destructive` (never the accent blue, rule in
  2.3). Text is selectable. It is a normal window with a plain title,
  Terminal.
- **Hidden cats** (owner, 2026-09-25: "I want to hide more cats in here").
  Small, found by accident, never in the way. PR D or later, in
  `@camp404/games/inkblot`. The prototype's list is
  `apps/join/app/prototype/captain-desktop/_proto/cats.md`.
  - **Only two real cats** (owner, 2026-09-25). **Jinn**: all black, "who
    is best". **Prince**: white and fluffy, with a black cap, a black patch
    on his back and a black fluffy tail. No other cat appears anywhere.
    Both are drawn in the INKBLOT cat's sprite style (`inkblot-cat.ts`), with
    the outline lifted to `os-muted` so a black cat reads on the dark
    desktop.
  - **Never labelled** (owner: "if you know you know"). No tooltip, hint,
    help line or `help` entry points at a cat or a game. A decorative cat is
    `aria-hidden`. A cat that reacts to a tap has a plain accessible name
    ("A cat"), never an instruction.
  - **Prince, asleep on the taskbar clock** (desktop, and the clock on the
    phone's bottom bar), with a slow "z". A tap pets him: a small reaction,
    nothing else.
  - **Shadow Work in the Teams folder** (every member has that folder).
    Pinned to the bottom of the folder window: the camp's art piece, a lit
    wooden dodecahedron with mandala-cut faces, as a 16-bit sprite generated
    from the real geometry (a regular pentagon inside a regular decagon), on
    its stand, with its lattice of light on the floor. Jinn starts asleep on
    top. Nothing moves until someone finds out the piece can be moved; then
    he wakes. It can be thrown (it keeps the flick's speed, arcs over the
    folder's icons and bounces off the floor and walls) and rolls like a
    ball; Jinn chases it and jumps at it with his claws out, bats it once
    when it stops, then climbs back on and sleeps. Dragging the Teams window
    shakes everything inside the other way, like things in a box; a good
    shake knocks Jinn off. The stand and light stay under the piece. Three
    taps on Jinn open INKBLOT. Code: `_proto/shadow-work.tsx`.
  - Other places, all small: Jinn peeking over the focused window now and
    then, the boot line ("Counting cats ...... 2"), the Terminal's cat
    commands, and paw prints after typing `meow`. (The prototype also puts
    Jinn on its "Logged off" screen; the console has no such screen, and
    the signed-out landing page is not touched.) Never inside data areas,
    tables, forms or the Today gadget's list.
  - **Decorative only.** Nothing in the app needs them; no gameplay is
    required, and a member who never finds them misses nothing. They read
    no data and make no request. None covers a control or blocks a click
    (`pointer-events: none` unless it is the toy itself).
  - Reduced motion: stills. Jinn sits and watches, Shadow Work is set down
    at once, the peek and paw prints never run. Never sound, never a flash,
    never more than one cat animating at a time outside the Teams folder.
  - They obey the performance rules (design doc, section 8): the Shadow Work
    loop runs only while the Teams folder is open and sleeps when nothing
    moves.
  - They add no text a test could double-match. Under `E2E_TEST_MODE` they
    render as stills.

### 4.7 Taskbar, Start menu, tray

From `apps/join/components/os/taskbar.tsx`:

- **Taskbar**: fixed, `h-10`, `os-chrome`, magenta top rule (line 147). Start
  button on the left, one 32px bordered button per open window (dashed when
  minimised, `aria-pressed` when on top), then the tray.
- **Start menu**: the panel with the vertical magenta spine
  (lines 103-106), wrapped in `<nav aria-label="Console">`. Items are
  Silkscreen 11px rows that invert to magenta, with plain names. Sections,
  top to bottom: Programs (the member's manifest, in the groups: Me, Camp,
  Captains with Terminal, then My teams), Account, Report a problem, Log
  off. Log off reuses `SignOutLink`, never a plain `/auth/sign-out` href, so
  the device's push token is removed first. Keyboard: Join's arrow keys, Esc
  back to Start. **It sits above every window, the taskbar, the pins and the
  tray** (owner, 2026-09-25; bands in 4.9). On desktop it is **at most half
  the screen height** (`max-h-[50dvh]`) and scrolls inside after that; on a
  phone it is a full-screen sheet above the bottom bar.
- **Tray** (replaces the header's right side,
  `apps/web/components/console/console-header.tsx:54-103`): the notification
  bell (the existing `NotificationPanel` popover, skinned), the pinned count,
  the system-health icon, the Burn countdown in mono like Join (line 191),
  and the clock (with Prince asleep on it, 4.6). Tray items come from the
  manifest, per mode: the restricted and held desktops get no pins and no
  system-health icon.
- **System-health icon** (owner, 2026-09-25: for every accepted member). A
  warning glyph in `os-primary`, shown only when something is wrong. For a
  member it is a button that opens a small tray balloon, "Something in the
  app is not working right now", and nothing more; the server sends them a
  coarse flag only. For a captain it carries the warning count in its label
  ("System health, 2 warnings") and opens System status.
- **Account chip** (the prototype's header, top right): avatar, name and
  rank chip, rendered on the server. A lead gets a second line in mono 10px
  `os-muted`: "Leads Kitchen" for exactly one team, "Leads 3 teams" for more
  (owner, 2026-09-25). The full list ("Leads Kitchen, Power & Lighting,
  Finance") shows in a tooltip on hover and on keyboard focus, and is in the
  chip's accessible name.
- **Pinned announcements** (`md` and up; on phones they fold into the tray,
  section 9; never in restricted mode): a single-line strip above the
  taskbar, `os-panel`
  with a magenta left rule and mono label `PINNED`, the title in body text
  and a "Read" link. More than one pin shows "1 of N" with next/previous.
  It never overlaps a window body; the window layer stops above it.
- **Folders** (Teams, Kitchen, Captains, team folders such as "Kitchen
  team", and the member's own): a folder icon opens a small window listing
  its icons in a grid. Same frame, title "Teams". The Teams folder has Shadow
  Work pinned to the bottom of its window (4.6).

### 4.7a The blocking form

Owner, 2026-09-25: "Blocking questionnaires will sit on top of everything"
(prototype: `_proto/blocking.tsx`, `?blocking=1`).

- The desktop stays drawn behind, dimmed by an `os-bg` scrim at about 85%
  with a light blur, and the scanlines over it. It is `inert`: no icon,
  taskbar or tray responds, and it shows nothing live (no pins, counts,
  Today or last-seen copies).
- The form is a window frame with a magenta title bar ("Required form",
  "1 of N") and **no** minimise, maximise or close. Centred, up to 32rem
  wide, on desktop; full screen on phones. Its text is selectable.
- Esc does nothing. Focus starts on the first field and stays inside. The
  only way out besides answering is Sign out.

### 4.8 Boot

Only if decision 6 is A. Join's BIOS screen
(`apps/join/components/os/boot.tsx`: a line every 110ms, 900ms hold, any key
or tap skips, `role="status"`). In the console it plays
at most once per browser session, after sign-in or on "Continue to desktop",
never under `E2E_TEST_MODE`, never under reduced motion, never in front of a
server redirect. The lines are console-flavoured (member name, rank chip,
programs loaded) and are shown to the owner with the PR D screenshots.

### 4.9 Layering

Join relies on `isolate` for the window layer
(`apps/join/components/os/os.tsx:131-135`), taskbar `z-[90]`, Start menu
`z-[95]`, boot `z-[100]`. The kit portals Radix content at `z-50`
(`packages/ui/src/components/dialog.tsx:42,64`, `popover.tsx:24`,
`select.tsx:77`, `dropdown-menu.tsx:41`) and the Toaster at `z-[100]`
(`toast.tsx:236`). Under that plan a Select opened near the bottom of a
window would slide under the taskbar. Fixed bands:

| Band | z | What |
| --- | --- | --- |
| Wallpaper, icons | 0 | desktop |
| Today gadget and handle | 10 | desktop, below every window |
| Window layer | 20 and up (`isolate`) | all frames; their internal z stays inside |
| Pinned strip, taskbar | 90 | chrome |
| Tray popovers and balloons | 95 | chrome |
| Start menu | 100 | above every window and all chrome (owner, 2026-09-25) |
| Right-click menu | 105 | desktop and folder menus |
| Blocking form layer (scrim and form) | 108 | above the whole desktop, Start menu included; the desktop behind is `inert` |
| Radix overlays (dialog, popover, select, dropdown, combobox) | 110 | kit, raised from `z-50`; above the blocking layer so the form's own Selects and dialogs open |
| Toaster | 120 | feedback |
| AcknowledgementGate, FeedbackGate, boot | 130 | system takeovers (the gate also sets `inert` on `#os-desktop`) |

The prototype uses other numbers (Start menu 140, right-click menu 150,
blocking form 300); the order above is what counts.

## 5. Skinning the kit (`packages/ui`)

The token block in 2.2 re-colours most of the kit. What it cannot do:

- **Corners.** The cva strings hard-code `rounded-md`, `rounded-lg`,
  `rounded-xl` and `rounded-full` (`button.tsx:8,24-25`, `card.tsx:11`,
  `input.tsx:12`, `badge.tsx:9`, `alert.tsx:10`, `dialog.tsx:64`,
  `segmented-control.tsx:25,29`, `toast.tsx:179`), and apps/web has about 180
  `rounded-*` utilities in 73 files. `--radius: 0` alone does not square
  them. Plan: edit the kit's cva strings to `rounded-none` under the skin, and
  run a scoped codemod over apps/web that turns `rounded-sm|md|lg|xl` into
  `rounded-none`. **`rounded-full` stays** where it draws a circle: avatars
  (`avatar.tsx:19,46`), status dots, the notification dot. No global
  `* { border-radius: 0 }`.
- **Focus ring.** The kit uses `ring-2 ring-offset-2`. Under the skin the
  focus style is Join's 2px magenta outline with 2px offset
  (`apps/join/app/globals.css:52-55`), in `@layer base`.
- **Enter animations.** `zoom-in-95` and slides become `.os-window-in`.

Component by component. "Today" is the file in
`packages/ui/src/components/`.

| Component | Imports in apps/web | 404 OS skin |
| --- | --- | --- |
| Button `default` | 97 | Join's slab (`apps/join/components/os/windows/readme.tsx:35`): `border-2 border-os-fg bg-os-fg text-os-bg`, Silkscreen 12px uppercase, hard `4px 4px 0 0 os-primary` shadow, hover fills magenta with `os-bg` text, active moves 0.5 and drops the shadow. Min height 40px (44px on phones). |
| Button `outline`, `secondary` | | `os-line` 1px border on `os-panel`, `os-fg` text, magenta border on hover. No shadow. |
| Button `ghost`, `link` | | `primary/15` fill on hover; link is body text, underlined. |
| Button `destructive` | | the slab with `destructive` fill and shadow, `os-fg` text. |
| Input, Textarea, InputField, PasswordInput | 30 / 21 / 5 / 4 | a 1px `os-muted` box on `os-bg`, body text 14px (16px on phones, so iOS does not zoom), magenta border on focus. Join's underline field (`apps/join/components/os/windows/fee.tsx:39`) is kept for short single-line fields in dense panels only, because a lone underline is hard to find in a long form. |
| Label, Field | 18 / 16 | mono 11px uppercase `os-muted` above the field; required mark `*` in magenta; help text body 13px `os-muted`; error text body 13px `destructive` with an icon, beside the field (AGENTS.md: inline errors). |
| Select, Combobox, DateControl trigger | 13 / 1-2 / 6 | same box as Input, a square `▾` glyph; content panel is `os-panel`, square, `os-line` border, 6px hard shadow; highlighted row solid magenta with `os-bg` text; items body text. |
| Checkbox | 12 | 18px square box, `os-muted` border, a filled `os-primary` square inside when checked (no tick stroke); indeterminate is a bar. |
| Switch | 9 | a square track 44x24 with a square thumb, pixel-style; `ON`/`OFF` mono label next to it so state is not colour alone. |
| Slider | 1-2 | Join's `.os-range` (`apps/join/app/globals.css:569-607`). |
| SegmentedControl, tabs | 9 | taskbar-button style: 32px bordered cells, Silkscreen 11px, the pressed cell solid magenta with `os-bg` text, `aria-pressed` kept. There is no `tabs.tsx` in the kit; link tabs such as `recipe-tabs.tsx` and the inbox filters use the same recipe. |
| Card | 70 | inside a window: a bordered section, square, `os-line` border, no shadow; `CardTitle` becomes a mono or Silkscreen eyebrow. A card never draws a second window frame. |
| PageHeading | 45 | stays as the in-window h1: Silkscreen 20px uppercase, eyebrow mono in the lifted accent, description body. No `os-glow` in windows (glow is for the wallpaper wordmark). |
| Badge | 38 | square chip, Silkscreen 10px uppercase: solid `os-primary` / `os-bg` text, or outline `os-line`; status variants use the 2.1 status colours. |
| Alert | 16 | Join's warning box (`readme.tsx:14`): tinted fill at 10%, border at 60%, a mono uppercase label (`WARNING`, `ERROR`, `NOTE`) then body text. |
| Dialog, ConfirmDialog | 14 / 12 | a modal window: the same frame and title bar (magenta, a plain title such as "Confirm"), close ×, `.os-window-in`, scrim `--overlay`. It is modal (`aria-modal="true"`) and owned by its window; Esc closes the dialog first, never the window underneath (the Esc guard in the design doc). Buttons: slab for the main action, outline for cancel. |
| Sheets | none in the kit | the console's "Menu" sheet (a Dialog in `apps/web/components/console/console-nav.tsx`) goes away with the nav. Any future side sheet is a full-height window docked right, same frame. |
| Popover, DropdownMenu, NotificationBell | 1-2 each | the Select content panel recipe. |
| Toast | 64 | a small window in the bottom-right corner above the taskbar (bottom-centre on phones): `os-panel`, square, 6px hard shadow, a 4px left rule in the status colour, a mono label (`SAVED`, `FAILED`) then one body sentence, close ×. No title bar, so it reads as a tray balloon, not a program. |
| Table | 5 | Join's CREW.DB (`crew.tsx:17-52`): mono 11px uppercase `os-muted` headers, one `os-line` rule under the header, `os-line/50` between rows, body text 14px in cells, no zebra; hover row `primary/10`; selected row a 2px magenta left rule plus `primary/15`. |
| ResponsiveDataTable | 8 | the Table skin at width; the narrow card list (`responsive-data-table.tsx:159`) becomes bordered `os-panel` blocks. Its `md:` switch moves to `@container` (section 10). |
| ProgressBar | | Join's capacity bar: a bordered `os-bg` track, solid / 45% / hatched segments, a mono legend. |
| Spinner                                    | 17                  | `Loader2` (`spinner.tsx:2,25`) becomes a mono ASCII spinner `                                                                                                                                                                                                                                                                                       | / - \` at `steps(4)`, with the same `aria-hidden`; a status line says what is loading. |
| EmptyState | 14 | the icon, a Silkscreen line in plain words (`NOTHING HERE YET`), one body sentence, one slab button. A hidden cat may sit here (4.6). |
| CaptainLock | 17 | a window-body lock screen: a pixel padlock, `ACCESS RESTRICTED`, the existing sentence. |
| Skeleton | | not used in windows (no per-window Suspense); keep for inline lazy parts only, as a flat `os-chrome` block, no shimmer. |
| Avatar, AvatarUpload | 4 | stays round; a 1px `os-line` ring. |
| DictatePill, recorder | 6 | the slab button in outline style with a blinking square record dot. |
| Account security panels | 1-2 each | the same Input, Button and Dialog skins; no special layout. |

## 6. Readability rules for long forms and tables

1. **Width.** Form columns top out at about 40rem inside a window, even when
   the window is wider. Prose tops out at 70ch.
2. **One column below 32rem of window width.** Field grids go to one column
   by container width, not viewport width.
3. **Sections, not cards.** A long form is split by a mono uppercase section
   label and an `os-line` rule. No nested bordered boxes three deep.
4. **Errors beside the field**, in body text with an icon, plus a summary
   line at the top of the form listing the fields to fix, each a link that
   focuses the field.
5. **Sticky actions.** Save / Cancel sit in a footer bar pinned to the bottom
   of the window body (`sticky bottom-0` inside the window's scroll
   container), `os-panel` with an `os-line` top rule. Never `position: fixed`.
6. **Tables.** Body text 14px, row height at least 40px (48px when rows have
   buttons), numbers and money right-aligned in mono with tabular figures,
   the first column sticky on horizontal scroll, header row sticky inside the
   window body. Row actions are outline buttons or one "…" menu, never a row
   of slabs.
7. **No decoration in the data area.** No glow, chromatic split, scanline or
   pixel face in cells, inputs or markdown.
8. **Hit targets** at least 40px on desktop, 44px on phones, including the
   title-bar buttons on phones.
9. **Colour is never the only signal.** Status chips carry a word; the
   focused window carries the magenta bar and the glow and the `aria-pressed`
   taskbar button.

## 7. What the owner approves before PR D merges

A screenshot, desktop and phone, of each: the desktop in its default layout
(group columns on the left, team folders on the right, a LEAD tag); icons
selected, a box select and a shortcut arrow; each right-click menu; the
Today handle, closed and open; a focused and an unfocused
window; a background window with its last-seen copy; the Start menu at its
height limit; the account chip with "Leads N teams"; the system-health icon
as a member and as a captain; the blocking form over the desktop; the
Terminal; Prince on the clock and Shadow Work with Jinn, still and moving;
the phone home screen with its My teams row, a folder sheet, a full-screen program with Back/Close, the bottom bar and the Today
sheet; the tray and a pinned strip; a long form with inline errors (the
meeting editor); a Select, Combobox and DateControl open; a checkbox,
switch and segmented control; a toast of each kind; a ConfirmDialog over a
window; the roster table and its phone list; the questionnaire builder; the
CaptainLock; the crash and not-found screens; the boot; each new program
icon. The Kitchen windows (recipes, review, source editor, meal plan) are
shown as layouts first and wait for their own approval.

## 8. Motion and reduced motion

Join's motion is all `steps()`: jerky CRT, never eased
(`apps/join/app/globals.css:150-375`). The console keeps that:

- Window open `.os-window-in` 180ms `steps(4)`. Close and minimise are
  instant.
- Dialogs and popovers use `.os-window-in`, not zoom or slide.
- Pending icon: a `steps(2)` blink. Spinner: `steps(4)` ASCII.
- No motion inside window bodies apart from those. No glitch shake, no
  chromatic jitter on data.
- Hidden cats: at most one animating at a time, `steps()` sprite frames, a
  still frame under reduced motion (4.6). Shadow Work is the one place with
  physics (arcs, bounces, rolling); it runs only inside the open Teams
  folder and stops under reduced motion.
- Icons dropped after a drag land in their cells at once: no slide, no
  snap animation (owner, 2026-09-25).
- Everything here follows the design doc's performance rules (section 8):
  animation pauses when hidden or under reduced motion, and loops sleep
  when nothing moves.

Reduced motion: the console's blanket rule
(`packages/ui/src/styles/globals.css:250-259`, `animation-duration: 0.01ms
!important`, outside every layer) would stop Join's infinite animations on
their first keyframe instead of on Join's chosen stills
(`apps/join/app/globals.css:533-565`). The merged stylesheet keeps the
blanket rule and adds Join's still list **after it, with `!important`**:
beam and tears hidden, the chromatic layers held at ±3px, gift rings full.
The boot checks the media query in script, as Join does
(`boot.tsx:18-24`), and in the console it is skipped entirely.

## 9. Phones (below `md`): the mobile Classic desktop

The owner needs "a mobile version of the classic desktop" (2026-09-25). It is a
phone home screen, not a shrunk desktop.

- **CSS first.** The frame is full screen by default and becomes a floating
  window with `md:` classes, so the server's first paint is already right at
  390px. `usePhone` only turns dragging on and off. (Join does the reverse,
  `os-window.tsx:130-136`, and flips after hydration.)
- **Home screen.** `/` shows the groups (4.4) as labelled rows of big
  icons (Me, Camp, Captains with Terminal), then a **My teams** row of the
  member's team folders with their LEAD tags (owner, 2026-09-25): the icon
  at least 48px, the label below it, the whole cell a 64 x 80 px hit
  target, 4 per row at 390px (3 at 360px). The order is fixed: no dragging,
  no right-click menu, and the member's own folders and shortcuts are not
  shown (desktop only). No Today panel on the home screen itself.
- **Folders are full-screen sheets.** Teams, Kitchen, Captains and the team
  folders slide up over the home screen with a title bar ("Teams") and a
  big Close.
- **Programs are full screen**, one at a time. The title bar holds a big
  Back/Close on the left (at least 44 x 44px, labelled "Back to home" or
  "Close Roster") and the plain program name. No maximise, no grips, no
  minimise. Close does `router.replace` to the next window (or `/`), as on
  desktop (design doc, section 3).
- **Bottom bar** in place of the taskbar: Home, Open programs (a list sheet
  of open windows by plain name), the inbox bell, Today. Four 44px targets,
  mono labels under glyphs.
- **Today is a sheet** from the bottom bar, full width, up to 80% of the
  height, with a grab bar and a Close. It starts closed on a hard load.
- History Back also works, as a second way out: opening a window from the
  home screen or the switcher pushes an entry, and a Back that lands on a
  different window's page closes the window it left, so background windows
  do not pile up (design doc, section 5). It is not the only route out: the
  installed PWA runs `display: "standalone"` (`apps/web/app/manifest.ts:11`),
  so iOS shows no Back button, and a Capacitor WKWebView has no swipe-back
  unless it is turned on. If the native shell ships, the Android App plugin's
  `backButton` event calls the same close logic as the title-bar control.
- A Back or swipe cannot be cancelled, so the dirty guard cannot ask first.
  The four editors that autosave their draft (design doc, section 5) keep
  the text; any other unsaved input is lost on a Back.
- The owner ruled a thin Capacitor WebView shell (2026-09-16), which means
  `server.url`. But `apps/mobile/capacitor.config.ts` still sets `webDir`
  (the static export, `../web/out`) and no `server.url`.
  [UNRESOLVED 2026-09-25] The owner picks: switch the config to `server.url`
  as part of this work, or leave native out of this work. The static export
  stays deferred either way (a server-rendered desktop cannot be exported).
  Until then, nothing here assumes either.
- **Chrome budget.** At 360x640 a fixed bottom bar (about 48px), a pinned
  strip (about 32px) and a 48px title bar leave little for the page, before
  the browser's own bars. So on phones:
  - the pinned strip folds into the bell (the pinned count shows there)
    instead of standing above the bottom bar;
  - the bottom bar hides while an input has focus and the soft keyboard is open
    (a `visualViewport` resize listener), so neither it nor anything fixed
    rides up over the focused field or the sticky Save bar;
  - the frame and bottom bar size with `dvh`, not `vh`, and pad by
    `env(safe-area-inset-bottom)` (and the top inset for the title bar) so
    the iOS home indicator does not sit on the bottom bar or the Save bar;
  - a Playwright check at 360px width focuses an input low in a long form
    (the meeting editor) and asserts it and the Save bar stay in view.
- The Burn countdown moves into the Today sheet on phones.
- Dialogs on phones are full-width sheets from the bottom edge of the window
  area, same frame and title bar.
- Inputs are 16px on phones.

## 10. Container queries

Window bodies are `@container`. Pages that switch layout with `md:`/`lg:`
today (Tasks, Roster, Power, Meal plan, Payments, questionnaire results, the
builder, the recipe rail, `ResponsiveDataTable`) move to `@md:`/`@lg:`
variants in PR E. Until a page is moved, its window opens maximised on
desktop so the viewport breakpoints still tell the truth.

## 11. What stays from the current design

- The landing page, untouched (`apps/web/app/landing-hero.tsx`).
- Dark only, one accent family: the console already puts magenta on a dark
  ground; the skin changes the ground from charcoal to violet.
- The status colours (destructive, success, warning) from the AfrikaBurn
  tokens (2.1).
- Montserrat for body text (decision 10 A; B is Inter) and JetBrains Mono
  for labels and data.
- Dark text on filled magenta (the console's rule, now applied to Join's
  magenta).
- `PageHeading` as each page's h1, now inside the window.
- The kit's components and their APIs. The skin changes class strings and
  tokens, not props. Pages do not change for the skin, apart from the
  `rounded-*` codemod.
- The composition of each page (the AfrikaBurn-derived layouts) inside its
  window. A page's layout only changes when the owner approves it, as the
  Kitchen rule already says.
- Toasts for one-tap list actions and inline errors for typed input
  (AGENTS.md "Conventions").
- The useLinkStatus pending pulse, moved from the nav item to the icon.

What does not stay: the AfrikaBurn-derived tokens and header, replaced by
Join's look under decision 1 (ruled 2026-09-25).

- The blanket reduced-motion rule, with Join's stills layered on top.

## 12. Owner decisions this spec waits on

Numbers are the design doc's (its "Decisions" section has all 14).

- **1** Ruled (owner, 2026-09-25): the Classic desktop; the skin follows Join.
  It still ships staged: each control and program icon merges only after the
  owner approves its screenshot (section 7).
- **3** Ruled (owner, 2026-09-25): A, the last-seen copy, frozen (4.2).
- **4** Which magenta fills the focused title bar and main buttons. A: Join's
  `oklch(0.65 0.27 340)` with `os-bg` text (5.3:1), the default here. B: the
  console's `oklch(0.72 0.2 345)` with the same dark text (7.2:1).
  Near-white on magenta (about 3.6:1) is not offered.
- **5** Gate screens. A: restyle `GateScreen`; split `AuthShell` so
  `/signup/required` changes and the sign-in pages keep today's look; the
  blocking runner and onboarding wizard are separate items. A2: as A, but the
  sign-in pages change too. B: leave them all.
- **6** Boot. A: once per browser session, short, skippable. B: never.
- **8** Ruled (owner, 2026-09-25): team folders on the right-hand side,
  tagged LEAD (4.3, 4.4), and a My teams row on the phone (section 9).
- **9** Window titles. Plain names are settled (rule 7). A: plain names only.
  B (recommended on desktop): plus a quiet lower-case file-name suffix on the
  title chip.
- **10** Body face. A: Montserrat 500 (default). B: Inter (Join and landing).
- **12** AGENTS.md's "copy AfrikaBurn's nearest equivalent" rule. A
  (recommended, since decision 1 is A): replace it with "copy the nearest
  existing program's window composition and restyle with `--os-*` tokens".
  B: keep it.
- **14** Ruled (owner, 2026-09-25): icons move on a snapping grid, with
  right-click menus, member folders and shortcuts (4.3 to 4.4a). Still open,
  and not a visual question: where the layout is stored (the design doc
  recommends the browser).

AGENTS.md "Design" gets a dated `[CORRECTION 2026-09-25]` in PR D, with the
Classic desktop ruling, the calm-desktop and plain-words rules, and decision
12's rule (see the migration plan). The landing-page exclusion stays.
