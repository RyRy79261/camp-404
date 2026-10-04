import { describe, expect, it } from "vitest";
import { linkResolver, shortAddress } from "./links";

describe("links on the public site", () => {
  const linkFor = linkResolver(
    new Map([["the-sleeping-area", "The sleeping area"]]),
  );

  it("keeps a link to a public chapter on this site, named for paper", () => {
    expect(linkFor("/guide/the-sleeping-area")).toEqual({
      href: "/the-sleeping-area",
      printChapter: "The sleeping area",
    });
    expect(
      linkFor("https://camp-404.com/guide/the-sleeping-area#quiet"),
    ).toEqual({
      href: "/the-sleeping-area#quiet",
      printChapter: "The sleeping area",
    });
  });

  it("sends a chapter that is not public, and any other page, to the app", () => {
    expect(linkFor("/guide/medical-plan")).toEqual({
      href: "https://camp-404.com/guide/medical-plan",
      printUrl: "camp-404.com/guide/medical-plan",
      external: true,
    });
    expect(linkFor("/profile")).toMatchObject({
      href: "https://camp-404.com/profile",
      external: true,
    });
  });

  it("prints an outside link's short address", () => {
    expect(linkFor("https://www.afrikaburn.org/survival-guide/")).toEqual({
      href: "https://www.afrikaburn.org/survival-guide/",
      printUrl: "afrikaburn.org/survival-guide",
      external: true,
    });
    expect(linkFor("mailto:crew@camp-404.com")).toEqual({
      href: "mailto:crew@camp-404.com",
      printUrl: "crew@camp-404.com",
    });
    expect(linkFor("#tickets")).toEqual({ href: "#tickets" });
    expect(shortAddress(`https://x.org/${"a".repeat(80)}`)).toHaveLength(60);
  });
});
