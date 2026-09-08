import { beforeEach, describe, expect, it, vi } from "vitest";
// Type-only, so it is erased before the vi.mock factories hoist above it.
import type * as IdDocumentsModule from "@camp404/db/id-documents";

// getMemberDetailAction's tri-state ID decrypt. The defect this pins: a
// ciphertext that is ON FILE but undecryptable here (rotated PGCRYPTO_KEY,
// corrupt column) used to come back as a bare null, mergeIdNumber is a
// documented no-op on a null number, and the document row vanished from the
// captain modal — indistinguishable from a member who never supplied an ID.
// The present-but-unreadable and genuinely-absent pairs below are what give
// ID_UNREADABLE_LABEL its meaning, so they belong together in one file.
//
// Same mock header as member-detail-action.test.ts, except @camp404/db/id-documents
// keeps its real exports: a factory replaces the WHOLE module, and the action
// reads ID_UNREADABLE_LABEL from it — restating the marker in the factory would
// only assert the test's own copy of the string back at itself.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
  decideUserApproval: vi.fn(),
}));
vi.mock("@/lib/promotion", () => ({
  getOpenPromotionForTarget: vi.fn(),
  sendCaptainPromotion: vi.fn(),
}));
vi.mock("@camp404/db/roster", () => ({ getCampMemberDetail: vi.fn() }));
vi.mock("@camp404/db/crypto", () => ({
  decryptOrNull: vi.fn(() => null),
  decryptField: vi.fn(() => ({ state: "absent", value: null })),
}));
vi.mock("@camp404/db/id-documents", async (importOriginal) => ({
  ...(await importOriginal<typeof IdDocumentsModule>()),
  mergeIdNumber: vi.fn(() => ({})),
}));
vi.mock("@/lib/member-detail", () => ({
  presentMemberDetail: vi.fn(() => ({ id: "member-1" })),
}));
vi.mock("@/lib/questionnaire-config", () => ({
  getQuestionnaireForResponses: vi.fn(async () => ({
    version: "test",
    pages: [],
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getMemberDetailAction } from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getOpenPromotionForTarget } from "@/lib/promotion";
import { getCampMemberDetail } from "@camp404/db/roster";
import { decryptField } from "@camp404/db/crypto";
import { ID_UNREADABLE_LABEL, mergeIdNumber } from "@camp404/db/id-documents";
import { presentMemberDetail } from "@/lib/member-detail";

const CAPTAIN = "cap-1";
const PASSPORT_NUMBER = "A12345678";
const SA_ID_NUMBER = "9001015800089";

function signInAsCaptain() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-cap",
    primaryEmail: "cap@example.com",
    displayName: "Cap",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({
    id: CAPTAIN,
    rank: "captain",
  } as never);
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    rank: "member",
    responses: { "profile.name": "Ash" },
    // The action decrypts whatever these hold; the mocked decryptField below
    // is what decides the state, so the column values only have to be truthy
    // where a real deployment would hold ciphertext.
    passportEncrypted: "passport-ciphertext",
    saIdEncrypted: "sa-id-ciphertext",
    ...overrides,
  };
}

type FieldState =
  | { state: "absent"; value: null }
  | { state: "ok"; value: string }
  | { state: "unreadable"; value: null };

const absent: FieldState = { state: "absent", value: null };
const unreadable: FieldState = { state: "unreadable", value: null };
const ok = (value: string): FieldState => ({ state: "ok", value });

/** Drive the two decryptField reads in call order: passport, then sa_id. */
function decryptsAs(passport: FieldState, saId: FieldState) {
  vi.mocked(decryptField)
    .mockReturnValueOnce(passport as never)
    .mockReturnValueOnce(saId as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks clears calls but NOT a queued mockReturnValueOnce, so a test
  // that primes reads it never makes (the refusal case) would otherwise leak
  // its queue into the next test. Reset drops the queue and restores the
  // header's "absent" default, keeping every case order-independent.
  vi.mocked(decryptField).mockReset();
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(getOpenPromotionForTarget).mockResolvedValue(null);
  vi.mocked(getCampMemberDetail).mockResolvedValue(detail() as never);
  vi.mocked(mergeIdNumber).mockReturnValue({});
  signInAsCaptain();
});

/** The id argument the action handed mergeIdNumber. */
function mergedId() {
  expect(mergeIdNumber).toHaveBeenCalledTimes(1);
  return vi.mocked(mergeIdNumber).mock.calls[0]![1];
}

describe("getMemberDetailAction — an unreadable ID is present, not absent", () => {
  it("merges the marker for an unreadable passport column", async () => {
    decryptsAs(unreadable, absent);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    // The row is PRESENT: mergeIdNumber is a no-op on a null number, so a null
    // here would delete the document row from the modal and read to a captain
    // as "this member never gave us an ID".
    expect(mergedId()).toEqual({
      idType: "passport",
      idNumber: ID_UNREADABLE_LABEL,
    });
    expect(mergedId().idNumber).not.toBeNull();
  });

  it("merges the marker for an unreadable sa_id column", async () => {
    decryptsAs(absent, unreadable);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    expect(mergedId()).toEqual({
      idType: "sa_id",
      idNumber: ID_UNREADABLE_LABEL,
    });
  });

  it("carries the marker through to the presenter, not just to the merge", async () => {
    decryptsAs(unreadable, absent);
    // Sentinel standing in for "responses with the marker merged in", so the
    // merged projection is provably what reaches the modal presenter.
    const merged = { "id.number": ID_UNREADABLE_LABEL, "id.type": "passport" };
    vi.mocked(mergeIdNumber).mockReturnValue(merged);

    await getMemberDetailAction("member-1");

    expect(presentMemberDetail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "member-1", responses: merged }),
      expect.anything(),
    );
  });

  it("merges nothing when BOTH columns are genuinely absent", async () => {
    decryptsAs(absent, absent);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    // The other half of the pair: with no ID on file the row still vanishes,
    // exactly as it does today. Unreadable and absent must not converge.
    expect(mergedId()).toEqual({ idType: null, idNumber: null });
  });
});

describe("getMemberDetailAction — a readable ID still reaches the captain", () => {
  it("merges the passport plaintext when it decrypts", async () => {
    decryptsAs(ok(PASSPORT_NUMBER), absent);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    expect(mergedId()).toEqual({
      idType: "passport",
      idNumber: PASSPORT_NUMBER,
    });
  });

  it("merges the sa_id plaintext when only that column decrypts", async () => {
    decryptsAs(absent, ok(SA_ID_NUMBER));

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    expect(mergedId()).toEqual({ idType: "sa_id", idNumber: SA_ID_NUMBER });
  });
});

describe("getMemberDetailAction — readable wins over unreadable", () => {
  it("prefers a readable passport over an unreadable sa_id", async () => {
    decryptsAs(ok(PASSPORT_NUMBER), unreadable);

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    // Precedence, not fallthrough: a value the captain can actually act on
    // beats a marker, and the marker never overwrites a real number.
    expect(mergedId()).toEqual({
      idType: "passport",
      idNumber: PASSPORT_NUMBER,
    });
  });

  it("prefers a readable sa_id over an unreadable passport", async () => {
    decryptsAs(unreadable, ok(SA_ID_NUMBER));

    const res = await getMemberDetailAction("member-1");

    expect(res.ok).toBe(true);
    expect(mergedId()).toEqual({ idType: "sa_id", idNumber: SA_ID_NUMBER });
  });
});

describe("getMemberDetailAction — the marker is captain-gated like the plaintext", () => {
  it("never decrypts, and never merges a marker, for a non-captain viewer", async () => {
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "m-1",
      rank: "member",
    } as never);
    decryptsAs(unreadable, unreadable);

    const res = await getMemberDetailAction("member-1");

    expect(res).toEqual({ ok: false, error: "Captain access only." });
    // Not merely an error-shaped response: the ciphertext is never SELECTed,
    // never decrypted, and the "we hold an ID for this member" signal the
    // marker carries never reaches a member-rank caller.
    expect(getCampMemberDetail).not.toHaveBeenCalled();
    expect(decryptField).not.toHaveBeenCalled();
    expect(mergeIdNumber).not.toHaveBeenCalled();
  });
});
