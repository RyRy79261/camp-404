# Moda and Nipster

Two more of the camp's real cats (owner, 2026-09-26), besides Jinn (all
black) and Prince (white, asleep on the taskbar clock). An easter egg: they
are named here and in code comments only, never in the UI, never in a label,
tooltip or accessible name.

- **Moda**, an orange tabby with darker stripes, a white blaze, chin and
  chest, a pink nose and her tongue out. Silly: cross-eyed when she sits. She
  is the one who scratches things.
- **Nipster**, a tortoiseshell: black with orange mottling, a white blaze,
  chin, chest and paws. Sassy: she sits with her nose in the air and her
  eyes shut, or gives you a side-eye.

Drawn from the owner's photos in the cats' 16-bit style (`art.ts`): 20 x 17
frames, facing right, feet on the bottom row, one pixel of the OS's muted
outline all round, drawn at 3x as Jinn is. Moda: walk (4), sit, scratch (2),
eat (2), perch. Nipster: walk (4), sit, sassy, eat (2), perch. Two bowls in the
camp's magenta, empty and full.

## The visit (`scene.ts`)

1. A program's window (not a folder) has been open 1.5 minutes: the two
   appear on the desktop under it, sitting, hidden by it.
2. Move the window off them (or close or minimise it): Moda walks to the
   screen's right-hand edge and scratches it (3 s bursts, 7 s rests); Nipster
   walks to the nearest desktop icon no window covers and sits on it, sassy.
   Two bowls appear at the bottom of the screen.
3. Click a bowl: both fill, each cat walks to one and eats (4 s), then each
   walks to the icon nearest her bowl (not the same one) and sits on it. The
   bowls go. Nothing moves again until the page is loaded anew.

Desktop only: a phone has no windows. The cats take no clicks (pointer
events pass through to the icon or window under them); only the bowls do,
and they are hidden from assistive tech and the Tab order, as Prince is.

**Reduced motion:** no walking. They appear where step 2 leaves them (Moda at
the edge, still, paws up; Nipster sitting on her icon), and a feed shows step
3's end at once.

## Feeding: once every six hours, in the browser

`feed-limit.ts`. The owner chose browser-based (2026-09-26, "B"): the time of
the last feed is kept in `localStorage` (`camp404:bowls-filled-at`), not on
the server, so another browser can feed again. Checked when the bowls would
be put out and again at the click (a feed in another tab since then is
refused and the bowls go). **When the limit is active the bowls are not shown
at all** (rather than empty and unclickable): nothing on screen hints at a
feed that cannot happen. A time from the future (the clock put back) is
forgotten; a feed the storage refuses to keep still counts for the rest of the
page, but not after a reload.

## Cost

Before they come, the only thing running is one timeout (for the window that
reaches its 1.5 minutes first; reset when windows open or close). Each cat's
frames are drawn once into one picture (`atlas.ts`), and a pose is shown by
sliding that picture inside a cat-sized box. Walks and frame steps are Web
Animations of transforms, so the compositor runs them and React renders only
when a cat arrives somewhere. A hidden tab pauses the animations and holds the
timers. The layer re-renders only when a program window really moves, opens
or closes (a drag writes the window once, at the drop).

## Tests

`camp-cats.test.ts`: the sprites (same size, rectangular, in the palette,
outlined), the six-hour limit with a fake clock and storage, the 1.5-minute
wait, and the whole story, reduced motion included. `camp-cats.test.tsx`: the
rendered layer with fake timers. `apps/web/tests/e2e/desktop-cats.spec.ts`:
the whole visit in the browser, with the wait cut to 2 s under the E2E
harness (`apps/web/lib/camp-cats.ts`).
