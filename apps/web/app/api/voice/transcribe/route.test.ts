import { beforeEach, describe, expect, it, vi } from "vitest";

// Sign-up is open, so "signed in" is not "in the camp". Every clip spends the
// camp's paid Groq key, so the load-bearing assertion for a stranger is that
// transcribeAudio was never called, not just the status.
//
// Runs under the suite's default jsdom environment (see the avatar upload
// route test). The request is stubbed down to what the handler reads:
// formData() and headers (the latter only reaches the mocked getClientIp).

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/groq", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(() => true),
  isApproved: vi.fn(() => true),
}));

import { POST } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { rateLimiter } from "@/lib/rate-limit";
import { transcribeAudio } from "@/lib/groq";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";

function clip(): Request {
  const form = new FormData();
  form.set(
    "audio",
    new File([new Uint8Array([1, 2, 3, 4])], "clip.webm", {
      type: "audio/webm",
    }),
  );
  return {
    method: "POST",
    url: "https://camp.test/api/voice/transcribe",
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "u1",
      primaryEmail: "m@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    } as never);
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      inviteCode: "CODE",
      approvalStatus: "approved",
    } as never);
    vi.mocked(hasCampAccess).mockReturnValue(true);
    vi.mocked(isApproved).mockReturnValue(true);
    vi.mocked(transcribeAudio).mockResolvedValue("hello camp");
  });

  it("answers 401 to a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const res = await POST(clip());
    expect(res.status).toBe(401);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("refuses a signed-in account with no camp access, and never calls Groq", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    const res = await POST(clip());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
    expect(hasCampAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "camp-1" }),
      "m@example.com",
    );
    expect(transcribeAudio).not.toHaveBeenCalled();
    // Refused before the rate limiter, so a stranger spends no member's budget.
    expect(rateLimiter.limit).not.toHaveBeenCalled();
  });

  it("transcribes for a member with camp access", async () => {
    const res = await POST(clip());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ text: "hello camp" });
    expect(ensureCampUser).toHaveBeenCalledOnce();
    expect(transcribeAudio).toHaveBeenCalledOnce();
  });

  it("refuses a member a captain rejected, though they hold a code", async () => {
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      inviteCode: "CODE",
      approvalStatus: "rejected",
    } as never);
    vi.mocked(isApproved).mockReturnValue(false);
    const res = await POST(clip());
    expect(res.status).toBe(403);
    expect(transcribeAudio).not.toHaveBeenCalled();
    expect(rateLimiter.limit).not.toHaveBeenCalled();
  });

  it("gives an applicant awaiting approval a daily clip budget", async () => {
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      inviteCode: "meowzit",
      approvalStatus: "pending",
    } as never);
    vi.mocked(isApproved).mockReturnValue(false);

    const res = await POST(clip());
    expect(res.status).toBe(200);
    expect(rateLimiter.limit).toHaveBeenCalledWith(
      "voice-transcribe-pending:u1",
      { limit: 40, windowMs: 24 * 60 * 60_000 },
    );
  });

  it("refuses an applicant over the daily budget, and never calls Groq", async () => {
    vi.mocked(ensureCampUser).mockResolvedValue({
      id: "camp-1",
      inviteCode: "meowzit",
      approvalStatus: "pending",
    } as never);
    vi.mocked(isApproved).mockReturnValue(false);
    vi.mocked(rateLimiter.limit).mockImplementation(async (key) =>
      key.startsWith("voice-transcribe-pending:")
        ? { ok: false, retryAfterSeconds: 3600 }
        : { ok: true, retryAfterSeconds: 0 },
    );

    const res = await POST(clip());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("spends no daily budget for an approved member", async () => {
    await POST(clip());
    expect(rateLimiter.limit).not.toHaveBeenCalledWith(
      expect.stringMatching(/^voice-transcribe-pending:/),
      expect.anything(),
    );
  });
});
