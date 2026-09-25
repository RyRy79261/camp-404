import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@camp404/db/join-page", () => ({ getPublishedJoinPage: vi.fn() }));

import { getPublishedJoinPage } from "@camp404/db/join-page";
import { readJoinPage } from "./join-page";

describe("readJoinPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands on the published page", async () => {
    vi.mocked(getPublishedJoinPage).mockResolvedValue({
      cycle: 2026,
      markdown: "## Hello",
      publishedAt: new Date(),
    });
    expect(await readJoinPage()).toEqual({
      status: "published",
      cycle: 2026,
      markdown: "## Hello",
    });
  });

  it("names no year on a camp that has not said which year it is", async () => {
    vi.mocked(getPublishedJoinPage).mockResolvedValue({
      cycle: 1,
      markdown: "Hi",
      publishedAt: null,
    });
    expect(await readJoinPage()).toMatchObject({ cycle: null });
  });

  it("says when nothing is published", async () => {
    vi.mocked(getPublishedJoinPage).mockResolvedValue(null);
    expect(await readJoinPage()).toEqual({ status: "none" });
  });

  it("says the page is unavailable when the read fails, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getPublishedJoinPage).mockRejectedValue(new Error("no db"));
    expect(await readJoinPage()).toEqual({ status: "unavailable" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
