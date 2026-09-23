import { beforeEach, describe, expect, it, vi } from "vitest";

// The consent approve is a state-changing form post: it issues an auth code
// for whoever is signed in. SameSite=Lax is otherwise its only CSRF defence,
// so a present Origin must name this host. The load-bearing assertion for a
// foreign post is that no code was issued, not only the status.

vi.mock("@camp404/db/burner-profile", () => ({
  findUserByAuthId: vi.fn(),
  getBurnerProfileByUserId: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));
vi.mock("@/lib/mcp/oauth", () => ({
  DEFAULT_SCOPE: "camp",
  findClient: vi.fn(),
  isAllowedScope: vi.fn(() => true),
  issueAuthCode: vi.fn(),
}));

import { POST } from "./route";
import {
  findUserByAuthId,
  getBurnerProfileByUserId,
} from "@camp404/db/burner-profile";
import { getAuthenticatedUser } from "@/lib/auth";
import { findClient, issueAuthCode } from "@/lib/mcp/oauth";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function approve(origin?: string): Request {
  const body = new URLSearchParams({
    action: "approve",
    response_type: "code",
    client_id: "claude",
    redirect_uri: REDIRECT,
    code_challenge: "challenge",
    code_challenge_method: "S256",
    state: "st",
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (origin !== undefined) headers.origin = origin;
  return new Request("https://camp.test/api/mcp/oauth/authorize", {
    method: "POST",
    headers,
    body: body.toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findClient).mockResolvedValue({
    clientId: "claude",
    redirectUris: [REDIRECT],
  } as never);
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "m@example.com",
    displayName: "Member",
  } as never);
  vi.mocked(findUserByAuthId).mockResolvedValue({ id: "camp-1" } as never);
  vi.mocked(getBurnerProfileByUserId).mockResolvedValue({
    completedAt: new Date(),
  } as never);
  vi.mocked(issueAuthCode).mockResolvedValue("the-code" as never);
});

describe("POST /api/mcp/oauth/authorize (consent approve)", () => {
  it("refuses a post from another site, and issues no code", async () => {
    const res = await POST(approve("https://evil.example"));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Cross-site submission refused.");
    expect(issueAuthCode).not.toHaveBeenCalled();
  });

  it("refuses an opaque origin (null), and issues no code", async () => {
    const res = await POST(approve("null"));
    expect(res.status).toBe(403);
    expect(issueAuthCode).not.toHaveBeenCalled();
  });

  it("accepts a post from this host", async () => {
    const res = await POST(approve("https://camp.test"));
    expect(res.status).toBe(200);
    expect(issueAuthCode).toHaveBeenCalledOnce();
    expect(await res.text()).toContain("the-code");
  });

  it("accepts a post with no Origin header, as older browsers send", async () => {
    const res = await POST(approve());
    expect(res.status).toBe(200);
    expect(issueAuthCode).toHaveBeenCalledOnce();
  });
});
