# Shift roster (#248): discovery

Status: proposal, waiting for the owner. Nothing is built.

The owner (2026-09-23): shift sheets are "more like on-site", and "we need to
figure out how we're going to do that". Already decided on #248 (2026-09-24):
**no shift qualifications** (nobody needs a certificate; knowing who can run
the generator is a questionnaire, not a gate), and the **DJ / activity
schedule is not a shift** (it belongs to the Ministry of Vibes; PR #301 built
it as the Lounge program).

## What shifts the camp needs

From #248, epic #235 and tonight's PRs:

| Shift                    | When                                | Who, how many                                                     | Owning team           | Source        |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------------- | --------------------- | ------------- |
| Brunch: prep, then serve | daily                               | head chef ×1, cooks ×3                                            | Kitchen               | #248          |
| Dinner: prep, then serve | daily                               | head chef ×1, cooks ×3                                            | Kitchen               | #248          |
| Cleaning, morning        | daily                               | lead ×1, cleaners ×3 (dishes, surfaces, trash)                    | Sanitation & Water?   | #248          |
| Cleaning, evening        | daily, before dark                  | lead ×1, cleaners ×3 (grey water "walking the duck", burn barrel) | Sanitation & Water?   | #248          |
| Generator watch          | 3 × 8 h a day (00–08, 08–16, 16–24) | 1 each, sometimes shared with a neighbour camp                    | Power & Lighting      | #248, PR #298 |
| Ice run                  | daily                               | 2                                                                 | Transport & Logistics | #248          |
| Water and snacks refill  | daily                               | 1–2                                                               | Kitchen               | #248, #244    |

Not slots:

- **MOOP sweep**: everyone, all the time. A line on the daily sheet, not a
  shift.
- **Pack, unpack, build, strike days**: attendance ("going / maybe / can't"),
  which belongs to the calendar (#247).
- **AfrikaBurn volunteer shifts** (Rangers, Greeters, Sanctuary): not ours to
  fill, but a member enters them so the roster can warn about clashes.

Links to tonight's PRs:

- **PR #298 (Power)** logs refuelling as captains and Power leads only,
  because shifts don't exist. Its recommended follow-up: let whoever is on a
  generator watch log refuelling. The roster should give that answer
  ("is this member on a watch now?").
- **PR #301 (Lounge)** wants clash warnings against a host's own shifts.
- **PR #302 (About)** notes the Notion intro says "one cooking shift and one
  cleaning shift each"; #248 says 3–5 shifts in burn week. These disagree.

## Who assigns

- **Shift types and the week's slots:** a captain, or a lead of the shift's
  team (Kitchen leads for kitchen shifts, Power & Lighting leads for watches).
  One pure rule in `packages/core`, like `canEditPower`.
- **Filling slots:** members sign themselves up. A slot fills by
  compare-and-set against its capacity, so two people cannot take the last
  place. The team's leads and captains can also put someone in or take them
  out.
- A slot can be marked **Not needed**. That replaces the old "XXX", which
  meant both "not needed" and "nobody yet".
- Every count comes from the member's id, never from a typed name.

## How members see theirs

- **My shifts** (Me menu): my shifts in time order, open slots I could take,
  and warnings (two of mine at once, one of my AfrikaBurn shifts, a day I
  said I'm not on site).
- **Home:** "Your next shift" once the burn is close.
- **Fairness view** for leads and captains: shifts per member, members below
  the minimum, open slots per day.
- A reminder before the burn through the existing notices (sent at an action
  or on page load; no cron).

## Paper on the playa

There is no signal on site, and the phone app build is deferred. So paper is
the on-site tool:

- **Daily site sheet** (A4 landscape): the day's shifts with first names
  (surname initial only when two share a name), the meals, the watches, the
  ice run. No phone numbers.
- **Blank grid** per day for the whiteboard, same layout.
- **My shifts card**: pocket size, per member.
- Changes on site are written on the paper. Afterwards, a lead may type the
  real attendance in if the camp wants a fair record; if not, the paper is
  thrown away.

These are print views under `/print/...`, the pattern PR #298 and PR #301
already use (black on white, no desktop, browser print dialog for a PDF).

## Build order

1. Tables: `shift_types`, `shift_slots` (with `open | not_needed`),
   `shift_assignments` (unique slot + member), `external_volunteer_shifts`.
2. Leads set up types and generate the week from the burn dates.
3. My shifts, sign-up, fairness view.
4. Print views.
5. Hand-offs: generator watch → refuel logging (#298); clash warnings in the
   Lounge (#301); shifts on the camp calendar (#247).

## Owner's answers (2026-09-30)

1. **Sign-up:** in the app before the burn, printed for site, changes on site
   on paper.
2. **How many:** a minimum of 3, as a reminder only. It never blocks.
3. **Cleaning shifts:** Sanitation leads and captains set them up; every
   member takes them.
4. **Paper afterwards:** nobody types it back in.
5. **Generator watch logging refuelling: dropped.** [CORRECTION 2026-09-30]
   "How would they log that, there's no internet out there." Nothing in the
   shift roster may need the app during the burn. A paper fuel log was offered
   and also declined. Build-order step 5's hand-off to refuel logging is off.
