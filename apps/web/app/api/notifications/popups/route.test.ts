import { beforeEach, describe, expect, it, vi } from "vitest";

// The gate claims pop-ups here to show them as toasts. Claiming marks them
// read, so nothing may be claimed for a caller who will not see a toast.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({ claimPopups: vi.fn() }));

import { POST } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { claimPopups } from "@/lib/notifications";

const ANNOUNCEMENT = "3f2b8a4e-6c1d-4e9a-9b7f-2d5c8e1a0b44";

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
  vi.mocked(claimPopups).mockResolvedValue([
    {
      deliveryId: "d1",
      title: "Water run",
      body: "Truck leaves at 9.",
      refType: "announcement",
      refId: ANNOUNCEMENT,
      createdAt: new Date(),
    },
    {
      deliveryId: "d2",
      title: "Old notice",
      body: "No reference.",
      refType: null,
      refId: null,
      createdAt: new Date(),
    },
  ]);
});

describe("POST /api/notifications/popups", () => {
  it("refuses a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(claimPopups).not.toHaveBeenCalled();
  });

  it("claims nothing without camp access or approval", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect(await (await POST()).json()).toEqual({ popups: [] });
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(false);
    expect(await (await POST()).json()).toEqual({ popups: [] });
    expect(claimPopups).not.toHaveBeenCalled();
  });

  it("returns the claimed pop-ups with where each one opens", async () => {
    expect(await (await POST()).json()).toEqual({
      popups: [
        {
          deliveryId: "d1",
          title: "Water run",
          body: "Truck leaves at 9.",
          link: `/announcements/${ANNOUNCEMENT}`,
        },
        {
          deliveryId: "d2",
          title: "Old notice",
          body: "No reference.",
          link: "/notifications",
        },
      ],
    });
    expect(claimPopups).toHaveBeenCalledWith("user-1");
  });
});
