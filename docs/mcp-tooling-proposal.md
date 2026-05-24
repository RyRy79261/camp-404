# MCP Tooling Proposal

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
  leadTeams: Team[];   // team_memberships where is_lead
  memberTeams: Team[]; // team_memberships
  isDriver: boolean;   // driver_profiles.intends_to_drive
  isCaptain: boolean;  // rank === "captain"
};
```

Three tiers:

| Tier | Scope |
|---|---|
| **member** | self + camp-directory + team data + camp-wide ops; no others' ID docs |
| **team lead** | + write access scoped to teams in `leadTeams` + all dietary (safety) |
| **captain** | full read + write across the schema |

## Consent gate (ID documents only)

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

Everything else — phone, email, emergency contacts, dietary, burner
profile, driver/vehicle details, skills, history — is freely visible to
the appropriate tier with no consent gate.

## Tool inventory

≈ 35 tools. R/W = read or write; tier = required scope.

### Identity / self

| Tool | R/W | Tier | Notes |
|---|---|---|---|
| `whoami` | R | M | returns scope + display name + required actions count |
| `list_my_required_actions` | R | M | own pending/blocking rows |
| `complete_acknowledgement(actionKey)` | W | M | only `type=acknowledgement` |
| `get_my_ai_consent` | R | M | `{ enabled, since }` |
| `set_my_ai_consent(enabled)` | W | M | writes flag + timestamp + audit |

### Profile (self only)

| Tool | R/W | Tier |
|---|---|---|
| `get_my_burner_profile` / `update_my_burner_profile` | R/W | M |
| `get_my_dietary_requirements` / `update_my_dietary_requirements` | R/W | M |
| `get_my_driver_profile` / `update_my_driver_profile` | R/W | M |
| `get_my_emergency_contacts` / `update_my_emergency_contacts` | R/W | M |
| `get_my_id_documents` / `update_my_id_documents` | R/W | M | passport / SA ID, decrypted for self |

### People

| Tool | R/W | Tier | Returns |
|---|---|---|---|
| `list_users(filter)` | R | M | directory fields for all + ID docs only for consenting subjects + captain |
| `get_user(id)` | R | M / L / C | scope determines field set; ID docs require consent + captain |
| `set_user_rank` / `assign_team_membership` | W | C | |

### Teams

| Tool | R/W | Tier |
|---|---|---|
| `get_team_budget(team)` | R | M (any) |
| `set_team_budget(team, ...)` | W | lead of team + C |

### Required actions (admin)

| Tool | R/W | Tier |
|---|---|---|
| `list_required_actions(filter)` | R | L (own team) / C |
| `create_required_action` | W | C |
| `waive_required_action` | W | C |

### Questionnaires

| Tool | R/W | Tier |
|---|---|---|
| `list_questionnaire_activations(filter)` | R | C |
| `create_questionnaire_activation` | W | C |
| `open_activation` / `close_activation` | W | C |
| `list_activation_targets(activationId)` | R | C |

### Recipes

| Tool | R/W | Tier | Notes |
|---|---|---|---|
| `submit_recipe(source, payload)` | W | M | |
| `list_recipes(filter)` | R | M (ready/scheduled); kitchen L + C (all) | |
| `schedule_recipe` / `reject_recipe` | W | kitchen L + C | |

### Documents

| Tool | R/W | Tier |
|---|---|---|
| `list_documents(filter)` / `get_document(slug)` | R | M (published); author/team L/C (drafts) |
| `create_document` / `update_document` / `publish_document` | W | author OR team L of doc's team OR C |

### Reimbursements

| Tool | R/W | Tier | Notes |
|---|---|---|---|
| `submit_reimbursement(...)` | W | M | accepts plaintext account details, encrypts at boundary |
| `list_my_reimbursements` | R | M | own, decrypted |
| `list_reimbursements(filter)` | R | L (own team, redacted) / C (all, decrypted) | |
| `approve_reimbursement` / `reject_reimbursement` | W | team L of claim's team OR C | per existing routing |
| `mark_paid` / `mark_reconciled` | W | C | |

### Broadcasts (draft-only via MCP)

| Tool | R/W | Tier | Notes |
|---|---|---|---|
| `list_my_inbox(unreadOnly?)` | R | M | `notification_deliveries` for self |
| `mark_notification_read(id)` | W | M | |
| `draft_broadcast(kind, scope, ...)` | W | C (any); L (team_message / lead_directive within own team) | writes row with `dispatched_at = NULL`; web app confirms to fan out |
| `list_broadcasts(filter)` | R | C |

### Tasks

| Tool | R/W | Tier |
|---|---|---|
| `list_tasks(filter)` | R | M (own + team) / L / C |
| `create_task` / `update_task` / `complete_task` | W | assignee / creator / team L / C |

### Workshops

| Tool | R/W | Tier |
|---|---|---|
| `list_workshops` / `get_workshop(id)` | R | M |
| `rsvp_workshop(id)` / `cancel_rsvp(id)` | W | M |
| `list_workshop_rsvps(id)` | R | host + C |
| `create_workshop` / `update_workshop` / `cancel_workshop` | W | host + C |

### Adoptees

| Tool | R/W | Tier |
|---|---|---|
| `list_adoptees` / `get_adoptee(id)` | R | sponsor (own) + C |
| `create_adoptee` / `update_adoptee` / `approve_adoptee` | W | C |

### Inventory

| Tool | R/W | Tier |
|---|---|---|
| `list_inventory_items(filter)` / `get_inventory_item(id)` | R | M |
| `propose_inventory_update(itemId?, payload)` | W | M |
| `list_inventory_updates(filter)` | R | M (own + approved); L/C (all) |
| `approve_inventory_update(id)` / `reject_inventory_update(id)` | W | any L + C (schema confirms cross-team) |

### Drivers / lifts

| Tool | R/W | Tier |
|---|---|---|
| `list_drivers(filter)` | R | M |
| `get_driver_profile(userId)` | R | self (full) + C (full) + M (vehicle / seats / lift offer only) |
| `list_car_members(driverUserId)` | R | M |
| `add_car_member` / `remove_car_member` | W | driver of own car + C |

### Admin / audit

| Tool | R/W | Tier |
|---|---|---|
| `list_invite_codes` / `create_invite_code` / `revoke_invite_code` | R/W | C |
| `list_audit_log(filter)` | R | C |

### Search

| Tool | R/W | Tier |
|---|---|---|
| `search(q, types?)` | R | scoped to caller's view across people / docs / tasks / inventory |

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

1. Schema: `aiDataConsent` column + 4 OAuth tables + migration.
2. `getMcpScope` + `consent` helpers + unit tests.
3. OAuth scaffolding: well-known, DCR, authorize (Neon Auth session read
   via `auth.getSession()`), token. Verify with `curl` end-to-end.
4. MCP endpoint with `withMcpAuth` + `whoami` only — connect from
   Claude.ai end-to-end.
5. Identity + profile tools.
6. People + teams + required actions + questionnaires.
7. Recipes + documents + reimbursements.
8. Inbox + draft broadcasts + tasks + workshops + adoptees.
9. Inventory + drivers.
10. Admin + audit + search.

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
