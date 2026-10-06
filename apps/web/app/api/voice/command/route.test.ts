// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/voice/command (#356): captains only, after the one-time notice,
// 30 a day claimed before Groq or Claude is asked; the words never reach a
// log. The load-bearing assertions for a refusal are that Groq and Claude
// were never called.

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
  getSessionId: vi.fn(),
}));
vi.mock("@/lib/member-gate", () => ({ resolveMemberState: vi.fn() }));
vi.mock("@/lib/mcp/scope", () => ({ getMcpScope: vi.fn() }));
vi.mock("@/lib/voice/consent", () => ({ getVoiceConsent: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: { limit: vi.fn() },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@/lib/groq", async (orig) => ({
  ...(await orig<typeof import("@/lib/groq")>()),
  transcribeCommand: vi.fn(),
}));
vi.mock("@/lib/voice/service", () => ({
  runVoiceCommand: vi.fn(),
  whisperPromptFor: vi.fn(async () => "Camp 404 captain."),
}));

import { POST } from "./route";
import { getAuthenticatedUser, getSessionId } from "@/lib/auth";
import { transcribeCommand } from "@/lib/groq";
import { getMcpScope } from "@/lib/mcp/scope";
import { resolveMemberState } from "@/lib/member-gate";
import { rateLimiter } from "@/lib/rate-limit";
import { getVoiceConsent } from "@/lib/voice/consent";
import { runVoiceCommand } from "@/lib/voice/service";

const WORDS = "Sign me up for breakfast cooks on Wednesday";

function clip(headers: Record<string, string> = {}): Request {
  const form = new FormData();
  form.set(
    "audio",
    new File([new Uint8Array([1, 2, 3])], "c.webm", { type: "audio/webm" }),
  );
  return {
    method: "POST",
    url: "https://camp.test/api/voice/command",
    headers: new Headers({ host: "camp.test", ...headers }),
    formData: async () => form,
  } as unknown as Request;
}

function as(rank: "captain" | "member", block: unknown = null) {
  vi.mocked(resolveMemberState).mockResolvedValue({
    kind: "member",
    authUser: { id: "auth-1" },
    campUser: { id: "camp-1", rank, displayName: "Ryno Steyn" },
    block,
  } as never);
  vi.mocked(getMcpScope).mockResolvedValue(
    rank === "captain"
      ? ({ campUserId: "camp-1", isCaptain: true } as never)
      : ({ campUserId: "camp-1", isCaptain: false } as never),
  );
}

const nothingAsked = () => {
  expect(transcribeCommand).not.toHaveBeenCalled();
  expect(runVoiceCommand).not.toHaveBeenCalled();
};

describe("POST /api/voice/command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-1",
    } as never);
    vi.mocked(getSessionId).mockResolvedValue("session-1");
    as("captain");
    vi.mocked(getVoiceConsent).mockResolvedValue(new Date());
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    });
    vi.mocked(transcribeCommand).mockResolvedValue({
      text: WORDS,
      avgLogprob: -0.2,
      noSpeechProb: 0.01,
    });
    vi.mocked(runVoiceCommand).mockResolvedValue({
      outcome: { kind: "answers", answers: [] },
      usage: {
        calls: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  });

  it("answers a signed-out caller 401", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await POST(clip())).status).toBe(401);
    nothingAsked();
  });

  it("refuses a member: voice is for captains", async () => {
    as("member");
    const res = await POST(clip());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Voice is for captains." });
    nothingAsked();
  });

  it("refuses a captain held by a blocking form, as any page does", async () => {
    as("captain", { reason: "questionnaire" });
    expect((await POST(clip())).status).toBe(403);
    nothingAsked();
  });

  it("refuses a captain who has not turned voice on", async () => {
    vi.mocked(getVoiceConsent).mockResolvedValue(null);
    expect((await POST(clip())).status).toBe(409);
    nothingAsked();
  });

  it("counts the command before Groq and Claude are asked, and refuses the one over the day's 30", async () => {
    vi.mocked(rateLimiter.limit).mockImplementation(async (key) =>
      key.startsWith("voice-command:")
        ? { ok: false, retryAfterSeconds: 600 }
        : { ok: true, retryAfterSeconds: 0 },
    );
    const res = await POST(clip());
    expect(res.status).toBe(429);
    expect(vi.mocked(rateLimiter.limit)).toHaveBeenCalledWith(
      "voice-command:camp-1",
      {
        limit: 30,
        windowMs: 86_400_000,
      },
    );
    nothingAsked();
  });

  it("refuses a request from another site", async () => {
    expect((await POST(clip({ origin: "https://evil.example" }))).status).toBe(
      403,
    );
    nothingAsked();
  });

  it("stops before Claude when Whisper did not hear clearly", async () => {
    vi.mocked(transcribeCommand).mockResolvedValue({
      text: "mm",
      avgLogprob: -1.6,
      noSpeechProb: 0.2,
    });
    const body = await (await POST(clip())).json();
    expect(body.outcome).toMatchObject({
      kind: "refused",
      message: "I didn't catch that clearly. Say it again, a bit slower.",
    });
    expect(runVoiceCommand).not.toHaveBeenCalled();
  });

  it("works out the command as the signed-in captain and this sign-in, and logs no words when it fails", async () => {
    const res = await POST(clip({ origin: "https://camp.test" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      words: WORDS,
      outcome: { kind: "answers", answers: [] },
    });
    expect(runVoiceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        words: WORDS,
        sessionId: "session-1",
        scope: expect.objectContaining({ campUserId: "camp-1" }),
      }),
    );

    const logged: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation(
      (...a) => void logged.push(a),
    );
    vi.mocked(runVoiceCommand).mockRejectedValue(new Error(`boom ${WORDS}`));
    expect((await POST(clip())).status).toBe(500);
    expect(JSON.stringify(logged)).not.toContain("breakfast");
  });
});
