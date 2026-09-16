import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isEmailConfigured, sendEmail } from "../email";

const EMAIL = { subject: "Camp 404: Hi", text: "Hello", html: "<p>Hello</p>" };
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
    expect(await sendEmail("ada@example.com", EMAIL)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
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
    const result = await sendEmail("not-an-address", EMAIL);
    expect(result).toEqual({
      ok: false,
      error: 'Resend 422: {"message":"Invalid `to` field."}',
    });
    expect(JSON.stringify(result)).not.toContain("re_test_key");
  });

  it("is off until both settings are present", async () => {
    expect(isEmailConfigured()).toBe(true);
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    expect(isEmailConfigured()).toBe(false);
    await expect(sendEmail("ada@example.com", EMAIL)).rejects.toThrow(
      /not configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
