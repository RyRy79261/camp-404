// Builds src/lib/emoji-list.json from emojibase-data (a dev dependency): the
// emoji the picker offers, in Unicode's order, with the words search and the
// `:name` suggestions read. Run it again after upgrading emojibase-data:
//   node packages/ui/scripts/build-emoji-list.mjs
// Only emoji up to MAX_VERSION are kept: newer ones show as empty boxes on
// phones a few years old.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_VERSION = 14;
const require = createRequire(import.meta.url);
const read = (p) => JSON.parse(readFileSync(require.resolve(p), "utf8"));
const compact = read("emojibase-data/en/compact.json");
const data = read("emojibase-data/en/data.json");
const github = read("emojibase-data/en/shortcodes/github.json");

const version = new Map(data.map((e) => [e.hexcode, e.version]));
// Picker groups (emojibase's numbers; 2 is skin-tone pieces, never offered).
const GROUPS = [0, 1, 3, 4, 5, 6, 7, 8, 9];

const list = compact
  .filter(
    (e) =>
      GROUPS.includes(e.group) && (version.get(e.hexcode) ?? 99) <= MAX_VERSION,
  )
  .sort((a, b) => a.order - b.order)
  .map((e) => {
    const codes = [github[e.hexcode] ?? []].flat();
    const words = [
      ...new Set(
        [e.label, ...(e.tags ?? []), ...codes]
          .join(" ")
          .toLowerCase()
          .split(/[^a-z0-9+]+/)
          .filter(Boolean),
      ),
    ];
    // [emoji, name, group, shortcodes, search words]
    return [e.unicode, e.label, e.group, codes, words.join(" ")];
  });

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/emoji-list.json",
);
writeFileSync(out, JSON.stringify(list) + "\n");
console.log(`${list.length} emoji -> ${out}`);
