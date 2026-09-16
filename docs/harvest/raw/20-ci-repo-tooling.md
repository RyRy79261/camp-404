# Unit 20 — CI, commit hygiene, security headers, label sync, repo conventions

**Donor:** `quagga-portal` / AfrikaBurn Contributors App
(`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`)
**Target:** Camp 404 (`/home/ryan/repos/Personal/camp-404`)
All donor paths below are repo-relative to the donor root unless stated. Every claim
carries `path:line`.

---

## 1. Purpose

This unit is the donor's **repository operating system**: the GitHub Actions pipeline,
the aggregate required check, the commit-message contract, the issue/PR intake forms,
the label taxonomy-as-code plus its sync script, the shared response security headers,
the coverage-ratchet configuration, the deploy-time migration guard, the local e2e
harness script, and the prose law (`AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
`docs/triage.md`) that explains why each of them is shaped that way.

It matters to Camp 404 for three reasons:

1. **It is the same author's next iteration of Camp 404's own CI.** The donor's
   `ci.yml:326` says verbatim `# Same pattern as camp-404 and ops-board.` about the
   aggregate `CI pass` gate — Camp 404 already has that pattern
   (`/home/ryan/repos/Personal/camp-404/.github/workflows/ci.yml:216-256`). Everything
   layered on top of it in the donor (commitlint job, coverage matrix, persona e2e
   matrix, per-job `permissions`, artefact upload of the *server* log) is net-new
   for Camp 404.
2. **Camp 404 has literally none of the repo-hygiene surface.** Verified absent in the
   target: `.gitattributes`, `.husky/`, `commitlint.config.mjs`, `CONTRIBUTING.md`,
   `SECURITY.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/`,
   `.github/pull_request_template.md`, `config/security-headers.mjs`. Camp 404's
   `apps/web/next.config.ts` sets **no response headers at all**.
3. **Two things Camp 404 does *better*** and must not regress when porting: the
   `supply-chain` job running `pnpm audit --audit-level high`
   (`camp-404/.github/workflows/ci.yml:159-170`) with a curated
   `pnpm.auditConfig.ignoreGhsas` allow-list (`camp-404/package.json:44-54`), and the
   `schema-migration` job that applies committed migrations to an **ephemeral Neon
   branch per PR** and deletes it unconditionally
   (`camp-404/.github/workflows/ci.yml:122-157`). A repo-wide grep of the donor for
   `pnpm audit|dependabot|renovate|auditConfig` returns **zero hits outside
   `docs/sources/` prose** — the donor has no supply-chain gate, no Dependabot config
   and no Renovate config.

---

## 2. File inventory (line counts measured with `wc -l`)

### 2.1 GitHub Actions

| Path | Lines | What it is |
|---|---:|---|
| `.github/workflows/ci.yml` | 558 | The whole PR gate: `commitlint`, `ci`, 8-way `e2e` persona matrix, 8-way `coverage` matrix, `ci-pass` aggregate. ~55% of the file is load-bearing comment. |
| `.github/workflows/mobile.yml` | 114 | Nightly-only (`cron: "0 2 * * *"`) mobile-360 persona matrix. Deliberately has **no `pull_request` trigger**. |
| `.github/workflows/neon-pr-cleanup.yml` | 142 | `pull_request_target: [closed]` → delete the `preview/<head-branch>` Neon branch via the Neon REST API, with cursor pagination. |

### 2.2 GitHub repo metadata

| Path | Lines | What it is |
|---|---:|---|
| `.github/CODEOWNERS` | 40 | 7 owned paths, all `@RyRy79261`. Explicitly documents that it is inert until branch protection requires code-owner review. |
| `.github/pull_request_template.md` | 74 | 7 sections: Overview / What it touches / Testing / **Database** / **Risk** / Expected follow-ups / Notes, then a collapsed `<details>` "Supplementary context" with no length limit. |
| `.github/ISSUE_TEMPLATE/config.yml` | 10 | `blank_issues_enabled: false` + two `contact_links` (private security advisory, discussions). |
| `.github/ISSUE_TEMPLATE/bug.yml` | 116 | 7 fields + a 2-checkbox **required** `personal-data` confirmation group. |
| `.github/ISSUE_TEMPLATE/feature.yml` | 58 | 4 fields; the last, "Has this actually bitten someone?", is optional and called "the most useful box on the form" (`feature.yml:54-56`). |
| `.github/ISSUE_TEMPLATE/design.yml` | 74 | 5 fields + an "is it in the canvas yet?" dropdown + a non-required honesty checkbox. |
| `.github/ISSUE_TEMPLATE/copy.yml` | 47 | 4 fields; `kind` dropdown has 5 literal options incl. `"Overpromises — it claims something we don't deliver"`. |

### 2.3 Commit hygiene

| Path | Lines | What it is |
|---|---:|---|
| `commitlint.config.mjs` | 53 | `@commitlint/config-conventional` + a 10-value `scope-enum`, `header-max-length` 72, body/footer max-line 100 as **warnings**, 2 `ignores` predicates. |
| `.husky/commit-msg` | 8 | `npx --no -- commitlint --edit "$1"` with a 5-line comment. Installed by root `"prepare": "husky"` (`package.json:17`). |

### 2.4 Security headers / config

| Path | Lines | What it is |
|---|---:|---|
| `config/security-headers.mjs` | 40 | `SECURITY_HEADERS` array of 6 headers + `securityHeaders()` returning the Next `headers()` shape. Imported by all three `next.config.ts` (`apps/web/next.config.ts:5,21`; `apps/org/next.config.ts:5,16`; `apps/suppliers/next.config.ts:5,16`). |

### 2.5 Label taxonomy + sync

| Path | Lines | What it is |
|---|---:|---|
| `scripts/setup-github-labels.ts` | 47 | `pnpm labels:sync` entry point (`package.json:16` → `tsx scripts/setup-github-labels.ts`). |
| `packages/core/src/report-server/labels-sync.ts` | 100 | `syncGithubLabels()` + `parseRepoSlug()`; idempotent create-or-PATCH against the GitHub Labels API. |
| `packages/core/src/report.ts:147-345` | (of 590) | `GithubLabel` interface + `GITHUB_LABELS` (**34 labels** across 7 namespaces) + `reportLabels()`. |
| `packages/core/src/__tests__/issue-forms.test.ts` | 142 | Cross-checks `.github/ISSUE_TEMPLATE/*.yml` against `GITHUB_LABELS` — 6 assertions. |
| `docs/triage.md` | 204 | The triage contract: taxonomy table, "priority is never set by the reporter", the four actor labels, how to read a `source: in-app` issue, the 7-step routine. |

### 2.6 Repo conventions / prose law

| Path | Lines | What it is |
|---|---:|---|
| `AGENTS.md` | 382 | 8 hard engineering rules, product laws, a **Verification** section, process, git. (Camp 404's `AGENTS.md` is 203 lines and has no verification, no hard-rule numbering, no commit convention.) |
| `CONTRIBUTING.md` | 290 | Setup, the house rule, designer canvas protocol, commit convention (types table + scope table + 6 real examples), PR description guidance, "Before you push". |
| `SECURITY.md` | 124 | Private vulnerability reporting, "do not test against the live deployment", in/out-of-scope list, contributor rules, and a **Repository settings** checklist naming `CI pass` as the single required check. |
| `.gitattributes` | 34 | `*.pen -merge`, `design/brand/** binary`, `* text=auto eol=lf`, `*.png|*.jpg|*.ico binary`. |
| `.npmrc` | 3 | Byte-identical to Camp 404's. |
| `.prettierrc.json` | 8 | Byte-identical to Camp 404's. |
| `.prettierignore` | 18 | Camp 404's 11 lines + a `docs/sources/` block with a dated incident note. |
| `.gitignore` | 28 | Includes `.claude/worktrees/` and three donor-specific corpus exclusions. |
| `turbo.json` | 79 | 15 `globalEnv`, 9 tasks, and the 22-line `.next/dev` incident comment. |
| `package.json` | 37 | 8 root scripts incl. `test:coverage`, `e2e:local`, `labels:sync`, `prepare`. |

### 2.7 Build/deploy guard + local harness (CI-adjacent)

| Path | Lines | What it is |
|---|---:|---|
| `packages/db/src/migration-plan.ts` | 124 | **Pure**, I/O-free: `connectionHost`, `isPoolerConnection`, `planMigration`. |
| `packages/db/src/migrate.ts` | 280 | `runDeployMigrations()` + advisory-lock runner; re-exports the planners. |
| `packages/db/src/__tests__/migrate.test.ts` | 150 | 16 tests over the three pure functions. |
| `packages/db/src/__tests__/migrate-runner.test.ts` | 272 | 11 tests over lock/pool/seed lifecycle with a fake pool. |
| `scripts/e2e-local.sh` | 245 | The one runner CI and developers share. |
| `docker-compose.local.yml` | 67 | Postgres 16 + `wsproxy` + `local-neon-http-proxy`. |
| `e2e/playwright.config.ts` | 86 | 2 projects, env-driven retries/workers/timeouts, production-host refusal. |
| `e2e/lib/env.ts` | 196 | `TIMEOUTS`, `IS_CI`, `assertNotProductionUnlessAllowed()`. |
| `e2e/lib/dom.ts` | 17 | `appAlerts()` — the Next route-announcer trap fix. |

### 2.8 Coverage ratchet configs (all 8 workspaces)

| Path | Lines | Global floors (lines/statements/functions/branches) |
|---|---:|---|
| `packages/core/vitest.config.ts` | 128 | 90 / 89 / 92 / 82 + **13 per-file overrides** |
| `packages/ui/vitest.config.ts` | 64 | 89 / 88 / 83 / 84 |
| `packages/db/vitest.config.ts` | 65 | 73 / 74 / 63 / 75 |
| `packages/types/vitest.config.ts` | 29 | 97 / 97 / 97 / 97 |
| `packages/auth/vitest.config.ts` | 39 | 97 / 96 / 97 / 96 |
| `apps/web/vitest.config.ts` | 101 | 94 / 93 / 93 / 87 + **2 per-file overrides** |
| `apps/org/vitest.config.ts` | 102 | 95 / 94 / 94 / 84 |
| `apps/suppliers/vitest.config.ts` | 80 | 95 / 95 / 96 / 92 |

---

## 3. Capability list (exhaustive, each cited)

### CI pipeline (`.github/workflows/ci.yml`)

1. **Workflow-level least privilege.** `permissions: contents: read` at file scope
   (`ci.yml:18-19`), with the reasoning in a 6-line comment (`ci.yml:12-17`): "A
   compromised dependency in a build step then has no token worth stealing."
   *(Camp 404 declares `permissions` on only one job — `changes` at
   `camp-404/.github/workflows/ci.yml:15-17` — so every other job inherits repo
   defaults.)*
2. **Branch-scoped cancel-in-progress concurrency.** `group: ci-${{ github.ref }}`,
   `cancel-in-progress: true` (`ci.yml:21-23`). Camp 404 uses
   `ci-${{ github.workflow }}-${{ github.ref }}` (`camp-404/…/ci.yml:8-10`) — the
   donor's is narrower.
3. **Job `commitlint` — dual commit-convention enforcement** (`ci.yml:36-76`).
   `if: github.event_name == 'pull_request'`; `fetch-depth: 0` because the range check
   needs the merge base (`ci.yml:41-45`). Two steps: lint the PR title by piping
   `$PR_TITLE` into `pnpm exec commitlint` (`ci.yml:63-66`), then
   `commitlint --from <base.sha> --to <head.sha> --verbose` (`ci.yml:71-76`). Rationale
   verbatim: the repo *merges* rather than squashes, so every commit lands on `main`
   (`ci.yml:26-35`).
4. **Job `ci` — the fast gate.** One step,
   `pnpm turbo run lint typecheck test build` (`ci.yml:101-102`). No Next cache step,
   no per-task job split. *(Camp 404 splits these into 4 separate jobs each doing its
   own `pnpm install`, plus a Next build cache — `camp-404/…/ci.yml:39-120`.)*
5. **Job `e2e` — an 8-shard persona matrix, `fail-fast: false`** (`ci.yml:119-163`).
   The split is **by persona directory, not `--shard=n/8`**, argued at `ci.yml:128-137`:
   "A mechanical slice cannot be named". Each entry carries `persona`, a human `label`,
   and a `side` (`web|org|suppliers`).
6. **Per-shard worker count derived from credential sharing** (`ci.yml:205-224`).
   `E2E_WORKERS` is `1` for `god`, `org-staff`, `camp-lead`, `officer`, `supplier`
   (they all sign in as the same `E2E_GOD_EMAIL` principal) and `2` otherwise. The
   comment records the measurement: "2 workers → 2 failed / 19 passed, a DIFFERENT
   pair each run … 1 worker → clean, repeatedly."
7. **The unsharded `tests/` directory rides with the `anon` job** (`ci.yml:269-283`) —
   `./scripts/e2e-local.sh specs/anon tests` vs
   `./scripts/e2e-local.sh specs/${{ matrix.persona }}`. Reason: `e2e/tests/` is not a
   persona, so smoke + the adversarial authz suite "had NEVER run in the gate".
8. **The app *server* log is collected on failure** (`ci.yml:293-295`):
   `cp "${TMPDIR:-/tmp}/quagga-e2e/dev.log" server.log`. Rationale (`ci.yml:285-292`):
   without it "a page that takes 20s to render and a page that 500s look identical".
9. **Per-persona artefact upload**, `if: always()`, `retention-days: 14`,
   `if-no-files-found: ignore`, name `playwright-report-${{ matrix.persona }}`
   (`ci.yml:297-308`).
10. **Job `coverage` — an 8-shard workspace matrix with a change-scope gate**
    (`ci.yml:373-516`). `permissions: contents: read, pull-requests: write`
    (`ci.yml:376-378`). Each shard first runs an inline `git diff` scope check
    (`ci.yml:438-453`) and skips install + coverage when its `matrix.directory` and
    `.github/workflows/ci.yml` are both untouched. Rationale at `ci.yml:430-437`:
    "Plain `git diff`, not a third-party action: one less thing with write access."
11. **Coverage floors live in the workspace, not the workflow** (`ci.yml:332-339`) so
    `pnpm test:coverage` on a laptop enforces the same numbers. Ported from
    `RyRy79261/intake-tracker`.
12. **The coverage report action is pinned to a commit SHA, not a tag**
    (`ci.yml:512`): `davelosert/vitest-coverage-report-action@8b157684c6a6b259b97d45e72b44242865c0f6a5 # v2.12.2`,
    with a 4-line justification (`ci.yml:464-467`) — the step holds
    `pull-requests: write` on a public repo.
13. **Reporting never fails the shard**: `continue-on-error: true` (`ci.yml:511`), and
    the whole report step is skipped for fork PRs
    (`github.event.pull_request.head.repo.full_name == github.repository`,
    `ci.yml:503-506`) so a first-time contributor never sees a red check they cannot fix
    (`ci.yml:489-500`).
14. **The comment is updated in place, not deleted-and-reposted** (`ci.yml:471-487`) —
    it replaced a delete-then-post step that left a window where a cancelled run
    removed the comment without replacing it.
15. **`ci-pass` — one aggregate required check** (`ci.yml:518-558`).
    `if: always()`, `needs: [commitlint, ci, e2e, coverage]`. `ci`/`e2e`/`coverage` must
    be `success`; `commitlint` may be `success|skipped`. Argued at `ci.yml:310-331`:
    branch protection can only require checks *by name*, and a matrix leg nobody marked
    required "can go red without blocking a merge — the failure mode is silent."
    `needs.e2e.result` aggregates the whole matrix, so adding a persona needs no
    protection edit.

### Nightly mobile workflow (`.github/workflows/mobile.yml`)

16. **A permanently-red suite is kept off the PR path entirely** (`mobile.yml:3-21`).
    It used to live in `ci.yml` behind `if: schedule || workflow_dispatch`, which
    skipped correctly but rendered a literal `mobile · ${{ matrix.label }}` in the
    checks list, because GitHub cannot interpolate a matrix for a skipped job.
17. Same 8 personas, `E2E_PROJECTS: mobile-360`, `E2E_RETRIES: "0"` — "This job exists
    to produce a triage list, and a retry only re-pays for a failure already recorded."
    (`mobile.yml:92-95`). Artefacts under `mobile-report-<persona>` (`mobile.yml:108`).
18. **Promotion path is stated**: move a persona into `E2E_PROJECTS` on the gating job
    once its mobile failures reach zero (`mobile.yml:19-21`).

### Neon PR cleanup (`.github/workflows/neon-pr-cleanup.yml`)

19. **`pull_request_target`, not `pull_request`** (`neon-pr-cleanup.yml:36-48`), with a
    13-line justification: under `pull_request` a Dependabot-actor close gets the empty
    Dependabot secret store, `NEON_API_KEY` resolves to nothing, and the job leaks the
    branch it exists to remove. Safe because **this job checks out no PR code**.
20. **Cursor pagination over `?limit=10000`** (`neon-pr-cleanup.yml:92-112`) —
    Camp 404's version (`camp-404/…/neon-pr-cleanup.yml:52`) fetches one unpaginated
    page, which on an over-quota project can hide the target branch and produce "a
    false 'nothing to delete' and a silent leak, on exactly the project where the leak
    matters most."
21. **`select(.primary != true)`** guard (`neon-pr-cleanup.yml:114-123`) — present in
    both repos, but the donor's comment states why it is the guard that matters most:
    the primary branch *is* production.
22. Prefix match on `preview/${HEAD_REF}` rather than reconstructing the slug
    (`neon-pr-cleanup.yml:24-34`), bounded curl (`--connect-timeout 10 --max-time 30
    --retry 3 --retry-delay 5`, `neon-pr-cleanup.yml:85`), fork short-circuit at the
    job level (`neon-pr-cleanup.yml:56-59`), accepts HTTP 200 or 202 on DELETE
    (`neon-pr-cleanup.yml:136`).

### Commit hygiene

23. **Conventional Commits with an enforced workspace `scope-enum`**
    (`commitlint.config.mjs:16-31,36`). Unlisted scope fails: "`fix(accounts):` looks
    reasonable and names nothing that exists" (`commitlint.config.mjs:12-13`).
24. **`header-max-length` 72, not 100** (`commitlint.config.mjs:40`) — GitHub truncates
    list views around there.
25. **Body/footer line length warn (severity 1), never fail**
    (`commitlint.config.mjs:44-45`) — hard-wrapping a URL to satisfy a linter makes the
    message worse.
26. **Two `ignores` predicates** (`commitlint.config.mjs:49-52`):
    `/^Merge (branch|pull request|remote-tracking)/` and `/^Revert "/`.
27. **Local hook + CI, deliberately redundant** (`.husky/commit-msg:1-8`,
    `ci.yml:32-35`): "a hook only binds a machine that has run `pnpm install`, and
    `--no-verify` skips it. This does not."
28. **The convention is documented for humans with a types table (10 rows), a scope
    list, comma-separation guidance, and 6 real examples from the repo's own history**
    (`CONTRIBUTING.md:143-192`), plus an enforcement table naming the escape hatch
    (`CONTRIBUTING.md:199-206`).

### Security headers

29. **Six response headers on every route of every app**
    (`config/security-headers.mjs:15-35`), wired via `headers: securityHeaders` in each
    `next.config.ts`.
30. **Deliberately not a full CSP** (`config/security-headers.mjs:7-12`): a strict
    `script-src` needs per-request nonces through Next's inline bootstrap and
    "getting it subtly wrong white-screens the app". `frame-ancestors` is the part that
    closes the reported hole and cannot break a page never meant to be framed.
31. **Clickjacking is fixed twice** — `Content-Security-Policy: frame-ancestors 'none'`
    *and* `X-Frame-Options: DENY` (`config/security-headers.mjs:16-19`) — for browsers
    and proxies that only read the old one.
32. **Provenance recorded**: added 27 Jul 2026, audit finding M6, because the org
    console was framable and "a clickjacked click could reach a destructive server
    action — `deleteSupplier` among them" (`config/security-headers.mjs:3-5`).

### Label taxonomy + sync

33. **The taxonomy is code, in one place** (`packages/core/src/report.ts:162-345`), and
    is the *same* list the in-app reporter applies (`reportLabels`,
    `report.ts:357-373`) and the sync script pushes.
34. **`namespace: value` is deliberate** so a triager or a routine can `split(":")` and
    read type/status/priority/area deterministically (`report.ts:154-161`,
    `docs/triage.md:28-30`).
35. **Idempotent, non-destructive sync** (`labels-sync.ts:8-11`): existing labels are
    PATCHed in place, missing ones POSTed, and "labels NOT in the list are left
    completely alone — this owns its taxonomy, not the repository's."
36. **`encodeURIComponent` on the label name** (`labels-sync.ts:51-56`) — names contain
    a space and a colon, and "an unencoded `type: bug` requests a label GitHub has no
    record of and every update silently becomes a create."
37. **Per-label failure is collected, not thrown** (`labels-sync.ts:36-38,64-84`), and
    the CLI **exits 1 on any failure** because "A partial sync leaves the reporter able
    to apply a label the repo does not have" (`scripts/setup-github-labels.ts:41-44`).
38. **`parseRepoSlug`** rejects anything that is not exactly `owner/repo` with both
    halves non-empty after trim (`labels-sync.ts:91-100`).

### Issue / PR intake

39. **No blank issues** (`config.yml:3`), plus a contact link straight to the private
    security-advisory form (`config.yml:5-7`).
40. **Four typed forms**, each applying exactly one `type:` plus `needs-triage`
    (`bug.yml:3`, `feature.yml:3`, `design.yml:3`, `copy.yml:3`).
41. **The bug form teaches URL hygiene inline**: "stop at the `?`" because reset links
    carry tokens and the repo is public (`bug.yml:63-71`).
42. **Two *required* pre-post confirmations** on the bug form (`bug.yml:103-116`) — the
    only defence on this path, since a form does *not* go through
    `report-sanitize.ts` (`issue-forms.test.ts:102-112`).
43. **The console field warns that nothing is filtered** on this route, unlike an
    in-app report (`bug.yml:91-99`).
44. **PR template's Database and Risk sections are load-bearing, not ceremonial**
    (`pull_request_template.md:37-52`, `CONTRIBUTING.md:222-226`), and the template
    ends with a **collapsed, length-unlimited** "Supplementary context" block
    (`pull_request_template.md:67-74`) explicitly to stop a long description burying
    the migration note (`AGENTS.md:279-287`).
45. **The template's HTML comment restates the commit convention and the scope list**
    (`pull_request_template.md:1-13`) so a contributor never has to leave the page.

### Repo conventions

46. **`*.pen -merge`** (`.gitattributes:25`) with a 24-line explanation: a line-level
    merge of a node tree produces "STRUCTURALLY VALID JSON that is semantically wrong …
    Pencil then opens it — and shows something subtly, quietly broken."
    **Diffs stay on deliberately** (`.gitattributes:19-20`).
47. **`* text=auto eol=lf`** and per-extension `binary` markers
    (`.gitattributes:28-34`).
48. **`.prettierignore` protects verbatim primary sources** (`.prettierignore:11-18`) —
    `pnpm format` once rewrote 664 mirrored source files, turning `*emphasis*` into
    `_emphasis_` and reflowing every table, "which makes a citation impossible to check
    against what was actually published."
49. **`.gitignore` excludes agent worktrees** (`.gitignore:27-28`).
50. **`turbo.json` build outputs exclude `!.next/dev/**`** (`turbo.json:40-46`) with a
    22-line incident comment (`turbo.json:25-39`) — Camp 404 landed the identical
    exclusion at `camp-404/turbo.json:31` (commit `c270377`) but carries **no comment**,
    so the reason is undocumented in the target.
51. **`typecheck.dependsOn: ["^build", "build"]`** (`turbo.json:56-59`) — Next generates
    `routes.d.ts` at build, so a bare `tsc` in an app dir without a prior build may fail
    (`AGENTS.md:134-135`). Camp 404 has only `["^build"]`
    (`camp-404/turbo.json:41-44`), which is a latent typecheck gap for its own
    `typedRoutes: true`.
52. **`.env.example` states the turbo `globalEnv` rule as a convention**: "When you ADD
    a variable, also add it to turbo.json `globalEnv` in the same change (mirrored from
    the Camp 404 convention)" (`.env.example:7-9`).
53. **The house rule** (`CONTRIBUTING.md:60-71`): "Nothing in this product may claim
    something that isn't true … It is the single most common reason a change gets sent
    back."
54. **A verification discipline section** (`AGENTS.md:216-244`) with four named
    incidents, and two *test-shapes that pass for the wrong reason* — asserting an
    absence against an unpainted page, and a fixture whose values are outside the domain
    vocabulary (`officerKey: "safety"`, not in the `OfficerKey` enum; deleting the
    consent filter entirely left all 54 tests green).
55. **`SECURITY.md` §Repository settings** (`SECURITY.md:95-124`): require exactly one
    status check, `CI pass`; leave the three `Vercel – …` external statuses unrequired;
    enable private vulnerability reporting, secret scanning + push protection; exclude
    `better-auth` from Dependabot auto-merge.
56. **`docs/triage.md` codifies "priority is never set by the reporter"** as a boundary,
    not a convention (`docs/triage.md:53-60`), and the three-way `Cause:` rule — a
    mechanism with file+line, the commit that already fixed it, or what was checked and
    ruled out; "A comment with none of those three is a failed triage."
    (`docs/triage.md:190-193`).

### Coverage ratchet

57. **`test:coverage` in every workspace** (`vitest run --coverage`) and a turbo task
    `test:coverage` with `outputs: ["coverage/**"]` (`turbo.json:63-65`).
58. **`reporter: ["text", "json-summary", "json"]` + `reportOnFailure: true`** in all
    eight configs — `json-summary` is what the PR comment action reads
    (`packages/core/vitest.config.ts:9-12`).
59. **`coverage.include` counts every source file, not only imported ones**, so the
    percentage describes the package rather than the run
    (`packages/core/vitest.config.ts:13-15`).
60. **Apps scope coverage to `lib/` only** (`apps/web/vitest.config.ts:18-33`) because
    including `app/**` and `components/**` yields "a figure around 3%: a number that
    describes the test RUNNER rather than the code. This repo measured that number and
    deliberately rejected it."
61. **Per-file floors at 100% for the privacy/safety core**
    (`packages/core/vitest.config.ts:41-76`): `report-sanitize.ts`, `report-screen.ts`,
    `medical-access.ts`, `privacy.ts`, `id-retention.ts`, `entitlements.ts`.
62. **Every floor is annotated with the measured run it was derived from** and the
    standing rule "never lower one to make a build pass — the drop is the signal, and
    lowering the floor deletes it" (repeated in all 8 files).
63. **Honest exclusions with reasons**: `schema.ts` excluded from `packages/db` coverage
    even though including it would *improve* the numbers by ~8 points
    (`packages/db/vitest.config.ts:16-37`); `lib/auth-client.ts` excluded from
    `apps/web` because its body is one config literal (`apps/web/vitest.config.ts:37-43`).
64. **`oxc: { jsx: { runtime: "automatic" } }`** in `apps/org` and `apps/suppliers`
    (`apps/org/vitest.config.ts:8-18`) — without it v8 silently drops `lib/gate.tsx`
    from the denominator with only a warning, "a config that claims to measure `.tsx`
    while measuring only `.ts`."
65. **`server-only` aliased to a local stub** in all three app configs
    (`apps/web/vitest.config.ts:92-100`).
66. **Elevated jsdom timeouts in `packages/ui`** — `testTimeout`/`hookTimeout`
    `30_000` — with the measured diagnosis of why 5s failed only in the `ci` job and not
    in the coverage shard (`packages/ui/vitest.config.ts:11-27`).

### Deploy-time migration guard

67. **`planMigration()` is a pure, env-only decision function** returning
    `{kind:"skip",reason} | {kind:"run",connectionString,usingUnpooled}`
    (`migration-plan.ts:51-124`), split out of the runner precisely so a console (and a
    test) can ask "would this deploy migrate safely?" without opening a pool
    (`migration-plan.ts:1-16`).
68. **Four refusal rules, digit-exact** — see §6.
69. **Advisory-locked runner** (`migrate.ts:124+`) with a fixed key
    `MIGRATION_ADVISORY_LOCK_KEY = 42_97_2027` (`migrate.ts:82`) and
    `LOCK_TIMEOUT_MS = 120_000` (`migrate.ts:98`); `statement_timeout` bounds the *wait*
    then is lifted to 0 so a long migration is never aborted (`migrate.ts:90-97`).
70. **The build script is the only thing that applies migrations**:
    `"build": "pnpm --filter @quagga/db db:migrate:deploy && next build"` in all three
    apps (`apps/web/package.json:8`, `apps/org/package.json`, `apps/suppliers/package.json`).

### Local e2e harness (`scripts/e2e-local.sh`)

71. **CI and developers run the same script** (`ci.yml:116-118`) "so the thing CI runs
    and the thing a developer runs cannot drift apart."
72. **Port reclamation by PID with 3 escalating attempts, then refuse to run**
    (`e2e-local.sh:124-141`) — because `pkill -f "next dev"` never matched: Next renames
    its process to `next-server (v16.2.11)` once booted, so the pattern only hit the
    `sh -c` wrapper and the real listener survived, and the suite silently tested the
    previous run's build (`e2e-local.sh:111-123`).
73. **Readiness loop that *fails* instead of falling through** (`e2e-local.sh:193-207`),
    60 attempts × 2s per port, printing the last 30 lines of the server log on failure.
74. **`Module not found` in the dev log aborts the run** (`e2e-local.sh:209-213`).
75. **`E2E_RESET_DB=1` drops BOTH `public` and `drizzle` schemas** (`e2e-local.sh:62-70`)
    — dropping only `public` leaves the migration tracker and the migrator then reports
    "up to date" against an empty database.
76. **`rm -rf apps/*/.next/cache apps/*/.next/dev` before a dev-mode run**
    (`e2e-local.sh:182`), the second half of the 550 GB fix.
77. **`turbo run build --concurrency=1`** for the three apps (`e2e-local.sh:153-156`) —
    three simultaneous `next build`s "took down a 32GB dev machine outright."
78. **`E2E_SERVE` defaults to `build` in CI and `dev` locally**
    (`e2e-local.sh:101`), with the cost of `dev` quantified: 65 pages, each compiled on
    first request, several workers blocking on the same cold compile.
79. **The auth rate limiter is raised for the local run only** —
    `AUTH_RATE_LIMIT_WINDOW_SECONDS=60`, `AUTH_RATE_LIMIT_MAX=10000` — with
    "NEVER set these on a real deployment" (`e2e-local.sh:36-42`).
80. **God credentials are exported unconditionally** because without them
    `specs/god specs/org-staff` reported "37 skipped, 2 passed" and exited 0 — "A gate
    that cannot fail is not a gate." (`e2e-local.sh:44-53`).
81. **`assertNotProductionUnlessAllowed()`** refuses to point the destructive suite at
    the three production hosts unless `E2E_ALLOW_PRODUCTION=true`
    (`e2e/lib/env.ts:169-194`), called at module scope in the Playwright config
    (`e2e/playwright.config.ts:15`).
82. **`forbidOnly: IS_CI`** (`e2e/playwright.config.ts:32`) so a stray `test.only` fails
    CI rather than silently narrowing the run.
83. **`appAlerts()`** excludes `#__next-route-announcer__` (`e2e/lib/dom.ts:15-17`) — a
    bare `getByRole("alert")` can never resolve to one element *in any Next app*, and
    nine assertions in the suite were written against that impossible contract.

---

## 4. Data model

**This unit owns no database tables, columns or pgEnums.** `grep` for `pgTable` /
`pgEnum` across `.github/`, `config/`, `scripts/`, `commitlint.config.mjs` and
`.husky/` returns nothing. The only *data* it owns is:

### 4.1 `GITHUB_LABELS` — 34 labels, verbatim (`packages/core/src/report.ts:162-345`)

```
type: bug            d73a4a  Something is broken
type: feature        0e8a16  New capability
type: enhancement    a2eeef  Improvement to something that exists
type: docs           0075ca  Documentation only
type: chore          fef2c0  Refactor, deps, tooling, tests
type: copy           bfd4f2  Wording in the product — wrong, unclear, or overpromising
type: design         d876e3  How a screen looks, reads or behaves

needs-triage         e99695  Entry state — not yet categorised
status: needs-info   d4c5f9  Waiting on the person who filed it — never on an in-app report
status: in-progress  c2e0c6  Actively being worked
status: blocked      b60205  Cannot proceed yet
status: wontfix      e6e6e6  Acknowledged, will not action
status: duplicate    cfd3d7  Tracked elsewhere

priority: critical   b60205  Data loss, privacy breach, or the burn is blocked
priority: high       d93f0b  Major feature broken
priority: medium     fbca04  Noticeable, has a workaround
priority: low        0e8a16  Minor or cosmetic

app: web             1d76db  Participant app
app: org             1d76db  Organiser console
app: suppliers       1d76db  Supplier portal

area: registration   c5def5  The six-section theme-camp wizard and its review loop
area: camps          c5def5  Camps, members, invites, roles
area: projects       c5def5  Art projects and mutant vehicles
area: questionnaires c5def5  Questionnaire build, activation, fill and results
area: notifications  c5def5  In-app notifications, bulletins, email
area: suppliers      c5def5  Supplier onboarding, documents, standing
area: auth           c5def5  Sign-in, accounts, sessions, deletion
area: privacy        c5def5  Personal data, medical access, retention, audit
area: data           c5def5  Schema and migrations
area: ui             c5def5  Layout, styling, components

auto-triaged         ededed  Triage was performed by a routine, not a person
needs-human          f9d0c4  Requires a person's judgement — a routine may propose, never decide
agent: ready         5319e7  Triaged and scoped — safe for an autonomous agent to implement
agent: in-progress   8a63d2  An agent is working it (has an open PR)

source: in-app       5319e7  Filed by the in-app reporter — a user's words, published under the maintainer's token
```

Interface (`report.ts:147-153`):

```ts
export interface GithubLabel {
  name: string;
  /** 6-digit hex, no leading "#". */
  color: string;
  description: string;
}
```

### 4.2 `SCOPES` — the commitlint scope enum, verbatim (`commitlint.config.mjs:16-31`)

```js
const SCOPES = [
  // apps/*
  "web", "org", "suppliers",
  // packages/*
  "core", "db", "ui", "auth", "types",
  // the e2e workspace
  "e2e",
  // root-level: turbo, workspace tooling, CI, docs about the repo itself
  "repo",
];
```

### 4.3 `SECURITY_HEADERS` — 6 entries, verbatim (`config/security-headers.mjs:15-35`)

| key | value |
|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |

### 4.4 `turbo.json` `globalEnv` — 15 entries, verbatim (`turbo.json:5-21`)

`NODE_ENV`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION`,
`AUTH_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_RATE_LIMIT_MAX`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `GOD_EMAILS`, `BLOB_READ_WRITE_TOKEN`,
`PGCRYPTO_KEY`, `NEON_LOCAL_PROXY`.

Overlap with Camp 404's 21-entry `globalEnv` (`camp-404/turbo.json:5-27`): exactly
`NODE_ENV`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `PGCRYPTO_KEY`.

### 4.5 Turbo task table diff

| task | donor (`turbo.json`) | Camp 404 (`camp-404/turbo.json`) |
|---|---|---|
| `build` | `dependsOn ["^build"]`, outputs `.next/**`, `!.next/cache/**`, `!.next/dev/**`, `dist/**`, `out/**` | identical output set (`:31`) |
| `dev` | `cache:false, persistent:true` | same |
| `lint` | `dependsOn ["^build"]`, `outputs []` | same |
| `typecheck` | **`dependsOn ["^build","build"]`** | `dependsOn ["^build"]` |
| `test` | `outputs []` | `outputs ["coverage/**"]` (nothing writes it) |
| `test:coverage` | `outputs ["coverage/**"]` | **absent** |
| `db:generate` / `db:migrate` | `cache:false` | same |
| `db:migrate:deploy` / `db:seed` | `cache:false` | **absent** |
| `storybook` / `build-storybook` / `test:e2e` | **absent** | present |

### 4.6 Environment variables read by this unit

**CI secrets/vars:** `NEON_API_KEY`, `NEON_PROJECT_ID` (both workflows);
`BETTER_AUTH_SECRET: ci-only-placeholder-secret-not-a-real-one-0000` and
`PGCRYPTO_KEY: ci-only-pgcrypto-key-0000000000` as literal CI placeholders
(`ci.yml:267-268`, `mobile.yml:96-97`).
**Label sync:** `GITHUB_TOKEN` (required), `GITHUB_REPO` (optional, defaults
`RyRy79261/afrikaburn-contributors-app`, `setup-github-labels.ts:15`).
**e2e harness knobs:** `E2E_RESET_DB`, `E2E_WORKERS`, `E2E_TEST_TIMEOUT`,
`E2E_SERVE`, `E2E_RETRIES`, `E2E_PROJECTS`, `E2E_SHARD`, `E2E_GOD_EMAIL`,
`E2E_GOD_PASSWORD`, `E2E_MAIL_MODE`, `E2E_REQUIRE_EMAIL_VERIFICATION`,
`E2E_ALLOW_PRODUCTION`, `E2E_EXPECT_TIMEOUT`, `E2E_ACTION_TIMEOUT`,
`E2E_MAIL_TIMEOUT`.
**Migration guard:** `DATABASE_URL_UNPOOLED`, `DATABASE_URL`, `VERCEL_ENV`, `VERCEL`,
`NEON_LOCAL_PROXY`.

---

## 5. Public API surface (exported signatures, verbatim)

```ts
// config/security-headers.mjs:14-15
/** @type {{ key: string, value: string }[]} */
export const SECURITY_HEADERS = [ /* 6 entries */ ];

// config/security-headers.mjs:37-40
/** The `headers()` entry for a Next config: every route, same set. */
export async function securityHeaders() {
  return [{ source: "/:path*", headers: SECURITY_HEADERS }];
}
```

```ts
// packages/core/src/report-server/labels-sync.ts:17-21
export interface LabelSyncResult {
  created: string[];
  updated: string[];
  failed: { name: string; status: number }[];
}

// packages/core/src/report-server/labels-sync.ts:39-44
export async function syncGithubLabels(input: {
  token: string;
  owner: string;
  repo: string;
  labels?: readonly GithubLabel[];
}): Promise<LabelSyncResult>;

// packages/core/src/report-server/labels-sync.ts:91-93
export function parseRepoSlug(
  slug: string,
): { owner: string; repo: string } | null;
```

```ts
// packages/core/src/report.ts:147-153
export interface GithubLabel { name: string; color: string; description: string }

// packages/core/src/report.ts:162
export const GITHUB_LABELS: readonly GithubLabel[] = [ /* 34 */ ] as const;

// packages/core/src/report.ts:357-361
export function reportLabels(
  type: ReportType,
  surface: ReportSurface,
  flags: readonly ReportFlag[] = [],
): string[];
```

```ts
// packages/db/src/migration-plan.ts:19
export function connectionHost(connectionString: string): string | null;

// packages/db/src/migration-plan.ts:32
export function isPoolerConnection(connectionString: string): boolean;

// packages/db/src/migration-plan.ts:51-53
export type MigrationPlan =
  | { kind: "skip"; reason: string }
  | { kind: "run"; connectionString: string; usingUnpooled: boolean };

// packages/db/src/migration-plan.ts:61
export type MigrationEnv = Readonly<Record<string, string | undefined>>;

// packages/db/src/migration-plan.ts:63
export function planMigration(env: MigrationEnv = process.env): MigrationPlan;

// packages/db/src/migrate.ts:124
export async function runDeployMigrations(): Promise<void>;
```

```ts
// e2e/lib/env.ts:154-163
export const TIMEOUTS = {
  test:   Number(process.env.E2E_TEST_TIMEOUT   ?? 90_000),
  expect: Number(process.env.E2E_EXPECT_TIMEOUT ?? 15_000),
  action: Number(process.env.E2E_ACTION_TIMEOUT ?? 20_000),
  mail:   Number(process.env.E2E_MAIL_TIMEOUT   ?? 45_000),
};

// e2e/lib/env.ts:166
export const IS_CI = process.env.CI === "true" || process.env.CI === "1";

// e2e/lib/env.ts:169
export function assertNotProductionUnlessAllowed(): void;

// e2e/lib/dom.ts:15
export function appAlerts(scope: Page | Locator): Locator;
```

```jsonc
// commitlint.config.mjs:33-53 — the exported config object
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum":            [2, "always", SCOPES],
    "header-max-length":     [2, "always", 72],
    "body-max-line-length":  [1, "always", 100],
    "footer-max-line-length":[1, "always", 100],
  },
  ignores: [
    (message) => /^Merge (branch|pull request|remote-tracking)/.test(message),
    (message) => /^Revert "/.test(message),
  ],
};
```

Root scripts (`package.json:7-18`):

```json
"build":         "turbo run build",
"dev":           "turbo run dev",
"lint":          "turbo run lint",
"typecheck":     "turbo run typecheck",
"test":          "turbo run test",
"test:coverage": "turbo run test:coverage",
"format":        "prettier --write \"**/*.{ts,tsx,md,json}\"",
"e2e:local":     "./scripts/e2e-local.sh",
"labels:sync":   "tsx scripts/setup-github-labels.ts",
"prepare":       "husky"
```

---

## 6. Validation and edge-case rules (digit-exact)

### 6.1 commitlint

- Header ≤ **72** characters, severity **2** (error) — `commitlint.config.mjs:40`.
- Body line ≤ **100**, severity **1** (warning) — `:44`.
- Footer line ≤ **100**, severity **1** (warning) — `:45`.
- `scope-enum` severity **2**, `"always"`, **10** allowed values — `:36` + `:16-31`.
- Two ignore predicates — `:49-52`.
- CI lints the PR title *and* the commit range `base.sha … head.sha` — `ci.yml:66,73-76`.

### 6.2 GitHub label constraints (asserted in `report.test.ts:42-68`)

- `description.length` ≤ **100** — "GitHub caps a label description at 100 characters
  and rejects a longer one with a 422 — which is how the first sync of this taxonomy
  failed" (`report.ts:338-341`).
- `color` must match `/^[0-9a-f]{6}$/` (`report.test.ts:52`).
- `name.length` ≤ **50** (`report.test.ts:53`).
- No duplicate names (`report.test.ts:57`).
- Every label `reportLabels()` returns must exist in `GITHUB_LABELS`
  (`report.test.ts:62-68`).

### 6.3 Issue-form invariants (`issue-forms.test.ts`)

- `formFiles()` = every `*.yml` in `.github/ISSUE_TEMPLATE/` except `config.yml`
  (`:45-49`).
- Labels are read with `/^labels:[ \t]*(\[.*\])[ \t]*$/m` — **top-level, flow style, one
  line**; a form that stops matching **throws** rather than silently skipping
  (`:52-63`).
- `files.length > 0` (`:68-71`) — "A glob that matches nothing passes every `for` loop
  under it in silence."
- Every form label ∈ `GITHUB_LABELS` (`:73-84`).
- Every form applies `needs-triage` (`:86-92`).
- Every form applies **exactly one** `type:` label (`:94-100`).
- `bug.yml`'s `personal-data` checkbox group keeps **≥ 2** `- label:` entries each
  immediately followed by `required: true` (`:102-131`). The block is isolated by
  splitting on `/\n(?= {2}- type: )/` and finding the section matching
  `/^ {4}id: personal-data$/m`, then matching `/^ *- label: .*\n *required: true$/gm` —
  two narrowings that earlier versions got wrong (counting `validations: required: true`
  left the test green with both confirmations deleted; counting file-wide would pass if
  the two were deleted and a required checkbox added elsewhere).
- **No form may apply a `priority:` label** (`:133-141`).

### 6.4 `planMigration()` decision table (`migration-plan.ts:63-124`)

| condition | outcome |
|---|---|
| `!DATABASE_URL_UNPOOLED && !DATABASE_URL && VERCEL_ENV === "production"` | **throws** — "PRODUCTION DEPLOY with no database configured" (`:73-79`) |
| `!DATABASE_URL_UNPOOLED && !DATABASE_URL` otherwise | `{kind:"skip"}`, exit 0 — preserves the env-less boot law (`:80-85`) |
| `NEON_LOCAL_PROXY === "1"` | pooler + deploy guards **skipped entirely** (`:70,89`) |
| host matches `/-pooler\./i` or `/pgbouncer/i`, or `?pgbouncer=true` | **throws**, *regardless of environment* (`:90-97`, detection at `:32-42`) |
| `!DATABASE_URL_UNPOOLED && (VERCEL || VERCEL_ENV)` — i.e. **any** Vercel deploy incl. preview | **throws** (`:109-116`) |
| otherwise | `{kind:"run", connectionString, usingUnpooled: Boolean(unpooled)}` (`:119-123`) |

The preview-deploy case is not hypothetical: the comment at `:98-108` records that the
guard once read `isProductionDeploy` only, and "it double-seeded the real database …
40 suppliers where there should have been 20."

Constants: `MIGRATION_ADVISORY_LOCK_KEY = 42_97_2027` (`migrate.ts:82`) — "Do not change
it", identity across all three apps is what serialises them. `LOCK_TIMEOUT_MS = 120_000`
(`migrate.ts:98`), applied as both `statement_timeout` and `lock_timeout` during
acquisition, then `statement_timeout` lifted to 0.

### 6.5 CI numeric constants

- `e2e` job `timeout-minutes: 30` (`ci.yml:122`); `mobile` likewise (`mobile.yml:45`).
- `E2E_TEST_TIMEOUT: "180000"` — "~1.5x the slowest real test, not spare room"
  (`ci.yml:238`); Playwright default is `90_000` (`e2e/lib/env.ts:156`).
- `E2E_RETRIES: "1"` in CI (`ci.yml:258`), `"0"` nightly (`mobile.yml:94`); the
  Playwright config's own default is `IS_CI ? 1 : 0` (`playwright.config.ts:41`).
- `E2E_WORKERS`: `1` for the 5 god-sharing personas, `2` otherwise (`ci.yml:219-224`);
  8 jobs × 2 = 16 concurrent for the isolated shards.
- pnpm pinned to `10.30.0` in **every** setup step (`ci.yml:50,87,170,422`;
  `mobile.yml:72`); Node `22` with `cache: pnpm`.
- Nightly cron `"0 2 * * *"` UTC (`mobile.yml:25`).
- Artefact retention: **14** days for e2e/mobile reports (`ci.yml:307`,
  `mobile.yml:112`); Camp 404 uses **7** (`camp-404/…/ci.yml:213`).
- `pnpm install --no-frozen-lockfile` everywhere (`ci.yml:59,99,179,457`) — the comment
  at `ci.yml:95-97` says to switch to `--frozen-lockfile` once the lockfile is
  committed. **It is committed** (`pnpm-lock.yaml`, 270,399 bytes), so this is a live
  stale-comment/stale-config defect. Camp 404 already uses `--frozen-lockfile`.
- `e2e-local.sh`: readiness loop 60 attempts × 2s = 120s per port (`:196`); port
  reclamation 3 attempts, SIGKILL on attempt 2 (`:125-140`); `sleep 2` between
  (`:109,139`); `tail -30` of the log on failure (`:156,204`); `head -5` of module-not-found
  lines (`:211`).

---

## 7. UX behaviours (the human-facing surfaces this unit owns)

- **Checks list on a PR**: `commit conventions`, `lint · typecheck · test · build`,
  eight `e2e · <persona · description>` rows, eight `coverage · <workspace>` rows, and
  `CI pass`. The e2e job names are prose (`"ORG system manager · anti-lockout,
  escalation refusals"`, `ci.yml:159`) precisely so a red row explains itself without
  opening a log.
- **The coverage comment** is one per workspace, named by `matrix.label`, edited in
  place so it keeps a stable anchor position in the conversation, with the run number
  and commit in its footer ("#154 for commit c69b1fb", `ci.yml:479-481`), and
  `file-coverage-mode: changes` so only changed files are tabulated (`ci.yml:516`).
- **Issue chooser**: no blank issue; four named forms; two contact links, the first of
  which routes security reports to the private advisory form
  (`config.yml:5-7`).
- **Bug form flow**: which app (4 options incl. "Not sure") → what happened → what you
  expected → where you saw it (3 options) → page address (optional, "stop at the `?`")
  → screenshot → console error (`render: text`) → two required confirmations.
- **PR form**: `Database` and `Expected follow-ups` both pre-filled with `None.`
  (`pull_request_template.md:46,60`) — "'None.' is a real answer to both, and it means
  something different from silence — it says you checked" (`CONTRIBUTING.md:245-247`).
- **Testing checklist** in the PR body has two unchecked boxes:
  `pnpm -w exec turbo run lint typecheck test build` and "Affected e2e shard(s):"
  (`pull_request_template.md:34-35`).
- **A failing local commit** prints commitlint's own output via the husky hook, with the
  documented escape hatch `git commit --no-verify` — and the hook comment states that
  CI will still refuse it (`.husky/commit-msg:7`).
- **Designer canvas protocol** is a 5-step social protocol (say you're taking it, pull
  first, edit, push the moment you stop, say you're done —
  `CONTRIBUTING.md:92-99`) backed by the `-merge` attribute.

---

## 8. Test coverage of this unit

| Test file | Lines | What it pins |
|---|---:|---|
| `packages/core/src/__tests__/issue-forms.test.ts` | 142 | 6 assertions binding `.github/ISSUE_TEMPLATE/*.yml` to `GITHUB_LABELS` (§6.3). Reads the real files off disk via `import.meta.url` + 4 `..` hops (`:33-42`). |
| `packages/core/src/__tests__/report.test.ts:42-68` | (of ~230) | Label length/colour/name limits, duplicate names, `reportLabels ⊆ GITHUB_LABELS`. |
| `packages/db/src/__tests__/migrate.test.ts` | 150 | 16 tests: 5 on `isPoolerConnection`, 2 on `connectionHost`, 9 on `planMigration` — including "ABORTS on a PREVIEW deploy without DATABASE_URL_UNPOOLED" (`:105`) and "permits a pooler-looking host only under NEON_LOCAL_PROXY" (`:143`). |
| `packages/db/src/__tests__/migrate-runner.test.ts` | 272 | 11 tests: one client given to the migrator (`:146`), bounded wait then unbounded migration (`:162`), one fixed lock key (`:173`), unlock+release+end on failure (`:181`), a failing unlock does not mask the original error (`:195`), seed rollback (`:221`). |
| `packages/db/src/__tests__/schema-invariants.test.ts` | 191 | Sweeps `getTableConfig()` over all 44 exported tables; snake_case names, no duplicates, every FK points at an exported table. |

**Not tested anywhere:** `config/security-headers.mjs` (a grep for `SECURITY_HEADERS`
or `frame-ancestors` in any `*.test.ts`/`*.spec.ts` returns nothing),
`scripts/setup-github-labels.ts`, `labels-sync.ts` itself (only `GITHUB_LABELS` and
`parseRepoSlug`'s consumers are covered), `commitlint.config.mjs`, and the workflow YAML.
The workflows have no `actionlint` step.

Camp 404's equivalent surface: **zero** tests, because none of these files exist there.

---

## 9. Dependency footprint

**Root devDependencies the donor adds for this unit** (`package.json:19-27`):

```
@commitlint/cli               ^21.2.1
@commitlint/config-conventional ^21.2.0
husky                         ^9.1.7
tsx                           ^4.23.5     (runs scripts/setup-github-labels.ts and db:migrate:deploy)
prettier                      ^3.8.3      (Camp 404 already has)
turbo                         ^2.9.14     (Camp 404 already has)
typescript                    ^6.0.3      (Camp 404 already has)
```

**Per-workspace, for the coverage ratchet:** `@vitest/coverage-v8 ^4.1.10` in all 8
workspaces. Camp 404 has it in **none**, while `camp-404/turbo.json:45-47` already
declares `test: { outputs: ["coverage/**"] }` that nothing writes.

**GitHub Actions used:**
`actions/checkout@v4`, `pnpm/action-setup@v4` (pinned `version: 10.30.0`),
`actions/setup-node@v4` (`node-version: 22`, `cache: pnpm`),
`actions/upload-artifact@v4`,
`davelosert/vitest-coverage-report-action@8b157684c6a6b259b97d45e72b44242865c0f6a5` (v2.12.2).
Camp 404 additionally uses `dorny/paths-filter@v4`, `actions/cache@v4`,
`neondatabase/create-branch-action@v5`, `neondatabase/delete-branch-action@v3`, and
`pnpm/action-setup@v5` **without a pinned version** — the donor's explicit
`version: 10.30.0` is the safer form.

**Runtime deps of the ported code:** `securityHeaders()` has none (plain ESM, no imports).
`labels-sync.ts` uses global `fetch` only. `migration-plan.ts` uses only the global `URL`.
`setup-github-labels.ts` imports `labels-sync` by **relative path**
(`../packages/core/src/report-server/labels-sync`, `setup-github-labels.ts:10-13`), not
through the package barrel — deliberate, because `@quagga/core/report-server` is a
separate export subpath that pulls the Anthropic SDK.

**External services:** GitHub REST API `https://api.github.com` (`labels-sync.ts:15`) and
Neon Console API `https://console.neon.tech/api/v2` (`neon-pr-cleanup.yml:79`).

**Not present in the donor at all:** `.github/dependabot.yml`, `renovate.json`, any
`pnpm audit` invocation, any `auditConfig`. Verified by repo-wide grep.

---

## 10. AfrikaBurn / multi-tenant coupling

Assessed per asset. This unit is the **least coupled** of the whole donor — most of it
is pure repo plumbing.

**Zero coupling (drop-in after a scope rename):**
- `config/security-headers.mjs` — no domain nouns whatsoever. Only the header comment
  mentions "all three apps" and `deleteSupplier`.
- `.gitattributes` (minus the `design/brand/**` line if Camp 404 has no such dir —
  it does not; Camp 404 has `design/` with `app.pen`, so the `*.pen -merge` rule applies
  **directly and urgently**).
- `.npmrc`, `.prettierrc.json` — already byte-identical.
- `.husky/commit-msg`.
- `packages/db/src/migration-plan.ts` — pure env parsing, no tenancy.
- `e2e/lib/dom.ts`.

**Trivially decoupled (rename the vocabulary):**
- `commitlint.config.mjs` — `SCOPES` must become Camp 404's workspaces:
  `web`, `mobile`, `admin-cli`, `ui`, `db`, `types`, `core`, `ai-prompts`, `telegram`,
  `eslint-config`, `typescript-config`, `repo`. The donor's `org`/`suppliers`/`auth`
  entries are the org-split and the self-hosted-auth package; all three are dropped.
- `GITHUB_LABELS` — three coupled namespaces:
  - `app:` (`web`/`org`/`suppliers`) is **purely the three-app split**. Camp 404 has one
    app, so this namespace collapses to nothing — delete it, or repurpose it as a
    `surface:` namespace (`web`/`mcp`/`cli`/`telegram`).
  - `area:` values are AfrikaBurn domain nouns: `registration`, `camps`, `projects`,
    `suppliers`. Camp 404's equivalents: `roster`, `teams`, `questionnaires`,
    `notifications`, `invites`, `auth`, `privacy`, `data`, `ui`, `mcp`, `push`.
    `questionnaires`, `notifications`, `auth`, `privacy`, `data`, `ui` transfer verbatim.
  - `priority: critical` description says "the burn is blocked" — still true for Camp 404.
  - `type:`, `status:`, `agent:`, `needs-triage`, `needs-human`, `auto-triaged`,
    `source: in-app` are **entirely generic** — 17 of the 34 labels port unchanged.
- Issue forms — the "Which app?" dropdown (`bug.yml:15-26`, `design.yml:16-26`) is the
  three-app split; Camp 404 replaces it with a surface dropdown or drops the field. The
  "Who is this for?" options in `feature.yml:40-45` are AfrikaBurn personas. Everything
  else — the URL-token warning, the two required confirmations, the wording-fix form's
  five `kind` options — is domain-free.
- `.github/CODEOWNERS` — path list maps cleanly: `/packages/db/migrations/`,
  `/packages/db/src/schema.ts`, `/packages/core/`, `/.github/`, `/turbo.json`,
  `/AGENTS.md` all exist in Camp 404. `/packages/auth/` does not (Camp 404 uses Neon
  Auth); substitute `/apps/web/lib/mcp/` and `/packages/db/src/crypto.ts`.

**Structurally coupled — do NOT lift as-is:**
- **The 8-persona e2e matrix** (`ci.yml:138-163`, `mobile.yml:48-65`). The personas are
  `anon`, `new-burner`, `camp-member`, `camp-lead`, `officer`, `org-staff`, `god`,
  `supplier` — five of those exist only because of the org-vs-participant-vs-supplier
  split. Camp 404's rank model is `captain` / derived team-lead / `member`
  (`camp-404/packages/db/src/schema.ts:40`), so the natural matrix is 4 legs at most:
  `anon`, `pending-member`, `member`, `captain`. The *shape* — split by named persona
  directory rather than `--shard=n/8`, `fail-fast: false`, aggregate in `ci-pass` — is
  what ports.
- **`scripts/e2e-local.sh`** assumes three apps on ports 3000/3001/3002, a
  `docker-compose.local.yml` with two Neon proxies, a `db:seed` script, and a god
  bootstrap that Camp 404 does not have. Camp 404's Playwright runs `next dev` with
  `E2E_TEST_MODE=1` against an **in-memory store**
  (`camp-404/apps/web/playwright.config.ts`), a design the donor explicitly rejects
  ("no DB back doors", `e2e/package.json` description). Port the *ideas* — port
  reclamation by PID, the failing readiness loop, the `Module not found` abort, the
  `.next/dev` cleanup — not the script.
- **The `coverage` matrix** lists 8 workspaces including `@quagga/org`,
  `@quagga/suppliers`, `@quagga/auth`. Camp 404's list would be `@camp404/{core,ui,db,
  types,telegram,ai-prompts}` + `@camp404/web (lib/ — server logic)`.
- **`docs/triage.md`** is 80% portable; the `app:` column and the reference to the
  Claude routine `auto-triage-afrikaburn-contributor-app` are donor-specific.
- **`neon-pr-cleanup.yml`** — Camp 404 already has this workflow; only the pagination
  loop and the `pull_request_target` trigger are worth back-porting.

**No `groupId` / `editionId` / `org_*` anywhere in this unit.** Grep across `.github/`,
`config/`, `scripts/`, `commitlint.config.mjs`, `turbo.json` returns nothing. The
`editions` and `groups` dimensions that poison the donor's schema and `packages/core`
do not reach here at all.

---

## 11. Verbatim excerpts of the five most valuable pieces

### 11.1 `config/security-headers.mjs` (whole file, 40 lines) — drop-in

```js
// Response security headers, shared by all three apps' next.config.ts.
//
// Added 27 Jul 2026 (audit M6): none of the three apps sent ANY of these. The
// org console was framable, so a clickjacked click could reach a destructive
// server action — `deleteSupplier` among them.
//
// Deliberately NOT a full Content-Security-Policy. A script-src policy strict
// enough to be worth having needs per-request nonces threaded through Next's
// inline bootstrap scripts, and getting it subtly wrong white-screens the app.
// `frame-ancestors` is the part that closes the reported hole and cannot break
// a page that was never meant to be framed. A full CSP is follow-up work, not a
// same-day change.

/** @type {{ key: string, value: string }[]} */
export const SECURITY_HEADERS = [
  // The clickjacking fix, twice: frame-ancestors is the modern control and
  // X-Frame-Options covers browsers/proxies that still only read the old one.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Stop a user-uploaded file being re-interpreted as script/HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never leak a full URL (which can carry ids) to a third-party origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs these; denying them by default costs nothing.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Two years, subdomains included — the apex serves all three apps over TLS.
  // Ignored by browsers over plain http, so local/E2E runs are unaffected.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/** The `headers()` entry for a Next config: every route, same set. */
export async function securityHeaders() {
  return [{ source: "/:path*", headers: SECURITY_HEADERS }];
}
```

Wiring (`apps/web/next.config.ts:4-5,21`):

```ts
// Shared across all three apps — see config/security-headers.mjs.
import { securityHeaders } from "../../config/security-headers.mjs";
...
  headers: securityHeaders,
```

> **Camp 404 note:** `camp-404/apps/web/next.config.ts` has no `headers` key. The one
> adjustment: Camp 404's `/api/mcp/*` OAuth endpoints and `/api/telegram/webhook` are
> cross-origin by design; `frame-ancestors 'none'` does not affect them, but a future
> full CSP would.

### 11.2 `commitlint.config.mjs` (whole file, 53 lines) — light-adapt (swap `SCOPES`)

```js
// Commit-message rules for the Quagga Portal monorepo.
//
// Conventional Commits with a WORKSPACE SCOPE — see CONTRIBUTING.md. Enforced in
// two places, because this repo MERGES pull requests rather than squashing them,
// so every individual commit lands on `main` and the PR title is not the only
// thing anyone reads:
//
//   · locally, by the `commit-msg` git hook (.husky/commit-msg)
//   · in CI, over the PR title AND every commit in the range (.github/workflows/ci.yml)
//
// Keep `SCOPES` in step with the workspaces. A scope that is not listed fails,
// which is the point: `fix(accounts):` looks reasonable and names nothing that
// exists, and a scope vocabulary nobody prunes stops meaning anything.

/** Workspace names with the `@quagga/` prefix dropped, plus `repo` for the root. */
const SCOPES = [
  // apps/*
  "web",
  "org",
  "suppliers",
  // packages/*
  "core",
  "db",
  "ui",
  "auth",
  "types",
  // the e2e workspace
  "e2e",
  // root-level: turbo, workspace tooling, CI, docs about the repo itself
  "repo",
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", SCOPES],
    // 72, not the conventional default of 100. GitHub truncates list views around
    // there, and a title that only makes sense once expanded is a title nobody
    // reads — which was the original complaint.
    "header-max-length": [2, "always", 72],
    // Bodies wrap at 100 by default; ours run to prose paragraphs explaining WHY,
    // and hard-wrapping a URL or a quoted error string mid-token to satisfy a
    // linter makes the message worse. Warn rather than fail.
    "body-max-line-length": [1, "always", 100],
    "footer-max-line-length": [1, "always", 100],
  },
  // `Merge pull request #N from …` is written by GitHub, not by a human, and it
  // cannot be conventional. Same for revert commits git generates itself.
  ignores: [
    (message) => /^Merge (branch|pull request|remote-tracking)/.test(message),
    (message) => /^Revert "/.test(message),
  ],
};
```

Paired hook (`.husky/commit-msg`, whole file):

```sh
# Conventional Commits with a workspace scope — see CONTRIBUTING.md.
#
# Local half of the enforcement; CI checks the PR title and every commit in the
# range too (.github/workflows/ci.yml), because a hook only binds machines that
# have run `pnpm install`.
#
# To bypass deliberately: `git commit --no-verify`. CI will still refuse it.
npx --no -- commitlint --edit "$1"
```

### 11.3 The `commitlint` CI job (`ci.yml:26-76`) — drop-in

```yaml
  # Conventional Commits with a workspace scope (CONTRIBUTING.md,
  # commitlint.config.mjs). BOTH halves are checked, because this repo MERGES
  # pull requests rather than squashing them: every individual commit lands on
  # `main`, so linting only the PR title would let unconventional history
  # through, and linting only the commits would leave the PR list — the thing
  # people actually read — unchecked.
  #
  # The local `commit-msg` hook covers the same ground, but a hook only binds a
  # machine that has run `pnpm install`, and `--no-verify` skips it. This does
  # not.
  commitlint:
    name: commit conventions
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      # `fetch-depth: 0` — the range check below needs the merge base, and the
      # default shallow clone does not have it.
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.30.0

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile

      # The PR title. It is what the reviewer list shows and what a reader scans;
      # it is also the subject GitHub offers if this is ever squashed.
      - name: Lint the pull-request title
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: printf '%s' "$PR_TITLE" | pnpm exec commitlint

      # Every commit the PR adds. `--from`/`--to` over the merge base, so
      # anything already on main is out of scope — this enforces new history
      # without demanding the old history be rewritten.
      - name: Lint the commits in this pull request
        run: |
          pnpm exec commitlint \
            --from "${{ github.event.pull_request.base.sha }}" \
            --to "${{ github.event.pull_request.head.sha }}" \
            --verbose
```

> Note the `PR_TITLE` env-var indirection at the title step — the title is
> **not** interpolated into the shell, which is the injection-safe form. Copy it exactly.

### 11.4 `labels-sync.ts` core loop (`labels-sync.ts:39-100`) — light-adapt

```ts
export async function syncGithubLabels(input: {
  token: string;
  owner: string;
  repo: string;
  labels?: readonly GithubLabel[];
}): Promise<LabelSyncResult> {
  const { token, owner, repo } = input;
  const labels = input.labels ?? GITHUB_LABELS;
  const base = `${GITHUB_API}/repos/${owner}/${repo}/labels`;
  const result: LabelSyncResult = { created: [], updated: [], failed: [] };

  for (const label of labels) {
    // Names contain a space and a colon, so they must be encoded — an
    // unencoded `type: bug` requests a label GitHub has no record of and every
    // update silently becomes a create.
    const existing = await fetch(`${base}/${encodeURIComponent(label.name)}`, {
      headers: headers(token),
    });

    if (existing.status === 404) {
      const created = await fetch(base, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(label),
      });
      if (created.ok) result.created.push(label.name);
      else result.failed.push({ name: label.name, status: created.status });
      continue;
    }

    if (!existing.ok) {
      result.failed.push({ name: label.name, status: existing.status });
      continue;
    }

    const updated = await fetch(`${base}/${encodeURIComponent(label.name)}`, {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify({
        new_name: label.name,
        color: label.color,
        description: label.description,
      }),
    });
    if (updated.ok) result.updated.push(label.name);
    else result.failed.push({ name: label.name, status: updated.status });
  }

  return result;
}

/** `owner/repo` → parts, or null. Shared with the issue-filing path's rules. */
export function parseRepoSlug(
  slug: string,
): { owner: string; repo: string } | null {
  const segments = slug.trim().split("/");
  if (segments.length !== 2) return null;
  const owner = segments[0]?.trim();
  const repo = segments[1]?.trim();
  if (!owner || !repo) return null;
  return { owner, repo };
}
```

Request headers (`labels-sync.ts:23-31`):

```ts
function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "quagga-portal-label-sync",
  };
}
```

### 11.5 The `ci-pass` aggregate gate (`ci.yml:310-331, 518-558`) — drop-in shape

```yaml
  # THE ONE REQUIRED CHECK.
  #
  # Branch protection can only require checks BY NAME, so requiring the e2e
  # shards individually means eight entries that have to be re-edited every time
  # a persona is added or renamed — and a shard nobody remembered to mark
  # required is a shard that can go red without blocking a merge. The failure
  # mode is silent, which is the worst kind.
  #
  # So protection requires exactly one: `CI pass`. `ci` and `e2e` must SUCCEED;
  # `commitlint` may also be `skipped`, because it is pull-request-only and does
  # not run on a push to main. Nothing else is tolerated — see the step below.
  #
  # It needs no maintenance when the matrix changes: a new shard is covered the
  # moment it is added, because `needs: [e2e]` is the whole matrix rather than a
  # list of its legs.
  #
  # Same pattern as camp-404 and ops-board.
  #
  # `if: always()` is what makes it work at all. Without it this job would be
  # SKIPPED when an upstream job fails, and a skipped required check does not
  # block a merge — the gate would pass by not running, which is precisely
  # backwards.
  ci-pass:
    name: CI pass
    if: always()
    needs: [commitlint, ci, e2e, coverage]
    runs-on: ubuntu-latest
    steps:
      - name: Check every job passed
        run: |
          # UNCONDITIONAL — these run on every event and must succeed.
          #
          # `needs.e2e.result` covers the WHOLE matrix: with fail-fast disabled
          # every shard runs, and the aggregate is `failure` if any single one
          # failed. That is the property that makes this maintenance-free.
          # `coverage` works the same way, and a shard that skipped itself as
          # out of scope still reports `success`.
          for job in "ci:${{ needs.ci.result }}" "e2e:${{ needs.e2e.result }}" "coverage:${{ needs.coverage.result }}"; do
            name="${job%%:*}"; result="${job#*:}"
            if [ "$result" != "success" ]; then
              echo "::error::$name did not pass (result: $result)"
              exit 1
            fi
          done

          # GATED — `commitlint` only runs on pull requests, so `skipped` is a
          # legitimate outcome on a push to main and must not fail the gate.
          # Anything else (failure, cancelled) must.
          case "${{ needs.commitlint.result }}" in
            success|skipped) ;;
            *)
              echo "::error::commit conventions did not pass (result: ${{ needs.commitlint.result }})"
              exit 1
              ;;
          esac

          echo "All jobs passed."
```

### 11.6 (bonus) `planMigration()` (`migration-plan.ts:63-124`) — drop-in for a Camp 404 build gate

```ts
export function planMigration(env: MigrationEnv = process.env): MigrationPlan {
  const unpooled = env.DATABASE_URL_UNPOOLED;
  const pooled = env.DATABASE_URL;
  const connectionString = unpooled ?? pooled;
  const isProductionDeploy = env.VERCEL_ENV === "production";
  // Preview and production alike: a pooled fallback breaks the lock in both.
  const isVercelDeploy = Boolean(env.VERCEL || env.VERCEL_ENV);
  const neonLocal = env.NEON_LOCAL_PROXY === "1";

  if (!connectionString) {
    if (isProductionDeploy) {
      throw new Error(
        "[migrate] PRODUCTION DEPLOY with no database configured (DATABASE_URL_UNPOOLED and " +
          "DATABASE_URL both unset). Refusing to complete a production build that would silently " +
          "apply no migrations. Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.",
      );
    }
    return {
      kind: "skip",
      reason:
        "[migrate] no database configured (DATABASE_URL_UNPOOLED and DATABASE_URL both unset) — skipping migrations.",
    };
  }

  // Neon Local reroutes to a single local backend; the pooler/production guards
  // (which exist to catch PgBouncer transaction-pooling) do not apply there.
  if (!neonLocal) {
    if (isPoolerConnection(connectionString)) {
      throw new Error(
        "[migrate] refusing to run advisory-locked migrations against a POOLED (PgBouncer) endpoint " +
          `(host ${connectionHost(connectionString) ?? "unknown"}). Session-scoped advisory locks do NOT ` +
          "hold on a transaction-pooling endpoint, so the concurrent Vercel builders would not serialise. " +
          "Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.",
      );
    }
    // ANY Vercel deploy, not just production. This guard used to read
    // `isProductionDeploy`, and that gap is not hypothetical — it double-seeded
    // the real database. […] Two builders then each held a lock that protected
    // nothing, both saw an empty `editions`, and both seeded — 40 suppliers
    // where there should have been 20.
    if (!unpooled && isVercelDeploy) {
      throw new Error(
        "[migrate] DEPLOY without DATABASE_URL_UNPOOLED. Refusing to fall back to DATABASE_URL: " +
          "Neon's Vercel integration sets DATABASE_URL to the POOLED endpoint by default, where session " +
          "advisory locks do not hold — concurrent builders would not serialise and could both migrate " +
          "and seed. Add DATABASE_URL_UNPOOLED (Neon's direct/unpooled endpoint) to THIS environment.",
      );
    }
  }

  return { kind: "run", connectionString, usingUnpooled: Boolean(unpooled) };
}
```

> **Camp 404 relevance:** `camp-404/apps/web` runs
> `vercel-build: pnpm --filter @camp404/db db:migrate && next build` — `drizzle-kit
> migrate` directly, with **no advisory lock, no unpooled enforcement, and no
> pooler refusal**. Camp 404 has one app so the concurrent-builder race does not
> exist today; but `drizzle-kit migrate` against Neon's default `DATABASE_URL`
> (the pooler) is still the weaker form, and `planMigration` is 60 lines of pure
> function with a 16-test suite already written.

---

## 12. Where the donor is weaker than Camp 404 (do not port these backwards)

1. **No supply-chain gate.** Camp 404 runs `pnpm audit --audit-level high` as a
   blocking job (`camp-404/.github/workflows/ci.yml:159-170`) with a 7-entry
   `pnpm.auditConfig.ignoreGhsas` allow-list (`camp-404/package.json:44-54`) and 15
   security `pnpm.overrides` (`camp-404/package.json:25-43`). The donor has one override
   (`esbuild: ">=0.28.1"`, `package.json:32-36`) and no audit step at all.
2. **No migration-vs-schema freshness check.** Camp 404's `typecheck` job re-runs
   `drizzle-kit generate` and fails if `packages/db/migrations/` is dirty
   (`camp-404/.github/workflows/ci.yml:70-79`). The donor has no equivalent — it relies
   on review.
3. **No ephemeral-DB migration smoke test.** Camp 404's `schema-migration` job creates
   `ci-schema-${{ github.run_id }}` on Neon, applies the committed SQL, and deletes the
   branch with `if: always()` (`camp-404/…/ci.yml:122-157`), catching "bad CHECK syntax,
   cross-schema FK permissions, unreachable target tables".
4. **No change-detection job.** Camp 404 uses `dorny/paths-filter@v4` to gate `test`,
   `e2e` and `schema-migration` on `src`/`db` filters
   (`camp-404/…/ci.yml:13-37`); the donor only gates the coverage matrix, via `git diff`.
5. **No Next build cache.** Camp 404 caches `apps/web/.next/cache` keyed on
   `hashFiles('pnpm-lock.yaml', 'apps/web/next.config.*')`
   (`camp-404/…/ci.yml:109-115`).
6. **`--no-frozen-lockfile` in every donor CI install** (`ci.yml:59,99,179,457`;
   `mobile.yml:81`) despite a committed lockfile — the comment at `ci.yml:95-97` says to
   switch and nobody did. Camp 404 correctly uses `--frozen-lockfile`.
7. **`pnpm/action-setup@v4` in the donor vs `@v5` in Camp 404** — but Camp 404 omits the
   `version:` input, which the donor pins. Best form is `@v5` **with** `version:`.
8. **Branch protection is not enabled on the donor's `main`**, so `.github/CODEOWNERS`
   "does nothing at all" (`AGENTS.md:127-130`, `SECURITY.md:96-124`). The file is a
   template, not a working control, in the donor today.

---

## 13. Recommended port order (highest value / lowest risk first)

1. `config/security-headers.mjs` + the `headers:` wiring — 40 lines, zero deps, closes a
   real clickjacking class. Add a unit test (the donor has none).
2. `.gitattributes` — Camp 404 has `design/app.pen` and **no `-merge` protection**. This
   is the single highest-consequence one-line fix in the unit.
3. `commitlint.config.mjs` + `.husky/commit-msg` + the `commitlint` CI job + root
   devDeps (`@commitlint/cli`, `@commitlint/config-conventional`, `husky`, `"prepare"`).
   Swap `SCOPES` to Camp 404's workspaces.
4. `.github/CODEOWNERS`, `pull_request_template.md`, `ISSUE_TEMPLATE/{config,bug,feature,
   design,copy}.yml` — retarget the app dropdowns.
5. `GITHUB_LABELS` into `@camp404/core` (or a new `packages/core/src/github-labels.ts`),
   `labels-sync.ts`, `scripts/setup-github-labels.ts`, the `labels:sync` script, and
   `issue-forms.test.ts` — the test is the thing that keeps forms and taxonomy honest.
6. `SECURITY.md` + `CONTRIBUTING.md`, adapted — Camp 404 has neither.
7. Per-job `permissions: contents: read` on Camp 404's existing workflows.
8. `@vitest/coverage-v8` + `test:coverage` scripts + a `test:coverage` turbo task +
   floors, starting with `@camp404/core` (pure, zero-I/O — the natural 100% candidate,
   mirroring the donor's privacy-core treatment).
9. `AGENTS.md` §Verification and the two false-passing test shapes (§55 above) folded
   into Camp 404's `AGENTS.md`.
10. `planMigration`/`isPoolerConnection` into `@camp404/db`, plus its 16-test suite.
11. The `neon-pr-cleanup.yml` pagination loop + `pull_request_target` trigger,
    back-ported onto Camp 404's existing file.
12. Persona-named e2e matrix + `fail-fast: false` + server-log artefact, once Camp 404's
    e2e suite is re-enabled (`AGENTS.md:133` says it is disabled).
