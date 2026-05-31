### 8. Control Panel / quadrant nav component
**Purpose:** Camp 404's home command-centre nav: a 2×2 grid of action tiles ("quadrants") shown one rank layer at a time, with a circular push-to-talk centre and a bottom tab bar switching between camp member → team lead → captain layers.
**Layout & elements:** Mobile single column, full-viewport: header bar (top) with brand title "Camp 404" left + header slot right (notifications bell with unread badge → `/notifications`, avatar link → `/profile`); the 2×2 quadrant grid (flex-1) with hairline gaps; a circular centre button labelled "TALK" (Mic icon) overlaid on the grid centre; bottom tab bar (aria-label "Switch rank view") with one tab per layer using short labels "Me" / "Team Lead" / "Captain".
**Every action (preserve all):**
- Tap a tab → switches visible layer (allowed even for locked layers; browse-only); fires onLayerChange.
- Tap an unlocked tile → navigates via its href and/or fires onQuadrantSelect. Locked tiles are inert (aria-disabled, no handler/href).
- Press-and-hold centre → onPress on pointer-down; onRelease on pointer-up, pointer-leave, AND pointer-cancel (no stuck recording). Live home supplies label only, no handlers yet.
- Tap bell → notifications; tap avatar → own profile.
**States to design:**
- Populated: layer resolves; tiles show icon/label/optional hint/optional badge.
- Empty: no layer at index → renders nothing (no placeholder).
- Disabled / Captain-only-locked (headline): layer above viewer rank is visible-but-locked — tab shows Lock icon + "(locked, view only)"; tiles dimmed (opacity-45) with Lock glyph, non-interactive.
- Active-tab: bold/primary with underline pill. Layer-switch: 200ms fade+scale entrance.
- Press feedback: centre scales on press; tiles/tabs hover shift.
- Notification badge hidden when zero; shows count or "99+" above 99. Avatar shows photo or initials.
- No submitting/success/validation-error (pure nav; gating handled upstream by redirects before render).
**Options & exact values:** Ranks (low→high): "camp_member"|"team_lead"|"captain". Long labels "Camp Member"/"Team Lead"/"Captain"; tab labels "Me"/"Team Lead"/"Captain". Corners tl/tr/bl/br. Centre default label "TALK". Defaults: viewerRank "camp_member", initialLayer 0, title "Camp 404". Badge cap "99+". Live homeLayers (label/hint→href):
- camp_member: My Teams/"Your crews"→/members; My Tasks/"What's on you"→/meals; My Profile/"You & your data"→/onboarding/questionnaire; Tools/"Meals, expenses…"→/tools.
- team_lead: Team Roster/"Members in your team"; Team Tasks/"Assign & track work"; Lead Profile/"Your team setup"; Team Tools/"Shifts, notices…" (no hrefs → inert).
- captain: Camp Management/"Roster & statuses"→/captains/camp-management; Camp Tasks/"Camp-wide work board"; Finances/"Dues & reimbursements"; Camp Tools/"Announcements, ops…"→/captains/tools.
**Validation & rules:**
- initialLayer clamped to [0, max(layers.length-1, 0)].
- Lock rule: tile interactive iff viewer rank >= layer rank; locked branch wins even if href present (non-navigable). Browsing locked layers always allowed; only tiles inert.
- Quadrant badge suppressed for null/undefined/""/0.
- Centre release bound to pointer-up+leave+cancel.
- Rank model decoupled from 2-rank DB enum; team_lead derived at call site, never stored.
- Accessibility: aria-pressed tabs, aria-disabled locked tiles, explicit aria-labels, aria-hidden decorative icons.
**Do-not-drop:** Rank-layered visible-but-locked gating (browse locked layers, inert locked tiles) plus the press-and-hold PTT centre and its pointer-up/leave/cancel release contract so the voice pipeline can attach later. Note: desktop ControlGrid and the v0 QuadrantNav are dead/orphaned (Storybook-only, not on any route).
