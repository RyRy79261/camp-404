# Unit 22 — Member directory, public profiles, bio system

**Donor:** quagga-portal / AfrikaBurn Contributors App
**Donor root:** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
All paths below are repo-relative to that root unless prefixed `camp-404:`.

---

## 1. Purpose

This subsystem is the donor's **identity + self-description + public-visibility spine**. It answers three questions that Camp 404 also has to answer, and answers them with a level of rigour Camp 404 does not currently have:

1. **What is a person's name in public?** — an account-level, globally unique, *optional* `username`, with a neutral placeholder fallback and a tombstone stub for deleted accounts (`packages/core/src/username.ts`).
2. **What of a person's self-description may other people see?** — a per-field privacy-flag map on the bio row, with two never-public classes enforced *in pure core*, never in UI (`packages/core/src/privacy.ts`, `packages/core/src/bio.ts:359 publicBioView`).
3. **How do you serve a third-party profile without leaking?** — a server projection that never even SELECTs the sensitive columns, plus a separately-authorised, audited, detail-view-only escape hatch for medical notes (`apps/web/lib/groups-store.ts:626 getPublicBurnerProfile`, `apps/web/lib/medical-access.ts:37 resolveMedicalNotesForViewer`).

Around that sit: a searchable/filterable **directory** (of *camps*, not people — see §11), a **camp roster** that links to each member's public profile, a **5-step bio flow** used for both onboarding and profile editing, a **camp-history editor** with a privacy-respecting type-ahead, and a **profile page** that shows the owner their own per-field visibility.

**Why it matters to Camp 404.** Camp 404 already has the *shape* of this (`camp-404:apps/web/lib/camp-roster.ts` `PublicRosterRow` vs `RosterRow`, `rosterForViewer`, `getPublicMemberProfileAction`), but it has:
- no per-field privacy model at all (visibility is a hard-coded fork of two row shapes);
- no username/handle concept (display names come from the burner profile);
- no safety-visible field class — and WP5 (#129) explicitly flags `users.emergency_contacts` as **safety-critical and unsurfaced**;
- no member search/filter beyond `roster-toolbar.tsx`;
- no `loading.tsx` anywhere (WP7 #131) and one global error boundary.

The donor has production-hardened answers for every one of those, most of them in **pure, zero-I/O `@quagga/core` modules with no tenancy coupling whatsoever**. This is the highest drop-in-density unit in the donor.

---

## 2. File inventory (with line counts)

### 2.1 Pure core logic (`packages/core`) — no DB, no I/O, no env

| File | Lines | Role |
|---|---:|---|
| `packages/core/src/bio.ts` | 732 | The bio as a "code questionnaire": definition builder, response⇄column mapping, privacy registry, `publicBioView`, `initialsFromName`, `isBioComplete` |
| `packages/core/src/privacy.ts` | 127 | The two never-public classes + `canBePublic` / `enforcePrivacyFlags` / `privacyViolations` |
| `packages/core/src/username.ts` | 257 | Handle rules, 100-entry reserved list, `validateUsername`, `publicMemberName` |
| `packages/core/src/medical-access.ts` | 142 | Pure `canViewMedicalNotes` / `medicalAccessBasis` predicates + audit action constant |
| `packages/core/src/word-count.ts` | 37 | `countWords` / `isWithinWordLimit` / `wordsRemaining`, 60-word camp cap |
| `packages/core/src/name-dedupe.ts` | 70 | `normalizeName`, `trigramSimilarity` (pg_trgm-compatible), `isSimilarName` |
| `packages/core/src/camp-categories.ts` | 153 | 8 canonical categories, label normalisation/dedupe, `matchesCategoryFilter` |
| `packages/core/src/member-ref-code.ts` | 123 | `MAH-M017`-style per-camp member reference codes |
| `packages/core/src/id-retention.ts` | 121 | POPIA storage-limitation rule for ID/passport ciphertext (**built, not scheduled**) |
| `packages/core/src/account-sanitization.ts` | 351 | "Departed Burner" erasure plan + `uncoveredHardLockedFields` compliance prover |

### 2.2 Types (`packages/types`)

| File | Lines | Role |
|---|---:|---|
| `packages/types/src/bio.ts` | 83 | `VOLUNTEER_PORTFOLIOS` (15), `CampHistoryEntry` Zod, `BioExtrasInput` Zod |
| `packages/types/src/questionnaire.ts` (excerpt `:186-211`, `:724-739`) | — | `ATTENDED_YEAR_MIN/MAX`, `NO_BURN_YEARS`, `isValidAttendedYear`, `attendedYearOptions`, the `years` validator branch |

### 2.3 Server data layer (`apps/web/lib`) — `server-only`

| File | Lines | Role |
|---|---:|---|
| `apps/web/lib/bio-store.ts` | 530 | `getBio`, `getUsername`, `isUsernameAvailable`, `saveBio`, `savePrivacyFlags`, `ensureProfileKeypair`, `getKeyFingerprint` |
| `apps/web/lib/groups-store.ts` | 1024 | `listDirectory` (:103), `searchCampDirectory` (:457), `resolveCampHistoryDisplay` (:538), **`getPublicBurnerProfile` (:626)**, plus camp CRUD |
| `apps/web/lib/medical-access.ts` | 237 | `resolveMedicalNotesForViewer` + org-role-aware context builder |
| `apps/web/lib/crypto-guard.ts` | 19 | `isCryptoConfigured` / `safeEncrypt` / re-export of `decryptOrNull`, `decryptField` |
| `apps/web/lib/camp-search-action.ts` | 24 | `"use server"` type-ahead wrapper |
| `packages/db/src/crypto.ts` | 113 | AES-256-GCM `encrypt`/`decrypt`/`decryptOrNull`/**`decryptField` (3-state)** |

### 2.4 Routes (`apps/web/app/(app)`)

| File | Lines | Role |
|---|---:|---|
| `apps/web/app/(app)/directory/page.tsx` | 322 | Camp directory: search form, category chips, registered / your-free-camps split |
| `apps/web/app/(app)/directory/loading.tsx` | 39 | Skeleton mirroring the page's exact container classes |
| `apps/web/app/(app)/burners/[id]/page.tsx` | 242 | **Third-party public burner profile** |
| `apps/web/app/(app)/burners/[id]/loading.tsx` | 26 | Hero + 2 card skeleton |
| `apps/web/app/(app)/profile/page.tsx` | 465 | Own profile: bio rows w/ per-field visibility badges, burns & volunteering, signing key, account |
| `apps/web/app/(app)/profile/actions.ts` | 55 | `updateBioAction`, `savePrivacyFlagsAction` |
| `apps/web/app/(app)/profile/loading.tsx` | 33 | Skeleton |
| `apps/web/app/(app)/onboarding/actions.ts` | 84 | `saveOnboardingBioAction`, **`checkUsernameAvailabilityAction`** (the enumeration-sane availability probe) |
| `apps/web/app/(app)/account/page.tsx` | 212 | Manage account: username read-only w/ "edit in your bio", email, sign-in methods |
| `apps/web/app/(app)/account/security/page.tsx` | 123 | 2FA / passkeys / sessions / security events |
| `apps/web/app/(app)/account/delete/page.tsx` | 240 | Deletion, with the ERASED/ANONYMISED consequence columns |
| `apps/web/app/(app)/account/delete/blocked-projects.ts` | 38 | Resolve blocked group ids → name+slug for "transfer leadership" links |
| `apps/web/app/(app)/account/security/events.ts` | 57 | Security-event feed reader |
| `apps/web/app/(app)/account/loading.tsx` | 39 | Skeleton |
| `apps/web/app/(app)/account/error.tsx` | 22 | Scoped route error boundary |

### 2.5 Components (`apps/web/components`)

| File | Lines | Role |
|---|---:|---|
| `apps/web/components/profile-public/profile-hero.tsx` | 69 | Eyebrow + initials avatar + name + city·burns meta + action slot |
| `apps/web/components/profile-public/profile-section.tsx` | 24 | Labelled section w/ optional icon |
| `apps/web/components/profile-public/profile-camps.tsx` | 119 | Memberships + self-reported camp history, linkable only when registered |
| `apps/web/components/profile-public/privacy-note.tsx` | 22 | The closing "some details are private" statement |
| `apps/web/components/privacy-toggles.tsx` | 86 | Per-field public/private list w/ locked rows and lock reasons |
| `apps/web/components/onboarding/bio-flow.tsx` | 803 | The 5-step (onboarding) / 3-step (edit) bio flow incl. debounced username availability |
| `apps/web/components/questionnaire/burns-step.tsx` | 403 | About (word counter) + camp-history editor + volunteering + rangers |
| `apps/web/components/questionnaire/extras-state.ts` | 21 | `BioExtras` → `BioExtrasState` adapter |
| `apps/web/components/camp-members.tsx` | 315 | Camp roster, links to `/burners/<userId>`, role quick-assign dialog |
| `apps/web/components/member-ref-code.tsx` | 74 | Copyable member ref code chip |
| `apps/web/components/account/account-shell.tsx` | 57 | Account tab chrome over the shared `@quagga/ui` shell |
| `apps/web/components/boundary/error-recovery.tsx` | 81 | Shared error-boundary body |
| `apps/web/components/boundary/not-found-view.tsx` | 63 | Shared 404 body |
| `apps/web/components/boundary/page-skeleton.tsx` | 44 | Shared loading body |

### 2.6 Shared UI (`packages/ui/src/components`)

| File | Lines | Role |
|---|---:|---|
| `packages/ui/src/components/skeleton.tsx` | 204 | **`Skeleton` kit**: `SkeletonRegion`, `SkeletonText`, `SkeletonHeading`, `SkeletonCard`, `SkeletonRow`, `SkeletonCardGrid`, `SkeletonField`, `SkeletonForm` |
| `packages/ui/src/components/switch.tsx` | 109 | Native `<button role="switch">`; **`variant="privacy"` + `hardLocked`** |
| `packages/ui/src/components/field.tsx` | 74 | label · control · help · error wrapper with a `privacyToggle` label-row slot |
| `packages/ui/src/components/phone-input.tsx` | 124 | E.164 international phone input (ZA default) |
| `packages/ui/src/components/toggle-group.tsx` | 81 | Radix toggle-group (years grid, volunteering chips, ID type) |

### 2.7 Org-side counterparts (`apps/org`) — the reviewer's view of the same data

| File | Lines | Role |
|---|---:|---|
| `apps/org/app/(console)/accounts/page.tsx` | 162 | **Account search whose search FIELD narrows with the caller's rank** |
| `apps/org/components/accounts-table.tsx` | 204 | Responsive rows w/ capability chips |
| `apps/org/components/member-roster.tsx` | 73 | Camp roster with a documented refusal to carry any medical signpost |
| `apps/org/app/(console)/registrations/[id]/members/[userId]/page.tsx` | 205 | The one org surface that renders medical notes; authorises BEFORE fetching |
| `apps/org/lib/queries.ts` (`searchAccounts` :387, `getRosterMemberDetail` :1399, `getOrgAccessRoster` :772) | 2102 | The per-domain "resolve personal information BEFORE the select" pattern |
| `apps/org/lib/medical-audit.ts` | 239 | Reader for `bio.medical.view` rows; **withholds the whole panel** rather than redacting |

### 2.8 Tests

| File | Lines |
|---|---:|
| `packages/core/src/__tests__/bio.test.ts` | 642 |
| `packages/core/src/__tests__/username.test.ts` | 224 |
| `packages/core/src/__tests__/privacy.test.ts` | 108 |
| `packages/core/src/__tests__/medical-access.test.ts` | 205 |
| `packages/core/src/__tests__/name-dedupe.test.ts` | 48 |
| `packages/core/src/__tests__/word-count.test.ts` | 39 |
| `packages/core/src/__tests__/account-sanitization.test.ts` | 254 |
| `packages/types/src/__tests__/bio.test.ts` | 138 |
| `apps/web/lib/__tests__/bio-store-projection.test.ts` | 645 |
| `apps/web/lib/__tests__/groups-store.test.ts` | 826 |
| `apps/web/lib/__tests__/bio-ciphertext-preservation.test.ts` | 155 |
| `apps/web/lib/__tests__/medical-access-resolver.test.ts` | 308 |
| `apps/org/lib/__tests__/roster-privacy.test.ts` | 120 |
| `apps/org/lib/__tests__/medical-audit-surface.test.ts` | 361 |
| `apps/org/lib/__tests__/account-surface.test.ts` | 535 |
| `e2e/specs/new-burner/privacy-projection.spec.ts` | 123 |
| `e2e/specs/new-burner/burner-bio.spec.ts` | 227 |
| `e2e/specs/new-burner/directory-and-join.spec.ts` | 82 |
| `e2e/specs/new-burner/support.ts` | 120 |
| `e2e/specs/anon/burner-profile-privacy.spec.ts` | (present) |
| `e2e/specs/org-staff/medical-notes-access.spec.ts` | 143 |

---

## 3. Capability list (exhaustive, cited)

### Identity / handle
1. **Optional account-level username**, 3–20 chars, `^[a-z0-9_]+$` on the lowercased form, must start with a letter, cannot end with `_`, cannot contain `__` (`packages/core/src/username.ts:185-232`).
2. **Case-preserving storage, case-insensitive uniqueness** — stored as entered; `users_username_lower_idx` is a `uniqueIndex` on `sql\`lower(${u.username})\`` (`packages/db/src/schema.ts:315-317`, i.e. `users` def at `:283`); `normalizeUsername` is the app-side key (`username.ts:157`).
3. **~100-entry reserved list** covering platform identity, every first path segment of all three apps, action words, data-breaking values, and safety-role words (`username.ts:49-150`).
4. **Neutral display fallback** — `publicMemberName(username, {sanitizedAt})` returns `DEPARTED_BURNER_NAME` for a tombstoned account, else the trimmed username, else `UNNAMED_BURNER = "Unnamed burner"`. **Deliberately never falls back to legal name or email** (`username.ts:250-257`, `:29-32`).
5. **Username has NO privacy toggle** and is deliberately absent from the privacy registry, because "private unique handle" is not an honest state (`bio.ts:163-167`; restated at `profile/page.tsx:242-248` and `bio-flow.tsx:573-575`).
6. **Debounced, authorised, enumeration-sane availability check** — 400 ms debounce, client format-validation first, own current handle skipped entirely (`bio-flow.tsx:424-489`); server side is `requireCampUser` + Zod cap at `USERNAME_MAX_LENGTH * 10` + the same `validateUsername` + one indexed `lower(username)` equality lookup, returning a bare verdict that names no holder (`onboarding/actions.ts:42`, `:67-84`; `bio-store.ts:154-166`).
7. **Lost-race handling** — the pre-check is a hint; a `23505` unique violation on the write is mapped to the *same* "taken" message so the user cannot tell which fired (`bio-store.ts:136-143`, `:207`, `:422-435`).
8. **Clearing the handle frees it** — a blank username field is meaningful and nulls `users.username` (`bio.ts:638-648`, `bio-store.ts:246-249`).
9. **`initialsFromName`** splits on whitespace **and underscores** so `dusty_prototype` → `DP`, single word → first two letters, empty → `"?"` (`bio.ts:397-407`).

### Privacy model
10. **Two never-public classes**, both enforced in pure core: `HARD_LOCKED_PRIVATE_FIELDS = ["saId","passport","phone","onsiteContactName","onsiteContactPhone","offsiteContactName","offsiteContactPhone"]` (no access path ever) and `SAFETY_VISIBLE_FIELDS = ["medical"]` (never public, but readable by a defined audience) (`privacy.ts:39-59`).
11. **`ALWAYS_PRIVATE_FIELDS`** is their union; `canBePublic(field)` = `!isAlwaysPrivate(field)` (`privacy.ts:67-99`).
12. **`enforcePrivacyFlags`** force-writes `false` for every always-private field on every persistence path (`privacy.ts:108-116`); **`privacyViolations`** reports illegal attempts for a loud boundary error (`privacy.ts:123-127`).
13. **19-entry ordered privacy registry** `BIO_PRIVACY_FIELDS`, whose `locked` flag is *derived* from `ALWAYS_PRIVATE_FIELDS` (`.map((f) => ({...f, locked: ALWAYS_PRIVATE.has(f.key) || f.locked}))`) so registry and law cannot drift (`bio.ts:168-278`).
14. **Privacy flags are owned by the privacy editor, not by every save** — `resolvePrivacyFlagsUpdate(undefined)` returns an EMPTY patch so a bio-text save cannot silently reset deliberate private choices; an explicitly-supplied empty map *is* a write (`bio.ts:305-319`; regression-tested at `bio.test.ts:82`, `:102`).
15. **`publicBioView(fields, flags, extras)`** — a field appears only when `canBePublic(key) && privacyFlags[key] === true`. Takes the FULL bio so callers cannot bypass the gate by pre-selecting (`bio.ts:359-390`).
16. **One `"ranger"` flag governs three booleans** (`rangerTraining`, `rangerCurious`, `greenDotTraining`) (`bio.ts:367-368`, `:386-388`).
17. **`volunteeringOther` rides the `volunteeringInterests` flag** (`bio.ts:383-385`).
18. **Missing flag ⇒ private** (`=== true` comparison; tested `bio.test.ts:199`).

### Public profile projection
19. **The public query never SELECTs the sensitive columns.** `getPublicBurnerProfile` selects exactly 13 bio columns and hard-codes `phone/onsite*/offsite*/medicalNotes/idType/idNumber` to `null` in the constructed `BurnerBioFields` (`groups-store.ts:648-698`).
20. **Free camps stay undiscoverable on a profile** — only memberships whose group has an `approved` registration this edition are broadcast (`groups-store.ts:717-748`).
21. **Camp history links out only when the linked camp is registered**; otherwise it renders as plain text with a `Self-reported` badge (`groups-store.ts:519-596`, `profile-camps.tsx:82-113`).
22. **The public profile page holds no privacy logic of its own** — an unrenderable field is one it was never given (`burners/[id]/page.tsx:22-29`).
23. **Zod-validated dynamic segment** — `z.object({id: z.string().uuid()})`; anything else is `notFound()`, not a query (`burners/[id]/page.tsx:41`, `:48-50`).
24. **Anonymous visitors are refused** the profile route entirely (`burners/[id]/page.tsx:53-54` → `redirect("/auth/sign-in")`).

### Medical notes (the safety-visible exception)
25. **`MEDICAL_AUDIENCE_NOTE`** is a single exported string, reused in the questionnaire definition, the bio flow help text and the privacy lock reason, so no surface can collect medical data without stating its audience (`bio.ts:156-157`, used `:262`, `:595`, `bio-flow.tsx:731`).
26. **Pure predicate `canViewMedicalNotes(ctx)`** — self ⇒ yes; org safety tier (`god`, or resolved `read_personal_information` *in the `registrations` domain*) ⇒ yes; camp lead/admin whose lead-camp set **intersects** the subject's camp set ⇒ yes; else no. Fail-closed (`medical-access.ts:114-122`).
27. **`medicalAccessBasis` → `"self" | "org_staff" | "camp_lead" | null`**, stored on the audit row (`medical-access.ts:126-135`).
28. **Every disclosing read writes `audit_events` with action `"bio.medical.view"`**, off the critical path via Next's `after()`, fail-open, error swallowed (`apps/web/lib/medical-access.ts:79-93`; org twin at `registrations/[id]/members/[userId]/page.tsx:109-123`).
29. **Own reads and empty fields are not audited** — `if (!isSelf && notes)` (`apps/web/lib/medical-access.ts:79`).
30. **Detail-view-only**: no roster, list, card or export carries the notes *or a has/has-not signpost*, because the signpost alone would be an un-audited census (`apps/org/components/member-roster.tsx:19-30`).
31. **Three-state decrypt on safety surfaces** — `decryptField` returns `{state:"empty"|"ok"|"unreadable"}`; an `unreadable` value renders a `role="alert"` "there ARE notes we cannot read" panel rather than the false all-clear "no medical notes" (`packages/db/src/crypto.ts:95-112`; rendered `burners/[id]/page.tsx:138-157`, `registrations/.../page.tsx:172-189`).
32. **The medical-access audit panel is withheld whole**, not redacted, from a caller without `read_personal_information` in the `audit` domain — because the subject list *is* the census (`apps/org/lib/medical-audit.ts:72-92`, `:117-121`), and `bio.medical.view` rows are filtered out of the general audit trail for such a caller (`medical-audit.ts:207-225`).

### Bio persistence
33. **Bio-as-code-questionnaire**: `buildBurnerBioQuestionnaire()` returns a 7-page definition (`intro`, `identity`, `about`, `history`, `contact`, `emergency`, `identity_documents`) at version `BURNER_BIO_VERSION = "2027.2"` (`bio.ts:25`, `:441-630`).
34. **`isBioComplete` keys on `completedAt`, not on any field** — completion is an ACT (`bio.ts:711-732`). Marked ⚠ PROVISIONAL in-source.
35. **Refuse, don't drop** — a save carrying medical notes or an ID with no `PGCRYPTO_KEY` **throws with an operator-actionable message**; a save carrying neither still succeeds (`bio-store.ts:287-306`).
36. **Never destroy ciphertext you merely could not read** — `encryptOrPreserve` keeps stored ciphertext whose `decryptField` state is `"unreadable"`, because the form showed the user nothing so "empty" carries no intent. A *readable* value cleared to empty still clears (`bio-store.ts:308-367`).
37. **Switching ID type does not strip the other type's unreadable ciphertext** (`bio-store.ts:350-363`).
38. **`display_name` is deliberately omitted from the write set** so a legacy per-edition playa name is preserved rather than nulled by every save (`bio-store.ts:378-381`).
39. **Upsert on `(userId, editionId)`**, with `completedAt` stamped only on `final` and **never unset** (`bio-store.ts:403-420`).
40. **Camp-history write validation** — linked entries are resolved against real groups: a valid link has its label refreshed to the group's current name; a stale link **degrades to freetext keeping the label** (`bio-store.ts:174-200`).
41. **Fail-closed keypair minting** — `ensureProfileKeypair` mints nothing without a key ("a lock box in the clear is worse than an empty one"), with a 25-line in-source rationale (`bio-store.ts:468-517`).
42. **`getKeyFingerprint`** renders as "Generating on next save…" when absent (`bio-store.ts:520-529`, `profile/page.tsx:426`).
43. **Final save clears the blocking required action** `BURNER_BIO_ACTION_KEY = "burner_bio"` (`bio-store.ts:439-445`, `packages/core/src/questionnaire-engine.ts:18`).

### Directory & search
44. **Directory visibility rule**: registered (approved-registration-this-edition) camps are public; unregistered "free" camps appear **only to their own members** (`groups-store.ts:172-176`).
45. **Search is a normalized-name substring** via `normalizeName` (case/space/punct-insensitive) against the stored `groups.name_normalized` (`groups-store.ts:170`, `:177`).
46. **Sort: registered first, then name `localeCompare`** (`groups-store.ts:190-193`).
47. **Category filter chips**, edition-scoped, ordered by the org's `sort` then `label`; a stale/garbage `?cat=` collapses to "All camps" (`directory/page.tsx:205-206`, `groups-store.ts:59-69`).
48. **Filter and search compose in the URL** — `directoryHref(q, categoryId)` plus a hidden `cat` input inside the GET search form (`directory/page.tsx:39-48`, `:244-246`).
49. **Type-ahead search (`searchCampDirectory`) re-implements the same visibility rule** and additionally: no query below 2 normalized chars, `.slice(0, 10)` cap (`groups-store.ts:457-514`).
50. **Directory gates the viewer first** — `enforceGate(campUser.id)` is deliberately awaited **alone and before** the parallel reads, so a gated user is redirected rather than served in parallel (`directory/page.tsx:180-190`).

### Roster
51. **Camp roster links each member to `/burners/<userId>`** — the app's only real path to a third party's profile (`camp-members.tsx:125-130`).
52. **Role label layer** — `god` renders as `"System manager"` while the stored enum stays `god`; `admin` renders as `"Co-lead"` (`camp-members.tsx:61-68`, `profile-camps.tsx:26-33`, `apps/org/components/member-roster.tsx:10-17`).
53. **Member reference codes** `{PREFIX}-M{NNN}` for camp-internal EFT reconciliation, prefix derived from the camp name and disambiguated deterministically (`packages/core/src/member-ref-code.ts`).
54. **Org account search field narrows with rank** — a caller without `read_personal_information` in the `accounts` domain gets a "Search by username…" placeholder *and* a query that does not match on email, because an email match would be a lookup oracle (`apps/org/app/(console)/accounts/page.tsx:110-123`, `apps/org/lib/queries.ts:430-459`).
55. **UUID-shaped search terms only touch the id column** — `/^[0-9a-f-]{8,}$/i`; the in-source rationale measures that `"4"` matches 100% of v4 uuids (`apps/org/lib/queries.ts:397-412`).

### Loading / error boundaries
56. **Per-route `loading.tsx` files that copy the page's own container classes** so the swap is a fill and nothing jumps (`directory/loading.tsx:7-14`, `profile/loading.tsx:7-11`, `burners/[id]/loading.tsx:7-11`).
57. **`SkeletonRegion` owns the single `aria-live="polite"` + `aria-busy` + `data-loading="true"` hook** so E2E can assert a boundary actually rendered; the bars themselves are `aria-hidden` (`packages/ui/src/components/skeleton.tsx:31-65`).
58. **Scoped route error boundary** per surface with a shared `ErrorRecovery` body (`account/error.tsx`, `components/boundary/error-recovery.tsx`).

### Account surfaces (auth-adjacent, provider-agnostic)
59. **One writer per field** — `/account` renders the username **read-only** and links to `/profile?edit=1`, on the stated grounds that "two writers for one field is how they drift apart" (`account/page.tsx:38-41`, `:129-141`).
60. **Deletion consequence columns are generated from the actual sanitization plan**, not marketing copy (`account/delete/page.tsx:26-52`).
61. **`resolveBlockedProjects`** turns core's pure blocked-group ids into name+slug so "Transfer leadership → Open <camp>" is a working link ("a dead end with a reason is still a dead end") (`account/delete/blocked-projects.ts:8-13`).
62. Account tab chrome (`Manage` / `Security` / `Delete`) is a prop-driven list over a shared `@quagga/ui` shell (`components/account/account-shell.tsx:20-24`).

---

## 4. Data model (verbatim)

### `users` (`packages/db/src/schema.ts:283`)
```ts
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: text("auth_user_id").notNull().unique(),
    email: text("email"),
    username: text("username"),
    sanitizedAt: timestamp("sanitized_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (u) => ({
    usernameLowerIdx: uniqueIndex("users_username_lower_idx").on(
      sql`lower(${u.username})`,
    ),
  }),
);
```
Note: `username` is nullable (optional); Postgres treats NULLs as distinct so the no-username case is unconstrained for free (`schema.ts:311-314` comment).

### `burner_bios` (`packages/db/src/schema.ts:605`) — **user × edition**
Columns, verbatim names:
- `id: uuid` PK; `userId: uuid` → `users.id` ON DELETE CASCADE; `editionId: uuid` → `editions.id` ON DELETE CASCADE
- Public-toggleable: `displayName: text("display_name")` *(retired)*, `legalName: text("legal_name")`, `homeCity: text("home_city")`, `bio: text("bio")`, `skills: jsonb("skills").$type<string[]>().notNull().default([])`, `attendedYears: jsonb("attended_years").$type<number[]>().notNull().default([])`, `firstTime: boolean("first_time").notNull().default(false)`
- Contact: `contactEmail: text("contact_email")`, `phone: text("phone")` *(HARD-LOCKED, stored E.164)*
- Hard-locked plaintext: `onsiteContactName`, `onsiteContactPhone`, `offsiteContactName`, `offsiteContactPhone`
- Safety-visible + encrypted: `medicalNotes: text("medical_notes")`
- Hard-locked + encrypted: `saIdEncrypted: text("sa_id_encrypted")`, `passportEncrypted: text("passport_encrypted")`
- v3 additions (all nullable): `about: text("about")`, `campHistory: jsonb("camp_history").$type<CampHistoryEntry[]>()`, `volunteeringInterests: jsonb("volunteering_interests").$type<string[]>()`, `rangerTraining: boolean("ranger_training")`, `rangerCurious: boolean("ranger_curious")`, `greenDotTraining: boolean("green_dot_training")`
- `privacyFlags: jsonb("privacy_flags").$type<Record<string, boolean>>().notNull().default({})`
- Bookkeeping: `version: text("version").notNull()`, `startedAt` (notNull defaultNow), `completedAt: timestamp(...)` nullable, `updatedAt` (notNull defaultNow)
- Indexes: `uniqueIndex("burner_bios_user_edition_idx").on(b.userId, b.editionId)`, `index("burner_bios_edition_idx").on(b.editionId)`

### `profile_keys` (`packages/db/src/schema.ts:702`)
```ts
export const profileKeys = pgTable("profile_keys", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```
Used for nothing yet — reserved for future QR attestations (`schema.ts:697-700`).

### `audit_events` (`packages/db/src/schema.ts:1708`)
Consumed here with `action = "bio.medical.view"`, `actorId`, `subject` (text), `meta: { basis }`.

### Enum-ish constants (verbatim)
- `HARD_LOCKED_PRIVATE_FIELDS = ["saId","passport","phone","onsiteContactName","onsiteContactPhone","offsiteContactName","offsiteContactPhone"] as const`
- `SAFETY_VISIBLE_FIELDS = ["medical"] as const`
- `ALWAYS_PRIVATE_FIELDS = [...HARD_LOCKED_PRIVATE_FIELDS, ...SAFETY_VISIBLE_FIELDS] as const`
- `MedicalAccessBasis = "self" | "org_staff" | "camp_lead"`
- `MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view"`
- `BURNER_BIO_VERSION = "2027.2"`; `USERNAME_QUESTION_ID = "username"`; `BURNER_BIO_ACTION_KEY = "burner_bio"`
- `USERNAME_MIN_LENGTH = 3`; `USERNAME_MAX_LENGTH = 20`; `UNNAMED_BURNER = "Unnamed burner"`; `DEPARTED_BURNER_NAME = "Departed Burner"`
- `ABOUT_SOFT_WORD_CAP = 150`; `CAMP_DESCRIPTION_WORD_LIMIT = 60`; `SIMILARITY_WARN_THRESHOLD = 0.55`
- `ATTENDED_YEAR_MIN = 2007`; `ATTENDED_YEAR_MAX = 2026`; `NO_BURN_YEARS = [2020, 2021]`
- `ID_RETENTION_GRACE_DAYS = 30`; `MEDICAL_AUDIT_LOOKBACK_DAYS = 30`; `MEDICAL_AUDIT_ROW_CAP = 500`
- `USERNAME_DEBOUNCE_MS = 400` (`bio-flow.tsx:466`); camp-history type-ahead debounce `250` ms, min 2 chars (`burns-step.tsx:216-228`)
- `SKILL_OPTIONS` (10): `build, electrical, sound, lighting, kitchen, medical, safety, art, admin, welding` (`bio.ts:425-436`)
- `VOLUNTEER_PORTFOLIOS` (15 keys): `arteria, box_office, chillaz, dmv, die_hek, die_yskas, greeters, kitchen, lost_and_found, moop, recycling, rangers, sanctuary, throne_crew, volunteer_info_booth` (`packages/types/src/bio.ts:12-27`)
- `CANONICAL_CAMP_CATEGORIES` (8): Family-friendly 🧸, Food & drink 🍲, Workshops & talks 🛠️, Music & sound 🔊, Art & making 🎨, Chill & shade 🌿, Bar 🍹, Performance 🎭 (`camp-categories.ts:29-38`)

### `BIO_PRIVACY_FIELDS` — the full 19-row registry, verbatim key/label/locked/defaultPublic
| key | label | locked | defaultPublic |
|---|---|---|---|
| `legalName` | Legal name | false | **false** |
| `homeCity` | Home city | false | true |
| `bio` | About you | false | true |
| `skills` | Skills | false | true |
| `attendedYears` | Years attended | false | true |
| `firstTime` | First-timer status | false | true |
| `contactEmail` | Contact email | false | **false** |
| `about` | Bio for the burns | false | true |
| `campHistory` | Camp history | false | true |
| `volunteeringInterests` | Volunteering interests | false | true |
| `ranger` | Ranger interests | false | true |
| `phone` | Phone number | **true** | false |
| `onsiteContactName` | On-site emergency contact — name | **true** | false |
| `onsiteContactPhone` | On-site emergency contact — phone | **true** | false |
| `offsiteContactName` | Off-site emergency contact — name | **true** | false |
| `offsiteContactPhone` | Off-site emergency contact — phone | **true** | false |
| `medical` | Medical notes | **true** | false |
| `saId` | SA ID number | **true** | false |
| `passport` | Passport number | **true** | false |

Lock reasons, verbatim: phone → `"Always private — never shown in the directory or to other camps."`; the four emergency rows → `"Always private — held for safety teams only."`; medical → `` `Never public. ${MEDICAL_AUDIENCE_NOTE}` ``; saId/passport → `"Always private + encrypted at rest (POPIA)."` (`bio.ts:221-277`).

---

## 5. Public API surface (verbatim signatures)

### `@quagga/core` — `privacy.ts`
```ts
export function isHardLockedPrivate(field: string): boolean
export function isSafetyVisibleField(field: string): boolean
export function isAlwaysPrivate(field: string): boolean
export function canBePublic(field: string): boolean
export function enforcePrivacyFlags(flags: Record<string, boolean>): Record<string, boolean>
export function privacyViolations(flags: Record<string, boolean>): AlwaysPrivateField[]
```

### `@quagga/core` — `bio.ts`
```ts
export interface BurnerBioFields {
  legalName: string | null; homeCity: string | null; bio: string | null;
  skills: string[]; attendedYears: number[]; firstTime: boolean;
  contactEmail: string | null; phone: string | null;
  onsiteContactName: string | null; onsiteContactPhone: string | null;
  offsiteContactName: string | null; offsiteContactPhone: string | null;
  medicalNotes: string | null;
  idType: "passport" | "sa_id" | null; idNumber: string | null;
}
export interface BioExtras {
  about: string | null; campHistory: CampHistoryEntry[];
  volunteeringInterests: string[]; volunteeringOther: string | null;
  rangerTraining: boolean; rangerCurious: boolean; greenDotTraining: boolean;
}
export function emptyBioExtras(): BioExtras
export function serializeVolunteering(interests: string[], other: string | null | undefined): string[]
export function parseVolunteering(raw: string[] | null | undefined): { interests: string[]; other: string | null }
export interface BioPrivacyField { key: string; label: string; locked: boolean; defaultPublic: boolean; lockReason?: string }
export const BIO_PRIVACY_FIELDS: readonly BioPrivacyField[]
export function defaultPrivacyFlags(): Record<string, boolean>
export function initialPrivacyFlags(rawPrivacyFlags?: Record<string, boolean>): Record<string, boolean>
export function resolvePrivacyFlagsUpdate(
  rawPrivacyFlags: Record<string, boolean> | undefined,
): { privacyFlags: Record<string, boolean> } | Record<string, never>
export interface PublicBioView { /* legalName, homeCity, bio, skills, attendedYears, firstTime, contactEmail, about, campHistory, volunteeringInterests, volunteeringOther, rangerTraining, rangerCurious, greenDotTraining */ }
export function publicBioView(
  fields: BurnerBioFields,
  privacyFlags: Record<string, boolean>,
  extras: BioExtras = emptyBioExtras(),
): PublicBioView
export function initialsFromName(name: string | null | undefined): string
export function parseAttendedYears(raw: unknown): number[]
export function buildBurnerBioQuestionnaire(): Questionnaire
export function usernameFromResponses(responses: QuestionnaireResponses): string | null
export function mapResponsesToBio(responses: QuestionnaireResponses): BurnerBioFields
export function mapBioToResponses(fields: Partial<BurnerBioFields>, username?: string | null): QuestionnaireResponses
export function isBioComplete(bio: { completedAt?: Date | null }): boolean
```

### `@quagga/core` — `username.ts`
```ts
export function normalizeUsername(raw: string): string
export function isReservedUsername(raw: string): boolean
export type UsernameValidation =
  | { ok: true; username: string; normalized: string }
  | { ok: false; error: string };
export function validateUsername(raw: string): UsernameValidation
export function publicMemberName(
  username: string | null | undefined,
  options?: { sanitizedAt?: Date | null },
): string
```

### `@quagga/core` — `medical-access.ts`
```ts
export function isOrgStaffRole(role: MembershipRole | null | undefined): boolean
export interface MedicalAccessContext {
  isSelf: boolean;
  actorOrgRole: MembershipRole | null;
  actorOrgPersonalInformation?: boolean;
  actorLeadCampIds: readonly string[];
  subjectCampIds: readonly string[];
}
export function canViewMedicalNotes(ctx: MedicalAccessContext): boolean
export type MedicalAccessBasis = "self" | "org_staff" | "camp_lead";
export function medicalAccessBasis(ctx: MedicalAccessContext): MedicalAccessBasis | null
export const MEDICAL_VIEW_AUDIT_ACTION = "bio.medical.view";
```

### `@quagga/core` — `word-count.ts` / `name-dedupe.ts` / `camp-categories.ts`
```ts
export function countWords(input: string | null | undefined): number
export function isWithinWordLimit(input: string | null | undefined, limit: number = CAMP_DESCRIPTION_WORD_LIMIT): boolean
export function wordsRemaining(input: string | null | undefined, limit: number = CAMP_DESCRIPTION_WORD_LIMIT): number

export function normalizeName(input: string): string
export function isExactNormalizedMatch(a: string, b: string): boolean
export function trigramSimilarity(a: string, b: string): number
export function isSimilarName(a: string, b: string, threshold: number = SIMILARITY_WARN_THRESHOLD): boolean

export function matchesCategoryFilter(entry: CategorizedEntry, categoryId: string | null | undefined): boolean
```

### `@quagga/types` — `bio.ts`
```ts
export const VOLUNTEER_PORTFOLIOS: readonly { key: string; label: string }[]
export function isVolunteerPortfolioKey(key: string): boolean
export function volunteerPortfolioLabel(key: string): string
export const CampHistoryEntry: z.ZodEffects<...>   // kind/groupId/label/event/years + cross-field refine
export const BioExtrasInput: z.ZodObject<...>
```

### `apps/web/lib/bio-store.ts`
```ts
export interface BioView {
  fields: BurnerBioFields; extras: BioExtras; username: string | null;
  responses: QuestionnaireResponses; privacyFlags: Record<string, boolean>;
  completedAt: Date | null; cryptoConfigured: boolean;
}
export async function getBio(userId: string, editionId: string): Promise<BioView | null>
export async function getUsername(userId: string): Promise<string | null>
export async function isUsernameAvailable(userId: string, candidate: string): Promise<boolean>
export type SaveBioResult = { ok: true } | { ok: false; errors: Record<string, string> };
export async function saveBio(input: {
  userId: string; editionId: string; rawResponses: unknown;
  rawPrivacyFlags?: Record<string, boolean>; rawExtras?: unknown; final: boolean;
}): Promise<SaveBioResult>
export async function savePrivacyFlags(userId: string, editionId: string, rawPrivacyFlags: Record<string, boolean>): Promise<void>
export async function ensureProfileKeypair(userId: string): Promise<void>
export async function getKeyFingerprint(userId: string): Promise<string | null>
```

### `apps/web/lib/groups-store.ts` (this unit's slice)
```ts
export interface DirectoryCategory { id: string; label: string; emoji: string | null }
export interface DirectoryEntry {
  id: string; name: string; slug: string; kind: GroupKind;
  description: string | null; joinability: Joinability; registered: boolean;
  memberCount: number; viewerRole: MembershipRole | null; categories: DirectoryCategory[];
}
export async function listCampCategories(editionId: string): Promise<DirectoryCategory[]>
export function slugify(name: string): string
export async function listDirectory(input: { editionId: string; viewerId: string | null; search?: string }): Promise<DirectoryEntry[]>
export interface CampSearchResult { id: string; name: string; slug: string; kind: GroupKind; registered: boolean }
export async function searchCampDirectory(query: string, editionId: string, viewerId: string | null): Promise<CampSearchResult[]>
export interface CampHistoryDisplay { kind: "linked" | "text"; label: string; slug: string | null; registered: boolean; event: string | null; years: string | null }
export async function resolveCampHistoryDisplay(entries: CampHistoryEntry[], editionId: string): Promise<CampHistoryDisplay[]>
export interface BurnerCamp { name: string; slug: string; kind: GroupKind; role: MembershipRole }
export interface PublicBurnerProfile {
  userId: string; displayName: string; publicFields: PublicBioView;
  campHistory: CampHistoryDisplay[]; camps: BurnerCamp[];
}
export async function getPublicBurnerProfile(userId: string, editionId: string): Promise<PublicBurnerProfile | null>
```

### `apps/web/lib/medical-access.ts`
```ts
export async function resolveMedicalNotesForViewer(input: {
  viewerUserId: string; subjectUserId: string; editionId: string;
}): Promise<{ visible: boolean; notes: string | null; unreadable: boolean }>
```

### Server actions
```ts
// apps/web/app/(app)/profile/actions.ts
export async function updateBioAction(responses: unknown, privacyFlags: unknown, final: boolean, extras?: unknown): Promise<SaveResult>
export async function savePrivacyFlagsAction(flags: Record<string, boolean>): Promise<{ ok: boolean; error?: string }>

// apps/web/app/(app)/onboarding/actions.ts
export async function saveOnboardingBioAction(responses: unknown, privacyFlags: unknown, final: boolean, extras?: unknown): Promise<SaveResult>
export type UsernameCheck = { status: "available" } | { status: "taken"; message: string } | { status: "invalid"; message: string };
export async function checkUsernameAvailabilityAction(candidate: unknown): Promise<UsernameCheck>

// apps/web/lib/camp-search-action.ts
export async function searchCampsAction(query: unknown): Promise<CampSearchResult[]>
```

### `packages/db/src/crypto.ts`
```ts
export function encrypt(plaintext: string): string
export function decrypt(stored: string): string
export function decryptOrNull(stored: string | null | undefined): string | null
export type DecryptedField =
  | { state: "empty"; value: null }
  | { state: "ok"; value: string }
  | { state: "unreadable"; value: null };
export function decryptField(stored: string | null | undefined): DecryptedField
```
Algorithm: `aes-256-gcm`, `IV_LEN = 12`, `TAG_LEN = 16`, key = `scryptSync(PGCRYPTO_KEY, "quagga-pgcrypto-v1", 32)`, stored format `base64(iv ‖ tag ‖ ciphertext)`; key must be ≥ 16 chars (`crypto.ts:22-38`).

### `packages/ui` components
```ts
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "value"> {
  variant?: "default" | "privacy";
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  hardLocked?: boolean;
}
export interface FieldProps {
  label: React.ReactNode; htmlFor?: string; required?: boolean;
  help?: React.ReactNode; error?: React.ReactNode;
  privacyToggle?: React.ReactNode; children: React.ReactNode; className?: string;
}
export function Skeleton(props: React.HTMLAttributes<HTMLDivElement>)
export function SkeletonRegion(props: SkeletonProps & { label?: string })
export function SkeletonText({ lines = 3, className })
export function SkeletonHeading({ eyebrow = true, description = true, className })
export function SkeletonCard({ lines = 3, className })
export function SkeletonRow({ columns = 3, className })
export function SkeletonCardGrid({ cards = 6, lines = 2, className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" })
export function SkeletonField({ className })
export function SkeletonForm({ fields = 4, className })
```

---

## 6. UX behaviours

### `/directory` (`directory/page.tsx`)
- `export const dynamic = "force-dynamic"`.
- No DB configured → `<PreviewNotice feature="The camp directory" />` (the env-less-boot law).
- Signed-in viewer's pending blocking questionnaires render as a `<PendingQuestionnaires>` banner above the search bar (`:228`).
- GET `<form method="get">` search with a `Search` icon inset (`pl-9`), `aria-label="Search the directory"`, and an `sr-only` submit button (`:231-250`).
- "Create a camp" button sits beside the search field, `shrink-0`.
- Category chips: a horizontally scrolling row led by a `SlidersHorizontal` icon, "All camps" clears, active chip is `border-accent bg-accent/15 font-semibold text-accent` and carries `aria-pressed` (`:123-165`). Clicking the active chip toggles it off.
- Two sections: **Registered camps** ("Public this edition — anyone can find and request to join", with an `N camps` count) and **Your camps · members only** ("Free camps you're part of… stay hidden from the public directory").
- Empty state differentiates filtered ("No camps match your filters.") from empty ("No registered camps yet. Be the first — create one.") (`:264-269`).
- Card: name, optional kind eyebrow (only for `artwork` / `mutant_vehicle` — theme camps are the default so the line would be noise, `:31-36`), `Registered` (success) / `Free camp` (outline) badge, `line-clamp-3` description, category pills, then a footer with `Accepting members` (UserRoundCheck) / `Invite only` (Lock) — **only when registered** — plus member count and a `View camp` / `Open camp` affordance.

### `/burners/[id]` (public profile)
- Section order: **Hero → Medical (if authorised) → Medical-unreadable alert → About → Years attended → Skills → Camps → Volunteering → Rangers → PrivacyNote**.
- Hero: eyebrow `PUBLIC PROFILE` in `font-mono uppercase tracking-[0.3em] text-accent`; 64→72 px initials avatar; name as `<h1>`; meta line `MapPin city · N burns`; `burnsLabel` falls back to `"First AfrikaBurn"` when `firstTime === true` and no years are public (`profile-hero.tsx:27-32`).
- Own profile shows an "Edit your bio" outline button in the hero action slot (`burners/[id]/page.tsx:104-113`).
- `about` prefers the v3 `pf.about`, falling back to the legacy `pf.bio` (`:84`).
- Years render as outline badges, re-sorted ascending, `tabular-nums`.
- Medical copy differs for self vs. viewer: *"Only your camp leads and AfrikaBurn's safety team can see this."* vs *"Shared with you as a camp lead / AfrikaBurn safety staff. Never public, and this view is logged."* (`:126-130`).
- Unreadable-ciphertext panel is `role="alert"`, destructive-toned, and tells the viewer explicitly **not** to read it as "no medical notes" (`:138-157`).
- Camp rows: current memberships (Tent icon in accent, linked, role badge) then history entries (muted Tent, linked only when `registered`, `Self-reported` badge otherwise, meta `event · years` defaulting event to `"AfrikaBurn"`).

### `/profile` (own profile)
- Redirects to `/onboarding` when `!bio?.completedAt` (`:133`).
- `?edit=1` swaps the whole page for `<BioFlow mode="edit">` with a Cancel link (`:138-163`).
- `BioRow` renders label / value / **visibility badge**: `Public` (success), `Private` (secondary), or `Always private` (outline + Lock).
- Username row is hard-coded `visibility="public"` with an inline comment that a "private" badge there would be a lie (`:242-248`).
- Years-attended row falls back to the text "First AfrikaBurn" when the array is empty.
- Emergency contacts are summarised as `name · phone` via `contactSummary` and always badged `locked`.
- "Burns & volunteering" card has its own empty state ("Nothing added yet — use Edit to tell other burners who you are in the dust.").
- Security card shows the signing-key fingerprint or `"Generating on next save…"`.
- Account card shows email + `signInMethods`; page ends with a right-aligned `<SignOutButton/>` above a top border.
- Three independent reads (`getKeyFingerprint`, `listLinkedAccounts`, `resolveCampHistoryDisplay`) go out in one `Promise.all` with an explanatory comment (`:168-175`).

### `BioFlow` (`components/onboarding/bio-flow.tsx`)
- Steps: onboarding `["welcome","details","burns","privacy","done"]`; edit `["details","burns","privacy"]` (the bookends are dropped).
- Stepper: `Step N of M`, numbered circles that become a `Check` once passed, connector rules hidden below `md`.
- Primary button label is derived: `Get started` → `Save & continue` → (last input step) `Complete my bio` / `Save changes` → (done) `Go to the directory`, or **`Continue to your camp` when `redirectTo === INVITE_RESUME_PATH`** — an explicit honesty rule (`:255-264`).
- Onboarding-only secondary: `Save & finish later` → persists non-final, toasts *"Saved — you can pick up where you left off."*, routes to `/`.
- Details step is two cards: an open one (username, real name, home city, years) and a locked one titled **"Held privately — safety & logistics"** (phone, on-site contact, off-site contact, medical, ID).
- Every non-locked field carries a `<Switch variant="privacy">` in the `Field` label row; locked fields get `<Switch variant="privacy" hardLocked>` which force-renders OFF, disables, and shows an "ALWAYS PRIVATE" caps label with a lock glyph.
- Years grid: `attendedYearOptions()` newest-first, 2020/2021 rendered **disabled with a "no burn" sub-label** and `title="No burn was held this year"`.
- The ID-number input is deliberately **plain and visible, not masked** — with a 7-line rationale that you cannot proof-read what you cannot see and masking buys nothing when the value is already yours on your own screen (`:743-750`).
- Privacy step excludes four legacy keys the streamlined flow no longer collects: `bio`, `skills`, `firstTime`, `contactEmail` (`:113-121`).
- Username status line: `Checking…` / `That username is free — nice one.` (success-toned) / the error message; a failed probe **falls silent** rather than looking like a verdict (`:479-483`).

### `BurnsAndVolunteeringStep` (`components/questionnaire/burns-step.tsx`)
- About textarea with a live `N / 150 words` counter that turns `text-warning` and appends `" — a little long, but that's OK"` past the cap — a **soft** cap (`:81-89`).
- Camp-history editor: name input with a debounced (250 ms, ≥2 chars) absolute-positioned result list; picking a result adds a `linked` entry with a `Linked` chip; "Add as text" adds a `freetext` entry; both carry optional `event` (placeholder "AfrikaBurn") and free-form `years` ("Years (e.g. 2019, 2023)"); each entry has a `Remove <label>` X button.
- Volunteering: 15 pill `ToggleGroupItem`s plus a free-text "Something else?" input.
- Rangers: three hand-rolled `role="checkbox"` rows, plus links to the real Rangers Facebook page, `rangers@afrikaburn.com`, and a deliberately-inert "Green Dot handbook — info coming" span (`aria-disabled`, `cursor-not-allowed`).

### `PrivacyToggles` (`components/privacy-toggles.tsx`)
- One `<ul>` with dividers; per row, label (with a Lock glyph when locked) and a sub-line that is either the lock reason or `"Visible on your public profile."` / `"Only you and camps you join can see this."`.
- Non-locked control is a `<button role="switch" aria-checked aria-label="<label>: public|private">` styled `border-success/40 bg-success/15 text-success` when public; locked rows render an inert "Locked private" pill instead.

---

## 7. Validation + edge-case rules (digit-exact)

**Username**
- Trim first; `""` → error `"Enter a username, or leave the field blank."` (blank is an ERROR here; callers must treat empty as "no username" upstream).
- `< 3` → `"Usernames need at least 3 characters."`; `> 20` → `"Usernames can be at most 20 characters."`
- `!/^[a-z0-9_]+$/.test(lower)` → `"Usernames can only use letters, numbers and underscores."`
- `!/^[a-z]/.test(lower)` → `"Usernames must start with a letter."`
- `endsWith("_")` → `"Usernames can't end with an underscore."`
- `includes("__")` → `"Usernames can't contain two underscores in a row."`
- reserved → `"That username is reserved. Please pick a different one."`
- Taken (both pre-check and lost race) → `"That username is already taken. Try another."` (`bio-store.ts:207`).
- Availability action's Zod cap is `USERNAME_MAX_LENGTH * 10` = **200 chars**; over that → `{status:"invalid", message:"That username is too long."}` before any query (`onboarding/actions.ts:42`, `:73-75`).
- Error messages never dump a regex — asserted by `username.test.ts:174`.

**Attended years**
- Valid iff `Number.isInteger(year) && 2007 <= year <= 2026 && year ∉ {2020, 2021}`.
- `parseAttendedYears` accepts numbers or numeric strings, silently drops invalids, **de-duplicates via a Set, sorts ascending** (`bio.ts:414-423`).
- The questionnaire `years` validator requires `/^\d{4}$/` strings, errors `` `${s} isn't a valid AfrikaBurn year` ``, dedupes preserving first-seen order (`packages/types/src/questionnaire.ts:724-739`).
- `mapBioToResponses` converts back with `.map(String)`.

**Text limits (from the questionnaire definition)**
- `legalName` maxLength **120**; `homeCity` **80**; `bio` (long_text) **1500**; `onsite.name` / `offsite.name` **120**; `medicalNotes` **1000**; `id.number` **40**; `username` maxLength = `USERNAME_MAX_LENGTH` (20). Every question is `required: false` (`bio.ts:456-627`).
- `BioExtrasInput`: `about` ≤ **5000**, `campHistory` ≤ **50** entries, `volunteeringInterests` ≤ **30** items each ≤ **120** chars, `volunteeringOther` ≤ **200** (`packages/types/src/bio.ts:76-84`).
- `CampHistoryEntry`: `label` trimmed, 1–**120**; `event` trimmed ≤ **120**; `years` trimmed ≤ **60**; `groupId` must be a uuid; refine: *"Linked entries must reference a group; free-text entries must not."*
- Camp description: **60** words (`CAMP_DESCRIPTION_WORD_LIMIT`); about: **150** words soft.
- `countWords`: trims, splits on `/\s+/`, empty/whitespace → 0; punctuation does not split ("well-run" is one word).

**Name dedupe**
- `normalizeName`: `NFKD` → strip combining marks → lowercase → remove every `[^a-z0-9]`.
- Exact normalized match ⇒ **reject**; `trigramSimilarity >= 0.55` ⇒ **warn only**.
- `trigramSimilarity` reproduces pg_trgm: pad each word `"  word "`, slide a 3-char window, Jaccard over the trigram sets; two empty strings ⇒ 1; empty union ⇒ 0.

**Slug**
- `slugify`: NFKD, strip marks, lowercase, `[^a-z0-9]+` → `-`, trim leading/trailing `-`, **fallback `"camp"`** so a slug is never empty (`groups-store.ts:74-81`).

**Privacy flags**
- `defaultPrivacyFlags()` sets `locked ? false : defaultPublic` for all 19 keys.
- `initialPrivacyFlags(raw)` = `enforcePrivacyFlags({...defaults, ...(raw ?? {})})` — INSERT path only.
- `resolvePrivacyFlagsUpdate(undefined)` → `{}` (leave untouched); `resolvePrivacyFlagsUpdate({})` → a real write of the enforced defaults.
- `publicBioView` requires `privacyFlags[key] === true` — a missing key or a truthy non-`true` is private.

**Crypto / sensitive save**
- `isCryptoConfigured()` = `PGCRYPTO_KEY` present **and length ≥ 16**.
- `carriesSensitive = Boolean(fields.medicalNotes || (fields.idNumber && fields.idType))`; if true and no key → **throw** with the verbatim message at `bio-store.ts:300-305`.
- `encryptOrPreserve(incoming, stored)`: `safeEncrypt(incoming) ?? (decryptField(stored).state === "unreadable" ? stored : null)`.
- `getBio` prefers `saIdEncrypted` over `passportEncrypted` when a row somehow carries both (`bio-store.ts:71-77`; tested `bio-store-projection.test.ts:93`).

**Search / type-ahead**
- `searchCampDirectory` returns `[]` for `normalizeName(query).length < 2` **before issuing any query**; caps at 10; sorts by name.
- Camp-search server action Zod-caps the query at **120** chars and returns `[]` on parse failure.
- Directory `?cat=` is honoured only when the id exists in the edition's catalog.
- Org account search: `looksLikeId = /^[0-9a-f-]{8,}$/i`; result cap **50** ordered `desc(createdAt)`; org access roster cap **200** ordered `asc(createdAt)`.
- Medical audit log: lookback **30 days**, row cap **500** (`Math.min(options.limit ?? 500, 500)`), `truncated` reported.

**ID retention**
- Expiry = `new Date(\`${endDate}T23:59:59.999Z\`).getTime() + 30 * 86_400_000`; malformed dates → **never purge** (`isIdRetentionExpired` returns false on `NaN`); an edition present in bios but absent from the editions list is treated as UNKNOWN and left alone.

**Sanitization**
- `SANITIZED_BIO_NULL_FIELDS` (16): `displayName, legalName, homeCity, bio, about, contactEmail, phone, onsiteContactName, onsiteContactPhone, offsiteContactName, offsiteContactPhone, medicalNotes, saIdEncrypted, passportEncrypted` — plus the patch resets `skills: []`, `attendedYears: []`, `campHistory: null`, `volunteeringInterests: null`, ranger trio `null`, `firstTime: false`, `privacyFlags: {}`.
- `uncoveredHardLockedFields(patch)` maps privacy-flag keys → column names (`saId→saIdEncrypted`, `passport→passportEncrypted`, `medical→medicalNotes`, the rest identity) and returns whatever the patch fails to null — the guard that fires when a new always-private class is added without an erasure path.

---

## 8. Test coverage

**Pure core (`packages/core/src/__tests__`)**
- `bio.test.ts` (642 lines, 44 `it`s). Notable contracts asserted: the registry's locked set equals the always-private classes exactly; defaults are already compliant; a **tampered flag map cannot coax a locked field public**; `resolvePrivacyFlagsUpdate` returns an empty patch on omission but a real write on an explicit empty map; `publicBioView` **structurally omits** every always-private field from the returned shape *and* leaks no value even when every flag says public; missing flag ⇒ private; the questionnaire definition is self-consistent and accepts a filled response set; 2020/2021 rejection; round-trip mapping; unknown response keys are ignored rather than inventing a column; `isBioComplete` does **not** depend on a username; the 15 portfolios have unique keys; volunteering serialize⇄parse round-trips; the four `CampHistoryEntry` shape rules; the single `ranger` flag governs all three booleans.
- `username.test.ts` (224 lines) — shape, case handling (`Dusty` and `dusty` are the same handle), the reserved list (every entry lower-cased and unique), **error messages are for humans and never dump a regex**, and `publicMemberName`'s "REGRESSION: the placeholder can never look like an email".
- `privacy.test.ts` (108 lines) — the hard-lock, the medical class *not* being hard-locked, coercion, `privacyViolations`, and the officer-consent carve-out being the sole path that exposes a phone.
- `medical-access.test.ts` (205), `name-dedupe.test.ts` (48), `word-count.test.ts` (39), `account-sanitization.test.ts` (254).

**Server layer (`apps/web/lib/__tests__`)**
- `bio-store-projection.test.ts` (645 lines, 30 `it`s) — the full `idType` triad, SA-ID-over-passport preference, unreadable medical degrading to null (never ciphertext), stored flags merged OVER defaults, `cryptoConfigured` both ways; `saveBio` refusing an invalid/taken username **before writing anything**, mapping a lost 23505 race to the same "taken" outcome, rethrowing non-unique failures, clearing a handle, writing medical + SA ID as **ciphertext, never plaintext**, **refusing loudly rather than silently dropping** with no key, leaving v3 columns untouched when extras are omitted, degrading a stale camp-history link to free text while keeping the label, refreshing a valid link to the group's current name, stamping `completedAt` + clearing the required action only on final, and **not resetting privacy flags on a save that omits them**; `ensureProfileKeypair` minting nothing without a key.
- `bio-ciphertext-preservation.test.ts` (155) — two tests: unreadable ciphertext survives an unrelated edit; a **readable** value can still genuinely be cleared.
- `groups-store.test.ts` (826) — free camps invisible to strangers and visible to their own members with the role; registered-first sort; normalized-name filter; **no extra queries for a signed-out visitor**; `searchCampDirectory` short-circuits under 2 chars before issuing a query and caps at 10; `resolveCampHistoryDisplay` falls back to text for a vanished group and reports `registered:false` correctly; `getPublicBurnerProfile` **omits every hard-locked field whatever the flags say** and broadcasts only registered camps.
- `medical-access-resolver.test.ts` (308).

**Source-level regression tests (a pattern worth stealing outright)**
- `apps/org/lib/__tests__/roster-privacy.test.ts` (120) reads `lib/queries.ts` and `components/member-roster.tsx` **as text** and asserts: the roster select never mentions `medicalNotes`/`medical_notes`; there is no `hasMedical` flag; `RosterMemberRow` has no medical field; the DETAIL query still uses `decryptField` and **not** `decryptOrNull`; and — by comparing `indexOf("canViewMedicalNotes(")` with `indexOf("getRosterMemberDetail(")` — that **the page authorises before it fetches**. It even parses the parameter list correctly so an inline object type in the signature doesn't fool the brace matcher.

**E2E (`e2e/`, Playwright, no DB back doors)**
- `new-burner/privacy-projection.spec.ts` (123) — two real accounts; burner B fills a bio with unique sentinels in every hard-locked field and one default-public field flipped private; burner A (the lead of the camp B joined) opens B's profile via the **real roster link**; assertions read `page.content()` so they prove the value was never sent, not that CSS hid it. The medical sentinel is asserted **present** (A is the consented audience) while all others are asserted absent.
- `new-burner/burner-bio.spec.ts` (227) — bio completes and renders; per-field toggles flip; years grid offers real years and disables no-burn years; **hard-locked fields cannot be toggled public in the UI**; the bio completes with NO username and still releases the gate; malformed username gets a human message; a second burner cannot take a held username.
- `new-burner/directory-and-join.spec.ts` (82); `anon/burner-profile-privacy.spec.ts` (anon refused; hard-lock holds for a signed-in camp-mate even with every toggle public); `org-staff/medical-notes-access.spec.ts` (143 — the read lands in the access log); `camp-member/camp-member-cross-camp-isolation.spec.ts`.
- `e2e/specs/new-burner/support.ts` (120) carries a **selector-provenance comment block** naming the source file each selector came from and the date it was verified.

---

## 9. Dependency footprint

**Zero-dependency (pure TS + Zod only)** — `privacy.ts`, `username.ts`, `word-count.ts`, `name-dedupe.ts`, `camp-categories.ts`, `member-ref-code.ts`, `id-retention.ts`, `medical-access.ts` (imports only a `MembershipRole` *type*), `account-sanitization.ts`, `packages/types/src/bio.ts`.

**`bio.ts`** imports from `@quagga/types` (`isValidAttendedYear`, `isVolunteerPortfolioKey`, `CampHistoryEntry`, `Questionnaire`, `QuestionnaireResponses`) and from siblings `./privacy` and `./username`.

**`bio-store.ts`** — `drizzle-orm` (`and, eq, inArray, sql`), `@quagga/core`, `@quagga/types`, local `./db`, `./crypto-guard`, `./keys`, `./required-actions`. Carries `import "server-only"`.

**`groups-store.ts`** — `drizzle-orm` (`and, asc, eq, ne, sql, inArray`), 15 `@quagga/core` symbols, 5 `@quagga/types` types, `./db`. `server-only`.

**`medical-access.ts` (apps/web)** — `next/server` (`after`), `drizzle-orm`, and **7 org-permission symbols from `@quagga/core`** (`buildDomainOwnership`, `canReadPersonalInformationIn`, `orgRankFromRole`, `sanitizeOrgPermissions`, …). **This is the one coupling that must be cut for Camp 404** (§10).

**Crypto** — Node built-ins only (`node:crypto`: `createCipheriv`, `createDecipheriv`, `randomBytes`, `scryptSync`). No pgcrypto extension, no external package. Env: `PGCRYPTO_KEY` (≥16 chars). **Camp 404 already has `PGCRYPTO_KEY` and `packages/db/src/crypto.ts`** — but check whether it exposes a 3-state `decryptField`; the donor's three-state contract is the load-bearing part.

**UI components**
- `switch.tsx` — deliberately **no Radix** (native `<button role="switch">`), lucide `Lock` only. Camp 404 uses `@radix-ui/react-switch` with no variants → the privacy variant must be ported under a distinct name (e.g. `PrivacySwitch`).
- `field.tsx` — zero deps beyond `cn`.
- `skeleton.tsx` — zero deps beyond `cn`. **Fully drop-in.**
- `toggle-group.tsx` — needs `@radix-ui/react-toggle-group ^1.1.17` (donor-only; Camp 404 must install or substitute).
- `phone-input.tsx` — needs `react-phone-number-input ^3.4.17` + `libphonenumber-js ^1.13.9` (donor-only).

**Route pages** — `next/link`, `next/navigation` (`notFound`, `redirect`), `zod`, `lucide-react` icons (`ArrowRight, Lock, Search, SlidersHorizontal, UserRoundCheck, Users, Pencil, ShieldCheck, Stethoscope, MapPin, Tent, KeyRound, Check, Plus, X, Tags, Settings2, ChevronRight, AlertTriangle, Eye, EyeOff` — all verified present in Camp 404's installed lucide-react per the mechanical delta).

**Env vars touched by this unit**: `PGCRYPTO_KEY` only (plus whatever `isDatabaseConfigured()` reads).

---

## 10. AfrikaBurn / multi-tenant coupling

Rated per asset. The good news: **the pure core of this unit is almost entirely tenancy-free**.

### None — lift verbatim (modulo the `@quagga/` → `@camp404/` scope rename)
- `packages/core/src/privacy.ts` — no group, no edition, no org. The only AB-ism is the doc-comment narrative.
- `packages/core/src/username.ts` — one AB-ism: the `RESERVED_USERNAMES` list contains `afrikaburn`, `afrika_burn`, `quagga`, `quaggaportal`, `dmv`, `ranger(s)` and the donor's three apps' route segments. Swap the list contents for Camp 404's own route segments (`captains`, `questionnaires`, `family-tree`, `tools`, `setup`, `onboarding`, `notifications`, `mcp`, `api`, `auth`, `profile`, …) plus `camp404`. `DEPARTED_BURNER_NAME = "Departed Burner"` collides conceptually with Camp 404's existing `Lost Cat #N` stub (`camp-404:packages/db/src/account.ts`) — pick one, don't ship both.
- `packages/core/src/word-count.ts`, `name-dedupe.ts`, `member-ref-code.ts`, `id-retention.ts` — zero coupling.
- `packages/ui/src/components/skeleton.tsx`, `field.tsx` — zero coupling, zero deps.
- `packages/db/src/crypto.ts` — one constant to rename: `KEY_SALT = "quagga-pgcrypto-v1"`. **Changing this salt invalidates every existing ciphertext**, so if Camp 404 already has data encrypted under its own salt, keep Camp 404's.
- `apps/web/components/profile-public/profile-section.tsx`, `privacy-note.tsx` (copy names AfrikaBurn's safety team — rewrite the sentence), `profile-hero.tsx`.
- `apps/web/components/privacy-toggles.tsx` — takes `BioPrivacyField[]` + a flag map + an `onChange`; nothing else.

### Light — one dimension to strip
- **`packages/core/src/bio.ts`.** No group/tenant coupling at all. Two AB dimensions: (a) the *content* of the definition — 15 volunteer portfolios, 10 skill options, AfrikaBurn years 2007–2026 minus 2020/2021, "Tankwa", "the playa"; (b) `BURNER_BIO_VERSION` semantics. The **machinery** (registry → defaults → enforce → project) is generic. For Camp 404 the field set should be re-derived from `camp-404:packages/db/src/schema.ts` `burner_profiles` / `dietary_requirements` / `driver_profiles`, and `users.emergency_contacts` (jsonb, `schema.ts:279-282`) should become the hard-locked class — which is exactly WP5's safety-critical gap.
- **`packages/types/src/bio.ts`.** `CampHistoryEntry`'s `groupId` is the donor's group indirection; for Camp 404 the analogue is either dropped (single camp) or repointed at `team_memberships` / a free-text-only history. `BioExtrasInput` shape is otherwise generic.
- **`apps/web/lib/bio-store.ts`.** Coupled to `editionId` on every call (`(userId, editionId)` unique index) and to `groups` for camp-history link resolution. Collapse `editionId` to nothing (single camp, single "edition") and the group lookup to nothing or to teams. The **ciphertext-preservation logic, the refuse-don't-drop rule, the flags-ownership rule and the lost-race handling are all edition-independent** and are the real prize.
- **`apps/web/app/(app)/profile/**`, `burners/[id]/**`** — pass `edition.id` through; otherwise the pages are single-tenant already.
- **`apps/web/components/onboarding/bio-flow.tsx`** and **`burns-step.tsx`** — heavy AB copy and the `searchCamps` type-ahead (which is the group indirection). The *structure* (stepper, per-field privacy switch in the label row, debounced availability, save-and-finish-later, soft word counter, repeatable entry editor) is what to keep.

### Heavy — the org/participant split is baked in
- **`apps/web/lib/medical-access.ts`.** `buildMedicalAccessContext` reads `groups` where `kind = 'org'`, `memberships`, `org_role_assignments`, `org_roles`, `org_department_domains`, and resolves `canReadPersonalInformationIn(actor, "registrations")`. **All of that collapses in Camp 404** to: `isSelf`, `rank === "captain"`, or `isTeamLead(viewer, team)` ∩ subject's teams. The **pure predicate** `canViewMedicalNotes` survives if you drop `actorOrgRole` + `actorOrgPersonalInformation` and keep `isSelf` / `actorLeadCampIds` / `subjectCampIds` (rename to team ids). Note `MedicalAccessContext.actorOrgPersonalInformation` is optional (`medical-access.ts:93`), so a Camp 404 caller can simply never pass it and the org branch closes itself — `isOrgSafetyTier` then returns false unless `actorOrgRole === "god"`, which Camp 404 never sets.
- **`apps/web/lib/groups-store.ts`.** Everything is keyed on `group_id` + `edition_id` and on the `isRegistered(registrations)` predicate. `getPublicBurnerProfile` is the shape to copy but the *body* is a rewrite: Camp 404 has one camp, so "which camps does this person belong to" becomes "which teams", and "registered" has no analogue at all. `listDirectory` / `searchCampDirectory` are **camp directories and have no Camp 404 counterpart** — do not port them as a member directory (§11).
- **`apps/org/**` (accounts search, member roster, member detail, medical audit).** The `orgCan* / domain` layer is the second permission system that Camp 404 collapses. But three ideas port cleanly as *patterns*: resolve the visibility flag **before the select** so the column never enters the row; **narrow the search field with the caller's rank** so search cannot be a lookup oracle; and **withhold a whole panel rather than redacting it** when the row *list* is itself the disclosure.
- **`apps/web/app/(app)/account/**`** — depends on `@quagga/auth` / better-auth via `apps/web/lib/account.ts`. Out of scope per the brief; the *page structures* (one-writer-per-field, deletion consequence columns generated from the sanitization plan, blocked-project links) are provider-agnostic.

### Camp 404 collisions to watch
1. **`@radix-ui/react-switch` vs. the donor's native switch.** Donor call sites use `checked`/`onCheckedChange` which Camp 404's Radix switch also accepts — but `variant="privacy"` and `hardLocked` do not exist there. Port the donor switch as a new `PrivacySwitch` component rather than patching Camp 404's.
2. **`typedRoutes: true`** in `camp-404:apps/web/next.config.ts` will reject every donor `<Link href="/camps/…">` / `/burners/…` / `/directory` string until those routes exist.
3. **`import "server-only"`** — `camp-404:apps/web/vitest.config.ts` has no `server-only` alias stub (the donor's does), so `bio-store.ts`/`groups-store.ts`/`medical-access.ts` will throw the moment a Camp 404 vitest test imports them. Add the alias first.
4. **`after()` from `next/server`** is used for the audit write; confirm it is available/behaves in Camp 404's Next 16 setup before relying on fail-open auditing.
5. Donor `@quagga/db` exports only `"."`, `"./schema"`, `"./crypto"`; Camp 404's `packages/db` exports 24 domain entry points, so any ported query module needs its own `exports` entry.

---

## 11. The single most important framing correction

**The donor's `/directory` is a directory of CAMPS, not of PEOPLE.** There is no member/burner directory route anywhere in `apps/web` — `find apps/web/app -name page.tsx` returns 28 routes and none of them lists burners. The only ways to reach a person are:

1. the **camp roster** on `/camps/[slug]` (`apps/web/components/camp-members.tsx:125-130` → `/burners/<userId>`),
2. the **org console's account search** (`apps/org/app/(console)/accounts/page.tsx`), which searches by email/username subject to the caller's rank, and
3. the **org console's camp roster** (`apps/org/components/member-roster.tsx` → `/registrations/[id]/members/[userId]`).

This is deliberate: a globally browsable list of burners would be a bulk-exposure surface, and the donor's entire privacy posture (medical is detail-view-only, the audit panel is withheld because a *list* is a census, the roster refuses even a has/has-not signpost) is organised around avoiding exactly that. **Camp 404's `/captains/camp-management` roster + `getPublicMemberProfileAction` is already the same shape.** What Camp 404 lacks is the *field-level* privacy model beneath it, not a directory page.

So the harvest for "member directory" is: **the roster→detail navigation pattern, the two-shape server projection, and the search-visibility rules** — not a `/directory` page.

---

## 12. Verbatim code excerpts — the five most valuable pieces

### 12.1 The privacy law (`packages/core/src/privacy.ts:39-127`)
```ts
export const HARD_LOCKED_PRIVATE_FIELDS = [
  "saId",
  "passport",
  "phone",
  "onsiteContactName",
  "onsiteContactPhone",
  "offsiteContactName",
  "offsiteContactPhone",
] as const;

export const SAFETY_VISIBLE_FIELDS = ["medical"] as const;

export const ALWAYS_PRIVATE_FIELDS = [
  ...HARD_LOCKED_PRIVATE_FIELDS,
  ...SAFETY_VISIBLE_FIELDS,
] as const;

/** True when a field is allowed to be made public at all. */
export function canBePublic(field: string): boolean {
  return !isAlwaysPrivate(field);
}

/**
 * Coerce a privacy-flags map to a safe state: every always-private field (both
 * classes) is forced to `false` (private) regardless of what the caller
 * supplied. This is the last line before persistence — call it on every write of
 * `privacy_flags`. Safety-visible fields are forced private too: their audience
 * is decided at read time by the authz predicate, never by a stored "public" flag.
 */
export function enforcePrivacyFlags(
  flags: Record<string, boolean>,
): Record<string, boolean> {
  const safe: Record<string, boolean> = { ...flags };
  for (const field of ALWAYS_PRIVATE_FIELDS) {
    safe[field] = false;
  }
  return safe;
}

/**
 * Return the always-private fields a caller illegally tried to set public. Empty
 * array ⇒ the input is already compliant. Use for a loud error at the boundary
 * before `enforcePrivacyFlags` silently corrects it.
 */
export function privacyViolations(
  flags: Record<string, boolean>,
): AlwaysPrivateField[] {
  return ALWAYS_PRIVATE_FIELDS.filter((field) => flags[field] === true);
}
```

### 12.2 The public projection, and the registry that cannot drift from the law (`packages/core/src/bio.ts:278-390`)
```ts
].map((f) => ({ ...f, locked: ALWAYS_PRIVATE.has(f.key) || f.locked }));

export function defaultPrivacyFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const field of BIO_PRIVACY_FIELDS) {
    flags[field.key] = field.locked ? false : field.defaultPublic;
  }
  return flags;
}

/**
 * The privacy-flags patch for an UPDATE to an existing bio. Privacy flags are
 * owned by the dedicated privacy editor — a plain bio-text save (which omits
 * `rawPrivacyFlags`) must NOT touch them, or a user's deliberate private→public
 * choices silently reset to defaults, re-exposing default-public fields they had
 * marked private. Returns an EMPTY patch to leave the stored flags untouched, or
 * the enforced flags when the caller explicitly supplies them. Spread the result
 * into the update `set`.
 */
export function resolvePrivacyFlagsUpdate(
  rawPrivacyFlags: Record<string, boolean> | undefined,
): { privacyFlags: Record<string, boolean> } | Record<string, never> {
  if (rawPrivacyFlags === undefined) return {};
  return { privacyFlags: initialPrivacyFlags(rawPrivacyFlags) };
}

/**
 * Build the public, third-party-facing view of a bio. A field appears only when
 * BOTH its privacy flag is explicitly `true` AND it is allowed to be public at
 * all (`canBePublic`). The `canBePublic` guard is the last line of defence: even
 * if `privacyFlags` is corrupted to claim a hard-locked field public, this
 * function will not leak it. Pass the FULL bio so the caller cannot accidentally
 * bypass the lock by pre-selecting fields — the gate lives here.
 */
export function publicBioView(
  fields: BurnerBioFields,
  privacyFlags: Record<string, boolean>,
  extras: BioExtras = emptyBioExtras(),
): PublicBioView {
  const show = (key: string): boolean =>
    canBePublic(key) && privacyFlags[key] === true;

  // The three ranger flags share one privacy toggle ("ranger").
  const showRanger = show("ranger");

  return {
    legalName: show("legalName") ? fields.legalName : null,
    homeCity: show("homeCity") ? fields.homeCity : null,
    bio: show("bio") ? fields.bio : null,
    skills: show("skills") ? fields.skills : [],
    attendedYears: show("attendedYears") ? fields.attendedYears : [],
    firstTime: show("firstTime") ? fields.firstTime : null,
    contactEmail: show("contactEmail") ? fields.contactEmail : null,
    about: show("about") ? extras.about : null,
    campHistory: show("campHistory") ? extras.campHistory : [],
    volunteeringInterests: show("volunteeringInterests")
      ? extras.volunteeringInterests
      : [],
    volunteeringOther: show("volunteeringInterests")
      ? extras.volunteeringOther
      : null,
    rangerTraining: showRanger ? extras.rangerTraining : false,
    rangerCurious: showRanger ? extras.rangerCurious : false,
    greenDotTraining: showRanger ? extras.greenDotTraining : false,
  };
}
```

### 12.3 Refuse-don't-drop, and never destroy ciphertext you merely could not read (`apps/web/lib/bio-store.ts:287-367`)
```ts
  // REFUSE, DON'T DROP. Medical notes and ID documents are SPECIAL personal
  // information (POPIA s26/27) and must never fall back to plaintext — but
  // silently discarding them while the form reports "Saved" is worse than
  // either storing or refusing them. A burner who typed an allergy and saw a
  // success message is entitled to believe a medic can read it back.
  //
  // So: with no PGCRYPTO_KEY, a save that CARRIES sensitive values fails loudly.
  // A save that carries none is unaffected, so the rest of the bio still works
  // on a deployment without the key.
  const carriesSensitive = Boolean(
    fields.medicalNotes || (fields.idNumber && fields.idType),
  );
  if (carriesSensitive && !isCryptoConfigured()) {
    throw new Error(
      "This site can't store medical notes or ID documents right now — its " +
        "encryption key isn't configured. Nothing was saved. Tell an organiser " +
        "(PGCRYPTO_KEY is missing); the rest of your bio will save once you " +
        "clear those fields.",
    );
  }

  // NEVER DESTROY CIPHERTEXT WE MERELY COULD NOT READ.
  //
  // `getBio` populates this form through `decryptOrNull`, which yields null both
  // when a field is genuinely empty AND when the stored ciphertext cannot be
  // decrypted (wrong or rotated PGCRYPTO_KEY, or a pre-encryption row). So a
  // burner whose medical notes were written under a different key opens their
  // profile, sees an empty medical box, changes their home city, saves — and the
  // save wrote null over ciphertext nobody could read but which was still the
  // only copy. Irreversible loss of the exact field a medic needs.
  //
  // The distinction that makes this safe: an empty incoming value is a
  // DELIBERATE CLEAR only when the form actually showed the old value. If the
  // stored value was unreadable, the form showed nothing, so "empty" carries no
  // intent and the ciphertext is preserved untouched. A readable value cleared
  // to empty still clears, as it must.
  const [priorRow] = await db()
    .select({
      medicalNotes: schema.burnerBios.medicalNotes,
      saIdEncrypted: schema.burnerBios.saIdEncrypted,
      passportEncrypted: schema.burnerBios.passportEncrypted,
    })
    .from(schema.burnerBios)
    .where(
      and(
        eq(schema.burnerBios.userId, input.userId),
        eq(schema.burnerBios.editionId, input.editionId),
      ),
    )
    .limit(1);

  /** Encrypt the incoming value, or keep unreadable stored ciphertext intact. */
  function encryptOrPreserve(
    incoming: string | null,
    stored: string | null | undefined,
  ): string | null {
    const next = safeEncrypt(incoming);
    if (next !== null) return next;
    return decryptField(stored).state === "unreadable"
      ? (stored ?? null)
      : null;
  }
```

### 12.4 The public-profile query — the privacy boundary is the SELECT (`apps/web/lib/groups-store.ts:648-700`)
```ts
  // Non-sensitive bio columns only — never select phone / emergency / medical /
  // encrypted ID here; publicBioView additionally gates on the privacy flags.
  const bioRows = await db()
    .select({
      legalName: schema.burnerBios.legalName,
      homeCity: schema.burnerBios.homeCity,
      bio: schema.burnerBios.bio,
      skills: schema.burnerBios.skills,
      attendedYears: schema.burnerBios.attendedYears,
      firstTime: schema.burnerBios.firstTime,
      contactEmail: schema.burnerBios.contactEmail,
      about: schema.burnerBios.about,
      campHistory: schema.burnerBios.campHistory,
      volunteeringInterests: schema.burnerBios.volunteeringInterests,
      rangerTraining: schema.burnerBios.rangerTraining,
      rangerCurious: schema.burnerBios.rangerCurious,
      greenDotTraining: schema.burnerBios.greenDotTraining,
      privacyFlags: schema.burnerBios.privacyFlags,
    })
    /* … */
  const fields: BurnerBioFields = {
    /* … */
    // Hard-locked fields are never fetched — publicBioView never reads them.
    phone: null,
    onsiteContactName: null,
    onsiteContactPhone: null,
    offsiteContactName: null,
    offsiteContactPhone: null,
    medicalNotes: null,
    idType: null,
    idNumber: null,
  };
  const flags = { ...defaultPrivacyFlags(), ...(bioRow?.privacyFlags ?? {}) };
```
…and the display name that can never be an email:
```ts
  return {
    userId,
    displayName: publicMemberName(userRow.username, {
      sanitizedAt: userRow.sanitizedAt,
    }),
    publicFields,
    campHistory,
    camps,
  };
```

### 12.5 The audited, fail-open, detail-view-only medical disclosure (`apps/web/lib/medical-access.ts:37-96`)
```ts
export async function resolveMedicalNotesForViewer(input: {
  viewerUserId: string;
  subjectUserId: string;
  editionId: string;
}): Promise<{ visible: boolean; notes: string | null; unreadable: boolean }> {
  const { viewerUserId, subjectUserId, editionId } = input;
  const isSelf = viewerUserId === subjectUserId;

  const ctx = await buildMedicalAccessContext(viewerUserId, subjectUserId);
  if (!canViewMedicalNotes(ctx))
    return { visible: false, notes: null, unreadable: false };

  const [bio] = await db()
    .select({ medicalNotes: schema.burnerBios.medicalNotes })
    /* … */
  // Three-state, not two: ciphertext we cannot decrypt must not present as
  // "this burner recorded nothing".
  const decrypted = bio ? decryptField(bio.medicalNotes) : null;
  const notes = decrypted?.value ?? null;
  const unreadable = decrypted?.state === "unreadable";

  // Audit only an actual disclosure of someone ELSE's notes: reading your own
  // data is not an access event, and an empty field discloses nothing. Written
  // after the response so a slow/failed audit never degrades the read.
  //
  // This FAILS OPEN — the notes are already streamed before the insert is
  // attempted, and the error is swallowed below. That is the right trade for an
  // emergency read: nobody should wait on a log row to find out someone is
  // diabetic. No rate limit gates this path either, for the same reason.
  if (!isSelf && notes) {
    const basis = medicalAccessBasis(ctx);
    after(async () => {
      try {
        await db().insert(schema.auditEvents).values({
          actorId: viewerUserId,
          action: MEDICAL_VIEW_AUDIT_ACTION,
          subject: subjectUserId,
          meta: { basis },
        });
      } catch (err) {
        console.error("[medical-access] audit write failed", err);
      }
    });
  }

  return { visible: true, notes, unreadable };
}
```

### 12.6 (bonus) The enumeration-sane availability probe (`apps/web/app/(app)/onboarding/actions.ts:49-84`)
```ts
/**
 * Is a candidate username free? A server action is a PUBLIC HTTP endpoint, so:
 *
 *  - AUTHORISED: signed-in burners only (`requireCampUser` redirects otherwise).
 *  - ZOD-VALIDATED at the boundary, then the SAME `validateUsername` the save
 *    path runs — one rule set, so the check can never say yes to something the
 *    save would reject.
 *  - RATE-LIMIT-FRIENDLY: one indexed equality lookup on `lower(username)`, no
 *    joins, no writes, no email, nothing to fan out.
 *  - ENUMERATION-SANE: revealing that a handle is TAKEN is inherent to unique
 *    handles — you cannot let someone pick one without telling them. Revealing
 *    WHO holds it is not, so nothing about the holder is returned or hinted at,
 *    and an invalid candidate is never silently reported as "taken" (which would
 *    otherwise leak the reserved list as if it were real accounts).
 */
export async function checkUsernameAvailabilityAction(
  candidate: unknown,
): Promise<UsernameCheck> {
  const user = await requireCampUser();

  const parsed = UsernameCandidate.safeParse(candidate);
  if (!parsed.success) {
    return { status: "invalid", message: "That username is too long." };
  }

  const checked = validateUsername(parsed.data);
  if (!checked.ok) return { status: "invalid", message: checked.error };

  const free = await isUsernameAvailable(user.id, checked.username);
  return free
    ? { status: "available" }
    : { status: "taken", message: "That username is already taken." };
}
```

---

## 13. Notable patterns worth stealing even if the code is not

1. **Enforce privacy in a pure module, project in a pure function, and make the UI a mirror.** The lock is `canBePublic` + `enforcePrivacyFlags`; the toggle is disabled *because* the registry says locked, and the registry's `locked` is *derived* from the law. Three layers, one source of truth.
2. **Make the SELECT the boundary, not the JSX.** A column a refused caller must not see is never selected → never in the row → never in the RSC payload. `getRosterMemberDetail(…, { includeMedicalNotes })` takes the *authorisation decision as a parameter* so the caller must decide before the fetch, and a source-level test asserts the ordering.
3. **Withhold whole, don't redact,** when the *existence* of a row is itself the disclosure (the medical-access log is a census of who disclosed).
4. **Three-state decrypt on safety surfaces.** `empty | ok | unreadable`. Collapsing `unreadable` into `empty` produces a false all-clear.
5. **Never write null over ciphertext you could not read.** Emptiness is only intent when the form actually showed the old value.
6. **Refuse loudly rather than silently dropping** sensitive data when the key is missing — a "Saved" toast over a dropped allergy is worse than an error.
7. **A pre-check is a hint; the unique index is the guarantee** — and the lost-race path must return the *same* user-facing message so the two cannot be distinguished.
8. **One writer per field.** `/account` shows the username read-only and links to the bio editor.
9. **Loading skeletons copy the page's own container classes** so the swap is a fill, not a reflow; one `aria-live` region per boundary, bars `aria-hidden`, plus a `data-loading` hook the E2E suite asserts on.
10. **Source-level regression tests** (`roster-privacy.test.ts`) for guarantees that are properties of a query's projection or a component's JSX and therefore cannot be asserted by calling a `server-only` function.
11. **E2E privacy assertions read `page.content()`**, proving the value never crossed the wire rather than that CSS hid it, using unique per-run sentinels.
12. **Selector-provenance comments** in E2E helpers naming the source file and verification date for every selector.
13. **Consent at the point of entry** — one exported string (`MEDICAL_AUDIENCE_NOTE`) reused by the questionnaire definition, the form help text and the lock reason, so no surface can collect the data without naming its audience.
14. **Search fields narrow with rank** so search cannot become a lookup oracle for a column the caller may not read.
15. **Human error messages, one problem at a time** — never a regex, never the full rule list; asserted by a test.

---

## 14. Gotchas

- `isBioComplete` is marked **⚠ PROVISIONAL — RYAN HAS NOT RULED ON THE REPLACEMENT (27 Jul 2026)** in-source (`bio.ts:711-728`). It replaced `Boolean(displayName)`; the documented alternative anchor is the legal name.
- `burner_bios.displayName` is a **retired** column: nothing writes it, `saveBio` deliberately omits it from the write set so legacy values survive, and sanitization still nulls it. Do not port it.
- `packages/core/src/questionnaire-engine.ts:8-12` records that a `CODE_QUESTIONNAIRES` registry indirection **was built and removed** because nothing used it. Don't rebuild it for one questionnaire.
- `profile_keys` is generated but **used for nothing yet** (`schema.ts:697-700`, `build-spec.md:105`). The fingerprint on `/profile` is the only surface. Porting it buys Camp 404 nothing today.
- `id-retention.ts` is fully written and tested but **no job schedules it** — the donor's own technical-spec (`docs/technical-spec.md:437-438`) admits "the automatic deletion of expired ID documents is written but not scheduled". Camp 404 would inherit the same gap unless it wires a cron.
- The medical audit write is **fail-open with no rate limit**, deliberately. That is a documented trade, not an oversight — but it means the audit trail is the *only* control, so the reader (`medical-audit.ts`) is load-bearing, not optional.
- Donor comments have a documented track record of lying (`docs/simplification-audit.md:44-50`, eight findings). Everything above was read from the code, but re-verify any comment you rely on.
- `apps/web/lib/medical-access.ts` re-reads **every** `kind: 'org'` group rather than the first, with a 12-line comment explaining that picking one failed OPEN and granted medical access *through* an org group. That whole class of bug disappears in Camp 404 (no org group) — but the lesson (don't `.limit(1)` a set you are using as an exclusion filter) generalises.
- `packages/db/src/crypto.ts` `KEY_SALT = "quagga-pgcrypto-v1"` — changing it invalidates all existing ciphertext.
- The bio flow's `PRIVACY_REVIEW_EXCLUDE` silently hides four registry keys (`bio`, `skills`, `firstTime`, `contactEmail`) from the review step while their flags keep defaults. If Camp 404 ports the registry but not the exclusion, those four appear; if it ports the exclusion without the fields, it is dead config.
- `bio-flow.tsx` imports `INVITE_RESUME_PATH` from `@quagga/core` — a donor-only invite-resume concept; strip it or map it to Camp 404's own post-onboarding destination.
