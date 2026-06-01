import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for getAuthenticatedUser, focused on the read-only fallback that
// keeps the home/landing route (`/`) from 500ing when Neon Auth's getSession
// tries to refresh its cache cookie mid-render (Next.js forbids cookie writes
// during an RSC render). Collaborators are mocked; the fallback's upstream
// call is exercised via a stubbed global fetch.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/neon-auth", () => ({ auth: { getSession: vi.fn() } }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { getAuthenticatedUser } from "@/lib/auth";
import { auth } from "@/lib/neon-auth";
import { cookies, headers } from "next/headers";

const SESSION_TOKEN_COOKIE = "__Secure-neon-auth.session_token";

function mockCookies(jar: { name: string; value: string }[]) {
  vi.mocked(cookies).mockResolvedValue({
    getAll: () => jar,
    get: (name: string) => jar.find((c) => c.name === name),
  } as never);
}

function mockHeaders(map: Record<string, string> = {}) {
  vi.mocked(headers).mockResolvedValue({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  } as never);
}

const cookieWriteError = new Error(
  "Cookies can only be modified in a Server Action or Route Handler.",
);

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies([]);
    mockHeaders();
    process.env.NEON_AUTH_BASE_URL = "https://auth.example.test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.NEON_AUTH_BASE_URL;
  });

  it("maps the Neon Auth session user onto AuthenticatedUser", async () => {
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: "u1", email: "m@example.com", name: "Member" } },
    } as never);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      id: "u1",
      primaryEmail: "m@example.com",
      displayName: "Member",
    });
  });

  it("returns null when there is no session", async () => {
    vi.mocked(auth.getSession).mockResolvedValue({ data: null } as never);
    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });

  it("falls back to a read-only fetch when getSession throws the RSC cookie-write error", async () => {
    vi.mocked(auth.getSession).mockRejectedValue(cookieWriteError);
    mockCookies([{ name: SESSION_TOKEN_COOKIE, value: "tok" }]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u2", email: "a@b.c", name: "Ann" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      id: "u2",
      primaryEmail: "a@b.c",
      displayName: "Ann",
    });
    // Read-only: forwards the session cookie, never writes one back.
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(String(call?.[0])).toContain("https://auth.example.test/get-session");
    const init = call?.[1] as { headers: Record<string, string> };
    expect(init.headers.Cookie).toContain(SESSION_TOKEN_COOKIE);
  });

  it("skips the fallback fetch and returns null when no session token is present", async () => {
    vi.mocked(auth.getSession).mockRejectedValue(cookieWriteError);
    mockCookies([{ name: "__Secure-neon-auth.local.session_data", value: "x" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAuthenticatedUser()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-throws errors that are not the cookie-write error", async () => {
    const boom = new Error("auth server unreachable");
    vi.mocked(auth.getSession).mockRejectedValue(boom);
    await expect(getAuthenticatedUser()).rejects.toThrow("auth server unreachable");
  });
});
