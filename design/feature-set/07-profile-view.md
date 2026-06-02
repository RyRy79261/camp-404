# 07 — Profile view

**Files covered:**
- `apps/web/app/profile/page.tsx` — the read-only profile card route (Server Component, `force-dynamic`); the surface this brief covers in full.
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect()` + `AuthenticatedUser` shape (Neon Auth session or E2E test cookie); supplies `id`, `primaryEmail`, `displayName`.
- `apps/web/lib/users.ts` — `ensureCampUser`, `getBurnerProfile`, `hasCampAccess`, `isApproved`, the `CampUser`/`BurnerProfileSummary` shapes and the real/test backends behind them.
- `apps/web/lib/access-control.ts` — `isGodEmail()` (god-account bypass for both gates).
- `apps/web/lib/initials.ts` — `initialsFrom()` avatar-fallback derivation.
- `packages/ui/src/components/avatar.tsx` — `Avatar`/`AvatarImage`/`AvatarFallback` primitives the card renders.
- `packages/ui/src/components/card.tsx` — `Card`/`CardContent` wrapper.
- `packages/ui/src/components/button.tsx` — `Button` (`asChild`) used for the "Edit profile" link.
- `apps/web/app/api/avatar/route.ts` — same-origin private-blob proxy that actually serves the photo bytes referenced by `campUser.profileImageUrl`.
- `packages/db/src/schema.ts` — `users` + `burner_profiles` tables (field-level source of truth).
- `packages/db/src/burner-profile.ts` — `getBurnerProfileByUserId()` query feeding `getBurnerProfile`.

**Purpose:** A read-only "this is me" card for the signed-in camp member: large circular avatar (uploaded photo or initials fallback), display name, a rank badge (Captain / Member), and the account email. It is the terminal, fully-onboarded view — reaching it proves the viewer has cleared every gate (authenticated → invite-redeemed → burner profile completed → captain-approved). It offers three navigations only: edit profile (unit 08), review questionnaire answers, and sign out. It performs NO writes; editing, avatar upload, and questionnaire replay all live on other surfaces.

## Features

### Profile route (`apps/web/app/profile/page.tsx`)
- **Server Component, always dynamic.** `export const dynamic = "force-dynamic"` (`page.tsx:21`) — the Neon Auth session is read on every request; never statically cached.
- **Full gate spine re-run on every load** before any UI renders (`page.tsx:24-36`). In order:
  1. `getAuthenticatedUserOrRedirect()` → `redirect("/auth/sign-in")` if no session (`auth.ts:40-44`).
  2. `ensureCampUser(authUser)` resolves/synthesises the camp row (`users.ts:60-95`).
  3. `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — invite gate (`page.tsx:26-28`).
  4. `getBurnerProfile(campUser.id)` then `if (!profile?.completedAt) redirect("/onboarding/questionnaire")` — onboarding gate (`page.tsx:29-33`).
  5. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")` — captain-approval gate (`page.tsx:34-36`).
- **Display-name resolution** (`page.tsx:38`): `campUser.displayName ?? authUser.primaryEmail ?? "Burner"` — falls back to email, then the literal string `"Burner"`.
- **Avatar initials** (`page.tsx:39`): `initialsFrom(campUser.displayName ?? authUser.primaryEmail)` — passes name-or-email (NOT the `"Burner"` literal) to the helper.
- **Rank label** (`page.tsx:40`): `campUser.rank === "captain" ? "Captain" : "Member"`. Note: this is a LOCAL ternary, NOT the shared `rankLabel()` helper in `lib/camp-roster.ts`; this surface has no "Team Lead" derivation — a team lead shows as **"Member"** here.
- **Avatar render** (`page.tsx:46-51`): `Avatar` sized `h-32 w-32 text-3xl`; renders `<AvatarImage src={campUser.profileImageUrl} alt={name}>` ONLY when `campUser.profileImageUrl` is truthy, with `<AvatarFallback>{initials}</AvatarFallback>` always present underneath.
- **Identity block** (`page.tsx:53-63`): `<h1>` name; a pill badge with the rank label; and the email line rendered ONLY when `authUser.primaryEmail` is truthy.
- **Edit profile button** (`page.tsx:65-70`): `Button asChild` wrapping `<Link href="/profile/edit">` with a `Pencil` icon (`h-4 w-4`, `aria-hidden`) + text "Edit profile". → unit 08.
- **Questionnaire review link** (`page.tsx:74-83`): helper sentence "Want to update your burner questionnaire answers? Review them here." → `<Link href="/onboarding/questionnaire">`.
- **Sign-out link** (`page.tsx:84-91`): a plain `<a href="/auth/sign-out">` (full navigation, NOT a client `Link`) labelled "Sign out". This is the universal gate-exit on this surface.

### Avatar bytes proxy (`apps/web/app/api/avatar/route.ts`)
The profile photo `src` is a same-origin URL of the form `/api/avatar?pathname=…` (persisted by the uploader; see schema comment `schema.ts:224-229`). This route, not the profile page, fetches the private Vercel Blob and streams it. Load-bearing for whether the photo appears:
- `runtime = "nodejs"` (`route.ts:7`).
- 401 if not signed in (`route.ts:25-28`); 401 if no camp row or `!isApproved(campUser, user.primaryEmail)` (`route.ts:31-34`) — so a pending/rejected viewer's `<img>` simply fails to load.
- 400 if `pathname` query param missing (`route.ts:36-39`); 404 if `pathname` does not start with `"avatars/"` (`route.ts:40-43`).
- 404 when `isE2ETestMode()` or no `BLOB_READ_WRITE_TOKEN` (`route.ts:45-49`) — in E2E/local there are no avatar bytes, so the fallback initials always show.
- On success streams the blob with `Content-Type` from the blob, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff` (`route.ts:58-67`); any error or non-200/`null` result → 404 (`route.ts:55-71`).

## User actions & interactions
- **Tap "Edit profile"** → navigate to `/profile/edit` (unit 08).
- **Tap "Review them here"** → navigate to `/onboarding/questionnaire` (questionnaire replay).
- **Tap "Sign out"** → hard navigation to `/auth/sign-out`.
- No other interactivity. There are NO form fields, NO buttons that mutate state, NO async client actions, NO optimistic UI. The page is purely declarative output of server-resolved data.

## States & presentations
Applicable global-states rows for this surface:

- **Empty** — Not a list/collection surface, so no zero-rows empty state. The closest analogues are nullable single fields: no uploaded photo → initials (or `"?"`) fallback avatar; no `displayName` → email (or `"Burner"`) as the heading; no `primaryEmail` → the email line is omitted entirely (`page.tsx:58-62`).
- **Loading** — Server-rendered; no client loading spinner on the page itself. The avatar image has a built-in loading window: Radix `AvatarImage` shows the `AvatarFallback` (initials) until the proxied photo finishes loading (`avatar.tsx:7-11`).
- **Populated** — The normal state: avatar (photo or initials), name, rank badge, email, and the three navigations.
- **Validation-error** — N/A. No inputs on this surface; validation lives in unit 08.
- **Submitting/pending** — N/A. No mutations originate here.
- **Success** — N/A. No mutation, so no success toast/confirmation.
- **Disabled** — N/A. No disabled controls; the underlying `Button` does carry `disabled:pointer-events-none disabled:opacity-50` (`button.tsx:8`) but this surface never disables it.
- **Invite-gated** — `!hasCampAccess` → `redirect("/signup/required")` (`page.tsx:26-28`). `hasCampAccess` is true for a god email or any non-null `inviteCode` (`users.ts:219-224`). The page itself never renders an invite-gated state — it bounces.
- **Onboarding-incomplete** — `!profile?.completedAt` → `redirect("/onboarding/questionnaire")` (`page.tsx:31-33`). Gate is the burner profile's `completedAt` timestamp, NOT a `required_actions` row, on this surface. (Note: the comment at `users.ts:187-191` flags `completedAt` as the "legacy" fallback that still gates here.)
- **Pending-approval** — `!isApproved` with `approvalStatus === "pending"` → `redirect("/pending-approval")` (`page.tsx:34-36`).
- **Rejected** — Same redirect branch: `approvalStatus === "rejected"` is also not `"approved"`, so `isApproved` is false and the user is bounced to `/pending-approval` (the terminal rejected state is surfaced on that page, not here).
- **Captain-only-locked** — N/A. This is a per-member self view available to every approved member; there is no rank-gated lock and the card never reveals captain-only data.

Ordering note: the gates run in the fixed sequence auth → invite → onboarding → approval (`page.tsx:24-36`); an earlier failing gate wins, e.g. a pending user who hasn't finished the questionnaire is sent to `/onboarding/questionnaire` before `/pending-approval`.

## Enums, options & configurable values
- **Rank** (`schema.ts:31`, `rankEnum`): `"captain" | "member"` — the only two STORED ranks. Rendered as the badge text "Captain" / "Member" (`page.tsx:40`). "Team Lead" (derived from `team_memberships.is_lead`) is NOT distinguished on this surface.
- **Approval status** (`schema.ts:41-45`, `approvalStatusEnum`): `"pending" | "approved" | "rejected"`. Consumed by `isApproved` (only `"approved"` passes; god emails always pass) (`users.ts:231-236`).
- **`initialsFrom` behaviour** (`initials.ts:6-17`): splits the source on `/[\s@.]+/`, drops empties, takes the first letter of the first two parts uppercased; returns the literal `"?"` for null/empty/unusable input.
- **Display-name fallback chain** (`page.tsx:38`): `displayName` → `primaryEmail` → `"Burner"`.
- **Avatar sizing**: `h-32 w-32 text-3xl` on this page (`page.tsx:46`); base `Avatar` default is `h-10 w-10` (`avatar.tsx:19`).
- **Button defaults** (`button.tsx:30-33`): `variant: "default"` (`bg-primary text-primary-foreground`), `size: "default"` (`h-10 px-4 py-2`). The Edit button overrides className with `mt-2 gap-2` only. Available variants: `default | destructive | outline | secondary | ghost | link`; sizes: `default | sm | lg | icon | icon-lg`.
- **Cache-Control on avatar bytes** (`route.ts:64`): `private, max-age=31536000, immutable` (31536000s = 1 year).
- **Avatar pathname prefix gate** (`route.ts:41`): must start with `"avatars/"`.
- **God-account bypass** (`access-control.ts:28-32`): email is in `GOD_EMAILS` (CSV env, case-insensitive) → bypasses both invite and approval gates.
- Hard-coded literal copy on this surface: `"Burner"`, `"Captain"`, `"Member"`, `"Edit profile"`, `"Want to update your burner questionnaire answers?"`, `"Review them here"`, `"Sign out"`.

## Data model touched
Read-only consumption — this surface writes nothing.

- **`users` table** (`schema.ts:220-303`) via `CampUser` (`users.ts:39-47`), populated by `toCampUser` (`users.ts:462-480`). Fields actually read on this surface:
  - `id` (uuid PK) — passed to `getBurnerProfile` and (via proxy) avatar gating.
  - `authUserId` (`auth_user_id`, text, unique) — match key; not rendered.
  - `displayName` (`display_name`, text, nullable) — heading + initials source.
  - `profileImageUrl` (`profile_image_url`, text, nullable) — same-origin `/api/avatar?pathname=…` proxy URL; gates whether `AvatarImage` renders (`page.tsx:47-49`).
  - `inviteCode` (`invite_code`, text, nullable) — consumed by `hasCampAccess` (NULL ⇒ god-only access).
  - `rank` (`rank` enum, default `"member"`) — badge label.
  - `approvalStatus` (`approval_status` enum, default `"approved"`) — consumed by `isApproved`; defaults to `"approved"` in `toCampUser` when the row's value is null (`users.ts:478`).
- **`AuthenticatedUser`** (`auth.ts:13-17`): `id`, `primaryEmail` (email line + fallbacks + god/`isApproved` checks), `displayName` (display-name/initials fallback chain).
- **`burner_profiles` table** (`schema.ts:352-364`) via `BurnerProfileSummary` (`users.ts:155-160`), from `getBurnerProfileByUserId` `SELECT *` (`burner-profile.ts:124-132`). Only `completedAt` (`completed_at`, timestamp nullable) is consumed by this surface as the onboarding gate (`page.tsx:31`). The summary also carries `responses`, `updatedAt`, `version` — fetched but unused here.
- **Avatar bytes proxy** (`route.ts`): reads the camp row again via `findCampUserByAuthId` and gates on `isApproved`; reads the Vercel Blob keyed by the `pathname` query param. Reads only; no DB write.

No data on this surface comes from `team_memberships`, `driver_profiles`, `dietary_requirements`, `required_actions`, or any other table.

## Validation, edge cases & business rules
- **No client/server input validation** — there are no inputs. All "validation" is the gate spine.
- **God accounts bypass both gates**: `isGodEmail` true ⇒ `hasCampAccess` and `isApproved` both true regardless of `inviteCode`/`approvalStatus` (`users.ts:223,235`).
- **Synthetic non-persisted row edge case**: a signed-in user with no DB row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `approvalStatus: "approved"` (`users.ts:86-94`). On this surface `hasCampAccess` reads false (no invite, not god) and the user is bounced to `/signup/required` before `id: ""` is ever used to query the profile.
- **Gate precedence is fixed and short-circuits**: auth → invite → onboarding-complete → approval (`page.tsx:24-36`). A failing earlier gate redirects before later checks run.
- **Onboarding gate is `completedAt`, not `required_actions`**: even if a `required_actions` questionnaire row were satisfied, a null `burner_profiles.completed_at` still bounces to `/onboarding/questionnaire` (`page.tsx:31`).
- **Rejected and pending share one redirect target** (`/pending-approval`); this surface does not differentiate them.
- **Team leads are not labelled** — the local ternary only knows `captain`/`member`, so a `member` who leads a team renders the "Member" badge.
- **Email may be absent**: when `primaryEmail` is null the email line is omitted (`page.tsx:58`) and the name heading falls through to `"Burner"` if `displayName` is also null.
- **Initials never blank**: `initialsFrom` returns `"?"` rather than an empty string for unusable input (`initials.ts:12`).
- **Photo visibility is approval-gated at the byte level**: even if `profileImageUrl` is set, the `/api/avatar` proxy 401s for unauthenticated/unapproved requests and 404s in E2E/no-token environments, so the `<img>` silently falls back to initials (`route.ts:24-49`). On this page the viewer is always approved (they passed the gate), so their own photo loads in production with a configured blob token.
- **E2E test mode**: `getBurnerProfile`/`ensureCampUser`/`isApproved` route through the in-memory `testStore`; avatar bytes always 404 (no blob), so initials fallback is the expected E2E rendering.

## Sub-components / variants
- **`Avatar` / `AvatarImage` / `AvatarFallback`** (`avatar.tsx`) — Radix-backed, `"use client"`. `AvatarImage` is `aspect-square object-cover`; `AvatarFallback` is centred with `bg-[var(--color-secondary)]` + `text-[var(--color-secondary-foreground)]`, `font-semibold`. Shared with the home header and the profile editor.
- **`Card` / `CardContent`** (`card.tsx`) — `Card` is `rounded-xl border bg-card text-card-foreground shadow-sm`; the page adds `overflow-hidden`. `CardContent` base is `p-6 pt-0`; the page overrides with `flex flex-col items-center gap-4 p-8 text-center`. (`CardHeader`/`CardTitle`/`CardDescription`/`CardFooter` exist in the module but are unused here.)
- **`Button`** (`button.tsx`) — used `asChild` to render the `<Link>` as the primary (`default`/`default`) button. The `icon-lg` size and `link`/`destructive`/`outline`/`ghost`/`secondary` variants are defined but unused on this surface.
- **Rank badge** — an inline `<span>` pill (`rounded-full bg-[var(--color-secondary)] … text-[var(--color-secondary-foreground)]`, `page.tsx:55`), NOT a shared `Badge` component (the repo has no dedicated badge primitive in this path).
- **Sign-out** is a raw `<a>` (full navigation), deliberately not Next `Link`, so it actually hits the `/auth/sign-out` route handler rather than client-routing.
- No dead/orphaned variants are introduced by this surface itself; the unused Card sub-parts and Button variants noted above are shared-primitive surface area, not this page's own code.
