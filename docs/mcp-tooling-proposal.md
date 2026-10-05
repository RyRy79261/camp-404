# MCP Tooling Proposal

Status (checked 2026-10-04): built, and since the owner's ruling of 2026-10-04 held to the website's own rules (see "Same access as the website" below). Earlier status (2026-09-29): largely built, in `apps/web/lib/mcp/` and `app/api/mcp/`; the "Status" section near the end says which tools exist. [CORRECTION 2026-09-29] Sign-in is self-hosted Better Auth (#226), not Neon Auth: `@neondatabase/auth` and `apps/web/lib/neon-auth.ts` are gone, and the authorize route reads the session with `getAuthenticatedUser`. Tools are registered in `lib/mcp/server.ts`, not `tools/register.ts`.

> Connector design for letting Camp 404 members open Claude.ai (or any MCP
> client) and chat against their camp data. Scope is full read + write, gated
> per the user's existing in-app permissions plus a per-subject opt-in for
> identification documents.
>
> Companion to the implementation recipe in
> [intake-tracker `docs/mcp-replication-briefing.md`][briefing] — that doc
> covers the OAuth scaffolding gotchas, this doc is the camp-404-specific
> shape on top of it.
>
> [briefing]: https://github.com/RyRy79261/intake-tracker/blob/main/docs/mcp-replication-briefing.md

## Goal

A camp member opens Claude.ai → Settings → Connectors → Add custom connector
→ pastes `https://<camp-host>/api/mcp/mcp`, signs in with the camp's
existing Neon Auth flow, approves a consent screen, and the model now has
read + write tools scoped to what that user can do in the web app.

Non-public project, friends-only, no POPIA-strict wall — but ID documents
(passport / SA ID / EFT) are gated behind a per-user opt-in.

## Same access as the website (owner, 2026-10-04)

The connector acts as the signed-in person with exactly their access on the
website, never more, and takes data out the way the website does.

- **One list of who may call what.** `apps/web/lib/mcp/capabilities.ts`
  (`TOOL_CAPABILITIES`) gives every tool an area, a gate and a one-line
  summary. A gate is the website's predicate on the caller's rung
  (`scope.viewerRank`, from `deriveViewerRank`: member < team lead < captain,
  team lead global) and led teams (`canManageMoney`, `canEditTransport`, …).
  `runTool` refuses a call its gate does not allow, in the gate's sentence;
  `withCapabilities` (lib/mcp/server.ts) refuses to register a tool with no
  entry and starts each description with `Who: …`; `what_can_i_do` answers
  from the same entries. Finer rules (whose claim, which car, which chapter)
  stay in the database writes, which re-read the actor in their transaction.
- **Explainer.** The server's `instructions` (`SERVER_INSTRUCTIONS`, returned
  at initialize) say what the camp is, the ladder, the privacy and money
  rules, that some things are website-only and why, and to call
  `what_can_i_do` first. `what_can_i_do` returns the person's rank, the teams
  they lead, area by area the tools they may call, and what they may do only
  on the website, with the page's full address (`WEBSITE_ONLY`).
- **Listing.** Every tool is listed to everyone, its description saying who may
  use it; a client reads the list once per connection, so a list hidden per
  person would go stale when someone is made a lead or a captain, and a hidden
  tool cannot explain a refusal.
- **Website-only** (never tools): approving or rejecting members, promotions,
  rank; sends to many (announcements, questionnaire send / publish / close /
  remind, car messages); moving money (payments, charges, refunds, settle-up,
  fee tiers, gear-rental charging, marking claims paid or reconciled, team
  budgets); sending recipes to Claude; the guide's public sections and
  members-only marks; deletes, archives, year rollover, camp settings; making
  invite codes; uploads.
- **The website's save paths** (2026-10-05). `update_my_burner_profile` is
  My forms' save: the patch is laid over the stored answers, the whole
  profile is checked as the website checks a re-submit, and it saves at the
  questionnaire's own version with its change-log row, as a compare-and-set
  on the profile it read. It changes only a finished profile (finishing it is
  the website's onboarding), never the ID number or its type, and never the
  photo. `update_my_emergency_contacts` takes the website's contact rules
  (`EmergencyContact` in `@camp404/types`).
- **The connector's log** (`mcp_audit_log`) keeps which tool, when, whether
  it worked, and arguments reduced by each tool (counts or field names, not
  values). A failure keeps our own refusal's sentence, or only the error's
  class and Postgres code (`auditErrorText`), never a raw message, which for a
  failed query holds the values being saved. Erasure clears a member's
  arguments and error text and keeps the rest of the row.
- **Registration** (`/api/mcp/oauth/register`, open to anyone by RFC 7591)
  is bounded: a 16 KB body, at most 10 redirect URIs of 512 characters
  (allow-listed hosts, no fragment, no user name or password), only our scope;
  20 attempts a minute and 50 a day per address and 500 stored a day
  camp-wide; and the daily upkeep deletes a client nobody authorized after a
  day. The consent screen says the token acts as the person, writes included,
  and names the areas their rank reaches.
- **Taking data out.** `list_users` lists whom the roster lists (no declined
  sign-up for a non-captain) with no safety data and no ID or bank numbers for
  anyone. `get_user` is the member panel: a team lead or captain also gets
  emergency contacts, each read of someone else's recorded after the
  response.
- **No ID numbers or bank details, for anyone** (owner, 2026-10-05: "The
  agents won't need any access to that kind of information."). No tool reads
  or writes an ALWAYS_PRIVATE value (`packages/core/src/privacy.ts`): ID /
  passport numbers and bank or account details, the person's own included.
  `update_my_burner_profile` refuses an `id.number` answer, and the claim read
  behind `list_reimbursements` does not select the account at all. They are on
  the website's audited pages for those who may see them; `what_can_i_do`
  links there. `no-private-fields.test.ts` calls every tool, as a captain and
  as the data's owner, and fails if any answer carries one.

## Auth foundation

camp-404 uses **Neon Auth (Better Auth)** via `@neondatabase/auth` —
server instance in `apps/web/lib/neon-auth.ts`, catch-all handler at
`/api/auth/[...path]`, auth UI at `/auth/[path]` (sign-in, sign-up,
forgot-password, callback, …), and `auth.middleware()` installed in
`apps/web/proxy.ts` to run the OAuth verifier-to-cookie exchange on
return trips. Server-side sessions are read with `await auth.getSession()`.

That matches the briefing's Phase A verbatim. Phase B applies as
written: DCR + PKCE, `MCP_PUBLIC_URL` / `x-forwarded-host` precedence,
HTML redirect on consent POST (CSP `form-action`), `Cache-Control:
no-store` on token responses, transactional refresh rotation, doubled
`/api/mcp/mcp` URL, allow-listed redirect URIs to `claude.ai` /
`anthropic.com`.

The intake-tracker briefing's gotcha #1 (verifier exchange must run
inside the middleware) is real and already handled by `proxy.ts`; don't
remove that file or the OAuth round-trip breaks.

## Schema additions

Four OAuth tables (per the briefing) plus one consent column on `users`,
added to `packages/db/src/schema.ts` and committed with a generated
migration:

```ts
// users — additions
aiDataConsent: boolean("ai_data_consent").notNull().default(false),
aiDataConsentAt: timestamp("ai_data_consent_at", { mode: "date" }),

// new tables — server-only, no client sync
mcpOauthClients   // DCR-registered MCP installs
mcpAuthCodes      // single-use authorization codes
mcpAccessTokens   // SHA-256 hashes of access + refresh tokens
mcpAuditLog       // per-tool-call audit trail
```

All tokens stored as SHA-256 hashes. FKs to `users(id)` with `ON DELETE
CASCADE` so deleting a camp user (or sanitising to a Lost Cat) nukes their
tokens.

## Permission model

A single resolver, called fresh on every tool invocation — no caps cached
on the token:

```ts
// apps/web/lib/mcp/scope.ts
type McpScope = {
  campUserId: string;
  rank: "captain" | "member";
  leadTeams: Team[]; // team_memberships where is_lead
  memberTeams: Team[]; // team_memberships
  isDriver: boolean; // driver_profiles.intends_to_drive
  isCaptain: boolean; // rank === "captain"
};
```

[CORRECTION 2026-10-04] `McpScope` also carries `viewerRank`, and there are no
per-team "tiers": the rung is the website's global ladder (a lead of any team
is a team lead everywhere), and what a lead may do with a given team is the
website's own predicate (`canManageMoney`, `canEditGuideChapter`,
`canApproveClaim`, …). The per-team helpers that once lived in `scope.ts`
(`canReadTeamOps`, `canWriteTeam`, `canApproveCrossTeam`, `canAdmin`) are gone.

Three tiers (original proposal):

| Tier          | Scope                                                                 |
| ------------- | --------------------------------------------------------------------- |
| **member**    | self + camp-directory + team data + camp-wide ops; no others' ID docs |
| **team lead** | + write access scoped to teams in `leadTeams` + all dietary (safety)  |
| **captain**   | full read + write across the schema                                   |

## Consent gate (ID documents only)

[CORRECTION 2026-10-05] Superseded: the connector returns no ID numbers or
bank details to anyone (see "Same access as the website"), so the consent flag
gates nothing and its tools (`get_my_ai_consent`, `set_my_ai_consent`) and
`lib/mcp/consent.ts` are gone. The `users.ai_data_consent` columns are dead
(only erasure still clears them); dropping them is left for a later PR. The
section below is the original design.

`users.aiDataConsent` is opt-out by default. It gates **only** these fields
when the subject is not the caller:

- `users.passport_encrypted`
- `users.sa_id_encrypted`
- `users.eft_details_encrypted`
- `reimbursements.account_details_encrypted` (decrypted view of others')

Without consent: walled — not returned to anyone via MCP.
With consent: captain-only, decrypted at the boundary using the same
`pgcrypto` helper the route handlers use.

Self always sees own data including encrypted fields, regardless of the
flag.

[CORRECTION 2026-10-04] Nobody else's `eft_details` (bank details on the member
row) is returned at all: the website shows them to no one. A captain reads an
ID number only with `get_member_id_number` (one member, recorded first), and
the Finance team a claim's bank details only with `get_claim_bank_details`;
both still need the subject's consent. The flag has no website screen (only
`set_my_ai_consent` sets it), so it is kept as the safer extra gate until the
owner decides.

Everything else — phone, email, emergency contacts, dietary, burner
profile, driver/vehicle details, skills, history — is freely visible to
the appropriate tier with no consent gate.

## Tool inventory

≈ 35 tools. R/W = read or write; tier = required scope.

### Identity / self

| Tool                         | R/W | Tier | Notes                                                                                                |
| ---------------------------- | --- | ---- | ---------------------------------------------------------------------------------------------------- |
| `whoami`                     | R   | M    | returns scope + display name + required actions count                                                |
| `list_my_required_actions`   | R   | M    | own pending/blocking rows, and [2026-10-04] the open optional questionnaires (#347), marked optional |
| `what_can_i_do`              | R   | M    | [2026-10-04] rank, led teams, tools by area, website-only actions with links                         |
| `get_my_ai_consent`          | R   | M    | `{ enabled, since }` [CORRECTION 2026-10-05: removed]                                                |
| `set_my_ai_consent(enabled)` | W   | M    | writes flag + timestamp + audit [CORRECTION 2026-10-05: removed]                                     |

### Profile (self only)

| Tool                                                             | R/W | Tier                                                                                                           |
| ---------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------- |
| `get_my_burner_profile` / `update_my_burner_profile`             | R/W | M                                                                                                              |
| `get_my_dietary_requirements` / `update_my_dietary_requirements` | R/W | M — [CORRECTION 2026-10-04] the #245 pick-list (`saveMyDietary`), which the meal plan's allergy check reads    |
| `get_my_driver_profile` / `update_my_driver_profile`             | R/W | M                                                                                                              |
| `get_my_emergency_contacts` / `update_my_emergency_contacts`     | R/W | M                                                                                                              |
| `get_my_id_documents` / `update_my_id_documents`                 | R/W | M — passport / SA ID, decrypted for self [CORRECTION 2026-10-05: removed; no ID numbers through the connector] |

### People

| Tool                                       | R/W | Tier      | Returns                                                                    |
| ------------------------------------------ | --- | --------- | -------------------------------------------------------------------------- |
| `list_users(filter)`                       | R   | M         | directory fields for all + ID docs only for consenting subjects + captain  |
| `get_user(id)`                             | R   | M / L / C | scope determines field set; ID docs require consent + captain              |
| `get_member_id_number(id)`                 | R   | C         | [2026-10-04] one ID number, audited first [CORRECTION 2026-10-05: removed] |
| `set_user_rank` / `assign_team_membership` | W   | C         |                                                                            |

### Teams

| Tool                         | R/W | Tier                                                                 |
| ---------------------------- | --- | -------------------------------------------------------------------- |
| `get_team_budget(team)`      | R   | M (any)                                                              |
| `set_team_budget(team, ...)` | W   | [CORRECTION 2026-10-04] removed: website-only (was lead of team + C) |

[CORRECTION 2026-09-30] `set_team_budget` is for captains and Finance leads
only (#242, owner: one budget per team, set by Finance); a team's own lead
reads it. `get_team_budget` and `list_team_budgets` return each team's
budget, spent, waiting and left, in cents.

### Required actions (admin)

| Tool                            | R/W | Tier             |
| ------------------------------- | --- | ---------------- |
| `list_required_actions(filter)` | R   | L (own team) / C |
| `create_required_action`        | W   | C                |
| `waive_required_action`         | W   | C                |

### Questionnaires

| Tool                                     | R/W | Tier                            |
| ---------------------------------------- | --- | ------------------------------- |
| `list_questionnaire_activations(filter)` | R   | C                               |
| `create_questionnaire_activation`        | W   | C — drafts only, status='draft' |
| `list_activation_targets(activationId)`  | R   | C                               |

**Activation must happen from the app**, not via MCP. The MCP layer can
draft the row; flipping it to `open` (which fans out the
`required_actions` rows that block members) is a deliberate human-in-loop
action that runs through the captain's web UI.

### Recipes

| Tool                                | R/W | Tier                                 | Notes                                                                                                       |
| ----------------------------------- | --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `submit_recipe(source, payload)`    | W   | M                                    |                                                                                                             |
| `list_recipes(filter)`              | R   | M (recipes with an accepted version) | [CORRECTION 2026-09-24] #243 replaced the ready/scheduled statuses; the tool now lists the recipe book only |
| `schedule_recipe` / `reject_recipe` | W   | kitchen L + C                        |                                                                                                             |

### Documents

| Tool                                                       | R/W | Tier                                    |
| ---------------------------------------------------------- | --- | --------------------------------------- |
| `list_documents(filter)` / `get_document(slug)`            | R   | M (published); author/team L/C (drafts) |
| `create_document` / `update_document` / `publish_document` | W   | author OR team L of doc's team OR C     |

[CORRECTION 2026-10-04] `create_document` takes only the guide's topics and
can start a duty card, validated as the editor validates it;
`publish_document` publishes only the version the writer read
(`expectedVersion`); a chapter in a public section also goes on
survival-guide.camp-404.com, with members-only parts kept in the app.

### Reimbursements

| Tool                                             | R/W | Tier                                        | Notes                                                                  |
| ------------------------------------------------ | --- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `submit_reimbursement(...)`                      | W   | M                                           | accepts plaintext account details, encrypts at boundary                |
| `list_my_reimbursements`                         | R   | M                                           | own, decrypted                                                         |
| `list_reimbursements(filter)`                    | R   | L (own team, redacted) / C (all, decrypted) |                                                                        |
| `approve_reimbursement` / `reject_reimbursement` | W   | team L of claim's team OR C                 | per existing routing                                                   |
| `mark_paid` / `mark_reconciled`                  | W   | C                                           | [CORRECTION 2026-10-04] removed: website-only                          |
| `get_claim_bank_details(claimId)`                | R   | captain or Finance lead                     | [2026-10-04] one claim's bank details [CORRECTION 2026-10-05: removed] |

[CORRECTION 2026-09-30] The claim tools as built (#242):
`submit_reimbursement` was removed, because a claim needs private receipt
files, so it is made in the app (My claims) only. `list_my_reimbursements`
returns the member's claims without bank details. `list_reimbursements` gives
a team lead their teams' claims, and captains and Finance leads every claim;
another member's bank details come back decrypted only to captains and
Finance leads, and only when that member's AI data consent is on. The paying
tools are `mark_reimbursement_paid` and `mark_reimbursement_reconciled`, for
captains and Finance leads. [CORRECTION 2026-10-04] Both are removed, and so
is `set_team_budget`: moving money is website-only. `list_reimbursements`
returns no bank details to anyone.

### Broadcasts / inbox (read-only)

| Tool                         | R/W | Tier | Notes                              |
| ---------------------------- | --- | ---- | ---------------------------------- |
| `list_my_inbox(unreadOnly?)` | R   | M    | `notification_deliveries` for self |
| `mark_notification_read(id)` | W   | M    | flips own delivery row's `readAt`  |
| `list_broadcasts(filter)`    | R   | C    | read history of sent announcements |

**No write tools for broadcasts.** Camp-wide notifications are an
explicit human-in-loop action — every broadcast that reaches phones
gets composed and sent from the captain's web UI, never by an MCP
agent. The `broadcasts` table is read-only via MCP.

### Tasks

| Tool                                            | R/W | Tier                            |
| ----------------------------------------------- | --- | ------------------------------- |
| `list_tasks(filter)`                            | R   | M (own + team) / L / C          |
| `create_task` / `update_task` / `complete_task` | W   | assignee / creator / team L / C |

### Workshops

| Tool                                                      | R/W | Tier     |
| --------------------------------------------------------- | --- | -------- |
| `list_workshops` / `get_workshop(id)`                     | R   | M        |
| `rsvp_workshop(id)` / `cancel_rsvp(id)`                   | W   | M        |
| `list_workshop_rsvps(id)`                                 | R   | host + C |
| `create_workshop` / `update_workshop` / `cancel_workshop` | W   | host + C |

### Inventory

| Tool                                                           | R/W | Tier                                   |
| -------------------------------------------------------------- | --- | -------------------------------------- |
| `list_inventory_items(filter)` / `get_inventory_item(id)`      | R   | M                                      |
| `propose_inventory_update(itemId?, payload)`                   | W   | M                                      |
| `list_inventory_updates(filter)`                               | R   | M (own + approved); L/C (all)          |
| `approve_inventory_update(id)` / `reject_inventory_update(id)` | W   | any L + C (schema confirms cross-team) |

### Drivers / lifts

| Tool                                   | R/W | Tier                                                           |
| -------------------------------------- | --- | -------------------------------------------------------------- |
| `list_drivers(filter)`                 | R   | M                                                              |
| `get_driver_profile(userId)`           | R   | self (full) + C (full) + M (vehicle / seats / lift offer only) |
| `list_car_members(driverUserId)`       | R   | M                                                              |
| `add_car_member` / `remove_car_member` | W   | driver of own car + C                                          |

[CORRECTION 2026-10-04] As built, on the Transport page's rules
(`@camp404/db/transport`): `list_drivers` (every member: the cars as the page
shows them), `list_car_riders`, `get_my_lift`, `add_car_rider` (the car's
driver, a captain or a Transport & Logistics lead; refuses a second seat, a
driver as a rider and a full car) and `remove_car_rider` (the same, and a rider
may leave). `update_my_driver_profile` never sets seats below the riders
already in. The old `@camp404/db/cars` seat functions are gone; that module
only answers "my lift".

### Admin / audit

| Tool                                                              | R/W | Tier |
| ----------------------------------------------------------------- | --- | ---- |
| `list_invite_codes` / `create_invite_code` / `revoke_invite_code` | R/W | C    |
| `list_audit_log(filter)`                                          | R   | C    |

### Search

| Tool                | R/W | Tier                                                             |
| ------------------- | --- | ---------------------------------------------------------------- |
| `search(q, types?)` | R   | scoped to caller's view across people / docs / tasks / inventory |

## Cross-cutting rules

- **Shared code path.** Every MCP write calls the same `@camp404/db`
  helper (or shared `apps/web/lib/*` function) the route handlers and
  server actions use. Where no helper exists yet, lift the logic out of
  the route file into a callable function rather than re-implementing
  business rules in the MCP layer.
- **Audit.** Every tool call writes one `mcp_audit_log` row (token id,
  camp user id, tool name, arg digest, outcome). Writes also append to
  the existing `audit_log` with `actor_id = camp user id`.
- **Encryption boundary unchanged.** Writes that touch encrypted columns
  accept plaintext on the wire and call the existing `pgcrypto` encrypt
  helper. Reads decrypt at the boundary only when the consent + tier gate
  passes.
- **Row caps + range limits.** 5k row cap on list responses with a
  `truncated: true` flag; date ranges capped to 1 year; same Zod
  validation patterns the briefing recommends.
- **No client-side caps caching.** `getMcpScope()` runs on every call so
  a rank change or new team membership takes effect immediately.

## Layout

```
apps/web/
  app/api/mcp/
    [transport]/route.ts              # MCP endpoint, withMcpAuth
    well-known/
      oauth-authorization-server/route.ts
      oauth-protected-resource/route.ts
    oauth/
      register/route.ts               # DCR
      authorize/route.ts              # GET consent + POST approve (HTML redirect)
      token/route.ts                  # authorization_code + refresh_token grants
  lib/mcp/
    scope.ts                          # getMcpScope(campUserId)
    consent.ts                        # aiDataConsent gate helpers
    origin.ts                         # getPublicOrigin priority chain
    oauth.ts                          # DCR, code consume, refresh rotation
    tokens.ts                         # opaque token + PKCE verify
    tools/
      identity.ts                     # whoami, required actions, consent
      profile.ts                      # self profile reads + writes
      people.ts                       # users / teams
      ...                             # one file per domain group
    register.ts                       # collects all tool definitions
packages/db/src/schema.ts             # + 4 OAuth tables, + 2 user columns
next.config.js                        # + .well-known rewrites
```

## Phasing

Order: **smoke-test first, then camp member, then captains.**

1. Schema: `aiDataConsent` column + 4 OAuth tables + migration.
2. `getMcpScope` + `consent` helpers + unit tests.
3. OAuth scaffolding: well-known, DCR, authorize (Neon Auth session read
   via `auth.getSession()`), token. Verify with `curl` end-to-end.
4. MCP endpoint with `withMcpAuth` + `whoami` only.
5. **Smoke test against Claude.ai end-to-end** — paste the URL into the
   custom connector dialog, sign in, approve, call `whoami` in a chat.
   Only after this passes do we expand the tool surface.
6. **Member-tier tools.** Identity, self-profile, directory reads,
   recipe submission, document reads, reimbursement submission +
   list-my, team-budget reads. Inbox reads + read-only broadcast list.
7. **Captain-tier tools.** People writes (rank, team membership),
   team budget writes, required-actions admin, questionnaire drafting,
   recipe review, document drafts + publish, reimbursement approval
   flow, tasks, workshops, inventory admin.
8. **Logistics + admin.** Inventory member tools, drivers/lifts,
   invite-code admin, audit log read, search.

Status (2026-09-16): phases 1-6 are built. From phases 7-8, `apps/web/lib/mcp/tools/admin.ts`
adds `assign_team_membership`, `remove_team_membership`, `set_team_lead` (captain),
`list_invite_codes` / `revoke_invite_code` (captain: every code; anyone else: their own, as in
the app) and `list_audit_log` (captain). `tools/reimbursements.ts` adds `list_reimbursements`,
`approve_reimbursement` / `reject_reimbursement` (captain, or the lead of the claim's team) and
`mark_reimbursement_paid` / `mark_reimbursement_reconciled` (captain); nobody moves their own
claim. `tools/teams.ts` adds `set_team_budget` (captain or the team's lead); budgets are per year
since migration 0034. `tools/documents.ts` adds `list_document_drafts`, `get_document_draft`,
`create_document`, `update_document` (on the version read) and `publish_document`: a captain for
any document, a team lead for their team's; members still read published documents only. Recipe
review lives in the app, not the connector: [CORRECTION 2026-09-24] since #243 `submit_recipe` lands a
recipe as `suggested` for a Kitchen lead or a captain to approve. [CORRECTION 2026-09-24] A captain or a Kitchen lead sends one to be proofread (the
owner's decision 2A). [CORRECTION 2026-09-24] `submit_recipe` takes the recipe's `text`
(a link alone is refused, because the server never opens links; `title` and `link` are optional), and
`list_recipes` returns each recipe's `plates` and the plate counts it is ready for (`readyPlates`). `tools/questionnaires.ts` adds `list_questionnaire_drafts`,
`get_questionnaire_draft`, `create_questionnaire_draft` and `update_questionnaire_draft` for
authors (captain, or team lead for their own), with the builder's edit rule and size limits;
publishing and sending stay in the app. `tools/lifts.ts` adds `list_drivers` (captain: driver details are captain-read in the
field-access list), `list_car_riders`, `add_car_rider` and `remove_car_rider` (a driver for their
own car, a captain for any); the seat limit holds under concurrent adds. `set_user_rank` is not built: a rank change is a
two-sided request the member accepts in the app.

Out of scope:

- **Camp-wide broadcasts as a write surface.** Every notification that
  reaches phones is composed and sent from the captain's web UI.
- **Adoptees.** No app feature exists for the orphanage shadow gift
  yet; MCP holds off until the schema has a working bespoke UI.
- **Questionnaire activation (`open` / `close`).** Drafting via MCP is
  fine; activating is a deliberate captain-web action because it
  fans out blocking gates to members.

Tests to port from intake-tracker:
`mcp/tokens.test.ts`, `mcp/oauth-flow.test.ts`, the integration test for
the real Postgres round-trip, and the rotation-race test.

## Profile UI

The opt-in needs one new section on the profile page:

> **Share ID documents with AI / connectors**
>
> When on, camp captains can see your passport, SA ID, and bank details
> through AI assistants and MCP connections. When off, only you can see
> them. Everything else (phone, email, dietary, vehicle) is shared either
> way.
>
> `[ ] Allow camp captains to access my ID documents via AI`
> Last changed: 2026-05-24
