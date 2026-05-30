import { describe, expect, it } from "vitest";
import {
  AnnouncementPresentation,
  ComposeAnnouncementInput,
} from "../announcement";

describe("ComposeAnnouncementInput", () => {
  it("accepts a valid announcement and trims whitespace", () => {
    const parsed = ComposeAnnouncementInput.parse({
      title: "  Burn-night briefing  ",
      body: "  Meet at the effigy at 8pm.  ",
      presentation: "acknowledge",
    });
    expect(parsed.title).toBe("Burn-night briefing");
    expect(parsed.body).toBe("Meet at the effigy at 8pm.");
    expect(parsed.presentation).toBe("acknowledge");
  });

  it("defaults presentation to the full-screen acknowledge variant", () => {
    const parsed = ComposeAnnouncementInput.parse({
      title: "Heads up",
      body: "Something to note.",
    });
    expect(parsed.presentation).toBe("acknowledge");
  });

  it("rejects an empty title", () => {
    const result = ComposeAnnouncementInput.safeParse({
      title: "   ",
      body: "Body text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    const result = ComposeAnnouncementInput.safeParse({
      title: "Title",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown presentation variant", () => {
    const result = ComposeAnnouncementInput.safeParse({
      title: "Title",
      body: "Body",
      presentation: "banner",
    });
    expect(result.success).toBe(false);
  });

  it("enumerates the three presentation variants", () => {
    expect(AnnouncementPresentation.options).toEqual([
      "acknowledge",
      "popup",
      "feed",
    ]);
  });
});
