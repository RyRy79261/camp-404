import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ContentBlock } from "@camp404/types";

import { ContentBlockRenderer } from "../questionnaire/content-block";

describe("ContentBlockRenderer", () => {
  it("renders a header break with eyebrow, heading and subtext", () => {
    const block: ContentBlock = {
      id: "h",
      kind: "header_break",
      headingText: "Tell us about you",
      eyebrow: "Before we begin",
      subtext: "A few quick questions.",
      alignment: "center",
    };
    render(<ContentBlockRenderer block={block} />);
    expect(screen.getByRole("heading", { name: "Tell us about you" })).toBeTruthy();
    expect(screen.getByText("Before we begin")).toBeTruthy();
    expect(screen.getByText("A few quick questions.")).toBeTruthy();
  });

  it("renders a plain explainer as text and a styled one as an alert", () => {
    const { rerender } = render(
      <ContentBlockRenderer
        block={{ id: "e", kind: "explainer", bodyText: "Plain note", style: "plain" }}
      />,
    );
    expect(screen.getByText("Plain note")).toBeTruthy();

    rerender(
      <ContentBlockRenderer
        block={{ id: "e", kind: "explainer", bodyText: "Heads up", style: "warning" }}
      />,
    );
    expect(screen.getByText("Heads up")).toBeTruthy();
  });

  it("renders an image block with its alt text and caption", () => {
    const block: ContentBlock = {
      id: "i",
      kind: "image_block",
      imageUrl: "https://example.test/playa.jpg",
      altText: "Playa sunset",
      caption: "Golden hour",
      sizeFit: "fit",
    };
    render(<ContentBlockRenderer block={block} />);
    const img = screen.getByRole("img", { name: "Playa sunset" });
    expect(img.getAttribute("src")).toBe("https://example.test/playa.jpg");
    expect(screen.getByText("Golden hour")).toBeTruthy();
  });

  it("renders a divider", () => {
    const { container } = render(
      <ContentBlockRenderer block={{ id: "d", kind: "divider" }} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
