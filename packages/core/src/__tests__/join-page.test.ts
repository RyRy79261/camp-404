import { describe, expect, it } from "vitest";
import {
  isJoinImagePathname,
  isJoinImageUrl,
  joinImageFolder,
  joinImageUrl,
} from "../join-page";

// The join page shows only pictures from its own folder in the camp's store,
// and the route serves only that folder, to anyone.

describe("join-page pictures", () => {
  it("files a year's pictures under its own folder", () => {
    expect(joinImageFolder(2026)).toBe("join-page/2026");
  });

  it("accepts a stored picture's pathname", () => {
    expect(isJoinImagePathname("join-page/2026/image-abc.jpg")).toBe(true);
  });

  it("refuses any other folder, and paths that could leave the folder", () => {
    expect(isJoinImagePathname("avatars/user-1/photo.webp")).toBe(false);
    expect(isJoinImagePathname("builder-images/x/image.png")).toBe(false);
    expect(isJoinImagePathname("join-page/")).toBe(false);
    expect(isJoinImagePathname("join-page/../avatars/u/p.png")).toBe(false);
    expect(isJoinImagePathname("join-page/2026//p.png")).toBe(false);
    expect(isJoinImagePathname("join-page/2026/%2e%2e/p.png")).toBe(false);
    expect(isJoinImagePathname("join-page\\2026\\p.png")).toBe(false);
    expect(isJoinImagePathname("join-page/2026/a b.png")).toBe(false);
  });

  it("round-trips the link the Markdown stores", () => {
    const url = joinImageUrl("join-page/2026/image-abc.jpg");
    expect(url).toBe(
      "/api/join-image?pathname=join-page%2F2026%2Fimage-abc.jpg",
    );
    expect(isJoinImageUrl(url)).toBe(true);
  });

  it("refuses every other picture link", () => {
    // Notion's own links expire, and any other host is a tracking pixel.
    expect(
      isJoinImageUrl("https://prod-files-secure.s3.amazonaws.com/x.png"),
    ).toBe(false);
    expect(
      isJoinImageUrl("/api/avatar?pathname=avatars%2Fu%2Fphoto.webp"),
    ).toBe(false);
    expect(
      isJoinImageUrl("/api/join-image?pathname=avatars%2Fu%2Fphoto.webp"),
    ).toBe(false);
    expect(
      isJoinImageUrl(
        "/api/join-image?pathname=join-page%2F2026%2Fa.png&pathname=avatars%2Fx",
      ),
    ).toBe(false);
    expect(
      isJoinImageUrl("//evil.test/api/join-image?pathname=join-page%2Fa"),
    ).toBe(false);
    expect(isJoinImageUrl("data:image/png;base64,AAAA")).toBe(false);
  });
});
