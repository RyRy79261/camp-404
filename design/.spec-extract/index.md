# Board extraction index

Source: `design/app.pen` (pen v2.13) — 50 top-level boards.
Reusable components: TopChrome, SectionHeader, DetailHeader, GridTile, Button-Primary, Button-Outline, InputField, Card, EmptyState, CaptainLock

| # | Name | Kind | Size | Reusable components used |
|---|---|---|---|---|
| 00 | TopChrome | component | 430×- | — |
| 01 | SectionHeader | component | 398×- | — |
| 02 | DetailHeader | component | 430×- | — |
| 03 | GridTile | component | 200×- | — |
| 04 | Button-Primary | component | -×- | — |
| 05 | Button-Outline | component | -×- | — |
| 06 | InputField | component | 360×- | — |
| 07 | Card | component | 360×- | — |
| 08 | EmptyState | component | 360×- | — |
| 09 | CaptainLock | component | 360×- | — |
| 10 | S01 Landing | board | 430×980 | Button-Primary |
| 11 | S02 Auth | board | 430×- | InputField, Button-Primary, Button-Outline |
| 12 | S03 Invite gate | board | 430×- | InputField, Button-Primary |
| 13 | S04 Onboarding wizard | board | 620×- | InputField, Button-Outline, Button-Primary |
| 14 | S05 Field kinds | board | 430×1696 | InputField |
| 15 | S06 Approval gate | board | 430×- | Button-Outline |
| 16 | S07 Home dashboard | board | 430×- | TopChrome, SectionHeader, GridTile, Button-Outline |
| 17 | S08 Control panel | board | 430×- | TopChrome, GridTile, Button-Outline |
| 18 | S09 Profile view | board | 430×- | — |
| 19 | S10 Profile edit | board | 430×- | Card |
| 20 | S11 Avatar upload | board | 430×- | Button-Outline |
| 21 | S12 Notifications | board | 430×- | DetailHeader |
| 22 | S13 Tools hub | board | 430×560 | DetailHeader |
| 23 | S14 Invite tool | board | 430×1400 | Button-Primary, Button-Outline |
| 24 | S15 My forms | board | 430×1300 | EmptyState |
| 25 | S16 Family tree | board | 720×1000 | Button-Outline |
| 26 | S17 Captain mgmt | board | 1040×- | Button-Primary, Button-Outline, CaptainLock |
| 27 | S18 Announcements | board | 430×- | — |
| 28 | S19 Captain tools | board | 430×690 | CaptainLock |
| 29 | S20 MCP connect | board | 430×675 | Button-Outline, Button-Primary |
| 30 | S21 Voice dictation | board | 430×- | — |
| 31 | S22 Global overlays | board | 430×- | — |
| 32 | S23 Enable push | board | 430×- | Button-Outline |
| 33 | S24 Primitive kit | board | 430×- | Button-Primary, Button-Outline, InputField, Card, EmptyState |
| 34 | S25 Questionnaire gate | board | 430×932 | — |
| 35 | S26 Questionnaire runner | board | 430×- | Button-Outline, Button-Primary |
| 36 | S27 Questionnaire complete & queue | board | 430×- | Button-Primary, Card |
| 37 | S17 Roster — Iteration B (terminal console) | board | 1040×- | Button-Primary, Button-Outline |
| 38 | S17 Roster — Iteration B (mobile) | board | 430×- | Button-Primary, Button-Outline, CaptainLock |
| 39 | OB Step 01 Profile photo | board | 600×800 | Button-Outline, Button-Primary |
| 40 | OB Step 02 About you | board | 600×- | InputField, Button-Outline, Button-Primary |
| 41 | OB Step 03 A bit about you | board | 600×800 | Button-Outline, Button-Primary |
| 42 | OB Step 04 Burn ideas | board | 600×800 | Button-Outline, Button-Primary |
| 43 | OB Step 05 Team interests intro | board | 600×800 | Button-Outline, Button-Primary |
| 44 | OB Step 06 Team interests | board | 600×- | Button-Outline, Button-Primary |
| 45 | OB Step 07 Cooking competency | board | 600×- | Button-Outline, Button-Primary |
| 46 | OB Step 08 Leadership & logistics | board | 600×- | Button-Outline, Button-Primary |
| 47 | OB Step 09 Burn history | board | 600×- | Button-Outline, Button-Primary |
| 48 | OB Step 10 Burn intent | board | 600×820 | Button-Outline, Button-Primary |
| 49 | OB Step 11 Dietary | board | 600×- | Button-Outline, Button-Primary |

## Reusable-component usage (where each is instantiated)

- **TopChrome** — used by 2 board(s): S07 Home dashboard; S08 Control panel
- **SectionHeader** — used by 1 board(s): S07 Home dashboard
- **DetailHeader** — used by 2 board(s): S12 Notifications; S13 Tools hub
- **GridTile** — used by 2 board(s): S07 Home dashboard; S08 Control panel
- **Button-Primary** — used by 23 board(s): S01 Landing; S02 Auth; S03 Invite gate; S04 Onboarding wizard; S14 Invite tool; S17 Captain mgmt; S20 MCP connect; S24 Primitive kit; S26 Questionnaire runner; S27 Questionnaire complete & queue; S17 Roster — Iteration B (terminal console); S17 Roster — Iteration B (mobile); OB Step 01 Profile photo; OB Step 02 About you; OB Step 03 A bit about you; OB Step 04 Burn ideas; OB Step 05 Team interests intro; OB Step 06 Team interests; OB Step 07 Cooking competency; OB Step 08 Leadership & logistics; OB Step 09 Burn history; OB Step 10 Burn intent; OB Step 11 Dietary
- **Button-Outline** — used by 26 board(s): S02 Auth; S04 Onboarding wizard; S06 Approval gate; S07 Home dashboard; S08 Control panel; S11 Avatar upload; S14 Invite tool; S16 Family tree; S17 Captain mgmt; S20 MCP connect; S23 Enable push; S24 Primitive kit; S26 Questionnaire runner; S17 Roster — Iteration B (terminal console); S17 Roster — Iteration B (mobile); OB Step 01 Profile photo; OB Step 02 About you; OB Step 03 A bit about you; OB Step 04 Burn ideas; OB Step 05 Team interests intro; OB Step 06 Team interests; OB Step 07 Cooking competency; OB Step 08 Leadership & logistics; OB Step 09 Burn history; OB Step 10 Burn intent; OB Step 11 Dietary
- **InputField** — used by 6 board(s): S02 Auth; S03 Invite gate; S04 Onboarding wizard; S05 Field kinds; S24 Primitive kit; OB Step 02 About you
- **Card** — used by 3 board(s): S10 Profile edit; S24 Primitive kit; S27 Questionnaire complete & queue
- **EmptyState** — used by 2 board(s): S15 My forms; S24 Primitive kit
- **CaptainLock** — used by 3 board(s): S17 Captain mgmt; S19 Captain tools; S17 Roster — Iteration B (mobile)
