# Camp 404 — User Journey

> How a person moves through the Camp 404 app: from an invite link in their
> inbox to an active, profiled camp member navigating the control panel —
> plus the planned surfaces (Telegram, MCP, meal planning) the journey grows
> into.

This document maps the **user journey** as it exists in the codebase today
(the invite → auth → onboarding → control-panel spine) and sketches the
journeys still on the roadmap per [`brief.md`](./brief.md),
[`telegram-bot-proposal.md`](./telegram-bot-proposal.md), and
[`mcp-tooling-proposal.md`](./mcp-tooling-proposal.md).

Legend used throughout: **solid** paths are implemented; **dashed** paths
and 🔭-marked sections are planned / proposed.

---

## 1. The whole journey at a glance

The app is **invite-only** and gated in four layers. A person signs in
first; every authenticated request then flows through the same checks
(`hasCampAccess` → a completed burner profile → captain approval) before a
member reaches the home control panel.

```mermaid
flowchart TD
    A([Lost burner has an invite code]) --> B[Landing: 'Error 404 — Camp not found']
    B -->|Are you lost?| D[Auth: sign in / sign up<br/>password or Google]
    D --> E{Has camp access?<br/>god email OR redeemed code}
    E -->|no| F[/signup/required: enter code<br/>dead-end — sign out & retry/]
    F -->|valid code| G
    E -->|yes / god| G{Burner profile complete?}
    G -->|no| H[/onboarding/questionnaire<br/>mandatory, ~2 min/]
    H -->|saved & completed| K
    G -->|yes| K{Captain-approved?<br/>vetting-required invites only}
    K -->|no| P[/pending-approval<br/>held until a captain decides/]
    K -->|yes / god| I([Home control panel])
    I --> J[Tools, Profile, Teams, Tasks]
```

The four gates, in order, are enforced on **every** protected page
(`app/page.tsx` is the canonical chain; `tools/*`, `family-tree`,
`onboarding/*` repeat it):

1. **Authenticated?** — Neon Auth (Better Auth) session cookie. No session
   → landing hero / sign-in.
2. **Has camp access?** — `hasCampAccess()`: either a `GOD_EMAILS` address
   or an invite code redeemed onto the user's row. No access →
   `/signup/required`, where the code is entered (see §2).
3. **Profile complete?** — a `burner_profiles` row with `completedAt` set.
   Incomplete → `/onboarding/questionnaire`.
4. **Captain-approved?** — `isApproved()`. A member who redeemed a
   vetting-required invite is held at `/pending-approval` until a captain
   approves or rejects them; god accounts and non-vetting invites pass
   straight through.

---

## 2. Access & authentication

Neon Auth creates an identity the moment someone signs in — especially via
Google — so the app **cannot** gate sign-up behind an invite code. Instead
the invite check lives *after* auth: a signed-in user with no code on file
is bounced to `/signup/required`, where they enter a code that is **claimed**
atomically and stamped onto their camp row. (There is no longer a pre-auth
`/signup` page or a `camp404_invite` cookie — that earlier design was removed
when the gate moved post-auth.)

```mermaid
flowchart LR
    subgraph Unauthenticated
        L[Landing hero] -->|Are you lost?| SI[/auth/sign-in · sign-up<br/>password or Google/]
    end

    SI -->|session created| EC[ensureCampUser]
    EC --> HC{hasCampAccess?<br/>god email OR code on row}
    HC -->|yes / god| HOME([Gated home])
    HC -->|no| SR[/signup/required<br/>enter invite code/]
    SR -->|submitInviteCode| CI[claimInviteCode<br/>atomic single-use claim<br/>+ assignedRank · requiresApproval]
    CI -->|ok| HOME
    CI -->|invalid / exhausted| SR
```

Key behaviours worth knowing:

- **The invite-code form lives on `/signup/required`, post-auth.** A
  signed-in user with no code can't reach the questionnaire until they enter
  a valid one; the screen's only other exit is to *sign out and start over*
  (today just a link to Neon's hosted sign-out — there's no programmatic
  sign-out control).
- **Claiming is the authoritative race-winner.** If two browsers race for
  the last remaining use of a DB code, `claimInviteCode` lets exactly one
  win (a single atomic `use_count` increment). Env `INVITE_CODES` are
  unlimited bootstrap codes — a pure validity check that never stamps a rank.
- **Captain-tier invites** can stamp an `assignedRank` and a
  `requiresApproval` flag on the code, both applied at claim time; the latter
  routes the redeemer through the captain-approval gate (gate 4 in §1).
- **God accounts** (`GOD_EMAILS`) bypass the invite *and* approval gates.

### Sequence: redeeming an invite end-to-end

```mermaid
sequenceDiagram
    actor U as New member
    participant NA as Neon Auth
    participant SR as /signup/required
    participant SA as submitInviteCode (server action)
    participant DB as Postgres (invites + users)

    U->>NA: open app, sign in / sign up (password / Google)
    NA-->>U: session cookie set
    U->>SR: first gated load with no code → bounced here
    U->>SA: paste code, submit
    SA->>DB: redeemInviteForUser → claimInviteCode (atomic)
    DB-->>SA: claimed (+ assignedRank? + requiresApproval?)
    SA-->>U: code stamped on row → redirect home → onboarding gate
```

---

## 3. Onboarding — the burner profile

Once past the access gate, a member **must** complete the burner-profile
questionnaire before anything else unlocks. It's a multi-page wizard
(`QUESTIONNAIRE`, versioned, e.g. `2026.05.24-v7`) covering: about-you
(DOB, phone), dietary needs (dislikes, allergies), and team interests —
the team-interest sliders later drive which follow-up questionnaires
(kitchen, structures, …) a member is activated for.

A standout: **any free-text / long field can be filled by voice.** The
dictate button records audio and posts it to `/api/voice/transcribe`,
which runs Groq Whisper Large v3 Turbo — built for the German member
submitting from Berlin and the coordinator with dusty hands in the Karoo.

```mermaid
stateDiagram-v2
    [*] --> AboutYou
    AboutYou --> Dietary: next
    Dietary --> TeamInterests: next
    TeamInterests --> Review: next
    Review --> Saved: submit (completedAt set)
    Saved --> [*]

    state AboutYou {
        [*] --> Typing
        Typing --> Dictating: tap mic 🎙️
        Dictating --> Transcribing: stop
        Transcribing --> Typing: text inserted (Groq Whisper)
    }

    note right of Saved
        Profile complete →
        home control panel unlocks.
        Editable later via Tools → My forms.
    end note
```

After completion the member can revisit and edit answers via
**Tools → My forms**, which replays the wizard pre-filled and records a
**change log** (field-by-field `from → to`) on every edit — no old
versions kept, just the running history.

---

## 4. The home control panel & rank-based surfaces

The home page is a **control panel** of four quadrants whose contents
depend on the viewer's `rank`. Members see their own layer plus a
visible-but-locked peek at the Team Lead and Captain layers above them.

```mermaid
flowchart TD
    H([Home control panel<br/>centre: 'TALK']) --> M

    subgraph M["camp_member layer (active)"]
        T1[My Teams → /members]
        T2[My Tasks → /meals]
        T3[My Profile → /onboarding/questionnaire]
        T4[Tools → /tools]
    end

    subgraph TL["team_lead layer 🔒 (peek)"]
        L1[Team Roster]
        L2[Team Tasks]
        L3[Lead Profile]
        L4[Team Tools]
    end

    subgraph CAP["captain layer 🔒 (peek)"]
        C1[Camp Roster]
        C2[Camp Tasks]
        C3[Finances]
        C4[Camp Tools]
    end

    M -.locked unless ranked up.-> TL
    TL -.locked unless ranked up.-> CAP
```

From the **Tools** quadrant a member reaches the uncategorised toolbox:

```mermaid
flowchart LR
    TOOLS([/tools]) --> INV[Invite a member<br/>mint single-use code]
    TOOLS --> FORMS[My forms<br/>review & edit answers]
    TOOLS --> FT[Family tree<br/>who brought who]

    INV -->|share code| NEW([another lost burner →<br/>back to landing / sign-in])
    FORMS --> REPLAY[Replay form + change log]
    FT --> GRAPH[Referral roster graph<br/>roots = pre-invite accounts]
```

The **family tree** visualises referral lineage: roots are accounts that
pre-date the invite system, and every other branch is one invite-code
redemption — so the journey is recursive. Each member who invites someone
becomes a node in the next person's origin story.

---

## 5. 🔭 Journeys on the roadmap

The brief and proposals describe surfaces beyond the current invite→profile
spine. These are **planned**, not yet built.

### 5a. Telegram — "you're in" and "the gates just opened"

When a captain approves a member, the camp bot mints a single-use Telegram
invite link; the member taps it, joins the members-only group, and the bot
links their Telegram identity back to their camp profile. A broadcast
channel carries phase-unlock / dust-day / last-call announcements.

```mermaid
sequenceDiagram
    actor Cap as Captain
    participant App as Camp 404 app
    participant Bot as Telegram bot
    participant TG as Telegram group
    actor Mem as Member

    Cap->>App: mark member approved
    App->>Bot: createChatInviteLink (member_limit 1, expiry)
    Bot-->>App: t.me/+… link
    App-->>Mem: in-app banner + push with link
    Mem->>TG: tap link → join
    TG-->>Bot: chat_member update (which link)
    Bot->>App: correlate join → camp profile
```

### 5b. MCP connector — chat against your camp data

A member adds the camp's MCP endpoint as a custom connector in Claude.ai,
signs in through the same Neon Auth flow, approves a consent screen, and
the model gains read + write tools scoped to that user's in-app
permissions (ID documents gated behind a per-user opt-in).

```mermaid
flowchart LR
    M([Member in Claude.ai]) --> ADD[Add custom connector<br/>/api/mcp/mcp]
    ADD --> OAUTH[Neon Auth sign-in<br/>DCR + PKCE]
    OAUTH --> CONSENT[Approve consent screen]
    CONSENT --> TOOLS[Scoped read+write tools<br/>per in-app permissions]
    TOOLS -.ID docs.-> OPTIN{Per-subject opt-in?}
    OPTIN -->|yes| IDS[passport / SA-ID / EFT]
    OPTIN -->|no| BLOCK[withheld]
```

### 5c. The full operational vision

Per the brief, the journey ultimately spans the camp's whole year — these
hang off the **My Tasks**, **My Teams**, and **Tools** quadrants as they're
built out:

```mermaid
journey
    title A member's year with Camp 404
    section Sign-up (Feb)
      Redeem invite & sign in: 4: Member
      Build burner profile (voice or text): 4: Member
      Pay camp dues: 3: Member
    section Planning (Mar)
      Submit recipes by voice: 4: Member
      Join teams, pick up tasks: 4: Member, Lead
      Get phase-unlock pushes: 5: Member
    section In the dust (Apr)
      Voice updates from low signal: 3: Coordinator
      Photo-and-voice manual generation: 4: Lead
      Dance of 1000 Flames logistics: 5: Member
    section After
      Reimbursement tracking: 3: Member, Captain
```

---

## 6. Where each journey lives in the code

| Journey step | Route / file |
|---|---|
| Landing hero | `apps/web/app/landing-hero.tsx` |
| Invite gate | `apps/web/app/signup/`, `lib/access-control.ts` |
| Invite dead-end | `apps/web/app/signup/required/page.tsx` |
| Auth (sign-in/up) | `apps/web/app/auth/[path]/page.tsx` |
| Access + profile gating | `apps/web/lib/users.ts` (`hasCampAccess`, `getBurnerProfile`) |
| Onboarding wizard | `apps/web/app/onboarding/questionnaire/`, `lib/questionnaire.ts` |
| Voice dictation | `apps/web/components/voice/`, `app/api/voice/transcribe/route.ts` |
| Home control panel | `apps/web/app/page.tsx` |
| Tools | `apps/web/app/tools/` |
| My forms + change log | `apps/web/app/tools/forms/` |
| Family tree | `apps/web/app/family-tree/` |
| 🔭 Telegram | `app/api/telegram/`, `docs/telegram-bot-proposal.md` |
| 🔭 MCP | `app/api/mcp/`, `docs/mcp-tooling-proposal.md` |
</content>
