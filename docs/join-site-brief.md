# join.camp-404.com — build brief

Handoff notes for building the Camp 404 recruitment site, agreed in chat on
2026-09-25. [CORRECTION 2026-09-25] It is now built: `apps/join`. The owner's
answers below settle the open questions; the copy lives in
`apps/join/lib/content.ts`.

## What it is

A public, signed-out site at **join.camp-404.com** that tells prospective
members what Camp 404 is and sends them to apply. It lives in the monorepo as
its own app, **`apps/join`**, deployed as its own Vercel project. No database,
no sign-in: static content only.

## The reference: dimensional.org/prototype

The owner loves this site's "vintage machine" feel. Studied with a headless
browser on 2026-09-25:

- **A fake operating system, not a scrolling page.** One screen, 100dvh.
  A near-black desktop (`#181919`/`#151515`) with a faint grid texture.
- **Header bar:** pixel-font logo left, small line icons right (docs, GitHub,
  X, Discord).
- **Centre title:** big pixel-font wordmark with a glow, then
  `VERSION 0.0.13 — DEVELOPER ENVIRONMENT` in monospace.
- **Desktop icons** in a two-column grid on the left: thin line-art icons
  (pale cyan, ~64px) with a monospace label on a dark chip beneath.
- **Windows:** clicking an icon opens a window: grey title bar with an
  uppercase monospace title and a `×`, a resize grip bottom-right. Windows
  are draggable, stack (click raises), and cascade with an offset when
  several are open. Some hold looping `.mp4`s captioned like files
  (`NAVIGATION.MOV`), one embeds a live terminal.
- **The form window** ("Early Access") is off-white with a chunky pixel
  heading, an underscore-line `EMAIL:` field and a boxed `APPLY` button. It
  opens by default on load.
- **Footer:** mock-legal small caps ("UNAUTHORIZED … INTERDIMENSIONAL TRANSFER
  IS HIGHLY PROHIBITED") and a `[REBOOT]` link.
- **Fonts:** Roboto Mono, Inconsolata, and a pixel display face ("Arcade
  Normal").
- **Phone:** same desktop, icons behind, the window floats over them.

Copy the interaction model, not their assets or wording.

## Colour and vibe

**Owner, 2026-09-25: "Use the same color scheme and vibes as the rest of the
site."** Not Dimensional's cyan.

[CORRECTION 2026-09-25] The owner picked **the public landing page's glitch
look**. Of three prototype desktops (kept on the local
`prototype/join-desktops` branch) the owner picked the Dimensional-style one.
The two looks were:

- **The public landing page** (`apps/web/app/landing-hero.tsx`): Camp 404's
  own glitch design — deep purple background `oklch(0.15 0.05 295)`, hot
  magenta primary `oklch(0.65 0.27 340)`, blue accent `oklch(0.62 0.18 255)`,
  chromatic-aberration glitch text, blinking cursor, monospace caps. Inter +
  system mono. This is the other public, signed-out page, so it is the likely
  match.
- **The member console** (`packages/ui/src/styles/globals.css`): AfrikaBurn's
  tokens — `#17191b` background, `#f4f0e8` foreground, teal `#2d7696`,
  apricot `#f4b672` — with the `.camp-accent` magenta skin, Montserrat.

Either way, reuse the existing values (import or copy the tokens) rather than
inventing a palette.

## Concept: "404 OS"

The Dimensional idea rewritten as Camp 404's machine, lost in the desert.

- **Boot:** short BIOS-style sequence (`CAMP 404 OS · TANKWA TOWN BUILD 2026 ·
MEMORY CHECK… LOST`) ending in `ERROR 404: YOU ARE HERE`. Skippable
  (any key / click). Shortened under `prefers-reduced-motion`.
- **Desktop icons → windows** (draggable, stacking, closable, resizable):

| Icon           | Content (from the Notion intro page, below)                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `README.TXT`   | Mission, "a place for the lost", the blanket-fort quote. Opens after boot.                                                     |
| `TEAMS/`       | Folder of the 13 teams; each opens its description.                                                                            |
| `GIFTS.EXE`    | Contributions to Tankwa Town: orphanage, vegan breakfast, lounge, MV, art.                                                     |
| `MAP.GPS`      | Plot #43, toilets behind, dune at the back, sound pointed away from sleeping.                                                  |
| `CREW.DB`      | 50 humans + 10 orphans, thirds split, the three captains.                                                                      |
| `SCHEDULE.CAL` | Prep, set-up, Burn, strike, unpack dates; daily shifts.                                                                        |
| `FEE.CALC`     | Pay-what-you-can; a small interactive "budget your Burn" calculator.                                                           |
| `PERKS/`       | Lounge, Kitchen, Sleeping area, what to bring.                                                                                 |
| `TRUCK.LOG`    | Truck + trailers, Transport & Travel team.                                                                                     |
| `TERMINAL`     | A real little shell: `help`, `whoami`, `ls teams`, `cat mission`, `fee`, `apply`, easter eggs (`walk duck`, `sudo coup chef`). |
| `APPLY.EXE`    | Dimensional's "Early Access" window, repurposed: pixel heading, boxed APPLY → the Google Form.                                 |

- **Phone:** dragging is wrong under a thumb. Icons stay a grid; a window
  opens full-screen as a stack you swipe or close through.
- **Accessibility:** every window reachable by keyboard (icons are buttons,
  Esc closes, focus moves into the opened window), real text not images,
  motion respects `prefers-reduced-motion`.

## Build notes

- Next.js (match `apps/web`: Next 16, React 19, Tailwind v4), static export
  — no server features are needed.
- All copy in one typed content module so next year is a one-file edit.
- Add the app to the Turbo pipeline so `pnpm turbo run lint typecheck test
build` covers it. A Playwright smoke test: boot skips, an icon opens its
  window, Esc closes it, APPLY links to the form.
- Apply link: [CORRECTION 2026-09-25] not the Google Form. The owner: "The
  entire point of this codebase is to not use Google Drive or Google Forms."
  APPLY.EXE sends visitors to the main app's sign-up
  (`https://camp-404.com/auth/sign-up`) and says they need an invite code.
- [2026-09-25] The main app's camp settings will later control some of this
  site (owner; how is decided once the site is done). Keep `content.ts` plain
  so each value can become a setting.
- Separate Vercel project, domain `join.camp-404.com`.

## Content (Notion "Intro to Camp 404", fetched 2026-09-25)

Source: https://app.notion.com/p/Intro-to-Camp-404-cda867f2742783e392cf011eaf4ac85d
(public copy: https://vonnie610.notion.site/Intro-to-Camp-404-a334401bf0dc4a9daa958e10e470ce9e).
Re-fetch before launch; it may have changed.

**Mission.** As a theme camp we provide a public space, a public service, a
functional part of Tankwa Town — dedicated infrastructure for the gifting
economy. Camp 404 will always be **a place for the lost**: weary burners who
need a rest, or real emergencies like people having trouble in their camp who
need a place to stay. Our mission is to help people suspend their disbelief
and share our idea of fun. We're a wacky bunch of misfits who love nonsense
and shenanigans: games, tomfoolery, the bizarre and the hilarious. _Camp 404
is not appropriate for children or for adults who don't act like children._

> Camp 404 is the lost clutter of imagination. A place of uncertainty. Where
> are we? What's going on? How did we get here? Why did we get here? It's in
> our blanket fort of opportunity that we embrace the Error Codes of life so
> that we can explore all of our lost expressions and confused intentions. We
> create safety, comfort and acceptance - for everyone and everything.

**How to join.** 1) Complete the Application Form for Camp 404 2026:
https://forms.gle/MWFrCzQzvF3EG7n57 2) Get a response from the Comms & HR
team. 3) If accepted, complete the Registration Form, pay your camp fee and
get onboarded into the team(s) you want to work with.

**How a theme camp works.** Teams conceptualise, organise, build and run a
public space. Every member joins at least one team:
Communications & HR (applications, tickets, messaging, info flow) · Finance
(fees, budgeting, accounts) · Structures (shade, flooring, furniture, sleeping
gear rental) · Safety (first aid, extinguishers, Tankwa Town regs) · Kitchen
(menu/recipes, equipment, shopping & storage, cooking shifts) · Water (clean
and grey water, plumbing, water shifts) · Sanitation & MOOP (cleaning, waste,
MOOP shifts) · Ministry of Vibes (lounge decor and aesthetic) · Ministry of
Memes (NEW — memetic influence in Tankwa Town, onboarding, camp culture) ·
Power, Lighting & Sound (generator & fuel, grid, lights, DJ gear, genie
shifts) · Artworks & Activities (art, lounge activity & DJ schedule, breakfast
vibes) · Mutant Vehicle (build, transport, running, garage) · Transport &
Travel (truck & trailer rental, packing, lifts).
Prep takes MONTHS; the final weeks are the most intense. In the desert
EVERYONE builds and packs up, and EVERYONE does shift work. **You get out what
you put in.** If that's too much, that's okay — you don't have to join a
theme camp to go to AfrikaBurn.

**Contributions to Tankwa Town.** Primary: 1) orphanage for stray Burners in
need of care; 2) daily vegan breakfast (public) and snacks (lounge); 3) lounge
comfort and entertainment — a safe space to rest, relax, connect and have fun.
Secondary: Mutant Vehicle "Now Now Meow Meow" (Kyle & Robyn); artworks &
activities — 2026: Chris is making something big and burnable. Always space
for more activities (slam poetry, carrot readings, How to be a Duck workshops)
and more artworks.

**Where.** Plot #43 in 2025, planning the same block for 2026. A row of
toilets directly behind. Semi-loud area, but the back (sleeping) borders a
sand dune. Not a sound camp; bring earplugs/ANC headphones; the lounge sound
points away from sleeping, with a long distance between.

**The crew.** 50 people with space for 10 orphans: a third new to AfrikaBurn,
a third with at least one Burn, a third seasoned 404ers. Captains 2026:
**Caitlin** — Chief Cat Herder ("Guiding the gifted, you guys know what to do
;)"). **Cloud** — Vice President ("Went from 0 - 100 in T -4s and now probably
knows ALL the things"). **Ryan** — The Original Error Code ("Consistently
entropic, weaponised autism needing an excuse for unicycle powered
productivity").

**Timeline.** ±6 months before: kick-off Nov/Dec. Months before: about one
meeting per team per month; Cape Town craft/storage/hang-out days. Week
before: final shopping, packing the truck (ALL HANDS). On site: 21 April core
crew sets up stretch tents · 22–25 April everyone arrives (no later than
Saturday 25 April 2026) · 26 April ALL HANDS set-up day · 27 April Burn
starts. During Burn: rostered shifts, ideally 3–4 each. After: Sunday prep for
strike · Monday ALL HANDS strike and pack · Tuesday final clear and MOOP
sign-off · Tuesday 5 May ALL HANDS unpack into storage in Cape Town.

**Daily shifts.** Breakfast (~11) & dinner (~5): prep, cook, serve, refill
water, snack table. Kitchen cleaning after each meal: surfaces, dishes,
bins, compost, "walking the duck" (emptying grey water). Ice collection with
the camp card. MOOP — everyone, all the time. Generator (experienced only).
Plus lots of ad hoc tasks. BE PROACTIVE — leave camp better than you found it,
"whether that's fixing some fairy lights, cleaning up a mess or staging a coup
to overthrow the chef".

**What you contribute.** 1) Get involved: join at least one team (a team lead
guides you), help set up and strike, help run camp, do shifts. 2) A camp fee:
pay what you can afford — nothing is okay; more helps subsidise the starving
artists. Spend: shade (R100K), kitchen with 2 vegan meals a day, snacks and
water (R50K), 24/7 power & lights (R10K), decor (R10K), gifts and artworks,
transport & storage (R100K). Finances fully transparent. Paying doesn't make
it appear — you still help build it.
**Camp fee (required): USD 404–1404 recommended. Tent fee (optional): TBC.**
[CORRECTION 2026-09-25] The owner replaced the fixed range: the fee is a
floating scale, shown in rands with a dollar label beside it. Essential ≈ $200,
Reasonable ≈ $350, Ideal ≈ $400 (where most people should land), Perfect World
≈ $800, and a subsidy below Essential for South Africans, students and anyone
short on cash. FEE.CALC draws it as a slider. [CORRECTION 2026-09-25] The owner then set the tiers in rands: R3,500 /
R6,000 / R8,000 / R16,000, with $1 = R16 for the dollar labels (rounded to $5:
≈ $220 / $375 / $500 / $1,000). The rate moves; change `FEE.usdRate` in
`apps/join/lib/content.ts` alone. A camp setting will set it later.

**Perks.** Two vegan meals a day (brunch & "lupper") and snacks; a full
kitchen and braai; sheltered sleeping; a public lounge; a public service to
give; "a dope AF team of absolute nonsense humans".
Lounge: open 24/7 to anyone — hang out, nap, games, activities, mischief,
vegan snacks. Not a sound or party camp: downtempo, ambient, liquid, groovy
tunes you CAN dance to but don't HAVE TO. Ministry of Vibes makes the space.
Kitchen: stretch tent, two deep freezes, gas stoves, equipment, basics, braai.
Bring your own cutlery/bowl/plate/cup (cups with handles), cooler box, coffee
gear, alcohol, personal snacks. Vegan kitchen; animal products allowed only on
your own equipment or the fire, sealed properly in the freezers.
Sleeping: a 20×30 m stretch tent over the camping area. Bring your own tent
(or rent through 404), mattress, blankets (hot & cold), pillow (or rent),
shade cloth or ground sheet to share, a doormat blanket, a tent light.

**Transport.** A truck carries the container (infrastructure, furniture,
freezers, gas, decor); 2 trailers carry food, bikes, and rubbish home. The
Transport & Travel team makes sure everyone and everything has a ride.

## Owner's corrections, 2026-09-25 (round 3)

- MAP.GPS: "We're on the 3ish/4ish block, on Street A." The dune and the toilets
  behind are still from the 2025 plot (#43); confirm them.
- TRUCK.LOG: one big truck, no trailers of its own; the trailers are towed by
  members' own cars.
- CREW.DB: "This year's captains" only, never a list of every member. Below it,
  a capacity bar (0 to 50, minimum 30 marked; accepted, said yes and waiting,
  maybe) that will come from the app's
  "Coming this year?" answers (`camp_participations` for the current year),
  counts only. `CREW.headcount` is null until the main app feeds it; how is
  decided with the camp settings.
- TEAMS/: pixel-art glitch icons in a folder, not a list. Vibes is a cat.
- GIFTS.EXE: icons in animated progress rings, primary gifts in the top row.
  Secondary: Now Now Meow Meow (drawn from a photo), the Dance of 1000 Flames
  (AfrikaBurn's raised-arms figure without its roots, ringed by flame emojis),
  the main fire performance, which Camp 404 manages and coordinates;
  artworks and activities.
- Windows minimise, go full screen and resize from any edge. A taskbar along
  the bottom has a Start menu, a button per open window, and a countdown to
  AfrikaBurn 2027 (26 April – 2 May, owner) in place of a clock.
- A secret (owner, 2026-09-25): typing `jinn-is-best` in TERMINAL opens
  INKBLOT.EXE, a side-scroller where a black cat jumps onto furniture and
  knocks everything off. It is on no desktop, menu or `help` list. The rules
  are in `apps/join/lib/inkblot.ts`, tested; the drawing is in
  `components/os/windows/inkblot.tsx`.
