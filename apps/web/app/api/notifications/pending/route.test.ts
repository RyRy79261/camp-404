import { beforeEach, describe, expect, it, vi } from "vitest";

// The acknowledge gate polls this on every load to find full-screen messages.
// Those are for camp members: a pending or rejected applicant gets nothing,
// and nothing is read for them.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  getPendingAcknowledgements: vi.fn(),
}));

import { GET } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getPendingAcknowledgements } from "@/lib/notifications";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
    displayName: "M",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(getPendingAcknowledgements).mockResolvedValue([
    { deliveryId: "d1" },
  ] as never);
});

describe("GET /api/notifications/pending", () => {
  it("returns an empty list to a signed-out visitor", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ pending: [] });
    expect(getPendingAcknowledgements).not.toHaveBeenCalled();
  });

  it("returns an empty list without camp access", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect(await (await GET()).json()).toEqual({ pending: [] });
    expect(getPendingAcknowledgements).not.toHaveBeenCalled();
  });

  it("takes over no applicant's screen", async () => {
    vi.mocked(isApproved).mockReturnValue(false);
    expect(await (await GET()).json()).toEqual({ pending: [] });
    expect(getPendingAcknowledgements).not.toHaveBeenCalled();
  });

  it("returns an approved member's pending takeovers", async () => {
    expect(await (await GET()).json()).toEqual({
      pending: [{ deliveryId: "d1" }],
    });
    expect(getPendingAcknowledgements).toHaveBeenCalledWith("user-1");
  });
});
