import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OS_THEMES } from "@camp404/types/desktop-preferences";
import { parseColour } from "../contrast";
import {
  OS_THEMES_DEF,
  OS_THEME_TOKENS,
  osEffects,
  osTheme,
  osThemeCss,
} from "../os-themes";

// The system themes are data (issue #290): every theme sets every variable,
// and every colour variable the shell and a window read is one a theme sets.
// A theme that misses one would draw that part in 404 Night's colour, or in
// nothing at all.

const ROOT = path.join(__dirname, "../../../..");
const read = (file: string) =>
  readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `var(--os-…)` a stylesheet reads, fonts and layout values aside. */
function colourVarsRead(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--os-[a-z-]+)/g)) {
    const name = m[1]!;
    if (/^--os-(font|phone|toast)/.test(name)) continue;
    names.add(name);
  }
  return names;
}

/** The `--os-…` colours the console's stylesheet sets itself, from others. */
function derivedVars(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/^\s*(--os-[a-z-]+):\s*([^;]+);/gm)) {
    const name = m[1]!;
    if (/^--os-(font|phone|toast)/.test(name)) continue;
    out.set(name, m[2]!);
  }
  return out;
}

describe("the themes' tokens (drift)", () => {
  it("lists the themes the preferences allow, in the same order", () => {
    expect(OS_THEMES_DEF.map((t) => t.id)).toEqual([...OS_THEMES]);
  });

  it.each(OS_THEMES_DEF.map((t) => [t.label, t] as const))(
    "%s defines every token, and nothing else",
    (_label, theme) => {
      expect(Object.keys(theme.colours).sort()).toEqual(
        [...OS_THEME_TOKENS].sort(),
      );
    },
  );

  it.each(OS_THEMES_DEF.map((t) => [t.label, t] as const))(
    "%s writes each colour in a notation the contrast check reads",
    (_label, theme) => {
      for (const token of OS_THEME_TOKENS) {
        expect(() => parseColour(theme.colours[token])).not.toThrow();
      }
    },
  );

  it("covers every colour variable the OS package, the skin and the console read", () => {
    const read_ = new Set([
      ...colourVarsRead(read("packages/os/src/styles.css")),
      ...colourVarsRead(read("apps/web/app/globals.css")),
    ]);
    const tokens = new Set<string>(OS_THEME_TOKENS);
    const derived = derivedVars(read("apps/web/app/globals.css"));
    expect(
      [...read_].filter((name) => !tokens.has(name) && !derived.has(name)),
    ).toEqual([]);
  });

  it("works out each colour the console derives from theme colours alone", () => {
    // The soft colour (owner, 2026-09-30): --os-bar-idle and the rest are
    // mixed from a theme's own colours, so every theme has them.
    const derived = derivedVars(read("apps/web/app/globals.css"));
    expect([...derived.keys()].sort()).toEqual([
      "--os-bar-idle",
      "--os-bar-idle-fg",
      "--os-label",
      "--os-win-card-tinted",
    ]);
    const tokens = new Set<string>(OS_THEME_TOKENS);
    for (const [name, value] of derived) {
      const reads = [...colourVarsRead(value)];
      expect([name, reads.length > 0]).toEqual([name, true]);
      expect([name, reads.filter((r) => !tokens.has(r))]).toEqual([name, []]);
    }
  });

  it("maps every window token onto the kit inside a window", () => {
    const globals = read("apps/web/app/globals.css");
    for (const token of OS_THEME_TOKENS.filter((t) =>
      t.startsWith("--os-win-"),
    )) {
      expect(globals).toContain(`var(${token})`);
    }
  });

  it("names each theme plainly, with one short sentence", () => {
    for (const theme of OS_THEMES_DEF) {
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.description).toMatch(/^[A-Z].*\.$/);
      expect(theme.description).not.toMatch(/\.(css|tsx?|exe)\b/i);
    }
  });
});

describe("the themes as CSS", () => {
  const css = osThemeCss();

  it("puts 404 Night on :root, so a page with no theme reads as before", () => {
    expect(css).toMatch(/^:root,\[data-os-theme="night"\]\{/);
  });

  it.each(OS_THEMES_DEF.map((t) => [t.id, t] as const))(
    "writes %s with every token",
    (id, theme) => {
      const rule = css
        .split("\n")
        .find((line) => line.includes(`[data-os-theme="${id}"]`))!;
      expect(rule).toBeDefined();
      for (const token of OS_THEME_TOKENS) {
        expect(rule).toContain(`${token}:${theme.colours[token]}`);
      }
    },
  );

  it("cannot be broken out of: no closing tag and no stray braces in a value", () => {
    expect(css).not.toMatch(/<\//);
    for (const theme of OS_THEMES_DEF) {
      for (const value of Object.values(theme.colours)) {
        expect(value).not.toMatch(/[{};<>]/);
      }
    }
  });
});

describe("a theme's effects", () => {
  it("keeps them all under 404 Night and Colour-blind safe", () => {
    expect(osEffects("night", false)).toBe("full");
    expect(osEffects("colour-blind", false)).toBe("full");
  });

  it("keeps the surface still and plain under Calm", () => {
    expect(osEffects("calm", false)).toBe("calm");
  });

  it("drops all of them under High contrast, and under Effects off in any theme", () => {
    expect(osEffects("high-contrast", false)).toBe("none");
    for (const id of OS_THEMES) expect(osEffects(id, true)).toBe("none");
  });

  it("reads an unknown theme as 404 Night", () => {
    expect(osTheme("neon").id).toBe("night");
    expect(osTheme(null).id).toBe("night");
  });
});
