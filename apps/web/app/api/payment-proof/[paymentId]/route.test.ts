import { beforeEach, describe, expect, it, vi } from "vitest";

// Reading a proof of payment (#240): the member who sent it and the Finance
// team (captains and Finance leads) get it; anyone else, a lead of another
// team included, is refused whoever holds the link. Every read by someone
// other than the member is recorded.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/users", () => ({
  findCampUserByAuthId: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@/lib/dues", () => ({ getPaymentProof: vi.fn() }));
vi.mock("@/lib/money-gate", () => ({ moneyActionGate: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditReadAfterResponse: vi.fn() }));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () => ({
    statusCode: 200,
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("%PDF-1.7"));
        c.close();
      },
    }),
    blob: { contentType: "application/pdf" },
  })),
}));

import { get } from "@vercel/blob";
import { auditReadAfterResponse } from "@/lib/audit";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPaymentProof } from "@/lib/dues";
import { moneyActionGate } from "@/lib/money-gate";
import { findCampUserByAuthId } from "@/lib/users";
import { GET } from "./route";

function read(id = "p1") {
  return GET({} as Request, { params: Promise.resolve({ paymentId: id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
  } as never);
  vi.mocked(getPaymentProof).mockResolvedValue({
    userId: "owner",
    reference: "C404-M017-2027-1",
    pathname: "payment-proofs/owner/proof-x.pdf",
    contentType: "application/pdf",
  });
  vi.mocked(moneyActionGate).mockResolvedValue({
    ok: false,
    error: "Payments are for captains and Finance leads.",
  });
});

describe("GET /api/payment-proof/[paymentId]", () => {
  it("gives the member their own proof, unrecorded, as a download", async () => {
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "owner" } as never);
    const res = await read();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="proof-C404-M017-2027-1.pdf"',
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("gives it to the Finance team and records the read", async () => {
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "lead" } as never);
    vi.mocked(moneyActionGate).mockResolvedValue({
      ok: true,
      campUser: { id: "lead" },
      rank: "team_lead",
    } as never);
    expect((await read()).status).toBe(200);
    expect(auditReadAfterResponse).toHaveBeenCalledExactlyOnceWith({
      actorId: "lead",
      action: "payment.proof_viewed",
      target: "owner",
      metadata: { reference: "C404-M017-2027-1" },
    });
  });

  it("refuses any other member or lead, and reads no file", async () => {
    vi.mocked(findCampUserByAuthId).mockResolvedValue({
      id: "kitchen-lead",
    } as never);
    expect((await read()).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("answers 401 signed out and 404 for a payment with no proof", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "owner" } as never);
    vi.mocked(getPaymentProof).mockResolvedValueOnce(null);
    expect((await read()).status).toBe(404);
  });
});
