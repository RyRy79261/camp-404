import { beforeEach, describe, expect, it, vi } from "vitest";

// The blob proxy serves each prefix to its own audience: photos to approved
// members, builder pictures to anyone camp-active, and nothing else.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  findCampUserByAuthId: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@vercel/blob", () => ({ get: vi.fn() }));

import { GET } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { findCampUserByAuthId, hasCampAccess, isApproved } from "@/lib/users";
import { get } from "@vercel/blob";

const req = (pathname: string) =>
  new Request(
    `https://camp.test/api/avatar?pathname=${encodeURIComponent(pathname)}`,
  );

describe("GET /api/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "m@example.com",
    } as never);
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/jpeg" },
    } as never);
  });

  it("serves a builder picture to a camp-active applicant who is not approved", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(false);
    const res = await GET(req("builder-images/camp-map/image-abc.jpg"));
    expect(res.status).toBe(200);
  });

  it("keeps member photos for approved members only", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(false);
    expect((await GET(req("avatars/auth-2/avatar-x.webp"))).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("refuses a builder picture to someone with no camp access", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect(
      (await GET(req("builder-images/camp-map/image-abc.jpg"))).status,
    ).toBe(401);
  });

  it("serves no other prefix, even to an approved member", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(true);
    expect((await GET(req("receipts/r1.png"))).status).toBe(404);
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });
});
