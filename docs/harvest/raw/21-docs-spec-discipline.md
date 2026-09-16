# Unit 21 — Documentation and spec discipline as a reusable practice

> HARVEST inventory of the DONOR repo (`quagga-portal` / AfrikaBurn Contributors App) at
> `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`.
> Every claim below is cited `path:line`. Read-only; nothing in either repo was modified.

---

## 1. Purpose of this unit

Most harvest units are about *code*. This one is about the donor's **documentation
system**: a set of conventions, file shapes, enforcement tests and process rules that
together make a ~5,600-line `docs/` tree stay honest against a live product. The
transferable assets fall into four groups:

1. **Doc-system machinery** — the metadata header block, the precedence chain, the
   status-glyph legend, the Requirement-ID protocol and its regeneration procedure, the
   `docs/README.md` index-as-rulebook pattern, and the `docs/sources/` never-edited
   primary-source corpus. All of this is domain-free and drops straight into Camp 404's
   `docs/` and `design/` trees, where the equivalent problem is acute: Camp 404 has
   documented, verified stale docs (`README.md:98-101`, `DEFERRED.md:47-50`,
   `docs/configurable-teams-plan.md` header, `AGENTS.md:20-32`) and no mechanism at all
   for catching that drift.
2. **Feature specs for surfaces Camp 404 still needs** — accounts/security (2FA,
   passkeys, sessions, security-event feed, deletion, re-auth), notifications/bulletins,
   the questionnaire builder v2 target set, and the triage/reporter pipeline. These are
   requirement text Camp 404 can quote, not code it must port.
3. **Process discipline as executable artefacts** — Conventional-Commits-with-a-workspace-
   scope enforced by husky + CI, the `CI pass` aggregate check, the coverage ratchet with
   per-file 100% floors on privacy predicates, the issue-form/label-vocabulary consistency
   test, the PR template with its load-bearing **Database** and **Risk** sections, and the
   `design/qa` measurement-first review harness.
4. **The verification culture** — `AGENTS.md`'s §Verification section, the two named
   "test that passes for the wrong reason" shapes, and the simplification-audit's
   auditor→refuter finding format.

**What is NOT here:** anything AfrikaBurn-domain-specific (erven, Quaggapedia, supplier
depot rules, the App Specification's actual content). Where a spec section is
AfrikaBurn-shaped, this doc extracts the *mechanism* and flags the coupling.

---

## 2. File inventory with line counts

### 2.1 `docs/` — the spec tree (16 files, 5,630 lines)

| File | Lines | Category (own header) | Doc status | Requirement-ID coverage |
|---|---:|---|---|---|
| `docs/README.md` | 302 | Operational | Active | N/A — index and conventions |
| `docs/technical-spec.md` | 478 | Product | Active | **Exhaustive** — 1:1 section mirror of the App Spec |
| `docs/architecture.md` | 174 | Architecture | Active | Partial — `SEC-*`, `CORE-*` |
| `docs/build-spec.md` | 502 | Engineering Spec | Active | Partial — `CORE-*`, `ONBOARD-*`, `CDB-*`, `SEC-*`, `REG-*` |
| `docs/component-spec.md` | 128 | Engineering Spec | Active | N/A — implementation detail |
| `docs/accounts-security-spec.md` | 385 | Security | Active | Partial — `SEC-*`, `CDB-002` |
| `docs/auth-platform-spec.md` | 771 | Security | Active | Partial — `SEC-*` |
| `docs/questionnaire-spec.md` | 311 | Engineering Spec | Active | Partial — `ONBOARD-*`, `REG-*`, `SEC-*` |
| `docs/notifications-spec.md` | 104 | Engineering Spec | Active | N/A — no dedicated App Spec section |
| `docs/supplier-spec.md` | 72 | Engineering Spec | Active | Partial — `PNP-005`, `REG-011` |
| `docs/flows.md` | 180 | Architecture | Active | Partial — `ONBOARD-*`, `REG-*`, `SEC-*` |
| `docs/triage.md` | 204 | Operational | Active | N/A — operational, not spec-derived |
| `docs/synthesis.md` | 253 | Planning | **Historical** | N/A — superseded by the App Specification |
| `docs/deploy.md` | 234 | Operational | Active | N/A — operational, not spec-derived |
| `docs/roadmap.md` | 124 | Planning | Active | Partial — `RELEASE-*` |
| `docs/simplification-audit.md` | 1,408 | *(no header block)* | — | — |

The index table itself is `docs/README.md:62-78`; the category vocabulary is
`docs/README.md:80-84`.

> **Digit note.** `docs/simplification-audit.md` is the ONE file under `docs/` (excluding
> `docs/sources/`) that does **not** carry the mandated 5-row metadata header block, and
> it is also the one file missing from the index table at `docs/README.md:62-78`. The
> convention has one hole in it; worth knowing before adopting it as "universal".

### 2.2 `docs/sources/` — the verbatim primary-source corpus (809 md files, 74,743 lines, + 28 binaries)

| Path | Lines | What |
|---|---:|---|
| `docs/sources/README.md` | 37 | The never-edit rule and provenance |
| `docs/sources/quaggapedia/` | — | 68 canonical wiki pages + 21 binaries, mirrored 22 Jul 2026 (`docs/sources/README.md:14-24`) |
| `docs/sources/afrikaburn-org/` | — | 726 pages mirrored 24 Jul 2026 (`docs/sources/README.md:26-28`) |
| `docs/sources/app-specification/app-specification.md` | 1,144 | Mirror of the authoritative external App Specification |
| `docs/sources/app-specification/app-specification/requirement-index.md` | 709 | **584 tracked requirement IDs**, one row each |
| `docs/sources/app-specification/app-specification/app-spec-change-record.md` | 219 | The change log the regeneration protocol keys on |
| `docs/sources/theme-camps-guide.md` | 1,640 | Largest single source file |
| `docs/sources/quagga-portal-platform.md` | 913 | The "ideation only" topic map |
| `docs/sources/scope-*.txt` (5), `master-brief.txt`, `discovery-meeting-agenda.txt` | — | Text extractions of the original scope documents |

### 2.3 Root-level process docs (4 files, 1,016 lines)

| File | Lines | Role |
|---|---:|---|
| `AGENTS.md` | 382 | **Wins on process.** Operating guide for agents and humans |
| `README.md` | 220 | Orientation only; explicitly defers to AGENTS.md (`README.md:192-195`) |
| `CONTRIBUTING.md` | 290 | Human on-ramp: setup, commit convention, designer workflow, review |
| `SECURITY.md` | 124 | Vulnerability reporting, never-test-against-live, repo settings checklist |

### 2.4 Enforcement + tooling artefacts

| File | Lines | Role |
|---|---:|---|
| `.github/pull_request_template.md` | 74 | Six sections + collapsed `Supplementary context` |
| `.github/ISSUE_TEMPLATE/bug.yml` | 116 | The one with two required privacy confirmations |
| `.github/ISSUE_TEMPLATE/feature.yml` | 58 | — |
| `.github/ISSUE_TEMPLATE/design.yml` | 74 | Carries the honesty checkbox |
| `.github/ISSUE_TEMPLATE/copy.yml` | 47 | Wording-fix form; "overpromises" is a listed kind |
| `.github/ISSUE_TEMPLATE/config.yml` | 10 | `blank_issues_enabled: false` + two contact links |
| `.github/CODEOWNERS` | 39 | Annotated with WHY each path is owned |
| `.github/workflows/ci.yml` | ~558 | `commitlint` · `ci` · `e2e` (8 shards) · `coverage` (8 shards) · `CI pass` |
| `commitlint.config.mjs` | 53 | Scope enum, 72-char header, warn-not-fail body lines |
| `.husky/commit-msg` | 8 | Local half of the enforcement, with a comment saying so |
| `turbo.json` | 79 | Carries a 15-line incident comment on `!.next/dev/**` |
| `packages/core/src/__tests__/issue-forms.test.ts` | 142 | The doc↔config consistency test |
| `packages/core/src/report.ts` | 590 | `GITHUB_LABELS` at `:162-345` — the label vocabulary as code |
| `packages/core/src/report-server/labels-sync.ts` | 100 | `syncGithubLabels` / `parseRepoSlug` |
| `scripts/setup-github-labels.ts` | 47 | `pnpm labels:sync` entry point |
| `packages/core/vitest.config.ts` | 128 | The coverage ratchet with 6 files at 100% |
| `design/qa/REVIEW.md` | 103 | Measurement-first frame-review process |
| `design/qa/audit.py` | 294 | The geometric/style/content checker |
| `design/qa/whitelist.json` | 82 | Exceptions, each with a stated WHY |
| `design/qa/penctl.py` | 71 | Raw JSONRPC client to the Pen bridge |
| `design/qa/dumptext.py` | 68 | — |
| `design/pen-lessons.md` | 1,194 | 36 dated session-lesson sections |
| `e2e/README.md` | 272 | Harness contract + the "Selector traps" catalogue |

---

## 3. Capability list (exhaustive, each cited)

### 3.1 The doc-system machinery

**C1. A single index file that is also the rulebook.** `docs/README.md` opens
"This file is the index and the rulebook for everything under `docs/`. If you are about
to read, write, or update a doc in this folder, start here." (`docs/README.md:11-12`).
It carries: the direction-of-information-travel statement, the four-level precedence
chain, the index table, the language guide, the header-block spec, the Requirement-ID
protocol, and a contributing section (`docs/README.md:283-302`) that explicitly says
"This section is docs-specific only… nothing here repeats it."

**C2. A four-level precedence chain, stated in exactly one place.**
`docs/README.md:45-58`:
> 1. **The App Specification** (above) governs what the product should do.
> 2. **`build-spec.md`** wins for engineering — schema, routes, stack, hard constraints —
>    where any other doc in this repo disagrees with it.
> 3. **`AGENTS.md`** wins for process where it and any doc (including `build-spec.md`)
>    disagree on process.
> 4. **`AGENTS.md`** wins over `CONTRIBUTING.md` specifically, where the two overlap on
>    process — human contributors still start at `CONTRIBUTING.md`.

The doc names its own echo sites: "Five other locations echo it: `AGENTS.md` (×2),
`build-spec.md` and `README.md` restate the rule in full and link here… while
`architecture.md` links here without restating it" (`docs/README.md:46-50`). The echoes
are real — `AGENTS.md:5-8`, `AGENTS.md:28-31`, `docs/build-spec.md:11-16`,
`README.md:192-195`, `docs/architecture.md:12-14`.

**C3. The 5-row metadata header block, mandated on every doc.** Spec at
`docs/README.md:145-158`; field definitions `docs/README.md:160-175`; worked example
`docs/README.md:177-187`. Verbatim template:

```markdown
| Field | Value |
|---|---|
| **Category** | Product \| Architecture \| Engineering Spec \| Security \| Operational \| Planning |
| **Doc status** | Active \| Historical \| Draft |
| **Normative language** | RFC 2119 / RFC 8174 applies \| Descriptive only |
| **Requirement IDs** | Exhaustive \| Partial \| N/A — with a short qualifier |
| **Owner / Updated** | *name or "Repo maintainers", date* |
```

**C4. Per-doc normative-language opt-in (RFC 2119 / BCP 14).**
`docs/README.md:88-105`. The boilerplate is quoted once; whether it binds a given doc is
"whatever that doc's own header says under **Normative language** — check the header, not
a list here" (`:97-99`). An earlier version kept a hand-maintained roster and it was
deleted precisely because it duplicated a field that already lives in every file
(`:99-103`). Lowercase `must`/`may`/`should` stay ordinary English *everywhere*,
including in RFC-2119 docs — "capitalisation is what invokes the RFC meaning, nothing else
does" (`:103-105`).

**C5. A four-glyph status legend with a stated precedence between a heading and its
citation line.** `docs/README.md:117-133`:

| Symbol | Meaning |
|---|---|
| ✅ | **Built** — working in the deployed apps, with tests |
| 🚧 | **Partial** — some of it works; the rest is named nearby |
| ❌ | **Not built** — no code, no database tables |
| ⚠️ | **Blocked** — cannot be built yet, and the blocker is not code |

"A section heading's glyph is a summary, not the last word… the `**Requirement IDs:**`
line beneath it is the authoritative, per-id breakdown, and the two may legitimately
differ in altitude rather than agree" (`:124-129`). Where they *flatly* disagree, "that's
a bug, not a difference of perspective — fix the heading" (`:131-133`). One known
collision is documented and deliberately not fixed: `build-spec.md`'s capability matrix
and `questionnaire-spec.md`'s role tables reuse ✅/❌ as a plain boolean, a "different,
older, local meaning that predates this convention" (`:135-143`).

**C6. The Requirement-ID protocol.** `docs/README.md:189-281`. Four parts:
 - *What the IDs look like* (`:191-198`): `PREFIX-NNN`, one fixed prefix per numbered
   section, append-only, never renumbered or reused, struck through in place when
   removed. "This repo only ever *cites* those IDs, never mints its own."
 - *Header-level coverage, by doc type* (`:200-213`): three archetypes — 1:1 mirror →
   `Exhaustive`; cross-cutting engineering doc → `Partial — <prefixes>`; purely
   operational → `N/A — operational, not spec-derived`.
 - *Inline citation format* (`:215-233`), verbatim:
   ```markdown
   **Requirement IDs:** ✅ CDB-037, CDB-040, CDB-041, CDB-043 · 🚧 CDB-042 · ❌ CDB-029, CDB-030 · ⚠️ CDB-001–CDB-024 *(App Spec §4)*
   ```
   with the rule "**A range MUST NOT straddle an id with a different status**" (`:229-233`).
 - *The regeneration protocol* (`:235-271`): nine numbered steps — see §7.2 below.

**C7. Honest scope statement about the protocol's own completeness.**
`docs/README.md:273-281`: "Today, only `technical-spec.md` has been fully retrofitted with
per-section inline citations… Closing that gap… is real, deferred work, not a completed
retrofit; treat the `Partial` label as literally true."

**C8. A never-edited primary-source corpus, fenced off from the convention.**
`docs/README.md:14-16` ("`docs/sources/` is out of scope for everything below… and is
never edited. It has its own `README.md`"), plus `docs/sources/README.md:7-10`:
> Nothing here is edited to match the product. Where a page says "burner name", or
> describes a process we implemented differently, that is the source speaking and it
> stays. Correcting a source to agree with the build destroys the only record of what was
> actually asked for.

Also records *how* it was captured and that it will drift: "Captured through the wiki's
open MediaWiki API: 123 main-namespace pages enumerated, language variants and junk
filtered out… **The wiki will drift** — re-run the same process to refresh rather than
hand-patching a page" (`docs/sources/README.md:21-24`).

**C9. A gap-analysis doc that mirrors the spec's section numbering 1:1.**
`docs/technical-spec.md` has exactly 21 `##` sections matching the App Spec's 21, each
with a glyph and a `**Requirement IDs:**` line. Stated intent at `:11-20`: "That document
says what the product should do; this one says what is built, how, and **what each unbuilt
part would actually take**." Written for non-technical readers: "Where a term is
unavoidable it is explained once" (`:22-23`).

**C10. Three framing facts restated at the top of the gap-analysis doc.**
`docs/technical-spec.md:32-42` — (1) it is live with real PII and no practice copy;
(2) three apps, one account pool; (3) "Rules live in one place… not by hiding buttons. A
hidden control and a refused action can never disagree."

**C11. Explicit "where the build and the spec differ, and why" sections.**
`docs/technical-spec.md:111-150` (§4 Camper database) is the model: "**This is the section
where the build and the spec genuinely differ, and the difference is not an oversight.**"
It then states what the spec asked for, what was built instead, the technical/consent
reason, and what doing it the spec's way would cost. §8 (`:208-231`) does the same for
payments, and §21 (`:477-478`) closes: "Where this document disagrees with the App Spec —
§4 most sharply, §8 next — the disagreement is about that principle, not about effort."

**C12. Numbering gaps kept deliberately, with the removed text's commit named.**
`docs/auth-platform-spec.md:20-27`:
> **Section numbering has gaps, deliberately.** §1 (decision summary), §4 (migration off
> managed Neon Auth), §5 (the CI suite to build) and §12 (phased task breakdown) described
> work that has since been done; they were removed rather than left to be read as
> outstanding. The surviving sections keep their original numbers so that the 75 internal
> cross-references remain valid. Git has the removed text at `044ea30`.

**C13. `UNRESOLVED (flagged <date>)` inline markers for internal contradictions.**
Three live examples: `docs/accounts-security-spec.md:76-80` (the "Security principles"
heading asserts unconditional law while two items are `NOT WIRED YET` in the matrix above
it — "The heading and the capability matrix disagree; resolve which one is right before
treating either as settled"); `docs/accounts-security-spec.md:136-139` (why a "must" stays
lowercase); `docs/auth-platform-spec.md:707-709` (a broken §7.5 cross-reference);
`docs/auth-platform-spec.md:759` (an open-decision row whose wording states the answer as
settled). This is a *documented-defect* convention rather than a silent fix.

**C14. A `Historical` doc status that states why in its own header value.**
`docs/synthesis.md:6`: "Historical — this was the requirements-gathering document before
the App Specification existed; it has been superseded as an authoritative source by the
App Specification itself and is retained for historical rationale only".

**C15. `NOT BUILT` / `DO NOT BUILD` sections as first-class doc content.**
`docs/build-spec.md:418-425` ("Explicitly NOT built"), with a parenthetical correcting
itself: "_(pen.dev **is** used… It was on this list when the list meant 'no design
tooling'; that changed.)_" And `docs/auth-platform-spec.md:713-745` — "WHAT WE
DELIBERATELY DO NOT BUILD", 15 bullets each stating the *reason*, e.g. "**No SMS 2FA.**
SIM-swap + cost. TOTP + backup codes only." (`:722`).

**C16. An `OPEN DECISIONS` table where each row names what it blocks.**
`docs/auth-platform-spec.md:749-771`: 7 rows, columns `# | Decision | Blocks`, followed by
a `**Closed since:**` paragraph listing the eight decisions resolved and removed —
"Items resolved since this list was written have been removed rather than left ticking"
(`:751-752`).

**C17. A blocker table naming who owes what.** `docs/roadmap.md:103-115`: 9 rows,
columns `Blocker | Blocks | Who`, with `Who` ∈ {Collaborators, AB}.

**C18. A `docs/flows.md` that names the enforcing code beside each diagram.**
`docs/flows.md:11-12`: "Each names the code that enforces it, so a diagram that drifts can
be caught against a file." Examples: `getBlockingActivation` in `@quagga/core`
(`:33-35`), `SECTION_KEYS` in `@quagga/types` (`:59-62`), `isSectionComplete`
("not a manual tick", `:61-62`), `questionnaire-authz.ts` (`:122-123`),
`SUPPLIER_ONBOARDING_STEPS` (`:127`).

**C19. A route → design-frame index.** `docs/component-spec.md:68-128` maps every route
in all three apps to a `desktop / mobile-360` frame-id pair, and states the retrieval
command: "`design/qa/audit.py --sections <frameId>` emits that frame's component
manifest" (`:70-72`).

**C20. A component spec ordered by measured canvas usage.**
`docs/component-spec.md:11-14`: "Derived from the design canvas via the `design/qa` audit
tooling (component census: 62 reusable components in `ABOHr` + `kv6ot`, usage-ranked)."
Tier 1 rows carry literal use counts (Select 29+, Field 20+, Textarea 23+, Check/Radio
35+, Switch 13, Input 6 — `:20-27`; Button 66+, Badge 60+, Avatar 24, AppShell 26 —
`:33-36`). Plus a per-component definition of done (`:62-66`).

### 3.2 Process discipline

**C21. Conventional Commits with an enforced workspace-scope enum, checked twice.**
Rules `CONTRIBUTING.md:129-215`; config `commitlint.config.mjs`; local hook
`.husky/commit-msg`; CI job `.github/workflows/ci.yml:36-77`. The enforcement table is
`CONTRIBUTING.md:199-202`. Rationale for checking both halves: "this repo **merges** pull
requests rather than squashing them — every individual commit lands on `main`, so the PR
title is not the only thing anyone reads" (`CONTRIBUTING.md:195-197`).

**C22. A "what a title is for" section.** `CONTRIBUTING.md:182-191`:
"`fix(web): the deletion guard counted deleted accounts` is useful; `fix(web): deletion
fixes` is not." And: "Prose headlines… read well in a changelog and sort, filter and tool
badly. Put that sentence in the PR body's summary."

**C23. A PR template with two load-bearing sections and a collapsed appendix.**
`.github/pull_request_template.md`. Sections: Overview, What it touches, Testing (two
checkboxes), **Database** (pre-filled `None.`), **Risk**, **Expected follow-ups**
(pre-filled `None.`), Notes for the reviewer, `<details><summary>Supplementary
context</summary>`. Rationale `CONTRIBUTING.md:229-247` and `AGENTS.md:279-287`:
"Reasoning, rejected approaches, the long quote from the spec go THERE — not cut, moved.
This is a standing failure mode of agent-written PRs specifically". And: "`None.` under
Database and Expected follow-ups is a real answer and says you checked."

**C24. Four typed issue forms with `blank_issues_enabled: false`.**
`.github/ISSUE_TEMPLATE/config.yml:1-3`: "A blank issue is a blank stare. Every path below
asks the few questions that otherwise turn into three rounds of 'which app?' and 'what did
you expect?'." Two contact links redirect security reports and uncertainty
(`config.yml:4-10`).

**C25. A privacy gate built into the bug form.** `bug.yml:103-116` — two `required: true`
checkboxes; the URL field asks the reporter to "**stop at the `?`**" because reset links
carry tokens and the repo is public (`bug.yml:63-68`); the console-error field warns
"Nothing here is filtered before it goes public — unlike a report filed from inside the
app, this form publishes exactly what you paste" (`bug.yml:95-98`).

**C26. A label vocabulary defined in code and synced to GitHub.**
`GITHUB_LABELS` at `packages/core/src/report.ts:162-345`; sync via
`packages/core/src/report-server/labels-sync.ts:39-88` and `scripts/setup-github-labels.ts`
(`pnpm labels:sync`, `package.json` scripts). Rationale `docs/triage.md:15-19`: "Edit it
there, not in the GitHub UI — the reporter applies a subset of the same list, and a
vocabulary maintained in two places stops describing anything."

**C27. A test that pins the issue forms to that vocabulary.**
`packages/core/src/__tests__/issue-forms.test.ts` — five assertions (see §8.1). Its
26-line header (`:1-23`) documents the three drift modes it was written after.

**C28. `CODEOWNERS` annotated with why each path is owned.**
`.github/CODEOWNERS`, e.g. the migrations block: "This product is DEPLOYED… A migration
merged here runs against production on the next deploy; there is no staging step that
would catch it first, and an already-applied migration cannot be edited — only corrected
by another one." Header states the honest caveat: "CODEOWNERS only takes effect once
branch protection requires review from code owners — see SECURITY.md §'Repository
settings'." Owned paths: `/packages/db/migrations/`, `/packages/db/src/schema.ts`,
`/packages/auth/`, `/packages/core/`, `/.github/`, `/LICENSE`, `/AGENTS.md`,
`/CONTRIBUTING.md`, `/SECURITY.md`, `/turbo.json`.

**C29. A repository-settings checklist a PR cannot apply.**
`SECURITY.md:95-124` — branch protection requiring **exactly one** status check named
`CI pass`, private vulnerability reporting, secret scanning + push protection, Dependabot
with `better-auth` excluded from auto-merge. The reason for requiring the aggregate rather
than the shards: "the shard list changes as personas are added, and a shard nobody
remembered to mark required is one that can go red without blocking a merge"
(`SECURITY.md:109-112`).

**C30. The `CI pass` aggregate gate.** `.github/workflows/ci.yml:518-558`, with a
27-line rationale comment at `:310-331` including: "`if: always()` is what makes it work at
all. Without it this job would be SKIPPED when an upstream job fails, and a skipped
required check does not block a merge — the gate would pass by not running, which is
precisely backwards." The comment at `:326` says "Same pattern as camp-404 and ops-board"
— **Camp 404 is named as the origin of this pattern**.

**C31. A coverage ratchet with per-file 100% floors on the privacy core.**
`packages/core/vitest.config.ts:18-125`. Globals: lines 90 / statements 89 / functions 92
/ branches 82 (`:28-31`). Six files at 100/100/100/100 — `src/report-sanitize.ts`,
`src/report-screen.ts`, `src/medical-access.ts`, `src/privacy.ts`, `src/id-retention.ts`,
`src/entitlements.ts` (`:41-76`). Seven authz files at 79–100 per metric (`:81-124`).
Rule: "Raise them as coverage improves; never lower one to make a build pass — the drop is
the signal, and lowering the floor deletes it" (`:19-21`). Coverage runs as its own
8-shard CI matrix "so a breach names the workspace in the checks list rather than making
somebody open a log to find out which one moved" (`ci.yml:338-339`), and the file records
that the floors are "Ported from RyRy79261/intake-tracker, which runs the same shape"
(`ci.yml:336`).

**C32. Incident knowledge stored in config comments, not only in docs.**
`turbo.json:25-39` — 15 lines explaining why `!.next/dev/**` is load-bearing, with the
measured numbers (5.7 GB web / 4.6 GB org after ONE dev-mode e2e run; ~550 GB across a
dozen cycles). "Keep both: this stops it being COPIED, that stops it ACCUMULATING."
Camp 404 already carries the identical exclusion at `turbo.json:30`.

**C33. A measurement-first design-review process with a scripted checker.**
`design/qa/REVIEW.md`. Opening (`:3-6`): "Screenshots of full frames are thumbnails: on a
3,000px-tall mobile frame, a one-letter-per-line text column is literally invisible. Three
visual QA passes missed defects that coordinate math then found in one run (145 of them)."
Five numbered steps (`:22-62`), a "Known measurement gotchas" list (`:64-96`), and a
four-point Definition of Done (`:98-104`). Whitelist rule (`:17-18`): "each with a WHY. An
entry without a reason is invalid. Never whitelist to make a number go green."

**C34. An accumulating lessons file for a lossy tool.** `design/pen-lessons.md`, 1,194
lines across 36 dated `##` sections. `CONTRIBUTING.md:105-106`: "Keep `design/pen-lessons.md`
up to date when you learn something about the format the hard way. Several people have
already paid for those lessons."

**C35. An e2e README that is a contract plus a defect catalogue.** `e2e/README.md` —
fixtures table (`:88-98`), persona-factory table with signatures (`:108-121`), mail-capture
strategy *and its rejected alternatives with a guardrail* (`:125-141`), "Google & god
access — honest limitations" (`:143-175`), and **"Selector traps"** (`:228-270`): seven
named traps, each stated as "produced a failure that _looked_ like a product bug".

### 3.3 Feature-spec content Camp 404 still needs

**C36. Accounts/security capability matrix with a `pending` state.**
`docs/accounts-security-spec.md:34-53` — 13 rows mapping capability → backing call, with
two rows explicitly `NOT WIRED YET (27 Jul 2026)` and shipping disabled with an honest
explanation. The machine-readable authority is `AUTH_CAPABILITIES` in
`packages/core/src/auth-capabilities.ts` and `assertCapability()` is the fail-closed gate
(`:36-38`). Governing rule (`:61-66`): "**code MUST NOT fake an unsupported capability.**
A surface for an unavailable capability renders an honest 'not available yet' state and
its action fails closed — never a silent no-op that looks like success, and never a 'your
X changed' notification for a change that did not happen. Today nothing is unavailable, so
`assertCapability` is a guard with no live refusals; keep it, because the next capability
added starts life unsupported."

**C37. Password / 2FA / session / recovery / deletion policy, digit-exact.**
`docs/accounts-security-spec.md:82-110`. See §6.1 for the verbatim numbers.

**C38. Four structural decisions about where account surfaces live.**
`docs/accounts-security-spec.md:363-377`: (1) account routes sit OUTSIDE each app's own
gate; (2) deletion has one implementation; (3) email change is offered in one app only;
(4) the sweeper never runs unauthenticated or in a build.

**C39. Two deliberately-open seams, named.** `docs/accounts-security-spec.md:379-385` —
new-device sign-in notification ("It fires on nothing rather than on everything") and the
ID-retention purge job ("the pure rule and its tests exist, the scheduler does not").

**C40. Security-events feed design.** `docs/accounts-security-spec.md:339-352`: a real
append-only `security_events` table, not the notifications table; thin best-effort
recording via `recordSecurityEvent` ("a failed insert never breaks or rolls back the
primary action"); typed `kind` + `ip` + `user_agent` (both nullable); display titles from
`describeSecurityEvent` "so no strings live in the DB"; and the table is one of the
sanitization **purged** tables because the captured IP/UA is personal data.

**C41. Notifications/bulletins spec — model, schema, surfaces, four laws.**
`docs/notifications-spec.md`. See §5.2 and §6.3.

**C42. Questionnaire builder v2 target set — Google Forms parity, minus exclusions.**
`docs/questionnaire-spec.md:247-311`. See §6.4.

**C43. Blocking-status explicitness rule.** `docs/questionnaire-spec.md:202-208`:
"**Blocking status must be explicit everywhere.** every surface that shows a
questionnaire — pending cards, list rows, the fill page itself, the author's
builder/activation views — carries a clear badge: **'Required — blocks the app until
done'** (destructive/warning treatment) vs **'Optional'** (muted). A blocking
questionnaire is a HARD gate… the only reachable pages while gated are the fill page and
sign-out."

**C44. The fewer-forms test applied to the builder itself.**
`docs/questionnaire-spec.md:230-232`: "the builder itself must warn authors ('Every
question you add is a question someone in the desert has to answer') — small copy touch,
real principle."

**C45. The triage taxonomy + routine.** `docs/triage.md`. See §5.1 and §6.2.

**C46. `priority:` as a boundary, not a convention.** `docs/triage.md:53-60`:
"Severity used to be inferred from the reporter's own prose and rendered into the issue,
which let a report state its own priority in the line a triager reads first. Priority is
one wiring mistake away from being a permission, so it is decided downstream, from what
the report _describes_. Alarm carries no weight anywhere in this pipeline: 'this is
urgent' is the normal register of somebody whose camp registration just failed." Pinned
in code by the deliberate absence of `severity` from `StructuredReportSchema`
(`packages/core/src/report.ts:136-140`) and by a test
(`packages/core/src/__tests__/issue-forms.test.ts:133-141`).

**C47. A `Cause:` line required on every triage comment.**
`docs/triage.md:190-193`: "it is one of exactly three things: a mechanism with a file and
line, the commit that already fixed it, or what was checked and ruled out. A comment with
none of those three is a failed triage."

**C48. A named anti-pattern for the triage routine itself.**
`docs/triage.md:195-198`: "`needs-human` is not a bin for things nobody looked at. If
every issue in a run comes back `needs-human`, that is not caution — it is the routine
having done nothing, and it silently disables everything downstream that keys on
`agent: ready`."

**C49. A deploy runbook that is also a diagnosis guide.**
`docs/deploy.md`. Includes a symptom→clock table for a failure mode that looks like a
broken build (`:165-173`): "a real build → minutes; quota rejection → **~1 second**",
"Diagnosed the hard way on PR #10 (3 Aug 2026) after eliminating the checkout, the build
and the migrator one at a time."

**C50. A smoke test defined as "creates the data it verifies".**
`docs/deploy.md:208-234`: five numbered steps, ending "Every smoke assertion is against
**live-created** rows. Nothing is verified against a seeded row, because no user-generated
seeded row exists."

**C51. A threat → control → invariant-test matrix.**
`docs/auth-platform-spec.md:684-706` — 18 rows, columns `Threat | Control | Invariant test
| Status`. The `Status` column is empty on every row, which is itself honest.

**C52. Four incident runbooks, numbered A–D.**
`docs/auth-platform-spec.md:474-510`. See §6.6.

**C53. A kill-switch design and a monthly security report template.**
`docs/auth-platform-spec.md:512-524` and `:526-538`.

**C54. An audit-logging LOG / MUST-NOT-LOG list.**
`docs/auth-platform-spec.md:540-551`.

**C55. A verification section built from four named, dated failures.**
`AGENTS.md:216-259`. See §6.7 — this is arguably the single most portable asset in the
unit.

**C56. Four operational traps, each with measured cost.** `AGENTS.md:71-90`.

**C57. The house rule.** `CONTRIBUTING.md:60-71`:
> **Nothing in this product may claim something that isn't true.**
> …A disabled button says why it is disabled. A page never shows a placeholder that reads
> like real data. A "saved" toast appears only after something was actually saved. A
> security notice is never sent for a change that did not happen.
> It is the single most common reason a change gets sent back.

Echoed in `README.md:184-186` and enforced as a checkbox on the design issue form
(`design.yml:63-74`).

**C58. A seeding law stated in four places.** `AGENTS.md:207-214`,
`docs/build-spec.md:383-409`, `docs/deploy.md:61-86`, and `packages/db/src/seed.ts`'s own
header (referenced at `docs/build-spec.md:414`). Core sentence:
"An empty directory / registrations queue on a fresh DB is the _correct_ first-boot state;
fix it with honest empty-state copy, never with a seeded row" (`AGENTS.md:212-214`).

**C59. A "cast" for realistic copy, scoped away from seeds.**
`AGENTS.md:373-382`: "**Design frames, mockups, docs and test fixtures only — never the
seed**". Names camps, humans (`@example.com`), edition, ref-code format, and a fictional
suspended supplier for negative demo states.

**C60. An audit report format: auditor → independent refuter → surviving finding.**
`docs/simplification-audit.md:7-11`, and the finding template (see §6.8).

**C61. A "Refuted findings" section.** `docs/simplification-audit.md:1382-1384`:
"Raised by an auditor and struck down on verification. Recorded so nobody re-raises them."
Four entries, each a paragraph of counter-evidence.

**C62. An explicit statement of what the audit's evidence is and is not.**
`docs/simplification-audit.md:13-21`: "Every finding rests on static analysis… **The e2e
suite was not run for this document.**… Treat those as hypotheses with good evidence, not
as verified facts."

**C63. A named exception to the audit's own recommendation.**
`docs/simplification-audit.md:25-31`: `canManageProjectRoles` has no caller but carries a
dedicated test encoding a real authorization rule, "and deleting a tested authz predicate
to save 20 lines is a bad trade. It is left in place on purpose."

**C64. A roadmap whose ordering principles are stated before the releases.**
`docs/roadmap.md:17-24` — six numbered design principles, then the committed track. See
§9 for the full template.

**C65. In-line corrections that keep the original text.** `docs/roadmap.md:30-33`:
"> _Correction, 27 Jul 2026: R0 grew a **third** app… Auth is self-hosted Better Auth, not
Neon Auth, and 2FA/passkeys shipped inside R0 rather than waiting for R1 hardening. The
rest of this release sequence still stands._"

---

## 4. Data model

This unit owns **no database tables**. The docs describe other units' tables. For
completeness, the schema statements the doc tree is authoritative for (i.e. the frozen
contract at `docs/build-spec.md:82-122`) are reproduced verbatim in §6.5 below where they
name enums Camp 404 would have to collapse.

The one persistent artefact this unit *does* own is the **GitHub label taxonomy**, which
is code, not a table (`packages/core/src/report.ts:162-345`) — its full literal member
list is in §5.3.

---

## 5. Enum / vocabulary listings (verbatim)

### 5.1 The triage taxonomy (`docs/triage.md:31-41`)

| Namespace | Values | Who sets it |
|---|---|---|
| `type:` | `bug`, `feature`, `enhancement`, `docs`, `chore`, `copy`, `design` | Reporter states it; triage corrects it |
| `status:` | `needs-info`, `in-progress`, `blocked`, `wontfix`, `duplicate` | Triage, then whoever picks it up. `needs-info` is human-filed issues ONLY |
| `priority:` | `critical`, `high`, `medium`, `low` | **Triage only** |
| `app:` | `web`, `org`, `suppliers` | The reporter, from where it was filed |
| `area:` | `registration`, `camps`, `projects`, `questionnaires`, `notifications`, `suppliers`, `auth`, `privacy`, `data`, `ui` | Triage |
| `agent:` | `ready`, `in-progress` | Triage, then the agent |
| — | `needs-triage`, `auto-triaged`, `needs-human`, `source: in-app` | See below |

Cardinality rule (`docs/triage.md:41`): "Exactly one `type:`. Exactly one `priority:`,
once triaged. `area:` may repeat."

### 5.2 Doc metadata vocabularies (`docs/README.md:80-84`, `:153-155`)

- **Category** (6): `Product` · `Architecture` · `Engineering Spec` · `Security` ·
  `Operational` · `Planning`. "Pick the closest fit; don't invent a seventh without
  updating this table." (`:162-164`)
- **Doc status** (3): `Active` · `Historical` · `Draft`.
- **Normative language** (2): `RFC 2119 / RFC 8174 applies` · `Descriptive only`.
- **Requirement IDs** (3): `Exhaustive` · `Partial` · `N/A` — "with a short qualifier".

### 5.3 `GITHUB_LABELS` — the complete literal list (`packages/core/src/report.ts:162-345`)

31 labels, each `{name, color, description}`:

| name | color | description |
|---|---|---|
| `type: bug` | `d73a4a` | Something is broken |
| `type: feature` | `0e8a16` | New capability |
| `type: enhancement` | `a2eeef` | Improvement to something that exists |
| `type: docs` | `0075ca` | Documentation only |
| `type: chore` | `fef2c0` | Refactor, deps, tooling, tests |
| `type: copy` | `bfd4f2` | Wording in the product — wrong, unclear, or overpromising |
| `type: design` | `d876e3` | How a screen looks, reads or behaves |
| `needs-triage` | `e99695` | Entry state — not yet categorised |
| `status: needs-info` | `d4c5f9` | Waiting on the person who filed it — never on an in-app report |
| `status: in-progress` | `c2e0c6` | Actively being worked |
| `status: blocked` | `b60205` | Cannot proceed yet |
| `status: wontfix` | `e6e6e6` | Acknowledged, will not action |
| `status: duplicate` | `cfd3d7` | Tracked elsewhere |
| `priority: critical` | `b60205` | Data loss, privacy breach, or the burn is blocked |
| `priority: high` | `d93f0b` | Major feature broken |
| `priority: medium` | `fbca04` | Noticeable, has a workaround |
| `priority: low` | `0e8a16` | Minor or cosmetic |
| `app: web` | `1d76db` | Participant app |
| `app: org` | `1d76db` | Organiser console |
| `app: suppliers` | `1d76db` | Supplier portal |
| `area: registration` | `c5def5` | The six-section theme-camp wizard and its review loop |
| `area: camps` | `c5def5` | Camps, members, invites, roles |
| `area: projects` | `c5def5` | Art projects and mutant vehicles |
| `area: questionnaires` | `c5def5` | Questionnaire build, activation, fill and results |
| `area: notifications` | `c5def5` | In-app notifications, bulletins, email |
| `area: suppliers` | `c5def5` | Supplier onboarding, documents, standing |
| `area: auth` | `c5def5` | Sign-in, accounts, sessions, deletion |
| `area: privacy` | `c5def5` | Personal data, medical access, retention, audit |
| `area: data` | `c5def5` | Schema and migrations |
| `area: ui` | `c5def5` | Layout, styling, components |
| `auto-triaged` | `ededed` | Triage was performed by a routine, not a person |
| `needs-human` | `f9d0c4` | Requires a person's judgement — a routine may propose, never decide |
| `agent: ready` | `5319e7` | Triaged and scoped — safe for an autonomous agent to implement |
| `agent: in-progress` | `8a63d2` | An agent is working it (has an open PR) |
| `source: in-app` | `5319e7` | Filed by the in-app reporter — a user's words, published under the maintainer's token |

**Digit-exact constraint recorded in code** (`report.ts:338-339`): "GitHub caps a label
description at 100 characters and rejects a longer one with a 422 — which is how the first
sync of this taxonomy failed."

### 5.4 Commit scopes (`commitlint.config.mjs:16-31`, `CONTRIBUTING.md:158-169`)

`web` · `org` · `suppliers` · `core` · `db` · `ui` · `auth` · `types` · `e2e` · `repo`

Commit types (`CONTRIBUTING.md:145-156`): `feat` · `fix` · `perf` · `refactor` · `test` ·
`docs` · `build` · `ci` · `chore` · `revert`.

### 5.5 App Spec requirement prefixes (`docs/sources/app-specification/app-specification.md:91-114`)

`PURPOSE` (§1) · `CORE` (§2) · `ONBOARD` (§3) · `CDB` (§4) · `COMM` (§4a) · `STATS` (§5) ·
`SHIFT` (§6) · `BUDGET` (§7) · `PAY` (§8) · `WAP` (§9) · `TICKET` (§10) · `LAYOUT` (§11) ·
`TENT` (§12) · `ERF` (§13) · `REG` (§14) · `PREVYR` (§15) · `PNP` (§16) · `VILLAGE` (§17) ·
`CREATIVE` (§18) · `SEC` (§19) · `RELEASE` (§20) · `PRINCIPLE` (§21).

**Total requirements tracked: 584** (`docs/sources/app-specification/app-specification/requirement-index.md:12`).

---

## 6. Validation, rules and requirements — digit-exact

### 6.1 Account security policy (`docs/accounts-security-spec.md:82-110`)

- **Passwords**: minimum **15 characters** (single-factor), accept **≥64**; **no
  composition rules, no forced rotation, no confirm-twice** — one password field with a
  show-password toggle and paste allowed; length-based strength feedback; breach blocklist
  check on set (haveibeenpwned k-anonymity or local list).
- **Rate limiting & lockout**: DB-backed throttling, raisable via
  `AUTH_RATE_LIMIT_WINDOW_SECONDS` / `AUTH_RATE_LIMIT_MAX` (never set these on a real
  deployment); the `twoFactor` plugin's own account lockout at **10 failed codes /
  15 minutes**.
- **No user enumeration**: sign-in, sign-up, forgot-password all return generic messages
  ("If that account exists, we've emailed it").
- **2FA**: TOTP via authenticator apps + one-time backup codes (regenerable, **shown
  once**, stored **encrypted**). **SMS explicitly excluded** (SIM-swap + cost). Passkeys
  are additive, never the only way in.
- **Recovery**: email reset links — single-use, short-lived, enumeration-safe; **all
  sessions invalidated on reset**; notification sent on completion.
- **Email change**: confirm via the NEW address, notify the OLD address with a revocation
  link, **changes revocable for 48h**.
- **Sessions**: visible active-session list (device, approximate location, last seen);
  revoke one or all; new-device sign-in notification email.
- **Security notifications**: password changed, 2FA enabled/disabled, email change
  requested/completed, new device sign-in, deletion requested.
- **Deletion**: re-auth to request (password or 2FA) → **14-day grace period** (cancelable
  by simply signing in) → then **sanitization, not row deletion** (explicitly "the Camp
  404 'Lost Cat' precedent"). Constraints: a sole camp lead MUST transfer leadership
  first; a supplier account with in-flight onboarding warns the org; org god accounts
  cannot self-delete while they are the only god.
- **Backup codes**: **ten** single-use codes (`:51`).
- **ID retention**: `ID_RETENTION_GRACE_DAYS` = **30** days after an edition's end date;
  `identifyPurgeableIdBios` returns the bios still holding ID data for expired editions;
  `buildIdPurgePatch()` applies `{ sa_id_encrypted: null, passport_encrypted: null }`
  (`:176-181`).
- **Rate limits on the reporter**: **5 reports and 30 transcriptions per hour**, per
  account, enforced in the database (`docs/deploy.md:150-152`).

### 6.2 Triage rules (`docs/triage.md`)

- Exactly one `type:`; exactly one `priority:` once triaged; `area:` may repeat (`:41`).
- `status: needs-info` is **human-filed issues ONLY** (`:34`, `:104-108`) — "nothing can
  satisfy it and it would park the issue forever."
- `needs-human` arrives two ways with different meanings (`:75-82`): **at ingest** from
  the screen, where "the body opens with a **Held for a person.** banner and **routines
  must not act on it at all**"; **from triage**, for exactly one of four reasons — "the
  fix lands in a CODEOWNERS path; it is a product decision; the routine investigated and
  could not name a cause; or a safety gate fired."
- `agent: ready` is "**Never applied at ingest**" (`:83-84`).
- Ingest screening (`report-screen.ts`) applies `needs-human` when the report (`:119-134`):
  **addresses the reader** rather than describing the app; **asks for data to be sent,
  shared or exported**; or **carries identifiers that look like somebody else's** — and
  that last case **withholds the diagnostics entirely** ("the environment and error blocks
  are never built"). Such a report is filed **verbatim** and never handed to the model.
  "A false positive here costs one person one glance. That is the trade the patterns are
  tuned for." (`:136-137`)
- Investigation order, five steps (`:146-166`): read diagnostics before the prose and
  trust them over it (`Path` in the environment is the screen they were on — "the `route`
  on an error line is where it actually broke, and those are often different"); grep the
  exact string; state the mechanism; **check whether it is already fixed** ("_'The version
  is old, so it may already be fixed'_ is not a finding — it is a thirty-second query
  somebody declined to run"); look for siblings.
- `critical` means "data loss, a privacy breach, or the burn being blocked. It is not 'the
  reporter sounded upset'." (`:180-182`)

### 6.3 Notifications & bulletins laws (`docs/notifications-spec.md:40-51`, `:78-79`)

- **Fewer-forms**: "notifications are generated by events that already exist — no new data
  collection. Bulletin compose = title + body + audience + optional pin. Nothing else."
- **Never-payments**: "no payment notifications exist."
- **Privacy**: "notifications never leak private fields into previews; supplier standing
  changes are visible only to that supplier; org-internal events never reach participant
  inboxes."
- **Email**: "Resend digest for unread (**max 1/day**) + immediate email **ONLY** for
  blocking questionnaires and registration decisions. In-app is the source of truth."
- Panel shows "last ~6 items" (`:57`); `/notifications` filter tabs are `All / Unread /
  Bulletins`, grouped by day (`:61-63`).
- Bulletins are informational only: the compose screen carries a "Blocking-style banner
  clarifies bulletins are informational — anything requiring action should be a
  questionnaire" (`:70-72`).

### 6.4 Questionnaire builder v2 target set (`docs/questionnaire-spec.md:247-311`)

**Content & structure blocks** (`:252-259`): Section/page break (each section = a page in
the runner; progress indicator) · Info text block · Image block (Vercel Blob; also images
attached to a question or to individual choice options) · **Video block EXCLUDED for now**
— "no-connectivity culture + weight; revisit only on demand".

**Question types** (`:263-278`) — have vs new:

| Type | Status | Notes |
|---|---|---|
| Short answer | ✅ have (`short_text`) | gains validation rules |
| Paragraph | ✅ have (`long_text`) | gains length limits |
| Multiple choice (radio) | ✅ have (`single_select`) | gains "Other…" free-text option + option images |
| Checkboxes (multi) | ✅ have (`multi_select`) | gains "Other…", min/max selections |
| Dropdown | NEW render variant of single_select (long option lists) | |
| Yes/No | ✅ have (`boolean`) | kept (our addition; Forms models it as MC) |
| Linear scale | NEW — min/max **0–10** with end labels | |
| Rating | NEW — **3–10 steps**, star/heart/number glyph | |
| Multiple-choice grid | NEW — rows × columns, single per row | |
| Checkbox grid | NEW — rows × columns, multi per row | |
| Date | NEW | edition-aware defaults (e.g. build-week picker variant) |
| Time | NEW | |
| Number | NEW (Forms does this via validation; first-class for us) | |
| File upload | NEW — Vercel Blob, type/size/count limits | |

**Logic & validation** (`:282-286`): required per question (have) · response validation on
text/number (length, regex, numeric range, email/url presets) · "Other" option on choice
questions · min/max selection counts on checkboxes · **branching**: "go to section based
on answer" on radio/dropdown (per-option → section target | submit) · option shuffle
(minor, last).

**Runner UX** (`:290-292`): multi-page navigation with progress bar · per-page validation ·
draft autosave (have) · author-set **confirmation message** on submit ·
**edit-after-submit toggle** · author **preview mode** before sending.

**Author/admin** (`:296-299`): duplicate questionnaire as template · manual close/reopen +
`due_at` · **response summary view with per-question charts** (choice counts as bars,
scale histograms) · **CSV export** of responses · per-question response breakdown
alongside the existing per-user table.

**Explicitly EXCLUDED** (`:301-305`): email collection/receipts/notify-by-email lists ·
quiz mode, points, answer keys · collaborator sharing · themes · prefilled-link generation
· add-ons/scripts · embedding.

**Engine mechanics** (`:187-211`, described as "Camp 404 pattern, already ported"):
Activation = definition × edition × audience spec (jsonb) × options (`blocking` bool,
`due_at` nullable); "Activating resolves the audience **at send time** into
`required_actions` rows (key `questionnaire:<activation_id>`) per user."

**Role caps** (`:99-106`): "cap **20 roles/project**"; delete is "**custom roles only** —
confirm-with-count cascade ('11 members hold this role — remove it from them?')".

### 6.5 Schema-contract statements the docs own (`docs/build-spec.md:82-122`)

Reproduced because they are the exact places multi-tenancy is baked in:

- `groups` — kind enum (`org|theme_camp|artwork|mutant_vehicle`), `name_normalized`
  (unique per kind, case/space/punct-insensitive), description **60-word limit** for
  camps, joinability enum (`open|invite_only`), `visibility` reserved column (default
  `default`). "Exactly one seeded `org` row ('AfrikaBurn')." (`:106`)
- `memberships` — role enum (`god|org_staff|lead|admin|member|engineer`),
  unique(user, group) (`:107`).
- `registrations` — status enum
  (`draft|submitted|under_review|changes_requested|approved|rejected|withdrawn`);
  layout upload URLs **max 4** (`:113`).
- `section_reviews` — section key enum (six values), status (`open|resolved`) (`:114`).
- `suppliers` — `standing` enum (`good|watch|suspended`), code format `SUP-2027-0416`,
  stored not derived (`:116-119`).
- `payments` — status enum (`pending|reconciled|waived`), currency default **ZAR**,
  reference e.g. `QP-2027-MAH-001`. "**No processing, ever.**" (`:121`)
- Name dedupe: "reject exact-normalized match, **warn on trigram similarity ≥ 0.55**"
  (`:132`).
- Username: "account-level, optional, **3–20 chars**, unique on `lower(username)`"
  (`:87-88`).
- Edition seed: "**AfrikaBurn 2027, 2027-04-26 → 2027-05-02, active**" (`:112`).

### 6.6 Incident runbooks (`docs/auth-platform-spec.md:474-510`)

- **A. Suspected credential stuffing** — 6 numbered steps, plus a stated
  "**Detection gap [open question]:** confirm a real failed-login-spike detector is
  actually wired."
- **B. Leaked secret** — handled per-secret. For the encryption key: "**without
  key-versioning you cannot tell old from new ciphertext, so build the versioned-key
  scheme BEFORE you need it**"; "a leaked key protecting ID numbers is **very likely a
  reportable s22 compromise even without proven exfiltration**… Rotate on suspicion, not
  just proof."
- **C. Compromised god-admin account** — "**because `GOD_EMAILS` grants god on first
  login, IMMEDIATELY remove the affected email from the `GOD_EMAILS` env list** so a
  re-login can't silently re-grant god — session revocation alone does NOT contain this."
  *(Directly applicable: Camp 404 has the same `GOD_EMAILS` bootstrap.)*
- **D. Accidental PII exposure** — 5 steps, with "**preserve evidence (logs, access
  records) before rotating anything**" as step 3.

Kill-switch (`:512-524`): must be "**state the request path reads on every invocation** (a
DB row or edge config), not an in-memory toggle" — because "on Vercel serverless there is
no long-lived process to signal". Four components: a DB-backed global read-only/
maintenance flag; per-capability disable reusing `AUTH_CAPABILITIES`/`assertCapability`; an
emergency revoke-ALL-sessions broadcast; and reuse of the `ACCOUNT_SWEEP_SECRET` pattern
for incident-only endpoints. "**Prefer DB-flag over env for anything you need to flip in
seconds** — env changes on Vercel need a redeploy."

Audit logging (`:540-551`) — **LOG**: sign-in success/failure (reason category, IP, coarse
user-agent), lockout, password change, reset requested/completed, email-change
requested/confirmed/revoked, session revoke, deletion requested/cancelled/executed, OAuth
link/unlink, 2FA enable/disable. **MUST NOT be put in `meta`**: plaintext passwords or
hashes, session tokens, reset/verification tokens, TOTP secrets, backup codes, or
hard-locked PII — "a log of reset tokens is a credential store".

### 6.7 The verification section (`AGENTS.md:216-259`) — verbatim, in full

This is the highest-value single passage in the unit.

> ## Verification (how to be right, not just confident)
>
> Nearly every expensive mistake in this repository has the same shape: a plausible
> belief, stated as fact, never measured. These are real, all of them recent, and each
> one passed a confident review first:
>
> - A migration verified against a live database — inserts, both uniqueness rules, the
>   cascade — that still broke **every questionnaire write in the product**. The
>   verification never ran an `ON CONFLICT` upsert, which is how the app actually
>   writes. _Proving a constraint behaves is not proving the queries that depend on it
>   still run._
> - A one-line "safety" addition to a session read that tripled a spec's CI failure
>   rate. Ten runs on each side of the change found it; reasoning about it did not.
> - `.pen` files documented as "encrypted" in three files, taken from a tool's own
>   description. `file` says JSON. Nobody had run `file`.
> - Three separate wrong diagnoses of the same CI failure, each argued well. The
>   answer came from a **timestamp**: a real build takes minutes, and these were dying
>   in one second, so nothing was building at all.
>
> So, in this repo:
>
> - **Measure before you claim.** If you are about to write "this is because…", run the
>   thing that would show it. A `git log`, a `df -h`, a `file`, two timestamps.
> - **Attribute before you blame.** A failing test on your branch is not automatically
>   yours, and not automatically flake. Run it on `main`. Run it in isolation. Run it
>   several times — a single green run does not disprove a 30% flake rate.
> - **A test that cannot fail proves nothing.** After writing a regression test, break
>   the thing on purpose and watch it go red. Several tests here say so in a comment
>   because that check found them vacuous.
> - **A test that passes for the wrong reason is worse than no test**, because it is
>   counted. Two shapes have already shipped here, and neither is visible in a coverage
>   report — both files reported high coverage while the behaviour was unpinned:
>   - **Asserting an absence against a page that has not rendered.** `toHaveURL`
>     resolves before the destination paints, so `toHaveCount(0)` after it is satisfied
>     by an empty document. Assert something PRESENT first (`e2e/README.md`
>     §"Selector traps").
>   - **A fixture whose values are outside the domain vocabulary.** A status-board test
>     seeded officer assignments with `officerKey: "safety"` and `"lnt"` — neither is in
>     the `OfficerKey` enum — so no seeded row ever matched a required slot and the whole
>     assignment path was inert. Deleting the consent filter entirely left all 54 tests
>     green. **Seed values from the enum, and check the fixture moves the number**: seed
>     the opposite case and watch the assertion change.
> - **Report what happened.** If a step was skipped, say so. If something is unverified,
>   say which part. "Verified" is a strong word here and it gets read literally.

### 6.8 The audit finding template (`docs/simplification-audit.md`)

Every finding follows this exact shape (example: `:62-79`, `:1364-1378`):

```markdown
### <One-sentence claim as the heading>

**<Category>** · ~<N> lines · confidence: <high|medium|low>

Sites:

- `path/to/file.ts:LINE`
- `path/to/other.ts:LINE`

<Prose: what the duplication/deadness IS, and why it matters to a reader.>

**Evidence.** <The exact commands run and their outputs — `diff -u a b` → 5 changed
lines; `grep -rn "SYMBOL" dir` → one hit, the definition itself.>

**Fix.** <What to do, and whether it preserves behaviour.>

> **Verifier.** <An independent agent's paragraph: which claims were re-checked
> against source, which line numbers say what, whether the size estimate holds, and
> whether the proposed fix changes behaviour.>
```

Categories and counts (`:33-38`): Redundancy 37 · Collaboration hazard 15 · Dead code 12 ·
Simplification 2 = **66 findings survived; 4 were refuted** (`:9-11`). Rough total
**~5,191 lines** (`:23`). Ordering ("Where to start", `:40-54`) is "by value returned per
unit of risk, not by size": (1) delete what is provably dead, (2) fix the comments that
lie, (3) collapse the fork, (4) then the CI/config duplication.

---

## 7. Public API surface — exported signatures, verbatim

This unit's only exported code is the label machinery.

```ts
// packages/core/src/report.ts:147-152
export interface GithubLabel {
  name: string;
  /** 6-digit hex, no leading "#". */
  color: string;
  description: string;
}

// packages/core/src/report.ts:162
export const GITHUB_LABELS: readonly GithubLabel[] = [ /* 31 entries, §5.3 */ ] as const;

// packages/core/src/report.ts:357-373
export function reportLabels(
  type: ReportType,
  surface: ReportSurface,
  flags: readonly ReportFlag[] = [],
): string[];
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

Behavioural contract of `syncGithubLabels` (`labels-sync.ts:8-11`): "Idempotent: existing
labels are updated in place (colour and description), missing ones created, and **labels
NOT in the list are left completely alone — this owns its taxonomy, not the repository's**."
Encoding note (`:51-53`): "Names contain a space and a colon, so they must be encoded — an
unencoded `type: bug` requests a label GitHub has no record of and every update silently
becomes a create."

`scripts/setup-github-labels.ts:41-43` treats a partial sync as a failure: "A partial sync
leaves the reporter able to apply a label the repo does not have, so this is a failure
rather than a warning." → `process.exit(1)`.

### 7.1 The `design/qa/audit.py` CLI (`design/qa/audit.py:4-31`)

```
python3 audit.py --all                 # audit every top-level frame
python3 audit.py <frameId> [...]       # audit specific frames
python3 audit.py --sections <frameId>  # print the frame's component manifest only
python3 audit.py --json out.json ...   # also write machine-readable report
```

Check families and their literal tolerances: `TOL = 2.5` px, `OVERLAP_MIN = 4.0` px
(`audit.py:38-39`); LETTER-STACK triggers under **44px** wide; NARROW-TEXT under **90px**;
TOUCH-TARGET (mobile, width ≤ 400) under **40px** tall; FONT size **< 9.5** is a defect;
`FORBIDDEN = re.compile(r"(payment|reconcil|yoco|lorem ipsum|\bTODO\b)", re.I)`
(`audit.py:51`); `ALLOWED_FONTS = {"$font-brand", "Montserrat", "JetBrains Mono",
"$font-mono"}` (`:52`).

A deliberately-documented trap in the archive set (`audit.py:40-50`): "Do NOT add a frame
here just because it was superseded: sCEHP/ELUfI (Builder v1) were briefly added and that
silently dropped two real, still-drawn frames out of every `--all` run."

### 7.2 The regeneration protocol (`docs/README.md:235-271`) — the nine steps, condensed verbatim

1. **The App Spec is edited** (a requirement added, changed, or removed).
2. **The change is logged** in the App Spec's own Change Record, citing the specific
   `PREFIX-NNN` IDs touched.
3. **Someone brings the change here** — "there is no automation watching the external doc".
4. **Find every citing location**: `grep -rn "<ID>" docs/` — "exhaustive by construction".
   Also search the wildcard prefix.
5. **A removed ID** is never deleted from a citing doc — struck through in place with
   `(Removed — see Change Record <date>)`.
6. **A changed ID**: re-read the citing doc's claim. "this is a human judgement call, not a
   mechanical sync."
7. **A new ID**: check whether existing prose already covers it ("common — the App Spec
   sometimes catches up to shipped work before the reverse"). If not, "feed it into
   `technical-spec.md`'s own ✅🚧❌⚠️ gap-analysis mechanism rather than starting a second
   tracking system."
8. **Update the header** if a whole prefix range is affected.
9. **Cite the Change Record** in the commit message for any spec-sync commit.

---

## 8. Test coverage

### 8.1 `packages/core/src/__tests__/issue-forms.test.ts` — the doc↔config consistency test

Six `it()` blocks (`:65-141`):

| Test | Asserts |
|---|---|
| `has forms to check` | `files.length > 0` — "A glob that matches nothing passes every `for` loop under it in silence." (`:69-70`) |
| `only applies labels the sync script actually creates` | every form label ∈ `GITHUB_LABELS` (`:73-84`) |
| `starts every issue at needs-triage` | every form applies `needs-triage` (`:86-92`) |
| `gives every issue exactly one type:` | exactly one `type: ` label per form (`:94-100`) |
| `keeps the bug form's confirmations required` | ≥2 `- label:` + `required: true` pairs **inside the `personal-data` group specifically** (`:102-131`) |
| `never lets a form set priority:` | no form label starts with `priority: ` (`:133-141`) |

Two narrowings in the fifth test are themselves documented as earlier bugs in the test
(`:114-121`): counting `required: true` under `validations:` "left the test green with both
confirmations deleted", and counting file-wide "proves only that SOME group has two". Also
`:110-113`: "Structural on purpose. Asserting the WORDING would fail on a reword and pass
on a warning that had been edited down to nothing, which is the wrong way round."

Parsing choice recorded at `:21-23`: "The forms are parsed with a regex rather than a YAML
dependency: `labels:` is written in flow style on one line in every form, and a form that
stops matching fails this test rather than skipping it." The error message enforces that
(`:57-60`): "If the form now uses block style, teach this test to read it — **do not delete
the check**."

### 8.2 The coverage ratchet (`packages/core/vitest.config.ts`)

Config include/exclude (`:15-16`): `include: ["src/**/*.ts"]` — "Count every source file,
not only the ones a test happens to import, so the percentage describes the package rather
than the test run"; `exclude: ["src/**/__tests__/**", "src/__fixtures__/**",
"src/index.ts"]`. Reporters: `["text", "json-summary", "json"]`, `reportOnFailure: true`
(`:11-12`).

Global floors: `lines: 90, statements: 89, functions: 92, branches: 82` (`:28-31`).
Six 100% files and seven authz files (see C31 above). Rationale for the 100s (`:33-40`):
"These decide whether somebody's medical note, phone number or ID number reaches a screen
it should not, and whether a stranger's words reach a public issue unredacted. They are
pure functions with no I/O, so full coverage is achievable and staying there is cheap. A
new uncovered branch here should fail the build and be looked at, which is what a floor at
the ceiling is for."

**What coverage does NOT measure**, stated in CI (`.github/workflows/ci.yml:341-345`):
"Vitest measures only what runs inside the vitest process. The persona suite drives real
browsers against `next dev` / `next start` in separate processes with no instrumentation,
so all 165 e2e tests contribute ZERO to…"

### 8.3 The CI gate shape (`.github/workflows/ci.yml`)

| Job | Name | Notes |
|---|---|---|
| `commitlint` | `commit conventions` | PR-only; `fetch-depth: 0` because "the range check below needs the merge base" (`:41-42`); lints the PR title **and** every commit from the merge base |
| `ci` | `lint · typecheck · test · build` | The unit gate |
| `e2e` | `e2e · ${{ matrix.label }}` | 8 per-persona shards, `fail-fast` disabled |
| `coverage` | `coverage · ${{ matrix.workspace }}` | 8 shards, one per workspace, with a `Is this workspace in scope?` step (`:438`) |
| `ci-pass` | **`CI pass`** | `if: always()`, `needs: [commitlint, ci, e2e, coverage]` — the one required check |

`CI pass` logic (`:532-556`): `ci`, `e2e` and `coverage` must be `success`; `commitlint`
may be `success|skipped` "because it is pull-request-only and does not run on a push to
main. Anything else (failure, cancelled) must [fail]."

### 8.4 The e2e "Selector traps" catalogue (`e2e/README.md:228-270`)

Seven traps, each "produced a failure that _looked_ like a product bug. The specs were
authored against source, never against a live DOM, so the whole class went unnoticed until
the suite was first executed." (`:230-232`) The most portable:

- **`getByRole("alert")` can never resolve to one element** — Next injects
  `<div role="alert" id="__next-route-announcer__">` into every page, "so a bare alert
  query always matches it too — and `toHaveCount(0)` can never pass."
- **`toHaveCount(0)` right after `toHaveURL` proves nothing** — "`toHaveURL` resolves the
  instant the URL changes — before the destination has painted… Four assertions across
  three specs did exactly this, and one of them (`camp-member-forbidden`) had been green
  for months on a page it never actually looked at… **Assert something PRESENT before
  asserting anything absent**." It also caught a false comment: "a comment asserting the
  page 'actually rendered (not a 404 masquerading as absence)' was checking that an error
  message was _absent_, which is equally true of a blank page."
- **`.click()` is not "the request finished"** — "It resolves when the event is dispatched.
  Navigating straight afterwards raced the sign-up POST and the session cookie did not
  exist yet, so the gate bounced to sign-in and ~100 specs blamed the product."
- **A `required` field's label contains the asterisk** — accessible name is
  `"Contact email *"`; use a prefix regex.
- **A field collides with its own privacy switch** — strict-mode violation; scope with
  `getByRole("textbox", { name: … })`.

### 8.5 Documentation-adjacent tests elsewhere in the donor

Named in the docs, verified to exist by path reference (not read in full for this unit):
`apps/org/lib/__tests__/org-role-lockout.test.ts` (`AGENTS.md:195-196` — "Named lockout
tests"), `apps/org/lib/__tests__/roster-privacy.test.ts`
(`docs/accounts-security-spec.md:262`), `apps/org/lib/__tests__/medical-audit-surface.test.ts`
("which pins the absence of aggregation/alerting as well as the presence of the record",
`:332-333`), and a `/system`-panel secret-leak test — "A unit test seeds every credential
env var with a marker and asserts no marker survives into any rendered string"
(`docs/build-spec.md:363-364`).

---

## 9. The roadmap structure, as a reusable template

`docs/roadmap.md` — 124 lines, six parts:

1. **Header block + a framing italic paragraph** (`:11-15`) naming which source documents
   the committed track is built from and what orders the releases: "Releases are ordered by
   deadline pressure: registration season drives R1, the event itself drives R2."
2. **"Design principles that shape the ordering"** (`:17-24`) — six numbered principles,
   each a bolded slogan plus its consequence. E.g. #1 "**Fewer forms, not more.**… A
   feature that adds mandatory admin has the burden of proof against it."; #5 "**Big
   speculative builds never block a release.**"; #6 "**The platform never holds funds.**"
3. **"Committed track"** (`:26-84`) — `### R<n> — <name> _(deadline: …)_` sections. R0
   carries an inline dated correction block (`:30-33`). Each release is a bulleted list of
   deliverables with the flagship item bolded.
4. **A parenthetical sub-project section** (`:57-66`) for work that becomes its own app.
5. **"Candidate directions — from the topic map"** (`:86-101`), gated by a stated
   three-part graduation test (`:88-90`): "Each graduates only if (a) someone real asks for
   it, (b) it survives the fewer-forms test, and (c) it doesn't add a POPIA surface AB
   hasn't justified. Listed roughly by how plausibly they'd graduate." Ends with a
   **"Out, permanently"** entry.
6. **"What we need from others to keep this moving"** (`:103-115`) — a `Blocker | Blocks |
   Who` table, and then one parked platform-level idea (`:117-124`).

**Portable as-is.** Camp 404's roadmap currently lives in 12 open GitHub issues (WP1–WP12)
plus a scatter of `docs/*.md` files with contradictory status headers. The donor's shape —
principles → committed track with deadlines → candidate track with a stated graduation
test → blocker table with named owners — is exactly the missing frame, and it does not
carry a single AfrikaBurn-specific structure.

---

## 10. UX behaviours

This unit is documentation, but four of its artefacts define user-visible behaviour:

1. **The issue-form experience.** Blank issues disabled; four typed forms; two contact
   links that route security and uncertainty away from the queue
   (`.github/ISSUE_TEMPLATE/config.yml`). The bug form's URL hint stops at `?`; the
   console-error field states plainly that it publishes verbatim; two required
   confirmations before posting.
2. **The in-app reporter's disclosure UX** (`docs/flows.md:144-165`): a corner pill
   bottom-left on every screen; a bug attaches "the 9 device fields + recent errors, shown
   **BEFORE** sending"; a feature request attaches nothing about the device; type or
   dictate; server screens both the words and the diagnostics; a third-party identifier
   withholds the diagnostics and files verbatim as `needs-human`. "The reporter is only
   offered where it can work: no `GITHUB_TOKEN`, no pill." (`:164`)
3. **The `/system` panel's honesty behaviours** (`docs/build-spec.md:148-181`,
   `:360-364`): it "**probes rather than reads back config** ('the variable is set' and
   'the service answers' are different claims)"; it shows the migration verdict from
   `planMigration`, *the same function the build calls*, "including the exact sentence a
   deploy would fail with"; security controls are "derived from @quagga/auth's own
   resolvers so the page MUST NOT report a rule the stack is not applying"; it "**MUST NOT
   print a secret** — only whether one is set", with the DB hostname parsed out as the one
   deliberate exception and `GOD_EMAILS` reported as a **count**.
4. **The permanence-reason pattern** (`docs/build-spec.md:335-338`): "A permanent role MUST
   render with **no delete control anywhere** and the reason in words ('Suppliers needs a
   lead and a member, so this role exists as long as the department does'); **it MUST NOT
   render as a disabled button.**" And the rights editor "is a checklist of **consequences**
   — 'permanently removes a supplier and everything hanging off them… there is no undo',
   not `delete: true`."

---

## 11. Dependency footprint

The doc system itself needs **nothing**. The enforcement layer needs:

| Need | Package(s) | Donor version | Camp 404 today |
|---|---|---|---|
| Commit-message enforcement | `@commitlint/cli`, `@commitlint/config-conventional`, `husky` | `^21.2.1`, `^21.2.0`, `^9.1.7` (donor root `package.json`) | **absent** |
| Label sync script runner | `tsx` | `^4.23.5` (donor root) | absent (Camp 404 has no root `tsx`) |
| Coverage ratchet | `@vitest/coverage-v8` | `^4.1.10` in **all 8 workspaces** | **absent in every workspace**, yet `turbo.json`'s `test` task already declares `outputs: ["coverage/**"]` |
| `pnpm labels:sync` | `GITHUB_TOKEN` (fine-grained PAT, **Issues: read and write**, scoped to `GITHUB_REPO`) | `docs/deploy.md:134` | n/a |
| Design QA harness | Python 3 + a running Pen app (`design/qa/penctl.py` talks JSONRPC to it) | — | Camp 404's pencil MCP is configured (currently failing to connect this session) |

Zero new runtime dependencies. `labels-sync.ts` uses bare `fetch` with
`X-GitHub-Api-Version: 2022-11-28` (`labels-sync.ts:23-31`) — no Octokit.

---

## 12. AfrikaBurn / multi-tenant coupling

| Asset | Coupling | What Camp 404 must change |
|---|---|---|
| Metadata header block, precedence chain, status glyphs, Requirement-ID protocol, regeneration protocol | **None** | Camp 404 has no external App Spec. Substitute the top of the chain: either "the Pencil design canvas + the WP issues" or nothing at all, and mark every doc `Requirement IDs: N/A`. Or invent an internal ID scheme — but note the donor's own rule "this repo only ever *cites* those IDs, never mints its own" (`docs/README.md:197-198`) exists because minting is the failure mode |
| `docs/README.md` index-as-rulebook | **None** | Direct port; substitute Camp 404's own doc list |
| `docs/sources/` never-edit corpus | **None** structurally; the *contents* are 100% AfrikaBurn | Camp 404's analogue is `design/spec/` + the Pencil extracts. The rule "correcting a source to agree with the build destroys the only record of what was actually asked for" applies verbatim |
| `docs/technical-spec.md` 1:1 gap-analysis mirror | Section list is the App Spec's 21 sections | Camp 404's equivalent axis is the 12 WP issues, or `design/feature-set/`'s 31 units. The *mechanism* (glyph + per-section citation + "what it would actually take") is free |
| Triage taxonomy | `app:` values `web|org|suppliers` are the three-app split; `area:` values are AfrikaBurn domains | **Drop `app:` entirely** (Camp 404 is one app). Rewrite `area:` to Camp 404 domains — e.g. `onboarding`, `roster`, `teams`, `questionnaires`, `notifications`, `auth`, `privacy`, `data`, `ui`, `mcp`. Everything else (`type:`, `status:`, `priority:`, `agent:`, the four actor labels) ports unchanged |
| `GITHUB_LABELS` | 3 `app:` labels + 10 `area:` labels are donor-domain | 18 of 31 labels port verbatim; 13 need renaming |
| `issue-forms.test.ts` | None — it reads `.github/ISSUE_TEMPLATE/*.yml` and `GITHUB_LABELS` | Direct port; the `personal-data` group-id assertion needs Camp 404's own form to carry a matching group |
| Issue forms | "Which app?" dropdowns (3 options) are the split; the privacy warnings reference AfrikaBurn PII classes | Delete the app dropdown; keep the URL-token and console-paste warnings — Camp 404 also has POPIA-class PII (`packages/db/src/crypto.ts`, `id-documents.ts`) |
| PR template | **None** (`web·org·suppliers` appear only in a comment listing scopes) | Direct port; swap the scope list |
| `commitlint.config.mjs` | Only the `SCOPES` array | Camp 404 scopes: `web` · `mobile` · `admin-cli` · `ui` · `db` · `types` · `core` · `ai-prompts` · `telegram` · `repo` |
| `CI pass` aggregate | **None** — its own comment says "Same pattern as camp-404 and ops-board" (`ci.yml:326`) | Verify whether Camp 404 already has it; if so this is a re-import, not an import |
| Coverage ratchet | The per-file 100% list names donor files | Camp 404 equivalents at 100%: `packages/core/src/access.ts`, `text-redaction.ts`, `id-validation.ts`, `promotion.ts`, `invites.ts`, `family-tree.ts` — all pure, zero-I/O, already isolated in `@camp404/core` |
| `docs/accounts-security-spec.md` | Better Auth API names (`auth.api.changePassword`, etc.) and the three-app structural decisions | **The policy half is provider-agnostic and lands on greenfield** — Camp 404 has ZERO of these surfaces. Decisions (1)/(2)/(3) about which app owns deletion/email-change collapse to nothing in a single-app repo; decision (4) (sweeper never runs unauthenticated or in a build) maps directly onto Camp 404's `assertCron` |
| `docs/notifications-spec.md` | Audience keys (`camp_leads`, `registered_camp_leads`, `mv_leads`, …) are group-scoped and edition-scoped | Camp 404's `broadcast_scope` is already `[everyone, team, team_leads, drivers, individual]` — a flat, single-camp vocabulary. Port the four **laws** and the surface list, not the audience enum |
| `docs/questionnaire-spec.md` | The authoring-levels section (org-internal / org-outbound / project) is the org/participant split; custom project roles are group-scoped | **Collapse three authoring levels to one** (captain-authored). Builder v2's block/type/logic/runner/author tables (`:247-311`) are pure feature spec and port unchanged — and they are exactly Camp 404's builder Phase E gap |
| `docs/supplier-spec.md` | 100% supplier-population coupled | **Leave behind entirely.** Camp 404 has no supplier population |
| `docs/auth-platform-spec.md` §8–§11 | Better Auth internals, POPIA-SA specifics, `GOD_EMAILS` bootstrap | POPIA applies to Camp 404 identically (SA IDs, `PGCRYPTO_KEY`). The `GOD_EMAILS` runbook C is directly applicable — Camp 404 has the same bootstrap and the same "still works, deprecation deferred" note (`docs/first-time-setup.md:86-87`) |
| `docs/build-spec.md` | Schema is 44 tables assuming `group_id` + `edition_id`; org-roles v1 is the org tier | **Do not port the schema.** Port the *shape*: hard constraints numbered, monorepo layout, env-var list with the "update turbo.json globalEnv in the same change (Camp 404 rule)" note (`:78`), core-logic-that-MUST-have-coverage list (`:411-416`), Explicitly-NOT-built list |
| `docs/component-spec.md` | Frame ids and route names are donor | The *pattern* — usage-ranked tiers, route→frame index, per-component definition of done — is exactly what Camp 404's `design/spec/impl/app/` (27 files) is reaching for |
| `docs/deploy.md` | Three Vercel projects, Neon branch quota, Resend | The **symptom→clock diagnostic table** (`:165-173`) and the "smoke test creates the data it verifies" principle (`:208-234`) port cleanly |
| `design/qa/REVIEW.md` + `audit.py` | Pen-specific bridge, AfrikaBurn `FORBIDDEN` regex (`payment|reconcil|yoco`) | The **process** (decompose → measure → fix by property, verify by measurement → targeted visual pass → cross-frame invariants) and the whitelist-needs-a-WHY rule are free. `audit.py` needs the same Pencil bridge Camp 404 already uses |
| `AGENTS.md` §Verification | **None** — the four failures are generic engineering failures | The single most portable passage. Camp 404's `AGENTS.md` has no equivalent |
| `CONTRIBUTING.md` house rule | **None** | Direct port |
| Seeding law | Free of tenancy; the *list* of seeded reference data is donor | Camp 404's analogue: `camp_settings` bootstrap + `DEFAULT_TEAMS`. The rule "no seeded accounts, ever" already holds in Camp 404 (there is no seed script at all) |
| Simplification-audit format | **None** | Direct port. Camp 404 has an analogue in `design/feature-set-verification-report.md` (2,097 claims, 96.66% verified) but no auditor→refuter finding template |
| Roadmap template | R0–R3 names and the blocker owners are donor | Structure is free |

**The one structural warning for any doc port.** The donor's precedence chain has FOUR
levels because there is an external, separately-owned spec above the repo. Camp 404 has
no such document — its top level is the owner's own decisions and the Pencil canvas. A
naive port would create an empty top slot and a Requirement-ID protocol with no IDs to
cite, which is worse than no protocol. **Adopt the header block, the glyph legend, the
index-as-rulebook and the `Doc status` field first; adopt the Requirement-ID machinery
only if and when Camp 404 acquires a stable external requirement source.**

---

## 13. Verbatim excerpts of the five most valuable pieces

### 13.1 The metadata header block + its field definitions (`docs/README.md:145-175`)

```markdown
## The standardised metadata header block

Every doc in this folder (except `docs/sources/`, which isn't a spec) carries
this 5-row table directly under its H1, before any other content:

| Field | Value |
|---|---|
| **Category** | Product \| Architecture \| Engineering Spec \| Security \| Operational \| Planning |
| **Doc status** | Active \| Historical \| Draft |
| **Normative language** | RFC 2119 / RFC 8174 applies \| Descriptive only |
| **Requirement IDs** | Exhaustive \| Partial \| N/A — with a short qualifier |
| **Owner / Updated** | *name or "Repo maintainers", date* |

Field definitions:

- **Category** — one of the six values in the index above. Pick the closest fit;
  don't invent a seventh without updating this table.
- **Doc status** — `Active` (current, maintained), `Historical` (kept for the
  record, not actively updated — state *why* in the doc's own prose if not
  obvious), or `Draft` (not yet reviewed).
- **Normative language** — whether RFC 2119/8174 keywords carry weight in this
  doc. See above.
- **Requirement IDs** — `Exhaustive` (every relevant App Spec requirement is
  cited, doc-wide or section-wide), `Partial` (some are cited, best-effort, not
  audited for completeness — say which prefixes), or `N/A` (this doc has no
  meaningful relationship to the App Spec — say why in one clause, e.g.
  "operational, not spec-derived").
- **Owner / Updated** — who to ask, and when the header (not necessarily the
  body) was last touched.
```

### 13.2 The status-glyph precedence rule (`docs/README.md:112-143`)

```markdown
### The status-symbol legend

This is the canonical, repo-wide meaning for these four symbols from now on,
copied from where it was first defined in [`technical-spec.md`](technical-spec.md):

| Symbol | Meaning |
|---|---|
| ✅ | **Built** — working in the deployed apps, with tests |
| 🚧 | **Partial** — some of it works; the rest is named nearby |
| ❌ | **Not built** — no code, no database tables |
| ⚠️ | **Blocked** — cannot be built yet, and the blocker is not code |

**A section heading's glyph is a summary, not the last word.** In
`technical-spec.md`, a `##` heading glyph states the section's overall call;
the `**Requirement IDs:**` line beneath it is the authoritative, per-id
breakdown, and the two may legitimately differ in altitude rather than agree —
§8 and §10 head ⚠️ *blocked* while every id they cite is ❌ *not built*, because
the platform's non-negotiable policy stance (never run a payment gateway;
Quicket stays the system of record) isn't quite the same claim as "the code
doesn't exist," even though the practical effect is the same. Where a heading
and its own citation line flatly disagree rather than differ in altitude,
that's a bug, not a difference of perspective — fix the heading.

**One collision to know about, not fix:** [`build-spec.md`](build-spec.md)'s org
capability-matrix table and [`questionnaire-spec.md`](questionnaire-spec.md)'s
role-defaults tables reuse ✅/❌ for a plain boolean "does this role have this
right, yes or no" — a different, older, local meaning that predates this
convention. Those specific pre-existing tables are left as they are (per the
restructure's "don't change content unnecessarily" rule); just don't assume ✅/❌
means "built" in a table clearly answering a yes/no permissions question. New
tables SHOULD avoid reusing these four glyphs for plain booleans, to stop the
collision from spreading.
```

### 13.3 The issue-forms consistency test's header + its narrowings (`packages/core/src/__tests__/issue-forms.test.ts:1-23`, `:102-131`)

```ts
// The issue forms and the label taxonomy, checked against each other.
//
// `report.test.ts` already asserts that every label the IN-APP REPORTER applies
// exists in `GITHUB_LABELS`. Nothing asserted the same of the labels in
// `.github/ISSUE_TEMPLATE/*.yml`, and they drifted the whole way apart:
//
//   · `bug.yml` applied `bug` and `feature.yml` applied `enhancement` — which
//     exist, but only because they are GitHub's DEFAULT labels. A parallel
//     vocabulary next to `type: bug` and `type: enhancement`, describing the
//     same thing in a namespace triage does not read.
//   · `copy.yml` and `design.yml` applied `copy` and `design`, which the
//     repository has never had. GitHub drops a label a form asks for and the
//     repository does not have — SILENTLY — so those issues landed unlabelled.
//   · No form applied `needs-triage`, the entry state `docs/triage.md` calls
//     the thing everything starts at. Only the reporter ever set it, so no
//     issue a person typed into GitHub entered the queue at all.
//
// Each of those is invisible in review — the YAML is valid and the form works.
// It only shows up as issues quietly arriving wrong, weeks later.
//
// The forms are parsed with a regex rather than a YAML dependency: `labels:` is
// written in flow style on one line in every form, and a form that stops
// matching fails this test rather than skipping it.
```

```ts
  it("keeps the bug form's confirmations required", () => {
    // The bug form is the one filed from inside an authenticated session, so it
    // is the one that can carry somebody else's medical note or a live
    // password-reset token out of a URL. Nothing sanitizes this path: a report
    // filed through the app goes via `report-sanitize.ts`, and a form does not.
    // The checkboxes are the whole of the defence, so removing one — or quietly
    // dropping `required` — has to fail rather than merely look tidier.
    //
    // Structural on purpose. Asserting the WORDING would fail on a reword and
    // pass on a warning that had been edited down to nothing, which is the
    // wrong way round.
    const source = readFileSync(join(FORM_DIR, "bug.yml"), "utf8");
    // Two narrowings, each of which an earlier version of this test got wrong:
    //
    //   · a `required: true` DIRECTLY under a `- label:` is a checkbox option.
    //     The ones under a `validations:` are not, and this form has several —
    //     counting those left the test green with both confirmations deleted.
    //   · counting file-wide proves only that SOME group has two, so deleting
    //     these two and adding a required checkbox elsewhere would also pass.
    //     Scope to the group by id, and let a rename fail rather than vanish.
    const block =
      source
        .split(/\n(?= {2}- type: )/)
        .find((section) => /^ {4}id: personal-data$/m.test(section)) ?? "";
    const required = block.match(/^ *- label: .*\n *required: true$/gm) ?? [];
    expect(
      required.length,
      "bug.yml's `personal-data` group should keep both required confirmations",
    ).toBeGreaterThanOrEqual(2);
  });
```

### 13.4 The coverage ratchet's rationale (`packages/core/vitest.config.ts:18-46`)

```ts
      // COVERAGE RATCHET. `pnpm test:coverage` exits non-zero when any metric
      // falls below these floors. Raise them as coverage improves; never lower
      // one to make a build pass — the drop is the signal, and lowering the
      // floor deletes it.
      //
      // The global floors sit a little under today's numbers so ordinary work
      // has room. The per-file floors do not: they cover the predicates that
      // decide who may see whose personal information, and each sits at what
      // that file achieves right now.
      thresholds: {
        lines: 90,
        statements: 89,
        functions: 92,
        branches: 82,

        // THE PRIVACY AND SAFETY CORE — 100%, deliberately.
        //
        // These decide whether somebody's medical note, phone number or ID
        // number reaches a screen it should not, and whether a stranger's
        // words reach a public issue unredacted. They are pure functions with
        // no I/O, so full coverage is achievable and staying there is cheap. A
        // new uncovered branch here should fail the build and be looked at,
        // which is what a floor at the ceiling is for.
        "src/report-sanitize.ts": {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
```

### 13.5 The `CI pass` gate and its comment (`.github/workflows/ci.yml:310-331`, `:518-558`)

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
```

```yaml
  ci-pass:
    name: CI pass
    if: always()
    needs: [commitlint, ci, e2e, coverage]
    runs-on: ubuntu-latest
    steps:
      - name: Check every job passed
        run: |
          echo "commit conventions : ${{ needs.commitlint.result }}"
          echo "lint/typecheck/... : ${{ needs.ci.result }}"
          echo "e2e (all shards)   : ${{ needs.e2e.result }}"
          echo "coverage floors    : ${{ needs.coverage.result }}"
          echo

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

### 13.6 (bonus) The `docs/sources/` never-edit rule (`docs/sources/README.md:1-10`)

```markdown
# Primary sources — verbatim, never edited

Scraped and extracted ground truth: AfrikaBurn's own published pages, and the
source scope documents this product was specified from. **Cite these rather than
guessing event facts.**

Nothing here is edited to match the product. Where a page says "burner name", or
describes a process we implemented differently, that is the source speaking and
it stays. Correcting a source to agree with the build destroys the only record
of what was actually asked for.
```

---

## 14. Gotchas and cautions for anyone porting from this unit

1. **The donor's own docs disagree with each other on numbers.**
   `docs/architecture.md:33` and `:131` both say "45 tables"; `README.md:143` says 44, and
   `grep -c '= pgTable(' packages/db/src/schema.ts` returns 44. `README.md:144` says
   "**165** e2e tests"; `AGENTS.md:61` says "**172** tests across 70 spec files";
   `e2e/README.md:3` says "**153** tests across 56 spec files". `README.md:143` says
   "**51** shared UI components"; `packages/ui/src/components/*.tsx` counts 49. **Treat
   every donor statistic as approximate** — and note this is precisely the failure the
   metadata/status machinery does *not* catch, because none of it is requirement-tagged.
2. **The header-block convention has a hole.** `docs/simplification-audit.md` (1,408 lines,
   the largest file under `docs/`) carries no header block and is absent from the index
   table. If Camp 404 adopts the convention, close the hole at adoption time with a
   test — the donor did not.
3. **`docs/README.md` claims a hand-maintained roster was deleted for going stale**
   (`:99-103`) while the index table it replaced it with is *also* hand-maintained. The
   argument is about *duplicating a field that already exists in every file*, not about
   hand-maintenance per se.
4. **`AGENTS.md:263-268` includes "No skills, and no new tooling layers, without asking"**
   — a standing maintainer preference (3 Aug 2026): "don't install agent skills or add
   abstraction on top of the workflow that already exists. The commands in this file are
   the interface. Suggest, don't add." Any port of the *tooling* half of this unit should
   be proposed rather than applied.
5. **Comments in the donor lie in eight documented places**
   (`docs/simplification-audit.md:44-51`), including `.env.example` contradicting
   `AGENTS.md` hard rule #1 on migrations. **Do not trust a donor comment without reading
   the code under it** — this applies to the doc excerpts here too, all of which were read
   against source.
6. **`docs/simplification-audit.md`'s evidence is static-only.** `:13-21` states it
   explicitly: "**The e2e suite was not run for this document.**"
7. **Branch protection is not enabled on the donor**, so `CODEOWNERS` "does nothing at all"
   (`AGENTS.md:342-345`) and `CI pass` is not actually required (`SECURITY.md:96-124`
   lists the settings a maintainer still has to apply). The machinery exists; the switch
   is off.
8. **The label sync is a one-off maintenance task, not part of any deploy**
   (`labels-sync.ts:8`), and it needs a token with Issues write. Camp 404 has no
   equivalent script and its `plugin:github` MCP server is currently failing to connect.
9. **`docs/README.md:135-143` documents a glyph collision it deliberately does not fix.**
   If Camp 404 ports the legend, port the "new tables SHOULD avoid reusing these four
   glyphs for plain booleans" rule alongside it, or the collision arrives fresh.
10. **The donor's roadmap R0 correction block** (`docs/roadmap.md:30-33`) is the pattern to
    imitate for Camp 404's known-stale docs: an inline dated correction that keeps the
    original text, rather than a silent rewrite. Camp 404 has at least four docs needing
    exactly this (`README.md:98-101`, `DEFERRED.md:47-50`,
    `docs/configurable-teams-plan.md` header, `docs/first-time-setup.md:88-89`).
11. **`docs/deploy.md:14` names migrations `0000_*` … `0017_*` while the repo has 29** —
    a stale digit inside an otherwise-current runbook. The doc system does not protect
    against this class either.
12. **Bidirectional flow.** The donor's `CI pass` comment says "Same pattern as camp-404
    and ops-board" (`ci.yml:326`), its coverage floors are "Ported from
    RyRy79261/intake-tracker" (`ci.yml:336`), its deletion model cites "the Camp 404 'Lost
    Cat' precedent" (`docs/accounts-security-spec.md:105-106`), its questionnaire tables
    are "ported 1:1 from Camp 404's pattern" (`docs/build-spec.md:115`), and its bio field
    set is "mirrored from Camp 404's burner profile" (`:104`). **Check before importing:
    several of these are re-imports.**
