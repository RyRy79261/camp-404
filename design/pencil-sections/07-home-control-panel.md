### 7. Home — role dashboard
**Purpose:** The `/` route is Camp 404's role-based command centre — a single layered 2×2 quadrant panel answering "what do I need to do, who needs what from me?" after the auth/access/onboarding/approval gating spine passes.
**Layout & elements:** Mobile single column, full-bleed (`w-full`, `h-[100dvh]`, no `max-w-lg`). Top→bottom: header bar (left brand title "Camp 404"; right slot = bell link to `/notifications` with unread badge + avatar link to `/profile` showing photo or initials, "?" fallback) → 2×2 quadrant grid with hairline grid-line gaps and an absolutely-centred circular "TALK" button (`Mic` icon) → bottom layer tab bar (nav "Switch rank view") with tabs "Me" / "Team Lead" / "Captain". Below the panel: best-effort "Enable notifications" button. Signed-out: `<LandingHero>` glitch "404" art, "Camp 404", "Error 404 — Camp not found", CTA "Are you lost?" → `/auth/sign-in`, "$ awaiting input_".
**Every action (preserve all):**
- Tap unlocked tile with href → plain `<a>` full-page nav to destination.
- Tap unlocked hrefless tile → inert (no handler passed).
- Tap locked tile → nothing (`aria-disabled`).
- Tap layer tab (locked or not) → switch visible layer (browse-only); replays 200ms entry animation.
- Press/hold TALK → inert on home (no `onPress`/`onRelease` wired).
- Tap bell → `/notifications`; tap avatar → `/profile`.
- Tap "Enable notifications" (push `default` only) → request browser permission, register FCM token (`platform: "web"`).
- Signed-out tap "Are you lost?" → `/auth/sign-in`.
**States to design:**
- Empty: unread `0`/falsy → no badge; no avatar image → initials.
- Loading: server-rendered, no client loading; push has internal "loading" rendering nothing.
- Populated: header + viewer's unlocked layer + locked higher layers + TALK + tabs.
- Validation-error / submitting / success: N/A (no forms); push grant silently registers token, button vanishes.
- Disabled/locked: higher-rank layers visible but locked — tiles `opacity-45` + `Lock` glyph, tabs "(locked, view only)" + `Lock`.
- Invite-gated → redirect `/signup/required`; onboarding-incomplete → `/onboarding/questionnaire`; pending OR rejected → `/pending-approval`; signed-out → inline `<LandingHero>`.
**Options & exact values:** Ranks `camp_member`/`team_lead`/`captain`; labels "Camp Member"/"Team Lead"/"Captain"; tab labels "Me"/"Team Lead"/"Captain"; corners tl/tr/bl/br. Unread cap "99+". camp_member tiles: My Teams "Your crews" →`/members`; My Tasks "What's on you" →`/meals`; My Profile "You & your data" →`/onboarding/questionnaire`; Tools "Meals, expenses…" →`/tools`. team_lead: Team Roster "Members in your team"; Team Tasks "Assign & track work"; Lead Profile "Your team setup"; Team Tools "Shifts, notices…" (no hrefs). captain: Camp Management "Roster & statuses" →`/captains/camp-management`; Camp Tasks "Camp-wide work board"; Finances "Dues & reimbursements"; Camp Tools "Announcements, ops…" →`/captains/tools`. Push states loading/unavailable/default/granted/denied. Defaults: title "Camp 404", initialLayer 0, viewerRank camp_member.
**Validation & rules:**
- Gate order load-bearing: auth → invite → required-actions → legacy-profile → approval.
- Layer interactive iff `rankLevel(viewerRank) >= rankLevel(layer.rank)`; higher layers browsable but locked.
- God accounts bypass invite + approval gates; rejected and pending both route to `/pending-approval`.
- Badge shows unless null/""/0 (unused on home).
**Do-not-drop:** The rank-layered 2×2 quadrant nav with browse-but-locked higher layers, plus the gating spine that bounces unqualified users. DEAD/ORPHAN flags: TALK button inert (no voice wiring); team_lead tiles + captain Camp Tasks/Finances hrefless no-ops; camp_member My Teams (`/members`) & My Tasks (`/meals`) are dead links (404); `ControlPanelHeader` orphan unused on this path.
