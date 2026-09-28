# Logistics calendar (#247): move the camp calendar into the app

Status: proposal, waiting for the owner. Nothing is built.

## The finding (verified in the code, 2026-09-28)

**The camp calendar lives in Google Calendar, not in the app.** That clashes
with the owner's rule of 2026-09-27: "Nothing must be done outside of this
app."

What the code does today:

- `apps/web/lib/google-calendar.ts` signs in to Google with a service account
  (`GOOGLE_CALENDAR_CLIENT_EMAIL`, `GOOGLE_CALENDAR_PRIVATE_KEY`,
  `GOOGLE_CALENDAR_ID`, all in `turbo.json`) and **reads** the shared camp
  calendar: title, start, end, place and team. It also **writes**: captains
  and team leads add events from `/captains/calendar` (NEWEVENT.EXE), and the
  event is created in Google.
- `packages/db/src/calendar-events.ts` says it plainly: "The event lives in
  Google, not in this database; what lives here is the rule for who may add
  one and the audit row that records it." Adding an event calls Google between
  two short transactions, and takes the event off Google again if the audit
  row fails.
- Readers of the Google feed:
  - `/calendar` (CALENDAR.EXE, `apps/web/lib/calendar-view.ts`), with a team
    filter;
  - each team page's "Coming up" (`apps/web/lib/team-page.ts`);
  - Home's "Coming up" (`apps/web/lib/today.ts`);
  - meeting notes link to a Google event id (`meeting_notes.calendar_event_id`).
- Team naming already follows the owner's convention in code:
  `teamEventTitle` in `packages/core/src/calendar-titles.ts` writes
  "Power and Lighting Team - General meeting", and a Google event's team is
  read from that title, a "[Tag]" prefix, or a private property.
- Without the Google settings the calendar shows "The camp calendar isn't
  connected yet": there is **no** calendar at all.
- Tonight's PR #298 (Power) left generator-readiness due days off the calendar
  for exactly this reason: "it is the camp's Google Calendar, outside the app".

## Proposal: the calendar's events live in our database

**One table, `camp_events`** (bespoke, year-scoped):

- title (the bare title, "General meeting");
- team (nullable: null = the whole camp);
- kind: `meeting | pack | unpack | travel | build | strike | prep | deadline | other`;
- start and end, stored as UTC, shown in `CAMP_TIME_ZONE`, all-day allowed;
- place (a named place: "storage unit", "on site"; never a home address);
- all-hands flag, notes;
- author, version (compare-and-set), created and updated.

Its displayed name keeps the owner's convention: `teamEventTitle` builds
"Power Team - General meeting" from team + title, so nobody types the prefix
and it can never be misspelled.

**Attendance** for pack, unpack, build and strike: `going | maybe | can't`
per member (`camp_event_attendance`). The captain sees counts and names.
Maybe is a real answer, not a "?" after a name.

**Who writes:** a captain for anything; a team lead for a team they lead
(the rule already in `calendarEventRefusal`, moved to `packages/core`);
all-hands events captain-only. Every member reads every event. Each write
audited in the same transaction, as today.

**Views:**

- `/calendar`: the whole camp (month or list), filter by team (the filter
  exists), plus a **burn timeline** view from pack to unpack with on-site
  headcount per day.
- Each team's program page: that team's events (`team-page.ts` already asks
  for them).
- Home: "Coming up", unchanged in look.
- Other sources merge in as they are built: my shifts (#248), kitchen prep
  (#245), generator readiness due days (#298), AfrikaBurn deadlines.

**AfrikaBurn's deadlines** (owner's note on #247): a captain types the
year's dates once (kind `deadline`, with a done/not done tick for captains),
and "copy last year, shifted to the new burn dates" reuses them. No fetching
of outside feeds, and no cron.

**Year template:** "copy last year's events, shifted to the new burn dates"
as drafts.

**What happens to Google:**

- **Recommended: remove it.** The read, the write, the three
  `GOOGLE_CALENDAR_*` settings and `/captains/calendar`'s Google path go.
  Events are added in the app.
- **Moving the existing events across:** a captain presses "Bring in the
  Google Calendar's events" once, in the app, while the Google settings still
  exist. It copies upcoming events into `camp_events` (team read from the
  title, as today) and relinks meeting notes to the new events. After that the
  Google code is deleted in the next PR. Nobody runs a command against
  production.
- **Phone calendars:** a private "subscribe" link (ICS) per member would put
  camp events in a member's own phone calendar. It is read-only and shows only
  what the app shows. It is left out of the first version because it is a
  window onto an outside tool; the owner decides.

**Database (when built):** one add-only migration (`camp_events`,
`camp_event_attendance`, a new nullable `meeting_notes.camp_event_id`). The
old `calendar_event_id` stays until a later cleanup.

## Questions for the owner

1. **Move the camp calendar fully into the app** (events stored in our
   database, added and edited in the app)? _Default: yes._
2. **Google Calendar afterwards: removed, or kept as an optional read?**
   _Default: removed, after a one-time in-app "bring in the Google events"
   button. Keeping it means two places to add an event._
3. **Team event names** stay "Power Team - General meeting", built by the app
   from the team and the title, so nobody types the team part?
   _Default: yes._
4. **Phone calendar subscribe link (ICS)**, read-only, per member, revocable?
   _Default: not in the first version._
5. **AfrikaBurn deadlines** typed by a captain once a year (and copied
   forward), rather than pulled from any outside site? _Default: yes._
