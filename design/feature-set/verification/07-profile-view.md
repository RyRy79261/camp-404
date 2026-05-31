# Verification — 07 profile-view

**Verdict:** accurate  ·  checked 58 claims, verified 56.
The doc is a near line-perfect description of the profile surface: every cited file:line resolves, the gate spine, fallback chains, enums, avatar-proxy status codes, and shared-primitive defaults all match source. The only defects are two cosmetic nuances (a comment mis-attributed to "home gate" vs profile, and a CSS-token shorthand) — neither would mislead a rebuild.

## Inaccuracies
| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | Doc line 62: "the comment at `users.ts:187-191` flags `completedAt` as the 'legacy' fallback that still gates **here**" (implying the profile page). | The comment actually says the legacy `completedAt` fallback is "still present in the **home gate**" — it references the home page gate, not the profile page. The profile page does independently gate on `completedAt` (page.tsx:31), but the cited comment is about a different surface. | users.ts:187-191 |
| low | Doc lines 74/112/115 render the secondary tokens as `bg-[var(--color-secondary)]` / `text-[var(--color-secondary-foreground)]`. | Source uses the `[color:…]` prefix form: `bg-[color:var(--color-secondary)]` / `text-[color:var(--color-secondary-foreground)]`. Cosmetic shorthand; same token. | page.tsx:55, avatar.tsx:46 |

## Omissions
| severity | missing behavior/state/enum | file:line |
|---|---|---|
| (none material) | — | — |

## Spot-confirmed
- `export const dynamic = "force-dynamic"` at page.tsx:21, with the "Reads the Neon Auth session on every request" comment at page.tsx:20. (doc 21)
- Gate spine order auth → invite → onboarding → approval is exactly page.tsx:24-36: `getAuthenticatedUserOrRedirect()` (24), `ensureCampUser` (25), `if (!hasCampAccess(...)) redirect("/signup/required")` (26-28), `getBurnerProfile(campUser.id)` (29) then `if (!profile?.completedAt) redirect("/onboarding/questionnaire")` (31-33), `if (!isApproved(...)) redirect("/pending-approval")` (34-36).
- `getAuthenticatedUserOrRedirect()` → `redirect("/auth/sign-in")` if no user at auth.ts:40-44.
- `ensureCampUser` spans users.ts:60-95; `hasCampAccess` returns `isGodEmail(email) || !!user.inviteCode` at users.ts:219-224; `isApproved` returns `isGodEmail(email) || user.approvalStatus === "approved"` at users.ts:231-236.
- Display-name resolution `campUser.displayName ?? authUser.primaryEmail ?? "Burner"` verbatim at page.tsx:38.
- Initials source `initialsFrom(campUser.displayName ?? authUser.primaryEmail)` (name-or-email, NOT the "Burner" literal) at page.tsx:39.
- Rank label is a LOCAL ternary `campUser.rank === "captain" ? "Captain" : "Member"` at page.tsx:40 — confirmed `rankLabel`/`camp-roster` is NOT imported by the page; the shared helper `rankLabel(rank, isLead)` lives at camp-roster.ts:97 and returns "Team Lead" when `isLead` (camp-roster.ts:99). Team-lead derivation backed by `team_memberships.is_lead` (schema.ts:455). Page never distinguishes Team Lead. (doc 30, 70, 105)
- Avatar render: `<Avatar className="h-32 w-32 text-3xl">`, `AvatarImage` rendered only when `campUser.profileImageUrl` truthy, `<AvatarFallback>{initials}</AvatarFallback>` always present, at page.tsx:46-51.
- Identity block page.tsx:53-63: `<h1>` name (54), rank pill `<span>` (55-57), email line rendered only when `authUser.primaryEmail` truthy (58-62).
- Edit button: `Button asChild`, `<Link href="/profile/edit">`, `Pencil` icon `h-4 w-4 aria-hidden`, text "Edit profile", page.tsx:65-70.
- Questionnaire review copy "Want to update your burner questionnaire answers? … Review them here." → `<Link href="/onboarding/questionnaire">` at page.tsx:74-83.
- Sign-out is a raw `<a href="/auth/sign-out">` (not Next `Link`), label "Sign out", page.tsx:84-91.
- Avatar proxy: `runtime = "nodejs"` (route.ts:7); 401 if `!user` (25-28); 401 if `!campUser || !isApproved(campUser, user.primaryEmail)` (31-34); 400 if no `pathname` (36-39); 404 if `!pathname.startsWith("avatars/")` (40-43); 404 if `isE2ETestMode() || !token` (45-49); success streams with `Content-Type` from blob, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff` (58-67), `Cache-Control` literal at 64; any error / non-200 / null → 404 (55-71). Route reads the row via `findCampUserByAuthId` (route.ts:31; helper at users.ts:174-179).
- Synthetic non-persisted row edge case: `id: ""`, `inviteCode: null`, `approvalStatus: "approved"` at users.ts:86-94 (god-bypass branch creates a real approved row at 70-80).
- `toCampUser` at users.ts:462-480 with `approvalStatus: row.approvalStatus ?? "approved"` at line 478; `CampUser` shape at users.ts:39-47; `BurnerProfileSummary` at users.ts:155-160 (carries `responses`, `completedAt`, `updatedAt`, `version`).
- `getBurnerProfileByUserId` is a `.select()` (SELECT *) `.limit(1)` returning `rows[0] ?? null` at burner-profile.ts:124-132.
- `isGodEmail` at access-control.ts:28-32: CSV `GOD_EMAILS`, case-insensitive `includes`. God bypass on both gates confirmed via users.ts:223 and 235.
- Schema: `rankEnum = ["captain","member"]` at schema.ts:31; `approvalStatusEnum = ["pending","approved","rejected"]` at schema.ts:41-45; `users` table schema.ts:220-303 (`rank` default "member" at 231, `approvalStatus` default "approved" at 267-269); `profileImageUrl` proxy-URL comment at schema.ts:224-229; `burner_profiles` table schema.ts:352-364 with nullable `completedAt` at 362.
- `initialsFrom`: splits on `/[\s@.]+/`, drops empties, first letter of first two parts uppercased, returns `"?"` for null/empty/unusable, at initials.ts:6-17 (`"?"` returns at 7 and 12).
- `AuthenticatedUser` shape `{ id, primaryEmail, displayName }` at auth.ts:13-17; test cookie `camp404_test_user` (TEST_USER_COOKIE, test-mode.ts:9) honored only in E2E mode (auth.ts:25-29).
- Avatar primitives: base `Avatar` default `h-10 w-10` (avatar.tsx:19); `AvatarImage` `aspect-square … object-cover` (avatar.tsx:33); `AvatarFallback` centered, `font-semibold`, secondary bg/fg (avatar.tsx:46); `"use client"` (avatar.tsx:1); loading-window fallback documented at avatar.tsx:7-11. Shared with editor + home header (comment).
- Card: `rounded-xl border bg-card text-card-foreground shadow-sm` (card.tsx:11); `CardContent` base `p-6 pt-0` (card.tsx:62); `CardHeader`/`CardTitle`/`CardDescription`/`CardFooter` exist (card.tsx:19-76) and are unused by the page.
- Button: `disabled:pointer-events-none disabled:opacity-50` in base cva (button.tsx:8); defaultVariants `variant:"default"`, `size:"default"` (button.tsx:30-33); default variant `bg-primary text-primary-foreground` (button.tsx:12); default size `h-10 px-4 py-2` (button.tsx:23); variants `default|destructive|outline|secondary|ghost|link` (button.tsx:12-20); sizes `default|sm|lg|icon|icon-lg` (button.tsx:23-27). `asChild` via Slot (button.tsx:40,45).
- No dedicated `Badge` primitive exists anywhere under `packages/ui` or `apps` (find returned nothing) — confirms the doc's "no dedicated badge primitive" claim and the inline `<span>` pill at page.tsx:55.
- E2E behavior: `getBurnerProfile`/`ensureCampUser`/`isApproved` route through `testBackend`→`testStore` when `isE2ETestMode()`; avatar proxy always 404s in E2E (route.ts:46) so initials fallback is the expected E2E render. `testBackend.isTeamLead()` always returns false (users.ts:448-450).

## Low-confidence / could-not-verify
- Whether `@vercel/blob` `get()` actually returns `null`/`statusCode !== 200` for missing/304 cases is upstream package internals; the doc's 404 mapping (route.ts:55) trusts that contract — not independently verified against the package.
- Runtime god-account behavior depends on `GOD_EMAILS`/`INVITE_CODES`/`BLOB_READ_WRITE_TOKEN` env values at deploy time; verified the code paths, not any specific deployment's env.
- The doc's narrative that "in production the viewer is always approved so their own photo loads" (doc 108) is logically consistent with the gate spine but assumes a configured blob token in prod — an environment/deploy assumption, not a code guarantee.
