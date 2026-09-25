import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { JoinPageBody, isJoinLinkUrl } from "../join-page-body";

// The join page is public and its text is a captain's pasted Markdown, so the
// renderer is the boundary: only the page's own pictures, only safe links, no
// raw HTML, and the page's h1 stays the page's.

function html(markdown: string): HTMLElement {
  return render(<JoinPageBody markdown={markdown} />).container;
}

const OWN_PICTURE = "/api/join-image?pathname=join-page%2F2026%2Flounge.jpg";

describe("JoinPageBody", () => {
  it("renders Markdown: headings, lists, emphasis, quotes", () => {
    const root = html(
      "## How do I join?\n\n1. Apply\n2. Hear back\n\n**Bold** and *soft*\n\n> the lost clutter",
    );
    expect(root.querySelector("h2")?.textContent).toBe("How do I join?");
    expect(root.querySelectorAll("ol li")).toHaveLength(2);
    expect(root.querySelector("strong")?.textContent).toBe("Bold");
    expect(root.querySelector("blockquote")?.textContent).toContain(
      "the lost clutter",
    );
  });

  it("turns a # heading into a section heading: the page owns its h1", () => {
    const root = html("# Intro");
    expect(root.querySelector("h1")).toBeNull();
    expect(root.querySelector("h2")?.textContent).toBe("Intro");
  });

  it("shows the page's own pictures", () => {
    const img = html(`![The lounge](${OWN_PICTURE})`).querySelector("img");
    expect(img?.getAttribute("src")).toBe(OWN_PICTURE);
    expect(img?.getAttribute("alt")).toBe("The lounge");
  });

  it("leaves only the alt text for any other picture", () => {
    const root = html(
      "![Notion picture](https://prod-files-secure.s3.amazonaws.com/a.png)",
    );
    // Present first: the words are there, so the absence below is real.
    expect(root.textContent).toContain("Notion picture");
    expect(root.querySelector("img")).toBeNull();
  });

  it("opens web links in their own tab, and drops a script link", () => {
    const root = html(
      "[AfrikaBurn](https://www.afrikaburn.org) and [x](javascript:alert(1))",
    );
    const links = root.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://www.afrikaburn.org");
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(root.textContent).toContain("x");
  });

  it("never turns raw HTML into markup, and keeps the words inside it", () => {
    const root = html(
      "<aside>\n\nBring earplugs.\n\n</aside>\n\n<script>alert(1)</script><img src=x onerror=alert(1)>",
    );
    expect(root.textContent).toContain("Bring earplugs.");
    expect(root.querySelector("aside")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("img")).toBeNull();
  });
});

describe("Notion callouts", () => {
  it("keeps a callout's words even with no blank line after <aside>", () => {
    const root = html("<aside>\n💡 Bring earplugs.\n</aside>\n\nAfter.");
    expect(root.textContent).toContain("Bring earplugs.");
    expect(root.textContent).toContain("After.");
    expect(root.querySelector("aside")).toBeNull();
  });
});

describe("isJoinLinkUrl", () => {
  it("allows web, mail and anchor links only", () => {
    expect(isJoinLinkUrl("https://camp-404.com")).toBe(true);
    expect(isJoinLinkUrl("mailto:hello@example.com")).toBe(true);
    expect(isJoinLinkUrl("#the-crew")).toBe(true);
    expect(isJoinLinkUrl("/auth/sign-up")).toBe(false);
    expect(isJoinLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isJoinLinkUrl("data:text/html,hi")).toBe(false);
  });
});
