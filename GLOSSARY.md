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

**Fee pledge.** What a member says they can pay toward this year's camp
fee: their own whole-rand amount, when they can pay it (`payBy`) and whether
they need a subsidy, on their `dues_accounts` row (`savePledge`,
`@camp404/db/dues`; `Pledge` in `@camp404/core`). It is not a charge: it
becomes the camp fee when a captain accepts them (or when they pledge once
accepted), through `feeChargeFromPledge`. A subsidy pledge of R0 charges
nothing. Not a gear pledge.

**Gear pledge.** A member's "I'm bringing 2 camping chairs" against a team's
inventory need this year: one `inventory_pledges` row per member per need
(`pledgeToNeed`, `@camp404/db/inventory`). It counts against what is still
needed and has nothing to do with money. Not a fee pledge.

**Member dues.** One member's year of dues as a screen reads it: charges,
payments with their refunds, the fee pledge, the plan, the balance and the
next payment (`MemberDues`). Built once, from plain rows either dues store
fetches, by `memberDues(rows, viewer)` in `packages/core/src/member-dues.ts`;
the Finance team's list line is `duesAccountRow`. The viewer decides the
masking there: on a member's own read the concession (its reason, the
standard amount, the flag) and the ledger and refund notes are null.

**Recipients.** Who a send reaches, and who it leaves out, for ONE year
(`packages/db/src/recipients.ts`). A send names its `Reach`: which members
count (approved, approved or waiting, any) and what their answer to "Coming
this year?" does. `GROUP_SEND` leaves out who said Not coming (Maybe and not
answered still reached); `GROUP_TAG` reaches only who said Coming
(`isComingThisYear`); `DEADLINE_REMINDER` also reaches who waits for
approval; picked by name, whatever they said. Never a system actor or an
erased member. `splitAudience` is the pure half; `sendAudience`,
`reachWhere`, `owingMembers` and `saidNotComing` read it. Every send path asks
here.

**Outbox drain.** How Ol' Jeb sends a Telegram queue at most once
(`drainTelegramOutbox`, `packages/db/src/telegram-outbox.ts`): claim the
oldest rows and commit them `sending` before any send, write each answer
after, fail what waited 20 hours, and end the run at a 429 or three "not now"
answers in a row. A queue (the private notices, the posts in the camp's
chats) supplies only its rows, what it skips and how it sends one. Email and
push have drains of their own.

**Post kind.** One kind of Ol' Jeb post in the camp's chats (`announcement`,
`fee`, `meeting`, `reminder`, `questionnaire`, `lead`), one entry each in
`TELEGRAM_POST_KINDS` (`packages/db/src/telegram-post-kinds.ts`): the Camp
settings tick that switches it off (or none), and what it reads and draws as
it is sent (or nothing: not posted). Every kind is queued by
`queueTelegramPosts`. A new kind is a value in `telegram_post_kind` and one
entry.
