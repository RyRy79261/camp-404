import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A background window's last-seen copy is drawn in a shadow root
// (@camp404/os mountLastSeen), where `:root` matches nothing. Every skin rule
// in app/globals.css must also name `:host` (the bare token block, the
// wrapper under it as well), or the copies lose the pixel face, the square
// corners and the colours (owner, 2026-09-26: the three-window layout "clearly
// has issues").

const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
const SKIN = ":root:has([data-os-skin])";

/** Every rule's selector list and body, comments dropped. */
function rules(): { selectors: string[]; body: string }[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selectors: string[]; body: string }[] = [];
  const re = /([^{};]+)\{([^{}]*)\}/g;
  for (let m = re.exec(plain); m; m = re.exec(plain)) {
    const selectors = m[1]!
      .split(",")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    out.push({ selectors, body: m[2]!.trim() });
  }
  return out;
}

describe("the 404 OS skin in last-seen copies", () => {
  const skinned = rules().filter((r) =>
    r.selectors.some((s) => s.startsWith(SKIN)),
  );

  it("finds the skin's rules", () => {
    expect(skinned.length).toBeGreaterThan(15);
  });

  it("gives every skin rule a :host twin", () => {
    for (const rule of skinned) {
      // The page's own background paints the document, not a copy.
      if (/^background:[^;]*;?$/.test(rule.body)) continue;
      for (const sel of rule.selectors.filter((s) => s.startsWith(SKIN))) {
        const rest = sel.slice(SKIN.length);
        const twins = rest === "" ? [":host", ":host > div"] : [`:host${rest}`];
        for (const twin of twins) {
          expect(rule.selectors, `${sel} has no ${twin}`).toContain(twin);
        }
      }
    }
  });
});
