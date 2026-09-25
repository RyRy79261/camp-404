import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { JOIN_PAGE_EXTENSIONS } from "./join-page-editor";

// The editor reads and writes Markdown, and the join site renders that
// Markdown. What a captain pastes must come back out as the same Markdown,
// pictures included, or the site shows something the editor did not.

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function roundTrip(markdown: string): string {
  editor = new Editor({
    extensions: JOIN_PAGE_EXTENSIONS,
    content: markdown,
    contentType: "markdown",
  });
  return editor.getMarkdown();
}

describe("the join page's Markdown round trip", () => {
  it("keeps headings, lists, emphasis, quotes, rules and links", () => {
    const md = [
      "## How do I join?",
      "",
      "1. Apply",
      "2. Hear back",
      "",
      "- **Bold** and *soft*",
      "- [A link](https://example.com)",
      "",
      "> A quote",
      "",
      "---",
      "",
      "### Smaller",
    ].join("\n");
    const out = roundTrip(md);
    expect(out).toContain("## How do I join?");
    expect(out).toMatch(/1\. Apply\n2\. Hear back/);
    expect(out).toContain("**Bold**");
    expect(out).toMatch(/[*_]soft[*_]/);
    expect(out).toContain("[A link](https://example.com)");
    expect(out).toContain("> A quote");
    expect(out).toContain("---");
    expect(out).toContain("### Smaller");
  });

  it("keeps a picture's link and alt text", () => {
    const src = "/api/join-image?pathname=join-page%2F2026%2Flounge.jpg";
    expect(roundTrip(`![The lounge](${src})`)).toContain(
      `![The lounge](${src})`,
    );
  });

  it("writes an empty page as nothing", () => {
    expect(roundTrip("").trim()).toBe("");
  });
});

describe("Notion's callouts", () => {
  it("keeps a callout's words when pasted, and drops its <aside> tags", () => {
    const out = roundTrip("<aside>\n💡 Bring earplugs.\n</aside>\n\nAfter.");
    expect(out).toContain("Bring earplugs.");
    expect(out).not.toContain("<aside>");
  });
});
