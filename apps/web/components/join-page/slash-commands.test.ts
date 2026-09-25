import { describe, expect, it } from "vitest";
import {
  SLASH_COMMANDS,
  altFromFileName,
  filterSlashCommands,
  looksLikeMarkdown,
  slashQuery,
} from "./slash-commands";

describe("slashQuery", () => {
  it("opens on a / at the start of a line or after a space", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/head")).toBe("head");
    expect(slashQuery("Some text /bul")).toBe("bul");
    expect(slashQuery("/numbered list")).toBe("numbered list");
  });

  it("stays shut inside words, dates and links", () => {
    expect(slashQuery("24/09")).toBeNull();
    expect(slashQuery("https://camp-404.com/")).toBeNull();
    expect(slashQuery("and/or")).toBeNull();
    expect(slashQuery("/ ")).toBeNull();
    expect(slashQuery("/head  ")).toBeNull();
  });
});

describe("filterSlashCommands", () => {
  it("offers everything before a letter is typed", () => {
    expect(filterSlashCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("matches names and Notion's words", () => {
    expect(filterSlashCommands("head").map((c) => c.id)).toEqual(["heading"]);
    expect(filterSlashCommands("h3").map((c) => c.id)).toEqual(["subheading"]);
    expect(filterSlashCommands("list").map((c) => c.id)).toEqual([
      "bullets",
      "numbers",
    ]);
    expect(filterSlashCommands("image").map((c) => c.id)).toEqual(["image"]);
    expect(filterSlashCommands("zzz")).toEqual([]);
  });
});

describe("looksLikeMarkdown", () => {
  it("recognises Notion's Copy as Markdown", () => {
    expect(looksLikeMarkdown("# Intro to Camp 404\n\nWelcome")).toBe(true);
    expect(looksLikeMarkdown("- one\n- two")).toBe(true);
    expect(looksLikeMarkdown("1. Apply\n2. Hear back")).toBe(true);
    expect(looksLikeMarkdown("> a quote")).toBe(true);
    expect(looksLikeMarkdown("Some **bold** words")).toBe(true);
    expect(looksLikeMarkdown("See [the map](https://example.com)")).toBe(true);
  });

  it("leaves plain prose alone", () => {
    expect(looksLikeMarkdown("Just a sentence, nothing more.")).toBe(false);
    expect(looksLikeMarkdown("Price: 5 * 3 = 15")).toBe(false);
  });
});

describe("altFromFileName", () => {
  it("makes words of a file name", () => {
    expect(altFromFileName("lounge-at_night.JPG")).toBe("lounge at night");
  });
});
