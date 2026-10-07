import { beforeEach, describe, expect, it, vi } from "vitest";

// Voice consent (#356): turning voice on is a captain's; turning it off is
// anyone's who has it on, so a captain who was demoted, or is held, can still
// withdraw (users.voice_consent_at cleared).

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "auth-1" })),
  getSessionId: vi.fn(async () => "session-1"),
}));
vi.mock("@/lib/member-gate", () => ({ resolveMemberState: vi.fn() }));
vi.mock("@/lib/voice/consent", () => ({ setVoiceConsent: vi.fn() }));
vi.mock("@/lib/manifest-revalidate", () => ({ revalidateManifest: vi.fn() }));
vi.mock("@/lib/voice/run", () => ({ runSealedList: vi.fn() }));
vi.mock("@/lib/voice/run-deps", () => ({ voiceRunDeps: vi.fn() }));

import { resolveMemberState } from "@/lib/member-gate";
import { setVoiceConsent } from "@/lib/voice/consent";
import { setVoiceOn } from "../voice-actions";

function as(rank: "captain" | "member", block: unknown = null) {
  vi.mocked(resolveMemberState).mockResolvedValue({
    kind: "member",
    authUser: { id: "auth-1" },
    campUser: { id: "camp-1", rank },
    block,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setVoiceOn", () => {
  it("lets a captain turn voice on", async () => {
    as("captain");
    expect(await setVoiceOn(true)).toEqual({ ok: true });
    expect(setVoiceConsent).toHaveBeenCalledWith("camp-1", true);
  });

  it("refuses to turn voice on for anyone who is not a captain now", async () => {
    as("member");
    expect(await setVoiceOn(true)).toEqual({ ok: false });
    as("captain", { reason: "approval", href: "/pending" });
    expect(await setVoiceOn(true)).toEqual({ ok: false });
    expect(setVoiceConsent).not.toHaveBeenCalled();
  });

  it("lets a demoted or held captain withdraw their consent", async () => {
    as("member");
    expect(await setVoiceOn(false)).toEqual({ ok: true });
    as("captain", { reason: "approval", href: "/pending" });
    expect(await setVoiceOn(false)).toEqual({ ok: true });
    expect(setVoiceConsent).toHaveBeenCalledTimes(2);
    expect(setVoiceConsent).toHaveBeenNthCalledWith(1, "camp-1", false);
    expect(setVoiceConsent).toHaveBeenNthCalledWith(2, "camp-1", false);
  });

  it("does nothing for someone signed out", async () => {
    vi.mocked(resolveMemberState).mockResolvedValue({ kind: "signed_out" });
    expect(await setVoiceOn(false)).toEqual({ ok: false });
    expect(setVoiceConsent).not.toHaveBeenCalled();
  });
});
