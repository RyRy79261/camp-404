import { describe, expect, it } from "vitest";
import robots from "../../app/robots";
import { metadata as authMetadata } from "../../app/auth/layout";
import { metadata as neighboursMetadata } from "../../app/neighbours/[token]/page";

// seo-3: the console tells a crawler what is not for it, and the public
// sign-in pages ask not to be kept.

describe("the console's robots.txt", () => {
  it("keeps crawlers out of the API, print views and the connector", () => {
    expect(robots().rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/print/", "/mcp/"],
    });
  });

  it("lets crawlers fetch the noindex pages, so they read the noindex", () => {
    const { disallow } = robots().rules as { disallow: string[] };
    for (const path of ["/auth/sign-in", "/neighbours/some-token"]) {
      expect(
        disallow.some((d) => path.startsWith(d)),
        path,
      ).toBe(false);
    }
    expect(neighboursMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("the sign-in pages", () => {
  it("are noindex, with their links still followed", () => {
    expect(authMetadata.robots).toEqual({ index: false, follow: true });
  });
});
