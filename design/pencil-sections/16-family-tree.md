### 16. Family tree referral graph
**Purpose:** A read-only, whole-camp visualisation of the referral graph — "who brought who onto Camp 404" — as a collapsible parent→child tree where each node's parent issued the invite code that node redeemed.
**Layout & elements:** Single column on a wider canvas (page width `max-w-3xl`, not the global mobile shell). Top→bottom: back link — ghost button "Tools" with a left-chevron (`href="/tools"`); `<h1>` "Family tree"; muted subtitle "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption."; search input with left magnifying-glass icon, placeholder "Search by name or invite code…"; control row "Expand all" and "Collapse" (outline/sm); then the recursive tree of branch rows. Each row: a toggle (chevron-down open / chevron-right closed, or a small dot for leaves), then a node card with a generic user-icon avatar, display name ("(no name)" if null, truncated), an amber "Captain" pill (captains only), a primary "You" pill (viewer only), a muted "via `<code>`" line (monospaced, if invite code present), and a muted descendant-count pill (parents only). Rows indent 20px per depth with CSS guide lines.
**Every action (preserve all):**
- Tap "Tools" → navigate to `/tools`.
- Type in search → case-insensitive substring filter over `displayName` + `inviteCode`; shows only root subtrees containing a match, promotes/keeps ancestors visible, force-expands matched paths, applies match highlight.
- Clear search → restores full tree and the user's manual expansion state.
- Tap a node's chevron → expand/collapse that node's children; disabled (dot shown) when the node has no children.
- "Expand all" → expand every node.
- "Collapse" → collapse all to roots only (children hidden, roots still shown).
- No mutating actions: no invite/edit/delete, no node drill-in, no profile link.
**States to design:**
- Loading: server-rendered, no skeleton/spinner; list appears once query resolves.
- Empty (no accounts): card "No accounts yet."
- Empty (no matches): card "No matches." (non-empty query, zero results).
- Populated: recursive branch rows; roots expanded one level by default.
- Viewer-highlight: viewer's node gets a primary ring + "You" pill.
- Match-highlight: matched nodes get an amber border while a query is active.
- Disabled: leaf toggle buttons disabled (reduced opacity, dot marker).
- Invite-gated (no invite code, non-god): redirected to `/signup/required` before render.
- Pending: `approval_status = 'pending'` (non-god) redirected to `/pending-approval`.
- Rejected: `approval_status = 'rejected'` (non-god) also redirected to `/pending-approval`; no distinct screen.
- Not rank-locked: any approved invite-holding member (captain or member) sees the full tree.
**Options & exact values:** `rank`: "captain" | "member" (only "captain" shows a badge). `approval_status`: "pending" | "approved" | "rejected" (only "approved" or god reaches the page). Indentation step: 20px per depth. Default expansion: roots only, one level. Search haystack: `displayName` + " " + `inviteCode`, lowercased, substring match. Roster ordering: `displayName` ascending. Page width: `max-w-3xl`. No pagination — whole roster loaded at once.
**Validation & rules:**
- Access order: authenticated → has camp access (god email OR non-null invite code) → approved (god OR `approval_status='approved'`); failing any gate redirects out, page never partially renders.
- God accounts bypass invite + approval gates; typically appear as roots (NULL invite code → NULL inviter).
- Roots vs branches derived purely from inviter == null: no invite code, code with NULL `created_by_user_id`, or a code matching no row all become roots; an inviter not in the roster also yields a root (orphan-as-root, no error).
- Missing display name → "(no name)", still searchable by invite code.
- Descendant count = ALL generations below, not just direct children.
- Empty query → no highlights, no forced expansion, full tree.
- No write path → no validation errors, optimistic UI, or conflict handling. `force-dynamic` re-queries each visit.
- No explicit cycle guard — a data cycle in the inviter chain would loop infinitely (presumed domain-impossible).
**Do-not-drop:** The collapsible parent→child referral tree with name/invite-code search (ancestor promotion + auto-expand), expand/collapse-all, per-node total-descendant counts, and viewer/match/captain highlighting; read-only, no rank gate. Dead/orphaned flags to carry: server helpers `getInvitesIssuedBy` and `getRootCodes` are exported but have no callers (dead/future code); `profileImageUrl` exists on users but is not selected, so real avatars cannot render.
