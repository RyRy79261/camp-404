import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's proof of payment (#240). What matters is what the route does NOT
// do: it stores no file whose first bytes are not a PDF or a photo (a type is
// only the browser's claim), writes no payment for a refused request, and
// never answers with the blob's own address. The request is stubbed down to
// formData() and headers, as in the avatar route's test (jsdom's File).

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({
    pathname: pathname.replace(".pdf", "-abc123.pdf"),
    url: "https://blob.example/private/secret",
  })),
  del: vi.fn(async () => undefined),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(async () => ({ id: "camp-1" })),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@/lib/payments", () => ({
  recordPayment: vi.fn(async () => ({
    id: "p1",
    reference: "C404-M017-2027-1",
  })),
}));

import { del, put } from "@vercel/blob";
import { MoneyRefused } from "@camp404/db/dues";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordPayment } from "@/lib/payments";
import { isApproved } from "@/lib/users";
import { POST } from "./route";

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function upload(
  bytes: number[],
  type: string,
  fields: Record<string, string> = {},
): Request {
  const form = new FormData();
  form.set("proof", new File([new Uint8Array(bytes)], "proof", { type }));
  const values = {
    amountCents: "125000",
    paidOn: "2027-01-15",
    method: "bank_transfer",
    note: "",
    ...fields,
  };
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return {
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
  } as never);
  vi.mocked(isApproved).mockReturnValue(true);
});

describe("POST /api/uploads/payment-proof", () => {
  it("stores a PDF privately in the member's folder and records a pending payment", async () => {
    const res = await POST(upload(PDF, "application/pdf", { note: " Paid " }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reference: "C404-M017-2027-1" });
    expect(JSON.stringify(body)).not.toContain("blob.example");
    expect(put).toHaveBeenCalledWith(
      "payment-proofs/camp-1/proof.pdf",
      expect.anything(),
      expect.objectContaining({
        access: "private",
        contentType: "application/pdf",
      }),
    );
    expect(recordPayment).toHaveBeenCalledExactlyOnceWith({
      userId: "camp-1",
      amountCents: 125_000,
      currency: "ZAR",
      status: "pending",
      note: "Paid",
      recordedByUserId: "camp-1",
      source: "member",
      method: "bank_transfer",
      paidOn: "2027-01-15",
      proofPathname: "payment-proofs/camp-1/proof-abc123.pdf",
      proofContentType: "application/pdf",
    });
  });

  it("refuses a file whose bytes are not what its type says, and stores nothing", async () => {
    for (const [bytes, type] of [
      [PNG, "application/pdf"],
      [PDF, "image/png"],
      [[0x3c, 0x73, 0x76, 0x67], "image/svg+xml"],
      [[0x3c, 0x68, 0x74, 0x6d], "text/html"],
    ] as const) {
      const res = await POST(upload([...bytes], type));
      expect(res.status).toBe(415);
    }
    expect(put).not.toHaveBeenCalled();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("says what is wrong with the form, and stores nothing", async () => {
    const bad = await POST(
      upload(PDF, "application/pdf", { amountCents: "0" }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: "The amount must be more than R0.",
    });
    const noDay = await POST(
      upload(PDF, "application/pdf", { paidOn: "2027-02-30" }),
    );
    expect(await noDay.json()).toEqual({ error: "Pick a date." });
    expect(put).not.toHaveBeenCalled();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("turns away someone signed out or not approved", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null);
    expect((await POST(upload(PDF, "application/pdf"))).status).toBe(401);
    vi.mocked(isApproved).mockReturnValueOnce(false);
    expect((await POST(upload(PDF, "application/pdf"))).status).toBe(403);
    expect(put).not.toHaveBeenCalled();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("takes the stored file back out when the payment is not recorded", async () => {
    vi.mocked(recordPayment).mockRejectedValueOnce(new Error("db down"));
    expect((await POST(upload(PDF, "application/pdf"))).status).toBe(500);
    expect(del).toHaveBeenCalledExactlyOnceWith(
      "payment-proofs/camp-1/proof-abc123.pdf",
      { token: "vercel_blob_rw_test" },
    );
  });

  it("takes the file back out when the payment is refused, and says why", async () => {
    vi.mocked(recordPayment).mockRejectedValueOnce(
      new MoneyRefused("Not this year."),
    );
    const res = await POST(upload(PDF, "application/pdf"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not this year." });
    expect(del).toHaveBeenCalledOnce();
  });

  it("says uploads are not set up rather than record a payment with no file", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await POST(upload(PDF, "application/pdf"))).status).toBe(501);
    expect(recordPayment).not.toHaveBeenCalled();
  });
});
