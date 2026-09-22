import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getAuthenticatedUser over self-hosted Better Auth. Collaborators are mocked;
// what is asserted is the mapping, the E2E cookie's precedence, and the two
// ways a read ends without a member: no session, and a deployment that may not
// serve auth at all.

const getSession = vi.hoisted(() => vi.fn());
const authMayServe = vi.hoisted(() => vi.fn(() => true));
vi.mock("@camp404/auth", () => ({ auth: { api: { getSession } }, authMayServe }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { getAuthenticatedUser } from "@/lib/auth";
import { isE2ETestMode } from "@/lib/test-mode";
import { cookies, headers } from "next/headers";

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMayServe.mockReturnValue(true);
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
  });

  afterEach(() => {
    vi.mocked(isE2ETestMode).mockReturnValue(false);
  });

  it("maps the Better Auth session user onto AuthenticatedUser", async () => {
    getSession.mockResolvedValue({
      user: { id: "u1", email: "m@example.com", name: "Member" },
    });
    await expect(getAuthenticatedUser()).resolves.toEqual({
      id: "u1",
      primaryEmail: "m@example.com",
      displayName: "Member",
    });
  });

  it("returns null when there is no session", async () => {
    getSession.mockResolvedValue(null);
    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });

  it("fails closed where auth may not serve, without reading a cookie", async () => {
    authMayServe.mockReturnValue(false);
    getSession.mockResolvedValue({ user: { id: "forged" } });
    await expect(getAuthenticatedUser()).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("lets a real failure surface instead of signing everyone out", async () => {
    getSession.mockRejectedValue(new Error("database unreachable"));
    await expect(getAuthenticatedUser()).rejects.toThrow("database unreachable");
  });

  it("prefers the E2E test cookie in test mode", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    vi.mocked(cookies).mockResolvedValue({
      get: () => ({
        value: encodeURIComponent(
          JSON.stringify({ id: "t1", primaryEmail: "t@x", displayName: "T" }),
        ),
      }),
    } as never);
    await expect(getAuthenticatedUser()).resolves.toEqual({
      id: "t1",
      primaryEmail: "t@x",
      displayName: "T",
    });
    expect(getSession).not.toHaveBeenCalled();
  });
});
