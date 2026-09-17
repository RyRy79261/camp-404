import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ContentBlock } from "@camp404/types";

import {
  ContentBlockRenderer,
  ContentBlockView,
} from "../questionnaire/content-block";

const STORED = "https://camp404store.public.blob.vercel-storage.com/playa.jpg";

describe("ContentBlockView", () => {
  it("renders an info block with its heading and body", () => {
    render(
      <ContentBlockView
        block={{
          id: "i",
          kind: "info_block",
          heading: "Before you start",
          body: "It takes two minutes.",
        }}
      />,
    );
    expect(screen.getByText("Before you start")).toBeTruthy();
    expect(screen.getByText("It takes two minutes.")).toBeTruthy();
  });

  it("renders a header break with eyebrow, heading and subtext", () => {
    const block: ContentBlock = {
      id: "h",
      kind: "header_break",
      headingText: "Tell us about you",
      eyebrow: "Before we begin",
      subtext: "A few quick questions.",
      alignment: "center",
    };
    render(<ContentBlockView block={block} />);
    expect(
      screen.getByRole("heading", { name: "Tell us about you" }),
    ).toBeTruthy();
    expect(screen.getByText("Before we begin")).toBeTruthy();
    expect(screen.getByText("A few quick questions.")).toBeTruthy();
  });

  it("renders a plain explainer as text and a styled one in a callout", () => {
    const { rerender } = render(
      <ContentBlockView
        block={{
          id: "e",
          kind: "explainer",
          bodyText: "Plain note",
          style: "plain",
        }}
      />,
    );
    expect(screen.getByText("Plain note").tagName).toBe("P");

    rerender(
      <ContentBlockView
        block={{
          id: "e",
          kind: "explainer",
          bodyText: "Heads up",
          style: "warning",
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Heads up");
  });

  it("renders an image block with its alt text and caption", () => {
    render(
      <ContentBlockView
        block={{
          id: "i",
          kind: "image_block",
          url: STORED,
          alt: "Playa sunset",
          caption: "Golden hour",
          sizeFit: "fill",
        }}
      />,
    );
    const img = screen.getByRole("img", { name: "Playa sunset" });
    expect(img.getAttribute("src")).toBe(STORED);
    expect(screen.getByText("Golden hour")).toBeTruthy();
  });

  it("shows no picture for an image stored on another website", () => {
    // A definition saved before the host rule could still hold one. Rendering
    // it would make every member's browser call that site.
    render(
      <ContentBlockView
        block={{
          id: "i",
          kind: "image_block",
          url: "https://tracker.example/pixel.gif",
          alt: "Playa sunset",
        }}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders a divider", () => {
    render(<ContentBlockView block={{ id: "d", kind: "divider" }} />);
    expect(screen.getByRole("separator")).toBeTruthy();
  });
});

describe("ContentBlockRenderer (the builder's block shape)", () => {
  it("reads the builder's image fields", () => {
    render(
      <ContentBlockRenderer
        block={{
          id: "i",
          kind: "image_block",
          imageUrl: STORED,
          altText: "Playa sunset",
          sizeFit: "fit",
        }}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Playa sunset" }).getAttribute("src"),
    ).toBe(STORED);
  });
});
