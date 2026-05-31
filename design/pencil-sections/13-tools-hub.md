### 13. Tools hub
**Purpose:** A flat, link-only landing page at `/tools` that gates camp members through auth/invite/approval, then indexes uncategorised camp utilities as navigation cards.
**Layout & elements:** Single column, centered container. Top: heading "Tools"; subtext "Uncategorised tooling for camp members. We'll move tools into dedicated quadrants as we group them." Below: a vertical list of exactly 3 cards, each with a bordered icon chip, a title, a description, and a trailing `ChevronRight` affordance. Reached from the home control panel's bottom-right "Tools" tile (Wrench icon, hint "Meals, expenses…").
**Every action (preserve all):**
- Tap "Invite a member" card → navigate to `/tools/invite`.
- Tap "My forms" card → navigate to `/tools/forms`.
- Tap "Family tree" card → navigate to `/family-tree`.
- All three cards are always active links; focus ring renders on the card; hover tints card background toward accent. No buttons, forms, inputs, submit, mutations, or voice.
**States to design:**
- Populated: the only data state — always exactly 3 cards.
- Empty / loading / validation-error / submitting / success / disabled: N/A (compile-time card list, no fetch, no form, no controls).
- Invite-gated: no god email AND no invite code → redirect `/signup/required` (page never renders).
- Pending-approval / Rejected: `approvalStatus` not "approved" (and not god) → redirect `/pending-approval`; pending and rejected route identically.
- Unauthenticated: redirect `/auth/sign-in`.
- Onboarding gate intentionally absent here.
**Options & exact values:** 3 cards verbatim — (1) "Invite a member" / "Mint a single-use code to bring someone onto Camp 404." / Mail icon / `/tools/invite`; (2) "My forms" / "Revisit a questionnaire you've already completed, update your answers, and see what changed." / ClipboardList icon / `/tools/forms`; (3) "Family tree" / "See who brought who onto camp." / GitBranch icon / `/family-tree`. ApprovalStatus = "pending" | "approved" | "rejected".
**Validation & rules:**
- Gate order fixed and short-circuiting: auth → camp-user resolve → invite gate → approval gate; each failing gate redirects before render.
- God-account email bypasses both invite and approval gates.
- Disambiguation by ICON + LABEL only; no per-entity colour. All 3 cards must stay present and route to their exact hrefs.
**Do-not-drop:** The auth→invite→approval gate chain plus the 3 verbatim navigation cards to their exact hrefs. Carry-over flags: home tile hint "Meals, expenses…" does not match the actual list; `CardContent`/`CardFooter` are orphaned (unused) on this surface.
