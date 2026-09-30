import { beforeEach, describe, expect, it, vi } from "vitest";

// Reading a claim's receipt (#242): the member who claimed and the Finance
// team (captains and Finance leads) get it; anyone else, the lead who
// approves the claim included, is refused whoever holds the link. Every read
// by someone other than the member is recorded.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/users", () => ({
  findCampUserByAuthId: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@/lib/claims", () => ({ getClaimFile: vi.fn() }));
vi.mock("@/lib/money-gate", () => ({ moneyActionGate: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditReadAfterResponse: vi.fn() }));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () => ({
    statusCode: 200,
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("\xff\xd8\xff"));
        c.close();
      },
    }),
  })),
}));

import { get } from "@vercel/blob";
import { auditReadAfterResponse } from "@/lib/audit";
import { getAuthenticatedUser } from "@/lib/auth";
import { getClaimFile } from "@/lib/claims";
import { moneyActionGate } from "@/lib/money-gate";
import { findCampUserByAuthId } from "@/lib/users";
import { GET } from "./route";

function read(id = "f1") {
  return GET({} as Request, { params: Promise.resolve({ fileId: id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
  } as never);
  vi.mocked(getClaimFile).mockResolvedValue({
    pathname: "claim-receipts/owner/receipt-x.jpg",
    contentType: "image/jpeg",
    claimId: "c1",
    submitterId: "owner",
    team: "kitchen",
  });
  vi.mocked(moneyActionGate).mockResolvedValue({
    ok: false,
    error: "Payments are for captains and Finance leads.",
  });
});

describe("GET /api/claim-receipt/[fileId]", () => {
  it("gives the member their own receipt, sandboxed and unrecorded", async () => {
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "owner" } as never);
    const res = await read();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="receipt.jpg"',
    );
    expect(res.headers.get("content-security-policy")).toBe(
      "sandbox; default-src 'none'",
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("gives it to the Finance team and records the read", async () => {
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "fin" } as never);
    vi.mocked(moneyActionGate).mockResolvedValue({
      ok: true,
      campUser: { id: "fin" },
      rank: "team_lead",
    } as never);
    expect((await read()).status).toBe(200);
    expect(auditReadAfterResponse).toHaveBeenCalledExactlyOnceWith({
      actorId: "fin",
      action: "reimbursement.receipt_viewed",
      target: "owner",
      metadata: { reimbursementId: "c1", team: "kitchen" },
    });
  });

  it("refuses the claim's own team lead and any other member, and reads no file", async () => {
    vi.mocked(findCampUserByAuthId).mockResolvedValue({
      id: "kitchen-lead",
    } as never);
    expect((await read()).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
    expect(auditReadAfterResponse).not.toHaveBeenCalled();
  });

  it("answers 401 signed out and 404 for a file that is not there", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "owner" } as never);
    vi.mocked(getClaimFile).mockResolvedValueOnce(null);
    expect((await read()).status).toBe(404);
  });
});
