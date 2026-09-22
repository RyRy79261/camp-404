import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownBody } from "./markdown-body";

// An announcement body is written by one member and read by every other, so
// the renderer is the security boundary. These tests are the claim in
// markdown-body.tsx's header, held to something that can fail.

describe("MarkdownBody — what it renders", () => {
  it("renders the markdown a captain writes", () => {
    const { container } = render(
      <MarkdownBody>
        {[
          "## Burn night",
          "",
          "**Everyone** meets at *20:00*.",
          "",
          "- Water",
          "- Head torch",
          "",
          "> No cars after dark.",
        ].join("\n")}
      </MarkdownBody>,
    );

    expect(
      screen.getByRole("heading", { name: "Burn night", level: 2 }),
    ).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("Everyone");
    expect(container.querySelector("em")?.textContent).toBe("20:00");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("blockquote")?.textContent).toContain(
      "No cars after dark.",
    );
  });

  it("keeps the line breaks of a body typed as plain text", () => {
    // Every announcement published before this renderer existed was typed
    // into a plain textarea and rendered with `whitespace-pre-wrap`. Plain
    // CommonMark folds those single newlines into spaces, which would turn a
    // shift list into one run-on line here while the push, the email and the
    // inbox row (plainPreview keeps newlines) still showed it as a list.
    const { container } = render(
      <MarkdownBody>
        {"Burn-night shifts:\nJo 20:00\nSam 00:00\nKim 04:00"}
      </MarkdownBody>,
    );
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelectorAll("br")).toHaveLength(3);
    expect(container.textContent).toContain("Jo 20:00");
    expect(container.textContent).toContain("Kim 04:00");
  });

  it("still starts a new paragraph on a blank line", () => {
    const { container } = render(
      <MarkdownBody>{"First thing.\n\nSecond thing."}</MarkdownBody>,
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelectorAll("br")).toHaveLength(0);
  });

  it("shows ~~tildes~~ as typed, because GFM is not switched on", () => {
    // The other half of this invariant is in
    // packages/core/src/__tests__/markdown-text.test.ts: plainPreview leaves
    // the tildes alone for exactly this reason. If remark-gfm is ever added
    // here, that rule goes back there in the same change — or the push says
    // the bar is "closed open" while this page says "~~closed~~ open".
    const { container } = render(
      <MarkdownBody>{"Bar is ~~closed~~ open from 18:00."}</MarkdownBody>,
    );
    expect(container.querySelector("del")).toBeNull();
    expect(container.textContent).toBe("Bar is ~~closed~~ open from 18:00.");
  });

  it("demotes a markdown h1 so the page keeps one heading outline", () => {
    const { container } = render(<MarkdownBody># Top</MarkdownBody>);
    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByRole("heading", { name: "Top", level: 2 })).toBeTruthy();
  });

  it("carries an http link, opened away from the app", () => {
    render(
      <MarkdownBody>{"[packing list](https://example.com/x)"}</MarkdownBody>,
    );
    const link = screen.getByRole("link", { name: "packing list" });
    expect(link.getAttribute("href")).toBe("https://example.com/x");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("keeps a link into the app in the same tab", () => {
    render(<MarkdownBody>{"[your profile](/profile)"}</MarkdownBody>);
    const link = screen.getByRole("link", { name: "your profile" });
    expect(link.getAttribute("href")).toBe("/profile");
    expect(link.getAttribute("target")).toBeNull();
  });
});

describe("MarkdownBody — what it refuses", () => {
  it("does not run a <script> a member typed, and shows it as typed", () => {
    const { container } = render(
      <MarkdownBody>
        {"Before\n\n<script>window.pwned = true;</script>\n\nAfter"}
      </MarkdownBody>,
    );
    expect(container.querySelector("script")).toBeNull();
    // Escaped, not executed and not deleted: the markup is text now.
    expect(container.innerHTML).not.toContain("<script");
    expect(container.textContent).toContain("<script>window.pwned = true;");
    // The words around it still read.
    expect(container.textContent).toContain("Before");
    expect(container.textContent).toContain("After");
  });

  it("does not keep an onerror= handler", () => {
    const { container } = render(
      <MarkdownBody>
        {'<img src="x" onerror="window.pwned = true">'}
      </MarkdownBody>,
    );
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("<img");
    expect(container.textContent).toContain("onerror=");
  });

  it("strips the href from a javascript: link and leaves its words", () => {
    const { container } = render(
      <MarkdownBody>{"[tap me](javascript:alert(1))"}</MarkdownBody>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.textContent).toContain("tap me");
  });

  it("refuses an image from any host but the app's own storage", () => {
    const { container } = render(
      <MarkdownBody>
        {"![the shade structure](https://evil.example.com/pixel.gif)"}
      </MarkdownBody>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("evil.example.com");
    // The alt text survives, which is what the member needed from it.
    expect(container.textContent).toContain("the shade structure");
  });

  it("carries an image from the app's own blob store", () => {
    const url =
      "https://abc123.public.blob.vercel-storage.com/announcements/shade.png";
    const { container } = render(
      <MarkdownBody>{`![shade](${url})`}</MarkdownBody>,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(url);
    expect(img?.getAttribute("alt")).toBe("shade");
  });

  it("refuses a data: image", () => {
    const { container } = render(
      <MarkdownBody>
        {"![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)"}
      </MarkdownBody>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("data:image");
  });

  it("does not let raw HTML through as markup", () => {
    const { container } = render(
      <MarkdownBody>
        {'<iframe src="https://evil.example.com"></iframe>\n\n<b>bold?</b>'}
      </MarkdownBody>,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    // No element, no live URL — but the characters stay, because deleting a
    // captain's words on this surface only (the email keeps them) is its own
    // bug. There is no <a> and no <iframe>, so nothing is fetched.
    expect(container.querySelector("[src]")).toBeNull();
    expect(container.textContent).toContain("<b>bold?</b>");
  });

  it("keeps the words of an aside a captain wrote in angle brackets", () => {
    // "<sharps container>" is a valid HTML open tag to CommonMark, so an
    // un-plugged renderer deletes it — while the email, the push and the
    // inbox row (plainPreview) all still carry it.
    const { container } = render(
      <MarkdownBody>
        {"Bring your own <sharps container> to the medical tent."}
      </MarkdownBody>,
    );
    expect(container.textContent).toBe(
      "Bring your own <sharps container> to the medical tent.",
    );
  });

  it("keeps the words of a block of raw HTML", () => {
    const { container } = render(
      <MarkdownBody>{"<div>Important</div>\n\nNext para."}</MarkdownBody>,
    );
    expect(container.innerHTML).not.toContain("<div><div");
    expect(container.textContent).toContain("<div>Important</div>");
    expect(container.textContent).toContain("Next para.");
  });
});
