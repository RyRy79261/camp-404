import { describe, expect, it } from "vitest";
import { plainPreview } from "../markdown-text";

// plainPreview guards the plain-text boundaries: push, email, Telegram, and
// every clipped row. Each case below is a marker a captain can type that must
// not reach a member's lock screen as punctuation.

describe("plainPreview — the whole body (no max)", () => {
  it("leaves a body that is already plain alone", () => {
    const body =
      "Gate opens at 06:00 on Monday.\n\nBring your own water for the first day.";
    expect(plainPreview(body)).toBe(body);
  });

  it("drops heading markers and keeps the heading's words", () => {
    expect(plainPreview("## Burn night\n\nMeet at the effigy.")).toBe(
      "Burn night\n\nMeet at the effigy.",
    );
    expect(plainPreview("###### Deep\n")).toBe("Deep");
  });

  it("unwraps bold and italic", () => {
    expect(plainPreview("**Water** is *not* provided.")).toBe(
      "Water is not provided.",
    );
    expect(plainPreview("__Shifts__ are locked.")).toBe("Shifts are locked.");
  });

  it("leaves ~~strikethrough~~ alone, because the renderer does", () => {
    // GFM is not switched on (no remark-gfm), so the announcement page shows
    // those tildes. Stripping them here would have the push say the bar is
    // "closed open" while the page says "~~closed~~ open".
    expect(plainPreview("Bar is ~~closed~~ open from 18:00.")).toBe(
      "Bar is ~~closed~~ open from 18:00.",
    );
  });

  it("drops the underline of a setext heading", () => {
    // The renderer reads this as a heading; the row of punctuation must not
    // reach a lock screen.
    expect(plainPreview("Burn night\n=========\n\nMeet at the effigy.")).toBe(
      "Burn night\n\nMeet at the effigy.",
    );
    expect(plainPreview("Shifts\n---\n\nJo at 20:00.")).toBe(
      "Shifts\n\nJo at 20:00.",
    );
  });

  it("leaves underscores that belong to a word", () => {
    expect(plainPreview("Answer the burner_profile questionnaire.")).toBe(
      "Answer the burner_profile questionnaire.",
    );
  });

  it("keeps a link's text and drops its target", () => {
    expect(
      plainPreview("Read the [packing list](https://camp-404.com/x)."),
    ).toBe("Read the packing list.");
    expect(plainPreview("See [the rules][rules].\n\n[rules]: /rules")).toBe(
      "See the rules.",
    );
    expect(plainPreview("Mail <mailto:camp@example.com> if stuck.")).toBe(
      "Mail mailto:camp@example.com if stuck.",
    );
  });

  it("keeps an image's alt text and drops the image", () => {
    expect(
      plainPreview(
        "![The shade structure](https://x.public.blob.vercel-storage.com/a.png)",
      ),
    ).toBe("The shade structure");
  });

  it("flattens bullet and numbered lists to their lines", () => {
    expect(plainPreview("- Water\n- Hat\n- Goggles")).toBe(
      "Water\nHat\nGoggles",
    );
    expect(plainPreview("1. Arrive\n2. Sign in\n3. Build")).toBe(
      "Arrive\nSign in\nBuild",
    );
    expect(plainPreview("* Sunscreen\n  * SPF 50")).toBe("Sunscreen\nSPF 50");
  });

  it("keeps the contents of inline and fenced code", () => {
    expect(plainPreview("Run `pnpm dev` first.")).toBe("Run pnpm dev first.");
    expect(plainPreview("```bash\npnpm db:local:up\n```")).toBe(
      "pnpm db:local:up",
    );
  });

  it("leaves markdown inside a fence exactly as the page shows it", () => {
    // Inside a fence the renderer stops parsing, so every marker below is
    // shown to a member as punctuation. Strip them here and the push says
    // "Run exactly" while the page says "1. Run **exactly**".
    const body = [
      "```",
      "1. Run **exactly**",
      "# not a heading",
      "*not* a list, _not_ italic",
      "[not a link](/nowhere)",
      "```",
    ].join("\n");
    expect(plainPreview(body)).toBe(
      [
        "1. Run **exactly**",
        "# not a heading",
        "*not* a list, _not_ italic",
        "[not a link](/nowhere)",
      ].join("\n"),
    );
  });

  it("leaves markdown inside a code span alone too", () => {
    expect(plainPreview("Use `**literal**` here.")).toBe(
      "Use **literal** here.",
    );
    expect(plainPreview("See `[link](/x)` and `_id_`.")).toBe(
      "See [link](/x) and _id_.",
    );
    // A backslash is not an escape inside code; the member reads both
    // characters.
    expect(plainPreview("Type `\\*` to get a star.")).toBe(
      "Type \\* to get a star.",
    );
  });

  it("carries a fence that was never closed to the end of the body", () => {
    // CommonMark says an unclosed fence runs to the end, so that is what the
    // page shows; the push has to agree.
    expect(plainPreview("Steps:\n\n```\n1. **Sign in**")).toBe(
      "Steps:\n\n1. **Sign in**",
    );
  });

  it("closes a code span only on a backtick run of the same length", () => {
    expect(plainPreview("Use ``a ` b`` here.")).toBe("Use a ` b here.");
    expect(plainPreview("The ``` fence ``` marker.")).toBe(
      "The fence marker.",
    );
  });

  it("leaves a lone backtick where it was typed", () => {
    // No partner, so it is not a code span — and it must not swallow the rest
    // of the announcement looking for one.
    expect(plainPreview("Costs R50 ` each.\n\n**Bring cash**.")).toBe(
      "Costs R50 ` each.\n\nBring cash.",
    );
  });

  it("clips a row through the code, not around it", () => {
    expect(plainPreview("Run `pnpm db:local:up` before **dinner**.", 200)).toBe(
      "Run pnpm db:local:up before dinner.",
    );
  });

  it("drops block-quote markers, however deep", () => {
    expect(plainPreview("> The captain said:\n> > no cars after dark.")).toBe(
      "The captain said:\nno cars after dark.",
    );
  });

  it("drops a thematic break", () => {
    expect(plainPreview("Before\n\n---\n\nAfter")).toBe("Before\n\nAfter");
    expect(plainPreview("Before\n\n***\n\nAfter")).toBe("Before\n\nAfter");
  });

  it("gives an escaped marker back as the character it escaped", () => {
    expect(plainPreview("A literal \\*star\\* stays.")).toBe(
      "A literal *star* stays.",
    );
  });

  it("keeps paragraphs apart but collapses a run of blank lines", () => {
    expect(plainPreview("One\n\n\n\n\nTwo")).toBe("One\n\nTwo");
  });

  it("strips a whole announcement end to end", () => {
    const body = [
      "# Burn night briefing",
      "",
      "**Everyone** meets at the effigy at *20:00*.",
      "",
      "- Bring water",
      "- Bring a [head torch](https://shop.example.com/torch)",
      "",
      "> No cars after dark.",
    ].join("\n");
    expect(plainPreview(body)).toBe(
      [
        "Burn night briefing",
        "",
        "Everyone meets at the effigy at 20:00.",
        "",
        "Bring water",
        "Bring a head torch",
        "",
        "No cars after dark.",
      ].join("\n"),
    );
    expect(plainPreview(body)).not.toMatch(/[*#>[\]]/);
  });
});

describe("plainPreview — a clipped row (max given)", () => {
  it("collapses the whole body onto one line", () => {
    expect(plainPreview("## Title\n\n- One\n- Two", 200)).toBe("Title One Two");
  });

  it("cuts at max and marks that it cut", () => {
    const out = plainPreview("a".repeat(50), 10);
    expect(out).toBe(`${"a".repeat(10)}…`);
  });

  it("leaves a short body whole, with no ellipsis", () => {
    expect(plainPreview("Short one.", 200)).toBe("Short one.");
  });

  it("does not leave a dangling space before the ellipsis", () => {
    expect(plainPreview("abcdefghi jkl", 10)).toBe("abcdefghi…");
  });
});
