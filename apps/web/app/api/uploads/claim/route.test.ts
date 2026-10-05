import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's claim with its receipts (#242). What matters is what the route
// does NOT do: it takes no claim without a receipt, stores no file whose
// first bytes are not a PDF or a photo (a type is only the browser's claim),
// leaves no file behind for a claim that was refused, and never answers with
// a blob's own address. The request is stubbed down to formData() and
// headers, as in the proof-of-payment route's test.

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
    pathname: pathname.replace("receipt.", "receipt-abc123."),
    url: "https://blob.example/private/secret",
  })),
  del: vi.fn(async () => undefined),
}));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(async () => ({ id: "camp-1" })),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/claims", () => ({
  submitClaim: vi.fn(async () => ({ ok: true, id: "c1" })),
}));

import { del, put } from "@vercel/blob";
import { getAuthenticatedUser } from "@/lib/auth";
import { submitClaim } from "@/lib/claims";
import { isApproved } from "@/lib/users";
import { POST } from "./route";

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
// A real photo with a camera's EXIF and a GPS position in it.
const JPG = [
  ...readFileSync(
    join(__dirname, "../../../../lib/__tests__/fixtures/gps-photo.jpg"),
  ),
];
const HTML = [0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0, 0];

function upload(
  files: { bytes: number[]; type: string }[],
  fields: Record<string, string> = {},
): Request {
  const form = new FormData();
  for (const f of files) {
    form.append(
      "receipt",
      new File([new Uint8Array(f.bytes)], "receipt", { type: f.type }),
    );
  }
  const values = {
    team: "kitchen",
    description: "Gas bottle refill",
    amountCents: "45000",
    spentOn: "2027-03-02",
    accountType: "sa",
    accountDetails: "Mem Ber, FNB 62000000000, branch 250655",
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

describe("POST /api/uploads/claim", () => {
  it("stores each receipt privately in the member's folder and lodges the claim", async () => {
    const res = await POST(
      upload([
        { bytes: PDF, type: "application/pdf" },
        { bytes: JPG, type: "image/jpeg" },
      ]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "c1" });
    expect(put).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(put).mock.calls) {
      expect(call[0]).toMatch(/^claim-receipts\/camp-1\/receipt\./);
      expect(call[2]).toMatchObject({ access: "private" });
    }
    // The photo is stored without its EXIF; the PDF as it came.
    const [pdf, photo] = vi.mocked(put).mock.calls.map((c) => c[1] as Buffer);
    expect([...pdf!]).toEqual(PDF);
    expect(Buffer.from(JPG).includes("FixtureCam")).toBe(true);
    expect(photo!.includes("FixtureCam")).toBe(false);
    expect(submitClaim).toHaveBeenCalledExactlyOnceWith({
      submitterId: "camp-1",
      cycle: 2027,
      team: "kitchen",
      description: "Gas bottle refill",
      amountCents: 45000,
      spentOn: "2027-03-02",
      accountType: "sa",
      accountDetails: "Mem Ber, FNB 62000000000, branch 250655",
      files: [
        {
          pathname: "claim-receipts/camp-1/receipt-abc123.pdf",
          contentType: "application/pdf",
        },
        {
          pathname: "claim-receipts/camp-1/receipt-abc123.jpg",
          contentType: "image/jpeg",
        },
      ],
    });
  });

  it("refuses a claim with no receipt, and stores nothing", async () => {
    const res = await POST(upload([]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Add at least one receipt: a photo or a PDF.",
    );
    expect(put).not.toHaveBeenCalled();
    expect(submitClaim).not.toHaveBeenCalled();
  });

  it("refuses a file that is not what its type says, and stores none of them", async () => {
    const res = await POST(
      upload([
        { bytes: PDF, type: "application/pdf" },
        { bytes: HTML, type: "image/png" },
      ]),
    );
    expect(res.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
    expect(submitClaim).not.toHaveBeenCalled();
  });

  it("refuses a form that is not whole, before any file is stored", async () => {
    const res = await POST(
      upload([{ bytes: PDF, type: "application/pdf" }], { accountDetails: "" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Add the bank account to pay you back into.",
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("takes the files back out when the claim is refused", async () => {
    vi.mocked(submitClaim).mockResolvedValueOnce({
      ok: false,
      error: "That member isn't in the camp.",
    });
    const res = await POST(upload([{ bytes: PDF, type: "application/pdf" }]));
    expect(res.status).toBe(400);
    expect(del).toHaveBeenCalledExactlyOnceWith(
      ["claim-receipts/camp-1/receipt-abc123.pdf"],
      { token: "vercel_blob_rw_test" },
    );
  });

  it("refuses a member who is not approved", async () => {
    vi.mocked(isApproved).mockReturnValue(false);
    expect(
      (await POST(upload([{ bytes: PDF, type: "application/pdf" }]))).status,
    ).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });
});
