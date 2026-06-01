# Verification — 04 onboarding-wizard

**Verdict:** minor-gaps  ·  checked 78 claims, verified 75.
The doc is highly reliable end-to-end: every server-action, wizard, schema, validator, and PII-split claim was confirmed digit-for-digit against source. The one real defect is a repeated off-by-one in the page count — the catalogue has **12** pages, not 13 — which would mislead a rebuild on the most user-visible string ("Step N of 12"). Everything else is cosmetic.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "the 13 pages", "renders **13 pages** total ('Step N of 13')", section header "The live 13 pages (in order)" | The catalogue has exactly **12** top-level pages: 11 `kind:"questions"` + 1 `kind:"intro"`. `ProgressBar total={questionnaire.pages.length}` therefore renders "Step N of 12". | questionnaire.ts:62-386 (page `kind:` lines at 64,80,133,151,169,175,193,213,234,284,329,352); wizard.tsx:187,274 |
| low | Footnote: "The two intros are pages 5; intro page count = 1 (`team_interests_intro`)." | Internally contradictory ("two intros" vs "count = 1") and the page-index is wrong: `team_interests_intro` is the 5th page only under the (wrong) 13-count framing. There is exactly **one** intro page; it sits at index 4 (5th of 12). | questionnaire.ts:168-172 |
| low | "Built from `COUNTRIES` … ~199 entries" (flagged low-confidence in doc) | `grep -c "value:"` = 199 in countries.ts; not hand-counted, but consistent with the doc's own caveat. | countries.ts (199 `value:` lines) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `idColumnsFor` default branch returns `{ passportEncrypted: value, saIdEncrypted: null }` for ANY non-`sa_id` type (including `null`/unknown) — doc says "default/unknown type → treated as passport", which is accurate, but the practical consequence (a `null` idType still writes the passport column) is worth noting since `splitIdNumber` can produce `idType:null` with a non-null `idNumber`. | id-documents.ts:43-50 |
| low | `getIdDocuments` real backend resolves type by which ciphertext column is non-null (passport wins ties), not by reading a stored `id.type`. Doc describes the merge but not that the round-tripped `id.type` is reconstructed from the column, not the original toggle value. | users.ts:399-407 |

## Spot-confirmed
- `export const dynamic = "force-dynamic"` at page.tsx:16; comment "Reads the Neon Auth session on every request." ✓
- Auth gate `getAuthenticatedUserOrRedirect()` page.tsx:19; redirects `/auth/sign-in` when null at auth.ts:40-42. ✓
- `ensureCampUser(authUser)` page.tsx:20; invite gate `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` page.tsx:21-23. ✓
- `hasCampAccess = isGodEmail(email) || !!user.inviteCode` at users.ts:219-224 (`isGodEmail` itself lives in access-control.ts:28 — doc's attribution of the `hasCampAccess` body to users.ts is correct). ✓
- Completion gate `if (profile?.completedAt) redirect("/")` page.tsx:26-28. ✓
- Pre-fill `getIdDocuments(campUser.id) ?? { idType:null, idNumber:null }` page.tsx:33-36; `mergeIdNumber(profile?.responses ?? {}, id)` page.tsx:37-40. ✓
- H1 "Build your burner profile" page.tsx:45; subtitle "A few questions so the camp knows who's arriving in the dust. Takes about two minutes." page.tsx:46-49. ✓
- Wizard mount with `firstStepSignOut`, NO `persistProgress`/`onComplete`/`submitLabel` page.tsx:51-56. Defaults: `persistProgress=true` (wizard.tsx:53), `submitLabel="Finish"` (wizard.tsx:55), `firstStepSignOut=false` default → true here. ✓
- Layout `mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8` page.tsx:43. ✓
- `"use server"` actions.ts:1; `saveBurnerProfile(rawResponses: unknown, final: boolean): Promise<SaveResult>` and `SaveResult` union actions.ts:17-29. ✓
- Action re-runs auth+invite gate actions.ts:30-34. ✓
- Final-only `validateResponses` + early return actions.ts:38-41. ✓
- Non-object coercion to `{}` actions.ts:43-46. ✓
- `splitIdNumber(responses)` actions.ts:52; removes `id.number`, retains `id.type` (id-documents.ts:19-26). ✓
- `upsertBurnerProfile({ userId, version: QUESTIONNAIRE.version, responses: cleaned, markComplete: final })` actions.ts:54-59. ✓
- `if (idNumber) await setIdDocuments(...)` runs on progress AND final actions.ts:65; real backend AES via `encrypt` (users.ts:393-398). ✓
- Photo mirror: reads `cleaned["profile.image"]`, string → `setProfileImage(id, image.length>0?image:null)` actions.ts:70-73. ✓
- Final-only `satisfyBurnerProfileAction` actions.ts:75-80; no-op under E2E (users.ts:204-208). ✓
- try/catch logs "saveBurnerProfile persistence failed", returns `_form` retry message actions.ts:85-92. ✓
- `if (final) redirect("/")` OUTSIDE catch, then `return { ok: true }` actions.ts:97-98. ✓
- Local state inits: pageIndex 0, responses=initialResponses, errors={}, isPending via useTransition wizard.tsx:58-62. ✓
- `page = questionnaire.pages[pageIndex]`, `isLast = pageIndex === pages.length-1`, `if (!page) return null` wizard.tsx:64-67. ✓
- `setResponse` merges value + clears that field's error wizard.tsx:69-77. ✓
- `<ProgressBar current={pageIndex+1} total={pages.length}/>` wizard.tsx:187; `Math.round((current/total)*100)` + "Step {current} of {total}" wizard.tsx:264,274. ✓
- Error banner `formError = errors["_form"] ?? errors["_root"]` wizard.tsx:176; `<p role="alert">` destructive wizard.tsx:189-196. ✓
- Footer: page-0+firstStepSignOut → `<a href="/auth/sign-out">Sign out</a>` else Back button disabled on page 0/pending wizard.tsx:239-254; submit labelled `submitLabel`/`nextLabel`, disabled while pending wizard.tsx:255-257. ✓
- `onSubmit` preventDefault → handleSubmit if isLast else handleNext wizard.tsx:179-184. ✓
- `handleNext`: validate local; `!persistProgress` advances locally; else `action(responses,false)` in transition, errors on `!ok`, advance `Math.min(i+1,last)` on ok, catch → `_form=SAVE_FAILED` wizard.tsx:103-124. ✓
- `handleBack`: `setPageIndex(Math.max(0,i-1))`, no save/validation wizard.tsx:126-128. ✓
- `handleSubmit`: validate, `action(responses,true)`, errors on `!ok`, `onComplete?.()` on ok, catch → `_form` wizard.tsx:130-147. ✓
- `validatePageLocally`: intro→true; missing = `undefined|null|""`; required→"This question is required"; id.number cross-field `validateIdNumber` only when non-empty string; returns true iff error map empty wizard.tsx:79-101. ✓
- `isSkippable`/`nextLabel="Skip"` for lone unanswered optional question wizard.tsx:160-172. ✓
- `isFullScreen`: intro OR single-question page whose sole kind is scale|long_text|image wizard.tsx:149-155. ✓
- `FORM_ERROR_KEY="_form"`, `ROOT_ERROR_KEY="_root"` wizard.tsx:21-22; SAVE_FAILED string matches actions.ts:89-91 verbatim wizard.tsx:23-24. ✓
- `QUESTIONNAIRE.version = "2026.05.29-v8"` questionnaire.ts:60. ✓
- Question kinds (10) discriminated union on `kind`: slider, single_select, multi_select, short_text, long_text, date, scale, toggle, combobox, image questionnaire.ts:137-148. ✓
- Per-kind Zod defaults: slider step 1/required true (7-18); single_select options min 2/required true (21-30); multi_select min 2/required false (33-43); short_text maxLength 120/required true (45-53); long_text maxLength 1000/required false (55-63); date required true (66-73); scale steps min 2/required true (78-89); toggle options min 2/required true (96-106); combobox options min 2/optional placeholders/required true (111-123); image required false (128-135). ✓
- Page kinds (2): QuestionsPage (id,title,opt subtitle,questions min 1) 153-159; IntroPage (id,heading,body) 165-171. ✓
- Response value union `number|string|string[]|boolean|null`; `Record<string,...>` questionnaire.ts:187-202. ✓
- 8 TEAMS values: kitchen, structures, power_and_lighting, sanitation_and_water, health_and_safety, art_and_activities, ministry_of_memes, ministry_of_vibes questionnaire.ts:30-39; team_interest slider min 0/max 5/step 1/minLabel "Not for me"/maxLabel "Sign me up"/optional questionnaire.ts:179-189. ✓
- All page-level catalogue content verified: profile_photo (image optional), about_you (birthday/phone maxLength 40/country combobox with placeholder "Pick your country…"+searchPlaceholder "Search countries…"/id.type toggle passport+sa_id/id.number short_text maxLength 40), bio (long_text maxLength 2000 required), burn_ideas (long_text maxLength 2000 optional), cooking_competency + hardware_competency scales (exact value→label pairs), leadership_logistics (multi_select + 3 single_selects with exact options), burn_history (camp404_years 2019/2022/2023/2024/2025/2026, afrikaburn_count, other_burns), burn_intent scale, dietary (dislikes/allergies/notes). questionnaire.ts:62-386. ✓
- DIETARY_INGREDIENTS 12 value→label pairs verbatim questionnaire.ts:44-57. ✓
- COUNTRY_OPTIONS built `${countryFlag(c.value)} ${c.label}`, stored value = ISO code questionnaire.ts:6-9 / countries.ts:18,30. ✓
- ID toggle values passport, sa_id questionnaire.ts:114-117; id.type stays in responses, id.number split out (id-documents.ts:7-26). ✓
- `validateIdNumber`: trim→"Document number is required"; passport `/^[A-Z0-9]{6,12}$/i` + "Letters and digits only — typically 6–12 characters."; sa_id `/^\d{13}$/` "Must be exactly 13 digits." → YYMMDD prefix (month 1-12, day 1-31) "First six digits aren't a valid YYMMDD date." → SA Luhn variant "Check digit doesn't match — double-check the number."; other type "Pick the ID document type first" id-validation.ts:22-102. ✓
- SA Luhn variant: odd positions (i%2===0) summed; even positions concatenated, ×2, digits summed; `(10-(total%10))%10` vs digit 13 id-validation.ts:82-102. ✓
- `validateResponses`: malformed → `_root: "Malformed response payload"`; skips intro; per-question `validateOne`; unknown keys dropped; per-kind rules incl. multi_select "Pick at least one option", date strict regex "Use yyyy-mm-dd"/"Not a real date", scale "Not a valid level", image "Expected an image URL" questionnaire.ts:324-436. ✓
- Server validator does NOT re-run `validateIdNumber` — id.number is plain short_text server-side (maxLength 40 enforced) — bypassable. Confirmed: no `validateIdNumber` import or SA-ID logic in packages/types. ✓
- `burner_profiles`: user_id uuid PK FK→users.id ON DELETE CASCADE; version text NOT NULL; responses jsonb `Record<string,unknown>` NOT NULL default `{}`; started_at/updated_at NOT NULL defaultNow; completed_at nullable schema.ts:352-364. ✓
- Upsert: completed_at = now when markComplete else `sql\`completed_at\`` (preserved); updated_at = now on conflict burner-profile.ts:148,156-158. ✓
- `users.profile_image_url` text nullable schema.ts:229; `passport_encrypted`/`sa_id_encrypted` text nullable schema.ts:241-242. ✓
- `idColumnsFor` sets matching column, NULLs the other; default/unknown → passport id-documents.ts:43-50. ✓
- required_actions seed: actionKey "burner_profile", type "questionnaire", title "Complete your burner profile", version QUESTIONNAIRE.version (seedBurnerProfileAction users.ts:192-200). ✓
- `satisfyRequiredAction` flips pending→completed only if status==="pending" and `meetsRequiredVersion(row.version, completedVersion)`; older version leaves gate open activations.ts:187-199; version `-vN` integer compare versions.ts:14-24. ✓
- `BurnerProfileSummary` shape `{ responses; completedAt: Date|null; updatedAt: Date|null; version: string|null }` users.ts:155-160. ✓
- `SplitId` shape `{ cleaned; idType: string|null; idNumber: string|null }` id-documents.ts:10-17. ✓
- `mergeIdNumber` returns responses unchanged when no idNumber; re-injects id.number (+id.type if present) otherwise id-documents.ts:28-38. ✓
- Backend dispatch routes real Drizzle vs in-memory testStore via `isE2ETestMode()` for every helper users.ts:300-460. ✓

## Low-confidence / could-not-verify
- Country count "~199" — `grep -c "value:"` returns 199 but not hand-counted; doc already self-flags this. (countries.ts)
- Pending-approval / Rejected downstream routing is explicitly deferred to unit 29 (gating spine) in the doc; this surface genuinely does not check `approval_status` (confirmed absent in page.tsx/actions.ts), so the doc's low-confidence note is correct — the downstream behavior itself was not verified here.
- `QuestionField` rendering / mic dictate (unit 20) and replay/edit flow (unit 12) are out of scope and not verified; the doc's cross-unit attributions for `diffResponses`/`displayResponseValue`/`flattenQuestions` as "used by unit 12, not here" match their presence-but-non-use in this unit's import graph (none imported by wizard.tsx/actions.ts/page.tsx).
- E2E test-store internals (`testStore.upsertProfile`, `getIdDocuments`, etc.) were not opened; the dispatch wiring in users.ts is confirmed but the in-memory store's exact field semantics were trusted.
