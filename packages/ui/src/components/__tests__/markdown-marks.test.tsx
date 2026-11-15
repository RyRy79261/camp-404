import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DEFAULT_JOIN_ABOUT } from "@camp404/types";
import { MarkdownBody } from "../markdown-body";

// About Camp 404's three extra marks (markdown-marks.ts): read only when
// MarkdownBody's `marks` is on, as the characters typed everywhere else.

function html(markdown: string, marks = true): string {
  const { container } = render(
    <MarkdownBody prose="" marks={marks}>
      {markdown}
    </MarkdownBody>,
  );
  return container.firstElementChild!.innerHTML;
}

describe("MarkdownBody's marks", () => {
  it("highlights, colours and underlines", () => {
    expect(html("a ==b== {{c}} ++d++")).toBe(
      '<p>a <mark>b</mark> <span class="md-accent">c</span> <u>d</u></p>',
    );
  });

  it("runs a mark across bold, and keeps one inside bold", () => {
    expect(html("- 26th April - ==**ALL HANDS ON DECK** set up day==")).toBe(
      "<ul>\n<li>26th April - <mark><strong>ALL HANDS ON DECK</strong> set up day</mark></li>\n</ul>",
    );
    expect(html("**==++AT LEAST ONE team.++==**")).toBe(
      "<p><strong><mark><u>AT LEAST ONE team.</u></mark></strong></p>",
    );
  });

  it("marks a heading's words", () => {
    expect(html("### ++What am I expected to contribute?++")).toBe(
      "<h3><u>What am I expected to contribute?</u></h3>",
    );
  });

  it("leaves an opener with no partner as typed, and never crosses two marks", () => {
    expect(html("1 + 1 ++ 2 and a {{ brace")).toBe(
      "<p>1 + 1 ++ 2 and a {{ brace</p>",
    );
    // The == inside the open ++ cannot close the outer ==, so the ++ pair
    // wins and the outer == stays as typed.
    expect(html("==a ++b== c++")).toBe("<p>==a <u>b== c</u></p>");
  });

  it("reads words named like Object's own members as words", () => {
    for (const word of ["constructor", "toString", "valueOf"]) {
      expect(html(`**${word}** and ${word}`)).toBe(
        `<p><strong>${word}</strong> and ${word}</p>`,
      );
    }
    // Underscores are Markdown's own bold, so __proto__ is typed escaped.
    expect(html("\\_\\_proto\\_\\_")).toBe("<p>__proto__</p>");
  });

  it("reads no marks inside code", () => {
    expect(html("`==x==`")).toBe("<p><code>==x==</code></p>");
  });

  it("reads none at all unless asked", () => {
    expect(html("==a== {{b}} ++c++", false)).toBe("<p>==a== {{b}} ++c++</p>");
  });

  it("lets nothing typed add a class or a tag", () => {
    expect(html('<span class="md-accent">x</span> <mark>y</mark>')).toBe(
      '<p>&lt;span class="md-accent"&gt;x&lt;/span&gt; &lt;mark&gt;y&lt;/mark&gt;</p>',
    );
  });

  it("reads every mark in About Camp 404's words, leaving no sign behind", () => {
    const { intro, sections } = DEFAULT_JOIN_ABOUT;
    for (const words of [intro, ...Object.values(sections)]) {
      const { container, unmount } = render(
        <MarkdownBody prose="" marks>
          {words}
        </MarkdownBody>,
      );
      expect(container.textContent).not.toMatch(/==|\{\{|\}\}|\+\+|\*\*/);
      unmount();
    }
  });
});
