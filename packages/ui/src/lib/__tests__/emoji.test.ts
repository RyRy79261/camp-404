import { beforeEach, describe, expect, it } from "vitest";
import {
  emojisFrom,
  insertIntoField,
  loadEmojis,
  offersEmojiByDefault,
  readRecentEmoji,
  rememberEmoji,
  RECENT_MAX,
  searchEmojis,
  shortcodeAt,
} from "../emoji";
import { splitLayoutClasses } from "../../components/emoji-field";

// The emoji the text boxes offer: the list, search, the `:name` match, the
// recent row and putting an emoji where the caret is.

const LIST = emojisFrom([
  ["🔥", "fire", 5, ["fire"], "fire burn flame hot lit"],
  [
    "🧯",
    "fire extinguisher",
    7,
    ["fire_extinguisher"],
    "fire extinguisher quench",
  ],
  ["🚒", "fire engine", 5, ["fire_engine"], "fire engine truck"],
  ["❤️", "red heart", 8, ["heart"], "red heart love"],
]);

describe("the emoji list", () => {
  it("loads the built list once, with every group and the shortcodes", async () => {
    const list = await loadEmojis();
    expect(list.length).toBeGreaterThan(1500);
    expect(await loadEmojis()).toBe(list);
    const fire = list.find((e) => e.char === "🔥");
    expect(fire).toMatchObject({ name: "fire", codes: ["fire"] });
    expect(new Set(list.map((e) => e.group))).toEqual(
      new Set([0, 1, 3, 4, 5, 6, 7, 8, 9]),
    );
  });
});

describe("searchEmojis", () => {
  it("puts an exact shortcode first, then shortcodes that start with it", () => {
    // fire, then fire_engine (shorter) before fire_extinguisher.
    expect(searchEmojis(LIST, "fire").map((e) => e.char)).toEqual([
      "🔥",
      "🚒",
      "🧯",
    ]);
    expect(searchEmojis(LIST, "fire_en").map((e) => e.char)).toEqual(["🚒"]);
  });

  it("puts the shortest shortcode first among those that start with it", async () => {
    const list = await loadEmojis();
    expect(searchEmojis(list, "hea", 1)[0]?.char).toBe("❤️");
  });

  it("needs every word, matches word starts, and finds nothing for nothing", () => {
    expect(searchEmojis(LIST, "red lo").map((e) => e.char)).toEqual(["❤️"]);
    expect(searchEmojis(LIST, "eart")).toEqual([]);
    expect(searchEmojis(LIST, "  ")).toEqual([]);
    expect(searchEmojis(LIST, "fire", 1)).toHaveLength(1);
  });
});

describe("shortcodeAt", () => {
  it("reads a colon at the start or after a space, then two letters", () => {
    expect(shortcodeAt(":fi")).toEqual({ query: "fi", start: 0 });
    expect(shortcodeAt("Build day :hea")).toEqual({ query: "hea", start: 10 });
  });

  it("ignores one letter, a time, an address and a word with a colon", () => {
    expect(shortcodeAt(":f")).toBeNull();
    expect(shortcodeAt("at 18:30")).toBeNull();
    expect(shortcodeAt("https://camp")).toBeNull();
    expect(shortcodeAt("note:fire")).toBeNull();
    expect(shortcodeAt(":fire ")).toBeNull();
  });
});

describe("the recent row", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the newest first, once each, at most RECENT_MAX", () => {
    rememberEmoji("🔥");
    rememberEmoji("❤️");
    rememberEmoji("🔥");
    expect(readRecentEmoji()).toEqual(["🔥", "❤️"]);
    for (let i = 0; i < RECENT_MAX + 5; i++) rememberEmoji(String(i));
    expect(readRecentEmoji()).toHaveLength(RECENT_MAX);
  });

  it("reads a broken value as empty", () => {
    localStorage.setItem("camp404:emoji-recent", "{nope");
    expect(readRecentEmoji()).toEqual([]);
  });
});

describe("insertIntoField", () => {
  it("puts the emoji at the caret, fires input, and moves the caret after it", () => {
    const el = document.createElement("input");
    document.body.append(el);
    el.value = "Build day";
    el.setSelectionRange(5, 5);
    let fired = 0;
    el.addEventListener("input", () => fired++);
    expect(insertIntoField(el, "🔥 ")).toBe(true);
    expect(el.value).toBe("Build🔥  day");
    expect(fired).toBe(1);
    expect(el.selectionStart).toBe(5 + "🔥 ".length);
  });

  it("replaces a typed :name, and refuses to pass maxLength", () => {
    const el = document.createElement("textarea");
    el.value = "Hot :fi";
    expect(insertIntoField(el, "🔥", 4, 7)).toBe(true);
    expect(el.value).toBe("Hot 🔥");
    el.maxLength = el.value.length;
    expect(insertIntoField(el, "❤️")).toBe(false);
    expect(el.value).toBe("Hot 🔥");
  });
});

describe("offersEmojiByDefault", () => {
  it("offers emoji in a plain text box only", () => {
    expect(offersEmojiByDefault({})).toBe(true);
    expect(offersEmojiByDefault({ type: "text", autoComplete: "off" })).toBe(
      true,
    );
    expect(offersEmojiByDefault({ type: "email" })).toBe(false);
    expect(offersEmojiByDefault({ inputMode: "numeric" })).toBe(false);
    expect(offersEmojiByDefault({ autoComplete: "one-time-code" })).toBe(false);
    expect(offersEmojiByDefault({ readOnly: true })).toBe(false);
  });
});

describe("splitLayoutClasses", () => {
  it("moves the classes that place a box to its frame", () => {
    expect(
      splitLayoutClasses("h-8 w-24 flex-1 page-sm:max-w-xs mt-2 text-sm"),
    ).toEqual({
      frame: "w-24 flex-1 page-sm:max-w-xs mt-2",
      box: "h-8 text-sm",
    });
    expect(splitLayoutClasses(undefined)).toEqual({ frame: "", box: "" });
  });
});
