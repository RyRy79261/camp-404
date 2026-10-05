import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getJoinSitePublic = vi.hoisted(() => vi.fn());
vi.mock("@camp404/db/join-site", () => ({ getJoinSitePublic }));

import { DEFAULT_JOIN_DATA } from "./join-data";
import { loadJoinData } from "./load-join-data";

// A failed database read must never be cached as the page: at runtime the
// background refresh throws, so Next keeps the last good page instead of the
// built-in copy (join-guide-docs-1).

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  getJoinSitePublic.mockReset();
});

describe("loadJoinData", () => {
  it("shows the built-in copy with no database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(await loadJoinData()).toBe(DEFAULT_JOIN_DATA);
    expect(getJoinSitePublic).not.toHaveBeenCalled();
  });

  it("throws a failed read at runtime, so the last good page is kept", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    getJoinSitePublic.mockRejectedValue(new Error("connection refused"));
    await expect(loadJoinData()).rejects.toThrow("connection refused");
  });

  it("falls back to the built-in copy during the build, so a blip never fails a deploy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    getJoinSitePublic.mockRejectedValue(new Error("connection refused"));
    expect(await loadJoinData()).toBe(DEFAULT_JOIN_DATA);
  });
});
