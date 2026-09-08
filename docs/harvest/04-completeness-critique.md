# 20 — Completeness critique

What 76 agents, 24 harvest docs and 892 ledger rows did not look at.

**Headline: the analysis read the donor's *code* thoroughly and its *schema* barely at all.**
`pgTable` appears **zero times in 16 of 24 harvest docs**, and only **5 times in
`13-db-layer-patterns.md`** — the unit that nominally owns the database. A 2045-line
`schema.ts` with 44 tables carrying the longest, most decision-dense comments in the
donor repo was mined for function names, not for tables. Section 2 below is the diff
nobody ran.

I also tested five "nobody covered X" hypotheses that turned out **wrong** — CSV export,
the e2e disposable-inbox harness, the deletion grace period, `schema-invariants.test.ts`,
and the GitHub label/issue-form tooling are all covered, some of them very well. Those
are recorded in §7 so the reader knows the failures below are real ones and not a critic
padding a list.

---

## 1. Orphan sweep

**1835 files** in the donor (excluding `.git`, `node_modules`).
**1143 (62%)** are not named by exact path in any of the 24 harvest docs.
**1075** are named in neither harvest nor digest.

That headline number is misleading and I will say so: **803 of the 1143 are markdown
under `docs/sources/`** — a 43 MB point-in-time mirror of afrikaburn.org (726 pages) and
the AfrikaBurn MediaWiki (90 pages), plus scope documents. Event-specific prose with zero
transferable value to Camp 404. Correctly ignored.

Strip those and the real orphan set is **~340 files**, of which the ones that matter:

| Area | Files in domain | Unmentioned in **any** doc |
|---|---|---|
| `packages/ui/src/` | 87 | **22** |
| `e2e/specs/` | 90 | **27** |
| `packages/db/src/**/*.ts` | 21 | 4 |
| `packages/core/src/*.ts` | 107 | 7 |
| `docs/*.md` (non-sources) | 16 | 0 |
| donor `__tests__` files (all) | 170 | **47** |

### The orphans worth reading

**`apps/org/components/decision-panel.tsx` (192 lines) — zero mentions anywhere.**
The single best-matched orphan in the repo. A state-machine-driven approve / reject /
request-changes panel: `availableReviewActions(status)` gates which buttons exist,
`NEEDS_REASON = ["request_changes", "reject"]` forces a typed reason into a dialog before
the negative actions can fire, and a `refusal` prop carries **the exact sentence the
server would refuse you with**, rendered next to the disabled control
(`DECISION_REFUSAL_ID`, `:41`). Camp 404's WP1 (#125) wants a stale-decision guard on
`decideApprovalAction` (`apps/web/app/captains/camp-management/actions.ts:216`), WP9
(#133) wants decision reversal, and WP2 (#126) wants restricted controls to say why.
This file is the reference implementation for all three and no unit opened it.

**`apps/web/components/registration/registration-summary.tsx` (467 lines) — zero
mentions.** "Read-only post-submission view: status banner + read-only sections +
per-section AB feedback threads", covering `submitted / under_review / approved /
rejected / withdrawn`. This is simultaneously Camp 404's **WP4 S27 completion screen**,
**WP10's missing "captain/lead read-back surface for collected questionnaire responses"**,
and half of questionnaire-builder **Phase E**. Never read.

**`apps/org/components/section-review-thread.tsx` (197 lines) — zero mentions**
(`section_reviews` gets 9 harvest mentions in prose but **0 rows in the ledger**, so it
carries no verdict, no effort, no recommendation). A two-sided per-section comment thread
with `status: open | resolved`, reviewer identity, and a reply list — backed by
`section_reviews` + `section_review_replies`. Camp 404 has nothing like it in any
questionnaire or approval surface.

**`packages/ui/src/components/disabled-hint-tile.tsx` (52 lines) — zero mentions.**
A dashboard tile that is disabled *and says honestly why*: `title` + a one-line `hint` +
an optional `tag` pill, `aria-disabled="true"`, dashed border, 70% opacity. Camp 404 ships
three `comingSoon: true` tiles in `apps/web/app/home/tile-catalogue.ts` with `href: null`
and no such treatment. ~50 lines, no dependency beyond `lucide-react` + `cn`. Cheapest
real win in the orphan set.

**`packages/ui/src/components/textarea-with-count.tsx` + `lib/form-logic.ts`
`wordCountStatus`** — the word-counted textarea, "counting matches the server-side word
rule". Camp 404's builder has `long_text` blocks with no counter.

**`packages/ui/src/components/input.tsx` and `textarea.tsx` — mentioned nowhere, by
anyone.** These are plain shadcn primitives and porting them is pointless — but WP11
(#135) says Camp 404's `Input` primitive ignores board 06's `h-[46px] bg-muted
border-border` spec (`packages/ui/src/components/input.tsx:12`). The donor's `input.tsx`
was the one directly comparable file and no unit read it before the UI verdicts were
written.

**Correctly skipped orphans** (I read enough of each to confirm): the 59 `apps/suppliers`
and 52 `apps/org` files are the supplier portal and org console — no analogue in a
single-camp tool; `packages/core/src/supplier-import.ts` is a CSV importer for AfrikaBurn's
supplier register; the 22 unmentioned `packages/db/migrations/*.sql` are generated Drizzle
output and reading them adds nothing over `schema.ts`; `docs/sources/**` as above.

---

## 2. Schema diff — donor `schema.ts` (2045 L, 44 tables) vs Camp 404 (1535 L, 38 tables)

Extracted programmatically from both files (`work/schema2.mjs`); line numbers are real.

### 2a. Donor-only tables — keep / skip for Camp 404

| Donor table | L | Call | Why |
|---|---|---|---|
| `action_rate_limit` | 490 | **KEEP — S** | 3 columns (`key` PK, `count`, `window_start` bigint) + one index. Camp 404's limiter is **in-memory, per-process** (`apps/web/lib/rate-limit.ts:1-4`: "Per-process, no Redis… swap for an Upstash-backed limiter"). On Vercel that means the forgot-password / invite-check / transcribe budgets reset on every cold start and are multiplied by concurrent instances. `DEFERRED.md:75` books the fix as "a shared Upstash-backed rate limiter" — **a new paid service**. The donor shows it needs no service at all: one table, one `consumeRateLimit`. The donor's comment at `:472-489` is also a paid-for lesson — it explains why the counters must NOT live in the Better Auth `rate_limit` table (Better Auth's `deleteExpiredRows` issues an *unfiltered* `DELETE … WHERE last_request < now-60s`, which silently turned a 15-minute password-reset budget into a 60-second one). |
| `payments` | 1682 | **KEEP — M** | Polymorphic (`subject_type`,`subject_id`), `amount_cents`, `currency`, unique human `reference`, `status` ∈ `pending/reconciled/waived`, `recorded_by_user_id`. Camp 404 has `users.dues_paid` (a boolean **written by nothing** — WP10) and a Finances tile with no UI. This is the missing ledger. Note the ledger assessed only the *reference generator* (`00-ledger-slim.md:858`, value **low**) and the *UI block* (`:521`, `NOT_APPLICABLE / SKIP`). **The table itself has no ledger row.** |
| `security_events` | 2026 | **KEEP — S** | `user_id`, typed `kind`, `ip`, `user_agent`, `created_at`, one `(user, created_at desc)` index. Camp 404 has a single `audit_log` doing both jobs. The donor's comment at `:2014-2024` records that it *used* to derive the security feed from `notifications` and that this "conflated inbox messages with the event record". Camp 404 has an inbox (`notification_deliveries`) and an audit table but no per-account security feed at all. |
| `account_deletion_requests` | 1910 | **SKIP — already refuted** | 14-day grace + cancel + partial unique index `WHERE status='pending'`. Ledger row `00-ledger-priority.md:188` is **REFUTED** and the correction stands: Camp 404's irreversible erasure is a *recorded owner decision* (`docs/superpowers/specs/2026-05-30-account-deletion-design.md` §Decisions). Do not port. |
| `email_change_requests` | 1970 | **SKIP** | Double-token confirm/revoke email change. Camp 404 does not own email identity — Neon Auth does. |
| `editions` | 574 | **DECIDE — see §2d** | The only donor-only table with no ledger row *and* a real question behind it. |
| `profile_keys` | 702 | **SKIP** | The donor's own comment: "Used for nothing yet except future QR attestations." |
| `groups`, `memberships`, `invites` | 717–1042 | **SKIP** | Multi-tenancy. Camp 404 is one camp. |
| `org_departments`, `org_department_domains`, `org_roles`, `org_role_assignments`, `project_roles`, `member_role_assignments`, `wrangler_assignments` | 800–1224 | **SKIP** | Org-vs-participant fork, explicitly out of scope. One salvage: `member_role_assignments` carries `consent_status` / `accepted_at` / `org_visible` / `consent_edition_id` (`:988-1037`) — a two-sided role-acceptance handshake, which is structurally Camp 404's **WP3 (#127)** stranded captain-promotion accept/decline. Camp 404 already has `captain_promotion_requests` (schema.ts:501); it is the UI that is missing, so this is a design reference at best. |
| `registrations` (42 cols), `section_reviews`, `section_review_replies` | 1074–1278 | **SKIP the first, KEEP the pattern** | The 32 `s1_`–`s6_` columns are AfrikaBurn's theme-camp form and are worthless here. The *review thread* pair is the reusable half — see §1. |
| `suppliers`, `supplier_onboarding`, `supplier_notes`, `supplier_documents`, `supplier_document_acks`, `supplier_declarations` | 1488–1675 | **SKIP** | External vendor management. Not this product. |
| `camp_categories`, `group_categories` | 1782–1831 | **SKIP** | Camp 404 has `camp_settings.config` (jsonb `TeamsConfig`) covering the equivalent. |
| `bulletins`, `notifications` | 1748, 1841 | **SKIP — Camp 404 is ahead** | See §2c. |
| `user`, `session`, `account`, `verification`, `rate_limit`, `two_factor`, `passkey` | 358–568 | **SKIP** | Better Auth provider tables. Explicitly out of scope. |
| `burner_bios` | 605 | **SKIP as a table — read §2c** | |

### 2b. Camp 404-only tables (33) — nothing in the donor to compare against

`invite_codes`, `burner_profiles`, `dietary_requirements`, `driver_profiles`,
`car_members`, `team_memberships`, `captain_promotion_requests`,
`questionnaire_activation_targets`, `questionnaire_edits`, `recipes`, `documents`,
`reimbursements`, `team_budgets`, `push_tokens`, `broadcasts`, `broadcast_targets`,
`notification_deliveries`, `tasks`, `adoptees`, `workshops`, `workshop_rsvps`,
`inventory_items`, `inventory_updates`, `audit_log`, `telegram_chats`,
`telegram_invites`, `telegram_announcements`, `mcp_oauth_clients`, `mcp_auth_codes`,
`mcp_access_tokens`, `mcp_audit_log`, `camp_settings`, `questionnaire_versions`.

**Camp 404 has 33 tables the donor has never heard of.** The donor is not a superset of
this product; it is a differently-shaped one. Roughly half the Camp 404 roadmap lives in
these tables, which is why §6 exists.

### 2c. Both have it, and who is actually richer

I checked nine shared-or-renamed pairs. **Camp 404 is richer in six of them.** Stating
that plainly, because the whole exercise is framed as harvesting *from* the donor:

| Pair | Verdict |
|---|---|
| donor `invites` (L1042) ↔ camp `invite_codes` (L340) | **Camp 404 richer.** Donor: single-use `token` + `used_by_user_id`. Camp: `max_uses`, `use_count`, `revoked_at`, `assigned_rank`, `invited_email`, `requires_approval`. |
| donor `notifications` (L1841) ↔ camp `notification_deliveries` (L903) | **Camp 404 richer.** Camp adds `channel`, `presentation`, `push_status`, `acknowledged_at`, `delivered_at`, and a broadcast FK. Donor has no delivery model at all. |
| donor `bulletins` (L1748) ↔ camp `broadcasts` (L836) | **Camp 404 richer.** Camp adds `send_at` (scheduling), `dispatched_at`, `channel`, `kind`, `scope`, `team`. |
| donor `questionnaire_activations` (L1297, 18 real cols) ↔ camp (L537, 16) | **Even.** Donor's extras (`group_id`, `edition_id`, `audience`, `authored_scope`, `definition` snapshot) are tenancy + a denormalised snapshot; Camp 404 gets the snapshot from `questionnaire_versions` and the audience from `questionnaire_activation_targets`. Camp's `one_open_per_key_idx` partial unique is a guarantee the donor lacks. |
| donor `questionnaire_responses` ↔ camp | **Even** minus tenancy columns. |
| donor `required_actions` (L1443) ↔ camp (L643) | **Even.** Only `edition_id` differs. |
| **donor `audit_events` (L1708) ↔ camp `audit_log` (L1180)** | **Donor richer, and it is a live defect.** Same shape (`actor_id`, `action`, `subject`/`target`, `meta`/`metadata`, `created_at`) — but the donor indexes **four** columns (`actor`, `action`, `subject`, `created_at desc`) and Camp 404 indexes **two** (`actor`, `action`). So on Camp 404, "everything that happened to member X" and "recent activity, newest first" are both sequential scans. Two `CREATE INDEX` statements. Effort: trivial. Not in any ledger row. |
| **donor `burner_bios` (L605, 26 data cols) ↔ camp `burner_profiles` (L380) + `users` (L248)** | **Structurally different, and it matters.** Camp 404 stores the whole bio as one `responses` jsonb (`burner_profiles` has 4 real columns). The donor uses 26 typed columns including `medical_notes`, `onsite/offsite_contact_name+phone`, and **`privacy_flags`** — per-field visibility. That typed shape is what makes the donor's `medical-access-panel.tsx` and its medical-access audit trail *possible*: you cannot index, audit, or selectively redact a field buried in a jsonb blob without a schema change. **WP5 (#129) is exactly this problem** — `users.emergency_contacts` exists as jsonb and MCP already exposes it to captains, but there is no per-field privacy model to hang a roster display off. Not a port; a structural warning before WP5 gets built. |
| donor `memberships` (L752) ↔ camp `team_memberships` (L474) | **Even.** Donor's only extra is `ref_code`. WP6's gap is the missing write path, not the schema — the donor helps with actions, not tables. |

### 2d. The question nobody asked: what happens to Camp 404 in year two?

The donor scopes **eight** tables by `edition_id`: `burner_bios`, `registrations`,
`wrangler_assignments`, `questionnaire_activations`, `questionnaire_responses`,
`required_actions`, `supplier_onboarding`, `supplier_documents`, `bulletins`,
`camp_categories`, `member_role_assignments.consent_edition_id`.

Camp 404 has **no year, edition, or event concept anywhere** — verified: `rg '\bedition\b'`
over `packages/db` and `apps/web/lib` returns nothing, and `camp_settings` (L1422) is a
singleton with `bootstrappedAt` + a teams config and no cycle.

The five ledger rows touching editions are all about the *code accessor*
(`getActiveEdition`, `getPlacementZones`) and all landed `NOT_APPLICABLE / SKIP / low`.
Fair for the accessor. But nobody asked the product question behind it: when Camp 404
runs a **second** burn, `users.dues_paid`, `approval_status`, `terms_consented_at`, every
`required_actions` row, every `questionnaire_responses` row and every roster approval
carry over with no mechanism to reset per cycle. `previous_afrikaburns` /
`previous_burning_mans` are free-text counts, not a participation history.

**This is not a "port the `editions` table" recommendation** — an internal tool for 30–80
people may legitimately choose to wipe and re-seed each year. It is a decision that has
not been made, and the 892-row ledger contains no line that surfaces it. Decide it before
`payments`/dues gets built, because a dues ledger with no cycle key is the expensive
version of this mistake.

---

## 3. Donor git history — does recent work reveal anything the harvest missed?

`git log --oneline -150` reaches back to the repo's first commits;
`git log --stat -20` covers 2026-08-12 back through the E2E and audit work.

**Answer: essentially no.** The last 20 commits touch `.github/ISSUE_TEMPLATE/*.yml`,
`packages/core/src/__tests__/issue-forms.test.ts`, `pull_request_template.md`,
`docs/triage.md`, `docs/sources/app-specification/*`, and a wide spread of
`__tests__`/e2e files. Every one of those artefacts is covered — `issue-forms.test.ts`
17 harvest / 32 digest mentions, `labels:sync` 13/29, `GITHUB_LABELS` 27/30,
`pull_request_template.md` 11/21, `commitlint` 64/46, `CODEOWNERS` 12/21.
Units 20 and 21 did their jobs.

Two small things the log surfaces that the docs alone would not:

- **`docs/sources/app-specification/` — 584 numbered requirements (COMM-001…, prefix per
  section, a `requirement-index.md` and an `app-spec-change-record.md` logging every
  amendment) under strict RFC 2119/8174 language.** The *requirement-ID traceability*
  discipline is a real, transferable practice. `requirement-index` gets **2** harvest
  mentions and **0** in the digest; `app-spec-change-record` gets **1** and **0**. This
  is the one genuine gap in unit 21's coverage. Camp 404's own equivalent is 12 GitHub
  work-package issues and a `DEFERRED.md` with known-stale entries (three, per baselines).
- **Commit `9ef6ee0 refactor(repo): simplification audit, and delete the dead code it
  found (#22)`** — a periodic dead-code sweep as a first-class chore, with
  `docs/simplification-audit.md` as its artefact. Camp 404's baselines list seven fully
  orphaned tables (`tasks`, `adoptees`, `workshops`, `workshop_rsvps`, `inventory_items`,
  `inventory_updates`, `car_members`) and several orphaned symbols. The practice is
  worth more here than any file in it.

The one thing the log does *not* show: **no commit after 2026-08-12**. The donor is a
snapshot, not a moving target. Nothing is in flight that the harvest would have missed
by timing.

---

## 4. Env / service diff

Donor `.env.example` (7 vars) vs Camp 404 `turbo.json` `globalEnv` (22 vars).

**Note first: the donor's `.env.example:7-9` says the `globalEnv` convention is
"mirrored from the Camp 404 convention".** Camp 404 is the older project. The donor
borrowed from it, not only the other way around.

| Service | Donor | Camp 404 | Want it? |
|---|---|---|---|
| Neon Postgres (`DATABASE_URL`) | ✅ | ✅ | — |
| Neon Auth / Better Auth | ✅ | ✅ | — |
| Vercel Blob (`BLOB_READ_WRITE_TOKEN`) | ✅ | ✅ | — |
| `PGCRYPTO_KEY` | ✅ | ✅ | — |
| `GOD_EMAILS` bootstrap | ✅ | ✅ (deprecation pending) | — |
| **Resend (`RESEND_API_KEY`)** | ✅ | ❌ **nothing** | **Yes — see below** |
| **`NEON_LOCAL_PROXY` + `docker-compose.local.yml`** | ✅ | ❌ | **Probably** |
| Firebase / FCM push (7 vars) | ❌ | ✅ | donor has nothing |
| Anthropic + Groq | ❌ | ✅ | donor has nothing |
| Telegram bot | ❌ | ✅ | donor has nothing |
| `CRON_SECRET` | ❌ | ✅ | donor has nothing |
| `MOBILE_BUILD` | ❌ | ✅ | donor has nothing |

**Resend — Camp 404 has no email channel at all.** `rg 'resend|nodemailer|sendgrid|
postmark|mailgun|smtp'` across the repo returns one false positive. Its only outbound
channels are FCM push (inert until Firebase env is set in Vercel — `DEFERRED.md:80-85`)
and Telegram (deliberately not activated — `DEFERRED.md:65`). **So today Camp 404 can
reach a member through exactly zero working channels.** The donor's `notification_deliveries`
equivalent has no `channel` column because it only ever had email; Camp 404's *does*
(`schema.ts:903`, `channel` + `push_status`) — the schema is ready and the second channel
is missing. Adding Resend is one env var and one adapter behind the existing dispatch
cron. This is the highest-value line in the env diff and it is a two-hour job.

**`NEON_LOCAL_PROXY` + `docker-compose.local.yml`** — the donor can run the whole stack,
including its E2E suite, off a laptop with no Neon branch. Camp 404 has PGlite for
`packages/db` integration tests (`@electric-sql/pglite ^0.5.3`, `_harness.ts`,
`_factories.ts`) but nothing that runs `apps/web` against a real Postgres locally.
Relevant because `docs/e2e-true-auth.md` is unbuilt and its blocker is partly "where does
Neon Auth store identities" — which is much easier to answer against a local stack.
Medium value, small effort.

---

## 5. Camp 404 roadmap items with **no donor reference implementation at all**

Tested by grepping the donor's `apps/` + `packages/` source for each concept. Zero source
hits = the donor cannot help, whatever the digest says about it in prose.

**Zero donor source. Build from scratch:**

| Roadmap item | Donor source hits |
|---|---|
| WP8 (#132) `prefers-reduced-motion` strategy — 40 findings | **0** |
| WP8 @dnd-kit `DragOverlay` / keyboard sensor | **0** |
| Firebase / FCM push pipeline, service worker, `push_tokens` | **0** |
| Telegram bot — all 6 outstanding items | **0** |
| The entire MCP surface — captain-tier tools (phasing 7–8), OAuth DB-flow tests, completion hooks, `redactIdDocuments` | **0** |
| Capacitor / mobile build (`build:mobile` broken, Phase 7) | **0** |
| Recipes & meal planning (Phase 3; `/api/cron/recipes/analyse` is a stub) | **0** |
| Manuals generation (`/api/cron/manuals/generate` stub) | **0** |
| `tasks` table → a task board (3 `comingSoon` tiles point at it) | **0** |
| `adoptees` | **0** |
| Family tree / referral lineage (`getReferralRoster`) | **0** |
| Carpool / lifts / arrival-travel surfacing | **0** |
| Reimbursements + `team_budgets` UI | **0** |
| Voice capture / transcription prompts (`bug_report` prompt, native shake) | ~0 (donor has an 18-line `report/transcribe` route that delegates to `@quagga/core/report-server`; the *dictation-for-the-reporter* pattern is covered, nothing else) |
| `opt_in` activation scope (pull model) | **0** |
| Configurable-teams Phase 4 (enum growth) | **0** |
| `workshops` / `workshop_rsvps` | ~0 (3 hits, all unrelated) |
| `inventory_items` / `inventory_updates` | 0 (16 hits are supplier-onboarding "inventory" prose) |
| `dietary_requirements` | 0 (1 unrelated hit) |

That is **19 of the ~35 open roadmap lines with no reference implementation anywhere in
the donor.** Roughly half of Camp 404's remaining work is genuinely original and this
whole 76-agent exercise has nothing to say about it. Anyone reading the ledger as a
roadmap will systematically under-weight that half.

**Where the donor genuinely does help** (already well covered in the digest, listed so the
contrast is fair): questionnaire results aggregation + CSV + per-respondent view
(Phase E / WP4 / WP10), `ResponsiveDataTable` + `table.tsx` primitives (WP5/WP9),
loading/error boundary coverage (WP7 — the donor ships **48** `loading.tsx` / `error.tsx` /
`global-error.tsx` / `not-found.tsx` files against Camp 404's **one**), destructive-action
guards and deletion-impact computation (WP1), and the whole account-security surface.

---

## 6. Method failures — which sections to trust less

Measured across all 24 harvest docs: file:line citations, `__tests__` mentions, `pgTable`
mentions, and per-unit domain coverage (`work/unitcheck.mjs`).

**Citation density (file:line refs per 1000 words) — the weak tail:**

| Unit | refs | words | per 1k |
|---|---|---|---|
| **21-docs-spec-discipline** | 38 | 13,902 | **2.7** |
| **03-questionnaire-runner-ui** | 62 | 12,858 | **4.8** |
| **07-roles-permissions** | 94 | 12,387 | **7.6** |
| 01-questionnaire-engine | 94 | 10,357 | 9.1 |
| 23-media-uploads-blob | 99 | 8,695 | 11.4 |
| *(median across 24)* | | | *~18* |
| *(best: 17-status-board, 10-report-feedback, 05-notifications-ui)* | | | *22–25* |

**Named weak units:**

- **`21-docs-spec-discipline`** — 2.7 refs/1k, 5× below median. It is prose about prose.
  It happens to have 100% file coverage of `docs/*.md`, so it is not *wrong*; it is
  unverifiable. Its one substantive omission is the requirement-index / change-record
  traceability system (§3).
- **`03-questionnaire-runner-ui`** — 4.8 refs/1k across 12,858 words, the longest
  low-citation doc. Summarising, not enumerating.
- **`14-ui-component-library` + `15-forms-tables-wizard-primitives`** — the worst failure
  in the set. Between them they own `packages/ui/src` (87 files) and **22 are named by no
  document at all**: every one of the **14 `__tests__` files** (`responsive-data-table.test.tsx`,
  `form-logic.test.ts`, `phone-input.test.tsx`, `toast.test.tsx`, `toggle-group.test.tsx`,
  `role-badge.test.tsx`, `components.test.tsx`, and the 7 account-suite tests) plus **8
  shipped components** (`accordion`, `dialog`, `disabled-hint-tile`, `input`,
  `payment-details-block`, `status-badge`, `textarea`, `textarea-with-count`). Unit 15
  mentions `__tests__` **3 times in the whole document**. Two units split one package and
  each assumed the other had the tests. Every "COPY this component" verdict in units 14
  and 15 was written without reading the test that documents its contract.
- **`19-e2e-harness`** — **27 of 90 spec files named nowhere**, including
  `new-burner/sign-up.spec.ts`, `session-lifecycle.spec.ts`, `two-factor.spec.ts`,
  `auth-rate-limit.spec.ts`, and all 5 supplier + 5 org-staff specs. The *harness*
  (`fixtures.ts`, `personas/factories.ts`, `lib/mail.ts`, `playwright.config.ts`) is
  covered well — 83 digest mentions of `e2e-true-auth`. What is missing is the **spec
  inventory**, so a reader cannot tell what the donor actually proves. Given that
  `docs/e2e-true-auth.md` is Camp 404's live open item and someone abandoned
  `apps/web/tests/e2e/lib/mailtm.ts` uncommitted in the working tree, the file-by-file
  list of what a real-auth suite covers was the deliverable, and it is not there.
- **`24-sweeper-misc`** — 102 of 107 `packages/core` files unmentioned in its own doc
  (7 unmentioned anywhere). Mostly correct triage of supplier code, but a unit named
  "sweeper" that swept 5% of its domain is mis-named.
- **`13-db-layer-patterns`** — 178 refs is respectable, but **5 `pgTable` mentions** for
  a unit that owns a 44-table schema, and it drops `rate-limit.test.ts`,
  `local-proxy.test.ts`, `db-drivers.test.ts`, `seed-org-bootstrap.test.ts`. The first
  two correspond to the two live Camp 404 gaps in §4 and §2a. This unit is the root cause
  of the whole schema blind spot.

**Systemic, across all 24:** `__tests__` files were treated as evidence *about* an asset
rather than as assets in their own right — **47 of 170 are named nowhere**. And no unit
was assigned the schema, so a 2045-line file with the densest decision comments in the
donor was never diffed until this pass.

---

## 7. Hypotheses I tested that were **wrong** — the analysis holds here

Recorded so §1–§6 read as findings, not as a critic filling a quota.

1. **"Nobody found the CSV export."** Wrong, and comprehensively so.
   `apps/org/components/questionnaires/results-view.tsx:505-609` is covered by **four**
   ledger rows across units 01/02/03/15, verified digit-exact down to the `﻿` BOM at
   `:587-589` and the `${q.id}:${o.value}` label-map keys at `:510`. Row `00-ledger-priority.md:33`
   calls it "the best effort-to-value item in the whole unit". Correct.
2. **"Nobody found the disposable-inbox E2E harness."** Wrong. `e2e/lib/mail.ts`,
   `mail.tm`, and `e2e-true-auth` are covered (83 digest mentions).
3. **"Camp 404 should adopt the 14-day deletion grace period."** Wrong — and the
   adversarial verifier already caught it. `00-ledger-priority.md:188` is REFUTED with
   the right reason: Camp 404's irreversibility is a recorded owner decision, not an
   omission. Do not re-litigate.
4. **"Nobody covered the GitHub label / issue-form tooling from the most recent commit."**
   Wrong. Fully covered by unit 20.
5. **"WP7's loading/error boundaries have no donor reference."** Wrong at the pattern
   level — `loading.tsx` appears 69 times in harvest and 188 in digest. Only the
   file-by-file inventory (26 of 48 boundary files) is missing.

---

## 8. What to build next, from this critique alone

Ranked by value ÷ effort. None of these appear as an actionable ledger row today.

1. **Two `CREATE INDEX` statements on `audit_log`** — `(target)` and `(created_at desc)`.
   Camp 404 `packages/db/src/schema.ts:1180-1196` vs donor `:1708-1737`. Minutes.
2. **`action_rate_limit`: a 3-column table + `consumeRateLimit`** replacing the
   per-process bucket in `apps/web/lib/rate-limit.ts`. Closes `DEFERRED.md:75` **without
   adding Upstash**. Donor `schema.ts:490-502` + `packages/db/src/rate-limit.ts` +
   `packages/db/src/__tests__/rate-limit.test.ts` (all three unmentioned in the DB unit). Half a day.
3. **Wire up Resend.** Camp 404 currently has zero functioning outbound channels. The
   `channel` column in `notification_deliveries:903` already exists. Donor
   `.env.example:22-25`. Two hours.
4. **Port `disabled-hint-tile.tsx`** onto the three `comingSoon` home tiles. ~50 lines,
   zero new deps. Donor `packages/ui/src/components/disabled-hint-tile.tsx`. An hour.
5. **Read `apps/org/components/decision-panel.tsx` before starting WP1/WP2/WP9.** The
   reason-required dialog + the `refusal` prop pattern answers three separate work
   packages and no agent opened the file.
6. **Read `apps/web/components/registration/registration-summary.tsx` before starting
   WP4's S27 screen or WP10's read-back surface.** 467 lines of exactly that, never read.
7. **Decide the annual-cycle question (§2d)** before `payments`/dues is built.
8. **Assign someone the `packages/ui/src/components/__tests__/` folder** — 14 test files
   that document the contracts of components the ledger recommends copying, read by nobody.

---

### Provenance

Working files under `.../scratchpad/work/`: `donor-files.txt` (1835 paths),
`orphan-harvest.txt` (1143), `orphan-both.txt` (1075), `donor-tables.json` /
`camp-tables.json` (parsed schemas), `schema2.mjs`, `pairs.mjs`, `unitcheck.mjs`,
`orphan.mjs`. All counts are reproducible by re-running those scripts.
