import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BuilderContentBlock } from "@camp404/types";

import { ContentBlockRenderer } from "../questionnaire/content-block";

describe("ContentBlockRenderer", () => {
  it("renders a header break with eyebrow, heading and subtext", () => {
    const block: BuilderContentBlock = {
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
    const block: BuilderContentBlock = {
      id: "i",
      kind: "image_block",
      imageUrl: "https://camp404store.public.blob.vercel-storage.com/playa.jpg",
      altText: "Playa sunset",
      caption: "Golden hour",
      sizeFit: "fit",
    };
    render(<ContentBlockRenderer block={block} />);
    const img = screen.getByRole("img", { name: "Playa sunset" });
    expect(img.getAttribute("src")).toBe("https://camp404store.public.blob.vercel-storage.com/playa.jpg");
    expect(screen.getByText("Golden hour")).toBeTruthy();
  });

  it("shows no picture for an image stored on another website", () => {
    // A definition saved before the host rule could still hold one. Rendering
    // it would make every member's browser call that site.
    const block: BuilderContentBlock = {
      id: "i",
      kind: "image_block",
      imageUrl: "https://tracker.example/pixel.gif",
      altText: "Playa sunset",
      sizeFit: "fit",
    };
    render(<ContentBlockRenderer block={block} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders a divider", () => {
    const { container } = render(
      <ContentBlockRenderer block={{ id: "d", kind: "divider" }} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
