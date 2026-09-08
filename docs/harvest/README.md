# Cross-repo harvest — Camp 404 × AfrikaBurn contributors app

Generated 2026-09-08 by a 105-agent cross-repo analysis of
[`RyRy79261/afrikaburn-contributors-app`](https://github.com/RyRy79261/afrikaburn-contributors-app)
(the "quagga-portal" donor: 3 apps, 8 packages, 835 TS/TSX files) against this repo.

**Purpose:** find every reusable feature, tool and pattern in the sibling codebase, decide
what Camp 404 should take, and merge the result with Camp 404's own open roadmap so there is
one answer to *"what is left to make Camp 404 feature-complete?"*

The donor's bespoke auth provider was deliberately out of scope. Auth-adjacent **surfaces**
(2FA/passkey/session UI, re-auth gating, security-event feed, account deletion) were mapped,
because those are provider-agnostic.

## Read in this order

| File | What it is |
|---|---|
| [`00-harvest-and-roadmap.md`](00-harvest-and-roadmap.md) | **Start here.** TL;DR, the five things to do first, what's missing, what to skip, and the merged remaining roadmap. |
| [`01-build-plan.md`](01-build-plan.md) | Waves 0–8, the quick-win checklist, the critical path, and what can be fanned out in parallel. |
| [`02-crosscut-dedup-and-dependencies.md`](02-crosscut-dedup-and-dependencies.md) | 892 assessed assets deduplicated to ~83 real pieces of work, plus the dependency graph. |
| [`03-risks-and-portability.md`](03-risks-and-portability.md) | Per-package portability, migration hazards, auth-model mismatches, and the effort estimates that are wrong. |
| [`04-completeness-critique.md`](04-completeness-critique.md) | What this analysis missed — orphan sweep, the schema diff nobody ran, and which sections to trust less. |

## Reference material

- `units/NN-*.md` — 24 condensed per-subsystem decision briefs (questionnaires, notifications,
  audit, roles, audience, bulletins, bug reporting, accounts, privacy, DB, UI, forms,
  registration, analytics, ops, e2e, CI, docs, directory, uploads, sweeper).
- `ledger/00-baselines.md` — the verified baselines: what Camp 404 has shipped, what is still
  open (including the WP1–WP12 GitHub issues), what the donor says about itself, and the
  mechanical stack delta.
- `ledger/01-ledger-all-892.md` · `02-ledger-actionable-478.md` · `03-ledger-high-value-234.md`
  — the raw port ledger at three levels of filtering.
- `raw/NN-*.md` — the 24 full source-grounded donor subsystem maps (2.1 MB) behind everything above.

## How much to trust it

Each finding was produced by a harvest agent, gap-checked by a second agent, then attacked by
a third whose instructions were to refute it. **765 of 892 claims were upheld, 88 were refuted
(corrections are applied inline), 39 were not individually covered.** Rows marked
`not individually verified` are lower confidence.

`04-completeness-critique.md` names the weak units — read those sections with more suspicion.
