import { beforeEach, describe, expect, it, vi } from "vitest";

// Dismissing a full-screen notification. The delivery is always scoped to the
// caller's own camp id from the session, never to an id in the body.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({ acknowledgeDelivery: vi.fn() }));

import { POST } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { acknowledgeDelivery } from "@/lib/notifications";

const DELIVERY = "6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function post(body: unknown) {
  return POST(
    new Request("https://camp.test/api/notifications/acknowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
    displayName: "M",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: "camp-1" } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(acknowledgeDelivery).mockResolvedValue(true);
});

describe("POST /api/notifications/acknowledge", () => {
  it("refuses a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await post({ deliveryId: DELIVERY })).status).toBe(401);
  });

  it("refuses a body without a uuid deliveryId", async () => {
    for (const body of ["not json", {}, { deliveryId: "d1" }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(acknowledgeDelivery).not.toHaveBeenCalled();
  });

  it("does nothing for an account with no camp access", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect(await (await post({ deliveryId: DELIVERY })).json()).toEqual({
      ok: false,
    });
    expect(acknowledgeDelivery).not.toHaveBeenCalled();
  });

  it("acknowledges as the session's member, ignoring a userId in the body", async () => {
    vi.mocked(acknowledgeDelivery).mockResolvedValue(false); // someone else's
    const res = await post({ deliveryId: DELIVERY, userId: "camp-other" });
    expect(await res.json()).toEqual({ ok: false });
    expect(acknowledgeDelivery).toHaveBeenCalledWith({
      deliveryId: DELIVERY,
      userId: "camp-1",
    });
  });
});
