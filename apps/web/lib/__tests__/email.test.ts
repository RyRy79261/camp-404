import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isEmailConfigured, sendEmail } from "../email";

const EMAIL = { subject: "Camp 404: Hi", text: "Hello", html: "<p>Hello</p>" };
const KEY = { idempotencyKey: "notification-delivery/d1" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Camp 404 <notices@camp-404.com>");
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("sends one email to one recipient through Resend", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    expect(await sendEmail("ada@example.com", EMAIL, KEY)).toEqual({
      ok: true,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    // One delivery is one email, however often a run is retried.
    expect(init.headers["Idempotency-Key"]).toBe("notification-delivery/d1");
    // A hung call cannot hold the drain's transaction open.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      from: "Camp 404 <notices@camp-404.com>",
      to: ["ada@example.com"],
      subject: "Camp 404: Hi",
      text: "Hello",
      html: "<p>Hello</p>",
    });
  });

  it("returns Resend's refusal without the key", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"message":"Invalid `to` field."}',
    });
    const result = await sendEmail("not-an-address", EMAIL, KEY);
    expect(result).toEqual({
      ok: false,
      error: 'Resend 422: {"message":"Invalid `to` field."}',
    });
    expect(JSON.stringify(result)).not.toContain("re_test_key");
  });

  it("says a rate limit or a provider failure is worth retrying, and a bad address is not", async () => {
    for (const status of [429, 500, 503]) {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status,
        text: async () => "busy",
      });
      expect(await sendEmail("ada@example.com", EMAIL, KEY)).toEqual({
        ok: false,
        error: `Resend ${status}: busy`,
        retryable: true,
      });
    }
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => "bad address",
    });
    expect(await sendEmail("ada@example.com", EMAIL, KEY)).not.toHaveProperty(
      "retryable",
    );
  });

  it("answers a timeout or a dropped connection as retryable, without throwing", async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation timed out.", "TimeoutError"),
    );
    expect(await sendEmail("ada@example.com", EMAIL, KEY)).toEqual({
      ok: false,
      error: "Resend unreachable (TimeoutError)",
      retryable: true,
    });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await sendEmail("ada@example.com", EMAIL, KEY)).toMatchObject({
      ok: false,
      retryable: true,
    });
  });

  it("is off until both settings are present", async () => {
    expect(isEmailConfigured()).toBe(true);
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    expect(isEmailConfigured()).toBe(false);
    await expect(sendEmail("ada@example.com", EMAIL, KEY)).rejects.toThrow(
      /not configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
