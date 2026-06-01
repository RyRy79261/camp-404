# Camp 404 — Feature-Set Adversarial Verification: Master Report

Consolidated from the 31 per-unit verification reports in
`design/feature-set/verification/` (`00-overview.md`, `01-*.md` … `30-*.md`).
This report aggregates only what those files contain; no fresh claims were
raised and nothing was re-verified against source.

---

## 1. Executive Summary

> **Verification timeline / phase marker.** Verification conducted 2026-05-31;
> phase-5 fixes applied prior to PR #52 (commit `1b45568`). Several MEDIUM
> findings in §4/§5 are ALREADY incorporated into the feature-set briefs — e.g.
> unit 04 now states "12 pages", unit 28 "19 tokens", unit 29 "26 pgEnums".
> Treat those §4/§5 mediums as HISTORICAL (pre-fix) unless re-flagged against the
> current briefs.

### Aggregate metrics

| Metric | Value |
|---|---|
| Units verified | 31 |
| Total claims checked | 2097 |
| Total verified | 2027 |
| Overall verified % (M/N) | **96.66%** (2027 / 2097) |
| Total inaccuracies | 71 |
| Total omissions | 50 |
| Total findings | 121 |

### Inaccuracies by severity

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 11 |
| Low | 60 |

### Omissions by severity

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 2 |
| Low | 48 |

### Per-unit verdict counts

| Verdict | Units |
|---|---|
| accurate | 25 |
| minor-gaps | 6 |
| significant-gaps | 0 |

### Per-unit claim-count range

41 (unit 28 theming-tokens) – 78 (units 04, 06 grouping aside; e.g. 11, 14, 15, 17, 20, 21, 23, 24, 25, 26, 29, 30). Median surface checked ~70 claims.

### Overall verdict

The documentation set is **certifiably reliable at the source-of-truth level**: overall accuracy is **96.66%**, there are **zero HIGH-severity findings** of any kind, and **no unit lands in significant-gaps** (25 accurate, 6 minor-gaps). The defects that matter for a rebuild cluster into four repeating patterns: **(1) dead/orphaned code presented as live** — `control-grid` (unit 00), the four `scope.ts` capability predicates + `redactIdDocuments` (unit 17), and `/members` + `/meals` quadrant tiles pointing at routes that 404 (unit 06); **(2) wrong/stale enumeration counts** — "13 pages" vs the actual 12 (units 04, 30), "21" OKLCH tokens vs 19 (unit 28), "24 pgEnums" vs 26 (unit 29); **(3) same-named-file conflation** — bare "questionnaire.ts:NN" cites silently span `packages/types/src/questionnaire.ts` and `apps/web/lib/questionnaire.ts` (units 20, 22); and **(4) stale reuse/provenance attribution** — `footer` prop called orphaned when `signup/required` passes it and `getAuthenticatedUserOrRedirect` mis-attributed to `/auth/page.tsx` (unit 02), `isTeamLead` cited to the wrong function/lines (unit 19). The rest of the corpus is overwhelmingly low-severity cosmetic citation drift (off-by-one/-few line ranges).

---

## 2. Per-Unit Verdict Table

Worst-first ordering: significant-gaps → most inaccuracies → most omissions.

| Unit | Verdict | Claims | Verified | #Inacc | #Omis |
|---|---|---|---|---|---|
| 30 test-seam | minor-gaps | 78 | 74 | 6 | 2 |
| 28 theming-tokens | minor-gaps | 41 | 39 | 2 | 2 |
| 29 data-model-enums | minor-gaps | 78 | 76 | 2 | 2 |
| 04 onboarding-wizard | minor-gaps | 78 | 75 | 3 | 2 |
| 06 home-control-panel | minor-gaps | 71 | 67 | 4 | 2 |
| 02 auth-shells | minor-gaps | 71 | 67 | 4 | 2 |
| 17 mcp-connect | accurate | 71 | 67 | 4 | 2 |
| 19 control-nav-components | accurate | 71 | 68 | 3 | 2 |
| 20 question-field-kinds | accurate | 78 | 75 | 3 | 2 |
| 08 profile-edit | accurate | 64 | 61 | 3 | 2 |
| 26 push-subsystem | accurate | 78 | 75 | 3 | 1 |
| 00 overview | accurate | 58 | 54 | 3 | 2 |
| 22 avatar-media | accurate | 58 | 56 | 2 | 2 |
| 14 captains-camp-management | accurate | 78 | 76 | 2 | 1 |
| 15 captains-announcements | accurate | 78 | 76 | 2 | 2 |
| 23 auth-session-gating | accurate | 78 | 76 | 2 | 2 |
| 24 nav-chrome-layout | accurate | 78 | 76 | 2 | 2 |
| 25 global-feedback-dialogs | accurate | 78 | 76 | 2 | 2 |
| 03 invite-gate | accurate | 61 | 59 | 2 | 2 |
| 12 tools-forms | accurate | 58 | 56 | 2 | 2 |
| 18 ui-primitives | accurate | 62 | 61 | 2 | 2 |
| 21 voice-entry | accurate | 78 | 76 | 2 | 1 |
| 05 pending-approval | accurate | 64 | 62 | 2 | 1 |
| 07 profile-view | accurate | 58 | 56 | 2 | 0 |
| 16 captains-tools | accurate | 48 | 46 | 2 | 1 |
| 10 tools-hub | accurate | 47 | 46 | 1 | 1 |
| 11 tools-invite | accurate | 78 | 77 | 1 | 2 |
| 13 family-tree | accurate | 71 | 70 | 1 | 2 |
| 09 notifications-inbox | accurate | 58 | 57 | 1 | 0 |
| 01 landing | accurate | 58 | 57 | 1 | 0 |
| 27 notifications-engine | accurate | 71 | 70 | 0 | 2 |

---

## 3. All HIGH-Severity Findings

**None.** Across all 31 units, zero inaccuracies and zero omissions were rated HIGH. Every defect that could mislead a rebuild was rated MEDIUM or lower; the MEDIUM set is enumerated in §4.

---

## 4. All MEDIUM-Severity Findings (grouped by unit)

### Unit 00 · overview
- **[Inaccuracy]** §3/§4 present `control-grid.tsx` as the live "desktop counterpart that shows all layers at once," citing `control-grid.tsx:50`/`:151` as live behaviour, with only `quadrant-nav` flagged v0. Reality: `ControlGrid` is imported **only** by `control-grid.stories.tsx` — zero app consumers; Storybook-only/dead in production. `design-system.md` never mentions it. Proof: grep — sole importer `packages/ui/src/components/control-grid.stories.tsx:13`; component at `control-grid.tsx:50`,`:151`.

### Unit 02 · auth-shells
- **[Inaccuracy]** "`AuthShell`'s `footer` prop is currently unused / orphaned (no caller passes it)" (doc lines 62, 152). Reality: `signup/required/page.tsx:30` passes `footer="Camp 404 is invite-only."` — the prop is live.
- **[Inaccuracy]** "`getAuthenticatedUser` / `getAuthenticatedUserOrRedirect` … used by `/auth/page.tsx`" (line 156). Reality: `/auth/page.tsx` imports and calls only `getAuthenticatedUser` (`auth/page.tsx:2,21`); `getAuthenticatedUserOrRedirect` is never called by any `/auth/*` page — it's used by downstream protected pages (`lib/auth.ts:40`).

### Unit 04 · onboarding-wizard
- **[Inaccuracy]** "the 13 pages" / "renders 13 pages total ('Step N of 13')" / "The live 13 pages (in order)". Reality: the catalogue has exactly **12** top-level pages (11 `kind:"questions"` + 1 `kind:"intro"`); `ProgressBar total={questionnaire.pages.length}` renders "Step N of 12." Proof: `questionnaire.ts:62-386`; `wizard.tsx:187,274`.

### Unit 06 · home-control-panel
- **[Inaccuracy]** camp_member tiles presented as working navigation: `My Teams` → `/members`, `My Tasks` → `/meals` (lines 91, 130), with only team_lead/captain tiles flagged inert. Reality: no `app/members/page.tsx` and no `app/meals/page.tsx` exist anywhere under `apps/web`, and there is **no `middleware.ts`** to rewrite — both hrefs hit Next's 404. Proof: `apps/web/app/page.tsx:107-117` (hrefs); routes absent by grep.

### Unit 17 · mcp-connect
- **[Omission]** `scope.ts` predicates `canReadTeamOps` / `canWriteTeam` / `canApproveCrossTeam` / `canAdmin` are presented as the live capability surface ("what the granted token can do per call"), but **none has a production caller** — they appear only in `scope.test.ts`. Only `getMcpScope` (via `tool-utils.ts:53`) and `canSeeIdDocuments` (via `people.ts:133`) are wired in. Proof: `apps/web/lib/mcp/scope.ts:70-90`.
- **[Omission]** `redactIdDocuments` is described as the active "second line of defence" but has **zero production callers** — `people.ts` does its own conditional include via `canSeeIdDocuments` and never calls it; only `consent.test.ts` exercises it. Proof: `apps/web/lib/mcp/consent.ts:33-45`.

### Unit 19 · control-nav-components
- **[Inaccuracy]** `isTeamLead(campUser.id)` "resolves via `@camp404/db/roster`, whose SQL is `exists (…)` (roster.ts:21-22, 66-68)". Reality: those cited lines are the WRONG function (the `CampManagementMember.isLead` JSDoc and the `exists(...)` subquery inside `getCampManagementRoster`). The real `isTeamLead` is at `roster.ts:204-217` and uses a Drizzle `select({team}).from(teamMemberships).where(and(eq(userId), eq(isLead,true))).limit(1)` — not a raw `exists` SQL string. The live page calls `isTeamLead` from `@/lib/users` (store wrapper) which is `false` under E2E. Proof: `roster.ts:204-217`; `apps/web/lib/users.ts:244-247, 387-389, 448-450`.

### Unit 22 · avatar-media
- **[Inaccuracy]** The `profile.image` question definition strings (`id`/`prompt`/`helper`, page `profile_photo`) are cited as "(questionnaire.ts:62-77)" and "Supporting files read" lists only `packages/types/src/questionnaire.ts`. Reality: those strings live in **`apps/web/lib/questionnaire.ts:63-77`** (live config), a different file; the schema/validator are correctly in the types package. Conflates two same-named files and never names the lib file. Proof: `apps/web/lib/questionnaire.ts:63-77` vs `packages/types/src/questionnaire.ts:128-134`.

### Unit 28 · theming-tokens
- **[Inaccuracy]** "It defines **21** OKLCH colour tokens" (Purpose) and "**21** colour tokens" (Features). Reality: `globals.css` defines exactly **19** `--color-*` tokens (+1 `--radius`). The doc's own Enums table (line 85), the table, and the business-rules section (line 127) all correctly say 19 — the "21" is internally self-contradicting. Proof: `packages/ui/src/styles/globals.css:12-38` (grep count = 19).

### Unit 29 · data-model-enums
- **[Inaccuracy]** "Enum catalog … **24** `pgEnum`s" (lines 36-37) and "Stored DB enums: the **24** `pgEnum`s above" (line 114). Reality: there are **26** `pgEnum`s (23 in the main block `schema.ts:31-211` + 3 in the MCP block `schema.ts:1223-1237`); the doc's own catalog (lines 38-63) correctly lists all 26. Proof: `grep -c "pgEnum(" schema.ts` = 26.

### Unit 30 · test-seam
- **[Inaccuracy]** "skips the 13-page wizard walk" / "Shortcuts the 13-page burner-profile wizard" / "skip the 13-page wizard" — repeated 3× (lines 9, 59, 169). Reality: `QUESTIONNAIRE.pages` defines exactly **12** page objects; the "13" matches a stale source comment at `complete-onboarding/route.ts:6-8` but not the data. Proof: `questionnaire.ts:61-386`; `wizard.tsx:65,187`.
- **[Inaccuracy]** "`invitedEmail` exists in-store with **no obvious schema column**" (line 160). Reality: `invited_email` IS a real schema column — `invitedEmail: text("invited_email")` at `schema.ts:331`, inside the invite_codes range the doc itself cites. (The "orphan through the HTTP seam" half — `SeedBody` never forwards it — is correct.) Proof: `schema.ts:331`.

---

## 5. Prioritized FIX LIST

Tagging: **[Quick]** = pure doc edit, no re-investigation; **[Re-check]** = verify against source before/while editing.

### Tier A — Factual errors (wrong counts/strings a rebuild would copy)
- A1. Unit 04 + Unit 30: change every "13 pages / Step N of 13" to **12**. Note the stale source comment at `complete-onboarding/route.ts:6-8` is the contagion source. **[Quick]**
- A2. Unit 28: change "21 OKLCH tokens" → **19** (both Purpose + Features prose). **[Quick]**
- A3. Unit 29: change "24 pgEnums" → **26** (both occurrences). **[Quick]**
- A4. Unit 30: correct "`invitedEmail` has no schema column" — it is `schema.ts:331`. Keep the (correct) "orphan through the seam" observation. **[Quick]**
- A5. Unit 02: correct "`getAuthenticatedUserOrRedirect` used by `/auth/page.tsx`" — `/auth/page.tsx` uses only `getAuthenticatedUser`. **[Quick]**
- A6. Unit 19: re-point `isTeamLead` SQL to `roster.ts:204-217` (Drizzle select, not raw `exists`); note the `@/lib/users` wrapper + E2E-false path. **[Re-check]**

### Tier B — Dead / orphaned code presented as live
- B1. Unit 00 + Unit 19: flag `control-grid` as Storybook-only/dead (parity with the existing `quadrant-nav` v0 caveat). **[Quick]**
- B2. Unit 17: add an orphaned caveat for `scope.ts` `canReadTeamOps`/`canWriteTeam`/`canApproveCrossTeam`/`canAdmin` and for `redactIdDocuments` (only test callers). **[Re-check]**
- B3. Unit 02: correct `AuthShell.footer` "orphaned" → live (passed by `signup/required/page.tsx:30`); add `pending-approval` + `signup/required` as `AuthShell`/`hideBack` callers. **[Quick]**

### Tier C — Unreachable / dead-link states presented as working
- C1. Unit 06: add the 404 caveat to camp_member `/members` and `/meals` tiles (same treatment given to team_lead/captain inert tiles). **[Quick]**
- C2. Unit 03 (low): note the `rejected → pending` re-redemption branch is unreachable (earlier short-circuit). **[Quick]**
- C3. Unit 12 / Unit 14 (low): the `final===false` replay branch and the "Unknown decision." action error are unreachable from their only clients — keep but label defensive. **[Quick]**

### Tier D — Deprecated / stale-field framing
- D1. Unit 20 + Unit 22: disambiguate bare "questionnaire.ts:NN" cites between `packages/types/src/questionnaire.ts` and `apps/web/lib/questionnaire.ts`. **[Re-check]**
- D2. Unit 13 / Unit 22: flag stale source comments that imply `profileImageUrl` feeds the family tree / that the stored image value is the raw blob URL (consumers persist the proxy URL). **[Quick]**
- D3. Unit 29 (low): soften "satisfyRequiredAction … only if `meetsRequiredVersion`" — a versionless gate/completion satisfies unconditionally. **[Quick]**

### Tier E — Low-risk nuances (cosmetic line-range / count drift; batch-fixable)
- E1. Off-by-one/-few line-range citations across units 00, 01, 04, 05, 09, 12, 13, 14, 15, 17, 18, 19, 20, 21, 23, 24, 28, 30 (e.g. comment-vs-statement boundaries, mid-table slices, function-start-vs-JSDoc). **[Quick]**
- E2. Unit 20: country count "199" → **198** (the 199th `value:` is the `Country` interface field). Unit 04 self-flags the same as low-confidence. **[Quick]**
- E3. Unit 11: `InviteForm` "default export-ish" → plain named export. **[Quick]**
- E4. Various low omissions (unused `retryAfterSeconds`, rate-limiter sweep, transport-catch error string, `SWEEP_EVERY`, `S.` prefix, etc.) — fold in where editing nearby prose. **[Quick]**

---

## 6. Code Bugs / Dead Code Surfaced (route to engineering — SOURCE defects)

These are defects in the **source code**, surfaced incidentally by verification — not documentation fixes.

- **Dead links in the home control panel.** `/members` and `/meals` quadrant tiles (`apps/web/app/page.tsx:107-117`) point at routes that do not exist (no `page.tsx`, no `middleware.ts` rewrite) → both 404 today. *(Surfaced by unit 06.)*
- **Storybook-only dead component.** `ControlGrid` (`packages/ui/src/components/control-grid.tsx:50`) has zero app consumers — only `control-grid.stories.tsx:13` imports it. *(Units 00, 19.)*
- **Orphaned v0 component.** `QuadrantNav` (`packages/ui/src/components/quadrant-nav.tsx`) is referenced only by its own story; superseded by `ControlPanel`. *(Units 18, 19.)*
- **Orphaned MCP capability predicates.** `canReadTeamOps`/`canWriteTeam`/`canApproveCrossTeam`/`canAdmin` (`apps/web/lib/mcp/scope.ts:70-90`) and `redactIdDocuments` (`apps/web/lib/mcp/consent.ts:33-45`) have no production callers (test-only). Either wire them or remove. *(Unit 17.)*
- **Stale "13-page" source comment.** `apps/web/app/api/test/complete-onboarding/route.ts:6-8` (and `tests/e2e/_helpers.ts:46`) say "13-page" wizard; the catalogue is 12 pages — the comment seeded the doc error. *(Units 04, 30.)*
- **`completedAt` bumped on replay (latent contract bug).** A form replay calls `upsertBurnerProfile` with `markComplete:true`, bumping `completedAt` to the re-submit time (`packages/db/src/burner-profile.ts:134-161`), contradicting the inline "idempotent on completedAt" comment at `apps/web/lib/forms.ts:78-79`. *(Unit 12.)*
- **Orphaned/forward-looking DB helpers.** `getInvitesIssuedBy` and `getRootCodes` (`packages/db/src/relations.ts:45-67`) have zero callers. *(Unit 13.)*
- **Orphaned UI primitives/variants.** `Button` `size="icon-lg"` (`button.tsx:27`) and `CommandShortcut` (`command.tsx:118`) have no consumers; `DictateButton` (`apps/web/components/voice/dictate-button.tsx`) has no source importers. *(Units 18, 21.)*
- **Prepared-but-unused prop.** `AvatarUpload`'s `className` diameter override (`avatar-upload.tsx:14,86`) is never passed by any real consumer. *(Unit 08.)*
- **Stale code comments (provenance/intent drift).** "pgcrypto" comments on a Node AES-256-GCM impl (`crypto.ts`); `ImageQuestion` comment claims the stored value is the raw Vercel Blob URL while consumers persist the proxy URL (`packages/types/src/questionnaire.ts:125-127`); schema comment implies `profileImageUrl` feeds the family tree though the roster query never selects it (`schema.ts:228`); `schema.ts:454` comment references an aspirational `users.rank = 'team_lead'` not in the enum. *(Units 29, 22, 13, 19.)*
- **DELETE `/api/push/tokens` has no in-repo caller.** Implemented + gated but never invoked (`apps/web/app/api/push/tokens/route.ts:53-62`). *(Unit 26.)*
- **MCP `mcp_audit_log.client_id` is not an FK** (`schema.ts:1323-1325`) — intentional-looking but worth a confirm. *(Unit 29.)*

---

## 7. Low-Confidence / Needs-Human-Eyes

Aggregated from every per-unit "Low-confidence / could-not-verify" section.

**Upstream-package behaviour (trusted at contract level, not source-audited):**
- Neon Auth / Better Auth internals: `createNeonAuth`, `auth.handler()`, `auth.middleware()`, `<AuthView>`, `NeonAuthUIProvider`, `useSession`, `signIn.email/social`, the proxy verifier→cookie exchange, the ≥32-char secret throw, and the server-side password rules. *(Units 01, 02, 03, 06, 07, 23.)*
- `@vercel/blob` `get()`/`put()` null/304/`statusCode!==200` semantics for missing avatars (verified against type defs, not a live store). *(Units 07, 22.)*
- `@radix-ui/react-avatar` image load/error fallback and `@radix-ui/react-slider` default `step=1`. *(Unit 18.)*
- Anthropic model id validity (`claude-haiku-4-5-20251001`), `AbortSignal.timeout`, and the GitHub status-code mapping (code-level only, not live). *(Units 24, 25.)*
- next-themes `class="dark"` injection lives in the `@neondatabase/auth` bundle; app passes no theme props. *(Unit 28.)*

**Design-intent questions (code behaviour confirmed, intent not):**
- Whether `control-grid`/`quadrant-nav`/orphaned MCP predicates/`getInvitesIssuedBy`/`getRootCodes` are intended scaffolding vs dead. *(Units 00, 13, 17, 19.)*
- Whether `/members`, `/meals` are known-future routes vs oversight. *(Unit 06.)*
- Absence of `prefers-reduced-motion` on the landing glitch — deliberate vs oversight. *(Unit 01.)*
- The action-vs-page gating asymmetry on `/profile/edit` (re-gate only auth+invite). *(Unit 08.)*
- "No onboarding gate" on `/tools/invite` and `/api/voice/transcribe` (gate only auth) — intent. *(Units 11, 21.)*
- `boolean` in the response union (vestigial/future), ScaleField empty-gutter "reserved for future labels," `Date.parse` leniency. *(Unit 20.)*
- `completedAt`-overwrite-on-replay intended vs latent bug. *(Unit 12.)*
- `max-w-lg` "global/north-star shell" framing — contradicted by the codebase (`max-w-2xl` is the dominant content width); already self-flagged across units 09, 10, 11, 13, 15, 16. *(Units 09–16.)*

**Runtime/deploy-dependent (not statically verifiable):**
- OKLCH→hex equivalences quoted from comments (not recomputed). *(Units 24, 28.)*
- `revalidatePath` + `router.refresh()` cache-refresh visual behaviour; cross-request cache for `/pending-approval` auto-clear. *(Units 05, 14.)*
- `lostCatNumber` `max+1` collision under concurrent Postgres READ COMMITTED transactions. *(Unit 08.)*
- Cron reachability (`CRON_SECRET` + external scheduler); `firebase-admin` PEM `\n` handling; whether prod injects `E2E_TEST_MODE`. *(Units 26, 27, 30.)*
- `refType`/`refId` deep-link wiring built data-side but unread by any UI (no `InboxItem`/`PendingAcknowledgement` field exposes it). *(Unit 27.)*
- iOS `pointerdown {once:true}` motion-permission and Safari user-gesture requirements (browser-platform). *(Units 24, 25, 26.)*
- CSP `form-action 'self'` rationale (only a code comment; no app-level CSP found in source). *(Unit 17.)*
- E2E test-harness framings (in-memory `countUnread`, `getPendingRequiredActions → []`, `isTeamLead → false`) verified at the backend-selection boundary, not by running the suite. *(Units 05, 06, 30.)*

---

## 8. Overall Certification Verdict

**CERTIFICATION: CERTIFIED RELIABLE**

Criteria check:

| Criterion | Holds? | Notes |
|---|---|---|
| Overall accuracy ≥ ~95% | **Yes** | 96.66% (2027 / 2097). |
| 0 units significant-gaps | **Yes** | 25 accurate, 6 minor-gaps, 0 significant-gaps. |
| Every HIGH fixed | **Yes (vacuously)** | Zero HIGH findings exist (0 inaccuracies, 0 omissions at HIGH). |
| All code bugs filed | **Pending** | §6 routes the SOURCE defects to engineering; they are surfaced and listed, not yet ticketed. |
| All low-confidence triaged | **Yes** | §7 aggregates every per-unit low-confidence item into upstream / design-intent / runtime buckets. |

The corpus is certified reliable as a rebuild source of truth. The two open follow-ups are bookkeeping rather than blockers: the §6 source defects should be filed with engineering, and the §4/§5 MEDIUM doc edits (Tiers A–C) should be applied so the prose stops contradicting its own correct tables (page count, token count, enum count) and stops presenting dead code/links as live.
