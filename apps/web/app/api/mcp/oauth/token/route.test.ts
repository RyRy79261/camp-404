import { beforeEach, describe, expect, it, vi } from "vitest";

// The OAuth token endpoint: the body parsing and the refusals that must come
// back as OAuth errors (400 + no-store), never a bare 500.

vi.mock("@/lib/mcp/oauth", () => ({
  consumeAuthCode: vi.fn(),
  findClient: vi.fn(),
  issueAccessToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyClientSecret: vi.fn(() => true),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: { limit: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })) },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

import { POST } from "./route";
import { findClient, rotateRefreshToken } from "@/lib/mcp/oauth";

function post(body: string, contentType = "application/json") {
  return POST(
    new Request("https://camp.test/api/mcp/oauth/token", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // A public client (PKCE, no secret), as claude.ai registers.
  vi.mocked(findClient).mockResolvedValue({
    clientId: "claude",
    clientSecretHash: null,
    tokenEndpointAuthMethod: "none",
  } as never);
});

describe("POST /api/mcp/oauth/token", () => {
  it("answers a JSON body that is not an object with invalid_request", async () => {
    for (const body of ["null", "5", "[]", '"text"']) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ error: "invalid_request" });
    }
  });

  it("refuses a refresh the store will not rotate, as invalid_grant", async () => {
    // rotateRefreshToken returns null for an unknown or expired token, and
    // now also for a member who is no longer approved.
    vi.mocked(rotateRefreshToken).mockResolvedValue(null);
    const res = await post(
      JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: "rt",
        client_id: "claude",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_grant" });
  });
});
