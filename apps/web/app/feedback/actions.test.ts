import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for the load-bearing server action. The e2e only runs under
// E2E_TEST_MODE (which skips the GitHub call), so the real fetch, status
// mapping, auth/rate-limit/validation guards, and config guards are covered
// here by mocking the collaborators and stubbing global fetch.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({ findCampUserByAuthId: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })),
}));
vi.mock("@/lib/feedback-ai", () => ({ structureWithAi: vi.fn() }));

import { submitFeedbackAction } from "./actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { findCampUserByAuthId } from "@/lib/users";
import { isE2ETestMode } from "@/lib/test-mode";
import { rateLimit } from "@/lib/rate-limit";
import { structureWithAi } from "@/lib/feedback-ai";

const VALID = { kind: "bug" as const, description: "The publish button does nothing" };

function mockFetch(response: Partial<Response> & { status: number }) {
  const fn = vi.fn().mockResolvedValue({
    json: async () => ({}),
    text: async () => "",
    ...response,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("submitFeedbackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks(); // reset call history so per-test call-count assertions are isolated
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "m@example.com",
      displayName: "Member",
    } as never);
    vi.mocked(findCampUserByAuthId).mockResolvedValue({ id: "camp-1" } as never);
    vi.mocked(isE2ETestMode).mockReturnValue(false);
    vi.mocked(rateLimit).mockReturnValue({ ok: true, retryAfterSeconds: 0 });
    vi.mocked(structureWithAi).mockResolvedValue(null);
    process.env.GITHUB_FEEDBACK_TOKEN = "test-token";
    delete process.env.GITHUB_FEEDBACK_REPO;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GITHUB_FEEDBACK_TOKEN;
  });

  it("rejects an unauthenticated caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const res = await submitFeedbackAction(VALID);
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/sign in/i) });
  });

  it("rejects when the burst rate limit trips", async () => {
    vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, retryAfterSeconds: 30 });
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/give it a minute/i);
  });

  it("rejects when the daily cap trips", async () => {
    vi.mocked(rateLimit)
      .mockReturnValueOnce({ ok: true, retryAfterSeconds: 0 })
      .mockReturnValueOnce({ ok: false, retryAfterSeconds: 0 });
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/lot of reports today/i);
  });

  it("rejects an empty description", async () => {
    const res = await submitFeedbackAction({ kind: "bug", description: "" });
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/describe/i);
  });

  it("rejects an HTML-only description that sanitizes to empty", async () => {
    const res = await submitFeedbackAction({ kind: "bug", description: "<x></x>" });
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/describe/i);
  });

  it("short-circuits under E2E test mode without calling GitHub", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    const fetchFn = mockFetch({ status: 201 });
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: true, number: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails gracefully when the token is unset", async () => {
    delete process.env.GITHUB_FEEDBACK_TOKEN;
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/set up/i);
  });

  it("fails gracefully when the repo slug is misconfigured", async () => {
    process.env.GITHUB_FEEDBACK_REPO = "bogus-no-slash";
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/configured correctly/i);
  });

  it("rejects a repo slug with extra path segments", async () => {
    process.env.GITHUB_FEEDBACK_REPO = "owner/repo/issues";
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/configured correctly/i);
  });

  it("creates the issue and returns its number + url on 201", async () => {
    const fetchFn = mockFetch({
      status: 201,
      json: async () => ({
        number: 42,
        html_url: "https://github.com/RyRy79261/camp-404/issues/42",
      }),
    });
    const res = await submitFeedbackAction(VALID);
    expect(res).toEqual({
      ok: true,
      number: 42,
      url: "https://github.com/RyRy79261/camp-404/issues/42",
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain("api.github.com/repos/RyRy79261/camp-404/issues");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ labels: ["bug", "from-app"] });
    expect(body.title).toBeTruthy();
  });

  it("restructures with AI when requested and files the structured issue", async () => {
    vi.mocked(structureWithAi).mockResolvedValue({
      title: "AI title",
      summary: "AI summary",
      severity: "low",
    });
    const fetchFn = mockFetch({
      status: 201,
      json: async () => ({
        number: 9,
        html_url: "https://github.com/RyRy79261/camp-404/issues/9",
      }),
    });
    const res = await submitFeedbackAction({ ...VALID, useAi: true });
    expect(res).toMatchObject({ ok: true, number: 9 });
    expect(structureWithAi).toHaveBeenCalledWith("bug", expect.any(String));
    const body = JSON.parse(
      (fetchFn.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.title).toBe("AI title");
    expect(body.body).toContain("AI summary");
  });

  it("does not call AI when useAi is omitted", async () => {
    mockFetch({
      status: 201,
      json: async () => ({ number: 1, html_url: "https://x/y/issues/1" }),
    });
    await submitFeedbackAction(VALID);
    expect(structureWithAi).not.toHaveBeenCalled();
  });

  it("maps GitHub error statuses to friendly messages", async () => {
    const cases: Array<[number, RegExp]> = [
      [401, /refresh/i],
      [403, /unreachable/i],
      [404, /unreachable/i],
      [410, /turned off/i],
      [500, /try again/i],
    ];
    for (const [status, pattern] of cases) {
      mockFetch({ status });
      const res = await submitFeedbackAction(VALID);
      expect(res).toMatchObject({ ok: false });
      if (!res.ok) expect(res.error).toMatch(pattern);
    }
  });

  it("fails gracefully when the GitHub request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const res = await submitFeedbackAction(VALID);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/reach the feedback tracker/i);
  });
});
