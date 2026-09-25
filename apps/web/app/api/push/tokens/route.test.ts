import { beforeEach, describe, expect, it, vi } from "vitest";

// Device push tokens. Both methods need a camp member, and the token is
// always registered to (or removed from) the session's member.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
}));
vi.mock("@/lib/push", () => ({
  registerPushToken: vi.fn(),
  unregisterPushToken: vi.fn(),
}));

import { DELETE, POST } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { registerPushToken, unregisterPushToken } from "@/lib/push";

function request(method: "POST" | "DELETE", body: unknown) {
  return new Request("https://camp.test/api/push/tokens", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
});

describe("/api/push/tokens", () => {
  it("refuses a signed-out caller (401) and a non-member (403) on both methods", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect(
      (await POST(request("POST", { token: "t", platform: "web" }))).status,
    ).toBe(401);
    expect((await DELETE(request("DELETE", { token: "t" }))).status).toBe(401);

    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-1",
    } as never);
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect(
      (await POST(request("POST", { token: "t", platform: "web" }))).status,
    ).toBe(403);
    expect((await DELETE(request("DELETE", { token: "t" }))).status).toBe(403);

    expect(registerPushToken).not.toHaveBeenCalled();
    expect(unregisterPushToken).not.toHaveBeenCalled();
  });

  it("refuses a bad body", async () => {
    expect((await POST(request("POST", { token: "t" }))).status).toBe(400);
    expect(
      (await POST(request("POST", { token: "t", platform: "fax" }))).status,
    ).toBe(400);
    expect((await DELETE(request("DELETE", {}))).status).toBe(400);
  });

  it("registers the token to the session's member, ignoring a userId in the body", async () => {
    const res = await POST(
      request("POST", {
        token: "fcm-1",
        platform: "android",
        topics: ["announcements"],
        userId: "camp-other",
      }),
    );
    expect(res.status).toBe(200);
    expect(registerPushToken).toHaveBeenCalledWith({
      userId: "camp-1",
      token: "fcm-1",
      platform: "android",
      topics: ["announcements"],
    });
  });

  it("removes the token for the session's member", async () => {
    await DELETE(request("DELETE", { token: "fcm-1" }));
    expect(unregisterPushToken).toHaveBeenCalledWith("camp-1", "fcm-1");
  });
});
