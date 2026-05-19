import { test, expect } from "@playwright/test";

test.describe("public API contracts", () => {
  test("/api/health is unauthenticated and returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  test("/api/voice/transcribe rejects unauthenticated requests with 401", async ({
    request,
  }) => {
    const res = await request.post("/api/voice/transcribe", {
      multipart: {
        audio: {
          name: "clip.webm",
          mimeType: "audio/webm",
          buffer: Buffer.from([0]),
        },
      },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });
});
