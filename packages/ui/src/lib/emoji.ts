// The emoji every text box offers (owner, 2026-10-27: "a telegram style emoji
// adding system" in every text field). The list is emoji-list.json, built from
// emojibase-data by scripts/build-emoji-list.mjs and fetched only when someone
// first opens the panel or types `:` and two letters, so no page carries it.
// Searching, the `:name` match and putting an emoji where the caret is live
// here, with no React, so the plain text boxes and the editor share them.

/** One emoji the picker offers. */
export interface Emoji {
  char: string;
  name: string;
  /** emojibase's group number; EMOJI_GROUPS names them. */
  group: number;
  /** Its `:name` shortcodes (GitHub's set), first one shown. */
  codes: readonly string[];
  /** Lower-case words search matches: its name, tags and shortcodes. */
  words: readonly string[];
}

/**
 * The colour emoji fonts, first: a text font with black-and-white glyphs for
 * some emoji (DejaVu has the smileys) must never draw them.
 */
export const EMOJI_FONT_CLASS =
  "[font-family:'Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji','Twemoji_Mozilla',sans-serif]";

/** The picker's tabs, in Telegram's order, each with its icon. */
export const EMOJI_GROUPS = [
  { group: 0, label: "Smileys", icon: "😀" },
  { group: 1, label: "People", icon: "👋" },
  { group: 3, label: "Animals and nature", icon: "🌵" },
  { group: 4, label: "Food and drink", icon: "🍕" },
  { group: 5, label: "Travel and places", icon: "🚐" },
  { group: 6, label: "Activities", icon: "🎉" },
  { group: 7, label: "Objects", icon: "💡" },
  { group: 8, label: "Symbols", icon: "❤️" },
  { group: 9, label: "Flags", icon: "🏳️" },
] as const;

type Raw = [string, string, number, string[], string];

/** The list as the picker reads it, from emoji-list.json's tuples. */
export function emojisFrom(raw: readonly Raw[]): Emoji[] {
  return raw.map(([char, name, group, codes, words]) => ({
    char,
    name,
    group,
    codes,
    words: words.split(" "),
  }));
}

let loading: Promise<Emoji[]> | null = null;

/** Every emoji, fetched once per page. */
export function loadEmojis(): Promise<Emoji[]> {
  loading ??= import("./emoji-list.json")
    .then((m) => emojisFrom(m.default as unknown as Raw[]))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

/**
 * The emoji a search finds, best first: every word typed must start a word of
 * the emoji's. An exact shortcode comes first, then a shortcode that starts
 * with the query, then a name that does, then the rest in Unicode's order.
 */
export function searchEmojis(
  list: readonly Emoji[],
  query: string,
  limit = Infinity,
): Emoji[] {
  const typed = query
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);
  if (typed.length === 0) return [];
  const whole = typed.join("_");
  // Among shortcodes that start with the query, the shortest wins: ":hea"
  // is a heart before heart_eyes.
  const prefix = (e: Emoji) =>
    Math.min(
      ...e.codes.filter((c) => c.startsWith(whole)).map((c) => c.length),
    );
  const rank = (e: Emoji) =>
    e.codes.includes(whole)
      ? 0
      : e.codes.some((c) => c.startsWith(whole))
        ? 1
        : e.name.toLowerCase().startsWith(typed[0]!)
          ? 2
          : 3;
  return list
    .filter((e) => typed.every((t) => e.words.some((w) => w.startsWith(t))))
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort(
      (a, b) =>
        a.r - b.r || (a.r === 1 ? prefix(a.e) - prefix(b.e) : 0) || a.i - b.i,
    )
    .slice(0, limit)
    .map(({ e }) => e);
}

/**
 * A `:name` being typed at the caret, as Telegram reads it: a colon at the
 * start or after a space, then at least two letters. Null otherwise, so a time
 * ("18:30") or an address ("https://") never opens the suggestions.
 */
export function shortcodeAt(
  beforeCaret: string,
): { query: string; start: number } | null {
  const m = /(^|\s):([a-z0-9_+]{2,30})$/i.exec(beforeCaret);
  if (!m) return null;
  return { query: m[2]!, start: beforeCaret.length - m[2]!.length - 1 };
}

const RECENT_KEY = "camp404:emoji-recent";
/** How many recent emoji the panel keeps. */
export const RECENT_MAX = 24;

/** The emoji this browser picked last, newest first. */
export function readRecentEmoji(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw
          .filter((c): c is string => typeof c === "string")
          .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/** Put an emoji first in this browser's recent list (only the emoji). */
export function rememberEmoji(char: string): void {
  try {
    const next = [char, ...readRecentEmoji().filter((c) => c !== char)].slice(
      0,
      RECENT_MAX,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage off or full: the recent row just stays as it was.
  }
}

/**
 * Put `text` into a text box in place of `from`..`to` (the selection by
 * default), as typing would: through the value setter React watches and an
 * `input` event, so a controlled field's onChange sees it. Then the caret
 * sits after it. Refused (false) when it would pass the box's maxLength.
 */
export function insertIntoField(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  from: number = el.selectionStart ?? el.value.length,
  to: number = el.selectionEnd ?? from,
): boolean {
  const next = el.value.slice(0, from) + text + el.value.slice(to);
  if (el.maxLength > 0 && next.length > el.maxLength) return false;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = from + text.length;
  el.focus();
  el.setSelectionRange(caret, caret);
  return true;
}

/**
 * Whether a plain text box offers emoji when nobody says: a text box (no type,
 * or "text") that is not for a code, a number or a sign-in value. A field that
 * asks the browser to fill it (`autoComplete` other than off) is such a value:
 * an email, a name, a one-time code.
 */
export function offersEmojiByDefault(props: {
  type?: string;
  inputMode?: string;
  autoComplete?: string;
  readOnly?: boolean;
}): boolean {
  if (props.readOnly) return false;
  if (props.type && props.type !== "text") return false;
  if (props.inputMode && props.inputMode !== "text") return false;
  if (props.autoComplete && !["off", "on"].includes(props.autoComplete)) {
    return false;
  }
  return true;
}
