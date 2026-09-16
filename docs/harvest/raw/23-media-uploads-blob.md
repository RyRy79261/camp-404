# Unit 23 — File / media upload pipeline (Vercel Blob, documents, images)

**Donor:** `quagga-portal` / AfrikaBurn Contributors App
**Donor root:** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Target:** Camp 404 — `/home/ryan/repos/Personal/camp-404`
All paths below are **donor-relative** unless prefixed `camp-404/`.

---

## 1. Purpose

This subsystem is the donor's *single* answer to "a person needs to attach a file". There is exactly **one** client primitive (`packages/ui/src/components/file-upload.tsx`), **two** server endpoints for it (`apps/web/app/api/blob/upload/route.ts`, `apps/org/app/api/blob/upload/route.ts`), plus **one** legacy multipart endpoint kept alive for two forms (`apps/web/app/api/registration/upload/route.ts`). Everything else — registration layout sketches, artwork concept images, mutant-vehicle photos, supplier agreement PDFs, questionnaire image blocks, choice-option thumbnails, questionnaire `file_link` answers — routes through that one primitive.

Three design commitments run through the whole unit and are the reusable part:

1. **Type and size are a SERVER boundary, expressed as a policy on the issued upload token.** The browser never gets a token that would accept a file the server did not sanction. The client's own `validate()` exists only to explain a refusal to the person holding the file and to keep a 40 MB photo off a mobile connection at all (stated verbatim at `packages/ui/src/components/__tests__/file-upload.test.tsx:7-11`).
2. **Honest degradation.** With no `BLOB_READ_WRITE_TOKEN` on the deployment there is *no dropzone at all* — the component renders a URL-paste field plus a sentence saying why (`packages/ui/src/components/file-upload.tsx:391-396`), and the token endpoint answers `501` with the same sentence (`apps/web/app/api/blob/upload/route.ts:63-71`). This is the house rule "nothing in this product may claim something that isn't true" applied to uploads.
3. **The stored value is always a public URL string.** Blob-uploaded and hand-pasted files are indistinguishable downstream, so **no schema change was needed when uploads were added** — every consumer kept its existing `text` / `jsonb string[]` URL column (`packages/ui/src/components/file-upload.tsx:23-25`, `apps/web/components/registration/layout-uploads.tsx:9-10`).

**Direct diff against Camp 404 (headline).** Camp 404's avatar pipeline and the donor's file pipeline made *opposite* trade-offs and are complementary, not redundant:

| Axis | Donor (`quagga`) | Camp 404 (target) |
|---|---|---|
| Transport | Browser → Blob **client upload** with a scoped token (`@vercel/blob/client` `upload()` / `handleUpload()`); bypasses the 4.5 MB serverless body cap; real progress events | Server-side `put()` through `POST /api/uploads/avatar` (multipart), body-cap-bound |
| Blob access | `access: "public"` everywhere (`apps/web/app/api/registration/upload/route.ts:81`; client uploads pass `access: "public"` at `packages/ui/src/components/file-upload.tsx:176`) | `access: "private"` + same-origin proxy `/api/avatar?pathname=…` gated on a session (`camp-404/apps/web/app/api/uploads/avatar/route.ts:84`, `:106-108`) |
| Type enforcement | Server-enforced **on the token** (`allowedContentTypes`), per upload *kind* | Server-side `file.type.startsWith("image/")` check in the handler (`camp-404/.../uploads/avatar/route.ts:64`) |
| Size enforcement | Server-enforced **on the token** (`maximumSizeInBytes`), 8 MB images / 25 MB documents | `MAX_BYTES = 5 * 1024 * 1024` in the handler (`camp-404/.../uploads/avatar/route.ts:11`) |
| Rate limiting | **None anywhere** in the upload path | Per-user (20) **and** per-IP (40) via `rateLimiter.limit` (`camp-404/.../uploads/avatar/route.ts:31-51`) |
| Deletion / orphan cleanup | **None. Zero `del()` / `list()` calls exist in the entire donor repo** (verified: `@vercel/blob` root-package import appears at exactly one site, `apps/web/app/api/registration/upload/route.ts:2`, and it imports only `put`). Withdrawing a supplier document deletes the row and cascades the acks; the blob object is left forever. | `deleteAvatarBlobs(userId, keepPathname?)` paginates the member's prefix and `del()`s stale objects, called on re-upload and on anonymisation (`camp-404/apps/web/lib/avatar-blob.ts:18-40`) |
| Image normalisation | None — the raw file is uploaded as-is | Client-side centre-crop + downscale to ~512 px WebP before POST (`camp-404/apps/web/lib/image.ts` `cropResizeToSquare`) |
| Multi-file / drag-drop / progress | Yes — batch, cap, dropzone, `%` progress bar with `role="progressbar"` | No — single avatar, no dropzone, no progress |
| URL-paste fallback | Yes, first-class, tested, and the *only* path any e2e run exercises | No |
| Avatars | **The donor has no avatar upload at all** — `docs/component-spec.md:35` records the Avatar component as "initials fallback only (no upload in MVP)"; `packages/core/src/bio.ts:393` derives two-letter initials instead | Shipped (`camp-404/packages/ui/src/components/avatar-upload.tsx`) |

So the donor's contribution to Camp 404 is the **generic multi-file attachment primitive + the client-token policy pattern**, not anything avatar-shaped. Camp 404's contribution back would be private-blob + proxy + orphan cleanup + rate limiting, none of which the donor has.

---

## 2. File inventory (line counts verbatim from `wc -l`)

### Core of the unit

| File | Lines | Role |
|---|---:|---|
| `packages/ui/src/components/file-upload.tsx` | 417 | The one client attachment primitive. `FileUpload` + `FileUploadProps` + two helpers. |
| `packages/ui/src/components/__tests__/file-upload.test.tsx` | 389 | 22 `it(...)` cases across 5 `describe` blocks. The contract document for the component. |
| `apps/web/app/api/blob/upload/route.ts` | 104 | Participant-app client-upload token endpoint. Two policies + a restrictive fallback. |
| `apps/org/app/api/blob/upload/route.ts` | 127 | Org-console token endpoint. Two policies, each carrying an `OrgDomain`; **no fallback policy by design**. |
| `apps/web/app/api/registration/upload/route.ts` | 90 | Legacy multipart `put()` endpoint for the artwork + mutant-vehicle forms only. Exports `isBlobConfigured()`. |

### Consumers of `FileUpload` (5 call sites, 6 renders)

| File | Line of render | `kind` | variant / caps |
|---|---:|---|---|
| `apps/web/components/registration/layout-uploads.tsx` (49 lines) | `:35` | `registration-layouts` | `image`, `maxFiles={MAX_LAYOUT_UPLOADS}` (=4) |
| `apps/web/components/questionnaire/field.tsx` | `:273` | `questionnaire-files` | `file`, `maxFiles={1}`, `maxSizeBytes={25*1024*1024}` |
| `apps/org/components/supplier-documents/document-form.tsx` (316 lines) | `:202` | `supplier-documents` | `file`, `maxFiles={1}`, `maxSizeBytes={25*1024*1024}` |
| `apps/org/components/questionnaires/block-editor.tsx` | `:690` (`ImageBlockBody`) | `questionnaire-images` | `image`, `maxFiles={1}` |
| `apps/org/components/questionnaires/block-editor.tsx` | `:872` (choice-option thumbnail) | `questionnaire-images` | `image`, `maxFiles={1}` |

### Supplier-documents domain (the richest *product* built on uploads)

| File | Lines | Role |
|---|---:|---|
| `packages/core/src/supplier-documents.ts` | 299 | Pure domain logic: ordering, views, ack progress, binding validation, ack→step reconciliation. No I/O. |
| `packages/core/src/__tests__/supplier-documents.test.ts` | 371 | 31 `it(...)` across 6 `describe` blocks. |
| `apps/org/lib/actions/supplier-documents.ts` | 362 | Org CRUD server actions + `listSupplierDocuments` read model. |
| `apps/org/lib/supplier-step-reconcile.ts` | 187 | Whole-edition step reconcile, must run on the same `tx` as the document write. |
| `apps/org/components/supplier-documents/document-form.tsx` | 316 | Add/edit form: file-vs-link toggle group, uploader, ack switch, step-binding select. |
| `apps/org/components/supplier-documents/documents-table.tsx` | 418 | Responsive CRUD table: source chip, inline ack toggle, inline step select, move up/down, edit dialog, delete-with-consequence-warning. |
| `apps/org/components/supplier-documents/steps.ts` | 58 | `BINDABLE_STEPS`, `UNBOUND_VALUE`, `asStepKey`, `stepLabel` — the picker derived from the core catalog. |
| `apps/suppliers/lib/documents.ts` | 221 | Supplier-side read model. Never throws; returns an empty panel. |
| `apps/suppliers/lib/actions/documents.ts` | 166 | `setDocumentAcknowledgement` — transaction-scoped ack + reconcile + audit. |
| `apps/suppliers/components/documents-panel.tsx` | 185 | The supplier-facing Documents & links card, incl. the `?download=1` blob trick. |

### Copy-pasted uploader (the donor's own audit flags it)

| File | Lines | Role |
|---|---:|---|
| `apps/web/components/artworks/artwork-registration-form.tsx` | — (`ImageGrid` at `:117-262`) | A 146-line hand-rolled uploader that does **not** use `FileUpload`; posts multipart to `/api/registration/upload`. |
| `apps/web/components/vehicles/vehicle-registration-form.tsx` | — (`PhotoGrid` at `:119-264`) | Byte-identical to the above but for the function name and `"Add photo"` vs `"Add image"` (donor's own verifier: `docs/simplification-audit.md:566`). |

### Supporting / adjacent

| File | Lines | Role |
|---|---:|---|
| `apps/org/components/questionnaires/block-editor.tsx` `:58-80` | 23 | `BlobConfigContext` / `BlobConfigProvider` / `useBlobConfigured` — the "provide `blobConfigured` once at the tree root" pattern. |
| `apps/org/lib/system-status.ts` `:345-368` | 24 | `blobCheck()` — the `/system` panel's presence probe for `BLOB_READ_WRITE_TOKEN`. |
| `packages/core/src/id-retention.ts` | 121 | Adjacent-but-not-media: pure retention rule for encrypted SA-ID/passport columns. `ID_RETENTION_GRACE_DAYS = 30`. **Written but never scheduled** (`docs/technical-spec.md:437-438`). |
| `e2e/specs/camp-lead/layout-uploads.spec.ts` | 194 | The only e2e coverage; deliberately tests the URL-paste half. |
| `apps/web/vercel.json` | 9 | One cron: `/api/account/deletion-sweep` at `0 3 * * *`. **No upload/blob cron.** |

---

## 3. Capability list (exhaustive, each cited)

### `FileUpload` (client)
1. **Direct browser→Blob client upload** via `upload()` from `@vercel/blob/client`, bypassing the 4.5 MB serverless body cap (`file-upload.tsx:18-21`, call at `:175-181`).
2. **Per-file live progress**, `0–100`, rendered as a `role="progressbar"` with `aria-valuenow/min/max` (`:179-180`, `:307-318`).
3. **Batch progress labelling** — `"Uploading 2 of 4… 42%"` when more than one file is in flight, `"Uploading… 42%"` otherwise (`:168-169`, `:303-306`).
4. **Drag & drop** onto the label-as-dropzone, with a `dragging` highlight state (`:283-288`, `:198-204`).
5. **Click-to-pick** via an `sr-only` `<input type="file">` with `accept` and conditional `multiple` (`:336-348`); the input's value is reset after every change so re-picking the same file re-fires (`:346`).
6. **Two render variants**: `image` → thumbnail grid (`grid-cols-2 sm:grid-cols-4` when `maxFiles > 1`, else `grid-cols-1`; `aspect-square` vs `max-h-48`) (`:209-243`); `file` → filename chip list with an external link (`:244-276`).
7. **Filename display from URL**, percent-decoded, with a raw-string fallback for non-URL legacy values (`fileNameFromUrl`, `:409-417`).
8. **Per-item removal** with an accessible label — `"Remove upload {n}"` for images, `"Remove {filename}"` for files (`:235`, `:267`).
9. **Cap enforcement that hides the controls**, not merely disables them: `full = value.length >= maxFiles` gates the whole add block (`:104`, `:278`). The test comments the reason: "an add control that can never succeed is a lie" (`__tests__/file-upload.test.tsx:330`).
10. **"Only n more files fit here"** batch truncation notice, singular/plural correct (`:151-155`).
11. **URL-paste path** with `new URL()` validity check and duplicate rejection (`addUrl`, `:117-132`).
12. **`onCommit` deferred one macrotask** after `onChange` so a consumer's autosave reads the *new* value (`commit`, `:107-111`).
13. **Client-side pre-validation** of MIME and size with human-readable messages (`validate`, `:134-144`; `formatBytes`, `:403-407`).
14. **Filename sanitisation before it leaves the browser** — `replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80)` (`:172-174`).
15. **`kind` doubles as the blob pathname prefix and the server policy discriminator**, sent as `clientPayload: JSON.stringify({ kind })` (`:175-178`).
16. **Honest degradation** — `blobConfigured={false}` renders no file input at all, keeps the URL field even when `allowUrlPaste` is false, and states why (`:280`, `:352`, `:391-396`).
17. **Error surfacing that prefers the thrown message**, falling back to actionable advice (`:183-190`).
18. **`disabled` removes the remove buttons entirely** rather than greying them (`:231`, `:263`).
19. **`aria-busy` on the dropzone while active** (`:290`), `ariaLabel` prop for the dropzone (`:289`).
20. Deliberately uses a plain `<img>`, not `next/image`: uploader-supplied URLs "would need host allowlisting we deliberately don't configure" (`:221-223`).

### Server token endpoint — participant (`apps/web/app/api/blob/upload/route.ts`)
21. `runtime = "nodejs"` (`:14`).
22. **501 + a paste-a-link sentence when `BLOB_READ_WRITE_TOKEN` is absent** (`:63-71`).
23. **400 on unparseable JSON body** (`:73-78`).
24. **Authn inside `onBeforeGenerateToken`** — `getAuthenticatedUser()`, throws `"Sign in to upload."` (`:85-86`).
25. **Per-kind policy resolution from `clientPayload`**, with a `try/catch` that falls back rather than throwing on malformed JSON (`resolvePolicy`, `:52-60`).
26. **Restrictive fallback**: unknown kind ⇒ image policy, 8 MB — "rather than a permissive default" (`:34-35`, `:47-50`).
27. **`addRandomSuffix: true`** on every issued token (`:91`).
28. **`tokenPayload: JSON.stringify({ userId: user.id })`** (`:92`).
29. **No `onUploadCompleted`**, with the reason recorded: the client writes the returned URL into the form field, and Vercel cannot call back to localhost (`:95-97`).
30. Errors → `400` with the thrown message (`:100-103`).

### Server token endpoint — org (`apps/org/app/api/blob/upload/route.ts`)
31. **Every upload kind carries its own `OrgDomain`** so "may this account upload?" is answered *where* (`:36-56`). The header records the bug: every upload used to be authorised against `supplier_documents`, refusing questionnaire authors and admitting supplier-document roles to questionnaire images — "wrong in both directions, and invisible" (`:12-19`).
32. **No fallback policy at all** — `resolvePolicy` returns `null` and the route throws `"That kind of upload isn't accepted here."` (`:70-78`, `:104-106`). Rationale in the docstring: a fallback "has no honest domain to authorise against" (`:58-69`).
33. **Authorises `create` in that domain**, not merely "has a session": `requireOrgSession({ capability: "create", domain: policy.domain })` (`:110-113`).

### Legacy multipart endpoint (`apps/web/app/api/registration/upload/route.ts`)
34. Exports **`isBlobConfigured(): boolean`** (`:18-20`).
35. **Authn 401 + hard onboarding gate 403** — `getCurrentCampUser()` then `pendingBlockingRoute(user.id)`. The comment records that it previously accepted any authenticated identity, so a sanitised/deleted account could write public blobs at 8 MB a time; "a route handler must not redirect, so the gate is reported as a 403 the form can show" (`:22-39`).
36. **413 over 8 MB**, **415 on a type outside the allowlist**, **400 with no file part** (`:53-73`).
37. **A part with an *empty* Content-Type fails the allowlist rather than skipping it** — the old `file.type && !ALLOWED.has(file.type)` let any hand-written multipart part through to a public blob URL (`:62-73`).
38. **Filename sanitisation + timestamp prefix**: `` `registration-layouts/${Date.now()}-${safeName}` ``, `access: "public"`, `addRandomSuffix: true` (`:76-84`).
39. Returns `{ url: blob.url }`; unexpected throws → `500` (`:85-89`).

### Supplier documents (product built on the pipeline)
40. Per-edition org CRUD with `create` / `update` / `delete` capability checks in the `supplier_documents` domain, and an explicit note that delete is *its own* domain, not `suppliers` (`apps/org/lib/actions/supplier-documents.ts:75-78`, `:167-170`, `:257-263`).
41. **Sort defaults to `max(sort)+1` for the edition**, computed inside the transaction (`:88-97`).
42. **Every write is audit-logged** — `supplier_document.create` / `.update` / `.delete`, the last carrying `acknowledgementsDiscarded` because that count survives nowhere else (`:113-124`, `:204-213`, `:289-298`).
43. **Whole-edition step reconciliation inside the same transaction as the document write** (`reconcileEditionSupplierSteps`, `apps/org/lib/supplier-step-reconcile.ts:68-`).
44. **Best-effort post-commit notification of every supplier whose checklist moved backwards** (`notifyReopened`, `:45-64`).
45. Supplier-side ack is **idempotent** (`onConflictDoNothing` on the composite PK) and un-ack is a delete (`apps/suppliers/lib/actions/documents.ts:66-88`).
46. **Edition authz before the transaction** — a forged document id from another edition writes nothing (`:56-60`).
47. **Step map re-read under lock inside the tx** (`lockOnboardingSteps`), because seeding from the session republished a stale copy of every *other* step and silently reverted an org's "Deposit received" (`:97-108`).
48. **`?download=1` on `*.blob.vercel-storage.com` URLs only** — a Vercel Blob serves inline by default; an external "file" URL is opened as-is because it can't be assumed to honour the param (`apps/suppliers/components/documents-panel.tsx:47-59`).
49. Console table: inline ack toggle, inline step select, **move-up/move-down as the keyboard-accessible substitute for the canvas's drag grip** (two updates, neighbour first, so a partial failure leaves the list ordered) (`documents-table.tsx:137-163`), **delete confirm that names the consequence** — "N supplier acknowledgements will be discarded with it, and any step it completes re-opens" (`:165-175`).
50. **Selecting a step force-enables `requiredAck` and locks the switch**, mirroring the server rule (`document-form.tsx:101-108`, `:252`, `:260-262`).

### System-status probe
51. `blobCheck()` reports `"Vercel Blob configured"` / `"Not configured"` with a plain-English consequence, and `BLOB_READ_WRITE_TOKEN` is on `SECRET_ENV_VARS` so its value is redacted out of any surfaced text (`apps/org/lib/system-status.ts:345-368`, `:339-359`).

---

## 4. Data model (verbatim)

### Enum
```ts
// packages/db/src/schema.ts:179-182
export const supplierDocumentSourceEnum = pgEnum("supplier_document_source", [
  "file",
  "link",
]);
```
Zod mirror — `packages/types/src/suppliers.ts:151-154`:
```ts
export const SupplierDocumentSourceType = z.enum(["file", "link"]);
export type SupplierDocumentSourceType = z.infer<
  typeof SupplierDocumentSourceType
>;
```
Semantics (`packages/types/src/suppliers.ts:145-150`): `url` holds the address either way; the two differ only in how the UI labels the action (Open vs Download) and in who owns the artifact's lifetime.

### `supplier_documents` (`packages/db/src/schema.ts:1597-1632`)
```
id                  uuid PK default random
edition_id          uuid NOT NULL → editions.id ON DELETE CASCADE
title               text NOT NULL
source_type         supplier_document_source NOT NULL DEFAULT 'link'
url                 text NOT NULL          -- external URL or the uploaded asset's blob URL
required_ack        boolean NOT NULL DEFAULT false
step_key            text                   -- plain text, NOT an enum column; validated by the Zod enum at the boundary
sort                integer NOT NULL DEFAULT 0
created_by_user_id  uuid → users.id ON DELETE SET NULL
created_at          timestamp NOT NULL DEFAULT now()
updated_at          timestamp NOT NULL DEFAULT now()
indexes: supplier_documents_edition_sort_idx (edition_id, sort)
         supplier_documents_edition_step_idx (edition_id, step_key)
```

### `supplier_document_acks` (`packages/db/src/schema.ts:1638-1653`)
```
supplier_id  uuid NOT NULL → suppliers.id ON DELETE CASCADE
document_id  uuid NOT NULL → supplier_documents.id ON DELETE CASCADE
acked_at     timestamp NOT NULL DEFAULT now()
PRIMARY KEY (supplier_id, document_id)     -- one ack per pair, idempotent
index: supplier_document_acks_document_idx (document_id)
```
Comment at `:1636-1637`: "`acked_at` is the evidence timestamp. Un-acknowledging deletes the row."

### The only *image* column in the schema (`packages/db/src/schema.ts:1107-1115`)
```ts
    // Section 4 — Size & logistics (layout uploads, max 4 — enforced in core).
    s4ExpectedPopulation: integer("s4_expected_population"),
    s4FirstArrivalDate: date("s4_first_arrival_date", { mode: "string" }),
    s4WorkAccessPasses: integer("s4_work_access_passes"),
    s4AreaDimensions: text("s4_area_dimensions"),
    s4LayoutUploadUrls: jsonb("s4_layout_upload_urls")
      .$type<string[]>()
      .notNull()
      .default([]),
```
Mutant-vehicle photos and artwork concept images **reuse this same column** — `ProjectRegistrationColumns.imageUrls` maps to `s4LayoutUploadUrls` (`apps/web/lib/project-registration-store.ts:73-76`, `:144`, `:379`), and duplicates the list into the answer payload as `photos` (`apps/web/app/(app)/vehicles/new/shared.ts:71`).

### Types-level constants
```ts
// packages/types/src/registration.ts:126-127
/** Max number of layout images a camp may upload (Section 4). */
export const MAX_LAYOUT_UPLOADS = 4;
```
Asserted in `packages/types/src/__tests__/registration.test.ts:85` — `expect(MAX_LAYOUT_UPLOADS).toBe(4)`.

### Questionnaire-engine members of this unit
```ts
// packages/types/src/questionnaire.ts:268-276
export const FileLinkQuestion = z.object({
  id: z.string().min(1),
  kind: z.literal("file_link"),
  prompt: z.string().min(1),
  helper: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
});
```
```ts
// packages/types/src/questionnaire.ts:359-366
export const ImageBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("image_block"),
  url: z.string().min(1),
  alt: z.string().min(1),        // required so the runner is never inaccessible
  caption: z.string().optional(),
});
```
```ts
// packages/types/src/questionnaire.ts:70-76
export const QuestionOption = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  imageUrl: z.string().min(1).optional(),
  imageAlt: z.string().optional(),
  goTo: z.string().min(1).optional(),
});
```
**Stale comments to distrust** (the donor's own "comments that lie" warning applies): `questionnaire.ts:264-267` says *"We have no blob infrastructure yet, so the respondent pastes a URL"*, and `:357-358` says *"`url` is a plain URL (no blob infra yet — same reasoning as FileLinkQuestion)"*. Both are **false as of the current tree** — `field.tsx:273` and `block-editor.tsx:690` both render the real uploader.

### Retention (adjacent)
```ts
// packages/core/src/id-retention.ts:40
export const ID_RETENTION_GRACE_DAYS = 30;
```
`idRetentionExpiresAt` parses `` `${edition.endDate}T23:59:59.999Z` `` and adds `graceDays * 86_400_000` (`:49-57`); `isIdRetentionExpired` returns `false` on a `NaN` expiry — "never purge on ambiguous input" (`:64-72`).

---

## 5. Public API surface (verbatim signatures)

### `packages/ui/src/components/file-upload.tsx`
```ts
export interface FileUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  handleUploadUrl: string;
  blobConfigured: boolean;
  kind: string;
  variant?: "image" | "file";
  maxFiles?: number;
  maxSizeBytes?: number;
  acceptedTypes?: string[];
  allowUrlPaste?: boolean;
  urlPlaceholder?: string;
  hint?: string;
  disabled?: boolean;
  onCommit?: () => void;
  className?: string;
  ariaLabel?: string;
}

export function FileUpload({ … }: FileUploadProps)
```
Defaults: `variant = "image"`, `maxFiles = 1`, `maxSizeBytes = DEFAULT_MAX_BYTES` (`8 * 1024 * 1024`, `:31`), `allowUrlPaste = true`, `disabled = false`.
Module-private but load-bearing: `IDLE: UploadState = { active: false, percentage: 0, batch: null }` (`:76`); `IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]` (`:32`); `formatBytes(bytes: number): string` (`:403`); `fileNameFromUrl(url: string): string` (`:409`).

### `apps/web/app/api/registration/upload/route.ts`
```ts
export const runtime = "nodejs";
export function isBlobConfigured(): boolean
export async function POST(request: Request): Promise<Response>
```

### `apps/web/app/api/blob/upload/route.ts` / `apps/org/app/api/blob/upload/route.ts`
```ts
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response>
```

### `packages/core/src/supplier-documents.ts` (all exports)
```ts
export interface SupplierDocument {
  id: string;
  title: string;
  sourceType: SupplierDocumentSourceType;
  url: string;
  requiredAck: boolean;
  stepKey: SupplierOnboardingStepKey | null;
  sort: number;
}
export interface SupplierDocumentAck { documentId: string; ackedAt: Date }
export interface SupplierDocumentView {
  document: SupplierDocument;
  acked: boolean;
  ackedAt: Date | null;
  outstanding: boolean;
}
export interface DocumentAckProgress {
  acked: number;
  required: number;
  allAcknowledged: boolean;
  outstanding: SupplierDocument[];
}
export type DocumentBindingResult = { ok: true } | { ok: false; reason: string };
export interface DocumentAckStepResult {
  steps: SupplierOnboardingSteps;
  completed: SupplierOnboardingStepKey[];
  reverted: SupplierOnboardingStepKey[];
}

export function sortDocuments(documents: readonly SupplierDocument[]): SupplierDocument[]
export function buildDocumentViews(documents: readonly SupplierDocument[], acks: readonly SupplierDocumentAck[]): SupplierDocumentView[]
export function documentsForStep(documents: readonly SupplierDocument[], stepKey: SupplierOnboardingStepKey): SupplierDocument[]
export function requiredAckDocuments(documents: readonly SupplierDocument[]): SupplierDocument[]
export function deriveDocumentAckProgress(documents: readonly SupplierDocument[], acks: readonly SupplierDocumentAck[]): DocumentAckProgress
export function validateDocumentBinding(stepKey: SupplierOnboardingStepKey | null | undefined, requiredAck: boolean): DocumentBindingResult
export function satisfiedStepKeys(documents: readonly SupplierDocument[], acks: readonly SupplierDocumentAck[]): SupplierOnboardingStepKey[]
export function isStepSatisfiedByAcks(documents: readonly SupplierDocument[], acks: readonly SupplierDocumentAck[], stepKey: SupplierOnboardingStepKey): boolean
export function applyDocumentAcksToSteps(
  states: SupplierOnboardingSteps | null | undefined,
  documents: readonly SupplierDocument[],
  acks: readonly SupplierDocumentAck[],
  alsoConsider: readonly SupplierOnboardingStepKey[] = [],
): DocumentAckStepResult
```

### `apps/org/lib/actions/supplier-documents.ts`
```ts
export async function createSupplierDocument(raw: z.input<typeof CreateDocumentInput>): Promise<ActionResult>
export async function updateSupplierDocument(raw: z.input<typeof UpdateDocumentInput>): Promise<ActionResult>
export async function deleteSupplierDocument(raw: z.input<typeof DeleteDocumentInput>): Promise<ActionResult>
export interface OrgSupplierDocumentRow {
  id: string; title: string; sourceType: "file" | "link"; url: string;
  requiredAck: boolean; stepKey: string | null; sort: number; ackCount: number;
}
export async function listSupplierDocuments(editionId: string): Promise<OrgSupplierDocumentRow[]>
```

### `apps/suppliers/lib/documents.ts` / `apps/suppliers/lib/actions/documents.ts`
```ts
export interface SupplierDocumentsPanelData { views: SupplierDocumentView[]; progress: DocumentAckProgress }
export async function listEditionDocuments(editionId: string): Promise<SupplierDocument[]>
export async function listSupplierAcks(supplierId: string, documentIds: readonly string[]): Promise<SupplierDocumentAck[]>
export async function loadSupplierDocumentsPanel(supplierId: string, editionId: string): Promise<SupplierDocumentsPanelData>
export async function setDocumentAcknowledgement(raw: z.input<typeof SetAckInput>): Promise<ActionResult>
```

### `apps/org/lib/supplier-step-reconcile.ts`
```ts
export interface ReopenedStep { supplierId: string; userId: string | null; supplierName: string; stepKey: SupplierOnboardingStepKey }
export interface ReconcileResult { changed: number; reopened: ReopenedStep[] }
export async function reconcileEditionSupplierSteps(
  tx: OrgTx,
  editionId: string,
  alsoConsider: readonly SupplierOnboardingStepKey[] = [],
  actorId: string,
): Promise<ReconcileResult>
```

### `apps/org/components/supplier-documents/steps.ts`
```ts
export interface BindableStep { key: SupplierOnboardingStepKey; title: string }
export const BINDABLE_STEPS: readonly BindableStep[]
export const UNBOUND_VALUE = "__unbound__"
export function asStepKey(value: string | null | undefined): SupplierOnboardingStepKey | null
export function stepLabel(stepKey: string | null): string
```

### `apps/org/components/questionnaires/block-editor.tsx`
```ts
export function BlobConfigProvider({ value, children }: { value: boolean; children: React.ReactNode })
// module-private: const BlobConfigContext = React.createContext(false)
//                 function useBlobConfigured(): boolean
```

### `packages/core/src/id-retention.ts`
```ts
export interface RetentionEdition { id: string; endDate: string }
export interface RetentionBio { id: string; editionId: string; saIdEncrypted: string | null; passportEncrypted: string | null }
export const ID_RETENTION_GRACE_DAYS = 30
export function idRetentionExpiresAt(edition: RetentionEdition, graceDays: number = ID_RETENTION_GRACE_DAYS): Date
export function isIdRetentionExpired(edition: RetentionEdition, now: Date, graceDays: number = ID_RETENTION_GRACE_DAYS): boolean
export function bioHasIdData(bio: RetentionBio): boolean
export interface IdPurgePatch { saIdEncrypted: null; passportEncrypted: null }
export function buildIdPurgePatch(): IdPurgePatch
export interface PurgeableIdBio { bioId: string; editionId: string }
export function identifyPurgeableIdBios(input: { now: Date; editions: readonly RetentionEdition[]; bios: readonly RetentionBio[]; graceDays?: number }): PurgeableIdBio[]
```

---

## 6. UX behaviours

- **Dropzone copy** is variant-aware: `"Click to add an image"` vs `"Click to upload"`, always followed by `"or drag & drop"` and an optional `hint` line (`file-upload.tsx:327-333`). Real hints in use: `"PNG, JPEG, WebP or GIF, up to 8 MB each"` (`layout-uploads.tsx:44`), `"PDF, image, or document — up to 25 MB"` (`document-form.tsx:211`, `field.tsx:282`), `"PNG, JPEG, WebP or GIF, up to 8 MB"` (`block-editor.tsx:697`).
- **URL field placeholder flips with configuration**: `"or paste a link"` when Blob is on, `"paste a link to the file"` when it is off (`file-upload.tsx:368-373`), overridable per call (`document-form.tsx:212` uses a real example URL).
- **The not-configured note** is one sentence, verbatim: *"File uploads aren't configured on this deployment — paste a link to an already-hosted file instead."* (`file-upload.tsx:392-395`). The server route's own 501 body is the twin sentence: *"File uploads aren't configured on this deployment. Paste a link instead."* (`apps/web/app/api/blob/upload/route.ts:66-68`).
- **Toasts, not inline errors**, for every refusal: `toast.error("That doesn't look like a valid URL.")`, `toast.info("That link is already added.")`, `toast.error("Couldn't add that file", { description })`, `toast.error("Upload failed", { description })`, `toast.info("Only N more file(s) fit here.")`.
- **The image grid's remove button is hover/focus-revealed** — `opacity-0 … group-hover:opacity-100 focus:opacity-100` (`file-upload.tsx:236`).
- **Supplier portal**: outstanding required documents get a warning-tinted card (`border-warning/40 bg-warning/5`), the header carries an `acked/required acknowledged` badge that flips to `variant="success"` when complete, and the checkbox label reads *"I've read {title}"* (`documents-panel.tsx:110-140`).
- **Org console** callout on the management page explains what publishing does and restates the binding rule in prose (`apps/org/app/(console)/suppliers/signup-management/page.tsx:64-76`).
- **Empty states**: no active edition → `"No active edition"`; edition with no documents → `"No documents published yet"` with concrete suggestions (`:76-96`). Supplier side: an edition with zero documents renders **no panel at all** — "no empty card, no dead heading" (`apps/suppliers/lib/documents.ts:90-93`).
- **`blobConfigured` is threaded from a server component every time** — `Boolean(process.env.BLOB_READ_WRITE_TOKEN)` read in the page and passed down (8 pages do this: `artworks/new:66`, `artworks/[slug]/edit:175`, `vehicles/new:65`, `vehicles/[slug]/edit:168`, `questionnaires/[activationId]:145` and `:185`, `camps/[slug]/registration:184`, org `questionnaires/new:24` and `[key]/edit:48`, org `suppliers/signup-management:39`). The builder uses React context instead so deeply-nested controls don't each need it threaded (`block-editor.tsx:56-80`).

---

## 7. Validation + edge-case rules (digit-exact)

### MIME allowlists (verbatim)
```ts
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DOC_TYPES = [
  "application/pdf",
  ...IMAGE_TYPES,
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
```
Identical in both token routes (`apps/web/.../blob/upload/route.ts:17-27`, `apps/org/.../blob/upload/route.ts:24-34`). `DOC_TYPES` is 9 entries (4 image + 5 document). The legacy route uses `const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])` (`registration/upload/route.ts:16`).

### Size / count caps
| Constant | Value | Site |
|---|---|---|
| `MB` | `1024 * 1024` | both token routes `:16` / `:23` |
| `registration-layouts` max | `8 * MB` = 8 388 608 | `apps/web/.../blob/upload/route.ts:39` |
| `questionnaire-files` max | `25 * MB` = 26 214 400 | `apps/web/.../blob/upload/route.ts:43` |
| `supplier-documents` max | `25 * MB` | `apps/org/.../blob/upload/route.ts:48` |
| `questionnaire-images` max | `8 * MB` | `apps/org/.../blob/upload/route.ts:53` |
| `FALLBACK` (web only) | `IMAGE_TYPES`, `8 * MB` | `apps/web/.../blob/upload/route.ts:47-50` |
| `DEFAULT_MAX_BYTES` (client) | `8 * 1024 * 1024` | `file-upload.tsx:31` |
| Legacy `MAX_BYTES` | `8 * 1024 * 1024` | `registration/upload/route.ts:15` |
| `MAX_LAYOUT_UPLOADS` | `4` | `packages/types/src/registration.ts:127` |
| Filename sanitiser | `replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80)` | `file-upload.tsx:172-174`, `registration/upload/route.ts:76` (identical regex + slice) |
| `SupplierDocumentInput.title` | `.trim().min(1).max(160)` | `packages/types/src/suppliers.ts:165` |
| `SupplierDocumentInput.url` | `.trim().url().max(2048)` | `packages/types/src/suppliers.ts:167` |
| `SupplierDocumentInput.sort` | `.int().min(0).max(9999).nullable().default(null)` | `packages/types/src/suppliers.ts:170` |
| Registration layout URLs (server) | `z.array(z.string().url().max(2000)).max(4).default([])` | `apps/web/app/(app)/camps/[slug]/registration/actions.ts:142` |
| Project (art/MV) images (server) | `z.array(z.string().url()).max(MAX_LAYOUT_UPLOADS).default([])` | `artworks/new/shared.ts:34`, `vehicles/new/shared.ts:28` |

**Note the 2048 vs 2000 mismatch**: supplier document URLs cap at 2048 chars, registration layout URLs at 2000. Neither cites the other.

### HTTP status contract
| Condition | Status | Body | Site |
|---|---:|---|---|
| No `BLOB_READ_WRITE_TOKEN` | **501** | `"File uploads aren't configured on this deployment. Paste a link instead."` | token routes `:63-71` / `:81-89`; legacy uses `"…Paste an image URL instead."` `:41-49` |
| Unparseable JSON body | **400** | `"Bad request."` | token routes `:76-78` / `:94-96` |
| Not signed in (legacy) | **401** | `"Sign in to upload."` | `registration/upload/route.ts:31-33` |
| Blocking onboarding pending (legacy) | **403** | `"Finish your onboarding before uploading files."` | `:34-39` |
| No file part | **400** | `"No file provided."` | `:53-55` |
| Over 8 MB | **413** | `"That image is larger than 8 MB."` | `:56-61` |
| Type not allowlisted (incl. empty type) | **415** | `"Upload a PNG, JPEG, WebP, or GIF image."` | `:68-73` |
| Token generation threw | **400** | thrown message, or `"Upload failed."` | token routes `:100-103` / `:123-126` |
| `put()` threw | **500** | thrown message, or `"Upload failed."` | `:86-89` |

### Client-side validation messages (exact strings)
- Image variant wrong type → `"Upload a PNG, JPEG, WebP, or GIF image."` (`file-upload.tsx:137`)
- File variant wrong type → `"That file type isn't allowed here."` (`:138`)
- Over cap → `` `That file is larger than ${formatBytes(maxSizeBytes)}.` `` (`:141`)
- `formatBytes` thresholds: `>= 1024*1024` → `` `${Math.round(bytes/(1024*1024))} MB` ``; `>= 1024` → `` `${Math.round(bytes/1024)} KB` ``; else `` `${bytes} B` `` (`:403-407`). Tested at exactly `8 MB` / `512 KB` / `500 B` (`__tests__:168-180`).
- Bad URL → `"That doesn't look like a valid URL."`; duplicate → `"That link is already added."`; empty draft → **silent no-op**, asserted (`__tests__:107-112`).

### Edge cases the code deliberately handles
- `validate()` skips the MIME check when `file.type` is falsy on the **client** (`accepts && file.type && !accepts.includes(file.type)`, `:135`) — but the **legacy server route deliberately does the opposite** and rejects an empty type (`registration/upload/route.ts:68`). The two halves are inconsistent, and the server one is the safe one.
- `uploadFiles` computes `room = Math.max(0, maxFiles - value.length)` and slices; a rejected file inside a batch is skipped with its own toast and the loop continues (`:146-196`).
- `commit()` slices to `maxFiles` on every append, so a race can never exceed the cap (`:130`, `:194`).
- `fileNameFromUrl` falls back to the raw string on a non-URL value — legacy rows exist and rendering nothing would hide a real document (`:409-417`, tested `__tests__:369-377`).
- `resolvePolicy` never throws on malformed `clientPayload` (both routes wrap `JSON.parse` in `try/catch`).
- `applyDocumentAcksToSteps` skips a rejected transition **silently** rather than throwing — "reconciliation is a background consequence of an unrelated user action, and it must never fail that action" (`supplier-documents.ts:238-239`).
- `sortDocuments` tie-breaks `sort` → `title.localeCompare(…, "en", { sensitivity: "base" })` → `id.localeCompare` so two documents sharing a sort never swap between renders (`:65-74`).
- `deriveDocumentAckProgress.allAcknowledged` is **vacuously true at 0 required** (`:113`, `:130`).
- `isStepSatisfiedByAcks` returns **false for an empty binding** — a step with no bound documents is by definition unsatisfied (`:210`).
- `asStepKey` narrows an unknown stored `step_key` to `null` instead of forwarding a bogus binding (`steps.ts:45-51`); `stepLabel` degrades to `` `Unknown step (${stepKey})` `` (`:54-57`).
- `listEditionDocuments` / `listSupplierAcks` **return `[]` on any throw** so the onboarding page keeps rendering (`apps/suppliers/lib/documents.ts:44-67`, `:71-88`), but `loadDocumentsForReconcile` deliberately does **not** swallow errors — "a write path that silently reconciles against an empty document list would wrongly revert completed steps" (`:112-118`).

### The load-bearing product rule (binding validation)
`validateDocumentBinding(stepKey, requiredAck)` (`supplier-documents.ts:151-175`) rejects, in order:
1. an unknown step key → `` `Unknown onboarding step: ${stepKey}` ``;
2. a step that is not self-service → `` `"${step.title}" is confirmed by AfrikaBurn, so a document acknowledgement can't complete it. Bind the document to a step the supplier completes themselves, or leave it unbound.` ``;
3. a binding with `requiredAck === false` → `"A document bound to an onboarding step must require acknowledgement — otherwise nothing would ever complete the step."`
`stepKey == null` is always `{ ok: true }`. The rule is enforced **three times**: in the picker (filtered `BINDABLE_STEPS`), in the action before the write, and again at apply time inside `applyDocumentAcksToSteps` via `applyStepTransition(steps, "supplier", …)`.

---

## 8. Test coverage

### `packages/ui/src/components/__tests__/file-upload.test.tsx` — 389 lines, 22 cases, 5 describes
`@vercel/blob/client` is mocked with `vi.hoisted` (`:17-18`). Every refusal is asserted **through a real rendered `<Toaster/>`**, not a spy — "'we called toast.error' and 'the user was told something' are different claims and only the second one matters" (`:12-15`). `toast.dismiss()` runs in `beforeEach` *before* render because the toast store is module-level (`:52-59`). `fileOfSize(bytes, name, type)` builds a `File` of an exact byte length so the cap can be probed precisely (`:47-50`).

Cases:
- *honest degradation* (2): no-token renders the note + URL field and **no `input[type=file]`**; the URL field survives `allowUrlPaste: false` because it is the only route left.
- *adding a URL by hand* (4): refuses a non-URL; refuses a duplicate; ignores an empty draft with **no** toast; appends + clears + fires `onCommit` **one tick later** (asserting the deferral, `:133-135`).
- *validate* (3, one `it.each` × 3): image-variant type message; file-variant generic message; the three `formatBytes` unit bands.
- *uploading* (8): stores the returned URL and asserts `pathname === "bulletin/photo.png"`, `handleUploadUrl`, and `clientPayload === {kind:"bulletin"}`; sanitises `"my holiday snap (1).png"` → `"bulletin/my-holiday-snap-1-.png"`; surfaces the thrown message; falls back to actionable advice on a non-Error throw; live progress at 42% with `aria-valuenow`; batch truncation plural; batch truncation **singular**; drag-and-drop.
- *the cap and removal* (5): every add control removed at the cap; removes exactly the clicked image; decodes `Public%20Liability%20Cover.pdf`; falls back to the raw string for `"legacy-local-path"`; no remove control when `disabled`.

### `packages/core/src/__tests__/supplier-documents.test.ts` — 371 lines, 31 cases, 6 describes
`sortDocuments`, `buildDocumentViews`, `deriveDocumentAckProgress`, `documentsForStep / requiredAckDocuments`, `validateDocumentBinding`, `ack → step completion`.

### `e2e/specs/camp-lead/layout-uploads.spec.ts` — 194 lines, 2 tests
The header is worth quoting for the porting decision (`:10-28`): neither CI nor `scripts/e2e-local.sh` sets `BLOB_READ_WRITE_TOKEN` — *deliberately*, "because a token in CI means a suite that writes to a real blob store" — so the blob branch (dropzone, MIME/size pre-checks, progress) "is NOT exercised here and cannot be without a token". What it does cover: the not-configured note is visible and **no dropzone button exists**; both refusals; filling to the cap makes the add controls vanish; removing one brings them back ("the cap is a live count, not a one-way latch"); **the value survives a full reload** (the `onCommit` macrotask ordering is the thing under test — "if that ordering ever regressed, every link would look right on screen and be absent from the draft"); and the org reviewer can open the same `Layout 1` link.
A recorded flake fix worth stealing verbatim (`:132-138`): the spec waits for the rail's own **"Saved just now"** before reloading, because a reload fired immediately kills the autosave flush in flight — and the resulting failure "looked like a persistence bug in the product".

### Not covered anywhere
- The two blob token routes have **no unit test** (`grep -rln` over `*.test.ts(x)` returns no file touching `app/api/blob`). Their policy map, the restrictive fallback, the org domain mapping and the 501 branch are untested.
- `apps/web/app/api/registration/upload/route.ts` has **no test**.
- The hand-rolled `ImageGrid`/`PhotoGrid` uploaders have **no test**.
- `apps/org/lib/__tests__/system-status.test.ts:32,347` exercises `blobCheck` only through the whole-page redaction assertion.

---

## 9. Dependency footprint

- **`@vercel/blob: ^2.4.0`** — declared in `apps/web/package.json:24`, `apps/org/package.json:24`, `packages/ui/package.json:35`. **Camp 404 already has `@vercel/blob ^2.4.0`**, so this is a zero-install dependency for the port.
  - `packages/ui` imports the *client* subpath only: `import { upload } from "@vercel/blob/client"` (`file-upload.tsx:12`).
  - Token routes import `handleUpload, type HandleUploadBody` from `@vercel/blob/client`.
  - The legacy route imports `put` from `@vercel/blob`.
  - **Nothing anywhere imports `del`, `list` or `head`.**
- **`lucide-react ^1.16.0`** icons used by `FileUpload`: `FileText, ImagePlus, LinkIcon, Loader2, Upload, X` (`file-upload.tsx:4-11`). All six exist in Camp 404's installed `lucide-react@1.16.0`.
- **Intra-`@quagga/ui` imports** in `file-upload.tsx` use the **self-referential specifier** — `@quagga/ui/lib/utils`, `@quagga/ui/components/button`, `@quagga/ui/components/input`, `@quagga/ui/components/toast` (`:13-16`). The donor's own audit flags this file by name as one of only three doing so (`docs/simplification-audit.md:892`). Camp 404's `packages/ui` uses relative imports throughout and has **never exercised** self-referencing resolution — either sed these to `../lib/utils` / `./button` / `./input` / `./toast`, or verify the resolution first.
- **Env**: `BLOB_READ_WRITE_TOKEN` only. Present in `turbo.json` `globalEnv:18`. **Camp 404's `turbo.json` already declares it.** No signing key, no CDN host allowlist, no `next.config.ts` `images` block on either side (`grep -n "images" apps/web/next.config.ts` → no match in the donor).
- **`@quagga/core`** couplings in the supplier-documents slice: `SUPPLIER_ONBOARDING_STEPS`, `isSelfServiceStep`, `supplierOnboardingStep`, `applyStepTransition`, `stepStatus`, `supplierStepReopenedNotification`, `validateDocumentBinding`. **`FileUpload` itself has zero `@quagga/core` or `@quagga/types` imports** — it is fully domain-free.
- **Runtime hazards for the port**: the two token routes and the legacy route are Node-runtime route handlers; `apps/suppliers/lib/documents.ts` and `apps/org/lib/supplier-step-reconcile.ts` open with `import "server-only"`. Camp 404's `apps/web/vitest.config.ts` has **no `server-only` alias stub** (the donor's apps all alias it to `test/stubs/server-only.ts`), so any of these modules will throw the moment a Camp 404 vitest test imports it.
- **Design-token hazard**: `file-upload.tsx:236` uses `bg-ab-charcoal/70 text-ab-warmwhite` — donor-only raw brand-ramp tokens (`packages/ui/src/styles/globals.css:42-49`) that **do not exist in Camp 404** and will compile to nothing. This is the single line that must be retokenised. Everything else in the file uses shared semantic tokens (`border-border`, `bg-secondary/40`, `border-primary bg-primary/5`, `border-input`, `bg-muted`, `bg-primary`, `text-muted-foreground`, `text-foreground`) that all exist in Camp 404's `@theme`.
- **Component-API collisions if the supplier-documents UI is lifted**: `document-form.tsx` uses `Switch` with `onCheckedChange` (compatible with Camp 404's Radix switch), `ToggleGroup`/`ToggleGroupItem` (**Camp 404 has neither the component nor `@radix-ui/react-toggle-group`**), `Field` (**Camp 404 has `input-field`, a different component**), and `Select` (present). `documents-panel.tsx` uses `Checkbox` with the **native** `onChange={(e) => …e.currentTarget.checked}` API — Camp 404's Radix checkbox takes `onCheckedChange` and this call site **will not compile**. `documents-table.tsx` needs `ResponsiveDataTable` + `table.tsx`, neither of which Camp 404 has.

---

## 10. AfrikaBurn / multi-tenant coupling

| Asset | Coupling | Verdict |
|---|---|---|
| `packages/ui/src/components/file-upload.tsx` | **None.** No `groupId`, `orgId`, `editionId`, tenancy or org/participant concept anywhere in the file. Its only external couplings are three sibling UI components and `cn`. `kind` is an opaque string. | **Drop-in** (after the one `ab-*` token swap and the self-referential import decision). |
| `apps/web/app/api/blob/upload/route.ts` | **Light.** The policy map names `registration-layouts` / `questionnaire-files` (AfrikaBurn nouns) but the *structure* is tenancy-free. Authn is one `getAuthenticatedUser()` call. | **Light-adapt** — rename the kinds, swap the auth call. |
| `apps/org/app/api/blob/upload/route.ts` | **Heavy — this is the org/participant split in the file.** `OrgDomain`, `requireOrgSession({ capability, domain })`, `orgCanInDomain`, and the whole `org_departments` / `org_roles` layer exist only because reviewers are a different organisation from the reviewed. Camp 404 has no second permission system. | **Concept-only** — keep the *idea* (each upload kind carries the authority it is checked against; no permissive fallback) and re-express `domain` as a Camp 404 rank/clearance check. The bug story at `:12-19` is the reason the idea is worth keeping. |
| `apps/web/app/api/registration/upload/route.ts` | **Light.** `getCurrentCampUser()` + `pendingBlockingRoute()` map cleanly onto Camp 404's `getAuthenticatedUser` + `nextGate`. | **Light-adapt**, but it is the *inferior* of the two transports — its only reason to exist is that two forms never migrated. Prefer the client-token route. |
| `packages/core/src/supplier-documents.ts` | **Heavy — but only through the supplier noun.** Zero group/tenant references; the coupling is `SupplierOnboardingStepKey` and the seven-step supplier procedure. The *shape* — "an org-published, ordered, per-scope document catalog; some entries carry a mandatory acknowledgement; an acknowledgement may complete a checklist step it is bound to; withdrawing an ack reverts the step; only self-service steps may be bound" — is a general acknowledgement-catalog engine. | **Heavy-adapt / high-value.** Camp 404 has `broadcast_presentation: "acknowledge"` and a `documents` table with an MCP-only surface and **no web UI at all**; this is the ready-made web product for it. |
| `supplier_documents` / `supplier_document_acks` tables | **`edition_id` is the tenancy axis** — `editions` is "the root namespace for data" (`docs/synthesis.md:95`). Camp 404 has no editions. Collapse `edition_id` to nothing (single camp, single season) or to `camp_settings`. `supplier_id` collapses to `users.id` (or a team). | **Heavy-adapt.** |
| `apps/org/components/supplier-documents/**` | Org-console chrome + `requireOrgSession` + `ResponsiveDataTable` + `ToggleGroup` + `Field` — none of which Camp 404 has. The **interaction design** (source toggle, inline ack switch, inline step select, move up/down, consequence-naming delete confirm) is fully portable. | **Heavy-adapt.** |
| `apps/org/lib/supplier-step-reconcile.ts` | Edition-scoped sweep, `OrgTx`, org audit. But the **argument** in its header — reconcile *every* member in scope, not just the ones who acted, because "the set of suppliers a document change can affect is not the set who acknowledged it" — is a general correctness lesson. | **Concept-only** (the reasoning) / **heavy-adapt** (the code). |
| `apps/org/lib/system-status.ts` `blobCheck` | The `/system` panel is org-gated on `read_system`. The probe itself is 24 tenancy-free lines. | **Light-adapt.** |
| `packages/core/src/id-retention.ts` | Couples to `editions.end_date` (`RetentionEdition.endDate`) — the edition dimension again. Camp 404 has no editions but does have `camp_settings` and PII-at-rest already shipped. | **Concept-only**, and note it is written-but-unscheduled in the donor too. |
| `MAX_LAYOUT_UPLOADS` / `s4LayoutUploadUrls` | Pure AfrikaBurn registration nouns. | **Concept-only.** |

**Anti-coupling worth recording:** a repo-wide grep for `groupId|orgId|group_id|tenant|isOrg|orgSlug|supplierId|MembershipRole` across all of `packages/ui/src` returns **zero hits**. `FileUpload` is the cleanest asset in this unit and one of the cleanest in the donor.

---

## 11. Verbatim excerpts — the five most valuable pieces

### (A) The per-kind token policy — the whole security model in 40 lines
`apps/web/app/api/blob/upload/route.ts:5-12, 16-60, 80-98`
```ts
// Client-upload token endpoint for the shared `@quagga/ui` FileUpload component.
// The browser calls `upload()` which POSTs here first for a scoped token, then
// streams the file straight to Vercel Blob. This is where TYPE + SIZE become a
// SERVER boundary: `allowedContentTypes` and `maximumSizeInBytes` are baked into
// the token and enforced by Blob during the upload, not merely pre-checked in
// the client. Authn is enforced here too — no token is issued to a signed-out
// caller. When BLOB_READ_WRITE_TOKEN is absent the component never reaches this
// route (it shows the URL-paste fallback), but we still refuse loudly (501).

const MB = 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DOC_TYPES = [
  "application/pdf",
  ...IMAGE_TYPES,
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

interface Policy {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
}

// One policy per upload `kind` (sent as clientPayload). Unknown kinds fall back
// to the most restrictive image policy rather than a permissive default.
const POLICIES: Record<string, Policy> = {
  "registration-layouts": {
    allowedContentTypes: IMAGE_TYPES,
    maximumSizeInBytes: 8 * MB,
  },
  "questionnaire-files": {
    allowedContentTypes: DOC_TYPES,
    maximumSizeInBytes: 25 * MB,
  },
};

const FALLBACK: Policy = {
  allowedContentTypes: IMAGE_TYPES,
  maximumSizeInBytes: 8 * MB,
};

function resolvePolicy(clientPayload: string | null): Policy {
  if (!clientPayload) return FALLBACK;
  try {
    const parsed = JSON.parse(clientPayload) as { kind?: string };
    return (parsed.kind && POLICIES[parsed.kind]) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await getAuthenticatedUser();
        if (!user) throw new Error("Sign in to upload.");
        const policy = resolvePolicy(clientPayload);
        return {
          allowedContentTypes: policy.allowedContentTypes,
          maximumSizeInBytes: policy.maximumSizeInBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      // No onUploadCompleted work: the client receives the blob URL from
      // upload() and writes it into the form field, so there is nothing to
      // reconcile server-side (and Vercel can't call back to localhost anyway).
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
```

### (B) The org route's "no permissive fallback" argument — the reason a policy carries its own authority
`apps/org/app/api/blob/upload/route.ts:12-19, 58-78, 102-119`
```ts
// EVERY UPLOAD KIND CARRIES ITS OWN DOMAIN. The console's capabilities are
// department-scoped, so "may this account upload?" is meaningless without
// saying WHERE. This route used to authorise every upload against
// `supplier_documents`, whatever it was: a questionnaire author in a department
// that owns questionnaires but not supplier documents was refused an image in
// the builder, while a supplier-documents role was handed a token for a
// questionnaire image. Wrong in both directions, and invisible — the browser
// only ever showed "Upload failed".

/**
 * The policy for a declared upload kind, or null when the caller declared none
 * this build knows.
 *
 * There is no longer a permissive fallback, and that is the point: a fallback
 * policy has no honest domain to authorise against — "some upload, somewhere"
 * is not a question `orgCanInDomain` can answer, and answering it with whatever
 * domain happened to be written at the call site is how every upload came to be
 * checked against supplier documents. `FileUpload` always sends
 * `{ kind }` (it is also the blob pathname prefix), so an absent or unknown
 * kind is a caller this route does not serve.
 */
function resolvePolicy(clientPayload: string | null): Policy | null {
  if (!clientPayload) return null;
  try {
    const parsed = JSON.parse(clientPayload) as { kind?: string };
    return (parsed.kind && POLICIES[parsed.kind]) || null;
  } catch {
    return null;
  }
}

      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const policy = resolvePolicy(clientPayload);
        if (!policy) {
          throw new Error("That kind of upload isn't accepted here.");
        }
        // Throws if the caller is not an authorised org-console user. An upload
        // MINTS a new stored object, so it names `create` rather than settling
        // for "has a session" — in the domain that owns what is being uploaded.
        const session = await requireOrgSession({
          capability: "create",
          domain: policy.domain,
        });
        return {
          allowedContentTypes: policy.allowedContentTypes,
          maximumSizeInBytes: policy.maximumSizeInBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
```

### (C) `FileUpload`'s upload loop — batching, per-file validation, sanitised path, progress, cap
`packages/ui/src/components/file-upload.tsx:107-196`
```ts
  function commit(next: string[]) {
    onChange(next);
    // Let React flush the new value before a consumer's autosave reads it.
    if (onCommit) setTimeout(onCommit, 0);
  }

  function remove(url: string) {
    commit(value.filter((u) => u !== url));
  }

  function addUrl() {
    const candidate = urlDraft.trim();
    if (!candidate) return;
    try {
      new URL(candidate);
    } catch {
      toast.error("That doesn't look like a valid URL.");
      return;
    }
    if (value.includes(candidate)) {
      toast.info("That link is already added.");
      return;
    }
    commit([...value, candidate].slice(0, maxFiles));
    setUrlDraft("");
  }

  function validate(file: File): string | null {
    if (accepts && file.type && !accepts.includes(file.type)) {
      return variant === "image"
        ? "Upload a PNG, JPEG, WebP, or GIF image."
        : "That file type isn't allowed here.";
    }
    if (file.size > maxSizeBytes) {
      return `That file is larger than ${formatBytes(maxSizeBytes)}.`;
    }
    return null;
  }

  async function uploadFiles(files: File[]) {
    if (!blobConfigured || files.length === 0) return;
    // Respect the cap; only take as many as there is room for.
    const room = Math.max(0, maxFiles - value.length);
    const batch = files.slice(0, room);
    if (batch.length < files.length) {
      toast.info(
        `Only ${room} more ${room === 1 ? "file fits" : "files fit"} here.`,
      );
    }

    const added: string[] = [];
    for (let i = 0; i < batch.length; i++) {
      const file = batch[i];
      if (!file) continue;
      const problem = validate(file);
      if (problem) {
        toast.error("Couldn't add that file", { description: problem });
        continue;
      }
      setState({
        active: true,
        percentage: 0,
        batch: batch.length > 1 ? { index: i + 1, total: batch.length } : null,
      });
      try {
        const safeName = file.name
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .slice(0, 80);
        const blob = await upload(`${kind}/${safeName}`, file, {
          access: "public",
          handleUploadUrl,
          clientPayload: JSON.stringify({ kind }),
          onUploadProgress: ({ percentage }) =>
            setState((s) => ({ ...s, percentage })),
        });
        added.push(blob.url);
      } catch (err) {
        toast.error("Upload failed", {
          description:
            err instanceof Error && err.message
              ? err.message
              : "Check your connection or paste a link instead.",
        });
      }
    }
    setState(IDLE);
    if (added.length > 0) {
      commit([...value, ...added].slice(0, maxFiles));
    }
  }
```

### (D) The legacy route's hard gate + empty-Content-Type fix — two real incidents in one file
`apps/web/app/api/registration/upload/route.ts:22-84`
```ts
export async function POST(request: Request): Promise<Response> {
  // Authn AND the hard gate, matching the two pages that own this endpoint
  // (/artworks/new and /vehicles/new both do `ensureCampUser` then redirect on
  // `pendingBlockingRoute`). It previously took any authenticated Neon Auth
  // identity, so a session that the app itself refuses to let past onboarding —
  // including a deleted-and-sanitized account, which `getCurrentCampUser`
  // rejects — could still write public blobs at 8 MB a time. A route handler
  // must not redirect, so the gate is reported as a 403 the form can show.
  const user = await getCurrentCampUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  }
  if (await pendingBlockingRoute(user.id)) {
    return NextResponse.json(
      { error: "Finish your onboarding before uploading files." },
      { status: 403 },
    );
  }
  …
  // The allowlist is the ONLY thing standing between this endpoint and an
  // arbitrary public file host, so a part that declares no type fails it rather
  // than skipping it. The old `file.type && !ALLOWED.has(file.type)` let any
  // multipart part with an empty Content-Type — trivial to send by hand, and
  // what several non-browser clients do by default — straight through to a
  // public blob URL, regardless of what it actually contained.
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Upload a PNG, JPEG, WebP, or GIF image." },
      { status: 415 },
    );
  }

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    const blob = await put(
      `registration-layouts/${Date.now()}-${safeName}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      },
    );
    return NextResponse.json({ url: blob.url });
```

### (E) The acknowledgement-catalog engine — reconcile in both directions, defence-in-depth
`packages/core/src/supplier-documents.ts:224-299`
```ts
/**
 * Reconcile a supplier's onboarding step map against their document
 * acknowledgements. Called after every ack/un-ack, and after the org edits the
 * document list (adding a new required document to a bound step correctly
 * re-opens that step).
 *
 * Both directions matter. Acknowledging the last outstanding document COMPLETES
 * the bound step; withdrawing an acknowledgement REVERTS it to pending — a step
 * that stayed green after its evidence was withdrawn would be a lie in the org's
 * console.
 *
 * Every move goes through `applyStepTransition` as the `supplier` actor, so the
 * org-confirmed guard applies here too even if a malformed binding somehow got
 * past `validateDocumentBinding`. A rejected transition is skipped silently
 * rather than throwing: reconciliation is a background consequence of an
 * unrelated user action, and it must never fail that action.
 */
export function applyDocumentAcksToSteps(
  states: SupplierOnboardingSteps | null | undefined,
  documents: readonly SupplierDocument[],
  acks: readonly SupplierDocumentAck[],
  /**
   * Extra steps to re-evaluate even though no document is bound to them any
   * more. Pass the step a document was bound to when the org DELETES or
   * REBINDS it.
   *
   * Without this the reconcile set is derived purely from the CURRENT document
   * list, so deleting the last required document bound to a step removed that
   * step from consideration entirely and left a stale `completed` in place
   * forever — the console reporting a supplier as signed for a document that no
   * longer exists (audit M17). A step with no bound documents is by definition
   * unsatisfied (`isStepSatisfiedByAcks` returns false on an empty binding), so
   * forcing it into the loop reverts it, which is the honest state.
   */
  alsoConsider: readonly SupplierOnboardingStepKey[] = [],
): DocumentAckStepResult {
  let steps: SupplierOnboardingSteps = { ...(states ?? {}) };
  const completed: SupplierOnboardingStepKey[] = [];
  const reverted: SupplierOnboardingStepKey[] = [];

  const boundSteps = new Set<SupplierOnboardingStepKey>(alsoConsider);
  for (const doc of documents) {
    if (doc.stepKey != null && doc.requiredAck) boundSteps.add(doc.stepKey);
  }

  for (const stepKey of boundSteps) {
    const step = supplierOnboardingStep(stepKey);
    if (!step || !isSelfServiceStep(step)) continue;

    const satisfied = isStepSatisfiedByAcks(documents, acks, stepKey);
    const current = stepStatus(steps, stepKey);

    if (satisfied && current !== "completed") {
      const result = applyStepTransition(steps, "supplier", stepKey, "completed");
      if (result.ok) { steps = result.steps; completed.push(stepKey); }
    } else if (!satisfied && current === "completed") {
      const result = applyStepTransition(steps, "supplier", stepKey, "pending");
      if (result.ok) { steps = result.steps; reverted.push(stepKey); }
    }
  }

  return { steps, completed, reverted };
}
```

### (F, bonus) The blob-download trick — 13 lines nobody would think to write
`apps/suppliers/components/documents-panel.tsx:47-59`
```ts
// A Vercel Blob URL serves inline by default; `?download=1` makes it a real
// attachment download. Only applied to blob-hosted files — an external "file"
// URL is opened as-is (we can't assume it honours the param).
function downloadHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return url;
    parsed.searchParams.set("download", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}
```

---

## 12. Gotchas, warnings and known defects

1. **No blob deletion exists anywhere in the donor.** Every uploaded object is permanent. Withdrawing a supplier document deletes the row and cascades its acks (with the count captured for audit) but leaves the file. Replacing a `maxFiles={1}` document's file orphans the old one. Camp 404's `deleteAvatarBlobs` is the *only* orphan handling in either repo, and it is Camp-404-side.
2. **Everything is `access: "public"`.** A blob URL is an unauthenticated, unguessable-but-permanent public link. Supplier agreements, camp layout sketches and questionnaire file answers are all publicly readable to anyone with the URL. Camp 404's private-blob + session-gated proxy is a strictly stronger posture and porting the donor's client-upload transport would *regress* it unless the proxy pattern is preserved. Note: **client uploads and private access are hard to combine** — the browser gets the URL back from `upload()` and it is a raw blob URL, so a private variant needs the server to map `blob.pathname` → proxy URL, which means either `onUploadCompleted` (unusable in local dev per the donor's own note) or a client round-trip.
3. **No rate limiting on any upload path.** `packages/db/src/rate-limit.ts` exists and `consumeRateLimit`/`rateLimitIp` are exported, but no upload route calls them (`grep` of the three routes shows no import). Camp 404 already rate-limits its avatar route; do not drop that when adopting this.
4. **Two stale comments in `packages/types/src/questionnaire.ts`** claim there is no blob infrastructure (`:264-267`, `:357-358`). Both are false. The donor's AGENTS.md warns explicitly that comments in this repo lie; this unit contains two examples.
5. **Two near-identical 146-line uploaders (`ImageGrid` / `PhotoGrid`) still exist** and do NOT use `FileUpload` — they post multipart to the legacy route instead. The donor's own audit measured them as byte-identical except the function name and `"Add photo"`/`"Add image"` (`docs/simplification-audit.md:560`, verifier at `:566`), and the fix is unapplied. **If you copy an uploader out of an `apps/` directory you will get the wrong one.** The right one is `packages/ui/src/components/file-upload.tsx`.
6. **The client's own type check skips a file with an empty `file.type`** (`file-upload.tsx:135`), which is exactly the hole the legacy server route was patched to close (`registration/upload/route.ts:62-73`). The token-route policy re-enforces types on the token so this is not exploitable there, but if the primitive is ever used against a server that trusts the client, this is the gap.
7. **Two URL length caps disagree**: 2048 (supplier documents) vs 2000 (registration layouts).
8. **`s4LayoutUploadUrls` is triple-purposed** — camp layout sketches, artwork concept images, and mutant-vehicle photos all land in the same `jsonb string[]` column via `ProjectRegistrationColumns.imageUrls`, and the vehicle path *also* duplicates the same array into the answers payload under `photos` (`vehicles/new/shared.ts:71`). Two copies of the same list, no reconciliation.
9. **`window.confirm` is the delete confirmation** in `documents-table.tsx:172` — the donor's own habit, and the same pattern Camp 404's WP1 (#125) is trying to remove. Take the *consequence-naming text*, not the `window.confirm`.
10. **The blob branch has zero e2e coverage anywhere, by policy.** CI never sets `BLOB_READ_WRITE_TOKEN`. The dropzone, progress bar, MIME pre-check and the token routes are covered only by the 22 jsdom unit tests. The two token routes have **no test at all**.
11. **`id-retention.ts` is written but never scheduled** — `docs/technical-spec.md:437-438` records it as a known gap. `apps/web/vercel.json` has exactly one cron (`/api/account/deletion-sweep`, `0 3 * * *`) and it is not the ID purge.
12. **`packages/ui`'s self-referential imports** in this file (`@quagga/ui/lib/utils` etc.) are a resolution path Camp 404 has never exercised.
13. **`bg-ab-charcoal/70 text-ab-warmwhite`** at `file-upload.tsx:236` is the one line that silently compiles to nothing in Camp 404.
14. **`docs/component-spec.md:35` says avatars are "initials fallback only (no upload in MVP)"** — do not go looking for donor avatar-crop code. There is none.
