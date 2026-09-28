# Logistics calendar (#247): on top of the camp's Google Calendar

Status: first slice built as `feat/logistics` (committed locally, waiting to
be pushed: it has a migration). The rest is a proposal.

[CORRECTION 2026-09-28] The first version of this doc proposed moving the
camp calendar off Google and into the app. The owner ruled on 2026-09-28:
"the outside app only applies to not using google sheets or forms. We still
need the calendar and the telegram." **The camp calendar stays on Google
Calendar.** The app reads it and writes to it; it does not replace it.

## What the code does today (verified 2026-09-28)

- `apps/web/lib/google-calendar.ts` signs in to Google with a service account
  (`GOOGLE_CALENDAR_CLIENT_EMAIL`, `GOOGLE_CALENDAR_PRIVATE_KEY`,
  `GOOGLE_CALENDAR_ID`) and **reads** the shared camp calendar (title, start,
  end, place, team) and **writes** it: captains and team leads add events from
  `/captains/calendar` (NEWEVENT.EXE).
- `packages/db/src/calendar-events.ts` holds the rule for who may add an
  event and the audit row; the event itself lives in Google.
- Readers of the Google feed: `/calendar` (CALENDAR.EXE, with a team filter),
  each team page's "Coming up", Home's "Coming up".
- Naming: `teamEventTitle` in `packages/core/src/calendar-titles.ts` writes
  "Power and Lighting Team - General meeting", and the team key rides along as
  a private property (`camp404Team`), which the app reads first.
- Without the Google settings the pages say "The camp calendar isn't
  connected yet". Under E2E the test store stands in for a connected calendar.

## The shape: the app owns the camp's own dates, Google shows them

Google stays the one calendar people look at, on their phones and in the app.
What the app adds is **structured camp data that writes itself onto that
calendar**: a feature keeps its own table (the dates and whatever belongs to
them), and each row is mirrored to one Google event that the app creates,
updates and deletes. Nobody retypes the logistics spine into Google each year.

The mirror rules (built in the first slice, reusable by later ones):

- **One row, one Google event, forever.** The row holds the Google event id,
  claimed in the same transaction that saves the row, before Google is called.
  Every save sends the whole event under that id (update, or create with that
  id when Google has none), so a re-save, a retry or two editors at once never
  make a second event.
- **Change and delete follow the row.** New dates update the same event;
  clearing the dates deletes it from Google. A later save brings the same
  event back.
- **Google failing never loses the save.** The app's row is the record; the
  page says which rows are not on the calendar yet, and saving again retries.
  No cron.
- **Titles use the convention**: "Transport and Logistics Team - Build", with
  the team key as the private property, so the Transport and Logistics page
  and Home's "Coming up" pick the events up with no new reading code.
- **Not connected** (no Google settings, as in tests): the in-app view works
  and says the dates are only in the app.

## Slice 1 (built): the logistics phases

`/logistics` (LOGISTICS.EXE, in the Camp group and in the Transport and
Logistics team folder). The year's six phases, in order:

| Phase  | Plain words on the page                            |
| ------ | -------------------------------------------------- |
| Pack   | Load the trailer and the truck at the storage unit |
| Travel | Drive to site                                      |
| Build  | Set up camp                                        |
| Burn   | The burn                                           |
| Strike | Take camp down and pack the truck                  |
| Unpack | Unload at the storage unit                         |

Each has a first and last day (whole days in camp time), an optional place
("storage unit", "on site"; never a home address) and a note. Every member
reads it. **A captain or a Transport and Logistics lead** sets the dates
(`canEditLogistics` in `packages/core`, fail-closed), re-checked inside the
write's transaction, audited in the same transaction, compare-and-set on a
version. One table, `logistics_phases` (year, phase, dates, place, note,
Google event id, which version is on Google).

## Next slices (proposal, owner decides)

1. **Attendance on pack, build, strike and unpack**: going / maybe / can't
   per member; the page shows counts and names. Maybe is a real answer. A new
   table keyed by (year, phase, member). _Default: yes, next._
2. **Named logistics events inside a phase** ("Trailer pack at a member's
   home", "Truck pack at the storage unit", "Early crew: flooring and stretch
   tent"): the same mirror rule, one Google event each, titled with the
   Transport and Logistics team.
3. **On-site headcount per day**, from arrival and departure in the on-site
   logistics questionnaire (#235), shown under the phases.
4. **Other features write their own dates the same way**: kitchen prep days
   (#245), my shifts (#248), generator readiness due days (#298, which left
   them off the calendar only because of the old reading of the rule).
5. **AfrikaBurn deadlines** (owner's note on #247): a captain types the
   year's dates once (grant applications, theme-camp registration, DDT sale,
   WAP and vehicle passes, gate dates) with a done / not done tick, and they go
   onto the Google calendar by the same mirror. AfrikaBurn publishes no feed
   we can rely on, and there is no cron to fetch one.
6. **Next year**: "copy last year's phases, shifted to the new burn dates".

## Questions for the owner

1. **Phase titles on Google**: "Transport and Logistics Team - Build" (the
   convention, so they show on that team's page)? The burn is everyone's, so
   the alternative is plain "Build" as whole-camp events.
   _Default (built): the team prefix._
2. **Who sets the dates**: captains and Transport and Logistics leads.
   _Default (built): yes._
3. **Attendance next** (slice 2 above)? _Default: yes._
4. **Phone calendars**: members subscribe to the Google calendar itself, so
   no separate ICS link from the app. _Default: no ICS link._
