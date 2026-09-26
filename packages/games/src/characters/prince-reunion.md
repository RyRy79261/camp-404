# Prince comes home (Cloud's reunion)

Owner, 2026-09-26: Prince, the white cat asleep on the taskbar clock, was
Cloud's cat, and he has died. When Cloud opens the app, Prince is not on the
clock. Cloud walks up above the clock and calls him: "Prince, Prince, Prince
... Prince, where are you?" He sprints in from the left of the screen and
tackles her in a cartoon dust cloud, and when it clears she is sitting on the
clock with him curled up in her lap. It stays that way for the rest of her
session.

It is a memorial, so it is warm and silly, never sad: a happy reunion, a
Looney Tunes dust-up, a heart. Nothing in it says goodbye.

Everyone else sees exactly what they see today: Prince asleep on the clock.

## Who sees it

- Only Cloud. The server decides: `PRINCE_KEEPER_EMAILS` (a comma list,
  trimmed, any case; `apps/web/lib/prince-keeper.ts`) holds her address. The
  console layout compares the signed-in member's **confirmed** email (an
  unconfirmed address never counts: sign-up is open) and hands the desktop one
  boolean, `princeKeeper`. Her address never reaches the browser, and is
  scrubbed from logs (`SECRET_ENV_KEYS`). It is in `turbo.json`'s `globalEnv`.
  Playwright's server lists `prince-keeper@example.com`, a member only
  `os-shell.spec.ts` signs in as.
- For her, Prince is never on the clock, not even for the first second: the
  clock Prince is not rendered at all when the reunion is on.
- It plays **once per browser session**: `sessionStorage[REUNION_SEEN_KEY]` is
  set the moment the scene starts, so a reload or a second visit in the same
  tab goes straight to the two of them sitting together. A new tab, or the app
  opened tomorrow, plays it again (the owner's choice).
- It starts only when she can see it: the tab is visible, the boot screen and
  any blocking form are gone, and nothing covers the clock. If it cannot start
  yet it waits (with Prince absent); it never starts behind a window.

## Where

- **Desktop:** above the taskbar clock. Her anchor is the middle of the clock's
  top edge: every standing frame is placed by the middle of its bottom row on
  that point, so her feet rest on the taskbar's top border. Sitting, she sits
  on the clock's edge in the same place.
- **Phone: yes, the same scene on the bottom bar's clock**, where the phone's
  Prince already sleeps. She may well open the app on her phone first, and a
  scene that only plays on a desktop she rarely opens would never be seen.
  Same frames and scale; the bar is narrower, so the walk in and the sprint
  are shorter but keep their durations. If a program or sheet covers the home
  screen, the scene holds still with the rest of the decoration
  (`data-os-paused`) and carries on when she comes back.
- **Scale: 2x** (whole pixels, crisp), next to today's clock Prince at about
  2.2x. She is 54 px tall standing, Prince 24 px running. 3x reads better but
  crowds the taskbar.

## The beats (`REUNION_BEATS`, 12 s)

| t (s) | beat          | what happens                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.0   | walk-in (2.0) | Cloud walks in from off the right edge of the screen to the anchor, facing left (`walk`, four frames at 160 ms, hair swinging). The one moving thing on screen.                                                                                                                                                                            |
| 2.0   | settle (0.3)  | She stops: `idle`.                                                                                                                                                                                                                                                                                                                         |
| 2.3   | call-1 (0.9)  | Hand to her mouth (`call` 1), bubble "Prince?" over her head. Then `call` 2 (mouth shut, listening) for the last 300 ms.                                                                                                                                                                                                                   |
| 3.2   | look-1 (0.5)  | `look` 1: she looks left. No bubble.                                                                                                                                                                                                                                                                                                       |
| 3.7   | call-2 (0.9)  | "Prince!"                                                                                                                                                                                                                                                                                                                                  |
| 4.6   | look-2 (0.5)  | `look` 2: she looks right.                                                                                                                                                                                                                                                                                                                 |
| 5.1   | call-3 (0.9)  | "Prince…"                                                                                                                                                                                                                                                                                                                                  |
| 6.0   | pause (0.4)   | `idle`: a beat of quiet.                                                                                                                                                                                                                                                                                                                   |
| 6.4   | call-4 (1.5)  | "Prince, where are you?", the longest bubble.                                                                                                                                                                                                                                                                                              |
| 7.9   | sprint (1.2)  | Prince bolts in from off the left edge of the screen along the top of the taskbar (`run`, four frames at 70 ms, tail streaming), fast and cartoonish. She turns to face him (`call` 2, facing left) as he comes.                                                                                                                           |
| 9.1   | leap (0.2)    | A few steps short he leaps (`leap`) in a low arc at her; she flings her arms up (`surprised`).                                                                                                                                                                                                                                             |
| 9.3   | dust (1.5)    | Both vanish into the dust cloud, centred on her anchor: the hit (frame 1), then the brawl, frames 2 and 3 alternating at 110 ms (a white paw, her foot, his black tail, her hand and a tuft of copper hair pop out; stars and twinkles fly off), then two frames of it clearing (`DUST_ORDER`). The cloud may wobble a pixel side to side. |
| 10.8  | heart (1.2)   | The dust is gone: she is sitting on the clock with Prince curled up in her lap (`together` 1, eyes on the desktop). A small pixel heart (`HEART`) rises a few pixels above them and fades.                                                                                                                                                 |
| 12.0  | (rest)        | `together` 2, cheeks pink, content, and it stays for the session. Nothing moves any more.                                                                                                                                                                                                                                                  |

The four calls are `REUNION_CALLS`. The bubble is the clock cat's bubble
(pixel font, `border-os-line`, `bg-os-panel`, uppercase off so "Prince…"
keeps its ellipsis), above her head, one at a time, each gone before the
next.

## Tapping them afterwards

The pair is a toy for the pointer, like the clock Prince: a tap shows the next
line of `REUNION_TAPPED` ("prrr", "♥", "prrrrr", "mrrp", "♥") in the same
bubble, and swaps in `tapped` (his tail tip flicks up) for about 600 ms. That
is the only thing that ever moves again.

## Reduced motion

`prefers-reduced-motion: reduce`: no walk, no calls, no sprint, no dust. The
two of them are simply there, sitting together (`together` 2), from the first
paint. A tap still shows its bubble, held and then gone, with no movement
(cats.css's `cat-bubble-still`).

## A hidden tab, and a covered clock

One `requestAnimationFrame` clock runs the scene (`prince-reunion-scene.tsx`).
It moves the scene's own time on by each frame (at most `MAX_STEP_MS`, so a
late frame never skips a beat), asks the pure timeline what is on screen
(`reunionAt` in `prince-reunion-timeline.ts`) and writes that straight to the
DOM. It takes no frames at all, and the scene holds where it was, while:

- the tab is hidden;
- the desktop is asleep (`inert`: the boot screen, a blocking form) or paused
  (`[data-os-paused]`);
- the desktop says something covers the clock (`covered`: a window reaching
  the clock's corner, the Today panel, a phone program). The taskbar draws
  above windows, so a covered scene also fades out (`opacity-0`) rather than
  stand frozen over a maximised window's corner, and fades back when
  uncovered. The finished pair stays, as the sleeping Prince does;
- this copy of the clock is not on screen (the desktop draws both the
  taskbar's clock and the phone bar's; only the one on screen plays, and the
  other, shown later, goes straight to the ending).

A visibility change, a resize, or the `inert` / `data-os-paused` attributes
changing wake it. At the end it stops for good and React swaps in the one
still picture.

## Screen readers

- The scene's moving layers and the speech bubbles are `aria-hidden`: nothing
  is announced while she is working (a live region calling "Prince?" four
  times would be noise, and would give the secret away to anyone near her).
- The finished pair is one picture with a plain name, `REUNION_LABEL`: "Cloud
  and Prince" (`role="img"`). No hint that there is anything more to it.
- Like the clock Prince, the tap target is out of the Tab order: a pointer toy,
  never a stop.

## Performance (the owner's rules)

- **Drawn once:** every frame of the scene is drawn once, side by side, into
  one PNG (`sprite-atlas.ts`, about 500 x 27 pixels), in the colours the
  desktop computes at the clock (its `var(--os-*)` colours resolved first).
  Each layer (Cloud, Prince, the dust, the heart) is a box showing one cell of
  it: a frame change is a `background-position`, a move is a `transform`, and
  a style is written only when its frame or place changes. The scene is its
  own lazy chunk (`ClockReunion` in `desktop-cats.tsx`), so nobody else
  downloads it.
- **No per-frame React state:** React renders the scene once; the clock
  writes the DOM. The only state changes are "scene over" (one) and a tap.
- **Loops stop when done:** nothing runs after 12 s. The resting pair is one
  box of the same picture.
- **Nothing runs when hidden:** as above.
- **Reduced motion:** the resting picture at once, as above.
- Every moving layer is `pointer-events: none`: nothing in the scene takes a
  click meant for the taskbar, the Start button or a window.

## Where the code lives

- `@camp404/games/characters` (this folder): the human body (`human-frames.ts`,
  `human.ts`), Cloud's look (`cloud.ts`), Prince's run, leap and lap frames
  (`prince.ts`), the dust cloud (`dust.ts`), the pixel tools (`pixels.ts`), and
  this scene's data (`prince-reunion.ts`: `reunionFrames()`, the beats, the
  lines, the heart), exported as `@camp404/games/characters`.
- The scene: `prince-reunion-scene.tsx` (`PrinceReunion`, props `covered`,
  `look`, `scale`, `lines`, `label`), its pure timeline and phases
  (`prince-reunion-timeline.ts`) and the one-picture atlas (`sprite-atlas.ts`).
  `@camp404/os` never imports games.
- `apps/web`: `lib/prince-keeper.ts` (the env var and the email check, on the
  server), the console layout's `princeKeeper`, and the choice between the
  scene and `ClockPrince` in `desktop-shell.tsx` (`clockCat`).

## More of the camp

A person is a `CharacterLook` over the one body: skin, hair (colours, length
short / shoulder / long, style straight / wavy), top (tank or tee), bottoms
(maxi skirt, trousers or shorts, with an optional three-colour print), feet,
and accessories (choker, nose ring, bracelets, an upper-arm tattoo). Poses:
`idle`, `walk` (4), `call` (2), `look` (2), `surprised`, `sit` (2), and
`withLapCat` for any lap cat. A second person (short straight dark hair, a
tee, shorts) is one `CharacterLook` away; `characters.test.ts` builds one.
Known limit: the sitting pose draws the lap as cloth for every kind of
bottoms.
