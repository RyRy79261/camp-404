### 17. Captain camp management (roster + member detail)
**Purpose:** Captain-only command surface listing every real camp member with rank/status/facets, searchable and filterable, with a per-member detail modal to approve or reject pending applicants.
**Layout & elements:** Back button "Captains" (ChevronLeft) → H1 "Camp management" → paragraph "Everyone who has signed up, their rank and status, whether they've completed their required questionnaires, registered as a driver, and whether they're in South Africa." Wide table (max-w-5xl). Filter toggle "All ({count})" / "Awaiting approval" (+count badge), search Input (Search icon, placeholder "Search name, team, country…", aria-label "Search the roster"). 7-col table: Member (name + humanized teams), Rank (pill), Status (pill), Questionnaires (ShieldCheck), Driver (Car), In SA (Flag), Country (MapPin). Modal: title=name, description=approvalSummary/"Loading…", tabs "overview"/"profile", overview avatar (80×80) + DetailList, profile uppercase section titles, "ACTIONS" footer with Approve/Reject/Ping.
**Every action (preserve all):**
- Switch filter tab "All"⇄"Awaiting approval" → client filter.
- Search → filters by name/rank/country/team (case-insensitive).
- Click row → open modal, fetch detail (stale-fetch discarded).
- Switch modal tab Overview⇄Profile.
- "Approve" → decideApprovalAction(id,"approved"); optimistic + router.refresh.
- "Reject" → decideApprovalAction(id,"rejected"). Both shown only while approvalStatus="pending"; disabled while isPending (Approve shows Loader2).
- "Ping" → permanently disabled, title "Coming soon — nudge this member to check the app".
- Close modal → clears selection.
- Non-captain: no interactions.
**States to design:**
- Empty: "No members have signed up yet." / "No members match your search." / "Nobody is awaiting approval." / "No questionnaire answers on record yet." / "Nothing recorded."
- Loading: modal Loader2 spinner, "Loading…".
- Populated: rows + overview/profile sections.
- Validation/action-error: footer role="alert" destructive ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in."); detail error ("Member not found.").
- Submitting: Approve/Reject disabled, Approve spins.
- Success: decision → buttons disappear, table refreshed.
- Disabled: Ping always.
- Locked (non-captain): blurred aria-hidden table, 6×7 placeholder rows, overlay card Lock icon "Captain access only" / "Camp management data is visible to captains. Your rank doesn't have clearance for this view." Filter/search/modal suppressed; rows=[].
- Pending/rejected: subjects of approve/reject; unapproved captain bounced to /pending-approval.
**Options & exact values:** Status: ready→"Ready", onboarding→"Onboarding", awaiting_approval→"Awaiting approval", rejected→"Rejected", pending→"Action needed". Ranks: "Captain"/"Team Lead"/"Member" (modal: Captain/Member only). Filter: "all"/"awaiting". Tabs: overview/profile. Stored ranks ["captain","member"]; approvalStatus ["pending","approved","rejected"]; teams: kitchen, structures, power_and_lighting, sanitation_and_water, health_and_safety, art_and_activities, ministry_of_memes, ministry_of_vibes; membershipTier ["full","build_week_only"]; decision "approved"/"rejected". ID types "passport"/"sa_id". Country "ZA"→inSouthAfrica (ISO alpha-2). Date Intl "en-ZA" medium. YesNo sr-only: "Required questionnaires complete"/"Registered as a driver"/"In South Africa". Overview order: Country, Joined, Onboarding (Complete/Incomplete), Invite code (or "— (founder / god account)"), Invited by, Invite note.
**Validation & rules:**
- Status precedence: !onboardingComplete→onboarding; pending→awaiting_approval; rejected→rejected; pendingRequiredActions=0→ready; else→pending.
- Self-decision blocked; only "approved"/"rejected" accepted; decision stamps decider+timestamp.
- Approve unblocks app next load; reject is terminal.
- Captain gate enforced server-side (rows=[] for non-captains; every action re-checks).
- System & sanitised accounts excluded.
- Government ID decrypted only behind captain gate (AES-256-GCM), merged as short_text profile row; profile.image→avatar not row; empty/intro sections dropped.
- Display name fallback "Unnamed burner".
**Do-not-drop:** Server-enforced captain-only clearance (data never sent to non-captains) and the approve/reject decision flow with self-decision guard. Orphaned: "Ping" (disabled "Coming soon"); dead-but-fetched duesPaid/membershipTier/onboardingVersion/driverProfileComplete; unused isTeamLead; modal rankLabel omits "Team Lead".
