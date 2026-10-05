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
vi.mock("@/lib/mcp/scope", () => ({ getMcpScope: vi.fn() }));
vi.mock("@/lib/mcp/oauth", () => ({
  DEFAULT_SCOPE: "camp",
  findClient: vi.fn(),
  isAllowedScope: vi.fn(() => true),
  issueAuthCode: vi.fn(),
}));

import { GET, POST } from "./route";
import {
  findUserByAuthId,
  getBurnerProfileByUserId,
} from "@camp404/db/burner-profile";
import { getAuthenticatedUser } from "@/lib/auth";
import { findClient, issueAuthCode } from "@/lib/mcp/oauth";
import { getMcpScope } from "@/lib/mcp/scope";

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
    clientName: "Claude",
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

describe("GET /api/mcp/oauth/authorize (the consent screen)", () => {
  function consent(): Request {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "claude",
      redirect_uri: REDIRECT,
      code_challenge: "challenge",
      code_challenge_method: "S256",
      scope: "mcp:user",
    });
    return new Request(
      `https://camp.test/api/mcp/oauth/authorize?${params.toString()}`,
    );
  }

  const scopeOf = (
    viewerRank: "camp_member" | "team_lead" | "captain",
    leadTeams: string[] = [],
  ) => ({
    campUserId: "camp-1",
    rank: viewerRank === "captain" ? "captain" : "member",
    viewerRank,
    leadTeams,
    memberTeams: leadTeams,
    isDriver: false,
    isCaptain: viewerRank === "captain",
  });

  it("says the connector acts as the person, writes included, and what stays out", async () => {
    vi.mocked(getMcpScope).mockResolvedValue(scopeOf("camp_member") as never);
    const res = await GET(consent());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("Read your basic profile");
    expect(html).toContain(
      "Act as you: read and change what your rank allows, except ID numbers, bank details and website-only actions.",
    );
    expect(html).toContain("As a member, that covers: You,");
    expect(html).not.toContain("Camp settings");
  });

  it("names the wider reach of a captain", async () => {
    vi.mocked(getMcpScope).mockResolvedValue(scopeOf("captain") as never);
    const html = await (await GET(consent())).text();
    expect(html).toContain("As a captain, that covers:");
    expect(html).toContain("Invites and audit");
  });
});
