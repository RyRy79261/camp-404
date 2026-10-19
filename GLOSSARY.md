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
