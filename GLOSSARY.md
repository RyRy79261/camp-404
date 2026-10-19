# Glossary

Words the code uses with one meaning. Keep each entry short.

**Actor.** Who is acting: their rung on the ladder (`camp_member`,
`team_lead`, `captain`) and the teams they lead this year. A write reads and
locks the actor inside its own transaction (`lockActor`,
`packages/db/src/actor.ts`), so a demotion that committed first is seen and
one that comes later waits; it never takes an actor, or a list of teams, from
its caller. A screen's gate hands back the same shape to answer the screen
(`gate.actor`). A captain's led teams are not read: no rule asks them.
`packages/core/src/actor.ts`.

**Rule.** One question about an actor, `allows(actor)`, that fails closed
(no actor, or an unknown rank, is refused). Built from `captainOrLeadOf(team)`
or `CAPTAIN_ONLY`, and named once beside its domain (`MONEY_KEEPER`,
`POWER_EDITOR`, `KITCHEN_REVIEWER`, ...). Change a rule in its constant,
never at a call site.

**Program definition.** One 404 OS program as every browser may know it: its
plain title, generic file name, routes, line drawing and window size, in
`PROGRAM_DEFINITIONS` (`apps/web/lib/program-routes.ts`). Never who may open
it: that is its registry entry's gate (`PROGRAM_REGISTRY`,
`apps/web/lib/programs.ts`, server-only).

**Desktop controller.** The 404 OS desktop's window and routing policy as
plain data (`apps/web/components/os/desktop-controller.ts`): `decide(state,
event, context)` answers an event (open a program, close, minimise, Home,
Show desktop, a taskbar press, a phone's Back) with an ordered list of
effects (`push`, `replace`, `refresh`, a window change through
`reduceWindows`) that the shell (`desktop-shell.tsx`) runs. No React, no DOM,
nothing from `next/*`; the shell keeps drawing, refs and the DOM.

**Twin.** The E2E test store's stand-in for a domain's database functions.
A domain's facade picks between the two once, with `twin(real, store, keys)`
(`apps/web/lib/twin.ts`): each named function asks `usesTestStore()` when it
is called. The store only stores; a rule both sides apply is one function in
`packages/core`.

**Agreement suite.** A test that runs one scenario through a domain's facade
twice, on real Postgres (PGlite) and on the test store, with the same people
seeded both ways (`apps/web/lib/__tests__/_agreement.ts`), and requires the
same answers and refusals once ids and clocks are taken out. One per twinned
domain: `apps/web/lib/__tests__/<domain>-agreement.test.ts`.

**Table lifecycle.** What happens to a table's rows when the camp names its
founding year and when a member is erased, declared once per table in
`TABLE_LIFECYCLE` (`packages/db/src/table-lifecycle.ts`). `year` is `"none"`,
`"as-is"` (one plain UPDATE in `setFoundingYear`) or `byHand(how)`.
`erasure`, per column that references a member, is `del` (the delete loop in
`sanitiseAccount`), `scrub(step)` (a named hand step, `SCRUB_STEPS` in
`account.ts`), `keep(reason)`, `cascade(from)` or `undecided` (waiting on the
owner). The founding lists and the year-scoped list are derived from it, and
`table-lifecycle.test.ts` fails on a member column with no decision.

**Audit event.** One `audit_log` row: an action (`AuditAction`, labelled in
`AUDIT_ACTION_LABELS`), who did it, what it was about, and metadata whose shape
is `AuditEvents[action]` (`packages/core/src/audit-events.ts`). Written through
`writeAuditEvent` (or `appendAuditEvent(s)`) in `packages/db/src/audit.ts`; the
year rollover (`setFoundingYear`, `advanceCycle`) inserts its two rows
directly, checked with `satisfies`;
worded for a captain by `auditDetail`, which reads a stored row's keys by that
shape and checks each value, because an old row keeps the JSON it was written
with.
