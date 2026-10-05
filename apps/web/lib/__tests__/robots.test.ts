import { describe, expect, it } from "vitest";
import robots from "../../app/robots";
import { metadata as authMetadata } from "../../app/auth/layout";

// seo-3: the console tells a crawler what is not for it, and the public
// sign-in pages ask not to be kept.

describe("the console's robots.txt", () => {
  it("keeps crawlers out of the API, print views, the connector and neighbours' links", () => {
    expect(robots().rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/print/", "/mcp/", "/neighbours/"],
    });
  });
});

describe("the sign-in pages", () => {
  it("are noindex, with their links still followed", () => {
    expect(authMetadata.robots).toEqual({ index: false, follow: true });
  });
});
