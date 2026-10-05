import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as OAuth from "@/lib/mcp/oauth";

// Client registration is open to anyone (RFC 7591), so its input is bounded
// and its rate is limited: an oversized or malformed request stores nothing,
// the per-address allowances (an IPv6 /64 counting as one address) stop a
// flood, and stored clients nobody authorized are capped by pushing out the
// oldest, so nobody is locked out.

const clientIp = vi.hoisted(() => ({ value: "203.0.113.9" }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: { limit: vi.fn() },
  getClientIp: () => clientIp.value,
}));
vi.mock("@/lib/mcp/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof OAuth>()),
  registerClient: vi.fn(),
  makeRoomForClient: vi.fn(),
}));

import { POST } from "./route";
import { rateLimiter } from "@/lib/rate-limit";
import { makeRoomForClient, registerClient } from "@/lib/mcp/oauth";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function register(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://camp.test/api/mcp/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = { client_name: "Claude", redirect_uris: [REDIRECT] };

beforeEach(() => {
  vi.clearAllMocks();
  clientIp.value = "203.0.113.9";
  vi.mocked(makeRoomForClient).mockResolvedValue(true);
  vi.mocked(rateLimiter.limit).mockResolvedValue({
    ok: true,
    retryAfterSeconds: 0,
  });
  vi.mocked(registerClient).mockImplementation(async (input) => ({
    clientId: "client-1",
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    scope: input.scope ?? null,
    createdAt: new Date(),
  }));
});

describe("POST /api/mcp/oauth/register", () => {
  it("registers a well-formed client with the one scope", async () => {
    const res = await POST(register(valid));
    expect(res.status).toBe(201);
    expect(registerClient).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUris: [REDIRECT], scope: "mcp:user" }),
    );
  });

  it("refuses oversized input and stores nothing", async () => {
    const cases: [string, unknown, Record<string, string>?][] = [
      [
        "a redirect URI over 512 characters",
        { ...valid, redirect_uris: [`${REDIRECT}?${"a".repeat(600)}`] },
      ],
      [
        "more than ten redirect URIs",
        {
          ...valid,
          redirect_uris: Array.from(
            { length: 11 },
            (_, i) => `${REDIRECT}${i}`,
          ),
        },
      ],
      ["a scope over 100 characters", { ...valid, scope: "x".repeat(101) }],
      ["a scope that isn't ours", { ...valid, scope: "mcp:user admin" }],
      [
        "a body over 16 KB",
        { ...valid, client_name: "Claude", padding: "a".repeat(17_000) },
      ],
      ["a declared length over 16 KB", valid, { "content-length": "20000" }],
    ];
    for (const [what, body, headers] of cases) {
      const res = await POST(register(body, headers));
      expect(res.status, what).toBeGreaterThanOrEqual(400);
      expect(res.status, what).toBeLessThan(429);
    }
    expect(registerClient).not.toHaveBeenCalled();
  });

  it("refuses redirect URIs the OAuth rules forbid", async () => {
    for (const uri of [
      "https://claude.ai/cb#frag",
      "https://user:pass@claude.ai/cb",
      "http://claude.ai/cb",
      "https://claude.ai.evil.example/cb",
      "javascript:alert(1)",
    ]) {
      const res = await POST(register({ ...valid, redirect_uris: [uri] }));
      expect(res.status, uri).toBe(400);
    }
    expect(registerClient).not.toHaveBeenCalled();
  });

  it("is rate-limited per address per minute and per day", async () => {
    await POST(register(valid));
    const calls = vi.mocked(rateLimiter.limit).mock.calls;
    expect(calls).toEqual([
      ["mcp-register:203.0.113.9", { limit: 20, windowMs: 60_000 }],
      ["mcp-register-day:203.0.113.9", { limit: 50, windowMs: 86_400_000 }],
    ]);

    for (const refused of [0, 1]) {
      vi.clearAllMocks();
      vi.mocked(rateLimiter.limit).mockImplementation(async () => {
        const n = vi.mocked(rateLimiter.limit).mock.calls.length - 1;
        return n === refused
          ? { ok: false, retryAfterSeconds: 30 }
          : { ok: true, retryAfterSeconds: 0 };
      });
      const res = await POST(register(valid));
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("30");
      expect(registerClient).not.toHaveBeenCalled();
    }
  });

  it("counts every address in one IPv6 /64 as one", async () => {
    for (const ip of [
      "2001:db8:abcd:12::1",
      "2001:0db8:abcd:0012:ffff:1:2:3",
      "2001:db8:abcd:12:8000::",
    ]) {
      clientIp.value = ip;
      await POST(register(valid));
    }
    const keys = vi
      .mocked(rateLimiter.limit)
      .mock.calls.map(([key]) => key)
      .filter((key) => key.startsWith("mcp-register:"));
    expect(new Set(keys)).toEqual(
      new Set(["mcp-register:2001:db8:abcd:12::/64"]),
    );
  });

  it("makes room among clients nobody authorized instead of refusing a newcomer", async () => {
    const res = await POST(register(valid));
    expect(res.status).toBe(201);
    expect(makeRoomForClient).toHaveBeenCalledOnce();
    // No camp-wide daily refusal any more.
    expect(
      vi
        .mocked(rateLimiter.limit)
        .mock.calls.some(([key]) => key === "mcp-register-day:all"),
    ).toBe(false);

    // Only when every stored one is mid sign-in is it refused, for now.
    vi.mocked(makeRoomForClient).mockResolvedValue(false);
    const flooded = await POST(register(valid));
    expect(flooded.status).toBe(429);
    expect(registerClient).toHaveBeenCalledOnce();
  });
});
