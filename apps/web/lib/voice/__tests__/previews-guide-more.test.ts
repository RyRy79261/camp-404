// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NOT_A_CHAPTER_WRITER } from "@camp404/core";

vi.mock("../../guide", () => ({ getGuideDraft: vi.fn() }));

import { getGuideDraft } from "../../guide";
import type { McpScope } from "../../mcp/scope";
import { GUIDE_MORE_PREVIEWS } from "../previews-guide-more";

const scope: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "member",
  viewerRank: "team_lead",
  leadTeams: ["kitchen"],
  memberTeams: ["kitchen"],
  isDriver: false,
  isCaptain: false,
};
const ctx = { scope, now: new Date("2026-10-06T10:00:00Z") };

describe("mark_document_reviewed preview", () => {
  it("names the chapter from its row", async () => {
    vi.mocked(getGuideDraft).mockResolvedValue({
      slug: "kitchen-rules",
      title: "Kitchen rules",
      team: "kitchen",
      published: true,
    } as never);
    const p = await GUIDE_MORE_PREVIEWS.mark_document_reviewed!(
      { slug: "kitchen-rules" },
      ctx,
    );
    expect(p.sentence).toBe("Mark “Kitchen rules” still right for this year");
    expect(p.args).toEqual({ slug: "kitchen-rules" });
    expect(p.blocked).toBeUndefined();
  });

  it("blocks another team's chapter, a draft and a missing slug", async () => {
    vi.mocked(getGuideDraft).mockResolvedValue({
      slug: "build",
      title: "Build",
      team: "structures",
      published: true,
    } as never);
    expect(
      (
        await GUIDE_MORE_PREVIEWS.mark_document_reviewed!(
          { slug: "build" },
          ctx,
        )
      ).blocked,
    ).toBe(NOT_A_CHAPTER_WRITER);
    vi.mocked(getGuideDraft).mockResolvedValue({
      slug: "k",
      title: "K",
      team: "kitchen",
      published: false,
    } as never);
    expect(
      (await GUIDE_MORE_PREVIEWS.mark_document_reviewed!({ slug: "k" }, ctx))
        .blocked,
    ).toBe("Publish the chapter first.");
    vi.mocked(getGuideDraft).mockResolvedValue(null);
    expect(
      (await GUIDE_MORE_PREVIEWS.mark_document_reviewed!({ slug: "x" }, ctx))
        .blocked,
    ).toBe("No chapter with that slug.");
  });
});
