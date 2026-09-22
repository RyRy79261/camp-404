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
  it("does not run a <script> a member typed", () => {
    const { container } = render(
      <MarkdownBody>
        {"Before\n\n<script>window.pwned = true;</script>\n\nAfter"}
      </MarkdownBody>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("window.pwned");
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
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).not.toContain("window.pwned");
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
    expect(container.innerHTML).not.toContain("evil.example.com");
  });
});
