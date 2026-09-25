# join.camp-404.com: read the database, edit it from the app

Owner's go-ahead, 2026-09-25, stacked on PR #283 (the 404 OS site). Decisions:

- **Data:** the join app reads the same Neon database directly through
  `@camp404/db` and renders on its own server (owner: "I can just connect the
  same neon DB and we have the back end for it do the parsing"). It stops being
  a static export. Pages revalidate every 60 seconds, so an edit shows within a
  minute with no deploy and no cron. With no database (CI, a failed query) it
  renders the defaults, which are today's copy.
- **Captains on the site:** opt-in (2A). Every member may write an optional
  "what I am in camp" title and blurb on their profile (owner: "would be nice to
  have somewhere on a profile to have that sorta optional blurb"); a captain
  also ticks "show me on join.camp-404.com".
- **Editors:** captains only (3A).
- **Scope:** text, teams, fee, dates, headcount and captains (4A). Photo uploads
  for INKBLOT.EXE's wall and a shared leaderboard are out.

## Data model

| What                                                                                         | Where                                                                              | Why there                                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Window copy (README, gifts, map, crew text and capacity, schedule, fee, perks, truck, apply) | new `join_site_content` table, one row per burn year, a Zod-typed `content` column | per year, like everything year-scoped; typed per section, not a CMS    |
| Team descriptions                                                                            | `camp_settings.config.teams[].description`                                         | the team list already lives there; the site must not keep a second one |
| Burn dates                                                                                   | `camp_settings.config.cycles[].burnStart / burnEnd`                                | a date of the year, beside its number and name                         |
| Captain cards                                                                                | `users.camp_title`, `users.camp_blurb`, `users.show_on_join`                       | the member's own words, on their own row                               |
| Headcount                                                                                    | counted from `camp_participations` for the current year                            | already recorded by "Coming this year?"                                |

Defaults (`DEFAULT_JOIN_CONTENT`, in `@camp404/types`) are the copy the owner
approved in PR #283. A year with no row reads the defaults, so the editor opens
on that text and nothing changes until a captain saves.

## Rules kept

- Every save is a captain write with an `audit_log` row in the same transaction.
- Money stays in rands (`Currency`); the dollar figure is a label at a typed rate.
- New `users` columns join `MEMBER_FIELD_READERS`; erasure clears them.
- The public read returns counts, never names, and only captains who opted in.
- The editor has a test-store twin so Playwright can drive it.
