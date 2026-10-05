# Team budgets and reimbursements (#242): discovery

Status: [CORRECTION 2026-09-30] built to the owner's answers below (#242):
one budget per team, claims with receipts, a team lead's yes, then Finance
pays. The proposal is kept as the record of what was weighed. Not built:
Finance recording spend the camp paid directly, and a pre-approval step.

## What the owner asked

On #242 (2026-09-24) the owner wrote that budgets "have never been worked out
properly", so the budget half starts with a short discovery, not a fixed
design. The old notes show what the camp meant to do, but never ran:

- a **base** and an **optimistic** budget; leads spend only against base until
  the optimistic one is confirmed;
- a budget line per team, reported at meetings;
- a lead approves a purchase before it is made, and a big purchase also needs
  a captain.

For claims the owner was clear: a claim needs **at least one invoice or
receipt, image or PDF, several allowed**, stored privately like proof of
payment, captain-read only, every read audited.

## What exists today

- `team_budgets` (`packages/db/src/team-budgets.ts`): one row per team per
  year with `assigned_amount`, `perceived_amount` and notes. Rands only. Read
  and written only through the Claude connector (MCP). No screen.
- `reimbursements` (`packages/db/src/reimbursements.ts`): a claim with team,
  amount, description, encrypted bank details, and the moves
  `submitted → approved | rejected`, `approved → paid → reconciled`, each a
  compare-and-set with an audit row. MCP only. No screen.
  [CORRECTION 2026-10-05] `reconciled` is gone: paid is the end of a claim
  (owner, 2026-10-05; migrations 0101 and 0102).
- Gaps in that table:
  - `amount` is a decimal, not integer cents (AGENTS.md: the ledger keeps
    integer cents);
  - it has **one** `receipt_blob_url`; the owner wants several files;
  - it has no `cycle`, so claims are not tied to a burn year;
  - its comment says "a team's lead approves that team's claims", which
    predates the Finance rule below.

## What to reuse from the dues PR (#299)

PR #299 (not merged yet) already solved the hard parts for proof of payment.
Claims should copy it, not invent a second way:

- **The Finance rule.** `canManageMoney(rank, ledTeams)` in
  `packages/core/src/dues.ts`: a captain or a lead of Finance, fail-closed.
  `moneyActionGate()` (`apps/web/lib/money-gate.ts`) is the action gate, and
  each write re-checks inside its transaction (`lockMoneyKeeper`). Claims
  would use the same rule for "approve for payment", "mark paid" and "read
  the receipt".
- **The upload route** (`apps/web/app/api/uploads/payment-proof/route.ts`):
  PDF/JPG/PNG/WebP, 4 MB, checked by the first bytes, not the browser's type
  (`proofBytesMatch`), a private blob in the member's own folder, rate-limited.
  A claim needs the same, taking several files.
- **The read route** (`apps/web/app/api/payment-proof/[paymentId]/route.ts`):
  streams the file only to its owner and the Finance team, audits every read
  by someone else (`auditReadAfterResponse`), PDFs download, photos open
  sandboxed, `no-store`. A claim's receipt route is the same with a new audit
  action (for example `reimbursement.receipt_viewed`).
- **Erasure** deletes the member's proof folder (`deletePaymentProofBlobs`);
  claims need the same for their receipt folder.

Best done as a small shared helper (file checks, private put, streamed read)
once #299 is on main, so both routes use one copy.

## Proposal

**Budgets**

- Two amounts per team per year: **Base** (what we are sure of) and
  **Hoped for** (the optimistic one). The existing columns can carry them
  (`assigned` = base, `perceived` = hoped for), but both should move to
  integer cents in the same change.
- A per-year switch, **"Hoped-for budget confirmed"**, set by Finance. Until
  it is on, a team's limit is its base.
- **Spent** = paid claims for that team + direct spend lines that Finance
  enters for things the camp paid itself (with a receipt, same upload).
- **When set:** with the fee tiers in "Fees and dates" (#299), because the
  base follows from the fees the camp expects. Finance confirms "hoped for"
  once enough dues have come in. The dues balance already knows what came in.
- Where it shows: a **Budgets** tab in the Finance tools (edit), and a small
  "Budget: R x of R y spent" panel on each team's program page (#295).

**Claims**

- Member form: team, what it was for, amount in rands, date, bank details,
  and **one or more files** (refused with none). A new
  `reimbursement_files` table holds the files, one row each.
- **Two approvals, in plain steps:**
  1. **The team says yes:** a lead of that team, or a captain, confirms it was
     a team purchase. Above a set amount (say R2 000) a captain must also say
     yes.
  2. **Finance pays:** a captain or Finance lead marks it paid, then
     reconciled against the bank statement (the statement import in #299 can
     match it later).
- A member sees their own claims and where each one is.
- Bank details are ALWAYS_PRIVATE: read only by Finance, audited, never shown
  to the team lead who approves, never in an export.
- Buying before approval: not a separate "ask before you buy" object in the
  first version. The claim's first step does the lead's approval; the
  threshold does the captain's. A pre-approval step can come later if leads
  keep overspending.

**Database (when built):** one migration: integer-cents amounts and `cycle` on
`reimbursements`, base/hoped-for in cents on `team_budgets`, new
`reimbursement_files`, `budget_spend_lines` and a per-year confirm flag. The
tables hold no real data today (MCP-only), but the migration must still be
safe on a table with rows.

## Owner's answers (2026-09-30)

1. **Budget shape: one amount per team.** [CORRECTION 2026-09-30] No Base and
   Hoped for, and no per-year "confirmed" switch. Where the proposal above
   says base, hoped for or the switch, read one budget amount.
2. **Who sets budgets:** captains and Finance leads. A team's lead reads it.
3. **Who reads:** every member sees each team's totals (budget, spent, left).
   A claim's detail is for Finance and the claimant.
4. **Receipts and bank details:** Finance leads read them too, audited.
5. **Approval: no amount limit.** [CORRECTION 2026-09-30] The team lead's (or
   a captain's) yes is enough at any amount; then Finance pays. There is no
   second captain approval above a threshold.
