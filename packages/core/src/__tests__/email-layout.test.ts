import { describe, expect, it } from "vitest";
import { renderEmailLayout } from "../email-layout";

const base = {
  label: "New questionnaire",
  title: "Camp fees",
  paragraphs: ["First part.", "Second part."],
  footer: "Small print.",
};

describe("renderEmailLayout", () => {
  it("draws the label, title, words, button and footer", () => {
    const html = renderEmailLayout({
      ...base,
      button: { text: "Open in Camp 404", url: "https://camp-404.com/x" },
      afterButton: ["After the button."],
    });
    expect(html).toContain("404&nbsp;OS");
    expect(html).toContain(">New questionnaire</span>");
    expect(html).toContain(">Camp fees</h1>");
    expect(html).toContain(">First part.</p>");
    expect(html).toContain(">Second part.</p>");
    expect(html).toContain('href="https://camp-404.com/x"');
    expect(html).toContain(">Open in Camp 404</a>");
    expect(html).toContain(">After the button.</p>");
    expect(html).toContain("Small print.");
    // The button comes before the words under it.
    expect(html.indexOf("Open in Camp 404")).toBeLessThan(
      html.indexOf("After the button."),
    );
  });

  it("gives the inbox the first words as its preview line, and Outlook a fixed width", () => {
    const html = renderEmailLayout(base);
    const hidden = html.indexOf("display:none");
    expect(hidden).toBeGreaterThan(-1);
    expect(html.indexOf("First part.")).toBeGreaterThan(hidden);
    expect(html.indexOf("First part.")).toBeLessThan(
      html.indexOf("404&nbsp;OS"),
    );
    expect(html).toContain(
      '<!--[if mso]><table role="presentation" width="560"',
    );
  });

  it("draws no button when there is nothing to open", () => {
    const html = renderEmailLayout(base);
    expect(html).not.toContain("<a ");
  });

  it("skips empty paragraphs", () => {
    const html = renderEmailLayout({ ...base, paragraphs: ["One.", "  "] });
    expect(html.match(/<p /g)).toHaveLength(1);
  });

  it("escapes everything it is handed, the link included", () => {
    const html = renderEmailLayout({
      label: "<i>label</i>",
      title: '<script>alert("x")</script>',
      paragraphs: ["<b>bold</b> & co"],
      button: { text: "<u>go</u>", url: 'https://x.test/"><script>' },
      footer: "<img src=x>",
    });
    for (const raw of ["<i>", "<script>", "<b>", "<u>", "<img"]) {
      expect(html).not.toContain(raw);
    }
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; co");
    expect(html).toContain('href="https://x.test/&quot;&gt;&lt;script&gt;"');
  });

  it("keeps a light card when a mail app drops the style attributes", () => {
    const html = renderEmailLayout(base);
    expect(html).toContain('bgcolor="#ffffff"');
    expect(html).toContain('<meta name="color-scheme" content="light">');
  });
});
