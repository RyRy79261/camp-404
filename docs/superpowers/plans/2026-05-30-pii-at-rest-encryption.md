# PII-at-rest Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop storing government ID numbers in plaintext — encrypt `id.number` into the existing `users` encrypted columns at every write boundary, gate decryption to owner‖captain, and backfill existing rows.

**Architecture:** A pure split/merge helper (`@camp404/db/id-documents`) moves `id.number` out of `burner_profiles.responses`; the `users.ts` real backend encrypts on write / decrypts on read (test backend keeps raw, so E2E needs no key); the crypto helper moves to `@camp404/db/crypto` so the `admin-cli` backfill can reuse it. Decryption surfaces unchanged in shape: owner replay + MCP self tool, captain member-detail + MCP people tool.

**Tech Stack:** TypeScript, Drizzle (Neon Postgres), Node AES-256-GCM (`crypto.ts`), Vitest, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-05-30-pii-at-rest-encryption-design.md`

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `packages/db/src/crypto.ts` | AES-256-GCM encrypt/decrypt (moved here) | Create (move) |
| `packages/db/src/id-documents.ts` | Pure `splitIdNumber` / `mergeIdNumber` + field-key constants + column selection | Create |
| `packages/db/src/burner-profile.ts` | Raw `getIdDocumentColumns` / `setIdDocumentColumns` (text in/out) | Modify |
| `packages/db/src/roster.ts` | `getCampMemberDetail` returns the encrypted columns | Modify |
| `packages/db/package.json` | Export `./crypto`, `./id-documents` | Modify |
| `apps/web/lib/crypto.ts` | (removed — re-points to db) | Delete |
| `apps/web/lib/mcp/tools/profile.ts` | Import crypto from db; strip ID from `get/update_my_burner_profile` | Modify |
| `apps/web/lib/mcp/tools/people.ts` | Import crypto from db (no logic change) | Modify |
| `apps/web/lib/mcp/tools/reimbursements.ts` | Import crypto from db | Modify |
| `apps/web/lib/users.ts` | `setIdDocuments`/`getIdDocuments` backend (real encrypts, test raw) | Modify |
| `apps/web/lib/test-store.ts` | In-memory ID-doc store for E2E | Modify |
| `apps/web/app/onboarding/questionnaire/actions.ts` | Split + persist on save | Modify |
| `apps/web/lib/forms.ts` | Replay `save` splits; `load` merges back | Modify |
| `apps/web/app/tools/forms/[key]/actions.ts` | Exclude `id.number` from change-log diff | Modify |
| `apps/web/app/captains/camp-management/actions.ts` | Captain decrypt+merge before `presentMemberDetail` | Modify |
| `apps/admin-cli/src/index.ts` (+ `backfill-id-encryption.ts`) | Idempotent backfill command | Modify/Create |
| `apps/web/lib/__tests__/id-documents.test.ts` | Unit tests for split/merge + render integration | Create |
| `apps/web/lib/questionnaire.ts` | Correct the stale PII note | Modify |

---

### Task 1: Move crypto helper into `@camp404/db`

**Files:**
- Create: `packages/db/src/crypto.ts` (identical content to current `apps/web/lib/crypto.ts`)
- Modify: `packages/db/package.json` (exports)
- Modify: `apps/web/lib/mcp/tools/profile.ts`, `people.ts`, `reimbursements.ts` (imports)
- Delete: `apps/web/lib/crypto.ts`

- [ ] **Step 1:** Copy `apps/web/lib/crypto.ts` verbatim to `packages/db/src/crypto.ts`.
- [ ] **Step 2:** In `packages/db/package.json` `exports`, add `"./crypto": "./src/crypto.ts"` (alongside the existing `./schema` etc.).
- [ ] **Step 3:** Replace `import { ... } from "@/lib/crypto"` with `from "@camp404/db/crypto"` in `profile.ts`, `people.ts`, `reimbursements.ts`. Delete `apps/web/lib/crypto.ts`.
- [ ] **Step 4:** `pnpm --filter @camp404/web typecheck` → PASS (no remaining `@/lib/crypto` importers).
- [ ] **Step 5:** Commit: `refactor(crypto): move AES helper to @camp404/db for reuse by admin-cli`.

### Task 2: Pure ID split/merge helper + tests (TDD)

**Files:**
- Create: `packages/db/src/id-documents.ts`
- Create: `apps/web/lib/__tests__/id-documents.test.ts`
- Modify: `packages/db/package.json` (export `./id-documents`)

- [ ] **Step 1 — failing test** (`id-documents.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { splitIdNumber, mergeIdNumber, ID_NUMBER_KEY } from "@camp404/db/id-documents";

describe("splitIdNumber", () => {
  it("removes id.number, returns idType + idNumber", () => {
    const { cleaned, idType, idNumber } = splitIdNumber({
      "id.type": "passport", "id.number": "A12345678", phone: "+27",
    });
    expect(idNumber).toBe("A12345678");
    expect(idType).toBe("passport");
    expect(cleaned[ID_NUMBER_KEY]).toBeUndefined();
    expect(cleaned["id.type"]).toBe("passport"); // type stays
    expect(cleaned.phone).toBe("+27");
  });
  it("returns null idNumber when absent or empty", () => {
    expect(splitIdNumber({ "id.type": "sa_id", "id.number": "" }).idNumber).toBeNull();
    expect(splitIdNumber({ phone: "x" }).idNumber).toBeNull();
  });
});

describe("mergeIdNumber", () => {
  it("restores id.number + id.type into responses", () => {
    const merged = mergeIdNumber({ phone: "+27" }, { idType: "sa_id", idNumber: "9001015800089" });
    expect(merged["id.number"]).toBe("9001015800089");
    expect(merged["id.type"]).toBe("sa_id");
  });
  it("is a no-op when idNumber is null", () => {
    const merged = mergeIdNumber({ phone: "+27" }, { idType: null, idNumber: null });
    expect(merged["id.number"]).toBeUndefined();
  });
  it("round-trips with splitIdNumber", () => {
    const original = { "id.type": "passport", "id.number": "A12345678", phone: "+27" };
    const { cleaned, idType, idNumber } = splitIdNumber(original);
    expect(mergeIdNumber(cleaned, { idType, idNumber })).toEqual(original);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @camp404/web exec vitest run lib/__tests__/id-documents.test.ts` → FAIL (module not found).
- [ ] **Step 3 — implement** `packages/db/src/id-documents.ts`:

```ts
// Pure helpers for moving the sensitive government ID number out of the
// generic burner_profiles.responses JSONB and into the dedicated encrypted
// users columns. No crypto here — encryption happens in the caller's backend
// so this stays a pure, testable mapping. id.type is NOT sensitive and stays
// in responses (the render/validation paths want it).

export const ID_NUMBER_KEY = "id.number";
export const ID_TYPE_KEY = "id.type";

export interface SplitId {
  /** responses with id.number removed (id.type retained). */
  cleaned: Record<string, unknown>;
  /** "passport" | "sa_id" | null */
  idType: string | null;
  /** the document number, or null if absent/empty. */
  idNumber: string | null;
}

export function splitIdNumber(responses: Record<string, unknown>): SplitId {
  const { [ID_NUMBER_KEY]: rawNumber, ...cleaned } = responses;
  const idNumber =
    typeof rawNumber === "string" && rawNumber.trim() !== "" ? rawNumber : null;
  const rawType = responses[ID_TYPE_KEY];
  const idType = typeof rawType === "string" && rawType ? rawType : null;
  return { cleaned, idType, idNumber };
}

export function mergeIdNumber(
  responses: Record<string, unknown>,
  id: { idType: string | null; idNumber: string | null },
): Record<string, unknown> {
  if (!id.idNumber) return responses;
  return {
    ...responses,
    [ID_NUMBER_KEY]: id.idNumber,
    ...(id.idType ? { [ID_TYPE_KEY]: id.idType } : {}),
  };
}

/** Which encrypted column a given id.type writes to. Returns the patch with
 * the matching column set to `value` and the other ID column nulled, so
 * switching document type moves the value rather than orphaning ciphertext. */
export function idColumnsFor(
  idType: string | null,
  value: string | null,
): { passportEncrypted: string | null; saIdEncrypted: string | null } {
  if (idType === "sa_id") return { passportEncrypted: null, saIdEncrypted: value };
  // default/passport
  return { passportEncrypted: value, saIdEncrypted: null };
}
```

- [ ] **Step 4:** Add `"./id-documents": "./src/id-documents.ts"` to `packages/db/package.json` exports. Run the test → PASS.
- [ ] **Step 5:** Commit: `feat(db): pure id-documents split/merge helpers + tests`.

### Task 3: Raw encrypted-column accessors on the db layer

**Files:**
- Modify: `packages/db/src/burner-profile.ts`

- [ ] **Step 1 — implement** (append to `burner-profile.ts`):

```ts
/** Raw text read of the two ID-number ciphertext columns (no decrypt). */
export async function getIdDocumentColumns(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select({
      passportEncrypted: schema.users.passportEncrypted,
      saIdEncrypted: schema.users.saIdEncrypted,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Raw text write of the two ID-number ciphertext columns. */
export async function setIdDocumentColumns(
  userId: string,
  cols: { passportEncrypted: string | null; saIdEncrypted: string | null },
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ ...cols, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}
```

- [ ] **Step 2:** `pnpm --filter @camp404/db typecheck` → PASS.
- [ ] **Step 3:** Commit: `feat(db): raw accessors for the ID-document encrypted columns`.

### Task 4: `users.ts` backend — encrypt on write, decrypt on read

**Files:**
- Modify: `apps/web/lib/users.ts`
- Modify: `apps/web/lib/test-store.ts`

- [ ] **Step 1 — test-store:** add an in-memory map and methods to `test-store.ts`:

```ts
// id documents (raw in test mode — no crypto)
private idDocs = new Map<string, { idType: string | null; idNumber: string | null }>();
setIdDocuments(userId: string, id: { idType: string | null; idNumber: string | null }) {
  this.idDocs.set(userId, id);
}
getIdDocuments(userId: string) {
  return this.idDocs.get(userId) ?? null;
}
```
(Also clear `idDocs` in the store's existing `reset()`.)

- [ ] **Step 2 — users.ts:** import the helpers and extend the backend:

```ts
import { encrypt, decryptOrNull } from "@camp404/db/crypto";
import { idColumnsFor } from "@camp404/db/id-documents";
import {
  getIdDocumentColumns,
  setIdDocumentColumns,
} from "@camp404/db/burner-profile";
```
Add to `UserBackend`:
```ts
setIdDocuments(userId: string, id: { idType: string | null; idNumber: string | null }): Promise<void>;
getIdDocuments(userId: string): Promise<{ idType: string | null; idNumber: string | null } | null>;
```
`realBackend`:
```ts
async setIdDocuments(userId, id) {
  await setIdDocumentColumns(userId, idColumnsFor(id.idType, id.idNumber ? encrypt(id.idNumber) : null));
},
async getIdDocuments(userId) {
  const cols = await getIdDocumentColumns(userId);
  if (!cols) return null;
  const passport = decryptOrNull(cols.passportEncrypted);
  const saId = decryptOrNull(cols.saIdEncrypted);
  if (passport) return { idType: "passport", idNumber: passport };
  if (saId) return { idType: "sa_id", idNumber: saId };
  return { idType: null, idNumber: null };
},
```
`testBackend`:
```ts
async setIdDocuments(userId, id) { testStore.setIdDocuments(userId, id); },
async getIdDocuments(userId) { return testStore.getIdDocuments(userId); },
```
Exported wrappers:
```ts
export async function setIdDocuments(userId: string, id: { idType: string | null; idNumber: string | null }) {
  const store = isE2ETestMode() ? testBackend : realBackend;
  await store.setIdDocuments(userId, id);
}
export async function getIdDocuments(userId: string) {
  const store = isE2ETestMode() ? testBackend : realBackend;
  return store.getIdDocuments(userId);
}
```

- [ ] **Step 3:** `pnpm --filter @camp404/web typecheck` → PASS.
- [ ] **Step 4:** Commit: `feat(users): id-document encrypt-on-write / decrypt-on-read backend`.

### Task 5: Encrypt at the onboarding + replay write boundaries

**Files:**
- Modify: `apps/web/app/onboarding/questionnaire/actions.ts`
- Modify: `apps/web/lib/forms.ts`

- [ ] **Step 1 — onboarding `saveBurnerProfile`:** after computing `responses`, split + persist:

```ts
import { splitIdNumber } from "@camp404/db/id-documents";
import { setIdDocuments } from "@/lib/users";
// ...
const { cleaned, idType, idNumber } = splitIdNumber(responses);
await upsertBurnerProfile({
  userId: campUser.id,
  version: QUESTIONNAIRE.version,
  responses: cleaned,
  markComplete: final,
});
if (idNumber) await setIdDocuments(campUser.id, { idType, idNumber });
```
(The `profile.image` mirror below stays, reading from `cleaned`/`responses` — `profile.image` is untouched by the split.)

- [ ] **Step 2 — replay `BURNER_PROFILE.save` / `load`** in `forms.ts`:
  - `save`: split before `upsertBurnerProfile`, then `setIdDocuments`. Import `splitIdNumber` from `@camp404/db/id-documents` and `setIdDocuments`/`getIdDocuments` from `./users`.
  - `load`: after reading the profile, `mergeIdNumber(profile.responses, await getIdDocuments(userId) ?? {idType:null,idNumber:null})` so the owner's replay form pre-fills.

- [ ] **Step 3:** `pnpm --filter @camp404/web typecheck` → PASS.
- [ ] **Step 4:** Commit: `feat(onboarding): encrypt id.number at intake + replay; strip from responses`.

### Task 6: Stop the MCP + change-log leaks

**Files:**
- Modify: `apps/web/lib/mcp/tools/profile.ts`
- Modify: `apps/web/app/tools/forms/[key]/actions.ts`

- [ ] **Step 1 — `get_my_burner_profile`:** strip the key before returning:

```ts
import { splitIdNumber } from "@camp404/db/id-documents";
// in handler, after fetching row:
if (!row) return null;
return { ...row, responses: splitIdNumber(row.responses as Record<string, unknown>).cleaned };
```

- [ ] **Step 2 — `update_my_burner_profile`:** route id out of `responses` into the encrypted column instead of persisting plaintext:

```ts
const { cleaned, idType, idNumber } = splitIdNumber(args.responses);
// persist `cleaned` instead of args.responses (both insert + onConflict set)
// then, if idNumber: encrypt into the column for idType (reuse idColumnsFor + encrypt + setIdDocumentColumns, or the users setIdDocuments wrapper)
```
(Use the `setIdDocuments` wrapper from `@/lib/users` so test-mode is honoured.)

- [ ] **Step 3 — change-log** in `tools/forms/[key]/actions.ts`: exclude `id.number` from the diff so no plaintext reaches `questionnaire_edits`:

```ts
import { ID_NUMBER_KEY } from "@camp404/db/id-documents";
const changes = diffResponses(form.questionnaire, state.responses, result.responses)
  .filter((c) => c.questionId !== ID_NUMBER_KEY);
```
(Confirm the change object's field name is `questionId` against `@camp404/types` `QuestionnaireFieldChange`; adjust if it's `id`.)

- [ ] **Step 4:** `pnpm --filter @camp404/web typecheck` → PASS.
- [ ] **Step 5:** Commit: `fix(mcp): stop leaking plaintext id.number via burner-profile tool + change-log`.

### Task 7: Captain decrypt path (member detail)

**Files:**
- Modify: `packages/db/src/roster.ts` (`getCampMemberDetail` + `CampMemberDetail`)
- Modify: `apps/web/app/captains/camp-management/actions.ts`
- Modify: `apps/web/lib/__tests__/id-documents.test.ts` (render integration)

- [ ] **Step 1 — roster:** add `passportEncrypted`/`saIdEncrypted` to the `getCampMemberDetail` select and to the `CampMemberDetail` interface (raw text, no decrypt in the db layer).
- [ ] **Step 2 — captain action:** in `getMemberDetailAction` (already behind `requireCaptain`), decrypt + merge before presenting:

```ts
import { decryptOrNull } from "@camp404/db/crypto";
import { mergeIdNumber } from "@camp404/db/id-documents";
// ...
const passport = decryptOrNull(detail.passportEncrypted);
const saId = decryptOrNull(detail.saIdEncrypted);
const id = passport
  ? { idType: "passport", idNumber: passport }
  : saId ? { idType: "sa_id", idNumber: saId } : { idType: null, idNumber: null };
const responses = mergeIdNumber(detail.responses, id);
return { ok: true, member: presentMemberDetail({ ...detail, responses }) };
```

- [ ] **Step 3 — render test** (append to `id-documents.test.ts`): `presentMemberDetail` shows the ID row once merged:

```ts
import { presentMemberDetail } from "../member-detail";
it("captain sees id.number once merged into responses", () => {
  const detail: any = {
    id: "u1", displayName: "X", rank: "member", approvalStatus: "approved",
    approvalDecidedAt: null, approvalDecidedByName: null, onboardingComplete: true,
    onboardingVersion: "v", inviteCode: null, inviteNote: null, invitedByName: null,
    createdAt: new Date(),
    responses: mergeIdNumber({ "id.type": "passport" }, { idType: "passport", idNumber: "A12345678" }),
  };
  const flat = presentMemberDetail(detail).profileSections.flatMap((s) => s.items);
  expect(flat.some((i) => i.value === "A12345678")).toBe(true);
});
```

- [ ] **Step 4:** Run `pnpm --filter @camp404/web exec vitest run lib/__tests__/id-documents.test.ts` → PASS.
- [ ] **Step 5:** Commit: `feat(captains): decrypt + show member id.number behind the captain gate`.

### Task 8: Idempotent backfill (admin-cli)

**Files:**
- Create: `apps/admin-cli/src/backfill-id-encryption.ts`
- Modify: `apps/admin-cli/src/index.ts` (register the command)

- [ ] **Step 1 — implement** the backfill using the pooled (transactional) driver:

```ts
import { createPooledDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@camp404/db/crypto";
import { splitIdNumber, idColumnsFor } from "@camp404/db/id-documents";

export async function backfillIdEncryption(): Promise<{ scanned: number; migrated: number }> {
  const { db, pool } = createPooledDb();
  let scanned = 0, migrated = 0;
  try {
    const profiles = await db.select().from(schema.burnerProfiles);
    for (const p of profiles) {
      scanned++;
      const { cleaned, idType, idNumber } = splitIdNumber(p.responses as Record<string, unknown>);
      if (!idNumber) continue; // already migrated / nothing to do — idempotent
      await db.transaction(async (tx) => {
        await tx.update(schema.users)
          .set(idColumnsFor(idType, encrypt(idNumber)))
          .where(eq(schema.users.id, p.userId));
        await tx.update(schema.burnerProfiles)
          .set({ responses: cleaned })
          .where(eq(schema.burnerProfiles.userId, p.userId));
      });
      migrated++;
    }
    return { scanned, migrated };
  } finally {
    await pool.end();
  }
}
```
(Confirm `createPooledDb`'s return shape against `packages/db/src/index.ts`; adjust `{ db, pool }` destructure to match.)

- [ ] **Step 2:** Register a `backfill-id-encryption` subcommand in `apps/admin-cli/src/index.ts` that calls it and prints `{ scanned, migrated }`.
- [ ] **Step 3:** `pnpm --filter @camp404/admin-cli typecheck` → PASS.
- [ ] **Step 4:** Commit: `feat(admin-cli): idempotent backfill of plaintext ids into encrypted columns`.

### Task 9: Correct the stale note + full gate

**Files:**
- Modify: `apps/web/lib/questionnaire.ts`

- [ ] **Step 1:** Replace the PII NOTE (lines ~16-20) to state that `id.number` is now split out and encrypted into `users.passport_encrypted`/`sa_id_encrypted`, decrypted only for the owner and captains, and that DOB intentionally stays in `responses`.
- [ ] **Step 2:** Run the full gate from repo root: `pnpm turbo run lint typecheck test` → all PASS.
- [ ] **Step 3:** Commit: `docs: correct burner-profile PII note now that ids are encrypted`.

---

## Self-review

**Spec coverage:** encrypt-at-intake (T5) ✓; replay save/load (T5) ✓; MCP get/update strip (T6) ✓; change-log exclusion (T6) ✓; captain decrypt (T7) ✓; owner decrypt via existing `get_my_id_documents` (unchanged) ✓; backfill (T8) ✓; crypto move (T1) ✓; DOB stays (T9 note) ✓; tests (T2, T7) ✓.

**Placeholder scan:** two "confirm against source" notes (the `QuestionnaireFieldChange` field name in T6, the `createPooledDb` return shape in T8) are verification steps, not unresolved design — both are resolved by reading the named file during that task.

**Type consistency:** `{ idType, idNumber }` shape is used identically across `splitIdNumber`, `setIdDocuments`/`getIdDocuments`, `mergeIdNumber`, and the captain action. `idColumnsFor` returns the `{ passportEncrypted, saIdEncrypted }` shape consumed by `setIdDocumentColumns`.

**Out of scope (later sub-projects):** server-side ID *format* validation (Luhn/passport) → B.
