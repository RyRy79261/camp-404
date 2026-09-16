# 23 — media-uploads-blob

**Headline:** Take the donor's generic `FileUpload` primitive + the per-`kind` token-policy route, because Camp 404 has exactly one uploader hardwired to the `avatars/<userId>/` prefix — and the questionnaire builder's `image` kind reuses it, so a questionnaire photo and a member's profile photo delete each other today.

**Camp 404 today:** One write path (`apps/web/app/api/uploads/avatar/route.ts` — multipart `put()`, `access:"private"`, `MAX_BYTES = 5*1024*1024`, per-user 20/min + per-IP 40/min, returns `/api/avatar?pathname=…` never a raw blob URL) and one read path (`apps/web/app/api/avatar/route.ts` — session + `isApproved` gate, prefix-scoped to `avatars/`, `Cache-Control: private…immutable` + `nosniff`), plus `apps/web/lib/avatar-blob.ts` `deleteAvatarBlobs()` — the only blob deletion in either repo. There is no `@vercel/blob/client`, no `handleUpload`, no `/api/blob*` route, no multi-file uploader, no progress UI, no URL-paste, no drag-and-drop and no per-`kind` policy map anywhere (repo-wide grep: zero hits).

Camp 404's safety posture is strictly **stronger** than the donor's on every axis that matters (private blobs, gated proxy, orphan cleanup, dual rate limits, client crop-resize). The donor's contribution is the **generic client primitive and the token-policy pattern**, nothing avatar-shaped — it has no avatar upload at all.

## Take these

| # | Item | Verdict | Rec | Value | Effort | Donor path | Camp 404 destination | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | Split `isE2ETestMode() \|\| !token` (honest degradation) | PARTIAL | ADAPT | high | S | `packages/ui/src/components/file-upload.tsx:391-396`; `apps/web/app/api/blob/upload/route.ts:63-71` | `apps/web/app/api/uploads/avatar/route.ts:76-80` | The route returns **200 with a fabricated URL** for a blob never written; the proxy 404s forever. A member is told the photo uploaded and gets a permanently broken image. |
| 2 | Fix the `avatars/` prefix collision | — (live bug) | — | high | S | `apps/org/app/api/blob/upload/route.ts:12-19` (the same incident, written up) | `apps/web/components/questionnaire/question.tsx:364-373` | The builder's `image` kind renders `AvatarUpload` with no `uploadUrl`, so it writes `avatars/<uid>/` and fires `deleteAvatarBlobs` — destroying the profile photo, and vice versa. |
| 3 | Per-`kind` client-upload token route | MISSING | ADAPT | high | M | `apps/web/app/api/blob/upload/route.ts:1-104` | `apps/web/app/api/blob/upload/route.ts` (new) | Type + size become a real server boundary baked into the issued token; `kind` prefixes the pathname, picks the policy, and names the clearance. Also bypasses the 4.5 MB serverless body cap. |
| 4 | `FileUpload` primitive + its 21-case test | MISSING | ADAPT | high | M | `packages/ui/src/components/file-upload.tsx:1-417`; `__tests__/file-upload.test.tsx:1-389` | `packages/ui/src/components/file-upload.tsx` | Camp 404 has no multi-file uploader, no progress, no drag-drop, no URL-paste, no cap. Component is tenancy-free (zero `groupId/orgId/supplierId` in all of `packages/ui/src`). |
| 5 | Reimbursement attachments have no upload path | MISSING | ADAPT | high | S once #3/#4 land | `apps/web/components/registration/layout-uploads.tsx:1-49` (wrapper shape) | `packages/types/src/reimbursement.ts:53-58`, a new claim form | `schema.ts:770-772` ships `receipt_blob_url` / `item_photo_blob_url` / `voice_memo_blob_url`, and the Zod **requires** one — but the only writer is MCP, and `z.string().url()` rejects the proxy path Camp 404 emits. |
| 6 | Builder `image_block` uploader | PARTIAL | ADAPT | high | S once #3/#4 land | `apps/org/components/questionnaires/block-editor.tsx:679-710` | `apps/web/app/captains/questionnaires/[key]/block-editor.tsx:373-392` | Today it is a bare `<InputField label="Image URL" placeholder="https://…">`. A captain must go host an image elsewhere — for a 30-person camp that means the feature is unused. |
| 7 | `file_link` question kind | MISSING | ADAPT | high | M | `apps/web/components/questionnaire/field.tsx:269-288`; `packages/types/src/questionnaire.ts:269-277` | `packages/types/src/questionnaire.ts`, `question.tsx`, `field-kinds.ts` | None of Camp 404's 14 kinds collects a document. A captain cannot ask for a PDF, a licence, a signed form or a receipt. |
| 8 | `BlobConfigProvider` / `useBlobConfigured` | MISSING | COPY | medium | S | `apps/org/components/questionnaires/block-editor.tsx:56-80` | `apps/web/app/captains/questionnaires/[key]/` | 23 lines of context defaulting to **false**, so an unwrapped consumer degrades to URL-paste. Camp 404's builder has the same depth (`builder-canvas` → `block-editor` → per-kind bodies). |
| 9 | Runner-side `blobConfigured` prop-threading | MISSING | COPY | medium | S | `apps/web/components/questionnaire/runner.tsx:84-86,107,452`; `fill.tsx:25,37-39,59` | `apps/web/components/questionnaire/` | The shallow counterpart to #8 and the half a member-facing upload needs first: `blobConfigured?: boolean` defaulted false, fed from a server component as `Boolean(process.env.BLOB_READ_WRITE_TOKEN)`. |
| 10 | Credential-marker redaction test | MISSING | COPY | medium | S | `apps/org/lib/__tests__/system-status.test.ts:18-24` | `apps/web/lib/__tests__/` | ~40 lines, zero donor coupling: seed every credential env var with one marker string, assert no marker survives into any rendered string. Camp 404 holds `PGCRYPTO_KEY`, `GOD_EMAILS`, `INVITE_CODES`, `CRON_SECRET`, a Firebase key. |
| 11 | Read-model swallow-vs-throw rule | MISSING | INSPIRE | medium | S | `apps/suppliers/lib/documents.ts:90-93, 112-118` | `apps/web/lib/camp-roster.ts`, `member-detail.ts` | Display loaders return EMPTY on throw so the page renders; a loader feeding a **diff/reconcile** must throw. Complements WP7 (#131) — 0 `loading.tsx` files across 24 force-dynamic pages, only two non-nested error boundaries. |
| 12 | Consequence-naming delete copy | — | INSPIRE | low | S | `apps/org/components/supplier-documents/documents-table.tsx:165-176` | any captain destructive action | "N acknowledgements will be discarded with it, and any step it completes re-opens" — name the consequence, not the object. Take the **text**, not the `window.confirm` (WP1/#125 is removing those). |

### #1 — the honest-degradation defect (verified by reading the code)

`apps/web/app/api/uploads/avatar/route.ts:76-80`:

```ts
if (isE2ETestMode() || !token) {
  return NextResponse.json({ url: avatarProxyUrl(`avatars/${user.id}/test-avatar.webp`) });
}
```

`packages/ui/src/components/avatar-upload.tsx:72-79` treats any `res.ok` as success and fires `onChange(data.url)`; the value is persisted to `users.profile_image_url`; `apps/web/app/api/avatar/route.ts:46-49` 404s forever under the identical condition. Two conditions are fused: `isE2ETestMode()` is a legitimate deterministic stub and should stay; `!token` in a real deployment is a misconfiguration and should answer **501** with the donor's sentence — *"File uploads aren't configured on this deployment — paste a link to an already-hosted file instead."* — while the client renders no dropzone at all. `apps/web/lib/avatar-blob.ts:23-24` has the twin: a missing token makes cleanup a silent no-op. The donor's test names the rule in one line: *"A dropzone here would accept a drop and silently discard it."*

### #2 — the prefix collision (verified end to end)

`question.tsx:364-373` renders `<AvatarUpload value={…} onChange={…} preprocessImage={cropResizeToSquare} />` with **no `uploadUrl`**, so it defaults to `/api/uploads/avatar` (`avatar-upload.tsx:38`). That route writes `avatars/${user.id}/avatar.{ext}` with `addRandomSuffix: true`, then calls `deleteAvatarBlobs(user.id, blob.pathname)`, which lists prefix `avatars/${userId}/` and `del()`s **everything but the new object** (`avatar-blob.ts:12, 26-39`). So a questionnaire `image` answer wipes the member's profile-photo blob while `users.profile_image_url` keeps pointing at the deleted pathname, and the next profile-photo upload wipes the questionnaire answer. Minimum fix without the full port: give the questionnaire kind its own prefix + its own route that does no prefix-wide cleanup. The proper fix is #3 — `kind` as the prefix discriminator, which is exactly the bug the donor's org route header records ("wrong in both directions, and invisible — the browser only ever showed *Upload failed*").

### #3 — the token policy, verbatim shape

```ts
const MB = 1024 * 1024;
const IMAGE_TYPES = ["image/png","image/jpeg","image/webp","image/gif"];
const DOC_TYPES = ["application/pdf", ...IMAGE_TYPES, "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
interface Policy { allowedContentTypes: string[]; maximumSizeInBytes: number }
const POLICIES: Record<string, Policy> = { /* one per kind */ };
const FALLBACK: Policy = { allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: 8 * MB };
// resolvePolicy() JSON.parses clientPayload in try/catch, never throws.
handleUpload({ body, request, onBeforeGenerateToken: async (_pathname, clientPayload) => {
  const user = await getAuthenticatedUser();          // identical helper exists at @/lib/auth
  if (!user) throw new Error("Sign in to upload.");
  const policy = resolvePolicy(clientPayload);
  return { ...policy, addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: user.id }) };
}});
```

Camp 404 kinds to define: `avatars` (IMAGE_TYPES, 5 MB, member), `questionnaire-images` (IMAGE_TYPES, 8 MB, **captain**), `receipts` (DOC_TYPES, 25 MB, member). Add what the donor lacks and Camp 404 already owns: `rateLimiter.limit` + `getClientIp` (`apps/web/lib/rate-limit.ts:81,84`) inside `onBeforeGenerateToken`, and a clearance check (`requireClearance` at `packages/core/src/access.ts:43` over a `deriveViewerRank` lookup — a lookup plus a comparison, not a line). Keep the donor's restrictive fallback and its 501 branch; for captain-only kinds take the org route's stricter stance instead — unknown kind ⇒ refuse ("That kind of upload isn't accepted here"), because a fallback "has no honest domain to authorise against".

### #4 — porting `FileUpload` (the real cost)

417 lines, 21 tests, zero domain coupling. Mechanical edits: rewrite the four self-referential `@quagga/ui/...` imports (`:13-16`) to relative (`../lib/utils`, `./button`, `./input`, `./toast`); retokenise `bg-ab-charcoal/70 text-ab-warmwhite` at `:236` (donor-only brand ramp, compiles to nothing in Camp 404) to `bg-background/70 text-foreground`; run `pnpm format` (packages/ui is mixed on semicolons). Camp 404 already has `toast` with `.error/.info/.dismiss` + `Toaster` (`toast.tsx:108,163`), all six lucide icons, `button`/`input`/`cn`, and jsdom already configured (`packages/ui/vitest.config.ts`) — badge/nav-card/switch already render there.

**Two real costs the digest understates.** (a) `packages/ui/package.json` has **no `@vercel/blob`** — it is only in `apps/web`. The port adds the first network dependency to a pure-presentational package; putting the component in `apps/web/components/` instead is a defensible alternative. (b) Private blobs: the client `upload()` accepts `access:"private"`, but `access` is **not** in the `onBeforeGenerateToken` return `Pick` (`client.d.ts:346`), so the server cannot force it — the browser chooses. In practice the residual risk is a signed-in member deliberately publishing their own file; for 30-80 vetted people that is worth naming, not blocking on. The mechanics work: `PutBlobResult.pathname` is returned for a private blob (`create-folder-DFjrvss1.d.ts:149-151`), so the component emits `pathname` and the caller builds `/api/blob?pathname=…`. That requires generalising `/api/avatar` (hardcoded to `avatars/`, single `isApproved` gate at `:31-34,41-43`) into a **per-prefix authorisation** proxy — a captain manual and a member avatar cannot share one gate. That generalisation, not the component, is the bulk of the work.

**Not in the digest:** Camp 404 already ships `packages/ui/src/components/progress-bar.tsx` with `role="progressbar"` + `aria-valuenow/min/max` (`:25-28`). Use it instead of the donor's inline progress markup at `:307-318`; the donor's progress assertions still pass unchanged.

## Already covered in Camp 404

- Private blob storage + session-gated proxy + `nosniff` + immutable private caching (`api/uploads/avatar/route.ts:84-89`, `api/avatar/route.ts:52-66`). **Strictly better than the donor**, which is `access:"public"` everywhere.
- Orphan cleanup (`apps/web/lib/avatar-blob.ts`) — the only `del()`/`list()` in either repo. The donor has none.
- Per-user + per-IP rate limiting on uploads. The donor has **zero** rate limiting on any upload path.
- Client-side normalisation (`apps/web/lib/image.ts` `cropResizeToSquare` → 512px WebP). The donor uploads raw files.
- `ImageBlock` schema is equivalent and arguably better placed: `questionnaire-builder.ts:73-82` + a publish-time alt reject at `:357`, vs the donor's schema-level `min(1)`.
- Plain `<img>` for author-supplied URLs, with the same reasoning independently reached (`content-block.tsx:63-65`).
- `BLOB_READ_WRITE_TOKEN` already declared in `turbo.json:11`. `@vercel/blob ^2.4.0` already installed in `apps/web`.
- `SegmentedControl` + `InputField` + Radix `Switch`/`Select` cover the donor's ToggleGroup/Field needs — no new Radix dependency.
- `@dnd-kit` with `DragOverlay` **and** `KeyboardSensor` already registered (`home/customize-mode.tsx:7-8`, `builder-canvas.tsx:222`).

## Deliberately skip

- **The whole supplier-documents engine** (`packages/core/src/supplier-documents.ts` + acks + reconciler + org CRUD + table, ~1,700 lines). Camp 404's `documents` table is a **markdown manual** table (`schema.ts:719-741`: no `url`, `source_type`, `required_ack`, `step_key`, `sort`) and there is no per-member checklist to bind to. This is a from-scratch build of a generic acknowledgement engine against AGENTS.md's "bespoke over generic" rule, for a camp of 30-80. Not worth it. If it ever is: `broadcast_presentation:'acknowledge'` (`schema.ts:195`) + `notification_deliveries.acknowledged_at` (`:932`) are the two halves already present, and the pure-logic decisions worth copying verbatim are the `sort → title.localeCompare(en,{sensitivity:"base"}) → id` tie-break, `allAcknowledged` vacuously true at 0 required, and reconciliation failing **silently** rather than failing the user's action.
- **`documents-table.tsx` / ResponsiveDataTable machinery.** Requires building a declare-columns-once desktop-table/mobile-cards layer that a camp document list does not justify. Its move-up/down argument is also moot here (see corrections).
- **The org token route's code** — `OrgDomain`, `requireOrgSession`, `orgCanInDomain`, `org_departments`/`org_roles`. Keep the idea, drop the layer.
- **`packages/core/src/id-retention.ts`.** Anchored on `editions.end_date`, a per-year axis Camp 404 has no equivalent of; picking an anchor is a product decision. It is also unscheduled in the donor itself.
- **`ImageGrid` / `PhotoGrid`** (`artwork-registration-form.tsx:117-262`, `vehicle-registration-form.tsx:119-264`) — two byte-identical 146-line hand-rolled uploaders the donor's own audit flagged and never fixed. Recorded only so nobody lifts the wrong uploader out of an `apps/` directory.
- **`QuestionOption.imageUrl` / image-grid choice display.** Camp 404 has no named `QuestionOption` — the shape is inlined anonymously five times (`questionnaire.ts:55,67,119,135,150`), so "two optional fields" is really five edits or an extraction first. Overlaps WP11 (#135)'s open `multi_select` card work.
- **`LayoutUploads`, `MAX_LAYOUT_UPLOADS`, `s4LayoutUploadUrls`.** AfrikaBurn registration nouns. Read the 49-line wrapper once as the intended consumer shape, then discard.
- **A `/system` status panel.** No surface exists; building one is the whole effort. Take only the marker test (#10).

## DB changes this unit implies

- **None for the core port** — that is the point: the stored value is always a URL string, so upload and paste are indistinguishable downstream. Camp 404 already stores blob URLs as plain `text` three times (`schema.ts:770-772`).
- `packages/types/src/reimbursement.ts:53-55` — `z.string().url()` must relax to accept a same-origin proxy path (`/api/blob?pathname=…`). It rejects the only URL shape Camp 404 can produce. Add a length cap while you are there; none of the three columns has one (donor's own caps disagree: 2000 vs 2048).
- If `file_link` lands: no column changes — the answer is a URL string in the existing answers payload.
- Only if the document catalog is ever built (skipped above): `documents` gains `url`, `source_type` enum (`file` | `link`), `required_ack bool default false`, `step_key text`, `sort int default 0`, plus an acks table keyed on a **composite PK** — that PK is what makes `onConflictDoNothing` idempotency work, and Camp 404's surrogate-uuid `notification_deliveries` cannot reuse the trick (use a conditional `UPDATE … WHERE acknowledged_at IS NULL` instead).

## Quick wins (effort S)

1. **Split the fused condition.** Edit `apps/web/app/api/uploads/avatar/route.ts:76-80` — keep `isE2ETestMode()` returning the deterministic stub URL; make bare `!token` return **501** with the donor's sentence. Same at `apps/web/lib/avatar-blob.ts:23-24` (log, don't silently return). Test: existing `apps/web/components/profile/__tests__/avatar-upload.test.tsx` (11 cases) plus one new case asserting a 501 body reaches the user.
2. **Stop the questionnaire `image` kind writing to the avatar prefix.** `apps/web/components/questionnaire/question.tsx:364-373` — pass an explicit `uploadUrl` to a route that writes a non-`avatars/` prefix and does not call `deleteAvatarBlobs`. Test: upload a questionnaire image, then confirm `users.profile_image_url`'s blob still resolves through `/api/avatar`.
3. **Copy `BlobConfigProvider`.** `apps/org/components/questionnaires/block-editor.tsx:56-80` → `apps/web/app/captains/questionnaires/[key]/blob-config.tsx`; rename `@quagga` → nothing (it has no imports). Keep the `createContext(false)` default. Test: a consumer rendered outside the provider reports not-configured.
4. **Copy the credential-marker test.** `apps/org/lib/__tests__/system-status.test.ts:18-24` → `apps/web/lib/__tests__/env-redaction.test.ts`; swap the marker string and the env list for `PGCRYPTO_KEY / GOD_EMAILS / INVITE_CODES / CRON_SECRET / BLOB_READ_WRITE_TOKEN / Firebase key`. Test: it fails when you deliberately interpolate one into a rendered string.
5. **Delete the lying comment.** `packages/ui/src/components/__tests__/toast.test.ts:5` says *"(node env — @camp404/ui's vitest has no DOM)"*. False since `packages/ui/vitest.config.ts` set `environment: "jsdom"`. It will send a porter building infra that already exists.
6. **Tighten the avatar MIME check.** `route.ts:65` accepts any `image/*`, which admits script-bearing `image/svg+xml`. Replace with the donor's explicit `new Set(["image/png","image/jpeg","image/webp","image/gif"])`. (It already fails closed on an empty type — keep that.)

## Corrections applied

- **`packages/ui` does not have `@vercel/blob`.** Only `apps/web` does. Verified against `packages/ui/package.json` (17 deps, none of them blob). The "zero-install, drop-in" framing is wrong; putting `FileUpload` in `apps/web/components/` avoids adding a network dep to a presentational package.
- **The server cannot force `access:"private"` on a client upload.** `access` is absent from the `onBeforeGenerateToken` return `Pick` (`client.d.ts:346`) — verified. Corrected further in the other direction: `PutBlobResult.pathname` *is* returned (`create-folder-DFjrvss1.d.ts:149-151`), so the private variant is mechanically fine; the residual exposure is a member choosing public for their own file, which is low-stakes here. The real work is generalising `/api/avatar` to per-prefix authorisation.
- **Do NOT add the donor's onboarding gate to `/api/uploads/avatar`.** The digest's item-4 point (1) claimed Camp 404 has "the exact hole the donor patched". It is the opposite: the avatar POST is deliberately reachable before approval because the uploader runs *inside* onboarding (`apps/web/lib/questionnaire.ts:119`, `avatar-upload.tsx:46-49`, and `design/feature-set/22-avatar-media.md` records the asymmetry as intentional). Applying `nextGate` as a 403 would lock members out of their own onboarding photo step. The gate idea belongs on a future non-onboarding kind (a receipt, a manual).
- **`moveTeam` is not the donor's two-write reorder.** `packages/db/src/camp-config.ts:138-152` is a pure function over one JSONB config that renormalises `order` to 0..n-1, applied as one `UPDATE` under `SELECT … FOR UPDATE`. There is no partial-failure window and no tie-break requirement, so the donor's ordering-safety argument is not "directly checkable against shipped code".
- **Camp 404 already has dnd keyboard accessibility.** `DragOverlay` at `customize-mode.tsx:7` and `KeyboardSensor` + `sortableKeyboardCoordinates` at both `customize-mode.tsx:8` and `builder-canvas.tsx:222`. Paired move-buttons are not "the cheapest answer to WP8's dnd finding" — whatever that finding is, it is not a missing sensor. Only the consequence-naming delete copy survives from that item.
- **The transaction blocker is not real.** `createHttpDb()` has no transactions, but shipped captain server actions already use the pooled driver for transactional work (`apps/web/app/captains/camp-settings/actions.ts:97-113` → `packages/db/src/camp-config.ts:187-209`, `db.transaction` + `FOR UPDATE`). AGENTS.md:84-88 says "multi-statement atomic work must use the pooled driver" — precedent, not an architectural decision.
- Cite fixes: `access:"public"` is `file-upload.tsx:**176**` not :181 (verified by reading). The test file is **21** cases not 22; Camp 404's avatar test is **11** not ~10. Camp 404 has **two** error boundaries (`error.tsx` + `global-error.tsx`), neither nested. The e2e-disabled note is AGENTS.md:181-182, POPIA is :184.
- **Not in the digest at all:** Camp 404 already ships `packages/ui/src/components/progress-bar.tsx` with the exact `role="progressbar"` + aria triple the donor hand-rolls. Use it in the port.
- **Not in the digest at all:** the duplicate-prelude anti-pattern the donor's `ImageGrid`/`PhotoGrid` warns about is already inside Camp 404 — `apps/web/app/api/voice/transcribe/route.ts:14-61` and `apps/web/app/api/uploads/avatar/route.ts:25-70` are the same 45-line auth→rate-limit→formData→type→size prelude twice, comment included, differing only in noun and limits. Factor it when #3 lands and you would otherwise write it a third time.

## Confidence notes

- Items 1, 2, 3, 4, 5, 6 spot-checked directly against both trees this session — high confidence. The prefix-collision bug (#2) and the fabricated-URL bug (#1) were reproduced by reading the full call chain, not inferred.
- Effort on #3 and #4 is **M each, and M is the floor**, because both are gated on generalising `/api/avatar` into a per-prefix proxy. Landing #3+#4 with `access:"public"` blobs would be quick and would regress Camp 404's posture — don't.
- #7 (`file_link`) and #11 (swallow-vs-throw) were not re-verified line-by-line this session; the digest marked both upheld at high confidence.
- The donor is not a safety reference for this unit: everything is public, nothing is ever deleted, nothing is rate-limited, and both blob token routes plus the legacy multipart route have **no unit test at all**. Take the shape, keep Camp 404's posture.
