# 404 OS: a welcome wizard and system themes

Status: spec, 2026-09-26. Not built. It follows the 404 OS console refactor
(PRs A to E, `docs/plans/2026-09-25-404-os-console-migration.md`) and ships
as its own PR after it (owner, 2026-09-26: decision "A", themes after the
refactor).

Related docs: `docs/specs/2026-09-25-404-os-console-design.md` (the shell),
`docs/specs/2026-09-25-404-os-visual-language.md` (tokens, fonts, motion).

## Why

The owner, reviewing PR #288 (2026-09-26):

- "the softer colors in the actual open 'programs' felt a bit less
  overwhelming than the original prototype. We might want to actually make
  some system themes for people to pick down the line."
- "I have no idea what this would be like to a color blind person, a person
  with poor vision, or a non tech person."
- "there would need to be a first time pop up on the right side, like a
  welcome to 404 OS wizard."

The desktop is a new way of using the camp app. Some members will not know
that icons open with a double-click, that windows can be moved, or where
Today lives. And one look does not suit everyone.

## Part 1: the welcome wizard

### What it is

A panel that slides in from the right edge the first time a member reaches
the desktop, built like the Today pop-out (same edge, same frame), titled
"Welcome to 404 OS". A few short steps, each one screen, with Back, Next and
"Skip for now":

1. **Welcome.** One sentence on what the desktop is: your camp tools, each in
   its own window.
2. **Opening things.** Double-click an icon (or press Enter) to open it; on a
   phone, one tap. Offers the choice "Open with one click" (a preference, see
   below), for members who find double-clicks hard.
3. **Windows.** Drag a title bar to move a window; the taskbar shows what is
   open; close with ×. A small live demo window the member can drag.
4. **Your desktop.** Right-click to make folders and shortcuts; your teams sit
   on the right; the Teams folder has every team.
5. **Today.** Points at the handle on the right edge.
6. **How it looks.** The theme picker, "Bigger text" and "Effects off" (Part
   2), with a live preview.
7. **Done.** "You can open this again from the Start menu (Welcome)."

### Rules

- Shown once per member, the first time they reach a desktop in `full`
  mode. Not on the restricted (pending) desktop and never over a blocking
  form (the held desktop). A pending applicant who is approved gets it on
  their first full desktop.
- "Seen" is stored on the server with the member's desktop preferences, so it
  does not reappear on a new device. "Skip for now" counts as seen.
- Reopened from the Start menu ("Welcome") at any time.
- Plain words only; no file names. Keyboard: focus moves into the panel, Esc
  closes it (counts as seen), focus returns to the desktop. Screen readers
  hear each step's heading.
- Reduced motion: no slide, no demo animation.
- It is not a gate: it never blocks a page, and the server does not redirect
  to it. It is not a `required_actions` row.

## Part 2: system themes

### What a theme is

A named set of values for the `--os-*` variables (the desktop chrome) and the
console's content tokens (inside windows). Every colour in the shell already
comes from those variables, so a theme is data, not new components. Themes
never change layout.

### The themes

- **404 Night** (default): the approved look. Loud chrome (magenta, CRT,
  glitch wordmark), softer colours inside program windows (owner: the softer
  program colours "felt a bit less overwhelming").
- **Calm:** the softer palette everywhere, chrome included; no glow, no
  scanbeam.
- **High contrast:** for poor vision. Text and borders at WCAG AAA where
  practical, thicker focus rings, no scanlines, noise, glow or glitch (they
  lower contrast), solid backgrounds.
- **Colour-blind safe:** a palette whose pairs stay distinct under
  protanopia, deuteranopia and tritanopia (magenta/blue pairs replaced where
  they carry meaning).

### Two switches beside the theme

- **Bigger text:** raises the base size (and the pixel font's minimum) one
  step.
- **Effects off:** turns off the CRT surface, glitch, boot sequence, window
  power-on animation, peeking cat and paw prints, whatever the device's
  reduced-motion setting says. The cats stay, still.

### One preference, beside the themes

- **Open with one click:** icons open on a single click (selection then uses
  Ctrl/Shift or the box). Default off on a desktop; the phone always opens with
  one tap.

### Rules that apply to every theme, now

These do not wait for themes; the refactor must already meet them:

- Nothing carries meaning by colour alone: every status chip, badge and
  warning also has a word or an icon.
- Small text meets WCAG AA (4.5:1) on its background, including text on the
  magenta title bar and chips.
- The pixel font is for short labels only (titles, icon names, buttons),
  never paragraphs or form fields.
- Focus is always visible.

### Storage

- A per-member preferences value on the server, next to the desktop layout
  (`desktop_layouts`, migration `0063`), e.g. `{theme, biggerText,
  effectsOff, oneClickOpen, welcomeSeenAt}`, Zod-checked on write and read (a
  bad value means the defaults). One drizzle-kit migration, add-only; erasure
  deletes it with the layout; a test-store twin.
- Applied on the server's first paint (a `data-os-theme` attribute and the
  switches on the desktop root), so there is no flash of the default theme.
- The signed-out landing page, Join and the sign-in pages are not themed.

### Picking one

- In the welcome wizard (step 6), and in My account under a new "Display"
  section (plain words). A live preview, and the change applies at once.

## Checks

- Unit: the Zod schema; defaults on a bad value; every theme defines every
  variable (a drift test over the token list).
- Contrast: an automated check of each theme's text/background pairs against
  AA (AAA where the theme promises it).
- Colour vision: Playwright screenshots of the main screens under Chrome's
  emulated vision deficiencies (CDP `Emulation.setEmulatedVisionDeficiency`:
  protanopia, deuteranopia, tritanopia, achromatopsia, blurred vision), sent
  to the owner.
- E2E: the wizard shows once for a new member, not for a pending or held
  member, is skipped and reopened from Start; a theme choice survives a
  reload and a new browser context (server storage); "Effects off" removes the
  CRT layers from the DOM; "Open with one click" opens on a single click.
- Performance: idle CPU per theme (High contrast and Effects off should be
  lower than 404 Night).

## Open questions for the owner

- Which themes ship first: all four, or 404 Night, Calm and High contrast,
  with Colour-blind safe after the colour-vision screenshots?
- Should the wizard also show once to members who already used the desktop
  before it shipped? Recommended: yes, once.
- The wizard's tone: plain and short (recommended), or playful with Jinn as a
  guide (a hidden cat would then be labelled, which breaks the easter-egg
  rule, so Jinn could appear unnamed).
