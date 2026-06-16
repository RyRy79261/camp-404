# P7 redesign — build-coverage audit

> The **build-phase** companion to [`coverage-check.md`](./coverage-check.md)
> (which checks the design-PLAN coverage). This checks whether every surface is
> actually **implemented** in code, recomposed onto `@camp404/ui`, and matching
> its Pencil board. Produced by a multi-agent audit (per-surface spec-vs-code),
> 2026-06-16. **Verdict: NEAR-COMPLETE.**

## Summary

19 of 25 surfaces are **built-to-spec** and genuinely recomposed onto the leaf
library. No live data leaks found. The one coherent gap is the
**blocking-questionnaire cluster** (23/24/25): the redirect gating spine forces
required questionnaires functionally, but none of the spec'd blocking *chrome* is
built. Surface 27 is unbuilt but spec-flagged "(proposed) / confirm-first".

## Built to spec (19)

01-landing · 02-auth · 03-invite-gate · 05-approval-gate · 06-home ·
07-profile-view · 08-profile-edit · 09-notifications · 11-invite-tool ·
12-my-forms · 13-family-tree · 14-roster · 15-announcements · 16-captain-tools ·
17-mcp-connect · 20-field-renderer · 21-voice · 22-avatar-upload · 26-enable-push

## Gaps

| Surface | Status | Gap | Disposition |
|---|---|---|---|
| 10-tools-hub | partial (P1·S) | Invite-card copy still "Mint a single-use code…" (named-invite copy was the deliverable); NavCard icon chip was a 40px `rounded-md bg-muted/40` span, not the spec'd 46px `IconBadge` | **Fixed** (this PR) |
| ui leaves | cleanup (P2·S) | `control-panel` / `control-grid` / `quadrant-nav` on the DELETE list still present, no live importers | **Fixed** (this PR) |
| 04 / 20 | partial (P2·M) | `single_select` renders as a `<Select>` dropdown, not the board's `RadioCardGroup` (Divergence #4 "boards win"; the `OptionCardGroup` leaf exists but is only wired for `scale`). Affects 4 questions. `multi_select` (dietary) renders as checkbox rows — documented a11y-justified skip. | Planned next |
| 23-questionnaire-gate | missing (P1·L) | No gate interstitial chrome ("Before you go any further", summary card, "Start questionnaire" CTA) | Planned |
| 24-questionnaire-runner | missing (P1·L) | No `BlockingTopBar` / `RequiredChip` / `BlockingNotice` runner shell | Planned |
| 25-global-overlays | missing (P1·L) | No app-wide `QuestionnaireBlock` overlay; no `GET /api/required-actions/pending`; the `QCard` leaf ships orphaned | Planned |
| 25 toast | polish (P2·S) | Toast has no "Saved · Undo" action slot | Deferred (no consumer yet) |
| 27-questionnaire-complete | unbuilt | Whole surface unbuilt; only an orphan `QuestionnaireQueueItem` type exists. Spec marks it "(proposed)" | Needs product confirm |

## Notes

- 06-home: spec D3 wanted locked higher-rank tile data withheld server-side; the
  full tile catalogue ships to the client. **Inert today** (tiles carry no live
  counts/data), would become real if badges go live.
- Surfaces 20/21/22/25/26 have no own route (embedded/cross-cutting); judged by
  whether the component exists + is built to its board.
