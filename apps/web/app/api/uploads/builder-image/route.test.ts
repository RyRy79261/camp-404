import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A picture for a builder image block: authors only, only for a questionnaire
// they may change, photos but never SVG, stored private and handed back as a
// proxy link. The request is stubbed to what the handler reads (see the avatar
// route test for why).

vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/questionnaire-authoring", () => ({
  canEditQuestionnaire: vi.fn(),
}));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: {
    limit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("@/lib/avatar-blob", () => ({
  avatarProxyUrl: (pathname: string) =>
    `/api/avatar?pathname=${encodeURIComponent(pathname)}`,
}));

import { POST } from "./route";
import { captainActionGate } from "@/lib/captain-gate";
import { canEditQuestionnaire } from "@/lib/questionnaire-authoring";
import { rateLimiter } from "@/lib/rate-limit";
import { put } from "@vercel/blob";

function upload(type: string, key: string | null = "camp-map"): Request {
  const form = new FormData();
  form.set("image", new File([new Uint8Array([1, 2, 3])], "map", { type }));
  const query = key === null ? "" : `?questionnaire=${key}`;
  return {
    method: "POST",
    url: `https://camp.test/api/uploads/builder-image${query}`,
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

describe("POST /api/uploads/builder-image", () => {
  const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: true,
      campUser: { id: "lead-1" },
      rank: "team_lead",
    } as never);
    vi.mocked(canEditQuestionnaire).mockResolvedValue({ ok: true });
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    });
    vi.mocked(put).mockResolvedValue({
      pathname: "builder-images/camp-map/image-abc.jpg",
    } as never);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });
  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  });

  it("stores a JPEG privately under the questionnaire and returns the proxy link", async () => {
    const res = await POST(upload("image/jpeg"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "/api/avatar?pathname=builder-images%2Fcamp-map%2Fimage-abc.jpg",
    });
    expect(vi.mocked(put).mock.calls[0]![0]).toBe(
      "builder-images/camp-map/image.jpg",
    );
    expect(vi.mocked(put).mock.calls[0]![2]).toMatchObject({
      access: "private",
      addRandomSuffix: true,
    });
    expect(canEditQuestionnaire).toHaveBeenCalledWith(
      expect.objectContaining({ rank: "team_lead" }),
      "camp-map",
    );
  });

  it("refuses someone below team lead", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Team-lead access only.",
    });
    expect((await POST(upload("image/png"))).status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a questionnaire the author may not change", async () => {
    vi.mocked(canEditQuestionnaire).mockResolvedValue({
      ok: false,
      error: "You can only edit your own questionnaires.",
    });
    const res = await POST(upload("image/png"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You can only edit your own questionnaires.",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses an SVG, which the proxy would serve same-origin", async () => {
    expect((await POST(upload("image/svg+xml"))).status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it("needs the questionnaire key", async () => {
    expect((await POST(upload("image/png", null))).status).toBe(400);
  });

  it("says uploads are off when the store is not configured", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await POST(upload("image/png"))).status).toBe(501);
    expect(put).not.toHaveBeenCalled();
  });
});
